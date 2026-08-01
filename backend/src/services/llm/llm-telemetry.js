/**
 * LLM telemetry — rolling in-process metrics for the assistant/LLM surface.
 *
 * Tracks the numbers that actually matter operationally (FORWARD_roadmap Week 16):
 * TTFT, total latency percentiles, tokens/sec, cache-hit rate, fallback rate, token spend.
 * In-memory only and bounded — this is an observability aid, not an audit log.
 */

const MAX_SAMPLES = 500;

const state = {
  startedAt: new Date().toISOString(),
  requests: 0,
  llmOk: 0,
  llmFailed: 0,
  fallbacks: 0,
  cacheHits: 0,
  cacheMisses: 0,
  retries: 0,
  modelFallbacks: 0,
  aborts: 0,
  promptTokens: 0,
  completionTokens: 0,
  ttftMs: [],
  totalMs: [],
  groundingMs: [],
  byMethod: Object.create(null),
  byModel: Object.create(null),
  lastError: null,
};

function pushSample(arr, value) {
  if (!Number.isFinite(value)) return;
  arr.push(value);
  if (arr.length > MAX_SAMPLES) arr.shift();
}

function bump(bucket, key) {
  if (!key) return;
  bucket[key] = (bucket[key] || 0) + 1;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function summarize(samples) {
  if (!samples.length) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

/** Record one completed assistant turn (LLM or fallback). */
function recordTurn({
  method,
  model,
  ttftMs,
  totalMs,
  groundingMs,
  promptTokens,
  completionTokens,
  cacheHit,
  retries = 0,
  modelFallback = false,
  aborted = false,
  error = null,
} = {}) {
  state.requests += 1;
  bump(state.byMethod, method);
  bump(state.byModel, model);

  if (method === 'llm' || method === 'llm_stream') state.llmOk += 1;
  if (error) {
    state.llmFailed += 1;
    state.lastError = { message: String(error).slice(0, 200), at: new Date().toISOString() };
  }
  if (method && String(method).includes('fallback')) state.fallbacks += 1;
  if (cacheHit === true) state.cacheHits += 1;
  else if (cacheHit === false) state.cacheMisses += 1;
  if (retries) state.retries += retries;
  if (modelFallback) state.modelFallbacks += 1;
  if (aborted) state.aborts += 1;

  if (Number.isFinite(promptTokens)) state.promptTokens += promptTokens;
  if (Number.isFinite(completionTokens)) state.completionTokens += completionTokens;

  pushSample(state.ttftMs, ttftMs);
  pushSample(state.totalMs, totalMs);
  pushSample(state.groundingMs, groundingMs);
}

function snapshot() {
  const totalCacheLookups = state.cacheHits + state.cacheMisses;
  const completion = summarize(state.completionTokens ? state.totalMs : []);
  const tokensPerSec =
    state.completionTokens && completion.p50
      ? Math.round((state.completionTokens / Math.max(1, state.llmOk)) / (completion.p50 / 1000))
      : null;

  return {
    startedAt: state.startedAt,
    requests: state.requests,
    llm: {
      ok: state.llmOk,
      failed: state.llmFailed,
      retries: state.retries,
      modelFallbacks: state.modelFallbacks,
      aborts: state.aborts,
      approxTokensPerSec: tokensPerSec,
    },
    fallbackRatePct:
      state.requests ? Math.round((state.fallbacks / state.requests) * 1000) / 10 : 0,
    cache: {
      hits: state.cacheHits,
      misses: state.cacheMisses,
      hitRatePct: totalCacheLookups
        ? Math.round((state.cacheHits / totalCacheLookups) * 1000) / 10
        : null,
    },
    tokens: {
      prompt: state.promptTokens,
      completion: state.completionTokens,
      total: state.promptTokens + state.completionTokens,
    },
    latencyMs: {
      timeToFirstToken: summarize(state.ttftMs),
      total: summarize(state.totalMs),
      grounding: summarize(state.groundingMs),
    },
    byMethod: { ...state.byMethod },
    byModel: { ...state.byModel },
    lastError: state.lastError,
  };
}

function reset() {
  state.requests = 0;
  state.llmOk = 0;
  state.llmFailed = 0;
  state.fallbacks = 0;
  state.cacheHits = 0;
  state.cacheMisses = 0;
  state.retries = 0;
  state.modelFallbacks = 0;
  state.aborts = 0;
  state.promptTokens = 0;
  state.completionTokens = 0;
  state.ttftMs.length = 0;
  state.totalMs.length = 0;
  state.groundingMs.length = 0;
  state.byMethod = Object.create(null);
  state.byModel = Object.create(null);
  state.lastError = null;
  state.startedAt = new Date().toISOString();
}

module.exports = { recordTurn, snapshot, reset };
