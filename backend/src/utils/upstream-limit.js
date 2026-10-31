/**
 * Limit concurrent HARSAC MapServer export calls so the API stays stable under tile bursts.
 */

const MAX_CONCURRENT = Number(process.env.MAP_UPSTREAM_MAX_CONCURRENT) || 12;

let active = 0;
/** @type {Array<() => void>} */
const waitQueue = [];

function release() {
  active -= 1;
  const next = waitQueue.shift();
  if (next) next();
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withUpstreamSlot(fn) {
  if (active >= MAX_CONCURRENT) {
    await new Promise((resolve) => waitQueue.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    release();
  }
}

module.exports = { withUpstreamSlot };
