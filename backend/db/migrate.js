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
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(sql);
    console.log('Migration applied:', sqlPath);
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
