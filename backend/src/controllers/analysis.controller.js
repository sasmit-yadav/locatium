const analysisScoring = require('../services/analysis-scoring.service');

async function scoreLocation(req, res) {
  const result = await analysisScoring.scoreLocation(req.body || {});
  res.json(result);
}

async function scoreBatch(req, res) {
  const result = await analysisScoring.scoreBatch(req.body || {});
  res.json(result);
}

module.exports = {
  scoreLocation,
  scoreBatch,
};
