const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const auth = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const router = Router();

router.post('/register', asyncHandler(auth.register));
router.post('/login', asyncHandler(auth.login));
router.post('/demo', asyncHandler(auth.demo));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', asyncHandler(auth.logout));
router.get('/profile', authenticate, asyncHandler(auth.profile));
router.put('/profile', authenticate, asyncHandler(auth.updateProfile));

module.exports = router;
