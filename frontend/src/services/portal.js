import { getMapsApiOrigin } from '../config/api';
import { authFetch } from './auth';

async function parseJsonResponse(res, fallbackMessage) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `${fallbackMessage} (${res.status})`);
  }
  return json;
}

// === SAVED SEARCHES ===

export async function saveSearch(name, filters) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/saved-searches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, filters }),
  });
  return parseJsonResponse(res, 'Failed to save search');
}

export async function listSearches() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/saved-searches`);
  const data = await parseJsonResponse(res, 'Failed to list saved searches');
  return data.searches || [];
}

export async function deleteSearch(id) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/saved-searches/${id}`, {
    method: 'DELETE',
  });
  return parseJsonResponse(res, 'Failed to delete saved search');
}

// === FAVORITES / BOOKMARKS ===

export async function addFavorite(zoneId, notes) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zoneId, notes }),
  });
  return parseJsonResponse(res, 'Failed to bookmark zone');
}

export async function listFavorites() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/favorites`);
  const data = await parseJsonResponse(res, 'Failed to list favorites');
  return data.favorites || [];
}

export async function updateFavoriteNotes(id, notes) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/favorites/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  return parseJsonResponse(res, 'Failed to update favorite notes');
}

export async function deleteFavorite(id) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/favorites/${id}`, {
    method: 'DELETE',
  });
  return parseJsonResponse(res, 'Failed to remove favorite');
}

// === SHARED SNAPSHOTS ===

export async function createSnapshot({ centerLng, centerLat, zoom, activeLayers, selectedZoneId }) {
  const origin = getMapsApiOrigin();
  const res = await fetch(`${origin}/api/portal/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ centerLng, centerLat, zoom, activeLayers, selectedZoneId }),
  });
  return parseJsonResponse(res, 'Failed to generate share link');
}

export async function getSnapshot(token) {
  const origin = getMapsApiOrigin();
  const res = await fetch(`${origin}/api/portal/share/${token}`);
  return parseJsonResponse(res, 'Failed to resolve shared link');
}

// === ANALYSIS HISTORY ===

export async function recordAnalysis(entry) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return parseJsonResponse(res, 'Failed to record analysis');
}

export async function listAnalysisHistory() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/history`);
  const data = await parseJsonResponse(res, 'Failed to list analysis history');
  return data.history || [];
}

export async function clearAnalysisHistory() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/history`, { method: 'DELETE' });
  return parseJsonResponse(res, 'Failed to clear analysis history');
}

// === WORKSPACE STATS ===

export async function getWorkspaceStats() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/stats`);
  return parseJsonResponse(res, 'Failed to load workspace stats');
}

// === INVESTOR PIPELINE ===

export async function getPipelineBoard() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/pipeline`);
  return parseJsonResponse(res, 'Failed to list pipeline');
}

export async function listPipeline() {
  const data = await getPipelineBoard();
  return data.items || [];
}

export async function upsertPipelineItem({ zoneId, stage, notes }) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zoneId, stage, notes }),
  });
  return parseJsonResponse(res, 'Failed to update pipeline');
}

export async function deletePipelineItem(id) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/pipeline/${id}`, { method: 'DELETE' });
  return parseJsonResponse(res, 'Failed to remove pipeline item');
}

export async function listPortfolios() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/portfolios`);
  const data = await parseJsonResponse(res, 'Failed to list portfolios');
  return data.portfolios || [];
}

export async function upsertPortfolio(payload) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/portfolios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, 'Failed to save portfolio');
}

export async function subscribeSearchAlert({ savedSearchId, email, minScoreDelta = 5 }) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/search-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ savedSearchId, email, minScoreDelta }),
  });
  return parseJsonResponse(res, 'Failed to subscribe to alerts');
}

export async function listSearchAlerts() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/search-alerts`);
  const data = await parseJsonResponse(res, 'Failed to list alerts');
  return data.alerts || [];
}

export async function deleteSearchAlert(id) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/search-alerts/${id}`, { method: 'DELETE' });
  return parseJsonResponse(res, 'Failed to delete alert');
}

export async function deletePortfolio(id) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/portal/portfolios/${id}`, { method: 'DELETE' });
  return parseJsonResponse(res, 'Failed to delete portfolio');
}

export async function getSharedPortfolio(token) {
  const origin = getMapsApiOrigin();
  const res = await fetch(`${origin}/api/portal/portfolios/share/${token}`);
  return parseJsonResponse(res, 'Failed to load shared portfolio');
}
