const { getPool, checkDatabase } = require('../db/pool');
const { listLayerKeys } = require('../config/maps-registry');
const { mapServerToken, mapServerUsername, redisUrl } = require('../config');
const { pingRedis } = require('./redis-cache.service');
const { AppError } = require('../middleware/error.middleware');

function ensurePool() {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');
  return pool;
}

async function getLayerStatus() {
  const db = await checkDatabase();
  const redis = redisUrl ? await pingRedis() : { ok: false, reason: 'not_configured' };
  const mapServerConfigured = Boolean(mapServerToken || mapServerUsername);

  return {
    database: db,
    redis: { configured: Boolean(redisUrl), ...redis },
    mapServer: {
      configured: mapServerConfigured,
      authMode: mapServerToken ? 'token' : mapServerUsername ? 'credentials' : 'none',
    },
    layers: listLayerKeys().map((slug) => ({
      slug,
      status: mapServerConfigured ? 'available' : 'unconfigured',
    })),
    layerCount: listLayerKeys().length,
  };
}

async function getUserStatistics() {
  const pool = ensurePool();
  const [totals, byRole, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM users`),
    pool.query(
      `
        SELECT role, COUNT(*)::int AS count
        FROM users
        GROUP BY role
        ORDER BY role
      `
    ),
    pool.query(
      `
        SELECT id, email, role, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 10
      `
    ),
  ]);

  return {
    totalUsers: totals.rows[0].count,
    byRole: byRole.rows,
    recentUsers: recent.rows,
  };
}

async function getDataAnalytics() {
  const pool = ensurePool();
  const [features, reports, analyses, snapshots, audits, auditWeek] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM features`),
    pool.query(`SELECT COUNT(*)::int AS count FROM investor_reports`),
    pool.query(`SELECT COUNT(*)::int AS count FROM analysis_history`),
    pool.query(`SELECT COUNT(*)::int AS count FROM shared_snapshots`),
    pool.query(`SELECT COUNT(*)::int AS count FROM audit_logs`),
    pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM audit_logs
        WHERE created_at >= now() - interval '7 days'
      `
    ),
  ]);

  const topActions = await pool.query(
    `
      SELECT action, COUNT(*)::int AS count
      FROM audit_logs
      WHERE created_at >= now() - interval '7 days'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 8
    `
  );

  return {
    featureCount: features.rows[0].count,
    reportCount: reports.rows[0].count,
    analysisCount: analyses.rows[0].count,
    snapshotCount: snapshots.rows[0].count,
    auditLogCount: audits.rows[0].count,
    auditLogsLast7Days: auditWeek.rows[0].count,
    topActionsLast7Days: topActions.rows,
  };
}

async function getRecentAuditLogs({ limit = 50 } = {}) {
  const pool = ensurePool();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const { rows } = await pool.query(
    `
      SELECT
        a.id,
        a.action,
        a.resource_type,
        a.resource_id,
        a.metadata,
        a.ip_address,
        a.created_at,
        u.email AS user_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT $1
    `,
    [safeLimit]
  );
  return rows;
}

module.exports = {
  getLayerStatus,
  getUserStatistics,
  getDataAnalytics,
  getRecentAuditLogs,
};
