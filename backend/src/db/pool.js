/**
 * Shared PostgreSQL pool. Null DATABASE_URL means DB features are not configured.
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX) || 12,
      idleTimeoutMillis: 30000,
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 15000,
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS) || 20000,
    });
  }
  return pool;
}

async function checkDatabase() {
  const p = getPool();
  if (!p) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    await p.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', message: err.message };
  }
}

module.exports = { getPool, checkDatabase };
