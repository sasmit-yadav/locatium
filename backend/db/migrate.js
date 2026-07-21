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
  try {
    await pool.query(sql);
    console.log('Migration applied:', sqlPath);

    if (zoneFeaturesSql) {
      try {
        await pool.query(zoneFeaturesSql);
        console.log('Migration applied:', zoneFeaturesPath);
      } catch (zoneErr) {
        console.warn('zone_features migration skipped or partial:', zoneErr.message);
        console.warn('Ensure PostGIS layer tables exist, then re-run db:migrate');
      }
    }

    if (scoringExtensionsSql) {
      try {
        await pool.query(scoringExtensionsSql);
        console.log('Migration applied:', scoringExtensionsPath);
      } catch (extErr) {
        console.warn('scoring_extensions migration skipped or partial:', extErr.message);
      }
    }

    if (investorExtensionsSql) {
      try {
        await pool.query(investorExtensionsSql);
        console.log('Migration applied:', investorExtensionsPath);
      } catch (invErr) {
        console.warn('investor_extensions migration skipped or partial:', invErr.message);
      }
    }

    // Seed default user if users table is empty
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (rows[0].count === 0) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('sas@123456789', 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        ['analyst@locatium.in', passwordHash, 'admin']
      );
      console.log('Seeded default analyst user: analyst@locatium.in / sas@123456789');
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
