const rateLimit = require('express-rate-limit');
const { mapRateLimitWindowMs, mapRateLimitMax, tileRateLimitMax } = require('../config');

/**
 * Limits requests per IP for map API routes (geocode, identify, layer info, public cards).
 * Mount each limiter on an exact path prefix so a request is counted once, never twice.
 */
const mapsRateLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: mapRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many map requests, please slow down.' },
});

/** Separate, larger budget for tiles so panning the map never blocks "Check this place". */
const tileRateLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: tileRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many map tile requests, please slow down.' },
});

module.exports = { mapsRateLimiter, tileRateLimiter };
