/**
 * Imports a curated circle_rates CSV (district,tehsil,village,segment,sector_type,rate_per_sq_yard_inr,effective_from,source)
 * into the circle_rates table. Real government collector-rate data only — no invented rows.
 *
 * Usage: node scripts/import-circle-rates.js <path-to-csv>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
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

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/import-circle-rates.js <path-to-csv>');
    process.exit(1);
  }

  const pool = getPool();
  if (!pool) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = {};
    header.forEach((col, idx) => {
      record[col.trim()] = values[idx];
    });
    return record;
  });

  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO circle_rates (district, tehsil, village, segment, sector_type, rate_per_sq_yard_inr, effective_from, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.district,
          row.tehsil || null,
          row.village || null,
          row.segment || null,
          row.sector_type,
          Number(row.rate_per_sq_yard_inr),
          row.effective_from,
          row.source,
        ]
      );
    }
    await client.query('COMMIT');
    console.log(`Inserted ${rows.length} circle_rates rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
