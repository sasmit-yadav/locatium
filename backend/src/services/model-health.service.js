/**
 * Model-health rollup for the admin dashboard (FORWARD_roadmap Week 16).
 *
 * One call answers the questions an operator actually has: is the ML service up, is its
 * model trained, is scoring genuinely using it or silently falling back, is the copilot's
 * LLM answering, and is the data underneath any of it stale.
 *
 * Everything degrades to a status rather than throwing — a monitoring page that 500s when
 * the thing it monitors is down is worse than useless.
 */

const scoringTelemetry = require('./scoring-telemetry');
const llmTelemetry = require('./llm/llm-telemetry');
const { getPool } = require('../db/pool');
const { mlServiceUrl, mlServiceTimeoutMs } = require('../config');
const { SCORING_VERSION } = require('./scoring-engine');

const ML_PROBE_TIMEOUT_MS = Math.min(Number(mlServiceTimeoutMs) || 8000, 8000);

/** Fallback rates above these are worth an operator's attention. */
const FALLBACK_WARN_PCT = 10;
const FALLBACK_CRITICAL_PCT = 50;
/**
 * Per-source staleness budgets, in days. Collector rates are republished roughly annually,
 * so a table older than ~18 months has missed a revision; market comparables age faster
 * because a two-year-old sale is no longer evidence of today's price.
 */
const STALE_AFTER_DAYS = {
  circle_rates: 550,
  land_transactions: 730,
  training_rows: 365,
};

