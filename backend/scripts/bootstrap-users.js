/**
 * Explicit one-time production user bootstrap.
 *
 * Required for admin:
 *   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD
 *
 * Optional public showcase user:
 *   BOOTSTRAP_DEMO_EMAIL (password is generated unless BOOTSTRAP_DEMO_PASSWORD is set)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const MIN_PASSWORD_LENGTH = Math.max(12, Number(process.env.PASSWORD_MIN_LENGTH) || 12);

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid bootstrap email is required');
  }
  return email;
}

async function upsertUser(pool, { email, password, role }) {
  const cleanEmail = normalizedEmail(email);
  if (String(password || '').length < MIN_PASSWORD_LENGTH) {
    throw new Error(`${role} bootstrap password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         updated_at = now()`,
    [cleanEmail, passwordHash, role]
  );
  console.log(`Bootstrapped ${role} user: ${cleanEmail}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sslSetting = process.env.DATABASE_SSL;
  const useSsl =
    sslSetting === 'true' ||
    (sslSetting !== 'false' && process.env.NODE_ENV === 'production');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    if (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      await upsertUser(pool, {
        email: process.env.BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
        role: 'admin',
      });
    }

    if (process.env.BOOTSTRAP_DEMO_EMAIL) {
      await upsertUser(pool, {
        email: process.env.BOOTSTRAP_DEMO_EMAIL,
        password:
          process.env.BOOTSTRAP_DEMO_PASSWORD ||
          crypto.randomBytes(Math.ceil(MIN_PASSWORD_LENGTH * 0.75)).toString('base64url'),
        role: 'investor',
      });
    }

    if (!process.env.BOOTSTRAP_ADMIN_EMAIL && !process.env.BOOTSTRAP_DEMO_EMAIL) {
      throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and/or BOOTSTRAP_DEMO_EMAIL');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('User bootstrap failed:', error.message);
  process.exit(1);
});
