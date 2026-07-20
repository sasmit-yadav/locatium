const portalService = require('../services/portal.service');

// === SAVED SEARCHES ===

async function saveSearch(req, res) {
  const userId = req.user.id;
  const { name, filters } = req.body || {};
  const search = await portalService.saveSearch(userId, name, filters);
  res.status(201).json(search);
}

async function listSearches(req, res) {
  const userId = req.user.id;
  const searches = await portalService.listSearches(userId);
  res.json({ count: searches.length, searches });
}

async function deleteSearch(req, res) {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await portalService.deleteSearch(userId, id);
  res.json(result);
}

// === FAVORITES / BOOKMARKS ===

async function addFavorite(req, res) {
  const userId = req.user.id;
  const { zoneId, notes } = req.body || {};
  const fav = await portalService.addFavorite(userId, zoneId, notes);
  res.status(201).json(fav);
}

async function listFavorites(req, res) {
  const userId = req.user.id;
  const favorites = await portalService.listFavorites(userId);
  res.json({ count: favorites.length, favorites });
}

async function updateFavoriteNotes(req, res) {
  const userId = req.user.id;
  const { id } = req.params;
  const { notes } = req.body || {};
  const fav = await portalService.updateFavoriteNotes(userId, id, notes);
  res.json(fav);
}

async function deleteFavorite(req, res) {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await portalService.deleteFavorite(userId, id);
  res.json(result);
}

// === SHARED SNAPSHOTS ===

async function createSnapshot(req, res) {
  const { centerLng, centerLat, zoom, activeLayers, selectedZoneId } = req.body || {};
  const snapshot = await portalService.createSnapshot(centerLng, centerLat, zoom, activeLayers, selectedZoneId);
  res.status(201).json(snapshot);
}

async function getSnapshot(req, res) {
  const { token } = req.params;
  const snapshot = await portalService.getSnapshotByToken(token);
  res.json(snapshot);
}

// === ANALYSIS HISTORY ===

async function recordAnalysis(req, res) {
  const userId = req.user.id;
  const entry = await portalService.recordAnalysis(userId, req.body || {});
  res.status(201).json(entry);
}

async function listAnalysisHistory(req, res) {
  const userId = req.user.id;
  const history = await portalService.listAnalysisHistory(userId);
  res.json({ count: history.length, history });
}

async function clearAnalysisHistory(req, res) {
  const userId = req.user.id;
  const result = await portalService.clearAnalysisHistory(userId);
  res.json(result);
}

// === WORKSPACE STATS ===

async function getStats(req, res) {
  const userId = req.user.id;
  const stats = await portalService.getWorkspaceStats(userId);
  res.json(stats);
}

module.exports = {
  saveSearch,
  listSearches,
  deleteSearch,
  addFavorite,
  listFavorites,
  updateFavoriteNotes,
  deleteFavorite,
  createSnapshot,
  getSnapshot,
  recordAnalysis,
  listAnalysisHistory,
  clearAnalysisHistory,
  getStats,
};
