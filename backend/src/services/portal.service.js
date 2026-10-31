const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const crypto = require('crypto');
const investorOpportunities = require('./investor-opportunities.service');

const SAVED_SEARCH_LIMIT = 5;
const ANALYSIS_HISTORY_LIMIT = 20;

function ensurePool() {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database not configured');
  return pool;
}

// === SAVED SEARCHES ===

async function saveSearch(userId, name, filters) {
  const pool = ensurePool();
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw AppError.badRequest('Search name is required');
  }

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM saved_searches WHERE user_id = $1`,
    [userId]
  );
  if (countRows[0].count >= SAVED_SEARCH_LIMIT) {
    throw AppError.badRequest(`Saved search limit reached (${SAVED_SEARCH_LIMIT}). Delete an existing view to add a new one.`);
  }

  const { rows } = await pool.query(
    `
      INSERT INTO saved_searches (user_id, name, filters)
      VALUES ($1, $2, $3)
      RETURNING id, name, filters, created_at
    `,
    [userId, name.trim(), filters || {}]
  );
  return rows[0];
}

async function listSearches(userId) {
  const pool = ensurePool();
  const { rows } = await pool.query(
    `
      SELECT id, name, filters, created_at
      FROM saved_searches
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );
  return rows;
}

async function deleteSearch(userId, id) {
  const pool = ensurePool();
  const { rowCount } = await pool.query(
    `
      DELETE FROM saved_searches
      WHERE id = $1 AND user_id = $2
    `,
    [id, userId]
  );
  if (rowCount === 0) {
    throw AppError.notFound('Saved search not found or unauthorized');
  }
  return { success: true };
}

// === FAVORITES / BOOKMARKS ===

async function addFavorite(userId, zoneId, notes) {
  const pool = ensurePool();
  if (!zoneId || typeof zoneId !== 'string' || !zoneId.trim()) {
    throw AppError.badRequest('zoneId is required');
  }

  // Check if already favorited
  const existing = await pool.query(
    `
      SELECT id FROM favorites
      WHERE user_id = $1 AND zone_id = $2
    `,
    [userId, zoneId.trim()]
  );

  if (existing.rows.length > 0) {
    // Update existing notes
    const { rows } = await pool.query(
      `
        UPDATE favorites
        SET notes = $1
        WHERE id = $2
        RETURNING id, zone_id, notes, created_at
      `,
      [notes || '', existing.rows[0].id]
    );
    return rows[0];
  }

  // Verify zone exists first using opportunities service
  try {
    await investorOpportunities.getZoneAnalysis(zoneId.trim(), { includeGeometry: 'false' });
  } catch (err) {
    throw AppError.badRequest(`Cannot favorite invalid zone ID: ${zoneId}. Details: ${err.message}`);
  }

  const { rows } = await pool.query(
    `
      INSERT INTO favorites (user_id, zone_id, notes)
      VALUES ($1, $2, $3)
      RETURNING id, zone_id, notes, created_at
    `,
    [userId, zoneId.trim(), notes || '']
  );
  return rows[0];
}

