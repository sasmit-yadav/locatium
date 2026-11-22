/**
 * End-to-end tests for real accounts, email lockdown and daily quotas.
 * Needs a disposable PostgreSQL with db/schema.sql applied:
 *   TEST_DATABASE_URL=postgres://... node --test tests/accounts.integration.test.js
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DB = process.env.TEST_DATABASE_URL;

if (!DB) {
  test('accounts integration (skipped: set TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = DB;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);
  process.env.DEMO_MODE = 'true';
  process.env.PUBLIC_APP_URL = 'https://app.example';
  process.env.ASSISTANT_DEMO_DAILY_LIMIT = '2';
  process.env.EMAIL_REPORT_DAILY_LIMIT = '2';
  delete process.env.SMTP_HOST;

  const { createApp } = require('../src/app');
  const { getPool, closePool } = require('../src/db/pool');
  const { OUTBOX_DIR } = require('../src/services/email.service');
  const usageQuota = require('../src/services/usage-quota.service');
  const { runHousekeeping } = require('../src/jobs/housekeeping.job');

  let server;
  let base;

  before(async () => {
    fs.rmSync(OUTBOX_DIR, { recursive: true, force: true });
    await new Promise((resolve) => {
      server = createApp().listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await closePool();
  });

  async function call(method, p, { body, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  function latestOutboxLink(to, kind) {
    const metas = fs
      .readdirSync(OUTBOX_DIR)
      .filter((f) => f.endsWith('-meta.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX_DIR, f), 'utf8')))
      .filter((m) => m.to === to && m.text.includes(`/${kind}?token=`))
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    const m = metas.at(-1);
    if (!m) return null;
    const match = m.text.match(new RegExp(`https://app\\.example/${kind}\\?token=([^\\s]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  const email = `user${Date.now()}@example.com`;
  const password = 'correct horse battery';
  let session;

  test('guest gets a refresh token and a short access token', async () => {
    const r = await call('POST', '/api/auth/demo');
    assert.equal(r.status, 200);
    assert.ok(r.json.refreshToken);
    const payload = JSON.parse(Buffer.from(r.json.accessToken.split('.')[1], 'base64url'));
    assert.ok(payload.exp - payload.iat <= 15 * 60, 'access token lives at most 15 minutes');
    assert.equal(r.json.user.is_demo, true);
    session = r.json;
  });

  test('guest cannot email reports or subscribe to alerts', async () => {
    const r = await call('POST', '/api/investor/email-report', { token: session.accessToken, body: { zoneId: 'x' } });
    assert.equal(r.status, 403);
    const a = await call('POST', '/api/portal/search-alerts', { token: session.accessToken, body: { email: 'victim@example.com' } });
    assert.equal(a.status, 403);
  });

  test('signup requires accepting the terms', async () => {
    const r = await call('POST', '/api/auth/register', { body: { email, password } });
    assert.equal(r.status, 400);
  });

  test('signup upgrades the guest account in place and sends a verify link', async () => {
    const guestId = session.user.id;
    const r = await call('POST', '/api/auth/register', {
      token: session.accessToken,
      body: { email, password, acceptTerms: true, displayName: 'Asha' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.upgradedFromDemo, true);
    assert.equal(r.json.user.id, guestId, 'same user row, so guest data is kept');
    assert.equal(r.json.user.email_verified, false);
    assert.ok(latestOutboxLink(email, 'verify-email'));
    session = r.json;
  });

  test('duplicate email is rejected', async () => {
    const r = await call('POST', '/api/auth/register', { body: { email, password, acceptTerms: true } });
    assert.equal(r.status, 409);
  });

  test('unverified user cannot email reports', async () => {
    const r = await call('POST', '/api/investor/email-report', { token: session.accessToken, body: { zoneId: 'x' } });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /confirm your email/i);
  });

  test('verify link works once', async () => {
    const token = latestOutboxLink(email, 'verify-email');
    const ok = await call('POST', '/api/auth/verify-email', { body: { token } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.email_verified, true);
    const again = await call('POST', '/api/auth/verify-email', { body: { token } });
    assert.equal(again.status, 400);
  });

  test('reports can only go to the account email', async () => {
    const r = await call('POST', '/api/investor/email-report', {
      token: session.accessToken,
      body: { zoneId: 'x', to: 'stranger@example.com' },
    });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /own account email/i);
  });

  test('alerts are forced to the account email', async () => {
    const r = await call('POST', '/api/portal/search-alerts', {
      token: session.accessToken,
      body: { email: 'stranger@example.com', minScoreDelta: 5 },
    });
    assert.equal(r.status < 300, true, JSON.stringify(r.json));
    assert.equal(r.json.email, email);
  });

  test('email-report daily quota stops at the limit', async () => {
    const user = { id: session.user.id, email, role: 'investor' };
    await usageQuota.consume('email_report', user);
    await usageQuota.consume('email_report', user);
    await assert.rejects(() => usageQuota.consume('email_report', user), (e) => e.statusCode === 429);
  });

  test('assistant quota returns a friendly 429 for guests', async () => {
    const guest = (await call('POST', '/api/auth/demo')).json;
    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await call('POST', '/api/assistant/ask', { token: guest.accessToken, body: { query: 'hello' } });
      statuses.push(r.status);
      if (i === 2) {
        assert.equal(r.json.code, 'DAILY_LIMIT');
        assert.ok(r.json.errorHi);
      }
    }
    assert.notEqual(statuses[0], 429);
    assert.notEqual(statuses[1], 429);
    assert.equal(statuses[2], 429);
  });

  test('refresh issues a new access token', async () => {
    const r = await call('POST', '/api/auth/refresh', { body: { refreshToken: session.refreshToken } });
    assert.equal(r.status, 200);
    assert.ok(r.json.accessToken);
    assert.equal(r.json.user.email, email);
  });

  test('forgot-password gives the same answer for unknown emails', async () => {
    const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'nobody@example.com' } });
    const known = await call('POST', '/api/auth/forgot-password', { body: { email } });
    assert.equal(unknown.status, 200);
    assert.equal(known.status, 200);
    assert.equal(unknown.json.message, known.json.message);
  });

  test('a second reset request within a minute does not mint a new link', async () => {
    const { rows: before1 } = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_tokens WHERE purpose = 'reset_password'`
    );
    await call('POST', '/api/auth/forgot-password', { body: { email } });
    const { rows: after1 } = await getPool().query(
      `SELECT count(*)::int AS n FROM auth_tokens WHERE purpose = 'reset_password'`
    );
    assert.equal(after1[0].n, before1[0].n);
  });

  const newPassword = 'another long passphrase';
  test('reset password signs out every device', async () => {
    const token = latestOutboxLink(email, 'reset-password');
    assert.ok(token);
    const r = await call('POST', '/api/auth/reset-password', { body: { token, password: newPassword } });
    assert.equal(r.status, 200);
    const old = await call('POST', '/api/auth/refresh', { body: { refreshToken: session.refreshToken } });
    assert.equal(old.status, 401);
    const reuse = await call('POST', '/api/auth/reset-password', { body: { token, password: 'yet another passphrase' } });
    assert.equal(reuse.status, 400);
    const badLogin = await call('POST', '/api/auth/login', { body: { email, password } });
    assert.equal(badLogin.status, 401);
    const login = await call('POST', '/api/auth/login', { body: { email, password: newPassword } });
    assert.equal(login.status, 200);
    session = login.json;
  });

  test('change password needs the current one and revokes old sessions', async () => {
    const wrong = await call('POST', '/api/auth/change-password', {
      token: session.accessToken,
      body: { currentPassword: 'nope', newPassword: 'third long passphrase' },
    });
    assert.equal(wrong.status, 400);
    const ok = await call('POST', '/api/auth/change-password', {
      token: session.accessToken,
      body: { currentPassword: newPassword, newPassword: 'third long passphrase' },
    });
    assert.equal(ok.status, 200);
    const old = await call('POST', '/api/auth/refresh', { body: { refreshToken: session.refreshToken } });
    assert.equal(old.status, 401);
    session = ok.json;
  });

  test('delete account needs the password and removes everything', async () => {
    const wrong = await call('DELETE', '/api/auth/account', { token: session.accessToken, body: { password: 'nope' } });
    assert.equal(wrong.status, 400);
    const ok = await call('DELETE', '/api/auth/account', {
      token: session.accessToken,
      body: { password: 'third long passphrase' },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const { rows } = await getPool().query(`SELECT count(*)::int AS n FROM users WHERE email = $1`, [email]);
    assert.equal(rows[0].n, 0);
    const alerts = await getPool().query(`SELECT count(*)::int AS n FROM investor_search_alerts WHERE email = $1`, [email]);
    assert.equal(alerts.rows[0].n, 0);
    const login = await call('POST', '/api/auth/login', { body: { email, password: 'third long passphrase' } });
    assert.equal(login.status, 401);
  });

  test('housekeeping runs against the real schema', async () => {
    const r = await runHousekeeping();
    assert.equal(typeof r.files, 'number');
  });
}
