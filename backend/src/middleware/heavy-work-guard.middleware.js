const { AppError } = require('./error.middleware');

/**
 * Bounds concurrent expensive work (full-district scans, batch scoring) so one caller
 * cannot exhaust the shared PostGIS pool. Each signed-in user may run one heavy job at
 * a time, and the whole process runs at most HEAVY_WORK_CONCURRENCY (default 2).
 * Requests over either bound get a fast 429 with Retry-After instead of queueing.
 */
const MAX_CONCURRENT = Math.max(1, Number(process.env.HEAVY_WORK_CONCURRENCY) || 2);

let active = 0;
const activeUsers = new Set();

function heavyWorkGuard(isHeavy = () => true) {
  return (req, res, next) => {
    if (!isHeavy(req)) {
      next();
      return;
    }
    const userKey = req.user?.id || req.ip;
    if (activeUsers.has(userKey)) {
      res.setHeader('Retry-After', '5');
      next(AppError.tooManyRequests('A heavy analysis is already running for you; wait for it to finish.'));
      return;
    }
    if (active >= MAX_CONCURRENT) {
      res.setHeader('Retry-After', '10');
      next(AppError.tooManyRequests('The server is busy with other analyses; please retry in a few seconds.'));
      return;
    }

    active += 1;
    activeUsers.add(userKey);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
      activeUsers.delete(userKey);
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

/** A district / near-me scan touches every eligible site; plain statewide lists are cached. */
function isDistrictScan(req) {
  const q = req.query || {};
  return Boolean(q.district && String(q.district).trim()) || ((q.nearLat ?? q.near_lat) != null && (q.nearLat ?? q.near_lat) !== '');
}

function _state() {
  return { active, users: activeUsers.size, max: MAX_CONCURRENT };
}

module.exports = { heavyWorkGuard, isDistrictScan, _state };
