const { mlServiceUrl, mlServiceTimeoutMs, mlServiceEnabled } = require('../config');
const { logEvent } = require('../utils/structured-logger');

class MlClientError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'MlClientError';
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Circuit breaker + concurrency cap for the investment model.
 *
 * PostGIS scoring is authoritative; the model only adjusts the overall number. So when
 * the service is down or saturated, the right answer is to skip it immediately, not to
 * spend the full timeout discovering that again on every request. Without this, a
 * degraded ML service added its entire timeout to every map click — measured at ~10s
 * p50 for a 20-click burst, where the PostGIS score itself takes ~330ms.
 */
const ML_MAX_INFLIGHT = Number(process.env.ML_MAX_INFLIGHT) || 6;
const ML_BREAKER_THRESHOLD = Number(process.env.ML_BREAKER_THRESHOLD) || 3;
const ML_BREAKER_COOLDOWN_MS = Number(process.env.ML_BREAKER_COOLDOWN_MS) || 30_000;

const breaker = { consecutiveFailures: 0, openUntil: 0, inFlight: 0 };

function breakerIsOpen() {
  if (breaker.openUntil && Date.now() < breaker.openUntil) return true;
  if (breaker.openUntil) {
    // Cooldown elapsed: let the next call through as a probe.
    breaker.openUntil = 0;
    breaker.consecutiveFailures = 0;
  }
  return false;
}

function recordMlSuccess() {
  breaker.consecutiveFailures = 0;
  breaker.openUntil = 0;
}

function recordMlFailure(reason) {
  breaker.consecutiveFailures += 1;
  if (breaker.consecutiveFailures >= ML_BREAKER_THRESHOLD && !breaker.openUntil) {
    breaker.openUntil = Date.now() + ML_BREAKER_COOLDOWN_MS;
    logEvent('ml_circuit_opened', {
      reason,
      consecutiveFailures: breaker.consecutiveFailures,
      cooldownMs: ML_BREAKER_COOLDOWN_MS,
    });
  }
}

/** Exposed for health/metrics surfaces and tests. */
function mlBreakerState() {
  return {
    open: Boolean(breaker.openUntil && Date.now() < breaker.openUntil),
    consecutiveFailures: breaker.consecutiveFailures,
    inFlight: breaker.inFlight,
    reopensInMs: breaker.openUntil ? Math.max(0, breaker.openUntil - Date.now()) : 0,
  };
}

function resetMlBreaker() {
  breaker.consecutiveFailures = 0;
  breaker.openUntil = 0;
  breaker.inFlight = 0;
}

async function requestMl(path, { method = 'GET', body, requestId, timeoutMs } = {}) {
  if (!mlServiceEnabled) {
    throw new MlClientError('ML service is disabled (ML_SERVICE_URL=disabled)', { reason: 'disabled' });
  }
  const timeout = timeoutMs || mlServiceTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (requestId) headers['X-Request-Id'] = requestId;

  try {
    const res = await fetch(`${mlServiceUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new MlClientError(`ML service returned ${res.status}`, {
        status: res.status,
        reason: 'http_error',
      });
    }
    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new MlClientError('ML service request timed out', { reason: 'timeout' });
    }
    if (err instanceof MlClientError) throw err;
    throw new MlClientError(err.message || 'ML service unreachable', { reason: 'network_error' });
  } finally {
    clearTimeout(timer);
  }
}

async function scoreDummy(payload, { requestId } = {}) {
  return requestMl('/score/dummy', {
    method: 'POST',
    body: payload,
    requestId,
  });
}

async function scoreInvestment(payload, { requestId } = {}) {
  if (breakerIsOpen()) {
    throw new MlClientError('ML service circuit is open', { reason: 'circuit_open' });
  }
  if (breaker.inFlight >= ML_MAX_INFLIGHT) {
    // Queueing here would only convert saturation into timeouts for everyone.
    throw new MlClientError('ML service is saturated', { reason: 'saturated' });
  }

  const investmentTimeout =
    Number(process.env.ML_INVESTMENT_TIMEOUT_MS) || mlServiceTimeoutMs;

  breaker.inFlight += 1;
  try {
    const result = await requestMl('/score/investment', {
      method: 'POST',
      body: payload,
      requestId,
      timeoutMs: investmentTimeout,
    });
    recordMlSuccess();
    return result;
  } catch (err) {
    recordMlFailure(err.reason || err.message);
    throw err;
  } finally {
    breaker.inFlight -= 1;
  }
}

module.exports = {
  MlClientError,
  scoreDummy,
  scoreInvestment,
  requestMl,
  mlBreakerState,
  resetMlBreaker,
};
