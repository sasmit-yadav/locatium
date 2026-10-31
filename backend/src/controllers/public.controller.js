const publicService = require('../services/public-transparency.service');

async function transparency(req, res) {
  const stats = await publicService.getTransparencyStats();
  res.json(stats);
}

async function zoneCard(req, res) {
  const card = await publicService.getPublicZoneCard(req.params.zoneId);
  res.json(card);
}

module.exports = { transparency, zoneCard };
