/**
 * Pre-warm investor opportunity cache for common filter combinations.
 */

const investorOpportunities = require('./investor-opportunities.service');

const WARM_QUERIES = [
  { sector: 'industrial', district: 'Gurugram', limit: 10 },
  { sector: 'industrial', limit: 10 },
];

async function warmInvestorCache(options = {}) {
  const queries = options.queries || WARM_QUERIES;
  const results = [];

  for (const query of queries) {
    const started = Date.now();
    try {
      const payload = await investorOpportunities.getOpportunities(query);
      results.push({
        query,
        ok: true,
        count: payload.count,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      results.push({
        query,
        ok: false,
        error: err.message,
        elapsedMs: Date.now() - started,
      });
    }
  }

  return {
    warmedAt: new Date().toISOString(),
    queries: results.length,
    success: results.filter((r) => r.ok).length,
    results,
  };
}

module.exports = { warmInvestorCache, WARM_QUERIES };
