-- Fix table names with typos and spaces
-- Run this script in your investmap database to fix naming issues

-- 1. Fix table name with space: 'sec_ug_electric_ line' -> 'sec_ug_electric_line'
ALTER TABLE "sec_ug_electric_ line" RENAME TO sec_ug_electric_line;

-- 2. Fix typo: 'eht_freeder' -> 'eht_feeder'
ALTER TABLE eht_freeder RENAME TO eht_feeder;

-- 3. Fix typo: 'distribution_tansformer' -> 'distribution_transformer'
ALTER TABLE distribution_tansformer RENAME TO distribution_transformer;

-- Verify the changes
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'sec_ug_electric_line', 
    'eht_feeder', 
    'distribution_transformer'
  )
ORDER BY tablename;