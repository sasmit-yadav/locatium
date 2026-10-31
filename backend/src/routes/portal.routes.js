const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const portal = require('../controllers/portal.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

// Saved Searches (Authenticated)
router.get('/saved-searches', authenticate, asyncHandler(portal.listSearches));
router.post('/saved-searches', authenticate, asyncHandler(portal.saveSearch));
router.delete('/saved-searches/:id', authenticate, asyncHandler(portal.deleteSearch));

// Favorites/Bookmarks (Authenticated)
router.get('/favorites', authenticate, asyncHandler(portal.listFavorites));
router.post('/favorites', authenticate, asyncHandler(portal.addFavorite));
router.put('/favorites/:id', authenticate, asyncHandler(portal.updateFavoriteNotes));
router.delete('/favorites/:id', authenticate, asyncHandler(portal.deleteFavorite));

// Shared Snapshots (Public)
router.post('/share', authenticate, asyncHandler(portal.createSnapshot));
router.get('/share/:token', asyncHandler(portal.getSnapshot));

// Analysis History (Authenticated)
router.get('/history', authenticate, asyncHandler(portal.listAnalysisHistory));
router.post('/history', authenticate, asyncHandler(portal.recordAnalysis));
router.delete('/history', authenticate, asyncHandler(portal.clearAnalysisHistory));

// Workspace Stats (Authenticated)
router.get('/stats', authenticate, asyncHandler(portal.getStats));

// Investor pipeline (Authenticated)
router.get('/pipeline', authenticate, asyncHandler(portal.listPipeline));
router.post('/pipeline', authenticate, asyncHandler(portal.upsertPipelineItem));
router.delete('/pipeline/:id', authenticate, asyncHandler(portal.deletePipelineItem));

router.get('/portfolios', authenticate, asyncHandler(portal.listPortfolios));
router.post('/portfolios', authenticate, asyncHandler(portal.upsertPortfolio));
router.delete('/portfolios/:id', authenticate, asyncHandler(portal.deletePortfolio));
router.get('/portfolios/share/:token', asyncHandler(portal.getSharedPortfolio));

router.get('/search-alerts', authenticate, asyncHandler(portal.listSearchAlerts));
router.post('/search-alerts', authenticate, asyncHandler(portal.subscribeSearchAlert));
router.delete('/search-alerts/:id', authenticate, asyncHandler(portal.deleteSearchAlert));

router.get('/notifications', authenticate, asyncHandler(portal.listNotifications));

module.exports = router;
