const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    req.headers['x-trace-id'];

  const id =
    typeof incoming === 'string' && incoming.trim()
      ? incoming.trim()
      : crypto.randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };

