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
  appPublicUrl,
  passwordMinLength,
} = require('../config');
const emailService = require('./email.service');
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
  // bcrypt ignores everything after 72 bytes; refuse rather than silently truncate.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw AppError.badRequest('Password must be at most 72 bytes');
  }
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    display_name: u.display_name || null,
    email_verified: Boolean(u.email_verified_at),
    is_demo: isDemoEmail(u.email),
    created_at: u.created_at,
  };
}

function isDemoEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

function registrationOpen() {
  return process.env.ALLOW_PUBLIC_REGISTRATION !== 'false';
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

function issueRefreshToken(userId, expiresIn = jwtRefreshExpires) {
  return jwt.sign(
    // jti makes two tokens issued in the same second distinct (token_hash lookups).
    { sub: userId, typ: 'refresh', jti: crypto.randomBytes(8).toString('hex') },
    jwtRefreshSecret,
    { expiresIn }
  );
}

async function issueSession(db, user) {
  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user.id);
  await persistRefreshToken(db, user.id, refreshToken);
  return { user: publicUser(user), accessToken, refreshToken };
}

// ── One-time tokens (verify email, reset password) ──────────────────────────
const TOKEN_TTL_MIN = { verify_email: 24 * 60, reset_password: 30 };
const TOKEN_RESEND_COOLDOWN_SEC = 60;

async function createOneTimeToken(db, userId, purpose) {
  const recent = await db.query(
    `SELECT 1 FROM auth_tokens
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
       AND created_at > now() - make_interval(secs => $3)
     LIMIT 1`,
    [userId, purpose, TOKEN_RESEND_COOLDOWN_SEC]
  );
  if (recent.rows.length) return null; // throttled: a fresh link was just sent
  // Only the newest link of each kind works.
  await db.query(
    `UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
  const raw = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, sha256Hex(raw), TOKEN_TTL_MIN[purpose]]
  );
  return raw;
}

async function consumeOneTimeToken(db, rawToken, purpose) {
  if (typeof rawToken !== 'string' || rawToken.trim().length < 20) {
    throw AppError.badRequest('This link is invalid or has expired');
  }
  const { rows } = await db.query(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [sha256Hex(rawToken.trim()), purpose]
  );
  if (!rows[0]) throw AppError.badRequest('This link is invalid or has expired');
  return rows[0].user_id;
}

async function sendVerificationEmail(db, user) {
  const raw = await createOneTimeToken(db, user.id, 'verify_email');
  if (!raw) return { sent: false, throttled: true };
  const link = `${appPublicUrl}/verify-email?token=${encodeURIComponent(raw)}`;
  await emailService.sendEmail({
    to: user.email,
    subject: 'Confirm your LOCATIUM email / अपना ईमेल पुष्टि करें',
    text: [
      'Welcome to LOCATIUM.',
      '',
      'Please confirm your email address by opening this link (valid for 24 hours):',
      link,
      '',
      'LOCATIUM में आपका स्वागत है। अपना ईमेल पुष्टि करने के लिए ऊपर दिया गया लिंक खोलें (24 घंटे के लिए मान्य)।',
      '',
      "If you didn't create this account, you can ignore this email.",
    ].join('\n'),
  });
  return { sent: true };
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

/**
 * Creates a real account. If the caller is currently using an isolated demo account, that
 * account is upgraded in place, so everything they saved as a guest is kept.
 */
async function register({ email, password, acceptTerms, displayName } = {}, { currentUser } = {}) {
  if (!registrationOpen()) {
    throw AppError.forbidden('New sign-ups are closed right now');
  }
  assertJwtSecrets();
  const pool = assertDb();
  const emailNorm = validateEmail(email);
  if (isDemoEmail(emailNorm)) throw AppError.badRequest('Please use your own email address');
  validatePassword(password);
  if (acceptTerms !== true) {
    throw AppError.badRequest('Please accept the Terms of Use and Privacy Policy');
  }
  const name = typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 80) : null;

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let user;
    if (currentUser?.id && isDemoEmail(currentUser.email)) {
      const { rows } = await client.query(
        `UPDATE users
         SET email = $2, password_hash = $3, display_name = $4, terms_accepted_at = now(), updated_at = now()
         WHERE id = $1 AND email LIKE $5
         RETURNING id, email, role, display_name, email_verified_at, created_at`,
        [currentUser.id, emailNorm, passwordHash, name, DEMO_EMAIL_PATTERN]
      );
      user = rows[0];
      // Old demo refresh tokens expire with the demo TTL; replace them with normal ones.
      if (user) await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [user.id]);
    }
    if (!user) {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, role, display_name, terms_accepted_at)
         VALUES ($1, $2, 'investor', $3, now())
         RETURNING id, email, role, display_name, email_verified_at, created_at`,
        [emailNorm, passwordHash, name]
      );
      user = rows[0];
    }
    const session = await issueSession(client, user);
    await client.query('COMMIT');
    await sendVerificationEmail(pool, user).catch((err) =>
      console.warn('[auth] verification email failed:', err.message)
    );
    return { ...session, upgradedFromDemo: Boolean(currentUser?.id && isDemoEmail(currentUser.email)) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw err;
  } finally {
    client.release();
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
    `SELECT id, email, password_hash, role, display_name, email_verified_at, created_at
     FROM users WHERE email = $1`,
    [emailNorm]
  );
  // Compare against a dummy hash when the email is unknown, so response time does not
  // reveal which emails have accounts.
  const user = rows[0];
  const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !match) {
    throw AppError.unauthorized('Invalid email or password');
  }
  return issueSession(pool, user);
}

const DUMMY_HASH = bcrypt.hashSync('locatium-timing-equaliser', BCRYPT_ROUNDS);

