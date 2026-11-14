import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compassBearing,
  evaluateAlertRules,
  findNearestStation,
  getAqiCategory,
  haversineDistanceKm,
  intensityToRgba,
  interpolateIdwProjected,
  interpolateIdwValue,
  normalizeMetricIntensity,
  pm25ToUsAqi,
} from './aqi';
import type { AirAlert, AlertRule, SensorStation } from '../types/aqi';

const mockStations: SensorStation[] = [
  {
    id: 'st-a',
    name: 'Bayshore Pier',
    district: 'Waterfront',
    x: 100,
    y: 100,
    lat: 37.8,
    lon: -122.4,
    elevationM: 12,
    environmentType: 'Coastal',
    spatialBias: 0.85,
    readings: { aqi: 34, pm25: 8.2, pm10: 16.4, o3: 48, no2: 14, so2: 4, co: 0.4 },
    updatedAt: '2026-11-13T22:00:00Z',
    trendDelta: -2,
  },
  {
    id: 'st-b',
    name: 'East Corridor',
    district: 'Industrial',
    x: 500,
    y: 500,
    lat: 37.75,
    lon: -122.3,
    elevationM: 48,
    environmentType: 'Industrial',
    spatialBias: 1.35,
    readings: { aqi: 138, pm25: 50.4, pm10: 88.2, o3: 92, no2: 68, so2: 18, co: 1.4 },
    updatedAt: '2026-11-13T22:00:00Z',
    trendDelta: 11,
  },
];

test('getAqiCategory classifies all EPA threshold boundaries accurately', () => {
  assert.equal(getAqiCategory(0).severity, 'good');
  assert.equal(getAqiCategory(50).severity, 'good');
  assert.equal(getAqiCategory(51).severity, 'moderate');
  assert.equal(getAqiCategory(100).severity, 'moderate');
  assert.equal(getAqiCategory(101).severity, 'sensitive');
  assert.equal(getAqiCategory(150).severity, 'sensitive');
  assert.equal(getAqiCategory(151).severity, 'unhealthy');
  assert.equal(getAqiCategory(200).severity, 'unhealthy');
  assert.equal(getAqiCategory(201).severity, 'very_unhealthy');
  assert.equal(getAqiCategory(300).severity, 'very_unhealthy');
  assert.equal(getAqiCategory(301).severity, 'hazardous');
});

test('interpolateIdwValue returns exact reading at station coordinates and blends midpoints', () => {
  const atA = interpolateIdwValue(100, 100, mockStations, 'aqi');
  const atB = interpolateIdwValue(500, 500, mockStations, 'aqi');
  const midpoint = interpolateIdwValue(300, 300, mockStations, 'aqi');

  assert.equal(atA, 34);
  assert.equal(atB, 138);
  assert.ok(Math.abs(midpoint - 86) < 0.01, `Expected ~86, got ${midpoint}`);
});

test('interpolateIdwProjected blends projected pixel coordinates accurately', () => {
  const pts = [
    { px: 10, py: 20, value: 40 },
    { px: 90, py: 20, value: 120 },
  ];
  assert.equal(interpolateIdwProjected(10, 20, pts), 40);
  assert.equal(interpolateIdwProjected(90, 20, pts), 120);
  const mid = interpolateIdwProjected(50, 20, pts);
  assert.ok(Math.abs(mid - 80) < 0.01, `Expected ~80, got ${mid}`);
});

test('normalizeMetricIntensity and intensityToRgba stay bounded', () => {
  assert.equal(normalizeMetricIntensity(-5, 'aqi'), 0);
  assert.equal(normalizeMetricIntensity(999, 'aqi'), 1);

  const [r, g, b, a] = intensityToRgba(0.5, 1);
  assert.ok(r >= 0 && r <= 255);
  assert.ok(g >= 0 && g <= 255);
  assert.ok(b >= 0 && b <= 255);
  assert.ok(a > 0 && a <= 255);
});

test('evaluateAlertRules fires on breach and respects cooldown deduplication', () => {
  const rules: AlertRule[] = [
    {
      id: 'rule-1',
      label: 'AQI > 100',
      metric: 'aqi',
      threshold: 100,
      enabled: true,
      notifyDesktop: true,
    },
    {
      id: 'rule-2',
      label: 'Disabled rule',
      metric: 'pm25',
      threshold: 5,
      enabled: false,
      notifyDesktop: false,
    },
  ];

  const t0 = Date.parse('2026-11-13T22:05:00Z');
  const firstPass = evaluateAlertRules(mockStations, rules, [], 'San Francisco Bay', t0);
  assert.equal(firstPass.length, 1);
  assert.equal(firstPass[0].stationId, 'st-b');
  assert.equal(firstPass[0].value, 138);

  // Second pass immediately after should deduplicate because alert is still active
  const secondPass = evaluateAlertRules(mockStations, rules, firstPass, 'San Francisco Bay', t0 + 1000);
  assert.equal(secondPass.length, 0);

  // Even if acknowledged, cooldown prevents re-firing within 90s
  const acknowledged: AirAlert[] = [{ ...firstPass[0], acknowledged: true }];
  const withinCooldown = evaluateAlertRules(mockStations, rules, acknowledged, 'San Francisco Bay', t0 + 20_000);
  assert.equal(withinCooldown.length, 0);

  // After cooldown passes, acknowledged rule can fire again if threshold remains breached
  const afterCooldown = evaluateAlertRules(mockStations, rules, acknowledged, 'San Francisco Bay', t0 + 100_000);
  assert.equal(afterCooldown.length, 1);
});

test('haversineDistanceKm, compassBearing, pm25ToUsAqi, and findNearestStation compute accurate values', () => {
  assert.equal(haversineDistanceKm(37.7749, -122.4194, 37.7749, -122.4194), 0);
  // SF to Oakland Port (~10-14 km ENE)
  const dist = haversineDistanceKm(37.7749, -122.4194, 37.8091, -122.3095);
  assert.ok(dist > 9 && dist < 13, `Expected 9..13 km, got ${dist}`);
  const sfToOak = compassBearing(37.7749, -122.4194, 37.8091, -122.3095);
  assert.ok(sfToOak === 'E' || sfToOak === 'NE', `Expected E or NE, got ${sfToOak}`);
  assert.equal(compassBearing(0, 0, 1, 0), 'N');
  assert.equal(compassBearing(0, 0, 0, 1), 'E');
  assert.equal(compassBearing(0, 0, -1, 0), 'S');

  assert.equal(pm25ToUsAqi(0), 0);
  assert.equal(pm25ToUsAqi(9.0), 50);
  assert.equal(pm25ToUsAqi(35.4), 100);
  assert.equal(pm25ToUsAqi(55.4), 150);

  const nearest = findNearestStation(37.74, -122.29, mockStations);
  assert.ok(nearest !== null);
  assert.equal(nearest!.station.id, 'st-b');
  assert.ok(nearest!.distanceKm < 3);
});

