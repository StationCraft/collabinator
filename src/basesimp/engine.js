// BASESIMP ground-coupled foundation heat-loss engine.
//
// Faithful port of the BASESIMP algorithm (Ian Beausoleil-Morrison, July 27 1999)
// as implemented in the CSA-F280 BasementHLR / SlabOnGradeHLR workbooks. Basement
// and slab-on-grade share ONE algorithm (sheets BS1 + CORC + Config_Name + CornerCF);
// they differ only in (a) how the effective RSI is derived, (b) the interpolation
// WRSI constant, and (c) the final load-assembly line.
//
// This module is thin logic over four extracted data tables (see ./data/*.json).
// A coefficient revision is a DATA edit, not a code edit. The functions are pure:
// they take the data tables as arguments, so the module is runtime-agnostic
// (Node via fs, browser via a bundler JSON import — caller supplies `tables`).
//
// It is NOT wired into the Collabinator app. App hook-up is a separate future step.
// See ./GROUND_COUPLED_CONTRACT.md for the input/output contract.

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ROOM_TEMP_C = 22; // Troom (Foundation_Calc!F72 / slab Basement_temp)
const WRSI_BASEMENT = 2.29; // Foundation_Calc!B44
const WRSI_SLAB = 1.77; // Slab_Calc!B40
const INS_RSI_PER_M = 13.93; // Foundation_Calc!G117
// Wall/floor material RSI lookup (Foundation_Calc!B110:E111), keyed by HLOOKUP index.
const INS_MATERIAL = { 1: 0.116, 2: 0.0578, 3: 0.417, 4: 0.833 };

// --- table access ----------------------------------------------------------

function configByName(tables, name) {
  const rec = tables.coefficients[name];
  if (!rec) throw new Error(`BASESIMP: unknown config "${name}"`);
  return rec;
}

// Resolve the uninsulated reference variant (CORC col F, keyed by the selected
// config's iUnInsul package number → the config whose `num` matches).
function uninsulatedVariant(tables, rec) {
  const target = rec.iUnInsul;
  for (const name in tables.coefficients) {
    if (tables.coefficients[name].num === target) return tables.coefficients[name];
  }
  throw new Error(`BASESIMP: iUnInsul #${target} not found`);
}

// CornerCF row (19 factors, index 0 = cf1 … index 18 = cf19).
function cornerRow(tables, iuse) {
  const row = tables.cornerCf[String(Math.round(iuse))];
  if (!row) throw new Error(`BASESIMP: CornerCF row ${iuse} not found`);
  return row;
}

// --- shared shape-factor math (BS1) ----------------------------------------

// Corner-factor polynomial (BS1 r66-r70 steady / r104-r108 variable).
function cornerFactor(c, rs, soilk, wby2, dept, wtable) {
  const r1 = c[0] + c[1] * rs + c[2] * soilk + c[3] * wby2 + c[4] * dept + c[5] * wtable;
  const r2 = c[6] * rs * rs + c[7] * soilk * rs + c[8] * wby2 * rs + c[9] * wby2 * soilk + c[10] * wby2 * wby2;
  const r3 = c[11] * dept * rs + c[12] * dept * soilk + c[13] * dept * wby2 + c[14] * dept * dept;
  const r4 = c[15] * wtable * rs + c[16] * wtable * soilk + c[17] * wtable * wby2 + c[18] * wtable * dept;
  return r1 + r2 + r3 + r4;
}

// icol resolution for the 99 (auto) special case (BS1 r8-r19).
function resolveIcol(icol1, overlp, height, depth) {
  if (icol1 !== 99) return icol1;
  const wilen = height - depth + overlp;
  const welen = depth + 0.1;
  const ov6 = overlp / 0.6;
  if (ov6 <= 0.9999) return 4;
  if (ov6 > 0.9999 && welen / wilen > 1) return 5;
  if (ov6 > 0.9999 && welen / wilen <= 1) return 3;
  return 0;
}

