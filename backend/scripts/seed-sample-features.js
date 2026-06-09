/**
 * Seed sample features data for testing Week 4 feature endpoints
 * Run: node scripts/seed-sample-features.js
 */

require('dotenv').config({ path: '.env' });
const { getPool } = require('../src/db/pool');

const sampleFeatures = [
  // Administrative features
  {
    layer_id: 'administrative',
    name: 'Gurgaon District',
    properties: {
      type: 'district',
      population: 1500000,
      area_sqkm: 1250,
      state: 'Haryana'
    },
    geom: 'POLYGON((76.95 28.45, 77.05 28.45, 77.05 28.55, 76.95 28.55, 76.95 28.45))'
  },
  {
    layer_id: 'administrative',
    name: 'Faridabad District',
    properties: {
      type: 'district',
      population: 1800000,
      area_sqkm: 740,
      state: 'Haryana'
    },
    geom: 'POLYGON((77.30 28.35, 77.45 28.35, 77.45 28.45, 77.30 28.45, 77.30 28.35))'
  },
  {
    layer_id: 'administrative',
    name: 'Panipat District',
    properties: {
      type: 'district',
      population: 1200000,
      area_sqkm: 1250,
      state: 'Haryana'
    },
    geom: 'POLYGON((76.95 29.35, 77.10 29.35, 77.10 29.45, 76.95 29.45, 76.95 29.35))'
  },

  // Social Infrastructure - Hospitals
  {
    layer_id: 'social-infrastructure',
    name: 'Max Hospital Gurgaon',
    properties: {
      type: 'hospital',
      beds: 500,
      emergency: true,
      rating: 4.5,
      phone: '+91-124-4567890'
    },
    geom: 'POINT(76.98 28.48)'
  },
  {
    layer_id: 'social-infrastructure',
    name: 'Medanta Medicity Gurgaon',
    properties: {
      type: 'hospital',
      beds: 1200,
      emergency: true,
      rating: 4.8,
      phone: '+91-124-4567891'
    },
    geom: 'POINT(76.99 28.47)'
  },
  {
    layer_id: 'social-infrastructure',
    name: 'Fortis Hospital Faridabad',
    properties: {
      type: 'hospital',
      beds: 350,
      emergency: true,
      rating: 4.3,
      phone: '+91-129-4567890'
    },
    geom: 'POINT(77.32 28.40)'
  },
  {
    layer_id: 'social-infrastructure',
    name: 'Civil Hospital Panipat',
    properties: {
      type: 'hospital',
      beds: 200,
      emergency: true,
      rating: 3.8,
      phone: '+91-180-4567890'
    },
    geom: 'POINT(76.98 29.39)'
  },

  // Social Infrastructure - Schools
  {
    layer_id: 'social-infrastructure',
    name: 'Delhi Public School Gurgaon',
    properties: {
      type: 'school',
      students: 3000,
      level: 'K-12',
      rating: 4.6
    },
    geom: 'POINT(76.97 28.49)'
  },
  {
    layer_id: 'social-infrastructure',
    name: 'Amity International School Gurgaon',
    properties: {
      type: 'school',
      students: 2500,
      level: 'K-12',
      rating: 4.5
    },
    geom: 'POINT(76.96 28.50)'
  },
  {
    layer_id: 'social-infrastructure',
    name: 'DAV Public School Faridabad',
    properties: {
      type: 'school',
      students: 2000,
      level: 'K-12',
      rating: 4.2
    },
    geom: 'POINT(77.33 28.41)'
  },

  // Transportation
  {
    layer_id: 'transportation',
    name: 'Gurgaon Railway Station',
    properties: {
      type: 'railway_station',
      platforms: 6,
      daily_passengers: 50000
    },
    geom: 'POINT(76.97 28.47)'
  },
  {
    layer_id: 'transportation',
    name: 'Faridabad Railway Station',
    properties: {
      type: 'railway_station',
      platforms: 4,
      daily_passengers: 35000
    },
    geom: 'POINT(77.31 28.38)'
  },
  {
    layer_id: 'transportation',
    name: 'NH-48 Highway',
    properties: {
      type: 'highway',
      lanes: 6,
      length_km: 150
    },
    geom: 'LINESTRING(76.80 28.30, 77.50 28.30)'
  },
  {
    layer_id: 'transportation',
    name: 'Kundli-Manesar-Palwal Expressway',
    properties: {
      type: 'expressway',
      lanes: 4,
      length_km: 135
    },
    geom: 'LINESTRING(77.02 28.85, 77.02 28.30)'
  },

  // Utilities
  {
    layer_id: 'utilities',
    name: 'Gurgaon Power Substation',
    properties: {
      type: 'power_substation',
      capacity_mw: 500,
      operator: 'DHBVN'
    },
    geom: 'POINT(76.95 28.46)'
  },
  {
    layer_id: 'utilities',
    name: 'Faridabad Water Treatment Plant',
    properties: {
      type: 'water_treatment',
      capacity_mld: 200,
      operator: 'Haryana Jal Board'
    },
    geom: 'POINT(77.35 28.37)'
  },

  // Environmental
  {
    layer_id: 'environmental',
    name: 'Aravalli Biodiversity Park',
    properties: {
      type: 'protected_area',
      area_sqkm: 150,
      protection_level: 'high'
    },
    geom: 'POLYGON((76.90 28.40, 77.00 28.40, 77.00 28.50, 76.90 28.50, 76.90 28.40))'
  },
  {
    layer_id: 'environmental',
    name: 'Yamuna River Flood Zone',
    properties: {
      type: 'flood_zone',
      risk_level: 'medium',
      affected_districts: ['Faridabad', 'Palwal']
    },
    geom: 'POLYGON((77.25 28.25, 77.50 28.25, 77.50 28.35, 77.25 28.35, 77.25 28.25))'
  },

  // Cadastral
  {
    layer_id: 'cadastral',
    name: 'Sector 56 Gurgaon',
    properties: {
      type: 'residential_sector',
      area_sqkm: 2.5,
      plots: 500
    },
    geom: 'POLYGON((77.05 28.42, 77.10 28.42, 77.10 28.45, 77.05 28.45, 77.05 28.42))'
  },
  {
    layer_id: 'cadastral',
    name: 'Sector 21 Faridabad',
    properties: {
      type: 'residential_sector',
      area_sqkm: 1.8,
      plots: 350
    },
    geom: 'POLYGON((77.40 28.36, 77.45 28.36, 77.45 28.39, 77.40 28.39, 77.40 28.36))'
  },

  // Constituencies
  {
    layer_id: 'constituencies',
    name: 'Gurgaon Parliamentary Constituency',
    properties: {
      type: 'parliamentary',
      voter_population: 850000,
      area_sqkm: 450
    },
    geom: 'POLYGON((76.85 28.35, 77.15 28.35, 77.15 28.60, 76.85 28.60, 76.85 28.35))'
  },
  {
    layer_id: 'constituencies',
    name: 'Faridabad Parliamentary Constituency',
    properties: {
      type: 'parliamentary',
      voter_population: 920000,
      area_sqkm: 380
    },
    geom: 'POLYGON((77.20 28.25, 77.55 28.25, 77.55 28.50, 77.20 28.50, 77.20 28.25))'
  }
];

