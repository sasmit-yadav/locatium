/**
 * Script to check existing tables in your PostgreSQL database
 * Run: node backend/scripts/check-tables.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function checkTables() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Get all tables in public schema
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('users', 'refresh_tokens', 'audit_logs', 'features')
      ORDER BY table_name;
    `);
    
    const existingTables = result.rows.map(r => r.table_name);
    
    console.log('\n📊 Tables in your database (excluding auth tables):');
    console.log('═'.repeat(60));
    existingTables.forEach(t => console.log(`  - ${t}`));
    
    // Check for geometry columns
    const geomResult = await pool.query(`
      SELECT f_table_name, f_geometry_column, srid 
      FROM geometry_columns 
      WHERE f_table_schema = 'public'
      ORDER BY f_table_name;
    `);
    
    console.log('\n🗺️  Spatial tables with geometry:');
    console.log('═'.repeat(60));
    geomResult.rows.forEach(r => {
      console.log(`  ${r.f_table_name}.${r.f_geometry_column} (SRID: ${r.srid})`);
    });
    
    // Count features in each table
    console.log('\n📈 Feature counts:');
    console.log('═'.repeat(60));
    for (const table of existingTables) {
      try {
        const count = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        const cnt = parseInt(count.rows[0].count);
        if (cnt > 0) {
          console.log(`  ${table}: ${cnt} features`);
        }
      } catch (err) {
        // Skip tables that can't be queried
      }
    }
    
    console.log('\n💡 Next steps:');
    console.log('  1. Update backend/src/config/postgis-registry.js');
    console.log('  2. Only include tables that exist in your database');
    console.log('  3. Restart the backend server');
    
  } finally {
    await pool.end();
  }
}

checkTables().catch(console.error);