// Coefficient set 1: the SELECTED config, evaluated at rsi1c = rsi2 (BS1 col B/C).
function shapeFactorsSet1(k, tables, rsi1c, length, width, height, depth, soilk, wtable, overlp) {
  const icol1 = k.CCF;
  const ic19 = resolveIcol(icol1, overlp, height, depth);
  const icol = ic19 === 98 ? 3 : ic19;
  const rss = Math.min(rsi1c, 5);
  const rs = ic19 === 98 ? 0 : rss;
  const widt = Math.min(width, 10);
  const wby2 = widt / 2;
  const dept = Math.min(depth, 2);
  const iuse = 2 * (icol - 1) + 1;
  const iusev = 2 * (icol - 1) + 2;
  const hd = height - depth;

  const up_o1 = (k.a1 + k.b1 * hd + k.cc1 / soilk) / Math.pow(rsi1c, k.d1);
  const up_o2 = 1 / (k.e1 + k.i1 * Math.pow(overlp, k.f1) * Math.pow(rsi1c, k.g1) * Math.pow(hd, k.h1));
  const sumuo = up_o1 * up_o2 + k.j1;
  const Sag = sumuo * 2 * (length + width);

  const ur1 = (k.q2 + k.rr2 * width) * (k.u2 + k.v2 * soilk) * (k.w2 + k.x2 * depth);
  const ur2 = Math.pow(wtable, k.s2 + k.t2 * width + k.y2 * depth);
  const ur3 = k.a2 * Math.pow(depth, k.b2) * Math.pow(soilk, k.cc2);
  const ur4 = Math.pow(wtable, k.d2) * Math.pow(rsi1c, k.e2 + k.f2 * soilk + k.g2 * depth + k.h2 * overlp);
  const sumur = ur1 / ur2 + ur3 / ur4;
  const Fcs = cornerFactor(cornerRow(tables, iuse), rs, soilk, wby2, dept, wtable);
  const Sbgavg = sumur * (2 * (length - width) + 4 * Fcs * width);

  const ap1 = k.a3 + k.b3 * soilk + k.cc3 * depth;
  const ap2 = k.e3 + k.f3 * soilk + k.g3 * depth;
  const ap3 = Math.pow(rsi1c, k.h3 + k.i3 * overlp);
  const atten = ap3 > 0 ? ap1 + ap2 / ap3 : ap1;
  const Fcv = cornerFactor(cornerRow(tables, iusev), rs, soilk, wby2, dept, wtable);
  const Sbgvar = atten * (2 * (length - width) + 4 * width * Fcv);

  const phase = k.a4 + k.b4 / Math.pow(rsi1c, k.cc4);
  return { Sag, Sbgavg, Sbgvar, phase };
}

// Coefficient set 2: the UNINSULATED variant, at rsi1c_2 = 0.01, rs_2 = 0 (BS1 col F/G).
// Set 2 uses the simplified forms present in the workbook (no /rsi1c^d1 on sumuo rpart1,
// wtable^d2 only on sumur rpart4, atten rpart3 = 1, phase = a4 + b4).
function shapeFactorsSet2(k2, tables, length, width, height, depth, soilk, wtable, overlp) {
  const rsi1c = 0.01;
  const rs = 0;
  const icol1 = k2.CCF;
  const ic19 = resolveIcol(icol1, overlp, height, depth);
  const icol = ic19 === 98 ? 3 : ic19;
  const widt = Math.min(width, 10);
  const wby2 = widt / 2;
  const dept = Math.min(depth, 2);
  const iuse = 2 * (icol - 1) + 1;
  const iusev = 2 * (icol - 1) + 2;
  const hd = height - depth;

  const up_o1 = k2.a1 + k2.b1 * hd + k2.cc1 / soilk;
  const up_o2 = 1 / (k2.e1 + k2.i1 * Math.pow(overlp, k2.f1) * Math.pow(rsi1c, k2.g1) * Math.pow(hd, k2.h1));
  const sumuo = up_o1 * up_o2 + k2.j1;
  const Sag = sumuo * 2 * (length + width);

  const ur1 = (k2.q2 + k2.rr2 * width) * (k2.u2 + k2.v2 * soilk) * (k2.w2 + k2.x2 * depth);
  const ur2 = Math.pow(wtable, k2.s2 + k2.t2 * width + k2.y2 * depth);
  const ur3 = k2.a2 * Math.pow(depth, k2.b2) * Math.pow(soilk, k2.cc2);
  const ur4 = Math.pow(wtable, k2.d2);
  const sumur = ur1 / ur2 + ur3 / ur4;
  const Fcs = cornerFactor(cornerRow(tables, iuse), rs, soilk, wby2, dept, wtable);
  const Sbgavg = sumur * (2 * (length - width) + 4 * Fcs * width);

  const ap1 = k2.a3 + k2.b3 * soilk + k2.cc3 * depth;
  const ap2 = k2.e3 + k2.f3 * soilk + k2.g3 * depth;
  const atten = ap1 + ap2; // rpart3 = 1
  const Fcv = cornerFactor(cornerRow(tables, iusev), rs, soilk, wby2, dept, wtable);
  const Sbgvar = atten * (2 * (length - width) + 4 * width * Fcv);

  const phase = k2.a4 + k2.b4;
  return { Sag, Sbgavg, Sbgvar, phase };
}

