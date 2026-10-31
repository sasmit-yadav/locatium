/**
 * Verification script to test Investmap setup
 * Run with: node backend/scripts/verify-setup.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const CHECKS = [];
let allPassed = true;

function check(name, passed, details = '') {
  CHECKS.push({ name, passed, details });
  if (!passed) allPassed = false;
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}${details ? ` - ${details}` : ''}`);
}

async function verifyDatabase() {
  console.log('\n🔍 Checking Database Connection...\n');
  
  const databaseUrl = process.env.DATABASE_URL;
  check('DATABASE_URL is set', !!databaseUrl, databaseUrl ? 'Present' : 'Missing');
  
  if (!databaseUrl) {
    console.log('\n⚠️  Cannot test database without DATABASE_URL');
    return false;
  }
  
  // Check URL format
  const urlPattern = /^postgresql:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+$/;
  check('DATABASE_URL format', urlPattern.test(databaseUrl), 'Should be postgresql://user:pass@host:port/db');
  
  let pool;
  try {
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query('SELECT 1');
    check('Database connection', true, 'Connected successfully');
    
    // Check PostGIS
    try {
      const result = await pool.query('SELECT PostGIS_Version()');
      check('PostGIS extension', true, result.rows[0].postgis_version);
    } catch (err) {
      check('PostGIS extension', false, 'Not installed - run: CREATE EXTENSION postgis');
    }
    
    // Check required tables
    const requiredTables = ['users', 'refresh_tokens', 'audit_logs', 'features'];
    for (const table of requiredTables) {
      try {
        await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
        check(`Table: ${table}`, true);
      } catch (err) {
        if (err.code === '42P01') {
          check(`Table: ${table}`, false, 'Missing - run: npm run db:migrate');
        } else {
          check(`Table: ${table}`, true, 'Exists (error during check: ' + err.message + ')');
        }
      }
    }
    
    return true;
  } catch (err) {
    check('Database connection', false, err.message);
    return false;
  } finally {
    if (pool) await pool.end();
  }
}

function verifyBackendConfig() {
  console.log('\n🔍 Checking Backend Configuration...\n');
  
  check('PORT is set', !!process.env.PORT, `Port: ${process.env.PORT || 'not set'}`);
  check('JWT_ACCESS_SECRET is set', !!process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_SECRET ? 'Present (keep secret!)' : 'Missing');
  check('JWT_REFRESH_SECRET is set', !!process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_SECRET ? 'Present (keep secret!)' : 'Missing');
  
  // Check JWT secret length
  const accessLen = process.env.JWT_ACCESS_SECRET?.length || 0;
  check('JWT_ACCESS_SECRET length', accessLen >= 32, `Length: ${accessLen} (min 32 recommended)`);
  
  const refreshLen = process.env.JWT_REFRESH_SECRET?.length || 0;
  check('JWT_REFRESH_SECRET length', refreshLen >= 32, `Length: ${refreshLen} (min 32 recommended)`);
  
  // Check if secrets are different
  check('JWT secrets are different', 
    process.env.JWT_ACCESS_SECRET !== process.env.JWT_REFRESH_SECRET,
    'Should be different values');
  
  // HARSAC MapServer config (optional for the current core product)
  // The UI uses cached PostGIS-backed `/api/tiles` by default. HARSAC credentials are only needed for the optional ArcGIS proxy features.
  const hasToken = !!process.env.MAP_SERVER_TOKEN;
  const hasCredentials = !!process.env.MAP_SERVER_USERNAME && !!process.env.MAP_SERVER_PASSWORD;
  check(
    'HARSAC MapServer configured (optional)',
    true,
    hasToken ? 'Token configured (optional)' : hasCredentials ? 'Credentials configured (optional)' : 'Not configured — core tiles use PostGIS'
  );
  
  // Redis (optional)
  const redisUrl = process.env.REDIS_URL;
  check(
    'Redis configured (optional)',
    true,
    redisUrl ? 'Enabled (tile/query cache)' : 'Disabled (optional — core tiles still work)'
  );

  // ML service (optional — scoring falls back to heuristic when unavailable)
  const mlUrl = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
  check('ML_SERVICE_URL configured (optional)', true, mlUrl);
}

function verifyFrontendConfig() {
  console.log('\n🔍 Checking Frontend Configuration...\n');
  
  const frontendEnvPath = require('path').join(__dirname, '..', '..', 'frontend', '.env');
  let frontendEnv;
  try {
    const fs = require('fs');
    const envContent = fs.readFileSync(frontendEnvPath, 'utf8');
    const viteApiUrl = envContent.match(/VITE_API_URL=(.+)/)?.[1];
    check('Frontend .env exists', true, 'Found');
    check('VITE_API_URL is set', !!viteApiUrl, viteApiUrl || 'Missing');
    
    if (viteApiUrl && process.env.PORT) {
      const expectedUrl = `http://localhost:${process.env.PORT}`;
      check('Frontend/Backend ports match', 
        viteApiUrl === expectedUrl, 
        `Frontend: ${viteApiUrl}, Backend: ${expectedUrl}`);
    }
  } catch (err) {
    check('Frontend .env exists', false, 'Create frontend/.env with VITE_API_URL');
  }
}

async function verifyServices() {
  console.log('\n🔍 Checking Service Availability...\n');
  
  // Check if backend port is available
  const net = require('net');
  const port = process.env.PORT || 3001;
  
  const isPortAvailable = await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
  
  // If the port is in use, confirm it's our API by checking /api/health.
  let isOurApi = false;
  if (!isPortAvailable) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000);
      const r = await fetch(`http://localhost:${port}/api/health`, { signal: controller.signal });
      clearTimeout(t);
      isOurApi = r.ok;
    } catch {
      isOurApi = false;
    }
  }

  const backendOk = isPortAvailable || isOurApi;
  check(
    `Backend port ${port} ready`,
    backendOk,
    backendOk ? (isPortAvailable ? 'Port free' : 'API already running') : 'Port in use but API not responding to /api/health'
  );
  
  // Check if frontend port is available
  const frontendPort = 5173;
  const isFrontendPortAvailable = await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(frontendPort);
  });
  
  // If frontend port is taken, treat it as OK if something responds.
  let frontendResponds = false;
  if (!isFrontendPortAvailable) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000);
      const r = await fetch(`http://localhost:${frontendPort}/`, { signal: controller.signal });
      clearTimeout(t);
      frontendResponds = r.ok || r.status === 404;
    } catch {
      frontendResponds = false;
    }
  }

  const frontendOk = isFrontendPortAvailable || frontendResponds;
  check(
    `Frontend port ${frontendPort} ready`,
    frontendOk,
    frontendOk ? (isFrontendPortAvailable ? 'Port free' : 'Something is already serving') : 'Port in use but no server responding'
  );

  const mlUrl = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
  let mlOk = false;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const [healthRes, versionRes] = await Promise.all([
      fetch(`${mlUrl}/health`, { signal: controller.signal }),
      fetch(`${mlUrl}/version`, { signal: controller.signal }),
    ]);
    clearTimeout(t);
    const healthBody = await healthRes.json().catch(() => ({}));
    const versionBody = await versionRes.json().catch(() => ({}));
    mlOk = healthRes.ok && healthBody.status === 'ok' && versionRes.ok && versionBody.service === 'locatium-ml';
  } catch {
    mlOk = false;
  }
  check(
    'ML service reachable (optional)',
    true,
    mlOk ? 'locatium-ml responding' : 'Not running — scoring uses heuristic fallback'
  );
}

async function runVerification() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         INVESTMAP SETUP VERIFICATION                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  await verifyDatabase();
  verifyBackendConfig();
  verifyFrontendConfig();
  await verifyServices();
  
  console.log('\n' + '═'.repeat(58));
  console.log('SUMMARY');
  console.log('═'.repeat(58));
  
  const passed = CHECKS.filter(c => c.passed).length;
  const failed = CHECKS.filter(c => !c.passed).length;
  
  console.log(`Total checks: ${CHECKS.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All checks passed! Your setup looks good.');
    console.log('\nNext steps:');
    console.log('  1. cd backend && npm run dev');
    console.log('  2. cd frontend && npm run dev');
    console.log('  3. Open http://localhost:5173');
  } else {
    console.log('\n⚠️  Some checks failed. Please fix the issues above.');
    console.log('See SETUP_GUIDE.md for detailed instructions.');
  }
  
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});