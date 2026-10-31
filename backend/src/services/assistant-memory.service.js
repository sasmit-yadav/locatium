/**
 * Conversation memory for Ask LOCATIUM.
 *
 * Three tiers, per current production practice (sliding window + rolling summary covers most
 * real usage; typed slots keep the machine-readable filters exact):
 *
 *   1. WORKING   — last N turns verbatim
 *   2. SUMMARY   — rolling digest of everything older, refreshed with the fast/cheap model
 *   3. STATE     — typed dialogue slots (sector/district/budget/risk) + addressable last results
 *
 * Tier 3 is what makes "#2", "compare 1 and 4" and "same but cheaper" work: every shortlist we
 * show is stored with stable refs, so a follow-up resolves to real zone IDs instead of the model
 * guessing. Roughly 60% of follow-up turns in multi-turn assistants carry an unresolved
 * reference, so this is the difference between a demo and a usable copilot.
 *
 * Memory travels in the request/response `session` object (client-held), so it survives without
 * server-side state. Nothing here is persisted to disk — see notes in docs for the durable option.
 */

const llmAdapter = require('./llm/llm-adapter');

const MEMORY_VERSION = 2;
const VERBATIM_TURNS = Number(process.env.ASSISTANT_VERBATIM_TURNS) || 6;
const SUMMARIZE_AFTER_TURNS = Number(process.env.ASSISTANT_SUMMARIZE_AFTER) || 8;
const SUMMARY_MAX_CHARS = 700;

/**
 * Ordinals only — deliberately no bare cardinals ("one", "two"). "the second one" would match
 * both `second` and `one`, and "show me two options" is a quantity, not a reference.
 */
const ORDINALS = {
  first: 1, '1st': 1, pehla: 1,
  second: 2, '2nd': 2, dusra: 2, doosra: 2,
  third: 3, '3rd': 3, teesra: 3,
  fourth: 4, '4th': 4,
  fifth: 5, '5th': 5,
  last: -1, aakhri: -1,
};

function emptyMemory() {
  return {
    v: MEMORY_VERSION,
    state: { sector: null, district: null, budgetInr: null, risk: null },
    summary: '',
    turnCount: 0,
    lastResults: [],
    lastIntent: null,
    lastProposals: [],
  };
}

/** Accepts legacy flat sessions ({lastIntent, sector, district, budgetInr}) and upgrades them. */
function normalizeMemory(session = {}) {
  if (session && session.v === MEMORY_VERSION) {
    return {
      ...emptyMemory(),
      ...session,
      state: { ...emptyMemory().state, ...(session.state || {}) },
      lastResults: Array.isArray(session.lastResults) ? session.lastResults : [],
      lastProposals: Array.isArray(session.lastProposals) ? session.lastProposals : [],
    };
  }
  const mem = emptyMemory();
  mem.state.sector = session.sector ?? null;
  mem.state.district = session.district ?? null;
  mem.state.budgetInr = session.budgetInr ?? null;
  mem.state.risk = session.risk ?? null;
  mem.lastIntent = session.lastIntent ?? null;
  return mem;
}

/**
 * Explicit user overrides beat carried-forward state.
 * "actually make it sonipat" / "forget the budget" / "any district".
 */
function applyOverrides(query, state) {
  const q = String(query || '').toLowerCase();
  const next = { ...state };
  const cleared = [];

  if (/\b(forget|clear|remove|drop|ignore|hata|bhool)\b/.test(q)) {
    if (/\bbudget|crore|cr\b|price|paisa/.test(q)) {
      next.budgetInr = null;
      cleared.push('budgetInr');
    }
    if (/\bdistrict|jagah|area\b/.test(q)) {
      next.district = null;
      cleared.push('district');
    }
    if (/\brisk\b/.test(q)) {
      next.risk = null;
      cleared.push('risk');
    }
  }
  if (/\b(any|all|every|koi bhi|sab)\s+(district|jagah)\b/.test(q)) {
    next.district = null;
    cleared.push('district');
  }
  if (/\bno\s+(budget|limit|cap)\b/.test(q)) {
    next.budgetInr = null;
    cleared.push('budgetInr');
  }
  return { state: next, cleared };
}

/**
 * Resolve references to the previous shortlist, deterministically.
 * Handles: "#3", "number 3", "the second one", "compare 1 and 4", "tell me about the last one".
 *
 * @returns {{refs: number[], zoneIds: string[], resolvedNames: string[], rewritten: string|null}}
 */
