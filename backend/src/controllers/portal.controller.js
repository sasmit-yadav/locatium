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

async function listPipeline(req, res) {
  const userId = req.user.id;
  const items = await portalService.listPipeline(userId);
  res.json({ count: items.length, stages: portalService.PIPELINE_STAGES, items });
}

async function upsertPipelineItem(req, res) {
  const userId = req.user.id;
  const { zoneId, stage, notes } = req.body || {};
  const item = await portalService.upsertPipelineItem(userId, zoneId, stage, notes);
  res.status(201).json(item);
}

async function deletePipelineItem(req, res) {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await portalService.deletePipelineItem(userId, id);
  res.json(result);
}

async function listPortfolios(req, res) {
  const items = await portalService.listPortfolios(req.user.id);
  res.json({ count: items.length, portfolios: items });
}

async function upsertPortfolio(req, res) {
  const item = await portalService.upsertPortfolio(req.user.id, req.body || {});
  res.status(201).json(item);
}

async function subscribeSearchAlert(req, res) {
  const result = await portalService.subscribeSearchAlert(req.user.id, req.body || {});
  res.status(201).json(result);
}

async function listSearchAlerts(req, res) {
  const alerts = await portalService.listSearchAlerts(req.user.id);
  res.json({ count: alerts.length, alerts });
}

async function deleteSearchAlert(req, res) {
  const result = await portalService.deleteSearchAlert(req.user.id, req.params.id);
  res.json(result);
}

async function deletePortfolio(req, res) {
  const result = await portalService.deletePortfolio(req.user.id, req.params.id);
  res.json(result);
}

async function getSharedPortfolio(req, res) {
  const portfolio = await portalService.getPortfolioByShareToken(req.params.token);
  res.json(portfolio);
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
  listPipeline,
  upsertPipelineItem,
  deletePipelineItem,
  listPortfolios,
  upsertPortfolio,
  deletePortfolio,
  getSharedPortfolio,
  subscribeSearchAlert,
  listSearchAlerts,
  deleteSearchAlert,
};
