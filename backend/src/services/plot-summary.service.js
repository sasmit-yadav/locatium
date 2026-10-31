/**
 * "Check my plot": turns a technical location score into a short, plain summary a
 * first-time buyer can read — in English or Hindi. Every sentence is built from a measured
 * value (distance, count, rate), never from model text, so the Hindi version says exactly
 * what the English one does.
 */
const buyerChecklist = require('../config/buyer-checklist');
const FEES = require('../config/haryana-acquisition-fees');

const SECTOR_WORD = {
  en: { industrial: 'a factory or warehouse', commercial: 'a shop or office', residential: 'housing', agricultural: 'farming' },
  hi: { industrial: 'फैक्ट्री या गोदाम', commercial: 'दुकान या ऑफिस', residential: 'मकान / आवास', agricultural: 'खेती' },
};

const WORDS = {
  en: { good: 'Good', average: 'Average', weak: 'Weak' },
  hi: { good: 'अच्छा', average: 'ठीक-ठाक', weak: 'कमज़ोर' },
};

function scoreWord(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  return s >= 75 ? 'good' : s >= 55 ? 'average' : 'weak';
}

/** "350 m" / "2.1 km" (or the Hindi units) — "0 km" told people nothing. */
function dist(v, L) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (n < 1) {
    const m = Math.max(10, Math.round((n * 1000) / 10) * 10);
    return L === 'hi' ? `${m} मीटर` : `${m} m`;
  }
  const k = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return L === 'hi' ? `${k} किमी` : `${k} km`;
}

/** Source tables still use some pre-2016 names. */
const DISTRICT_NAMES = { gurgaon: 'Gurugram', mewat: 'Nuh' };
const displayDistrict = (d) => (d ? DISTRICT_NAMES[String(d).toLowerCase()] || d : d);
const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;

/** Sentence templates; `{x}` placeholders are filled from measured values. */
const T = {
  en: {
    headline: (word, use) => `${word} location for ${use}`,
    road: (d) => `Main road ${d} away`,
    roadFar: (d) => `Nearest main road is ${d} away — check access for trucks and visitors`,
    rail: (d) => `Railway line ${d} away`,
    airport: (d) => `Airport ${d} away`,
    services: (h, s) => `${h} hospitals and ${s} schools within 5 km`,
    servicesLow: (h, s) => `Only ${h} hospitals and ${s} schools within 5 km`,
    town: (d) => `Town limits ${d} away`,
    hsiidc: 'Inside a government industrial estate (HSIIDC)',
    hsiidcNear: (d) => `Government industrial estate ${d} away`,
    forest: (d) => `Forest land ${d} away — extra clearances may be needed`,
    water: (d) => `Water body ${d} away — buffer rules may limit building`,
    flood: (d) => `Low-lying (flood-prone) land ${d} away — check for waterlogging`,
    env: (s) => `Environment score is low (${s}/100) — expect clearance work`,
    aqi: (a, st) => `Air quality nearby is ${a} AQI (${st})`,
    priceUncertain: 'Price estimate is uncertain — very few recorded sales nearby',
    noRate: 'No official circle rate found for this area yet',
    landEstimate: (v) => `Estimated land price about ${v} per sq yd`,
    landFloor: (v, d, date) => `Government circle rate ${v} per sq yd (${d}${date ? `, from ${date}` : ''})`,
  },
  hi: {
    headline: (word, use) => `${use} के लिए ${word} जगह`,
    road: (d) => `मुख्य सड़क ${d} दूर`,
    roadFar: (d) => `नज़दीकी मुख्य सड़क ${d} दूर है — ट्रक और लोगों की पहुँच जाँचें`,
    rail: (d) => `रेलवे लाइन ${d} दूर`,
    airport: (d) => `हवाई अड्डा ${d} दूर`,
    services: (h, s) => `5 किमी के अंदर ${h} अस्पताल और ${s} स्कूल`,
    servicesLow: (h, s) => `5 किमी के अंदर सिर्फ़ ${h} अस्पताल और ${s} स्कूल`,
    town: (d) => `शहर की सीमा ${d} दूर`,
    hsiidc: 'सरकारी औद्योगिक क्षेत्र (HSIIDC) के अंदर',
    hsiidcNear: (d) => `सरकारी औद्योगिक क्षेत्र ${d} दूर`,
    forest: (d) => `वन भूमि ${d} दूर — अतिरिक्त मंज़ूरी लग सकती है`,
    water: (d) => `जल स्रोत ${d} दूर — निर्माण पर बफ़र नियम लागू हो सकते हैं`,
    flood: (d) => `निचली (बाढ़ वाली) ज़मीन ${d} दूर — जलभराव जाँचें`,
    env: (s) => `पर्यावरण स्कोर कम है (${s}/100) — मंज़ूरियों की तैयारी रखें`,
    aqi: (a, st) => `पास में हवा की गुणवत्ता ${a} AQI (${st})`,
    priceUncertain: 'कीमत का अनुमान पक्का नहीं है — आसपास बहुत कम दर्ज बिक्री',
    noRate: 'इस इलाके का सरकारी सर्कल रेट अभी नहीं मिला',
    landEstimate: (v) => `ज़मीन की अनुमानित कीमत लगभग ${v} प्रति वर्ग गज़`,
    landFloor: (v, d, date) => `सरकारी सर्कल रेट ${v} प्रति वर्ग गज़ (${d}${date ? `, ${date} से` : ''})`,
  },
};

