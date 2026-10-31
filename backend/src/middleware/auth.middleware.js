const jwt = require('jsonwebtoken');
const { AppError } = require('./error.middleware');
const { jwtAccessSecret } = require('../config');

/**
 * Requires `Authorization: Bearer <access_token>`.
 * Sets `req.user = { id, email, role }`.
 */
function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(AppError.unauthorized('Missing or invalid Authorization header'));
    return;
  }
  const token = header.slice(7).trim();
  if (!jwtAccessSecret) {
    next(AppError.serviceUnavailable('JWT_ACCESS_SECRET is not configured'));
    return;
  }
  try {
    const payload = jwt.verify(token, jwtAccessSecret);
    if (payload.typ !== 'access') {
      next(AppError.unauthorized('Invalid token type'));
      return;
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired access token'));
  }
}

/** Call after `authenticate`. Restricts to given roles. */
function requireRole(...allowed) {
  return (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(AppError.forbidden('Insufficient permissions'));
      return;
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
