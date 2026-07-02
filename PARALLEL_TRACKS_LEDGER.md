# Collabinator — Parallel Tracks Ledger

*Single shared record between the MAIN path (this repo) and the TOOLS track (multiple
standalone repos — see Track B section).*

---

## WRITER RULE (enforced, not optional)

**This ledger has exactly ONE writer: the MAIN-path code session (Claude Code in
`C:\dev\collabinator`).**

The TOOLS-track session NEVER edits this file. It reports status in prose to its own planning
chat; that chat relays the update here. This prevents two code sessions from editing the same
file concurrently and eliminates merge conflicts between the two repos.

---

## TRACK A — MAIN PATH

**Repo:** `C:\dev\collabinator`

**Owns:**
- Everything in the Collabinator app: geometry, `deriveEnumeration` / `deriveWireframe`,
  surfaces, thickness render, `insideFaceAreaM2`, the `getSurfaceAssembly` seam
- Assembly INGEST in Collabinator: `assemblyLibraryRef` + `ingestAssembly`
- The upcoming F280 endpoint and all downstream consumers of thermal data

**Done (assembly/thermal track):**

| Slice | Description | Commit | Date |
|-------|-------------|--------|------|
| Slice 1 | Per-surface assembly assignment — data layer; two-tier manual/library resolver; `surfaceAssemblyRef`; `getSurfaceAssembly`; harness checks (j)+(k) | `6d849f1` | 2026-06-28 |
| Slice 2 | Contract ingest — geometry-scoped fields (`assemblyId`, `label`, `assemblyType`, `totalThicknessM`, `layers[]`); `ingestAssembly`; `__ingestAssembly` DEV hook; silently ignores thermal fields (forward-compat) | `6dab52d` | 2026-06-28 |
| Slice 3 | 3D wall-panel render (`totalThicknessM` → solid panels in ThreeDView; assemblyType-driven growth direction); `insideFaceAreaM2` derived in STEP A; TDZ fix | `8f1dd30` | 2026-06-28 |
| Slice 4 | Thermal-field ingest: `effectiveUValue`, `effectiveRSI`, `controlLayers` stored in `assemblyLibraryRef`; `getSurfaceAssembly` returns all three; `deriveEnumeration` STEP A pushes them onto wall-surface elements; null preservation verified; harness 17/17 → 24/24 PASS | (this session) | 2026-06-28 |
| Slice 5 | F280 climate layer: `src/data/f280-weather.json` (679 stations national); `location-station` + `toh-override` CONFIG_FIELDS; `resolve-toh` cross-field rule in `resolveEffectiveConfig`; `kind:'number'` panel render branch; `__verifyToh()` 6/6 PASS | `e7a52bf` | 2026-06-28 |
| Slice 6 | Flat-roof ceiling surface in `deriveEnumeration()` STEP A.5: shoelace area of `roofType:'flat'` polygons in world meters, one `flat-roof-surface` element per confirmed roof page; `insideFaceAreaM2`, `roofCeilingZm`, full assembly seam. Harness check (s)/(s.area) added; 44/44 PASS. | `dccce9e` | 2026-06-28 |
| Slice 7 | F280 above-grade conductive endpoint: `deriveF280Heating(enumeration, resolvedConfig)` — pure derive-on-demand; `F280_TI_HEATING=22`; four surface kinds (wall/flat-roof/window/door); no-climate guard; `notModeled[]` explicit incompleteness list; extensible spine. F280 Results sidebar tab + panel. `__dumpF280()` DEV hook. NOT golden-gated. Strategic pivot: "nearly-compliant sooner." Building paused for geometry review. | (Session 56) | 2026-06-29 |
| Slice 8 | #106 assembly-inheritance default: `ASSEMBLY_TYPE_DEFAULTS` lookup (8 keys, placeholder 1/R U-values, thickness null); `getSurfaceAssembly` miss-path returns `source:'project-default'` from Project Setup `assembly-wall`/`assembly-roof` (foundation/floor stubbed); precedence manual/library > project-default > unset; four non-miss paths byte-for-byte unchanged; `.enum-assembly-inherited` amber-italic Envelope row. Verified: `__verifyFixture` 44/44; wall `unresolvedCount` 8→0 on configured wall. Mechanism-only (values pass pending; `2x6-r22-ext2` flagged = base wall under literal rule). | `f2d5a57` | 2026-07-01 |
| Slice 9 | Below-grade + slab GEOMETRY (geometry-only, NO loss math): `deriveEnumeration` STEP A.6 `slab-surface` (lowest-floor footprint → `grossAreaM2` shoelace + `soilContactPerimeterM` + `floorZm`; inherits `assembly-floor`) + STEP A.7 `below-grade-wall` (#41 principle→BUILT: grade-line vertices → world-Z via `elevYToWorldZ` vs reference-edge `floorZm` → `belowGradeHeightM`/`belowGradeWallAreaM2`; inherits `assembly-foundation`; grade-Z v1 = mean vertex Z; #88 single-ref-edge limitation; honest-absence guards; wall polygon NEVER carved). `foundation-`/`floor-` `getSurfaceAssembly` stubs now live. Envelope panel + `__dumpEnumeration` branches. `notModeled[]`/`deriveF280Heating` UNTOUCHED. Verified: `__verifyFixture` 44/44; slab area/perimeter cross-checked EXACT; below-grade honest-absence (no fixture grade line); slab `project-default U=0.0455` under `eng-i-joist`. | `afd0c58` | 2026-07-01 |
| Slice 10 | **BASESIMP ground-coupled engine (in-tree, ISOLATED under `src/basesimp/`)** — nothing imports it, no existing file touched. Full Beausoleil-Morrison 1999 algorithm, basement + slab sharing one BS1/CORC shape-factor engine, as thin logic over four extracted JSON data tables (`coefficients.json` 145 packages / `corner_cf.json` / `config_decode.json` / `form_data.json`; a coefficient revision is a data edit). Effective-RSI/Inflag, Sag/SbgAvg/SbgVar/Phase + corner-factor lookups + set-1/set-2 RSI interpolation, climate/soil sine + FHLmon, two load-assembly lines. Contract at `src/basesimp/GROUND_COUPLED_CONTRACT.md`. `_source/` workbooks gitignored (proprietary; derived JSON only, per F280-weather precedent). Acceptance test 3/3 to <1e-11 W: BCIN_3 = 3156.52 W, BCIN_1 = 2505.02 W (prompt named BCIN_1 but 3156.52 is BCIN_3 — both asserted), SCB_33 = 500.69 W. Climate hard-coded to Winnipeg Jan in the test only (full `Foundation_Weather` extraction pending). NOT wired into the app. | `a9ad4cb` | 2026-07-01 |
| Slice 12 | **BASESIMP wired into the app — Stage 1 (function now, package-decode fidelity later).** The interim Model-B `deriveGroundCoupledLoss` is REPLACED by an ADAPTER around `src/basesimp/engine.js` (`computeGroundCoupledLoss`), tables bundled as JSON imports (`BASESIMP_TABLES`). Call-site restructure: per-surface `k·U·A·ΔT` summation → ONE WHOLE-FOUNDATION BOX per building (F280 shape-factors are per-foundation, not per-wall), one engine call. Foundation = whole lowest-floor footprint (the `slab-surface` element). STEP A.6 gains `footprintLengthM/WidthM` (bbox of already-converted world vertices — no new px↔m math). New Site CONFIG_FIELDS: `water-table-depth` (8 m), `design-heating-month` (Jan). `isBasement` v1 heuristic (below-grade wall > 0.6 m). Climate reused via the `station` key verbatim (engine's `resolveClimate` reproduces `toh`/`dgtemp` — no second path; 679/679 key-identical). **STAGE-1 STUB:** config package HARDCODED (`BCIN_3` basement / `SCB_33` slab; `ins*`=0, radiant=0) → engine-EXACT but assembly-GENERIC (suffix swings ~26%; Stage-2 = package-decode surface, ADDITIONAL_FUNC #131). `notModeled[]` sheds `below-grade-wall`+`slab-on-grade` on resolve. F280 panel + `__dumpF280` per-kind table → single whole-foundation figure. Harness re-anchored: `__verifyFixture` 56/56 (gc a–l guard the WIRE, not engine math — slab synthEnum reproduces SCB_33 500.6862 W; basement box == direct engine call). Verified (preview): fixture slab SCB_33 = 178.8 W; no-ground keeps all four `notModeled`; panel renders; zero console errors. §5 approximations logged (package stub, one-box collapse, bbox overstatement, mean grade-Z, water-table default). | `4f6be45` | 2026-07-01 |
| Slice 11 | **BASESIMP weather-table extraction + climate-by-station lookup** — engine now thin logic over FIVE data tables: `weather.json` added (679 climate stations, keyed `"City\|\|\|Region"` composite; each record carries `region`, `degDay`→HDD, `dhdbt`→designHeatingDBT, `dgtemp`→soilMeanT, `monthlyTemps` Jan…Dec). Extracted from `BasementHLR.xlsx` `Foundation_Weather` (header r3, data r4–682; 50 all-zero padding rows excluded); slab `Slab_Weather` (header r2) confirmed **byte-for-byte identical** station-for-station across all 23 cols × 729 rows, so one weather table serves both. No composite-key collision. New `resolveClimate(input, tables)` seam in `engine.js`: default path = `station` lookup; explicit climate fields on `input` override; all-four bypasses table; `designHeatingMonth` never from table. Acceptance rewired to source Winnipeg climate FROM the table (`station:'Winnipeg\|\|\|MB'`) — still 3/3 to floating-point precision (BCIN_3 = 3156.52 W, BCIN_1 = 2505.02 W, SCB_33 = 500.69 W) + a guard asserting the extracted Winnipeg record reads DegDay 5670 / DHDBT −33 / DGTEMP 6. Contract updated (five-table note + `station` input row + override doc). Still ISOLATED — nothing imports it, no existing file touched. NOT wired into the app. | `5b50384` | 2026-07-01 |

**Deferred / logged:**
- #96 — wall corner reconciliation (solid interpenetration + inside-face area overcount; overcount accepted for initial F280 pass)
- ~~#99~~ — RESOLVED (Session 52): opening thermal fields (`uw`/`shgc`) added to opening record; `getRsiW` engine-internal; door SHGC = 0 (opaque-by-model). F280 gate lifted.
- #103 — window-builder selector (Table 6E–6H fallback lookup; deferred)
- #104 — glazed-in-door as parented sub-item (deferred)
- #105 — climate-change resiliency mode (extreme-Toh toggle alongside compliant result; gated on F280 endpoint + this Toh layer — both now present)

**Next (Track A):**
- Geometry back-to-basics review — DONE (geometry-stable review passed, Session 70).
- ~~#106 assembly-inheritance fix~~ — DONE (Session 75; Slice 8; commit `f2d5a57`).
- ~~#108 window/door uw+shgc post-placement edit~~ + ~~`ti-heating` CONFIG_FIELD~~ — DONE (Session 76; commit `44615f2`). Last hardcoded F280 input (Ti) retired.
- ~~#107 flat-roof explicit per-surface U-input UI~~ — DONE (shipped Session 76; commit `c8857b6`; S76 close-out missed marking it, reconciled in-session). Thermal arc base case now FULLY CLOSED in code and docs.
- ~~below-grade + slab geometry~~ — DONE (Session 77; Slice 9; commit `afd0c58`). Geometry-only; `notModeled[]` unchanged.
- ~~ground-coupled loss engine~~ — full BASESIMP engine BUILT standalone in-tree (Slice 10; `src/basesimp/`; commit `a9ad4cb`). Reproduces `BasementHLR`/`SlabOnGradeHLR` worked examples to the watt. NOT yet wired.
- ~~extract full `Foundation_Weather` station table~~ — DONE (Slice 11; commit `5b50384`). 679 stations in `weather.json`; climate resolved by `"City\|\|\|Region"` station key with explicit-climate override; acceptance now sources climate from the table (still 3/3). Slab weather confirmed identical to basement — one table serves both.
- ~~wire BASESIMP into the app~~ — DONE (Slice 12; Session 79; commit `4f6be45`). Stage 1: `deriveGroundCoupledLoss` is now the whole-box adapter around `computeGroundCoupledLoss`, fed the Slice-9 `slab-surface` footprint + `below-grade-wall` quantities + the live `location-station` climate key. Engine-exact but assembly-generic (package hardcoded — Stage 1).
- Remaining (NOW/NEXT): **Stage-2 package-decode surface** (ADDITIONAL_FUNC #131) — replace the hardcoded `GROUND_COUPLED_PKG_*` default + wire the `insExterior/insInterior/addedRsi` RSI split (foundation-config surface OR curated assembly→package lookup; ~26% suffix swing makes it fidelity-critical). Then solar gain (cooling endpoint #130).
- Ground-coupled F280 note: `BasementHLR.xls` / `SlabOnGradeHLR.xls` are standalone supplemental calculators (separate from above-grade). The BASESIMP port IS the workbook method (compliance-grade), superseding the interim base-level `U·A·ΔT` placeholder once wired. It is the first engine to remove entries from `notModeled[]`.

---

## TRACK C — F280 SIDE-QUEST

**Repo:** `C:\dev\CollabinatorF280`
**Remote:** `https://github.com/StationCraft/CollabinatorF280.git` (private, branch `master`)
**Writer rule:** Track A (this session) **READS ONLY** — never commits, pushes, or modifies files in this repo or its remote. The F280 side-quest is its sole author.

| Item | Description | Commit | Status |
|------|-------------|--------|--------|
| F280_COMPLIANCE_SPEC.md | Plain-language compliance spec digested from CSA F280:12 — scope, heating/cooling formulas, 13-surface required-data inventory, opening RSI_W/SHGC contract, gap-analysis checklist | `d94c18a` | CURRENT — read Session 52 |

**Consumed by Track A (Session 52):** Section 4 (opening RSI_W/SHGC contract) — `uw` field (W/m²·K) and `shgc` (dimensionless) added to opening records; `getRsiW` engine-internal. #99 resolved.

**Side-quest currently parked.** `#103` (window-builder 6E–6H descriptor lookup) logged and deferred. No active F280 side-quest build.

---

## TRACK B — TOOLS

Track B is **not a single repo** — it is a collection of standalone tool repos, each closed
with its own verified contract. Future side-quests spin up new repos under the same pattern.

### Repo: `C:\dev\assemblylibrary` — Assembly Library

**Authors:** `ASSEMBLY_CONTRACT.md` (sole author; Track A reads only)
**Status:** CLOSED

| Part | Description | Status |
|------|-------------|--------|
| Part 1 | Materials catalogue | SHIPPED |
| Part 2 | Layer + framing builder | SHIPPED |
| Part 3 | U-value engine + thermal fields + framing `materialId` | SHIPPED — contract thermal fields frozen |

---

### Repo: `C:\dev\wewbridge` — WEW Scheduling-Tool Bridge

**Authors:** `WEW_BRIDGE_CONTRACT.md` (sole author; Track A reads only, not yet consuming)
**Status:** CLOSED + verified

| Part | Description | Commit | Status |
|------|-------------|--------|--------|
| Reader | Format adapter: WEW schedule → structured window/door entries | `0b760b5` | SHIPPED |
| Contract | `WEW_BRIDGE_CONTRACT.md` — integration surface for #46 window-placement | `a222567` | FROZEN |

The WEW Bridge output (structured window/door entries) is the integration surface the
window-placement track (#46 easy half) will consume. That integration is **FUTURE and gated**
— no main-repo edits result from it now.

---

### Active Build

**No active build.** Tools chat is parked until the next side-quest starts.

---

## THE CONTRACTS

Track A reads both contracts. Track A writes neither.

---

### Contract 1 — `ASSEMBLY_CONTRACT.md`

**Authored in:** `C:\dev\assemblylibrary` (sole author)
**Consumed by:** `C:\dev\collabinator` (Track A reads only)
**State:** FROZEN as of Part 3 ship

**Geometry fields — INGESTED by Track A (Slice 2):**
```
assemblyId          string
label               string | null
assemblyType        string | null   ('wall' | 'roof' | 'floor' | 'foundation')
totalThicknessM     number | null
layers[]:
  layerId           string | null
  materialId        string | null
  thicknessM        number | null
  pathRole          string | null   ('continuous' | 'framed')
```

**Thermal fields — FROZEN as of Part 3; INGESTED by Track A (Slice 4):**
```
effectiveUValue     number | null   ← INGESTED (Slice 4)
effectiveRSI        number | null   ← INGESTED (Slice 4)
controlLayers       object | null   ← INGESTED (Slice 4; null values preserved exactly)
  water             layerId | null
  air               layerId | null
  thermal           layerId | null
  vapour            layerId | null
```

**Silently ignored (tool-side, not consumed by Track A):**
```
airFilms            object | null   — baked into effectiveRSI/effectiveUValue; not ingested
framing             object | null   — tool-side framing rule set; not a Collabinator concern
```

---

### Contract 2 — `WEW_BRIDGE_CONTRACT.md`

**Authored in:** `C:\dev\wewbridge` (sole author; commit `a222567`)
**Consumed by:** `C:\dev\collabinator` — NOT YET (gated to #46 window-placement work; future)
**State:** FROZEN

Track A does not currently read or ingest WEW Bridge output. When #46 wire-in is scoped,
Track A will read `WEW_BRIDGE_CONTRACT.md` from the wewbridge repo and wire against it.

---

**If any Track B repo changes a contract shape**, that repo's planning chat must relay the diff
to this ledger **before** Track A wires against the new shape.

---

## CONFLICT-AVOIDANCE RULES

1. **Each side-quest tool lives in its own repo.** Track B currently has `assemblylibrary`
   and `wewbridge`; future tools get new repos. No file in one repo is edited by another
   track's session.

2. **One author per contract, per repo.**
   - `ASSEMBLY_CONTRACT.md` is authored only in `assemblylibrary`.
   - `WEW_BRIDGE_CONTRACT.md` is authored only in `wewbridge`.
   - Track A (main) reads both contracts and writes neither.

3. **This ledger has one writer: Track A's main code session.** Track B sessions never write
   it. They report status in prose to their planning chat; the planning chat relays corrections
   here.

4. **Contract changes require relay before ingest.** If any Track B repo changes a contract
   shape (field renames, type changes, schema restructuring), that repo's planning chat must
   relay the diff to this ledger before Track A wires against the new shape. Track A's
   `ingestAssembly` silently ignores unknown fields (forward-compatible), but structural
   changes are not silent and must be coordinated.

5. **Tool integrations with the main repo are FUTURE and gated.** Track B builds tools
   standalone; no main-repo edits result from tools-track work until an explicit integration
   is scoped (e.g. #46 for WEW Bridge output). The gate is always a deliberate main-track
   decision, not a side effect of a tools-track build.

---

## RESOLVED SIDE-QUESTS (main track)

| Issue | Description | Commits | Date |
|-------|-------------|---------|------|
| #93 | Click-to-edit dimension labels removed — segment drag now wins on opening edges in Edit Shapes mode. `hitTestLabels`, `commitLabelEdit`, `labelEditState`, label-edit-overlay JSX and related branches removed. `segLabelRectsRef` left populated (renders labels visually; intentional dead ref — no functional change). | 27257b9 + c96de9f | 2026-06-29 |

---

*Last updated: 2026-07-01 (Slice 12 — BASESIMP wired into the app, Stage 1, commit `4f6be45`; `deriveGroundCoupledLoss` is now the whole-box adapter around `computeGroundCoupledLoss`; engine-exact but assembly-generic (package hardcoded); `__verifyFixture` 56/56; fixture slab SCB_33 = 178.8 W; next is the Stage-2 package-decode surface, ADDITIONAL_FUNC #131)*
