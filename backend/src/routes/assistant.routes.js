const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const assistant = require('../controllers/assistant.controller');

const router = express.Router();

router.post('/ask', asyncHandler(assistant.ask));

module.exports = router;
