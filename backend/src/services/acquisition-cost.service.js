/**
 * Full cost of buying a piece of land in Haryana, in plain rupees:
 * land price + stamp duty + registration + legal + brokerage, and an optional loan EMI.
 */
const FEES = require('../config/haryana-acquisition-fees');
const { AppError } = require('../middleware/error.middleware');

const SQ_YD_PER_ACRE = 4840;
const SQ_YD_PER_SQ_M = 1.19599;

function toSqYd(area, unit) {
  const a = Number(area);
  if (!Number.isFinite(a) || a <= 0) return null;
  switch (String(unit || 'sqyd').toLowerCase()) {
    case 'acre':
    case 'acres':
      return a * SQ_YD_PER_ACRE;
    case 'sqm':
    case 'sq m':
      return a * SQ_YD_PER_SQ_M;
    case 'sqft':
    case 'sq ft':
      return a / 9;
    default:
      return a;
  }
}

function registrationFee(value) {
  const slab = FEES.registrationSlabs.find((s) => value <= s.upTo);
  return slab ? slab.fee : FEES.registrationSlabs[FEES.registrationSlabs.length - 1].fee;
}

function emi(principal, annualPct, years) {
  if (!(principal > 0) || !(years > 0)) return 0;
  const r = annualPct / 12 / 100;
  const n = Math.round(years * 12);
  if (r === 0) return principal / n;
  return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

const round = (v) => Math.round(v);

/**
 * @param {object} input
 * @param {number} input.area            plot size
 * @param {string} [input.unit]          'sqyd' | 'acre' | 'sqm' | 'sqft'
 * @param {number} input.pricePerSqYd    agreed price (₹ per sq yd)
 * @param {number} [input.circleRatePerSqYd] government floor, stamp duty uses the higher value
 * @param {'man'|'woman'|'joint'} [input.buyer]
 * @param {'urban'|'rural'} [input.areaType]
 * @param {boolean} [input.withLoan]
 */
function calculateAcquisitionCost(input = {}) {
  const sqYd = toSqYd(input.area, input.unit);
  const price = Number(input.pricePerSqYd);
  if (!sqYd) throw AppError.badRequest('Enter the plot size');
  if (!(price > 0)) throw AppError.badRequest('Enter the price per sq yd');
  const circle = Number(input.circleRatePerSqYd) > 0 ? Number(input.circleRatePerSqYd) : null;
  const buyer = ['man', 'woman', 'joint'].includes(input.buyer) ? input.buyer : 'man';
  const areaType = input.areaType === 'rural' ? 'rural' : 'urban';
  const d = FEES.defaults;
  const pct = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);

  const landCost = sqYd * price;
  const circleValue = circle ? sqYd * circle : null;
  const dutyBase = Math.max(landCost, circleValue || 0);
  const stampRate = FEES.stampDuty[areaType][buyer];
  const stampDuty = dutyBase * stampRate;
  const registration = registrationFee(dutyBase);
  const legal = landCost * pct(input.legalPct, d.legalPct);
  const brokerage = landCost * pct(input.brokeragePct, d.brokeragePct);
  const total = landCost + stampDuty + registration + legal + brokerage;

  let loan = null;
  if (input.withLoan) {
    const share = Math.min(0.9, pct(input.loanSharePct, d.loanSharePct));
    const principal = landCost * share;
    const rate = pct(input.interestPct, d.interestPct);
    const years = pct(input.tenureYears, d.tenureYears) || d.tenureYears;
    const monthly = emi(principal, rate, years);
    loan = {
      principal: round(principal),
      sharePct: share,
      interestPct: rate,
      tenureYears: years,
      emi: round(monthly),
      totalInterest: round(monthly * years * 12 - principal),
      upfrontCash: round(total - principal),
    };
  }

  return {
    areaSqYd: Math.round(sqYd * 100) / 100,
    pricePerSqYd: price,
    circleRatePerSqYd: circle,
    belowCircleRate: Boolean(circle && price < circle),
    buyer,
    areaType,
    lines: [
      { key: 'land', amount: round(landCost) },
      { key: 'stampDuty', amount: round(stampDuty), ratePct: Math.round(stampRate * 10000) / 100, basis: circleValue && circleValue > landCost ? 'circle' : 'deal' },
      { key: 'registration', amount: round(registration) },
      { key: 'legal', amount: round(legal), ratePct: Math.round(pct(input.legalPct, d.legalPct) * 10000) / 100 },
      { key: 'brokerage', amount: round(brokerage), ratePct: Math.round(pct(input.brokeragePct, d.brokeragePct) * 10000) / 100 },
    ],
    total: round(total),
    loan,
    source: { asOf: FEES.asOf, verifyUrl: FEES.verifyUrl },
  };
}

module.exports = { calculateAcquisitionCost, registrationFee, emi, toSqYd, FEES };