async function probeMlService() {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${mlServiceUrl}/ready`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    return {
      configured: true,
      url: mlServiceUrl,
      reachable: res.ok,
      status: res.ok ? 'up' : 'error',
      httpStatus: res.status,
      latencyMs: Date.now() - started,
      registry: body.registry ?? null,
      database: body.database ?? null,
      model: body.model ?? null,
    };
  } catch (err) {
    return {
      configured: true,
      url: mlServiceUrl,
      reachable: false,
      status: err.name === 'AbortError' ? 'timeout' : 'unreachable',
      latencyMs: Date.now() - started,
      error: err.name === 'AbortError' ? `No response within ${ML_PROBE_TIMEOUT_MS}ms` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function daysSince(value) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.round((Date.now() - then) / (24 * 3600 * 1000));
}

/**
 * Freshness of the inputs the models depend on. A perfectly healthy model scoring against
 * a two-year-old rate table still produces wrong answers, so this sits beside the uptime.
 */
async function dataFreshness() {
  const pool = getPool();
  if (!pool) return { status: 'unavailable', reason: 'database_not_configured', sources: [] };

  const probes = [
    {
      key: 'training_rows',
      label: 'ML training labels (zone_outcomes)',
      sql: 'SELECT COUNT(*)::int AS count, MAX(recorded_at)::timestamptz AS latest FROM zone_outcomes',
    },
    {
      key: 'zone_features',
      label: 'Feature store (zone_features)',
      sql: 'SELECT COUNT(*)::int AS count, NULL::timestamptz AS latest FROM zone_features',
    },
    {
      key: 'circle_rates',
      label: 'Collector rates',
      sql: 'SELECT COUNT(*)::int AS count, MAX(effective_from)::timestamptz AS latest FROM circle_rates',
    },
    {
      key: 'land_transactions',
      label: 'Market comparables',
      sql: 'SELECT COUNT(*)::int AS count, MAX(transaction_date)::timestamptz AS latest FROM land_transactions',
    },
    {
      key: 'aqi_stations',
      label: 'CPCB AQI stations',
      sql: 'SELECT COUNT(*)::int AS count, NULL::timestamptz AS latest FROM aqi_stations',
    },
  ];

  const sources = await Promise.all(
    probes.map(async (probe) => {
      try {
        const { rows } = await pool.query(probe.sql);
        const count = Number(rows[0]?.count) || 0;
        const latest = rows[0]?.latest || null;
        const ageDays = daysSince(latest);
        const staleAfter = STALE_AFTER_DAYS[probe.key];
        let status = 'ok';
        if (count === 0) status = 'empty';
        else if (staleAfter != null && ageDays != null && ageDays > staleAfter) status = 'stale';
        return { key: probe.key, label: probe.label, count, latest, ageDays, staleAfterDays: staleAfter ?? null, status };
      } catch (err) {
        return { key: probe.key, label: probe.label, status: 'error', error: err.message };
      }
    })
  );

  const worst = sources.some((s) => s.status === 'error' || s.status === 'empty')
    ? 'degraded'
    : sources.some((s) => s.status === 'stale')
      ? 'stale'
      : 'ok';
  return { status: worst, sources };
}

/**
 * Collapse the parts into one word an operator can act on. The recent window drives this,
 * not the lifetime rate: a process up for a week should go red when the model breaks now.
 */
function overallStatus({ ml, scoring, llm, data }) {
  const issues = [];

  if (!ml.reachable) issues.push({ level: 'critical', message: `ML service ${ml.status}` });

  const recent = scoring.recentSuccessRatePct;
  const fallbackPct = recent == null ? scoring.fallbackRatePct : 100 - recent;
  if (scoring.total > 0) {
    if (fallbackPct >= FALLBACK_CRITICAL_PCT) {
      issues.push({ level: 'critical', message: `${fallbackPct}% of recent scores fell back to the heuristic` });
    } else if (fallbackPct >= FALLBACK_WARN_PCT) {
      issues.push({ level: 'warn', message: `${fallbackPct}% of recent scores fell back to the heuristic` });
    }
  }

  if (llm.enabled && llm.requests > 0 && llm.fallbackRatePct >= FALLBACK_CRITICAL_PCT) {
    issues.push({
      level: 'critical',
      message: `Copilot answered without the LLM ${llm.fallbackRatePct}% of the time`,
    });
  }

  for (const source of data?.sources || []) {
    if (source.status === 'empty') {
      issues.push({ level: 'warn', message: `${source.label} is empty` });
    } else if (source.status === 'stale') {
      issues.push({ level: 'warn', message: `${source.label} is ${source.ageDays} days old` });
    }
  }

  const level = issues.some((i) => i.level === 'critical')
    ? 'critical'
    : issues.some((i) => i.level === 'warn')
      ? 'warn'
      : 'ok';
  return { level, issues };
}

async function getModelHealth() {
  const [ml, data] = await Promise.all([probeMlService(), dataFreshness()]);
  const scoring = scoringTelemetry.snapshot();
  const llmSnapshot = llmTelemetry.snapshot();

  const llm = {
    enabled: process.env.LLM_ENABLED === 'true' || Boolean(process.env.GROQ_API_KEY || process.env.LLM_API_KEY),
    model: process.env.LLM_MODEL || null,
    fallbackModels: String(process.env.LLM_FALLBACK_MODELS || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    requests: llmSnapshot.requests,
    ok: llmSnapshot.llm?.ok ?? 0,
    failed: llmSnapshot.llm?.failed ?? 0,
    modelFallbacks: llmSnapshot.llm?.modelFallbacks ?? 0,
    fallbackRatePct: llmSnapshot.fallbackRatePct,
    cacheHitRatePct: llmSnapshot.cache?.hitRatePct ?? null,
    tokens: llmSnapshot.tokens,
    latencyMs: llmSnapshot.latencyMs,
    byModel: llmSnapshot.byModel,
    lastError: llmSnapshot.lastError,
  };

  return {
    generatedAt: new Date().toISOString(),
    scoringVersion: SCORING_VERSION,
    overall: overallStatus({ ml, scoring, llm, data }),
    ml,
    scoring,
    llm,
    data,
  };
}

module.exports = { getModelHealth, probeMlService, dataFreshness, overallStatus };
