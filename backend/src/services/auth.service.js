const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');
const {
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpires,
  jwtRefreshExpires,
  passwordMinLength,
} = require('../config');
const { sha256Hex } = require('../utils/hash-token');

const BCRYPT_ROUNDS = 12;

function assertDb() {
  const pool = getPool();
  if (!pool) {
    throw AppError.serviceUnavailable('Database is not configured (DATABASE_URL)');
  }
  return pool;
}

function assertJwtSecrets() {
  if (!jwtAccessSecret || !jwtRefreshSecret) {
    throw AppError.serviceUnavailable(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in environment'
    );
  }
}

function validateEmail(email) {
  if (typeof email !== 'string' || !email.trim()) {
    throw AppError.badRequest('Email is required');
  }
  const normalized = email.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!ok) throw AppError.badRequest('Invalid email format');
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < passwordMinLength) {
    throw AppError.badRequest(`Password must be at least ${passwordMinLength} characters`);
  }
}

function issueAccessToken(user, expiresIn = jwtAccessExpires) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      typ: 'access',
    },
    jwtAccessSecret,
    { expiresIn }
  );
}

/**
 * Showcase visitors each get their own throwaway investor account, so one visitor's
 * pipeline, portfolios, saved searches, reports and copilot memory are never visible
 * to the next. Accounts live DEMO_TTL_DAYS; the token expires with them and the purge
 * job deletes them a day later (every user-owned table cascades on user delete).
 */
const DEMO_EMAIL_DOMAIN = 'demo.locatium.app';
const DEMO_EMAIL_PATTERN = `demo+%@${DEMO_EMAIL_DOMAIN}`;

function demoTtlDays() {
  const n = Number(process.env.DEMO_TTL_DAYS);
  return Number.isFinite(n) && n >= 1 && n <= 30 ? Math.floor(n) : 7;
}

function demoIsolated() {
  return process.env.DEMO_ISOLATED !== 'false';
}

async function createIsolatedDemoUser(pool) {
  const suffix = crypto.randomBytes(8).toString('hex');
  const email = `demo+${suffix}@${DEMO_EMAIL_DOMAIN}`;
  // Unguessable, never disclosed: the account can only be reached through its token.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, display_name)
     VALUES ($1, $2, 'investor', 'Demo visitor')
     RETURNING id, email, role, created_at`,
    [email, passwordHash]
  );
  return rows[0];
}

/** Deletes expired isolated demo accounts (and, by cascade, everything they own). */
async function purgeExpiredDemoUsers() {
  const pool = getPool();
  if (!pool) return { deleted: 0 };
  const { rowCount } = await pool.query(
    `DELETE FROM users
     WHERE email LIKE $1
       AND role = 'investor'
       AND created_at < now() - make_interval(days => $2)`,
    [DEMO_EMAIL_PATTERN, demoTtlDays() + 1]
  );
  return { deleted: rowCount || 0 };
}

function issueRefreshToken(userId) {
  return jwt.sign({ sub: userId, typ: 'refresh' }, jwtRefreshSecret, {
    expiresIn: jwtRefreshExpires,
  });
}

async function persistRefreshToken(db, userId, refreshToken) {
  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);
  const tokenHash = sha256Hex(refreshToken);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

async function register({ email, password }) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_PUBLIC_REGISTRATION !== 'true'
  ) {
    throw AppError.forbidden('Public registration is disabled for this showcase');
  }
  assertJwtSecrets();
  const pool = assertDb();
  const emailNorm = validateEmail(email);
  validatePassword(password);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'investor')
       RETURNING id, email, role, created_at`,
      [emailNorm, passwordHash]
    );
    const user = rows[0];
    const accessToken = issueAccessToken(user);
    const refreshToken = issueRefreshToken(user.id);
    await persistRefreshToken(pool, user.id, refreshToken);
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      accessToken,
      refreshToken,
    };
  } catch (err) {
    if (err.code === '23505') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw err;
  }
}

