const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');

/**
 * Applies db/accounts.sql (email verification, one-time tokens, daily usage counters) at
 * startup. Every statement is IF NOT EXISTS, so it is safe and fast to run on each boot and
 * the account features work even if `npm run db:migrate` was not re-run after upgrading.
 */
async function ensureAccountSchema() {
  const pool = getPool();
  if (!pool) return { applied: false };
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'accounts.sql'), 'utf8');
  await pool.query(sql);
  return { applied: true };
}

module.exports = { ensureAccountSchema };