async function listFavorites(userId) {
  const pool = ensurePool();
  const { rows } = await pool.query(
    `
      SELECT id, zone_id, notes, created_at
      FROM favorites
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  // Hydrate each favorite with its zone summary details
  const hydrated = [];
  for (const fav of rows) {
    try {
      const analysis = await investorOpportunities.getZoneAnalysis(fav.zone_id, { includeGeometry: 'false' });
      hydrated.push({
        id: fav.id,
        zoneId: fav.zone_id,
        notes: fav.notes,
        createdAt: fav.created_at,
        zone: {
          name: analysis.zone.name,
          district: analysis.zone.district,
          type: analysis.zone.type,
          zoneType: analysis.zone.zoneType,
          areaAcres: analysis.zone.areaAcres,
          opportunityScore: analysis.opportunity.opportunityScore,
          center: analysis.zone.center,
        },
      });
    } catch (err) {
      console.warn(`[portal-service] failed to hydrate favorite zone ${fav.zone_id}:`, err.message);
      // Still return it but with fallback/missing zone details
      hydrated.push({
        id: fav.id,
        zoneId: fav.zone_id,
        notes: fav.notes,
        createdAt: fav.created_at,
        zone: { name: 'Unknown Zone', district: 'Haryana', type: 'unknown', opportunityScore: 0, center: null },
      });
    }
  }

  return hydrated;
}

async function updateFavoriteNotes(userId, id, notes) {
  const pool = ensurePool();
  const { rows, rowCount } = await pool.query(
    `
      UPDATE favorites
      SET notes = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, zone_id, notes, created_at
    `,
    [notes || '', id, userId]
  );
  if (rowCount === 0) {
    throw AppError.notFound('Favorite not found or unauthorized');
  }
  return rows[0];
}

async function deleteFavorite(userId, id) {
  const pool = ensurePool();
  const { rowCount } = await pool.query(
    `
      DELETE FROM favorites
      WHERE id = $1 AND user_id = $2
    `,
    [id, userId]
  );
  if (rowCount === 0) {
    throw AppError.notFound('Favorite not found or unauthorized');
  }
  return { success: true };
}

// === SHARED SNAPSHOTS ===

async function createSnapshot(centerLng, centerLat, zoom, activeLayers, selectedZoneId) {
  const pool = ensurePool();
  if (centerLng == null || centerLat == null || zoom == null) {
    throw AppError.badRequest('centerLng, centerLat, and zoom are required');
  }

  const token = crypto.randomBytes(8).toString('hex'); // 16-char hex string
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90); // expires in 90 days

  const { rows } = await pool.query(
    `
      INSERT INTO shared_snapshots (token, center_lng, center_lat, zoom, active_layers, selected_zone_id, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING token, center_lng as "centerLng", center_lat as "centerLat", zoom, active_layers as "activeLayers", selected_zone_id as "selectedZoneId", expires_at as "expiresAt"
    `,
    [
      token,
      Number(centerLng),
      Number(centerLat),
      Number(zoom),
      activeLayers || [],
      selectedZoneId || null,
      expiresAt,
    ]
  );

  return rows[0];
}

async function getSnapshotByToken(token) {
  const pool = ensurePool();
  if (!token || typeof token !== 'string') {
    throw AppError.badRequest('Token is required');
  }

  const { rows } = await pool.query(
    `
      SELECT token, center_lng as "centerLng", center_lat as "centerLat", zoom, active_layers as "activeLayers", selected_zone_id as "selectedZoneId", expires_at as "expiresAt"
      FROM shared_snapshots
      WHERE token = $1 AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1
    `,
    [token.trim()]
  );

  if (!rows[0]) {
    throw AppError.notFound('Shared snapshot link is invalid or expired');
  }

  return rows[0];
}

// === ANALYSIS HISTORY ===

async function recordAnalysis(userId, payload) {
  const pool = ensurePool();
  const { label, lat, lng, sector, overallScore, scores } = payload || {};
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    throw AppError.badRequest('lat and lng are required');
  }

  const { rows } = await pool.query(
    `
      INSERT INTO analysis_history (user_id, label, lat, lng, sector, overall_score, scores)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, label, lat, lng, sector, overall_score as "overallScore", scores, created_at as "createdAt"
    `,
    [
      userId,
      (typeof label === 'string' && label.trim() ? label.trim() : 'Unnamed location'),
      Number(lat),
      Number(lng),
      sector || 'industrial',
      overallScore ?? null,
      scores || {},
    ]
  );

  await pool.query(
    `
      DELETE FROM analysis_history
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM analysis_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
        )
    `,
    [userId, ANALYSIS_HISTORY_LIMIT]
  );

  return rows[0];
}

async function listAnalysisHistory(userId) {
  const pool = ensurePool();
  const { rows } = await pool.query(
    `
      SELECT id, label, lat, lng, sector, overall_score as "overallScore", scores, created_at as "createdAt"
      FROM analysis_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, ANALYSIS_HISTORY_LIMIT]
  );
  return rows;
}

async function clearAnalysisHistory(userId) {
  const pool = ensurePool();
  await pool.query(`DELETE FROM analysis_history WHERE user_id = $1`, [userId]);
  return { success: true };
}

// === WORKSPACE STATS ===

