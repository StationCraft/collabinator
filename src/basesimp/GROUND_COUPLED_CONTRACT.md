# BASESIMP Ground-Coupled Foundation Heat-Loss Engine — Contract

A faithful port of the **BASESIMP** algorithm (Ian Beausoleil-Morrison, *BASESIMP: A
Simplified Foundation Energy-Loss Model Derived from BASECALC Simulations*, July 27 1999),
as implemented in the CSA-F280 `BasementHLR.xlsx` and `SlabOnGradeHLR.xlsx` workbooks.

**Basement and slab-on-grade share ONE algorithm.** The shape-factor engine (workbook
sheets `BS1` + `CORC`, driven by the `Config_Name` coefficient packages and the `CornerCF`
corner-factor table) is identical for both. The two foundation types differ only in:

1. **How the effective wall RSI is derived.** Basement runs the insulation flags 6/7/8
   through an *Inflag* branch (`CORC` r52-r59) then an Inflag→RSI map (`Foundation_Calc`
   r2-r8). Slab takes its RSI straight from the selection (no Inflag).
2. **The interpolation constant** in the low-RSI blend: basement `WRSI = 2.29`, slab
   `WRSI = 1.77`. (`denom = exp(WRSI · rsi)`; the set-1/set-2 blend only engages when the
   governing RSI is strictly between 0.01 and 1.5.)
3. **The final load-assembly line** (below), and **which config-name family** is selected
   (basement `BC*`/`BW*`/`BB*`, slab `SC*`).

This module is **not yet wired into the Collabinator app.** It stands alone under
`src/basesimp/`, imports nothing from the rest of the codebase, and nothing imports it.
Hooking it into the app (replacing the interim `deriveGroundCoupledLoss` Model-B placeholder
in `App.jsx`) is a deliberate, separate, future step.

---

## Data is external

The engine is thin logic over five extracted data tables under `./data/`. **A coefficient
or climate revision is a data edit, not a code edit** — re-export the workbook and diff the JSON.

