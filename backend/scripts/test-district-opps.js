require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const svc = require('../src/services/investor-opportunities.service');

async function main() {
  const districts = await svc.listDistricts();
  console.log('district count', districts.count);
  console.log(districts.districts.join(', '));

  for (const d of ['Ambala', 'Bhiwani', 'Gurugram', 'Kaithal', 'Hisar', 'Panchkula']) {
    const t0 = Date.now();
    const res = await svc.getOpportunities({
      sector: 'industrial',
      risk: 'medium',
      district: d,
      limit: 5,
    });
    console.log(
      d,
      'candidates',
      res.totalCandidates,
      'results',
      res.count,
      'ms',
      res.elapsedMs || Date.now() - t0,
      res.opportunities.map((o) => `${o.name.slice(0, 40)} (${o.opportunityScore})`).join(' | ')
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
