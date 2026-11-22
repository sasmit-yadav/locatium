const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../middleware/async-handler');
const auth = require('../controllers/auth.controller');
const { authenticate, optionalAuthenticate } = require('../middleware/auth.middleware');

const router = Router();

/** Emails cost money and can be abused: a tight per-IP cap on routes that send one. */
const emailSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many email requests. Please wait a few minutes and try again.' },
});

router.get('/config', asyncHandler(auth.config));
router.post('/register', emailSendLimiter, optionalAuthenticate, asyncHandler(auth.register));
router.post('/login', asyncHandler(auth.login));
router.post('/demo', asyncHandler(auth.demo));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', asyncHandler(auth.logout));
router.post('/verify-email', asyncHandler(auth.verifyEmail));
router.post('/resend-verification', emailSendLimiter, authenticate, asyncHandler(auth.resendVerification));
router.post('/forgot-password', emailSendLimiter, asyncHandler(auth.forgotPassword));
router.post('/reset-password', asyncHandler(auth.resetPassword));
router.post('/change-password', authenticate, asyncHandler(auth.changePassword));
router.delete('/account', authenticate, asyncHandler(auth.deleteAccount));
router.get('/profile', authenticate, asyncHandler(auth.profile));
router.put('/profile', authenticate, asyncHandler(auth.updateProfile));

module.exports = router;