// --- climate / soil sine (Foundation_Calc r17-r37) --------------------------

function soilSine(temps, HDD) {
  let GM_S1 = 0;
  let GM_C1 = 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const omega = (Math.PI / 6) * (i + 1 - 0.5);
    GM_S1 += temps[i] * Math.sin(omega);
    GM_C1 += temps[i] * Math.cos(omega);
    sum += temps[i];
  }
  const A_a = sum / 12;
  const B_a = -Math.sqrt(GM_S1 * GM_S1 + GM_C1 * GM_C1) / 6;
  const P_a = Math.atan(GM_S1 / GM_C1);
  const A_s = A_a + 0.0009189 * HDD - 1.438;
  const B_s = -(B_a + 0.00197 * HDD - 7.8747);
  const P_s = P_a + 0.00002128 * HDD - 0.0756;
  return { A_s, B_s, P_s };
}

// Monthly variable-loss coefficient FHLmon for the design month (Foundation_Calc r54-r67).
function fhlmon(SbgVar_f, Phase_f, B_s, P_s, designMonth) {
  const Omega = (2 * Math.PI) / 365;
  const Ca1 = (SbgVar_f * B_s) / Omega;
  const Ca2 = Phase_f - 0.5 * Math.PI - P_s;
  const Ca3 = Math.cos(Ca2);
  let D = 0;
  let prevE = Ca3;
  let result = 0;
  for (let i = 0; i < 12; i++) {
    D += DAYS[i];
    const E = Math.cos(Omega * D + Ca2);
    const F = i === 0 ? Ca3 : prevE;
    const g = (Ca1 * (F - E)) / DAYS[i];
    if (i + 1 === designMonth) result = g;
    prevE = E;
  }
  return result;
}

// Basement overlap distance (Foundation_Calc r98-r103), keyed by config package number.
function basementOverlap(num, depth, overlapEntered) {
  if (num === 11 || num === 12 || num === 116 || num === 117) return overlapEntered || 0;
  if (num === 93 || num === 95 || num === 114 || num === 115) return 0.6;
  if (num === 94 || num === 96) return depth - 0.2;
  if (num === 68 || num === 69 || num === 92) return depth - 0.6;
  return 0;
}

// Inflag from the interior/exterior/slab insulation flags (CORC r52-r59).
function deriveInflag(f6, f7, f8) {
  let inflag = 0;
  if (f6 < 1 && f7 < 1) inflag += 1;
  if (f6 < 1 && f7 > 0 && f8 < 1) inflag += 2;
  if (f6 < 1 && f7 > 0 && f8 > 0) inflag += 3;
  if (f6 > 0 && f7 > 0 && f8 < 1) inflag += 4;
  if (f6 > 0 && f7 < 1 && f8 < 1) inflag += 2;
  if (f6 > 0 && f7 < 1 && f8 > 0) inflag += 3;
  if (f6 > 0 && f7 > 0 && f8 > 0) inflag += 5;
  return inflag;
}

// Effective wall RSI from Inflag (Foundation_Calc r2-r8).
function effectiveRsiBasement(inflag, insE, insI, addedRsi) {
  switch (inflag) {
    case 1: return 0;
    case 2: return Math.max(insE, insI);
    case 3: return 0.88 * Math.max(insI, insE) + 0.12 * addedRsi;
    case 4: return insE + insI;
    case 5: return (insE + insI) * 0.44 + 0.12 * addedRsi;
    default: return 0;
  }
}

/**
 * Compute ground-coupled foundation heat loss (Watts) for the design heating month.
 *
 * @param {object} input  see GROUND_COUPLED_CONTRACT.md (BASESIMP-shaped fields)
 * @param {object} tables { coefficients, cornerCf } — the extracted data tables
 * @returns {object} { load_W, sag, sbgAvg, sbgVar, phase, fhlmon, exposedFraction,
 *                      inflag, rsiEffective, radiantSlabTempC }
 */
