const rateLimit = require('express-rate-limit');
const { mapRateLimitWindowMs, mapRateLimitMax } = require('../config');

/**
 * Limits requests per IP for MapServer proxy routes (README: ~100 req/min per user — anonymous uses IP).
 */
const mapsRateLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: mapRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many map requests, please slow down.' },
});

module.exports = { mapsRateLimiter };
