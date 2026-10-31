/**
 * In-process counters for the scoring path.
 *
 * FORWARD_roadmap Week 16 asked for a model-monitoring dashboard. Grafana and Evidently
 * are out of scope for a single-box showcase, but the question they answer — "is the ML
 * model actually being used, or has it been quietly falling back for a week?" — matters,
 * because a retired model or a too-tight timeout degrades silently while every endpoint
 * keeps returning 200.
 *
 * Counters are per-process and reset on restart. They are a health signal, not an audit
 * trail; `audit_logs` is the durable record.
 */

const MAX_REASONS = 12;
const RECENT_WINDOW = 50;

const state = {
  startedAt: new Date().toISOString(),
  total: 0,
  byMethod: Object.create(null),
  byModelVersion: Object.create(null),
  fallbacks: 0,
  fallbackReasons: Object.create(null),
  /** Rolling window so a long-running process still shows *current* behaviour. */
  recent: [],
  lastFallbackAt: null,
  lastMlAt: null,
  latencyMs: [],
};

function bump(bucket, key) {
  if (!key) return;
  bucket[key] = (bucket[key] || 0) + 1;
}

/**
 * @param {object} outcome
 * @param {string} outcome.method       'ml' | 'heuristic'
 * @param {string} [outcome.modelVersion]
 * @param {boolean} [outcome.fallback]  true when the ML call failed and PostGIS answered
 * @param {string} [outcome.reason]     fallback reason (timeout / http_error / network_error)
 * @param {number} [outcome.elapsedMs]
 */
function recordScore(outcome = {}) {
  const method = outcome.method === 'ml' ? 'ml' : 'heuristic';
  state.total += 1;
  bump(state.byMethod, method);
  bump(state.byModelVersion, outcome.modelVersion);

  if (outcome.fallback) {
    state.fallbacks += 1;
    state.lastFallbackAt = new Date().toISOString();
    const reason = outcome.reason || 'unknown';
    // Bound the reason map: a hostile or noisy upstream must not grow it without limit.
    if (state.fallbackReasons[reason] || Object.keys(state.fallbackReasons).length < MAX_REASONS) {
      bump(state.fallbackReasons, reason);
    } else {
      bump(state.fallbackReasons, 'other');
    }
  } else if (method === 'ml') {
    state.lastMlAt = new Date().toISOString();
  }

  state.recent.push(outcome.fallback ? 0 : 1);
  if (state.recent.length > RECENT_WINDOW) state.recent.shift();

  if (Number.isFinite(outcome.elapsedMs)) {
    state.latencyMs.push(outcome.elapsedMs);
    if (state.latencyMs.length > 500) state.latencyMs.shift();
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function snapshot() {
  const sorted = [...state.latencyMs].sort((a, b) => a - b);
  const recentOk = state.recent.filter(Boolean).length;

  return {
    startedAt: state.startedAt,
    total: state.total,
    byMethod: { ...state.byMethod },
    byModelVersion: { ...state.byModelVersion },
    fallbacks: state.fallbacks,
    fallbackRatePct: state.total ? Math.round((state.fallbacks / state.total) * 1000) / 10 : 0,
    // The lifetime rate hides a model that broke an hour ago; this does not.
    recentSuccessRatePct: state.recent.length
      ? Math.round((recentOk / state.recent.length) * 1000) / 10
      : null,
    recentWindow: state.recent.length,
    fallbackReasons: { ...state.fallbackReasons },
    lastFallbackAt: state.lastFallbackAt,
    lastMlAt: state.lastMlAt,
    latencyMs: {
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      p99: percentile(sorted, 0.99),
      samples: sorted.length,
    },
  };
}

function reset() {
  state.total = 0;
  state.byMethod = Object.create(null);
  state.byModelVersion = Object.create(null);
  state.fallbacks = 0;
  state.fallbackReasons = Object.create(null);
  state.recent = [];
  state.latencyMs = [];
  state.lastFallbackAt = null;
  state.lastMlAt = null;
  state.startedAt = new Date().toISOString();
}

module.exports = { recordScore, snapshot, reset };
