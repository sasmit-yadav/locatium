const geocodeService = require('../services/geocode.service');

async function search(req, res) {
  const q = req.query.q;
  const { results } = await geocodeService.searchPlaces(typeof q === 'string' ? q : '');
  res.json({ results, attribution: '© OpenStreetMap contributors (ODbL). Data © Nominatim/OSM.' });
}

module.exports = {
  search,
};
