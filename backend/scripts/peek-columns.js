require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    ['hsiidc_boundary']
  );
  console.log(rows.map((r) => r.column_name).join(', ') || 'table not found');
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
