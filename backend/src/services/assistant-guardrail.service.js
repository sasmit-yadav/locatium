/**
 * Groundedness guardrail for Ask LOCATIUM.
 *
 * The product rule is "never invent scores, Rs figures, distances or zone names". Until now that
 * rule lived only in the system prompt, which is a request, not a guarantee. This module makes it
 * checkable: after generation we extract every factual-looking token from the answer and verify it
 * appears in the grounding context.
 *
 * This is the cheap deterministic pre-screen that production setups run before (or instead of) an
 * LLM judge: it costs microseconds, catches the failure mode that actually matters here (a wrong
 * rupee figure or a hallucinated estate name in a government-facing tool), and only escalates the
 * genuinely suspicious answers.
 *
 * Deliberately tuned to under-report rather than over-report: a false "block" degrades a good
 * answer to the rule-based one, so thresholds favour precision.
 */

/** Numbers this small are list indices, counts, or scores-out-of context — not claims. */
const SMALL_INT_CEILING = 12;
const REL_TOLERANCE = 0.02; // 2% — allows "~85,000" for 84,750 style rounding

/** Words that look like proper nouns but are never zone names. */
const NAME_STOPWORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'and', 'but', 'for', 'with', 'from', 'into',
  'haryana', 'india', 'locatium', 'investor', 'analysis', 'overview', 'score', 'land',
  'circle', 'rate', 'market', 'policy', 'sector', 'district', 'industrial', 'residential',
  'commercial', 'agricultural', 'warehouse', 'factory', 'plot', 'estate', 'zone', 'zones',
  'verify', 'open', 'click', 'next', 'watch', 'note', 'strong', 'moderate', 'proceed',
  'caution', 'confidence', 'high', 'medium', 'low', 'north', 'south', 'east', 'west',
  'metro', 'airport', 'highway', 'rail', 'road', 'bus', 'infra', 'access', 'env', 'fit',
  'clu', 'eia', 'hsiidc', 'hsvp', 'imt', 'gst', 'nhai', 'cpcb', 'lgd', 'inr', 'rs',
]);

/** Parse numeric tokens, tolerating Indian grouping (1,23,456) and units. */
function extractNumbers(text) {
  const out = [];
  const src = String(text || '');
  // Matches 1234, 1,23,456, 12.5, 85000/sq — captures the numeric core only.
  for (const m of src.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)) {
    const raw = m[1];
    const value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    const after = src.slice(m.index + raw.length, m.index + raw.length + 12);
    out.push({ raw, value, before, after, index: m.index });
  }
  return out;
}

/** Every number the model is allowed to state, harvested from the grounding block. */
function allowedNumberSet(contextText) {
  const set = new Set();
  for (const n of extractNumbers(contextText)) {
    set.add(n.value);
    // Common honest transformations of a grounded figure.
    set.add(Math.round(n.value));
    set.add(Math.round(n.value * 10) / 10);
    if (n.value >= 1000) set.add(Math.round(n.value / 1000) * 1000);
    if (n.value >= 100000) {
      set.add(Math.round((n.value / 1e5) * 100) / 100); // lakh form
      set.add(Math.round(n.value / 1e5));
    }
    if (n.value >= 1e7) {
      set.add(Math.round((n.value / 1e7) * 100) / 100); // crore form
      set.add(Math.round(n.value / 1e7));
    }
  }
  return set;
}

function isAllowedNumber(value, allowed) {
  if (allowed.has(value)) return true;
  // Tolerance sweep for rounding/derived phrasing.
  for (const a of allowed) {
    if (a === 0) continue;
    if (Math.abs(a - value) / Math.abs(a) <= REL_TOLERANCE) return true;
  }
  return false;
}

/** Skip numbers that aren't factual claims: list markers, "out of 100", years, ordinals. */
function isStructural(num) {
  const { value, before, after } = num;
  if (Number.isInteger(value) && value <= SMALL_INT_CEILING) return true;
  if (value === 100 && /\/\s*$|^\s*\/|out of/i.test(before + after)) return true;
  if (/#\s*$/.test(before)) return true; // "#3"
  if (/^\s*[.)]/.test(after) && Number.isInteger(value) && value <= 20) return true; // "3."
  if (value >= 1990 && value <= 2100 && Number.isInteger(value)) return true; // years
  return false;
}

/**
 * Candidate zone/place names in the answer: Title-Case runs of 1-4 words.
 * Only flagged when they look like a named site and are absent from context.
 */
function extractNameCandidates(text) {
  const names = new Set();
  const src = String(text || '');
  for (const m of src.matchAll(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b/g)) {
    const phrase = m[1].trim();
    const words = phrase.split(/\s+/);
    const meaningful = words.filter((w) => !NAME_STOPWORDS.has(w.toLowerCase()));
    if (!meaningful.length) continue;
    // Single common word in Title Case is usually sentence-initial, not a name.
    if (words.length === 1 && m.index > 0 && /[.!?]\s+$/.test(src.slice(0, m.index))) continue;
    if (words.length === 1 && NAME_STOPWORDS.has(phrase.toLowerCase())) continue;
    names.add(phrase);
  }
  return [...names];
}

function normalizeForMatch(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Verify an answer against its grounding context.
 *
 * @param {string} answer         model output
 * @param {string} contextText    the exact grounding block sent to the model
 * @param {object} opts
 * @param {boolean} opts.strictNames  also check zone-name fabrication (default true)
 * @returns {{ok: boolean, severity: 'none'|'warn'|'block', violations: Array, checked: object}}
 */
function verifyGrounding(answer, contextText, { strictNames = true } = {}) {
  const violations = [];
  const text = String(answer || '');
  if (!text.trim()) {
    return { ok: false, severity: 'block', violations: [{ type: 'empty' }], checked: {} };
  }

  const allowed = allowedNumberSet(contextText);
  const numbers = extractNumbers(text).filter((n) => !isStructural(n));
  let ungrounded = 0;

  for (const n of numbers) {
    if (!isAllowedNumber(n.value, allowed)) {
      ungrounded += 1;
      violations.push({
        type: 'number',
        value: n.value,
        raw: n.raw,
        // Money/score/distance claims are the dangerous class.
        money: /rs|₹/i.test(n.before) || /\/?\s*(sq|yd|crore|cr\b|lakh)/i.test(n.after),
      });
    }
  }

  const names = [];
  if (strictNames) {
    const ctxNorm = normalizeForMatch(contextText);
    for (const candidate of extractNameCandidates(text)) {
      if (!ctxNorm.includes(normalizeForMatch(candidate))) {
        // Only treat it as a fabricated site if it reads like one.
        if (/\b(estate|imt|park|sector|phase|industrial|colony|vihar|nagar|pur|bad|garh)\b/i.test(candidate)) {
          names.push(candidate);
          violations.push({ type: 'zone_name', value: candidate });
        }
      }
    }
  }

  const moneyViolations = violations.filter((v) => v.type === 'number' && v.money).length;
  let severity = 'none';
  if (moneyViolations > 0 || names.length > 0) severity = 'block';
  else if (ungrounded > 0) severity = 'warn';

  return {
    ok: severity === 'none',
    severity,
    violations,
    checked: {
      numbersChecked: numbers.length,
      ungroundedNumbers: ungrounded,
      moneyViolations,
      nameViolations: names.length,
      allowedNumbers: allowed.size,
    },
  };
}

module.exports = {
  verifyGrounding,
  extractNumbers,
  extractNameCandidates,
  allowedNumberSet,
};
