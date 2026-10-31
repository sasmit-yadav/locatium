/**
 * End-to-end integration test for the Locatium Portal API (Saved Searches, Bookmarks, and Snapshots).
 * Run with: node scripts/test-portal.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const assert = require('assert').strict;
const { Pool } = require('pg');

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

async function runTests() {
  console.log('🚀 Starting portal integration tests...');
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD are required');
  }
  
  // 1. Check if database is ready and backend is running
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ DATABASE_URL is not set in .env');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('❌ Database connection failed. Is PostgreSQL running?', err.message);
    process.exit(1);
  }

  // 2. Authenticate with an explicitly provisioned test user.
  console.log('🔑 Authenticating test user...');
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
  });

  if (!loginRes.ok) {
    console.error('❌ Login failed. Has the database migrations been run?', loginRes.status);
    process.exit(1);
  }
  
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  const authHeader = { 'Authorization': `Bearer ${token}` };
  console.log('✅ Authentication successful!');

  // 3. Fetch a valid zone ID from investor opportunities
  console.log('🔍 Querying active opportunities to get a valid Zone ID...');
  const oppRes = await fetch(`${API_URL}/api/investor/opportunities?sector=industrial&risk=medium&limit=2`, {
    headers: authHeader,
  });
  if (!oppRes.ok) {
    console.error('❌ Failed to fetch opportunities list');
    process.exit(1);
  }
  const oppData = await oppRes.json();
  const opportunities = oppData.opportunities || [];
  if (opportunities.length === 0) {
    console.error('❌ No opportunities found. Seed the sample features first!');
    process.exit(1);
  }
  const sampleZoneId = opportunities[0].id;
  console.log(`✅ Found sample zone ID for testing: ${sampleZoneId}`);

  // 4. Test Saved Searches CRUD
  console.log('💾 Testing Saved Searches CRUD...');
  const testFilters = {
    basemapId: 'dark',
    activeLayers: ['administrative', 'utilities'],
    view: { lat: 28.4595, lng: 77.0266, zoom: 12 }
  };

  // Create
  const createSearchRes = await fetch(`${API_URL}/api/portal/saved-searches`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Integration Test Search', filters: testFilters }),
  });
  assert.equal(createSearchRes.status, 201, 'Create search status should be 201');
  const searchObj = await createSearchRes.json();
  assert.ok(searchObj.id, 'Search should have an ID');
  assert.equal(searchObj.name, 'Integration Test Search');
  assert.deepEqual(searchObj.filters, testFilters);
  console.log('  - Save Search: PASS');

  // List
  const listSearchesRes = await fetch(`${API_URL}/api/portal/saved-searches`, { headers: authHeader });
  assert.equal(listSearchesRes.status, 200);
  const searchesList = await listSearchesRes.json();
  assert.ok(searchesList.searches.length >= 1);
  const foundSearch = searchesList.searches.find(s => s.id === searchObj.id);
  assert.ok(foundSearch, 'Should find the saved search in lists');
  console.log('  - List Searches: PASS');

  // Delete
  const deleteSearchRes = await fetch(`${API_URL}/api/portal/saved-searches/${searchObj.id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.equal(deleteSearchRes.status, 200);
  console.log('  - Delete Search: PASS');

  // 5. Test Bookmarks/Favorites CRUD
  console.log('⭐ Testing Bookmarks/Favorites CRUD...');
  
  // Add Bookmark
  const addFavRes = await fetch(`${API_URL}/api/portal/favorites`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zoneId: sampleZoneId, notes: 'Target industrial corridor logis' }),
  });
  assert.equal(addFavRes.status, 201, 'Bookmark zone status should be 201');
  const favObj = await addFavRes.json();
  assert.ok(favObj.id, 'Favorite should have an ID');
  assert.equal(favObj.zone_id, sampleZoneId);
  assert.equal(favObj.notes, 'Target industrial corridor logis');
  console.log('  - Create Bookmark: PASS');

  // List Bookmarks (with hydration details)
  const listFavRes = await fetch(`${API_URL}/api/portal/favorites`, { headers: authHeader });
  assert.equal(listFavRes.status, 200);
  const favsList = await listFavRes.json();
  assert.ok(favsList.favorites.length >= 1);
  const foundFav = favsList.favorites.find(f => f.id === favObj.id);
  assert.ok(foundFav, 'Bookmark should be returned in list');
  assert.ok(foundFav.zone, 'Bookmark should contain hydrated zone details');
  assert.ok(foundFav.zone.name, 'Bookmark hydrated zone should have a name');
  assert.ok(foundFav.zone.opportunityScore, 'Hydrated zone should have opportunityScore');
  console.log('  - List Bookmarks Hydration: PASS');

  // Update Notes
  const updateFavRes = await fetch(`${API_URL}/api/portal/favorites/${favObj.id}`, {
    method: 'PUT',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Updated target details' }),
  });
  assert.equal(updateFavRes.status, 200);
  const updatedFav = await updateFavRes.json();
  assert.equal(updatedFav.notes, 'Updated target details');
  console.log('  - Update Bookmark Notes: PASS');

  // Delete Bookmark
  const deleteFavRes = await fetch(`${API_URL}/api/portal/favorites/${favObj.id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.equal(deleteFavRes.status, 200);
  console.log('  - Delete Bookmark: PASS');

  // 6. Test Shared Snapshots (authenticated creation, public resolution)
  console.log('🔗 Testing Shared Snapshots Sharing...');
  const snapshotPayload = {
    centerLng: 76.75,
    centerLat: 28.45,
    zoom: 9.5,
    activeLayers: ['administrative', 'transportation'],
    selectedZoneId: sampleZoneId,
  };

  // Create snapshot (Authenticated)
  const shareRes = await fetch(`${API_URL}/api/portal/share`, {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshotPayload),
  });
  assert.equal(shareRes.status, 201, 'Share snapshot should return 201');
  const snapshotObj = await shareRes.json();
  assert.ok(snapshotObj.token, 'Snapshot response should contain a token');
  assert.equal(snapshotObj.centerLng, 76.75);
  assert.equal(snapshotObj.zoom, 9.5);
  console.log('  - Register Shared Snapshot: PASS');

  // Retrieve snapshot (Public)
  const getShareRes = await fetch(`${API_URL}/api/portal/share/${snapshotObj.token}`);
  assert.equal(getShareRes.status, 200, 'Resolve token status should be 200');
  const resolvedObj = await getShareRes.json();
  assert.equal(resolvedObj.token, snapshotObj.token);
  assert.equal(resolvedObj.centerLng, 76.75);
  assert.equal(resolvedObj.selectedZoneId, sampleZoneId);
  console.log('  - Resolve Shared Snapshot: PASS');

  console.log('\n🎉 ALL PORTAL INTEGRATION TESTS PASSED SUCCESSFULLY! ✅');
  await pool.end();
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
