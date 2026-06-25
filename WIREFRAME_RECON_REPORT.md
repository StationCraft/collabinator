# Collabinator — Wireframe Export Recon Report

*AS-IS findings from a codebase recon targeting what exists toward a 3D wireframe
export: what geometry is captured, where it lives, how it's rendered, and what gaps
remain before world-coordinate composition is possible. Updated as gaps are resolved.*

---

## §1 — Floor-plan polygons (plan geometry)

**Storage:** `completedShapesRef.current` — array of shape objects. Wall polygons have no
`shapeKind` field (absent = default). Each stores:
```
{ id: 'sh-N', vertices: [{x,y}], pageId, status: 'locked' }
```
Vertices are canvas-pixel coordinates for that page's canvas at its current zoom/sheet scale.
No Z. No world-space coordinates — raw pixels only.

**Categorization gate:** wall polygons on `category === 'Floor Plan'` pages with a known
`FLOOR_ORDER` subLabel are the primary geometry source for plan XY. Polygons on other page
categories (Elevation, Roof Plan, etc.) also live in `completedShapesRef` and must be
discriminated by `pageId` → `pages` lookup.

**Render:** `drawLockedShapes(ctx, completedShapesRef.current, pageId)` in canvasRenderer.js —
blue fill/stroke; skips `shapeKind === 'grade-line'` and `isOpening(shape)`.

**Edit compatibility:** all five Edit Shapes sub-modes (segment drag, vertex drag, move, combine,
split, delete) operate on wall polygons. Openings included in segment/vertex/move/delete but
excluded from combine + split.

**Ghost reference:** `drawGhostShapes(ctx, completedShapesRef.current, ghostPageId)` renders
locked wall polygons from a reference page (amber dashed, hatched). Skips grade-line and openings.
Ghost draws raw stored pixel coordinates with NO coordinate transform applied — see §3 (Alignment).

---

## §2 — Z / panel data (floor heights — datum layer)

**Storage:** `floorHeightsRef.current[level]` keyed by `FLOOR_ORDER` string:
```
{ floorToCeiling: number|null,   // feet
  floorSystemAbove: number|null, // feet
  ceilingSource: 'direct'|'solved' }
```
Only FLOOR_ORDER levels present (free-text subLabels excluded). Values in feet.

**Accumulation:** `accumulateZ(floorHeights, presentLevels, FLOOR_ORDER)` → pure function in
geometry.js. Returns `[{level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove}]` base→top.
`presentLevels` = FLOOR_ORDER levels with ≥1 categorized Floor Plan page. Nulls treated as 0
for accumulation but preserved in output.

**React bridge:** `fhZStack` derived state (computed from `floorHeightsRef` + `floorHeightsTick`).
`getFloorLevel(pageId)` — crosses ref/state boundary; returns `subLabel` if known FLOOR_ORDER level.

**Entry panel:** `.fh-panel` right overlay with per-level ceiling ft+in entry, floor-system presets
(2×10 through 24″ truss) + custom, floor-to-floor back-solve (`ceilingSource: 'solved'`).
`validateCeiling(ftc, fsa)` shared guard; `setFloorHeightFields(level, obj)` atomic write.

