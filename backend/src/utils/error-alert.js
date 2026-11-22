/**
 * Optional error alerts. When ALERT_WEBHOOK_URL is set, server errors (5xx, crashes) are
 * POSTed as a short JSON message — works with Slack/Discord incoming webhooks and ntfy.sh.
 * At most one alert per minute per error message, so an outage does not flood the channel.
 * Never includes request bodies, tokens or user data.
 */

const lastSent = new Map();
const COOLDOWN_MS = 60_000;

function alertError(err, context = {}) {
  const url = (process.env.ALERT_WEBHOOK_URL || '').trim();
  if (!url || typeof fetch !== 'function') return;
  const message = String(err?.message || err || 'Unknown error').slice(0, 300);
  const now = Date.now();
  if (now - (lastSent.get(message) || 0) < COOLDOWN_MS) return;
  lastSent.set(message, now);
  if (lastSent.size > 200) lastSent.clear();

  const where = [context.method, context.path].filter(Boolean).join(' ');
  const text = `LOCATIUM API error${where ? ` at ${where}` : ''}${context.requestId ? ` [${context.requestId}]` : ''}: ${message}`;
  // `content` for Discord, `text` for Slack; ntfy accepts any body.
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

module.exports = { alertError };
