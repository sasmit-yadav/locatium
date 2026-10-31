/**
 * Saved-search alert processor — detects new zones and score changes, sends email.
 */

const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const emailService = require('./email.service');
const investorOpportunities = require('./investor-opportunities.service');

async function listAlerts(userId) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT a.id, a.saved_search_id AS "savedSearchId", a.email, a.min_score_delta AS "minScoreDelta",
            a.active, a.last_notified_at AS "lastNotifiedAt", a.created_at AS "createdAt",
            s.name AS "searchName", s.filters
     FROM investor_search_alerts a
     LEFT JOIN saved_searches s ON s.id = a.saved_search_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC`,
    [userId]
  );
  return rows;
}

async function deleteAlert(userId, alertId) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM investor_search_alerts WHERE id = $1 AND user_id = $2`,
    [alertId, userId]
  );
  if (!rowCount) throw AppError.notFound('Alert not found');
  return { success: true };
}

async function processAlert(alert) {
  const pool = getPool();
  if (!pool) return { skipped: true, reason: 'no_db' };

  let filters = {};
  if (alert.saved_search_id) {
    const { rows } = await pool.query(`SELECT filters FROM saved_searches WHERE id = $1`, [alert.saved_search_id]);
    filters = rows[0]?.filters || {};
  }

  const result = await investorOpportunities.getOpportunities({ ...filters, limit: 25 });
  const snapshot = {};
  for (const opp of result.opportunities || []) {
    snapshot[opp.id] = { score: opp.opportunityScore, name: opp.name };
  }

  const prev = alert.last_snapshot || {};
  const changes = [];
  const newZones = [];

  for (const [id, row] of Object.entries(snapshot)) {
    if (!prev[id]) {
      newZones.push(row.name);
    } else if (Math.abs(row.score - prev[id].score) >= Number(alert.min_score_delta || 5)) {
      changes.push(`${row.name}: ${prev[id].score} → ${row.score}`);
    }
  }

  const shouldNotify = newZones.length > 0 || changes.length > 0;

  if (shouldNotify) {
    const subject = `LOCATIUM investor alert — ${alert.searchName || 'saved search'}`;
    const lines = [
      'Your saved investor search has updates:',
      '',
      newZones.length ? `New zones (${newZones.length}):\n- ${newZones.slice(0, 8).join('\n- ')}` : '',
      changes.length ? `Score changes (${changes.length}):\n- ${changes.slice(0, 8).join('\n- ')}` : '',
      '',
      `Filters: ${JSON.stringify(filters)}`,
      `Checked at: ${new Date().toISOString()}`,
    ].filter(Boolean);

    await emailService.sendReportEmail({
      to: alert.email,
      subject,
      text: lines.join('\n'),
      filename: 'alert.txt',
      pdfBuffer: Buffer.from(lines.join('\n'), 'utf8'),
    });

    await pool.query(
      `UPDATE investor_search_alerts SET last_notified_at = now(), last_snapshot = $2 WHERE id = $1`,
      [alert.id, JSON.stringify(snapshot)]
    );
  } else {
    await pool.query(`UPDATE investor_search_alerts SET last_snapshot = $2 WHERE id = $1`, [
      alert.id,
      JSON.stringify(snapshot),
    ]);
  }

  return { alertId: alert.id, notified: shouldNotify, newZones: newZones.length, changes: changes.length };
}

async function runAllAlerts() {
  const pool = getPool();
  if (!pool) return { processed: 0, notified: 0 };

  const { rows } = await pool.query(
    `SELECT id, user_id, saved_search_id, email, min_score_delta, last_snapshot,
            (SELECT name FROM saved_searches WHERE id = saved_search_id) AS search_name
     FROM investor_search_alerts WHERE active = true`
  );

  let notified = 0;
  for (const alert of rows) {
    alert.searchName = alert.search_name;
    const result = await processAlert(alert);
    if (result.notified) notified += 1;
  }
  return { processed: rows.length, notified, ranAt: new Date().toISOString() };
}

module.exports = { listAlerts, deleteAlert, processAlert, runAllAlerts };
