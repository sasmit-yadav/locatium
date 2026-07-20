const { getPool } = require('../db/pool');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || null;
}

async function writeAudit({ userId = null, action, resourceType = null, resourceId = null, metadata = {}, ipAddress = null }) {
  const pool = getPool();
  if (!pool || !action) return null;

  const { rows } = await pool.query(
    `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `,
    [userId, action, resourceType, resourceId, metadata, ipAddress]
  );
  return rows[0] || null;
}

async function writeAuditFromRequest(req, { userId, action, resourceType, resourceId, metadata }) {
  return writeAudit({
    userId: userId ?? req.user?.id ?? null,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress: getClientIp(req),
  });
}

module.exports = {
  getClientIp,
  writeAudit,
  writeAuditFromRequest,
};
