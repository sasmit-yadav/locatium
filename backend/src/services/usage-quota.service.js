const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');

/**
 * Per-user daily counters for costly actions (LLM calls, report emails).
 * Counts live in PostgreSQL so they survive restarts and are shared by every API process.
 * Days roll over at midnight in the database's time zone.
 */

const DEMO_EMAIL_SUFFIX = '@demo.locatium.app';

/** Isolated demo visitors, plus the legacy shared demo account (DEMO_USER_EMAIL). */
function isDemoEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.toLowerCase();
  const shared = (process.env.DEMO_USER_EMAIL || '').trim().toLowerCase();
  return e.endsWith(DEMO_EMAIL_SUFFIX) || (shared && e === shared);
}

function envLimit(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Daily limits. 0 disables the action for that kind of user. */
const LIMITS = {
  assistant: { user: () => envLimit('ASSISTANT_DAILY_LIMIT', 60), demo: () => envLimit('ASSISTANT_DEMO_DAILY_LIMIT', 20) },
  email_report: { user: () => envLimit('EMAIL_REPORT_DAILY_LIMIT', 10), demo: () => 0 },
};

function limitFor(kind, { email, role } = {}) {
  if (role === 'admin') return Infinity;
  const entry = LIMITS[kind];
  if (!entry) throw new Error(`Unknown usage kind: ${kind}`);
  return isDemoEmail(email) ? entry.demo() : entry.user();
}

/**
 * Atomically adds one use and returns { used, limit, remaining }.
 * Throws 429 (and does not count the attempt) once the limit is reached.
 * Without a database the check is skipped — local dev without Postgres keeps working.
 */
async function consume(kind, user, { message, blockedMessage } = {}) {
  const limit = limitFor(kind, user);
  if (limit === 0) {
    throw new AppError(403, blockedMessage || 'This action is not available for your account.', {
      code: 'NOT_ALLOWED',
      kind,
    });
  }
  const pool = getPool();
  if (!pool || !user?.id || limit === Infinity) {
    return { used: 0, limit, remaining: limit };
  }
  let rows;
  try {
    ({ rows } = await pool.query(
    `INSERT INTO user_daily_usage (user_id, day, kind, count)
     VALUES ($1, CURRENT_DATE, $2, 1)
     ON CONFLICT (user_id, day, kind)
       DO UPDATE SET count = user_daily_usage.count + 1
       WHERE user_daily_usage.count < $3
     RETURNING count`,
    [user.id, kind, limit]
    ));
  } catch (err) {
    // Table not created yet (db:migrate not run): never break the feature over a counter.
    if (err.code === '42P01') {
      console.warn('[usage-quota] user_daily_usage missing — run npm run db:migrate');
      return { used: 0, limit, remaining: limit };
    }
    throw err;
  }
  if (!rows[0]) {
    throw new AppError(429, message || 'Daily limit reached. Please try again tomorrow.', {
      code: 'DAILY_LIMIT',
      kind,
      limit,
    });
  }
  const used = rows[0].count;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

async function usageToday(userId) {
  const pool = getPool();
  if (!pool) return {};
  const { rows } = await pool.query(
    `SELECT kind, count FROM user_daily_usage WHERE user_id = $1 AND day = CURRENT_DATE`,
    [userId]
  );
  return Object.fromEntries(rows.map((r) => [r.kind, r.count]));
}

module.exports = { consume, limitFor, usageToday, isDemoEmail, DEMO_EMAIL_SUFFIX };
