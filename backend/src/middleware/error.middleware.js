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

  static conflict(message) {
    return new AppError(409, message);
  }

  static serviceUnavailable(message) {
    return new AppError(503, message);
  }
}

function notFoundHandler(_req, res, _next) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    const body = { error: err.message };
    if (req?.requestId) body.requestId = req.requestId;
    if (err.details !== undefined) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }
  if (req?.requestId) console.error(`[${req.requestId}]`, err);
  else console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { AppError, notFoundHandler, errorHandler };
