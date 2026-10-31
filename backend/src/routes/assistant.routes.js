const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const assistant = require('../controllers/assistant.controller');
const { MAX_BYTES } = require('../services/speech.service');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/ask', authenticate, asyncHandler(assistant.ask));
// Token spend, model ids and failure rates are operator data, not investor data.
router.get('/metrics', authenticate, requireRole('admin'), asyncHandler(assistant.metrics));
router.get('/capabilities', asyncHandler(assistant.capabilities));
router.post('/action', authenticate, asyncHandler(assistant.action));
router.get('/memory', authenticate, asyncHandler(assistant.getMemory));
router.put('/memory', authenticate, asyncHandler(assistant.saveMemory));
router.delete('/memory', authenticate, asyncHandler(assistant.clearMemory));

// Audio arrives as a raw body (MediaRecorder blob), not JSON — needs its own parser.
router.post(
  '/voice',
  authenticate,
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_BYTES }),
  asyncHandler(assistant.voice)
);

module.exports = router;
