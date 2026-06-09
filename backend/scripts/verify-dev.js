/**
 * Step 1 — verify local dev stack (Postgres + Redis + env).
 * Run from backend/: npm run dev:verify
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const Redis = require('ioredis');

const checks = [];

function pass(label, detail = '') {
  checks.push({ ok: true, label, detail });
  console.log(`  OK   ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  checks.push({ ok: false, label, detail });
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

async function checkPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL', 'not set in backend/.env');
    return;
  }
  pass('DATABASE_URL', 'set');
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await pool.query('SELECT 1');
    pass('PostgreSQL', 'connected');
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS ok`
    );
    if (rows[0]?.ok) pass('Schema', 'users table exists (migrate applied)');
    else fail('Schema', 'run: npm run db:migrate');
  } catch (err) {
    fail('PostgreSQL', `${err.message} — run: docker compose up -d (from repo root)`);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function checkRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    fail('REDIS_URL', 'not set — uncomment in backend/.env for tile cache');
    return;
  }
  // allow skipping redis check in local dev when REDIS_URL=skip
  if (url === 'skip') {
    pass('REDIS_URL', 'skip');
    pass('Redis', 'skipped (not configured)');
    return;
  }
  pass('REDIS_URL', 'set');
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === 'PONG') pass('Redis', 'connected (tile cache enabled)');
    else fail('Redis', `unexpected ping: ${pong}`);
  } catch (err) {
    fail('Redis', `${err.message} — run: docker compose up -d (from repo root)`);
  } finally {
    try {
      redis.disconnect();
    } catch {
      /* noop */
    }
  }
}

async function checkJwt() {
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET) {
    pass('JWT secrets', 'set');
  } else {
    fail('JWT secrets', 'set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in .env');
  }
}

async function checkHarsac() {
  // Instead of external HARSAC credentials, verify at least one GIS table exists locally
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (
        'district_boundary','haryana_cadastral','hospitals','roads_line'
      ) LIMIT 1`
    );
    if (rows && rows.length > 0) pass('Local GIS tables', `found ${rows[0].table_name}`);
    else fail('Local GIS tables', 'no expected GIS tables found; import PostGIS data first');
  } catch (err) {
    fail('Local GIS tables', err.message);
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  console.log('\nLOCATIUM — Step 1 dev stack check\n');
  await checkPostgres();
  await checkRedis();
  await checkJwt();
  await checkHarsac();

  const failed = checks.filter((c) => !c.ok).length;
  console.log('');
  if (failed === 0) {
    console.log('All checks passed. Start API: npm run dev');
    console.log('Then open: http://localhost:3001/api/ready');
    process.exit(0);
  }
  console.log(`${failed} check(s) failed. See docs/STEP-1-DEV-SETUP.md`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
