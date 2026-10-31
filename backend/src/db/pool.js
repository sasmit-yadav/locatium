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
    const sslSetting = process.env.DATABASE_SSL;
    const useSsl =
      sslSetting === 'true' ||
      (sslSetting !== 'false' &&
        (process.env.NODE_ENV === 'production' ||
          /render\.com|neon\.tech|supabase\.co/i.test(process.env.DATABASE_URL || '')));
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX) || 12,
      idleTimeoutMillis: 30000,
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 15000,
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS) || 20000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => {
      console.error('[pg pool] idle client error:', err.message);
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

async function checkDatabaseReadiness({ requireSpatial = false } = {}) {
  const p = getPool();
  if (!p) return { ok: false, reason: 'not_configured' };

  try {
    await p.query('SELECT 1');
    const extension = await p.query(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed"
    );
    if (!extension.rows[0]?.installed) {
      return { ok: false, reason: 'postgis_missing', message: 'PostGIS extension is not installed' };
    }

    const coreTables = [
      'users',
      'refresh_tokens',
      'audit_logs',
      'features',
      'investor_reports',
      'saved_searches',
      'favorites',
      'shared_snapshots',
      'analysis_history',
      'investor_pipeline',
      'investor_portfolios',
      'investor_search_alerts',
    ];
    const spatialTables = [
      'state_boundary',
      'district_boundary',
      'roads_line',
      'hsiidc_boundary',
      'hsvp_plots',
      'hospitals',
      'govt_school',
      'rail_network',
      'airports',
      'electric_station',
      'water_network',
      'zone_features',
      'zone_outcomes',
      'circle_rates',
      'land_transactions',
    ];
    const requiredTables = requireSpatial ? [...coreTables, ...spatialTables] : coreTables;
    const result = await p.query(
      `SELECT name
       FROM unnest($1::text[]) AS name
       WHERE to_regclass('public.' || name) IS NULL`,
      [requiredTables]
    );
    const missingTables = result.rows.map((row) => row.name);
    if (missingTables.length) {
      return {
        ok: false,
        reason: 'tables_missing',
        message: `Missing required tables: ${missingTables.join(', ')}`,
        missingTables,
      };
    }

    if (requireSpatial) {
      const rowCounts = await p.query(
        `SELECT 'state_boundary' AS name, COUNT(*)::bigint AS row_count FROM state_boundary
         UNION ALL SELECT 'district_boundary', COUNT(*)::bigint FROM district_boundary
         UNION ALL SELECT 'roads_line', COUNT(*)::bigint FROM roads_line
         UNION ALL SELECT 'hsiidc_boundary', COUNT(*)::bigint FROM hsiidc_boundary
         UNION ALL SELECT 'hsvp_plots', COUNT(*)::bigint FROM hsvp_plots`
      );
      const emptyTables = rowCounts.rows
        .filter((row) => Number(row.row_count) === 0)
        .map((row) => row.name);
      if (emptyTables.length) {
        return {
          ok: false,
          reason: 'spatial_data_empty',
          message: `Required spatial tables are empty: ${emptyTables.join(', ')}`,
          emptyTables,
        };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', message: err.message };
  }
}

async function closePool() {
  if (!pool) return;
  const activePool = pool;
  pool = null;
  await activePool.end();
}

module.exports = { getPool, checkDatabase, checkDatabaseReadiness, closePool };
