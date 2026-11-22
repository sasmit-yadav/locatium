const fs = require('fs/promises');
const path = require('path');
const { getPool } = require('../db/pool');

/**
 * Daily housekeeping (also runs once at boot):
 *  - deletes generated PDF / outbox files older than REPORT_FILE_RETENTION_DAYS (default 14).
 *    Report PDFs are also stored in PostgreSQL (investor_reports.content), so downloads
 *    keep working; only the redundant disk copies are removed.
 *  - deletes expired refresh tokens and used/expired one-time auth tokens,
 *  - deletes daily usage counters older than 60 days,
 *  - deletes audit log rows older than 365 days (matches the Privacy Policy).
 */

const BACKEND_DIR = path.join(__dirname, '..', '..');
const FILE_DIRS = [path.join(BACKEND_DIR, 'reports'), path.join(BACKEND_DIR, 'email-outbox')];
const INTERVAL_MS = 24 * 60 * 60 * 1000;
let timer = null;

function retentionDays() {
  const n = Number(process.env.REPORT_FILE_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? n : 14;
}

async function pruneOldFiles(dir, maxAgeMs, now = Date.now()) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(full);
        removed += 1;
      }
    } catch {
      /* file vanished or locked: try again next run */
    }
  }
  return removed;
}

async function pruneDatabase() {
  const pool = getPool();
  if (!pool) return {};
  const run = async (sql) => {
    try {
      const r = await pool.query(sql);
      return r.rowCount || 0;
    } catch (err) {
      if (err.code === '42P01') return 0; // table not migrated yet
      throw err;
    }
  };
  return {
    refreshTokens: await run(`DELETE FROM refresh_tokens WHERE expires_at < now()`),
    authTokens: await run(
      `DELETE FROM auth_tokens WHERE expires_at < now() - interval '1 day' OR used_at < now() - interval '1 day'`
    ),
    usage: await run(`DELETE FROM user_daily_usage WHERE day < CURRENT_DATE - 60`),
    auditLogs: await run(`DELETE FROM audit_logs WHERE created_at < now() - interval '365 days'`),
  };
}

async function runHousekeeping() {
  const maxAgeMs = retentionDays() * 24 * 60 * 60 * 1000;
  let files = 0;
  for (const dir of FILE_DIRS) files += await pruneOldFiles(dir, maxAgeMs);
  const db = await pruneDatabase();
  return { files, ...db };
}

function startHousekeepingJob() {
  if (process.env.HOUSEKEEPING_ENABLED === 'false') return;
  const tick = async () => {
    try {
      const result = await runHousekeeping();
      const total = Object.values(result).reduce((a, b) => a + (Number(b) || 0), 0);
      if (total) console.log('[housekeeping]', JSON.stringify(result));
    } catch (err) {
      console.error('[housekeeping] failed:', err.message);
    }
  };
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
}

function stopHousekeepingJob() {
  if (timer) clearInterval(timer);
}

module.exports = { startHousekeepingJob, stopHousekeepingJob, runHousekeeping, pruneOldFiles };
