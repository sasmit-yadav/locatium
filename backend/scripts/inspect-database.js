require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sslSetting = process.env.DATABASE_SSL;
  const useSsl =
    sslSetting === 'true' ||
    (sslSetting !== 'false' && process.env.NODE_ENV === 'production');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const database = await pool.query(
      `SELECT current_database() AS database,
              pg_database_size(current_database())::bigint AS bytes,
              pg_size_pretty(pg_database_size(current_database())) AS size`
    );
    const tables = await pool.query(
      `SELECT schemaname,
              relname AS table_name,
              n_live_tup::bigint AS estimated_rows,
              pg_total_relation_size(relid)::bigint AS bytes,
              pg_size_pretty(pg_total_relation_size(relid)) AS total_size
       FROM pg_catalog.pg_stat_user_tables
       ORDER BY pg_total_relation_size(relid) DESC`
    );
    console.log(database.rows[0]);
    console.table(tables.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database inspection failed:', error.message);
  process.exit(1);
});
