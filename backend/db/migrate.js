/**
 * Applies db/schema.sql using DATABASE_URL.
 * Run from backend/: npm run db:migrate
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and add your connection string.');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, 'schema.sql');
  const zoneFeaturesPath = path.join(__dirname, 'zone_features.sql');
  const scoringExtensionsPath = path.join(__dirname, 'scoring_extensions.sql');
  const investorExtensionsPath = path.join(__dirname, 'investor_extensions.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const zoneFeaturesSql = fs.existsSync(zoneFeaturesPath)
    ? fs.readFileSync(zoneFeaturesPath, 'utf8')
    : '';
  const investorExtensionsSql = fs.existsSync(investorExtensionsPath)
    ? fs.readFileSync(investorExtensionsPath, 'utf8')
    : '';
  const scoringExtensionsSql = fs.existsSync(scoringExtensionsPath)
    ? fs.readFileSync(scoringExtensionsPath, 'utf8')
    : '';

  const pool = new Pool({ connectionString: url });
  const strictSpatial =
    process.env.NODE_ENV === 'production' ||
    process.env.REQUIRE_SPATIAL_DATA === 'true' ||
    process.env.ALLOW_PARTIAL_SPATIAL_MIGRATION === 'false';
  try {
    await pool.query('BEGIN');
    await pool.query(sql);
    console.log('Migration applied:', sqlPath);

    if (scoringExtensionsSql) {
      try {
        await pool.query('SAVEPOINT scoring_extensions');
        await pool.query(scoringExtensionsSql);
        await pool.query('RELEASE SAVEPOINT scoring_extensions');
        console.log('Migration applied:', scoringExtensionsPath);
      } catch (extErr) {
        await pool.query('ROLLBACK TO SAVEPOINT scoring_extensions');
        if (strictSpatial) throw extErr;
        console.warn('scoring_extensions migration skipped or partial:', extErr.message);
      }
    }

    if (investorExtensionsSql) {
      await pool.query(investorExtensionsSql);
      console.log('Migration applied:', investorExtensionsPath);
    }

    // Feature-store SQL depends on both extension tables above and imported GIS layers.
    if (zoneFeaturesSql) {
      try {
        await pool.query('SAVEPOINT zone_features');
        await pool.query(zoneFeaturesSql);
        await pool.query('RELEASE SAVEPOINT zone_features');
        console.log('Migration applied:', zoneFeaturesPath);
      } catch (zoneErr) {
        await pool.query('ROLLBACK TO SAVEPOINT zone_features');
        if (strictSpatial) throw zoneErr;
        console.warn('zone_features migration skipped or partial:', zoneErr.message);
        console.warn('Restore the GIS tables, then re-run db:migrate');
      }
    }
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