async function verifyEmail({ token } = {}) {
  const pool = assertDb();
  const userId = await consumeOneTimeToken(pool, token, 'verify_email');
  const { rows } = await pool.query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
     WHERE id = $1
     RETURNING id, email, role, display_name, email_verified_at, created_at`,
    [userId]
  );
  if (!rows[0]) throw AppError.badRequest('This link is invalid or has expired');
  return { ok: true, user: publicUser(rows[0]) };
}

async function resendVerification(userId) {
  const pool = assertDb();
  const { rows } = await pool.query(
    `SELECT id, email, email_verified_at FROM users WHERE id = $1`,
    [userId]
  );
  const user = rows[0];
  if (!user) throw AppError.unauthorized('User not found');
  if (isDemoEmail(user.email)) throw AppError.badRequest('Create an account first');
  if (user.email_verified_at) return { ok: true, alreadyVerified: true };
  const r = await sendVerificationEmail(pool, user);
  return { ok: true, sent: r.sent, throttled: Boolean(r.throttled) };
}

/** Always answers the same way, so it cannot be used to find out who has an account. */
async function forgotPassword({ email } = {}) {
  const pool = assertDb();
  const emailNorm = validateEmail(email);
  const generic = {
    ok: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  };
  if (isDemoEmail(emailNorm)) return generic;
  const { rows } = await pool.query(`SELECT id, email FROM users WHERE email = $1`, [emailNorm]);
  const user = rows[0];
  if (!user) return generic;
  const raw = await createOneTimeToken(pool, user.id, 'reset_password');
  if (!raw) return generic;
  const link = `${appPublicUrl}/reset-password?token=${encodeURIComponent(raw)}`;
  await emailService
    .sendEmail({
      to: user.email,
      subject: 'Reset your LOCATIUM password / पासवर्ड रीसेट करें',
      text: [
        'Someone (hopefully you) asked to reset your LOCATIUM password.',
        '',
        'Open this link to choose a new password (valid for 30 minutes):',
        link,
        '',
        'अपना नया पासवर्ड चुनने के लिए ऊपर दिया गया लिंक खोलें (30 मिनट के लिए मान्य)।',
        '',
        "If you didn't ask for this, ignore this email — your password stays the same.",
      ].join('\n'),
    })
    .catch((err) => console.warn('[auth] reset email failed:', err.message));
  return generic;
}

/** Sets a new password and signs out every device. */
async function resetPassword({ token, password } = {}) {
  const pool = assertDb();
  validatePassword(password);
  const userId = await consumeOneTimeToken(pool, token, 'reset_password');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Opening the reset link proves the user controls the inbox, so it also verifies it.
  await pool.query(
    `UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
     WHERE id = $1`,
    [userId, passwordHash]
  );
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
  return { ok: true, message: 'Password changed. Please sign in with your new password.' };
}

async function loadUserWithHash(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, role, display_name, email_verified_at, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) throw AppError.unauthorized('User not found');
  return rows[0];
}

/** Changes the password, signs out every other device and returns a fresh session. */
async function changePassword(userId, { currentPassword, newPassword } = {}) {
  const pool = assertDb();
  const user = await loadUserWithHash(pool, userId);
  if (isDemoEmail(user.email)) throw AppError.badRequest('Create an account first');
  if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw AppError.badRequest('Current password is incorrect');
  }
  validatePassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
    userId,
    passwordHash,
  ]);
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
  return issueSession(pool, user);
}

/**
 * Permanently deletes the account and everything it owns (every user table cascades;
 * audit log rows keep the action but lose the user link).
 */
async function deleteAccount(userId, { password } = {}) {
  const pool = assertDb();
  const user = await loadUserWithHash(pool, userId);
  if (user.role === 'admin') {
    throw AppError.forbidden('Admin accounts must be removed by another admin');
  }
  if (!isDemoEmail(user.email)) {
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
      throw AppError.badRequest('Password is incorrect');
    }
  }
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  return { ok: true, deleted: true };
}

async function loginDemo() {
  if (process.env.DEMO_MODE !== 'true') {
    throw AppError.notFound('Demo login is not enabled');
  }

  assertJwtSecrets();
  const pool = assertDb();

  if (demoIsolated()) {
    const user = await createIsolatedDemoUser(pool);
    // Short access token + a refresh token that lives exactly as long as the demo account.
    const refreshToken = issueRefreshToken(user.id, `${demoTtlDays()}d`);
    await persistRefreshToken(pool, user.id, refreshToken);
    return {
      user: publicUser(user),
      accessToken: issueAccessToken(user),
      refreshToken,
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
    `SELECT id, email, role, display_name, email_verified_at, created_at FROM users WHERE id = $1`,
    [payload.sub]
  );
  if (userResult.rows.length === 0) {
    throw AppError.unauthorized('User no longer exists');
  }
  const user = userResult.rows[0];
  const accessToken = issueAccessToken(user);
  return { accessToken, user: publicUser(user) };
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
  const { rows } = await pool.query(
    `SELECT id, email, role, display_name, email_verified_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) {
    throw AppError.unauthorized('User not found');
  }
  return { ...publicUser(rows[0]), updated_at: rows[0].updated_at };
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
       RETURNING id, email, role, display_name, email_verified_at, created_at, updated_at`,
      [userId, name]
    );
    if (!rows[0]) throw AppError.unauthorized('User not found');
    return { ...publicUser(rows[0]), updated_at: rows[0].updated_at };
  } catch (err) {
    if (err.code === '42703') {
      throw AppError.serviceUnavailable('Run db:migrate to enable profile names');
    }
    throw err;
  }
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  deleteAccount,
  isDemoEmail,
  registrationOpen,
  login,
  loginDemo,
  purgeExpiredDemoUsers,
  refresh,
  logout,
  getProfile,
  updateProfile,
};
