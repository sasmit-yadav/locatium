/**
 * Structured JSON logging for backend services.
 * Correlation ID is reserved for request-scoped tracing (Week 25).
 */

function logEvent(event, fields = {}) {
  const payload = {
    event,
    time: new Date().toISOString(),
    service: 'locatium-api',
    ...fields,
  };
  console.log(JSON.stringify(payload));
}

module.exports = { logEvent };