**Scope boundary:** DATUM layer only. No per-element Z on shape objects (Phase 2 / ELEMENT layer, #19).

---

## §3 — Alignment (per-page PDF transforms + ghost reference tree)

**Per-page transform:**
```
pageTransformsRef.current[pageId] = { tx, ty, s, angle, confirmed? }
```
Applied as CSS transform to `.pdf-align-layer` div (VISUAL ONLY — backdrop PDF only, not the
measure canvas). `getCSSTransform(t)` pure helper builds the CSS string.

**Canvas coordinate invariant:** all geometry is drawn on `measureRef` (the overlay canvas) in
a shared canvas-world coordinate space. The PDF `{tx,ty,s}` transform moves only the backdrop
image — it does NOT affect the coordinate space where geometry is drawn. Therefore two pages
share the same canvas coordinate space IFF their geometry was traced at the same zoom/pan state
and the ghost was correctly aligned before tracing. This is the trace-over-ghost identity assumption.

**SEPARATE CANVAS SPACES (critical — resolved at B1):** Each PDF page navigation calls `renderPage`,
which resizes `measureRef` to that sheet's dimensions (`scale = containerWidth / viewport.width`).
Stored vertex coordinates are raw canvas pixels at that page's canvas scale — NOT comparable
across pages unless all sheets happen to be the same size. `drawGhostShapes` draws raw stored
coordinates with no offset transform. The `{0,0}` canvas-pixel offset is only accidentally
correct for same-size sheets. **Canvas pixels cannot be directly composed across pages.**
**Resolution: compose in METERS** via each page's own `getEffectiveScale` + `pxToMeters`.
Sheet-size dependency dissolves. See §5 (B1 resolution).

**Scale borrow chain:** `getEffectiveScale(pageId, _visited)` resolves: own `pageScalesRef` if
set; else follows `pageRefParentRef.current[pageId]` if `pageTransformsRef.current[pageId]?.confirmed`;
else null. Cycle guard (`_visited` Set) active. Chain bottoms out at first page with own calibration.

**Reference tree:** `primaryReferenceIdRef` — first manually-calibrated page (set-once).
`pageRefParentRef.current[pageId] = parentPageId` — written at each "Confirm scale & alignment".
`getGhostSourcePageId(pages, currentPageId, shapes, FLOOR_ORDER, pageRefParent)` — returns ghost
source: stored parent first (post-confirm), FLOOR_ORDER downward scan as pre-confirm suggestion.

**Elevation alignment:** Elevation pages store their OWN `pageScalesRef` entry (peer calibration,
not borrow) — set by "Confirm alignment" via `elevPixelLen / realLenMeters`. Does NOT set
`pageRefParentRef`. Decoupled from floor-plan recalibration (#22 honored).

---

## §4 — Roof-plan geometry

**Perimeter polygons:** Roof Plan pages hold standard closed wall polygons in `completedShapesRef`
with extra fields:
```
{ ..., roofType: 'flat'|'sloped', parapetWidth: number|null, lineRoles: {[segIdx]: 'eave'|'rake'} }
```
`roofType` and `parapetWidth` added at confirm time (flat/sloped picker after polygon close on
Roof Plan page). `lineRoles` set in role-assignment mode. Perimeter polygons rendered by
`drawLockedShapes` — NO category discrimination in renderer, just pageId.

**Internal graph:** `roofGraphRef.current = { verts: [], edges: [] }`. Connected graph with
shared-vertex junctions.
- Verts: `{ id: 'rv-N', x, y, perimCorner?, perimParent?, roofEdgeParent? }` — provenance fields
  record how each vertex attaches to the perimeter polygon (corner coincidence, mid-edge parent,
  or roof-edge split origin).
- Edges: `{ id: 're-N', aId, bId, role: 'hip'|'valley'|'ridge' }`

**Vertex dedup:** quantized key `Math.round(x*2),Math.round(y*2)` — two snaps within 0.5px = same vertex ID.

**Z status:** NO Z on roof geometry. Slope rules and Z-derivation from ridge → eave perimParent
topology are deferred (#18 — needs R3/coordinate model).

---

## §5 — Openings (windows/doors placement layer)

**Storage:** `completedShapesRef` entries with `shapeKind: 'window'|'door'`:
```
{ id: 'sh-N', vertices: [{x,y}], pageId, status: 'locked',
  shapeKind: 'window'|'door',
  openingType: string,   // from OPENING_TYPES
  label: string,
  widthM: number,        // meters (user-entered, display-unit-independent)
  heightM: number,
  dimBasis: 'frame'|'rough-opening' }
```
4-vertex CW rectangle from two-click free placement. `applySnap` called with `useAngle=false`.
1″ snap default on placement entry and Edit Shapes entry when openings present.

**Project-level setting:** `dimensionBasisRef.current = 'frame'|'rough-opening'|null` — set once
via first-use modal; never re-prompted per session; cleared on PDF upload.

**Discrimination:** `isOpening(shape)` helper at 7 sites (drawLockedShapes skip, drawGhostShapes
skip, hitTestSegments skip, hitTestShapeBody skip, getEligibleShapes exclude from combine,
edit forEach loops render via drawOpeningPoly, split hit-test guard).

**Render:** `drawOpeningPoly(ctx, verts, style)` teal fill/stroke; `drawOpeningShapes` iterates
locked openings for a page. Both wired into all render paths (view/draw/review/5 edit sub-modes).

**Z status:** NO Z. Openings are 2D rectangles on elevation canvas pixels. Placement relative to
floor/ceiling reference lines is visual only — no stored elevation Z.

---

## §6 — Elevation reference lines

**Function:** `drawElevRefLines(ctx)` — draws floor/ceiling reference lines spanning canvas width.
Called at end of ALL canvas redraw paths (view, draw, review, all five edit sub-modes).

**Gate:** `pageScalesRef.current[currentPageId]?.pxPerMeter` confirmed + `resolveElevEdge(currentPageId)`
non-null + `fhZStack.length > 0`.

**Anchor Y:** `elevBaseYRef.current[currentPageId] ?? (edgeData.A.y + edgeData.B.y) / 2`.
`elevBaseYRef` — `useRef({})` per-elevation-page; drag-to-place the base (lowest) floor line.

**Y→Z formula (for each row):**
```
y = anchorY - (Zfeet - lowestFloorZFeet) × 0.3048 × pxPerMeter
```
Floor lines teal (#0d9488) solid; ceiling lines amber (#d97706) dashed.
Line widths zoom-compensated (`/ zoomRef.current`). Labels at left edge.

**Named inverse (B2 — RESOLVED):** `elevYToWorldZ(y, elevPageId)` — extracts the Y→Z inverse
as a named export function. Returns world Z in meters. Same formula, inverted:
```
zFeet = lowestFloorZ + (anchorY - y) / (0.3048 × pxPerMeter)
return zFeet × 0.3048
```
Reads `pageScalesRef.current[elevPageId]` (own calibration, not borrow). Returns null if gate
not met. Principle 7.3: one function per derived quantity — label, draw, and export all read
the same formula via this named inverse.

**Elevation edge reference:** `elevationEdgeRef.current[elevPageId] = {sourcePageId, shapeIndex,
segmentIndex, endpointA, endpointB}` — authoritative-indices pattern. `resolveElevEdge(pageId)`
resolves live from authoritative indices.

---

## §7 — Project configuration (non-geometry refs)

| Ref / State | Type | Purpose |
|-------------|------|---------|
| `compassAngleDeg` | state `number\|null` | Rotation angle from compass rose alignment |
| `compassCardinal` | state `string\|null` | Rounded cardinal (N/NE/E/…) for axis labels |
| `pages` | state array | `{pageId, pageNum, category, subLabel, subLabelNote}` per page |
| `frontFace` | state `object\|null` | Road-facing segment `{pageId, shapeIndex, segmentIndex, endpointA, endpointB}` |
| `primaryReferenceIdRef` | ref `string\|null` | pageId of first manually-calibrated page (set-once) |
| `pageRefParentRef` | ref `{[pageId]:pageId}` | Per-page parent in reference tree (written at confirm) |
| `pageIdMapRef` | ref `{[pageNum]:pageId}` | Stable pageId assignment at PDF load |
| `dimensionBasisRef` | ref `'frame'\|'rough-opening'\|null` | Opening dimension basis (project-level, once per upload) |
| `shapeIdCounterRef` | ref `number` | Monotonic counter for `id: 'sh-N'` shape identity |

All refs cleared on PDF upload (`handleFileChange`).

**B4 blocker — no project-config store exists yet:** B4 derivation core reads floor-system and
assembly data (wall type, U-values, etc.) that live in a project configuration layer which has not
been built. Three unsettled forks: (1) how much config to stand up now vs. defer, (2) where it
lives (new `projectConfigRef` vs. extending `floorHeightsRef`), (3) output form (console / panel /
both). B4 is NOT promptable until these are resolved in a planning pass. See SESSION_HANDOFF_NOTES.md.

**Source PDF persistence (Session 29):** The dev fixture now bundles source PDF bytes under
`documents: [{ pdfBase64, fileName }]` — a document-keyed array (one entry today; array structure
accommodates future multi-PDF per project, #50). The PDF backdrop remains VISUAL-ONLY: its
on-screen position is derived from `pageTransformsRef {tx,ty,s}` only; geometry truth stays in
shapes + transforms. The PDF is positioned BY the transform, never the reverse. See
ADDITIONAL_FUNCTIONALITY #49 (project-owned PDF persistence) and #50 (multi-PDF).

---

## §8 — Render paths (where geometry hits canvas)

All render paths are on `measureRef` (the overlay canvas). The PDF canvas (`canvasRef`) is a
sibling inside `.canvas-world` wrapped by `.pdf-align-layer` which carries the CSS transform.

| Function | Triggered by | Renders |
|----------|-------------|---------|
| `redrawFrontFaceLayer(hoverSeg)` | view-mode useEffect, front-face pick | ghost, locked shapes, grade lines, openings, elev ref lines, front-face highlight, align handles |
| `redrawDrawCanvas(mousePos, verts, useAngle, useDist, pageId)` | draw-mode — mouse moves, key events, useEffect passive repaint | ghost, locked shapes, grade lines, openings, in-progress trace, snap indicators, elev ref lines, align handles |
| `redrawReviewCanvas(shape, pageId)` | after polygon close, roof type pick | locked shapes, grade lines, openings, review polygon (green), elev ref lines |
| `drawEditCanvas(hoverState, previewOverride)` | edit-mode — mouse moves, sub-mode changes | 5 sub-modes (default/move/combine/split/delete); each renders ghost + locked shapes/openings via appropriate poly fn + elev ref lines |

All 4 render functions call `drawElevRefLines(ctx)` as the last step on elevation pages.
All 4 render functions call `drawGhostShapes` + `drawAlignHandles` when ghost source exists.

---

## §9 — Gaps toward wireframe export

| # | Gap | Status |
|---|-----|--------|
| 1 | XY composition: canvas-pixel floor-plan vertices → building-fixed world XY in meters | **RESOLVED — B1 (9e5bd0d)** |
| 2 | Named px↔meter conversion seam (`pxToMeters` / `metersToPx`) | RESOLVED — R2 Path 3 (040e371) |
| 3 | R3-ready vertex shape via `makeVertex` factory | RESOLVED — R2 Path 3 (71e01ca) |
| 4 | Z composition: elevation canvas Y → world Z in meters (`elevYToWorldZ`) | **RESOLVED — B2 (9e5bd0d)** |
| 5 | Roof Z derivation (slope rules: ridge → eave perimParent topology → Z) | OPEN — #18, needs R3 |
| 6 | Opening Z placement (window/door sill/head elevation in world Z) | OPEN — needs element Z model (#7, #19) |
| 7 | Grade-line above/below-grade interpretation (#41) | OPEN — read-time intersection, R3 |
| 8 | B3: Roof Plan pages enter ghost/borrow path (same mechanic, settled arch.) | **OPEN — NEXT** |

---

## §10 — B-series build order

```
[x] B1 — getWorldOriginM() + pageVertexToWorld(v,pageId) → world XY meters   (9e5bd0d)
[x] B2 — elevYToWorldZ(y,elevPageId) → world Z meters                         (9e5bd0d)
[x] B3 — widen getGhostSourcePageId gate for Roof Plan pages                  (d4e99d8)
[x] B4 fixture prereq — default fixture rebuilt self-contained (Session 29):
         PDF bytes bundled (documents[]); Crawlspace (page-3, origin) + Main Floor (page-5,
         borrow chain, pxPerMeter=114.83) composing in world XY; roof polygon (page-7)
         with 1ft overhang on two edges; elevation page-2 calibrated, live Z (Z@anchor=0.0000).
         Session 27 "Main Floor MISSING scale" resolved — borrow chain confirmed in new fixture.
         Default fixture is now self-contained: no machine path dependency, PDF bundled.        (c5deb8d)
[ ] B4 — derivation core — ⚠️ BLOCKER: config-store forks unsettled (see §7 note below)
[ ] B5 — roof Z (slope rules, #18) — needs R3 coordinate model
[ ] B6 — element-Z openings and grade-line interpretation — R3/Phase 2
```

---

## §11 — Architecture rules (carry-forward)

- **`pageRefOffsetRef` does NOT exist.** Canvas-pixel cross-page offset was tried (Session 27
  first implementation) and removed — wrong unit, sheet-size-dependent. Do not reintroduce.
- **No raw `pageScalesRef.current` reads in composition code.** Always resolve via
  `getEffectiveScale(pageId)`. Anchor floors can borrow scale from a parent; a raw read
  returns undefined → NaN world origin → all derived coordinates poisoned.
- **Cross-page XY composition is in METERS.** Sheet size dissolves: 1 meter = `pxPerMeter`
  pixels regardless of sheet dimensions.
- **Identity assumption for cross-page XY:** alignment is identity because trace-over-aligned-ghost
  bakes registration into stored coordinates at draw time. If a future workflow places geometry
  out-of-register, the explicit offset re-enters at `pageVertexToWorld` (comment marks the seam).
- **`elevYToWorldZ` reads own `pageScalesRef` entry (not borrow).** Elevation stores its own
  calibration as a peer (#22 recalibration-independence). Raw own-scale read is correct here.
- **`pageVertexToWorld` returns `{x, y, z: null}`.** z stays null until R3 adds it via `makeVertex`.
- **`window.__dumpWorld()`** is the DEV verification tool. DEV-guarded; production tree-shakes it.