async function getWorkspaceStats(userId) {
  const pool = ensurePool();
  const [searches, favorites, analyses, reports, pipeline] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM saved_searches WHERE user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM favorites WHERE user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM analysis_history WHERE user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM investor_reports`),
    pool.query(`SELECT COUNT(*)::int AS count FROM investor_pipeline WHERE user_id = $1`, [userId]).catch(() => ({ rows: [{ count: 0 }] })),
  ]);

  return {
    savedSearches: searches.rows[0].count,
    savedSearchLimit: SAVED_SEARCH_LIMIT,
    favorites: favorites.rows[0].count,
    analyses: analyses.rows[0].count,
    reportsGenerated: reports.rows[0].count,
    pipelineItems: pipeline.rows[0].count,
  };
}

const PIPELINE_STAGES = ['discovered', 'shortlisted', 'due_diligence', 'negotiation', 'closed', 'passed'];

async function listPipeline(userId) {
  const pool = ensurePool();
  const { rows } = await pool.query(
    `
      SELECT id, zone_id AS "zoneId", stage, notes, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM investor_pipeline
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId]
  );
  return rows;
}

async function upsertPipelineItem(userId, zoneId, stage, notes) {
  const pool = ensurePool();
  if (!zoneId || typeof zoneId !== 'string' || !zoneId.trim()) {
    throw AppError.badRequest('zoneId is required');
  }
  const normalizedStage = String(stage || 'discovered').toLowerCase();
  if (!PIPELINE_STAGES.includes(normalizedStage)) {
    throw AppError.badRequest(`stage must be one of: ${PIPELINE_STAGES.join(', ')}`);
  }

  const { rows } = await pool.query(
    `
      INSERT INTO investor_pipeline (user_id, zone_id, stage, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, zone_id)
      DO UPDATE SET stage = EXCLUDED.stage, notes = EXCLUDED.notes, updated_at = now()
      RETURNING id, zone_id AS "zoneId", stage, notes, created_at AS "createdAt", updated_at AS "updatedAt"
    `,
    [userId, zoneId.trim(), normalizedStage, notes || null]
  );
  return rows[0];
}

