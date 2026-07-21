/**
 * Deterministic Week 5 heuristic scoring — single fallback call site.
 */
const analysisScoring = require('./analysis-scoring.service');

async function scoreLocation(input) {
  return analysisScoring.scoreLocation(input);
}

async function scoreBatch(input) {
  return analysisScoring.scoreBatch(input);
}

module.exports = {
  scoreLocation,
  scoreBatch,
};
