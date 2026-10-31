const crypto = require('crypto');

/** Store only a hash of refresh tokens in the database (never the raw token). */
function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

module.exports = { sha256Hex };
