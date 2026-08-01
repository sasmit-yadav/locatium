/**
 * Generate land_transactions CSVs from attributable HSIIDC e-auction reserve prices only.
 * No channel-partner estimates, no invented deeds, no fabricated plot sizes.
 *
 * Provenance:
 * - EA-2024-08: HSIIDC industrial e-auction FY2024-25 tentative reserve schedule
 *   (detailed Sr.No. plot table reprinted Aug 2024; registration 1–16 Aug, auction from 21 Aug 2024)
 * - EA-2024-02-BARWALA: IE Barwala Phase-I commercial 450 sqm @ ₹70,950/sqm
 *   (HSIIDC estate manager quoted in Hindustan Times / The Tribune, Feb 2024)
 *
 * Usage: node scripts/generate-hsiidc-eauction-comps.js [--import]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getPool } = require('../src/db/pool');

const SOURCE = 'hsiidc_eauction_reserve';
const SQM_PER_SQYD = 0.836127;
const OUT_DIR = path.join(__dirname, '..', '..', 'data', 'imports', 'land_transactions');

/** Estate pins (WGS84) near published industrial estates — approximate centroids for spatial join */
const ESTATES = {
  barhi: { district: 'Sonipat', tehsil: 'Ganaur', village: 'Barhi', lat: 29.047, lng: 77.023 },
  barhi_mfp: {
    district: 'Sonipat',
    tehsil: 'Ganaur',
    village: 'Barhi Mega Food Park',
    lat: 29.055,
    lng: 77.03,
  },
  rai_mfp: {
    district: 'Sonipat',
    tehsil: 'Rai',
    village: 'Rai Mega Food Park',
    lat: 28.948,
    lng: 77.098,
  },
  bawal: { district: 'Rewari', tehsil: 'Bawal', village: 'IMT Bawal', lat: 28.082, lng: 76.583 },
  dharuhera: {
    district: 'Rewari',
    tehsil: 'Dharuhera',
    village: 'IE Dharuhera',
    lat: 28.207,
    lng: 76.795,
  },
  sirsa: { district: 'Sirsa', tehsil: 'Sirsa', village: 'IE Sirsa', lat: 29.534, lng: 75.075 },
  narwana: { district: 'Jind', tehsil: 'Narwana', village: 'IE Narwana', lat: 29.599, lng: 76.119 },
  panipat: { district: 'Panipat', tehsil: 'Panipat', village: 'IE Panipat', lat: 29.36, lng: 76.957 },
  faridabad: {
    district: 'Faridabad',
    tehsil: 'Faridabad',
    village: 'IMT Faridabad',
    lat: 28.32,
    lng: 77.358,
  },
  rohtak: { district: 'Rohtak', tehsil: 'Rohtak', village: 'IMT Rohtak', lat: 28.882, lng: 76.611 },
  pace_city: {
    district: 'Gurugram',
    tehsil: 'Gurugram',
    village: 'Pace City Sector-37',
    lat: 28.443,
    lng: 76.991,
  },
  karnal: {
    district: 'Karnal',
    tehsil: 'Karnal',
    village: 'IE Karnal Sector-37',
    lat: 29.667,
    lng: 76.984,
  },
  bahadurgarh: {
    district: 'Jhajjar',
    tehsil: 'Bahadurgarh',
    village: 'IE Bahadurgarh',
    lat: 28.692,
    lng: 76.932,
  },
  barwala: {
    district: 'Panchkula',
    tehsil: 'Barwala',
    village: 'IE Barwala Phase-I',
    lat: 30.556,
    lng: 76.938,
  },
};

/**
 * [estateKey, area_sqm, reserve_inr_per_sqm, date, auction_ref, note, sector_type?]
 * Only rows with published size + reserve — no invented sizes, no "~" / "est." rates.
 */
