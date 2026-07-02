// BASESIMP acceptance test — reproduces documented worked examples to the watt.
//
// Self-contained Node runner (no test framework). Run:  node src/basesimp/acceptance.test.js
// Exits 0 if every case is within TOL of its expected value, 1 otherwise.
//
// Climate is now sourced FROM weather.json via the engine's station lookup: each case
// names the Winnipeg, MB station key and the design heating month (January). The engine
// pulls DHDBT / DGTEMP / DegDay / 12 monthly temps from the table.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeGroundCoupledLoss } from './engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(HERE, 'data', name), 'utf8'));
const tables = {
  coefficients: load('coefficients.json'),
  cornerCf: load('corner_cf.json'),
  weather: load('weather.json'),
};

const TOL = 0.01; // Watts

// Guard the extraction itself: the Winnipeg record read from weather.json must carry
// the design values the previously-hard-coded acceptance climate used.
const WPG = tables.weather['Winnipeg|||MB'];
{
  const bad = [];
  if (!WPG) bad.push('Winnipeg|||MB missing from weather.json');
  else {
    if (WPG.degDay !== 5670) bad.push(`degDay ${WPG.degDay} !== 5670`);
    if (WPG.dhdbt !== -33) bad.push(`dhdbt ${WPG.dhdbt} !== -33`);
    if (WPG.dgtemp !== 6) bad.push(`dgtemp ${WPG.dgtemp} !== 6`);
  }
  if (bad.length) {
    console.log('✗ weather.json Winnipeg extraction guard FAILED: ' + bad.join('; '));
    process.exit(1);
  }
  console.log('✓ weather.json Winnipeg guard: DegDay 5670, DHDBT -33, DGTEMP 6\n');
}

// Shared Winnipeg January design climate — resolved by the engine from weather.json.
const WINNIPEG_JAN = {
  station: 'Winnipeg|||MB',
  designHeatingMonth: 1,
};

const cases = [
  {
    name: 'BASEMENT BCIN_3 (workbook worked example)',
    expected: 3156.523856706508,
    input: {
      isBasement: true,
      config: 'BCIN_3',
      length: 12.4,
      width: 6.4,
      height: 2.5,
      depth: 1.75,
      exposedPerimeter: 0, // 0 => full perimeter
      soilConductivity: 0.85,
      waterTableDepth: 8,
      windowArea: 0,
      doorArea: 0,
      radiantFraction: 0.9,
      fluidTemp: 33,
      ...WINNIPEG_JAN,
    },
  },
  {
    name: 'BASEMENT BCIN_1 (prompt-named config; same inputs)',
    expected: 2505.020615196956,
    input: {
      isBasement: true,
      config: 'BCIN_1',
      length: 12.4,
      width: 6.4,
      height: 2.5,
      depth: 1.75,
      exposedPerimeter: 0,
      soilConductivity: 0.85,
      waterTableDepth: 8,
      windowArea: 0,
      doorArea: 0,
      radiantFraction: 0.9,
      fluidTemp: 33,
      ...WINNIPEG_JAN,
    },
  },
  {
    name: 'SLAB-ON-GRADE SCB_33 (workbook worked example)',
    expected: 500.6861598813198,
    input: {
      isBasement: false,
      config: 'SCB_33',
      length: 12.1,
      width: 6.1,
      height: 0,
      depth: 0.05,
      exposedPerimeter: 0,
      soilConductivity: 0.85,
      waterTableDepth: 8,
      ...WINNIPEG_JAN,
    },
  },
];

let failures = 0;
console.log('BASESIMP acceptance test — tolerance ±' + TOL + ' W\n');
for (const c of cases) {
  const r = computeGroundCoupledLoss(c.input, tables);
  const got = r.load_W;
  const diff = Math.abs(got - c.expected);
  const pass = diff <= TOL;
  if (!pass) failures++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${c.name}\n` +
      `        computed = ${got.toFixed(6)} W   expected = ${c.expected.toFixed(6)} W   |Δ| = ${diff.toExponential(3)} W`
  );
}

console.log(
  failures === 0
    ? `\n✓ ALL ${cases.length} cases PASSED`
    : `\n✗ ${failures}/${cases.length} cases FAILED`
);
process.exit(failures === 0 ? 0 : 1);
