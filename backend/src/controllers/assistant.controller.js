const assistantService = require('../services/assistant.service');

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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
  const wantsStream =
    body.stream === true || String(req.headers.accept || '').includes('text/event-stream');

  if (!wantsStream) {
    const result = await assistantService.ask({ ...payload, stream: false });
    return res.json(result);
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  try {
    writeSse(res, 'status', { phase: 'understanding' });
    writeSse(res, 'status', { phase: 'grounding' });
    const result = await assistantService.ask({ ...payload, stream: true });
    writeSse(res, 'meta', {
      method: result.method,
      intent: result.intent,
      intents: result.intents,
      disclaimer: result.disclaimer,
      contextSummary: result.contextSummary,
      mapActions: result.mapActions,
      followUps: result.followUps,
      session: result.session,
      opportunities: result.opportunities,
      scoredLocation: result.scoredLocation,
      elapsedMs: result.elapsedMs,
    });

    writeSse(res, 'status', { phase: 'answering' });
    const text = result.answer || '';
    const chunkSize = 36;
    for (let i = 0; i < text.length; i += chunkSize) {
      writeSse(res, 'token', { text: text.slice(i, i + chunkSize) });
    }
    writeSse(res, 'done', { ok: true });
  } catch (err) {
    writeSse(res, 'error', {
      message: err.message || 'Assistant failed',
      fallback: true,
    });
  } finally {
    res.end();
  }
}

module.exports = { ask };