async function seedFeatures() {
  const pool = getPool();
  if (!pool) {
    console.error('DATABASE_URL not set. Please configure database connection.');
    process.exit(1);
  }

  try {
    console.log('Clearing existing features...');
    await pool.query('DELETE FROM features');
    
    console.log(`Inserting ${sampleFeatures.length} sample features...`);
    
    for (const feature of sampleFeatures) {
      const query = `
        INSERT INTO features (layer_id, name, properties, geom)
        VALUES ($1, $2, $3, ST_GeomFromText($4, 4326))
      `;
      await pool.query(query, [
        feature.layer_id,
        feature.name,
        JSON.stringify(feature.properties),
        feature.geom
      ]);
    }

    console.log('✅ Sample features seeded successfully!');
    
    // Verify count
    const result = await pool.query('SELECT COUNT(*) as count FROM features');
    console.log(`Total features in database: ${result.rows[0].count}`);
    
    // Show breakdown by layer
    const layerStats = await pool.query(`
      SELECT layer_id, COUNT(*) as count 
      FROM features 
      GROUP BY layer_id 
      ORDER BY layer_id
    `);
    console.log('\nFeatures by layer:');
    layerStats.rows.forEach(row => {
      console.log(`  ${row.layer_id}: ${row.count}`);
    });
    
  } catch (error) {
    console.error('Error seeding features:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedFeatures();
