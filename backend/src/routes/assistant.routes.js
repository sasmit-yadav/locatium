const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const assistant = require('../controllers/assistant.controller');
const { MAX_BYTES } = require('../services/speech.service');

const router = express.Router();

router.post('/ask', asyncHandler(assistant.ask));
router.get('/metrics', asyncHandler(assistant.metrics));
router.get('/capabilities', asyncHandler(assistant.capabilities));
router.post('/action', asyncHandler(assistant.action));

// Audio arrives as a raw body (MediaRecorder blob), not JSON — needs its own parser.
router.post(
  '/voice',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_BYTES }),
  asyncHandler(assistant.voice)
);

module.exports = router;
