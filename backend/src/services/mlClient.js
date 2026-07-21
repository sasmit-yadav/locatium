const { mlServiceUrl, mlServiceTimeoutMs } = require('../config');

class MlClientError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'MlClientError';
    this.status = status;
    this.reason = reason;
  }
}

async function requestMl(path, { method = 'GET', body, requestId, timeoutMs } = {}) {
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
  const investmentTimeout = Number(process.env.ML_INVESTMENT_TIMEOUT_MS) || 8000;
  return requestMl('/score/investment', {
    method: 'POST',
    body: payload,
    requestId,
    timeoutMs: investmentTimeout,
  });
}

module.exports = {
  MlClientError,
  scoreDummy,
  scoreInvestment,
  requestMl,
};
