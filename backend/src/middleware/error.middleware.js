const { alertError } = require('../utils/error-alert');

class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, message);
  }

  static notFound(message = 'Not found') {
    return new AppError(404, message);
  }

  static conflict(message) {
    return new AppError(409, message);
  }

  static payloadTooLarge(message) {
    return new AppError(413, message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, message);
  }

  static badGateway(message = 'Upstream service failed') {
    return new AppError(502, message);
  }

  static serviceUnavailable(message) {
    return new AppError(503, message);
  }

  static gatewayTimeout(message = 'Upstream service timed out') {
    return new AppError(504, message);
  }
}

function notFoundHandler(_req, res, _next) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Services that predate AppError signal intent with a plain numeric `status`.
 * Honour it so a validation failure or an upstream timeout is not reported to the
 * client as an unexplained 500. 5xx text still stays generic unless the thrower
 * marked it safe, because upstream error bodies can carry internal detail.
 */
function resolveStatus(err) {
  const raw = err?.statusCode ?? err?.status;
  const code = Number(raw);
  return Number.isInteger(code) && code >= 400 && code <= 599 ? code : 500;
}

function errorHandler(err, req, res, _next) {
  const status = err instanceof AppError ? err.statusCode : resolveStatus(err);
  const isClientError = status < 500;
  const exposeMessage = err instanceof AppError || isClientError || err?.expose === true;

  if (!isClientError) {
    if (req?.requestId) console.error(`[${req.requestId}]`, err);
    else console.error(err);
    // Upstream 502/503/504s are expected while ML/LLM wake up; alert on real 500s only.
    if (status === 500) {
      alertError(err, { method: req?.method, path: req?.path, requestId: req?.requestId });
    }
  }

  const body = {
    error: exposeMessage && err?.message ? err.message : 'Internal server error',
  };
  if (req?.requestId) body.requestId = req.requestId;
  if (err?.details !== undefined) body.details = err.details;
  if (err?.code) body.code = err.code;
  res.status(status).json(body);
}

module.exports = { AppError, notFoundHandler, errorHandler };