async function login({ email, password }) {
  assertJwtSecrets();
  const pool = assertDb();
  const emailNorm = validateEmail(email);
  if (typeof password !== 'string' || !password) {
    throw AppError.badRequest('Password is required');
  }

  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1`,
    [emailNorm]
  );
  if (rows.length === 0) {
    throw AppError.unauthorized('Invalid email or password');
  }
  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user.id);
  await persistRefreshToken(pool, user.id, refreshToken);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
    accessToken,
    refreshToken,
  };
}

async function loginDemo() {
  if (process.env.DEMO_MODE !== 'true') {
    throw AppError.notFound('Demo login is not enabled');
  }

  assertJwtSecrets();
  const pool = assertDb();

  if (demoIsolated()) {
    const user = await createIsolatedDemoUser(pool);
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      accessToken: issueAccessToken(user, `${demoTtlDays()}d`),
      demo: true,
      isolated: true,
      expiresInDays: demoTtlDays(),
    };
  }

  const email = validateEmail(process.env.DEMO_USER_EMAIL);
  const { rows } = await pool.query(
    `SELECT id, email, role, created_at
     FROM users
     WHERE email = $1 AND role = 'investor'
     LIMIT 1`,
    [email]
  );
  if (!rows[0]) {
    throw AppError.serviceUnavailable(
      'Demo user is not provisioned; run the user bootstrap command'
    );
  }

  const user = rows[0];
  const accessToken = issueAccessToken(user);
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    },
    accessToken,
    demo: true,
  };
}

async function refresh({ refreshToken }) {
  assertJwtSecrets();
  const pool = assertDb();
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    throw AppError.badRequest('refreshToken is required');
  }
  let payload;
  try {
    payload = jwt.verify(refreshToken.trim(), jwtRefreshSecret);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
  if (payload.typ !== 'refresh' || !payload.sub) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  const tokenHash = sha256Hex(refreshToken.trim());
  const { rows } = await pool.query(
    `SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()`,
    [tokenHash, payload.sub]
  );
  if (rows.length === 0) {
    throw AppError.unauthorized('Refresh token revoked or expired');
  }

  const userResult = await pool.query(
    `SELECT id, email, role, created_at FROM users WHERE id = $1`,
    [payload.sub]
  );
  if (userResult.rows.length === 0) {
    throw AppError.unauthorized('User no longer exists');
  }
  const user = userResult.rows[0];
  const accessToken = issueAccessToken(user);
  return { accessToken, user: { id: user.id, email: user.email, role: user.role } };
}

async function logout({ refreshToken }) {
  assertJwtSecrets();
  const pool = assertDb();
  if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
    throw AppError.badRequest('refreshToken is required');
  }
  let payload;
  try {
    payload = jwt.verify(refreshToken.trim(), jwtRefreshSecret);
  } catch {
    throw AppError.unauthorized('Invalid refresh token');
  }
  if (payload.typ !== 'refresh' || !payload.sub) {
    throw AppError.unauthorized('Invalid refresh token');
  }
  const tokenHash = sha256Hex(refreshToken.trim());
  await pool.query(
    `DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2`,
    [tokenHash, payload.sub]
  );
  return { ok: true };
}

async function getProfile(userId) {
  const pool = assertDb();
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, display_name, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );
    if (rows.length === 0) {
      throw AppError.unauthorized('User not found');
    }
    const u = rows[0];
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      display_name: u.display_name || null,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
  } catch (err) {
    if (err.code !== '42703') throw err;
    const { rows } = await pool.query(
      `SELECT id, email, role, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );
    if (rows.length === 0) throw AppError.unauthorized('User not found');
    const u = rows[0];
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      display_name: null,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
  }
}

async function updateProfile(userId, { displayName } = {}) {
  const pool = assertDb();
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name || name.length < 2 || name.length > 80) {
    throw AppError.badRequest('Display name must be 2–80 characters');
  }
  if (!/^[\p{L}\p{N} .'-]+$/u.test(name)) {
    throw AppError.badRequest('Display name contains unsupported characters');
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET display_name = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, email, role, display_name, created_at, updated_at`,
      [userId, name]
    );
    if (!rows[0]) throw AppError.unauthorized('User not found');
    const u = rows[0];
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      display_name: u.display_name,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
  } catch (err) {
    if (err.code === '42703') {
      throw AppError.serviceUnavailable('Run db:migrate to enable profile names');
    }
    throw err;
  }
}

module.exports = {
  register,
  login,
  loginDemo,
  purgeExpiredDemoUsers,
  refresh,
  logout,
  getProfile,
  updateProfile,
};
