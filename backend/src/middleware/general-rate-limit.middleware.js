const rateLimit = require('express-rate-limit');
const { mapRateLimitWindowMs } = require('../config');

function maxForEnv(devMax, prodMax) {
  return process.env.NODE_ENV === 'production' ? prodMax : devMax;
}

// One limiter instance per "surface" so we don't throttle the whole app equally.
const authLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: maxForEnv(2000, 25),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please slow down.' },
});

const portalLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: maxForEnv(2000, 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many portal requests, please slow down.' },
});

const investorLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  // Report generation is heavy; keep a tighter cap in prod.
  max: maxForEnv(1500, 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many investor requests, please slow down.' },
});

const analysisLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: maxForEnv(1500, 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analysis requests, please slow down.' },
});

const adminLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: maxForEnv(1000, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin requests, please slow down.' },
});

/** LLM / grounding is costlier — tighter fair-use bucket than general analysis. */
const assistantLimiter = rateLimit({
  windowMs: mapRateLimitWindowMs,
  max: maxForEnv(400, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assistant requests, please slow down.' },
});

module.exports = {
  authLimiter,
  portalLimiter,
  investorLimiter,
  analysisLimiter,
  adminLimiter,
  assistantLimiter,
};

