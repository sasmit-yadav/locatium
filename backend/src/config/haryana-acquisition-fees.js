/**
 * Haryana land-purchase charges used by the cost calculator and the plot report.
 *
 * These are statutory rates as last known to the project (not fetched live). Rates are
 * revised by notification, so every figure is shown to users with a "verify at
 * igrharyana.gov.in" note. Change them here and every screen and PDF follows.
 */
module.exports = {
  asOf: '2025',
  verifyUrl: 'https://igrharyana.gov.in',

  /**
   * Stamp duty as a share of the higher of the deal value and the circle-rate value.
   * "Urban" = inside municipal limits; "rural" = outside. Joint = a man and a woman together.
   */
  stampDuty: {
    urban: { man: 0.07, woman: 0.05, joint: 0.06 },
    rural: { man: 0.05, woman: 0.03, joint: 0.04 },
  },

  /**
   * Registration fee slabs on the deed value (upper bound in ₹ → fee in ₹). Approximate:
   * the IGR schedule is revised from time to time.
   */
  registrationSlabs: [
    { upTo: 50_000, fee: 100 },
    { upTo: 100_000, fee: 500 },
    { upTo: 500_000, fee: 1_000 },
    { upTo: 1_000_000, fee: 5_000 },
    { upTo: 2_000_000, fee: 10_000 },
    { upTo: 2_500_000, fee: 12_500 },
    { upTo: 5_000_000, fee: 25_000 },
    { upTo: Infinity, fee: 50_000 },
  ],

  /** Editable defaults for the costs that are not statutory. */
  defaults: {
    legalPct: 0.005, // title search + drafting
    brokeragePct: 0.01,
    loanSharePct: 0.7, // banks usually lend up to ~70-80% of a plot's value
    interestPct: 9.5,
    tenureYears: 15,
  },
};