function buildPlotSummary(result, { lang = 'en' } = {}) {
  const L = lang === 'hi' ? 'hi' : 'en';
  const t = T[L];
  const d = result?.details || {};
  const acc = d.accessibility?.metrics || {};
  const inf = d.infrastructure?.metrics || {};
  const env = d.environmentalRisk?.metrics || {};
  const zone = d.zoneCompatibility?.metrics || {};
  const scores = result?.scores || {};
  const sector = result?.location?.sector || 'industrial';
  const lv = result?.landValue || {};
  const word = scoreWord(result?.overallScore);

  const good = [];
  const watch = [];
  const push = (cond, list, text) => {
    if (cond) list.push(text);
  };

  if (result?.zoning?.insideHsiidc) good.push(t.hsiidc);
  else if (sector === 'industrial' && zone.nearestIndustrialZoneKm != null && zone.nearestIndustrialZoneKm <= 10)
    good.push(t.hsiidcNear(dist(zone.nearestIndustrialZoneKm, L)));

  if (acc.nearestRoadKm != null) {
    if (acc.nearestRoadKm <= 2) good.push(t.road(dist(acc.nearestRoadKm, L)));
    else if (acc.nearestRoadKm > 5) watch.push(t.roadFar(dist(acc.nearestRoadKm, L)));
  }
  push(acc.nearestRailKm != null && acc.nearestRailKm <= 5, good, t.rail(dist(acc.nearestRailKm ?? 0, L)));
  push(acc.nearestAirportKm != null && acc.nearestAirportKm <= 40, good, t.airport(dist(acc.nearestAirportKm ?? 0, L)));
  if (inf.hospitals != null && inf.schools != null) {
    if (inf.hospitals >= 3 && inf.schools >= 3) good.push(t.services(inf.hospitals, inf.schools));
    else if (inf.hospitals + inf.schools <= 2) watch.push(t.servicesLow(inf.hospitals, inf.schools));
  }
  push(acc.nearestMunicipalBoundaryKm != null && acc.nearestMunicipalBoundaryKm <= 3, good, t.town(dist(acc.nearestMunicipalBoundaryKm ?? 0, L)));

  push(env.nearestForestKm != null && env.nearestForestKm <= 3, watch, t.forest(dist(env.nearestForestKm ?? 0, L)));
  push(env.nearestWaterBodyKm != null && env.nearestWaterBodyKm <= 0.5, watch, t.water(dist(env.nearestWaterBodyKm ?? 0, L)));
  push(env.nearestLowLyingAreaKm != null && env.nearestLowLyingAreaKm <= 2, watch, t.flood(dist(env.nearestLowLyingAreaKm ?? 0, L)));
  push(scores.environmentalRisk != null && scores.environmentalRisk < 40, watch, t.env(scores.environmentalRisk));
  if (result?.aqiStation?.aqi > 150) watch.push(t.aqi(result.aqiStation.aqi, result.aqiStation.stationName));

  const land = {
    estimatePerSqYd: lv.estimatedPerSqYardInr || null,
    lowPerSqYd: lv.estimatedLowPerSqYardInr || null,
    highPerSqYd: lv.estimatedHighPerSqYardInr || null,
    circleRatePerSqYd: lv.circleRatePerSqYardInr || null,
    circleRateFrom: lv.circleRateEffectiveFrom || null,
    district: displayDistrict(lv.district) || null,
    confidence: lv.confidence || null,
    salesUsed: lv.comparableSampleCount ?? lv.comparableCount ?? 0,
    lines: [],
    source:
      lv.circleRatePerSqYardInr
        ? {
            label: L === 'hi' ? 'ज़िला उपायुक्त (DC) द्वारा जारी सर्कल रेट' : 'Circle rate notified by the Deputy Commissioner',
            district: displayDistrict(lv.district) || null,
            effectiveFrom: lv.circleRateEffectiveFrom || null,
            verifyUrl: FEES.verifyUrl,
          }
        : null,
  };
  if (land.estimatePerSqYd) land.lines.push(t.landEstimate(inr(land.estimatePerSqYd)));
  if (land.circleRatePerSqYd) land.lines.push(t.landFloor(inr(land.circleRatePerSqYd), land.district || '', land.circleRateFrom));
  else land.lines.push(t.noRate);
  if (land.estimatePerSqYd && (land.confidence === 'low' || land.salesUsed <= 2)) watch.push(t.priceUncertain);

  return {
    lang: L,
    score: result?.overallScore ?? null,
    scoreWord: word,
    scoreLabel: word ? WORDS[L][word] : null,
    headline: word ? t.headline(WORDS[L][word], SECTOR_WORD[L][sector] || SECTOR_WORD[L].industrial) : null,
    sector,
    location: result?.location || null,
    good: good.slice(0, 5),
    watch: watch.slice(0, 5),
    land,
    checklist: buyerChecklist.map((c) => ({ key: c.key, ...c[L], url: c.url, portal: c.portal })),
  };
}

module.exports = { buildPlotSummary, scoreWord, WORDS };