async function deletePipelineItem(userId, id) {
  const pool = ensurePool();
  const { rowCount } = await pool.query(
    `DELETE FROM investor_pipeline WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (rowCount === 0) throw AppError.notFound('Pipeline item not found or unauthorized');
  return { success: true };
}

async function listPortfolios(userId) {
  const pool = ensurePool();
  const { rows } = await pool.query(
    `SELECT id, name, zone_ids AS "zoneIds", notes, share_token AS "shareToken", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM investor_portfolios WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return rows;
}

async function upsertPortfolio(userId, { id, name, zoneIds, notes }) {
  const pool = ensurePool();
  if (!name?.trim()) throw AppError.badRequest('Portfolio name is required');
  const zones = Array.isArray(zoneIds) ? zoneIds.filter(Boolean) : [];
  if (id) {
    const { rows } = await pool.query(
      `UPDATE investor_portfolios SET name = $1, zone_ids = $2, notes = $3, updated_at = now()
       WHERE id = $4 AND user_id = $5
       RETURNING id, name, zone_ids AS "zoneIds", notes, share_token AS "shareToken", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name.trim(), zones, notes || null, id, userId]
    );
    if (!rows[0]) throw AppError.notFound('Portfolio not found');
    return rows[0];
  }
  const shareToken = crypto.randomBytes(16).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO investor_portfolios (user_id, name, zone_ids, notes, share_token)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, zone_ids AS "zoneIds", notes, share_token AS "shareToken", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [userId, name.trim(), zones, notes || null, shareToken]
  );
  return rows[0];
}

async function subscribeSearchAlert(userId, { savedSearchId, email, minScoreDelta = 5 }) {
  const pool = ensurePool();
  if (!email?.trim()) throw AppError.badRequest('email is required');
  try {
    const { rows } = await pool.query(
      `INSERT INTO investor_search_alerts (user_id, saved_search_id, email, min_score_delta)
       VALUES ($1, $2, $3, $4)
       RETURNING id, saved_search_id AS "savedSearchId", email, min_score_delta AS "minScoreDelta", active, created_at AS "createdAt"`,
      [userId, savedSearchId || null, email.trim(), minScoreDelta]
    );
    return {
      ...rows[0],
      jobStatus: 'registered',
      note:
        process.env.INVESTOR_ALERTS_ENABLED === 'true'
          ? 'Alert subscription active — background job checks hourly.'
          : 'Subscription saved. Set INVESTOR_ALERTS_ENABLED=true on the server to enable hourly checks.',
    };
  } catch (err) {
    if (err.code === '42P01') {
      return { jobStatus: 'unavailable', note: 'Run db:migrate to enable search alerts.' };
    }
    throw err;
  }
}

async function deletePortfolio(userId, id) {
  const pool = ensurePool();
  const { rowCount } = await pool.query(`DELETE FROM investor_portfolios WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rowCount) throw AppError.notFound('Portfolio not found');
  return { success: true };
}

async function getPortfolioByShareToken(token) {
  const pool = ensurePool();
  const { rows } = await pool.query(
    `SELECT id, name, zone_ids AS "zoneIds", notes, share_token AS "shareToken", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM investor_portfolios WHERE share_token = $1 LIMIT 1`,
    [token]
  );
  if (!rows[0]) throw AppError.notFound('Portfolio not found');
  return rows[0];
}

async function listSearchAlerts(userId) {
  const alertService = require('./investor-alert.service');
  return alertService.listAlerts(userId);
}

async function deleteSearchAlert(userId, alertId) {
  const alertService = require('./investor-alert.service');
  return alertService.deleteAlert(userId, alertId);
}

async function listNotifications(userId, { limit = 20 } = {}) {
  const pool = ensurePool();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const items = [];

  try {
    const { rows } = await pool.query(
      `
        SELECT id, zone_name, recommendation, opportunity_score, generated_at
        FROM investor_reports
        WHERE user_id = $1
        ORDER BY generated_at DESC
        LIMIT 8
      `,
      [userId]
    );
    for (const row of rows) {
      items.push({
        id: `report:${row.id}`,
        kind: 'report',
        title: `Report ready · ${row.zone_name}`,
        body: `${row.recommendation} · score ${row.opportunity_score}`,
        href: 'reports',
        createdAt: row.generated_at,
      });
    }
  } catch (err) {
    if (err.code !== '42P01') throw err;
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT id, stage, zone_id, updated_at
        FROM investor_pipeline
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 8
      `,
      [userId]
    );
    for (const row of rows) {
      items.push({
        id: `pipeline:${row.id}`,
        kind: 'pipeline',
        title: `Pipeline · ${row.stage.replace(/_/g, ' ')}`,
        body: row.zone_id,
        href: 'projects',
        createdAt: row.updated_at,
      });
    }
  } catch (err) {
    if (err.code !== '42P01') throw err;
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT id, email, last_notified_at, created_at, active
        FROM investor_search_alerts
        WHERE user_id = $1
        ORDER BY COALESCE(last_notified_at, created_at) DESC
        LIMIT 8
      `,
      [userId]
    );
    for (const row of rows) {
      items.push({
        id: `alert:${row.id}`,
        kind: 'alert',
        title: row.last_notified_at ? 'Search alert fired' : 'Search alert watching',
        body: row.active ? `Watching ${row.email}` : 'Alert paused',
        href: 'projects',
        createdAt: row.last_notified_at || row.created_at,
      });
    }
  } catch (err) {
    if (err.code !== '42P01') throw err;
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { count: items.length, notifications: items.slice(0, safeLimit) };
}

module.exports = {
  saveSearch,
  listSearches,
  deleteSearch,
  addFavorite,
  listFavorites,
  updateFavoriteNotes,
  deleteFavorite,
  createSnapshot,
  getSnapshotByToken,
  recordAnalysis,
  listAnalysisHistory,
  clearAnalysisHistory,
  getWorkspaceStats,
  listPipeline,
  upsertPipelineItem,
  deletePipelineItem,
  PIPELINE_STAGES,
  listPortfolios,
  upsertPortfolio,
  subscribeSearchAlert,
  deletePortfolio,
  getPortfolioByShareToken,
  listSearchAlerts,
  deleteSearchAlert,
  listNotifications,
};
