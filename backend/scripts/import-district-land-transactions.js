/**
 * Import land_transactions_*.csv under data/imports/land_transactions for a district.
 * Idempotent: deletes previous curated rows for that district+source before insert.
 *
 * Usage: node scripts/import-district-land-transactions.js Gurugram jamabandi_deed
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getPool } = require('../src/db/pool');

const HARYANA_BBOX = { minLat: 27.4, maxLat: 31.2, minLng: 74.4, maxLng: 77.8 };
const MIN_PRICE = 500;
const MAX_PRICE = 2_000_000;
const MAX_AGE_YEARS = 5;
const BLOCKED_SOURCES = new Set(['seed_comparable']);

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function loadCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = {};
    header.forEach((col, idx) => {
      record[col.trim()] = values[idx];
    });
    return record;
  });
}

function isRecentDate(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MAX_AGE_YEARS);
  return d >= cutoff && d <= new Date();
}

function isCleanRow(r, defaultSource) {
  const price = Number(r.price_per_sq_yard_inr);
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  const source = String(r.source || defaultSource || '').trim();
  if (!source || BLOCKED_SOURCES.has(source)) return false;
  if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < HARYANA_BBOX.minLat || lat > HARYANA_BBOX.maxLat) return false;
  if (lng < HARYANA_BBOX.minLng || lng > HARYANA_BBOX.maxLng) return false;
  if (r.area_sq_yards != null && String(r.area_sq_yards).trim() !== '') {
    const area = Number(r.area_sq_yards);
    if (!Number.isFinite(area) || area <= 0) return false;
  }
  const date = r.transaction_date || null;
  if (date && !isRecentDate(date)) return false;
  return true;
}

async function main() {
  const district = process.argv[2];
  const source = process.argv[3];
  if (!district || !source) {
    console.error('Usage: node scripts/import-district-land-transactions.js <District> <source>');
    process.exit(1);
  }
  if (BLOCKED_SOURCES.has(source)) {
    console.error(`Source "${source}" is blocked (seed invents). Use jamabandi_deed or similar.`);
    process.exit(1);
  }

  const pool = getPool();
  if (!pool) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const slug = district.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const dir = path.join(__dirname, '..', '..', 'data', 'imports', 'land_transactions');
  if (!fs.existsSync(dir)) {
    console.error('Missing folder:', dir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`land_transactions_${slug}_`) && f.endsWith('.csv'))
    .map((f) => path.join(dir, f));

  if (!files.length) {
    console.error('No CSVs found for', district, `(expected land_transactions_${slug}_*.csv)`);
    process.exit(1);
  }

  const allRows = [];
  for (const file of files) {
    const rows = loadCsv(file).filter((r) => isCleanRow(r, source));
    console.log(`Parsed ${rows.length} clean rows from ${path.basename(file)}`);
    allRows.push(...rows);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM land_transactions WHERE LOWER(district) = LOWER($1) AND source = $2`,
      [district, source]
    );
    console.log(`Deleted previous ${district} curated rows: ${del.rowCount}`);

    for (const row of allRows) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      await client.query(
        `INSERT INTO land_transactions (
           district, tehsil, village, sector_type, price_per_sq_yard_inr, area_sq_yards,
           lat, lng, transaction_date, source, deed_id, consideration_inr, area_unit, notes, geom
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           ST_SetSRID(ST_MakePoint($8, $7), 4326)
         )`,
        [
          row.district || district,
          row.tehsil || null,
          row.village || null,
          (row.sector_type || 'industrial').trim().toLowerCase(),
          Number(row.price_per_sq_yard_inr),
          row.area_sq_yards != null && String(row.area_sq_yards).trim() !== ''
            ? Number(row.area_sq_yards)
            : null,
          lat,
          lng,
          row.transaction_date || new Date().toISOString().slice(0, 10),
          row.source || source,
          row.deed_id || null,
          row.consideration_inr != null && String(row.consideration_inr).trim() !== ''
            ? Number(row.consideration_inr)
            : null,
          row.area_unit || null,
          row.notes || null,
        ]
      );
    }
    await client.query('COMMIT');
    console.log(`Inserted ${allRows.length} rows for ${district}`);

    const summary = await pool.query(`
      SELECT district, source, COUNT(*)::int AS n, COUNT(DISTINCT sector_type)::int AS sectors
      FROM land_transactions
      WHERE source <> 'seed_comparable'
      GROUP BY 1, 2
      ORDER BY 1, 2`);
    console.log(summary.rows);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
