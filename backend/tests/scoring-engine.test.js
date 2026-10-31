const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  saturatingScore,
  computeInfrastructureScore,
  computeEnvironmentalScore,
  computeOverallScore,
  getSectorWeights,
  normalizeSector,
} = require('../src/services/scoring-engine');

describe('scoring-engine v2', () => {
  test('infrastructure differentiates moderate vs ultra-dense counts', () => {
    const moderate = computeInfrastructureScore({ hospitals: 7, schools: 10, civicFacilities: 2, iti: 1 });
    const dense = computeInfrastructureScore({ hospitals: 21, schools: 20, civicFacilities: 6, iti: 2 });
    assert.ok(dense.score > moderate.score);
    assert.ok(moderate.score < 90);
    assert.ok(dense.score < 100);
  });

  test('environmental score includes air-quality proxy', () => {
    const rural = computeEnvironmentalScore({
      nearestForestKm: 8,
      nearestLowLyingAreaKm: 8,
      nearestWaterBodyKm: 4,
      nearestMunicipalBoundaryKm: 25,
      nearestIndustrialZoneKm: 15,
      roadsWithin3Km: 2,
    });
    const urbanIndustrial = computeEnvironmentalScore({
      nearestForestKm: 8,
      nearestLowLyingAreaKm: 8,
      nearestWaterBodyKm: 4,
      nearestMunicipalBoundaryKm: 1,
      nearestIndustrialZoneKm: 1,
      roadsWithin3Km: 12,
    });
    assert.ok(rural.score > urbanIndustrial.score);
    assert.ok(urbanIndustrial.metrics.airQualityRisk > 0);
    assert.equal(urbanIndustrial.metrics.airQualitySource, 'spatial_proxy');
  });

  test('sector weights change overall score for same components', () => {
    const scores = {
      infrastructure: 80,
      accessibility: 70,
      environmentalRisk: 60,
      zoneCompatibility: 55,
    };
    const industrial = computeOverallScore(scores, 'industrial');
    const residential = computeOverallScore(scores, 'residential');
    assert.notEqual(industrial.overallScore, residential.overallScore);
    assert.equal(getSectorWeights('industrial').accessibility, 0.35);
    assert.equal(getSectorWeights('residential').infrastructure, 0.35);
  });

  test('normalizeSector falls back to industrial', () => {
    assert.equal(normalizeSector('unknown'), 'industrial');
    assert.equal(normalizeSector('Commercial'), 'commercial');
  });

  test('saturatingScore grows sub-linearly', () => {
    assert.ok(saturatingScore(50) > saturatingScore(25));
    assert.ok(saturatingScore(100) - saturatingScore(50) < saturatingScore(50) - saturatingScore(0));
  });
});
