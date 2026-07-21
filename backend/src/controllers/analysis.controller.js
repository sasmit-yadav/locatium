const scoringOrchestrator = require('../services/scoringOrchestrator');

async function scoreLocation(req, res) {
  const result = await scoringOrchestrator.scoreLocation(req.body || {}, {
    requestId: req.requestId,
  });
  res.json(result);
}

async function scoreBatch(req, res) {
  const result = await scoringOrchestrator.scoreBatch(req.body || {}, {
    requestId: req.requestId,
  });
  res.json(result);
}

module.exports = {
  scoreLocation,
  scoreBatch,
};