| File | Source sheet | Contents |
|---|---|---|
| `coefficients.json` | `Config_Name` r3-147 | 145 config packages, keyed by name; each holds `num` (package #) + the 49 correlation fields (`a1`…`cc4`, `CCF`, `iUnInsul`, `WalkSlab`, `iFndFlag1`…`8`). Serves both basement and slab families. |
| `corner_cf.json` | `CornerCF` r2-17 | 16 corner-factor rows (keyed 1…16), 19 factors each. |
| `config_decode.json` | `Foundation_Frm_Sel` J3:AF13 | Configuration-index → ordered candidate package names, plus the construction-type / wall-insulation / slab-location option maps. (Decode layer; not consumed by the current compute path, which selects a config by name directly.) |
| `form_data.json` | `Foundation_Form_Data` r2-96 | Package-name → package-number map. |
| `weather.json` | `Foundation_Weather` r3-682 | **679 climate stations**, keyed by a `"City\|\|\|Region"` composite (Region is part of the key because city names repeat across provinces; no composite collides). Each record carries `region`, `degDay` (→ HDD), `dhdbt` (→ design heating dry-bulb), `dgtemp` (→ deep-ground / soil-mean temp), and `monthlyTemps` (12 monthly mean dry-bulb temps, ordered Jan…Dec). Extracted from the basement workbook only: the slab workbook's `Slab_Weather` sheet (header row 2) was verified byte-for-byte identical station-for-station, so slab reuses this same table. The 50 all-zero padding rows at the tail of the lookup range are excluded. |

The uninsulated reference variant ("set 2", `CORC` col F) is resolved by taking the selected
config's `iUnInsul` package number and finding the config whose `num` matches.

---

## Input contract

Field names reuse the interim Collabinator engine's BASESIMP-shaped vocabulary. Lengths in
metres, temperatures in °C, RSI in m²·K/W, soil conductivity in W/m·K.

| Field | Meaning |
|---|---|
| `isBasement` | `true` = basement algorithm, `false` = slab-on-grade. |
| `config` | Config-package identity, e.g. `"BCIN_3"`, `"SCB_33"` (key into `coefficients.json`). |
| `soilConductivity` | Soil thermal conductivity (`soilk`). |
| `depth` | Depth below grade of the foundation floor. |
| `exposedPerimeter` | Exposed perimeter; `0` ⇒ full perimeter (exposed fraction = 1). |
| `length`, `width` | Plan dimensions (exterior). Engine sorts to max/min internally. |
| `height` | Wall height (basement); `0` for slab. |
| `waterTableDepth` | Depth to water table (`wtable`). |
| `windowArea`, `doorArea` | Above-grade window / door area (basement only; reduce `Agfr`). |
| `radiantFraction` | Radiant-slab heated fraction 0…1 (basement only). `> 0` engages the wall/floor `alpha2`/`alpha3` split; `0` collapses `alpha2 → SbgAvg`, `alpha3 → 0`. |
| `fluidTemp` | Radiant-slab fluid temperature (basement only). Slab temp = `22 + radiantFraction·(fluidTemp − 22)`. |
| `insExterior`, `insInterior`, `addedRsi` | Optional user insulation RSI inputs (default 0). Feed the Inflag→RSI map (basement) or the slab RSI directly. |
| `station` | Climate-station key `"City\|\|\|Region"` into `weather.json` (e.g. `"Winnipeg\|\|\|MB"`). **The default climate source.** The engine pulls the 12 monthly mean temps, degree-days (→ HDD), deep-ground temp (→ soilMeanT), and design heating dry-bulb (→ designHeatingDBT) from the table. |
| `designHeatingMonth` | 1…12; selects which month's `FHLmon` variable-loss coefficient. Always the caller's design-month selection — never a climate-table field. |
| `monthlyTemps[12]`, `HDD`, `designHeatingDBT`, `soilMeanT` | **Optional explicit-climate override.** Any of these passed on `input` overrides the corresponding station-table value. Passing all four (with no `station`) bypasses the table entirely. Passing none requires a valid `station`. |
| `overlapEntered` (basement), `overlp` (slab) | Optional insulation-overlap distance; defaults 0 (auto-derived from config for the basement overlap-configs). |

**Climate resolution.** `resolveClimate(input, tables)` is the single seam: the default path is
a `station` lookup against `weather.json`; explicit climate fields on `input` override individual
values; and passing all four explicit fields lets a caller skip the table. `designHeatingMonth`
never comes from the table. (The workbooks' design **cooling** month reads the same station record;
the cooling load line is not yet emitted by this module.)

Room temperature `Troom = 22 °C` is fixed (workbook `Foundation_Calc!F72` / slab `Basement_temp`).

## Output contract

`computeGroundCoupledLoss(input, tables)` returns the **design heating-month conductive
foundation load in Watts** as `load_W`, plus the governing intermediates for inspection
(`sag`, `sbgAvg`, `sbgVar`, `phase`, `fhlmon`, `exposedFraction`, `inflag`, `rsiEffective`,
`radiantSlabTempC`). The number is **Watts per foundation** for the design heating month.
The workbooks also expose a design **cooling**-month load off the same shape factors and
`FHLmon` table (`Foundation_Calc!B81` / `Slab_Calc!B77`); the cooling line is documented
here for completeness but not yet emitted by this module.

**Load-assembly lines** (the sole per-type divergence):

```
Basement:  ( Sag·(Troom − DBT)·Agfr
             + FHLmon
             + alpha2·(Troom − Tsoil)
             + alpha3·(Tradiant − Tsoil) ) · ExposedFraction

Slab:      ( Sag·(Troom − DBT)
             + FHLmon
             + SbgAvg·(Troom − Tsoil) ) · ExposedFraction
```

---

## Acceptance

`acceptance.test.js` reproduces the workbooks' documented worked examples to within 0.01 W
(all three match to floating-point precision, |Δ| < 1e-11 W):

| Case | Config | Expected |
|---|---|---|
| Basement, 12.4 × 6.4, depth 1.75, radiant 0.9 / fluid 33, Winnipeg Jan | `BCIN_3` | 3156.5239 W |
| Same inputs, prompt-named config | `BCIN_1` | 2505.0206 W |
| Slab, 12.1 × 6.1, depth 0.05, Winnipeg Jan | `SCB_33` | 500.6862 W |

> **Config-identity note.** The build request named the basement worked example `BCIN_1`,
> but the workbook state that produces 3156.5239 W (and matches every other stated input) is
> config **`BCIN_3`** (`Selected_Config_Final = 3`). `BCIN_1` under the same inputs yields
> 2505.0206 W. Both are asserted as separate regression cases so the divergence is captured
> rather than papered over.

Climate for the acceptance test is now sourced **from `weather.json`** via the engine's station
lookup: each case names the `"Winnipeg\|\|\|MB"` station and design heating month January. A
lightweight guard asserts the extracted Winnipeg record reads DegDay 5670 / DHDBT −33 / DGTEMP 6,
so the extraction itself is regression-checked alongside the three load targets.