export function computeGroundCoupledLoss(input, tables) {
  const isBasement = input.isBasement;
  const k = configByName(tables, input.config);
  const k2 = uninsulatedVariant(tables, k);

  // Sorted plan dimensions (Foundation_Selection B335/B336).
  const length = Math.max(input.length, input.width);
  const width = Math.min(input.length, input.width);
  const height = input.height;
  const depth = input.depth;
  const soilk = input.soilConductivity;
  const wtable = input.waterTableDepth;
  const insE = input.insExterior || 0;
  const insI = input.insInterior || 0;
  const addedRsi = input.addedRsi || 0; // Foundation_Selection rsi1 (slab wall/floor selection RSI)

  // --- effective RSI + interpolation regime -------------------------------
  let rsiGate; // value the interpolation gate + denom test against
  let rsi2; // rsi1c used by set 1
  let WRSI;
  let overlp;
  let inflag = null;
  if (isBasement) {
    overlp = basementOverlap(k.num, depth, input.overlapEntered);
    inflag = deriveInflag(k.iFndFlag6, k.iFndFlag7, k.iFndFlag8);
    const rsiTotal = effectiveRsiBasement(inflag, insE, insI, addedRsi);
    rsiGate = rsiTotal;
    rsi2 = rsiTotal > 1.5 ? rsiTotal : 1.5;
    WRSI = WRSI_BASEMENT;
  } else {
    overlp = input.overlp || 0;
    rsiGate = addedRsi; // slab rsi1 comes straight from the selection
    rsi2 = addedRsi > 1.5 ? addedRsi : 1.5;
    WRSI = WRSI_SLAB;
  }

  const s1 = shapeFactorsSet1(k, tables, rsi2, length, width, height, depth, soilk, wtable, overlp);
  const s2 = shapeFactorsSet2(k2, tables, length, width, height, depth, soilk, wtable, overlp);

  const gate = rsiGate > 0.01 && rsiGate < 1.501;
  const denom = Math.exp(WRSI * rsiGate);
  const interp = (v1, v2) => (gate ? v1 + (v2 - v1) / denom : v1);
  const Sag_f = interp(s1.Sag, s2.Sag);
  const SbgAvg_f = interp(s1.Sbgavg, s2.Sbgavg);
  const SbgVar_f = interp(s1.Sbgvar, s2.Sbgvar);
  const Phase_f = interp(s1.phase, s2.phase);

  // --- climate ------------------------------------------------------------
  const { B_s, P_s } = soilSine(input.monthlyTemps, input.HDD);
  const FHL = fhlmon(SbgVar_f, Phase_f, B_s, P_s, input.designHeatingMonth);

  // --- exposed fraction ---------------------------------------------------
  const perim = 2 * (length + width);
  const ep = input.exposedPerimeter > 0 ? input.exposedPerimeter : perim;
  const exposedFraction = Math.min(1, Math.max(ep / perim, 0));

  const Tsoil = input.soilMeanT;
  const DBT = input.designHeatingDBT;

  // --- load assembly (the one line that differs between foundation types) --
  let load_W;
  let radiantSlabTempC = null;
  if (isBasement) {
    const win = input.windowArea || 0;
    const door = input.doorArea || 0;
    const radFrac = input.radiantFraction || 0;
    const fluid = input.fluidTemp || 0;
    radiantSlabTempC = fluid > 0 ? ROOM_TEMP_C + radFrac * (fluid - ROOM_TEMP_C) : 0;

    const Abwag = (height - depth) * 2 * (length + width);
    const Agfr = (Abwag - door - win) / Abwag;

    // Radiant-slab wall/floor split (Foundation_Calc r108-r129).
    const insWall = INS_MATERIAL[2 * k.iFndFlag4 + 1];
    const insFloor = INS_MATERIAL[2 * k.iFndFlag5 + 2];
    const rValWalls = insE + insI + insWall;
    const thick = rValWalls / INS_RSI_PER_M;
    const iL = input.length - 2 * thick;
    const iW = input.width - 2 * thick;
    const iFloorArea = iL * iW;
    const Uwalls = (depth * 2 * (iL + iW)) / rValWalls;
    const rValFloor = addedRsi + insFloor;
    const Ufloor = iFloorArea / rValFloor;
    const uVal = Math.max(Uwalls + Ufloor, 0.1);
    const alpha2 = radFrac > 0 ? (SbgAvg_f * Uwalls) / uVal : SbgAvg_f;
    const alpha3 = radFrac > 0 ? (SbgAvg_f * Ufloor) / uVal : 0;

    load_W =
      (Sag_f * (ROOM_TEMP_C - DBT) * Agfr +
        FHL +
        alpha2 * (ROOM_TEMP_C - Tsoil) +
        alpha3 * (radiantSlabTempC - Tsoil)) *
      exposedFraction;
  } else {
    load_W =
      (Sag_f * (ROOM_TEMP_C - DBT) + FHL + SbgAvg_f * (ROOM_TEMP_C - Tsoil)) * exposedFraction;
  }

  return {
    load_W,
    sag: Sag_f,
    sbgAvg: SbgAvg_f,
    sbgVar: SbgVar_f,
    phase: Phase_f,
    fhlmon: FHL,
    exposedFraction,
    inflag,
    rsiEffective: rsiGate,
    radiantSlabTempC,
  };
}