function resolveReferences(query, memory) {
  const results = memory?.lastResults || [];
  if (!results.length) return { refs: [], zoneIds: [], resolvedNames: [], rewritten: null };

  const q = String(query || '').toLowerCase();
  const refs = new Set();

  // "#3" / "no 3" / "number 3" / bare "3 and 4" when short and reference-y
  for (const m of q.matchAll(/#\s*(\d{1,2})|(?:\bno\.?|\bnumber)\s*(\d{1,2})/g)) {
    const n = Number(m[1] || m[2]);
    if (n >= 1 && n <= results.length) refs.add(n);
  }
  // ordinal words
  for (const [word, n] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${word}\\b`).test(q)) {
      const idx = n === -1 ? results.length : n;
      if (idx >= 1 && idx <= results.length) refs.add(idx);
    }
  }
  // "compare 1 and 3" / "1 vs 4" — only trust bare digits in comparison phrasing
  if (/\b(compare|vs\.?|versus|between|aur)\b/.test(q)) {
    for (const m of q.matchAll(/\b(\d{1,2})\b/g)) {
      const n = Number(m[1]);
      if (n >= 1 && n <= results.length) refs.add(n);
    }
  }

  const ordered = [...refs].sort((a, b) => a - b);
  const picked = ordered.map((n) => results[n - 1]).filter(Boolean);

  let rewritten = null;
  if (picked.length) {
    const names = picked.map((r) => `${r.name} (${r.district})`).join(' and ');
    rewritten = `${query} [refers to: ${names}]`;
  }

  return {
    refs: ordered,
    zoneIds: picked.map((r) => r.id).filter(Boolean),
    resolvedNames: picked.map((r) => r.name),
    rewritten,
  };
}

/** True when the turn leans on prior context but names nothing concrete. */
function needsQueryRewrite(query, memory) {
  const q = String(query || '').toLowerCase().trim();
  if (!memory?.turnCount) return false;
  if (q.split(/\s+/).length > 14) return false; // long turns usually self-contained

  const pronouns = /\b(it|that|this|those|these|them|there|us|uska|uske|wahi|waha|yeh|ye|wo|voh)\b/;
  const ellipsis = /^(and|aur|also|bhi|what about|kya|how about|phir|then|ok now|now|next|risks?)\b/;
  const comparative = /\b(cheaper|bigger|smaller|better|closer|sasta|bada|same but|instead)\b/;
  return pronouns.test(q) || ellipsis.test(q) || comparative.test(q);
}

/**
 * LLM-assisted standalone-query rewrite (coreference + ellipsis), fast model only.
 * Falls back to the original query on any failure — never blocks the turn.
 */
async function rewriteStandalone({ query, history = [], memory, timeoutMs = 1200, signal }) {
  if (!llmAdapter.isEnabled()) return { query, rewritten: false };
  const recent = history
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 240)}`)
    .join('\n');
  if (!recent) return { query, rewritten: false };

  const state = memory?.state || {};
  try {
    const res = await llmAdapter.complete({
      model: llmAdapter.getConfig().fastModel,
      systemPrompt:
        'Rewrite the final user message into ONE standalone question for a Haryana land-investment search tool. ' +
        'Resolve pronouns and omissions using the conversation. Keep the user\'s language style. ' +
        'Do not answer, do not add facts, do not invent districts or numbers. Output only the rewritten question.',
      userPrompt: `Known filters: sector=${state.sector || '?'} district=${state.district || '?'} budgetInr=${state.budgetInr || '?'}\n\nConversation:\n${recent}\n\nFinal user message: ${query}\n\nStandalone question:`,
      maxTokens: 80,
      temperature: 0,
      timeoutMs,
      signal,
    });
    const out = String(res.text || '').replace(/^["']|["']$/g, '').trim();
    // Guard against the small model rambling or echoing instructions.
    if (!out || out.length > 240 || out.toLowerCase() === query.toLowerCase()) {
      return { query, rewritten: false };
    }
    return { query: out, rewritten: true, original: query, latencyMs: res.elapsedMs };
  } catch {
    return { query, rewritten: false };
  }
}

/** Rolling summary refresh — only when the transcript has outgrown the verbatim window. */
async function maybeSummarize({ history = [], memory, timeoutMs = 1500, signal }) {
  const turns = history.length;
  if (turns < SUMMARIZE_AFTER_TURNS) return memory.summary || '';
  if (!llmAdapter.isEnabled()) return memory.summary || '';

  const older = history.slice(0, Math.max(0, turns - VERBATIM_TURNS));
  if (!older.length) return memory.summary || '';

  const transcript = older
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 300)}`)
    .join('\n');

  try {
    const res = await llmAdapter.complete({
      model: llmAdapter.getConfig().fastModel,
      systemPrompt:
        'Summarise this land-investment conversation for an assistant\'s memory. Keep decisions, ' +
        'stated preferences, districts/sectors/budgets discussed, and zones the user liked or rejected. ' +
        'Drop pleasantries. No invented facts. Max 4 terse lines.',
      userPrompt: `${memory.summary ? `Existing memory:\n${memory.summary}\n\n` : ''}Older turns:\n${transcript}\n\nUpdated memory:`,
      maxTokens: 220,
      temperature: 0,
      timeoutMs,
      signal,
    });
    const out = String(res.text || '').trim();
    return out ? out.slice(0, SUMMARY_MAX_CHARS) : memory.summary || '';
  } catch {
    return memory.summary || '';
  }
}

/**
 * Build the cache-friendly message array: stable instructions, then memory, then
 * verbatim recent turns, then the volatile context + question last.
 */
function buildMessages({ history = [], memory, contextText, query }) {
  const messages = [];

  const memoryBits = [];
  if (memory?.summary) memoryBits.push(`Earlier in this conversation: ${memory.summary}`);
  const st = memory?.state || {};
  const slots = [
    st.sector ? `sector=${st.sector}` : null,
    st.district ? `district=${st.district}` : null,
    st.budgetInr ? `budgetInr=${st.budgetInr}` : null,
    st.risk ? `risk=${st.risk}` : null,
  ].filter(Boolean);
  if (slots.length) memoryBits.push(`Active filters: ${slots.join(', ')}`);
  if (memory?.lastResults?.length) {
    memoryBits.push(
      `Previously shown shortlist: ${memory.lastResults
        .map((r, i) => `#${i + 1} ${r.name}`)
        .join(', ')}`
    );
  }
  if (memoryBits.length) {
    messages.push({ role: 'system', content: memoryBits.join('\n') });
  }

  for (const m of history.slice(-VERBATIM_TURNS)) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const content = String(m.content || m.text || '').slice(0, 700);
    if (content) messages.push({ role, content });
  }

  messages.push({
    role: 'user',
    content: `LIVE DATA (authoritative — every number in your answer must come from here):\n${contextText}\n\nQUESTION: ${query}`,
  });

  return messages;
}

/** Persist what the next turn needs. Called after an answer is produced. */
function updateMemory({ memory, context, summary, opportunities = [], proposals = [] }) {
  const next = {
    ...memory,
    v: MEMORY_VERSION,
    turnCount: (memory.turnCount || 0) + 1,
    lastIntent: context.primaryIntent || memory.lastIntent || null,
    summary: summary ?? memory.summary ?? '',
    state: {
      sector: context.sector ?? memory.state.sector ?? null,
      district: context.district ?? memory.state.district ?? null,
      budgetInr: context.budgetInr ?? memory.state.budgetInr ?? null,
      risk: context.risk ?? memory.state.risk ?? null,
    },
  };

  // Keep the shortlist addressable for "#2" style follow-ups.
  if (opportunities.length) {
    next.lastResults = opportunities.slice(0, 6).map((z) => ({
      id: z.id,
      name: z.name,
      district: z.district,
      score: z.opportunityScore,
      lat: z.center?.lat ?? null,
      lng: z.center?.lng ?? null,
    }));
  }
  if (proposals.length) {
    next.lastProposals = proposals.slice(0, 4).map((p) => ({
      type: p.type,
      params: p.params || {},
      label: p.label || p.confirm || p.type,
    }));
  }
  return next;
}

module.exports = {
  emptyMemory,
  normalizeMemory,
  applyOverrides,
  resolveReferences,
  needsQueryRewrite,
  rewriteStandalone,
  maybeSummarize,
  buildMessages,
  updateMemory,
  MEMORY_VERSION,
  VERBATIM_TURNS,
};
