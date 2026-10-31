const assistantService = require('../services/assistant.service');
const telemetry = require('../services/llm/llm-telemetry');
const speech = require('../services/speech.service');
const actions = require('../services/assistant-actions.service');
const execute = require('../services/assistant-execute.service');
const memoryStore = require('../services/assistant-memory-store.service');
const beginnerService = require('../services/assistant-beginner.service');
const { detectLanguage } = require('../services/assistant-language.service');

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Without an explicit flush, compression/proxy middleware can hold tokens back and
  // defeat the whole point of streaming.
  if (typeof res.flush === 'function') res.flush();
}

function parseBody(body = {}) {
  return {
    query: body.query,
    lat: body.lat,
    lng: body.lng,
    sector: body.sector,
    district: body.district,
    zoneIds: body.zoneIds,
    history: Array.isArray(body.history) ? body.history.slice(-8) : [],
    session: body.session && typeof body.session === 'object' ? body.session : {},
  };
}

async function ask(req, res) {
  const body = req.body || {};
  const payload = parseBody(body);
  payload.authenticated = Boolean(req.user?.id);
  payload.language = body.language;
  if (req.user?.id && (!payload.session || Object.keys(payload.session).length === 0)) {
    const stored = await memoryStore.load(req.user.id);
    if (stored) payload.session = stored;
  }
  const persistSession = async (session) => {
    if (!req.user?.id || !session) return;
    try {
      await memoryStore.save(req.user.id, session);
    } catch {
      /* memory persistence must never fail a copilot turn */
    }
  };

  const wantsStream =
    body.stream === true || String(req.headers.accept || '').includes('text/event-stream');

  if (!wantsStream) {
    const result = await assistantService.ask(payload);
    await persistSession(result.session);
    return res.json(result);
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tell nginx/ingress not to buffer this response.
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // Propagate client disconnect so we stop paying for tokens nobody will read.
  const controller = new AbortController();
  let clientGone = false;
  req.on('close', () => {
    clientGone = true;
    controller.abort();
  });

  try {
    for await (const event of assistantService.askStream({
      ...payload,
      signal: controller.signal,
    })) {
      if (clientGone) break;
      switch (event.type) {
        case 'status':
          writeSse(res, 'status', { phase: event.phase, detail: event.detail ?? null });
          break;
        case 'meta':
          writeSse(res, 'meta', event.payload);
          break;
        case 'token':
          writeSse(res, 'token', { text: event.text });
          break;
        case 'guardrail':
          writeSse(res, 'guardrail', {
            severity: event.severity,
            message: event.message,
            replacement: event.replacement,
            checked: event.checked,
          });
          break;
        case 'final':
          writeSse(res, 'final', event.payload);
          await persistSession(event.payload?.session);
          break;
        default:
          break;
      }
    }
    if (!clientGone) writeSse(res, 'done', { ok: true });
  } catch (err) {
    if (!clientGone) {
      writeSse(res, 'error', {
        message: err.message || 'Assistant failed',
        fallback: true,
      });
    }
  } finally {
    if (!clientGone) res.end();
  }
}

/** Operational counters for the LLM surface (FORWARD_roadmap Week 16). */
async function metrics(req, res) {
  res.json({ llm: telemetry.snapshot() });
}

/**
 * Voice input: audio blob → transcript. The browser records webm via MediaRecorder and posts the
 * bytes; we transcribe server-side so this works in Firefox too (no Web Speech API there) and so
 * the model and vocabulary hints stay under our control.
 */
async function voice(req, res) {
  if (!speech.isEnabled()) {
    return res.status(503).json({
      error: 'Voice input is not configured on this server.',
      hint: 'Set GROQ_API_KEY (or SPEECH_API_KEY) to enable speech-to-text.',
    });
  }

  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || !buffer.length) {
    return res.status(400).json({ error: 'No audio received.' });
  }

  const requested = String(req.query.language || '').toLowerCase();
  const result = await speech.transcribe({
    buffer,
    mimeType: req.headers['content-type'] || 'audio/webm',
    // 'auto' (or nothing) lets Whisper detect — best for Hinglish, which is code-mixed by nature.
    language: requested === 'hi' || requested === 'en' ? requested : undefined,
    filename: 'speech.webm',
  });

  const detected = detectLanguage(result.text);
  res.json({
    text: result.text,
    spokenLanguage: result.language,
    language: detected.language,
    speechLocale: detected.language === 'hi' ? 'hi-IN' : 'en-IN',
    durationSec: result.durationSec,
    model: result.model,
    elapsedMs: result.elapsedMs,
  });
}

/**
 * Validate, and when `confirmed` is true, execute mutating actions against real portal/report APIs.
 */
async function action(req, res) {
  const body = req.body || {};
  const verdict = actions.validateAction(body);
  if (!verdict.ok) return res.status(400).json({ error: verdict.error });
  if (verdict.needsConfirmation && body.confirmed !== true) {
    return res.json({
      ok: true,
      type: body.type,
      needsConfirmation: true,
      spec: actions.describe(body.type),
    });
  }
  const result = await execute.executeAction({
    user: req.user,
    type: body.type,
    params: body.params || {},
  });
  res.json(result);
}

async function getMemory(req, res) {
  const session = await memoryStore.load(req.user.id);
  res.json({ session: session || {} });
}

async function saveMemory(req, res) {
  const session = req.body?.session && typeof req.body.session === 'object' ? req.body.session : {};
  await memoryStore.save(req.user.id, session);
  res.json({ ok: true, session });
}

async function clearMemory(req, res) {
  await memoryStore.clear(req.user.id);
  res.json({ ok: true, session: {} });
}

/** Self-describing capability list — lets a newcomer discover what the copilot can actually do. */
async function capabilities(req, res) {
  const lang = String(req.query.language || 'en').toLowerCase();
  res.json({
    voiceInput: speech.isEnabled(),
    languages: ['en', 'hi', 'hinglish'],
    starters: beginnerService.starterPrompts(lang),
    glossary: Object.values(beginnerService.GLOSSARY).map((g) => ({
      term: g.term,
      explanation: lang === 'hi' ? g.hi : g.en,
      why: g.why,
    })),
    actions: Object.keys(actions.CATALOG).map((type) => actions.describe(type)),
  });
}

module.exports = { ask, metrics, voice, action, capabilities, getMemory, saveMemory, clearMemory };