const LISTINGS = [
  ...[4500, 6000, 7000, 8300].map((a) => [
    'barhi',
    a,
    27200,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 industrial e-auction reserve (IE Barhi)',
  ]),
  ...[1800, 4275].map((a) => [
    'barhi_mfp',
    a,
    27200,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (Mega Food Park IE Barhi Phase-III)',
  ]),
  ...[13300, 25000, 27500, 29000, 40800, 60000, 86850].map((a) => [
    'bawal',
    a,
    16300,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IMT Bawal)',
  ]),
  ...[300, 350, 400, 450, 550, 1012.5].map((a) => [
    'sirsa',
    a,
    19400,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Sirsa)',
  ]),
  ...[450, 1012.5, 1800, 2250, 2800].map((a) => [
    'narwana',
    a,
    14850,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Narwana)',
  ]),
  ...[4050, 5100, 5800, 7875, 9000, 10000, 11000, 12500, 15000].map((a) => [
    'dharuhera',
    a,
    29600,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Dharuhera)',
  ]),
  ...[1800, 2400, 3000].map((a) => [
    'rai_mfp',
    a,
    33250,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Rai Phase-II Mega Food Park)',
  ]),
  ...[4050, 7000, 7875, 39600, 66420, 78165].map((a) => [
    'panipat',
    a,
    19300,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Panipat)',
  ]),
  ...[7600, 15000].map((a) => [
    'faridabad',
    a,
    35900,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IMT Faridabad)',
  ]),
  ...[2400, 3000, 4050, 4500, 8100, 10500, 15000].map((a) => [
    'rohtak',
    a,
    21600,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IMT Rohtak)',
  ]),
  ...[450, 1012.5, 1800, 4050].map((a) => [
    'rohtak',
    a,
    21600,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (Mega Food Park IMT Rohtak)',
  ]),
  ...[1012.5, 2350, 3300].map((a) => [
    'karnal',
    a,
    21900,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Karnal Sector-37 Phase-IV)',
  ]),
  ...[1800, 6000].map((a) => [
    'bahadurgarh',
    a,
    42450,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (IE Bahadurgarh)',
  ]),
  [
    'pace_city',
    3800,
    72400,
    '2024-08-21',
    'EA-2024-08',
    'HSIIDC FY24-25 reserve (Pace City-II Sector-37 Gurugram)',
  ],
  [
    'barwala',
    450,
    70950,
    '2024-02-23',
    'EA-2024-02-BARWALA',
    'HSIIDC commercial e-auction IE Barwala Phase-I; estate manager quoted reserve (HT/Tribune Feb 2024)',
    'commercial',
  ],
];

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toRow(listing, idx) {
  const [estateKey, areaSqm, reservePerSqm, date, auctionRef, note, sectorType] = listing;
  const est = ESTATES[estateKey];
  if (!est) throw new Error(`Unknown estate ${estateKey}`);
  const areaYd = areaSqm / SQM_PER_SQYD;
  const priceYd = reservePerSqm * SQM_PER_SQYD;
  const consideration = Math.round(reservePerSqm * areaSqm);
  const jitter = ((idx % 7) - 3) * 0.0008;
  return {
    district: est.district,
    tehsil: est.tehsil,
    village: est.village,
    sector_type: sectorType || 'industrial',
    price_per_sq_yard_inr: Math.round(priceYd * 100) / 100,
    area_sq_yards: Math.round(areaYd * 100) / 100,
    lat: Math.round((est.lat + jitter) * 1e6) / 1e6,
    lng: Math.round((est.lng + jitter * 0.7) * 1e6) / 1e6,
    transaction_date: date,
    source: SOURCE,
    deed_id: `${auctionRef}-${estateKey}-${areaSqm}`,
    consideration_inr: consideration,
    area_unit: 'sqm',
    notes: `${note}; reserve ₹${reservePerSqm}/sqm`,
  };
}

function writeDistrictCsvs(rows) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Remove prior generated HSIIDC CSVs so soft/orphan files cannot re-import
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.includes('_hsiidc_eauction_') && f.endsWith('.csv')) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }

  const byDistrict = new Map();
  for (const row of rows) {
    if (!byDistrict.has(row.district)) byDistrict.set(row.district, []);
    byDistrict.get(row.district).push(row);
  }

  const header = [
    'district',
    'tehsil',
    'village',
    'sector_type',
    'price_per_sq_yard_inr',
    'area_sq_yards',
    'lat',
    'lng',
    'transaction_date',
    'source',
    'deed_id',
    'consideration_inr',
    'area_unit',
    'notes',
  ];

  const written = [];
  for (const [district, drows] of byDistrict) {
    const slug = district.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const file = path.join(OUT_DIR, `land_transactions_${slug}_hsiidc_eauction_v1.csv`);
    const body = [
      header.join(','),
      ...drows.map((r) => header.map((h) => csvEscape(r[h])).join(',')),
    ].join('\n');
    fs.writeFileSync(file, `${body}\n`, 'utf8');
    written.push({ district, file, n: drows.length });
  }
  return written;
}

async function purgeSource() {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not set.');
  const del = await pool.query(`DELETE FROM land_transactions WHERE source = $1`, [SOURCE]);
  console.log(`Purged previous ${SOURCE} rows: ${del.rowCount}`);
  await pool.end();
}

async function main() {
  const doImport = process.argv.includes('--import');
  const rows = LISTINGS.map((l, i) => toRow(l, i));
  const written = writeDistrictCsvs(rows);
  console.log(`Wrote ${rows.length} attributable comps across ${written.length} districts:`);
  for (const w of written) {
    console.log(`  ${w.district}: ${w.n} → ${path.basename(w.file)}`);
  }

  if (!doImport) {
    console.log('\nDry run only. Re-run with --import to load into land_transactions.');
    return;
  }

  await purgeSource();
  for (const w of written) {
    console.log(`\n=== Import ${w.district} ===`);
    const r = spawnSync(
      process.execPath,
      [path.join(__dirname, 'import-district-land-transactions.js'), w.district, SOURCE],
      { stdio: 'inherit', cwd: path.join(__dirname, '..') }
    );
    if (r.status !== 0) process.exit(r.status || 1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
