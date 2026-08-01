require('dotenv').config();
const { getPool } = require('../src/db/pool');

(async () => {
  const pool = getPool();
  if (!pool) {
    console.log('NO_POOL');
    process.exit(1);
  }
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

  const pairs = [
    ['Gurugram', ['gurugram', 'gurgaon']],
    ['Sonipat', ['sonipat', 'sonepat']],
    ['Faridabad', ['faridabad']],
  ];

  for (const [label, names] of pairs) {
    const h = await q(
      `SELECT COUNT(*)::int c FROM hsiidc_boundary WHERE LOWER(TRIM(district1)) = ANY($1::text[])`,
      [names]
    );
    const pAll = await q(
      `SELECT COUNT(*)::int c FROM hsvp_plots WHERE LOWER(TRIM(district)) = ANY($1::text[])`,
      [names]
    );
    const pElig = await q(
      `SELECT COUNT(*)::int c FROM hsvp_plots
       WHERE LOWER(TRIM(district)) = ANY($1::text[])
         AND COALESCE(area_sqm,0) >= 1000
         AND (parcel_subtype ILIKE '%commercial%'
           OR parcel_subtype ILIKE '%industrial%'
           OR parcel_subtype ILIKE '%institution%')`,
      [names]
    );
    const l = await q(
      `SELECT COUNT(*)::int c FROM licensed_colony WHERE LOWER(TRIM(dist_name)) = ANY($1::text[])`,
      [names]
    );
    console.log(
      JSON.stringify({
        district: label,
        hsiidc: h[0].c,
        hsvp_all: pAll[0].c,
        hsvp_eligible: pElig[0].c,
        licensed: l[0].c,
        total_raw: h[0].c + pAll[0].c + l[0].c,
        total_investor_eligible: h[0].c + pElig[0].c + l[0].c,
      })
    );
  }

  const statewide = await q(`
    SELECT 'hsiidc' AS s, COUNT(*)::int AS c FROM hsiidc_boundary
    UNION ALL SELECT 'hsvp_all', COUNT(*)::int FROM hsvp_plots
    UNION ALL SELECT 'hsvp_eligible', COUNT(*)::int FROM hsvp_plots
      WHERE COALESCE(area_sqm,0) >= 1000
        AND (parcel_subtype ILIKE '%commercial%'
          OR parcel_subtype ILIKE '%industrial%'
          OR parcel_subtype ILIKE '%institution%')
    UNION ALL SELECT 'licensed', COUNT(*)::int FROM licensed_colony
  `);
  console.log('statewide', statewide);
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
