/**
 * Import all circle_rates_*.csv under data/imports/circle_rates for a district.
 * Idempotent: deletes previous curated rows for that district source before insert.
 *
 * Usage: node scripts/import-district-circle-rates.js Faridabad faridabad_gov_in_dc_notification
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getPool } = require('../src/db/pool');

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

async function main() {
  const district = process.argv[2];
  const source = process.argv[3];
  if (!district || !source) {
    console.error('Usage: node scripts/import-district-circle-rates.js <District> <source>');
    process.exit(1);
  }

  const pool = getPool();
  if (!pool) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const slug = district.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const dir = path.join(__dirname, '..', '..', 'data', 'imports', 'circle_rates');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`circle_rates_${slug}_`) && f.endsWith('.csv'))
    .map((f) => path.join(dir, f));

  if (!files.length) {
    console.error('No CSVs found for', district);
    process.exit(1);
  }

  const allRows = [];
  for (const file of files) {
    const rows = loadCsv(file).filter((r) => {
      const rate = Number(r.rate_per_sq_yard_inr);
      const village = String(r.village || '');
      if (!Number.isFinite(rate) || rate < 200 || rate > 800000) return false;
      if (village.length < 3) return false;
      if (/^(fee|rae|mits|pret|fobs|wart|prr|ind\.?)$/i.test(village)) return false;
      return true;
    });
    console.log(`Parsed ${rows.length} clean rows from ${path.basename(file)}`);
    allRows.push(...rows);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(
      `DELETE FROM circle_rates WHERE LOWER(district) = LOWER($1) AND source = $2`,
      [district, source]
    );
    console.log(`Deleted previous ${district} curated rows: ${del.rowCount}`);

    for (const row of allRows) {
      await client.query(
        `INSERT INTO circle_rates (district, tehsil, village, segment, sector_type, rate_per_sq_yard_inr, effective_from, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.district || district,
          row.tehsil || null,
          row.village || null,
          row.segment || null,
          row.sector_type,
          Number(row.rate_per_sq_yard_inr),
          row.effective_from || '2026-04-01',
          row.source || source,
        ]
      );
    }
    await client.query('COMMIT');
    console.log(`Inserted ${allRows.length} rows for ${district}`);

    const summary = await pool.query(`
      SELECT district, source, COUNT(*)::int AS n, COUNT(DISTINCT tehsil)::int AS tehsils
      FROM circle_rates GROUP BY 1,2 ORDER BY 1,2`);
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
