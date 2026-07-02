# Collabinator — Functionality Summary (Phase 1.5 Design Decisions)

This document captures every design decision made during the Phase 1.5 planning
conversation (compass rose → page categorization → multi-floor → elevations → roof →
windows). It exists so these decisions are a durable, readable file instead of living
only in chat history. Claude Code should read this alongside `CLAUDE.md` before
building any Phase 1.5 feature.

**Status of these decisions:** Confirmed in conversation, not yet built. The previous
multi-floor implementation (8a–8d) that prompted this redesign was lost (file
overwrite, no backup) and is **not being rebuilt as it was** — these decisions
describe what should be built instead, the first time, correctly.

---

## 1. Coordinate system

- The coordinate origin (X, Y, Z = 0,0,0) is a **fixed, arbitrary zero**. It is not a
  building feature — nothing in the building "is" the origin. It is simply the zero
  mark of the coordinate space. All building geometry lives within that space at
  whatever coordinates it lands on.
- **X, Y** = horizontal plan coordinates (per compass rose orientation).
- **Z** = vertical elevation.
- All geometric relationships are computed **geometry-to-geometry** (e.g. vertex A
  minus vertex B), never by measuring against the origin. The origin is only a shared
  reference frame, not a thing anything relates to.
- **Floor levels (Z) form a stack.** The lowest floor is the base of the stack. Each
  floor stores its **offset from the floor below it**; a floor's absolute Z is derived
  by accumulating offsets up the stack from the base. Changing a lower floor's height
  therefore **shifts every floor above it up** — this is intended, physically-correct
  behavior (raise the basement ceiling and everything stacked on it rises with it).
- Z values are set via the Section 8 elevation/cross-section line-slider mechanic
  (drag floor/ceiling lines, or type inter-level distances). Floor-system thickness is
  just the offset between a ceiling plane and the next floor plane above it.

**R2 coordinate foundation (built Session 18 — Path 3 / 3-minimal):**
- Geometry is **stored in pixels**. Meters are a **read-time projection** via the named
  conversion seam (`pxToMeters` / `metersToPx` in canvasRenderer.js). No frozen conversion
  ratio is stored — recalibration is safe at any time (recalibration-independence invariant, #22).
- The **shared real-world frame is operational, not stored**: pages share a frame because they
  share calibration scale and ghost-align visually via the existing `pageTransformsRef` machinery.
  Composing the `pageRefParent` chain onto explicit stored coordinates is R3 (not built at R2).
- Vertex shape is **R3-ready**: all stored polygon vertices are constructed via `makeVertex(x, y)`
  factory in geometry.js, returning `{ x, y }` today with z absent. R3 adds z in one place only.
- Per-element identity preserved: no coordinate-coincidence merging (#19).

**Coordinate seam extraction (done Session 69 — waypoint (a); commits 8381ef3–7b2479d):**
- `src/coords.js` is now the **single conversion seam**: all px↔m, ft/in↔m, screen↔canvas,
  similarity/T⁻¹, and CSS-transform-string math routes through it.
- **Two-tier model:** Tier-1 pure primitives in `coords.js` (no React, no refs); Tier-2 ref-bound
  resolvers (`getEffectiveScale`, `getWorldOriginM`, `pageVertexToWorld`, `elevYToWorldZ`,
  `getCanvasPos`, `clampToCanvas`) stay in App.jsx as thin wrappers that read live refs and
  call Tier-1 primitives.
- Intentional exceptions (deliberate — not gaps): `geometry.js` `parseDisplayDistInput`, DEV
  harness oracle, snap-grid `<option>` data constants, and the two CSS-transform builders (see
  CLAUDE.md seam architecture for the full list and rationale).

**B1+B2 world-frame composition seams (built Session 27 — commit 9e5bd0d):**
- `getWorldOriginM()` — building-fixed XY origin in meters; re-derived every call, never stored.
  Resolves anchor-floor scale via `getEffectiveScale` (borrow-safe). Returns `{ x, y, originPageId }`.
- `pageVertexToWorld(v, pageId)` → `{ x, y, z: null }` — canvas-pixel vertex into world meters.
  Cross-page alignment is identity (trace-over-ghost bakes registration at draw time).
  Always resolves scale via `getEffectiveScale` — never raw `pageScalesRef.current`.
- `elevYToWorldZ(y, elevPageId)` → world Z in meters. Implements the same Y↔Z formula as
  `drawElevRefLines` (principle 7.3 — one function per derived quantity).
- **`pageRefOffsetRef` does NOT exist.** Canvas-pixel cross-page offset approach was tried and
  removed. All composition is in METERS. See `WIREFRAME_RECON_REPORT.md` for full gap tracking.

---

## 2. Build order (confirmed sequence)

1. Compass rose alignment (first thing after PDF upload)
2. Page categorization + working area selection
3. Ground floor plan tracing
4. Multi-floor reference/alignment for subsequent floor plans
5. Roof plan tracing
6. Elevation calibration + tracing
7. Cross-section reference geometry
8. Windows/doors placement
9. Phase 2 threshold: 3D wireframe + spreadsheet output

---

## 3. Compass rose alignment

- **Manual only** — no image recognition/auto-detect. Simpler and more reliable.
- On PDF upload, immediately show a compass rose overlay (centered on screen).
- User can **drag** it to position and **rotate** it (drag, arrow keys, or slider —
  implementation detail, not yet specified) to match the compass rose printed on the
  plan set.
- User clicks **"Confirm compass alignment"**.
- The actual rotation angle (e.g., "15° clockwise from vertical") is stored.
- **Labeling logic:** the system rounds the actual angle to the nearest of
  N/NE/E/SE/S/SW/W/NW for axis labels and references throughout the app (e.g., "North
  Elevation"), even if true north is off by a few degrees. The precise stored angle is
  retained separately for tools that need exact values later (solar exposure analysis,
  etc.).
- This happens **before** page categorization.

---

## 4. Page categorization & working area

**Order: category is assigned first, then working area is selected for that page.**

For each page:
1. User assigns a **category**: Floor Plan / Elevation / Cross-Section / Detail /
   Roof Plan
2. If Floor Plan: sub-label (Ground, L1, L2, Crawlspace/Basement, etc.)
3. If Elevation: direction (North, South, East, West) — derived from compass rose
4. User selects a **working area** (crop box, drag corners) for that page
5. If a single PDF page contains multiple elements (e.g., a floor plan and an
   elevation on the same sheet): a **"Duplicate this page"** button creates two
   copies of the page, each independently assigned a category and working area

**Working area behavior:**
- Once selected, the working area becomes the default view: **fit to screen**
  (auto-zoom to fit height or width) whenever that page is opened.
- The rest of the original page still exists and is not deleted/cropped — the working
  area is just the default viewport.

**Crop-carving UI — AS BUILT (commit 8d6e57d, Session 61):**
The "Duplicate this page" concept was replaced by a crop-carving gesture. "Add region" toolbar button
enters carve mode; user drags a rectangle ≥20×20px on the PDF sheet; mouseup spawns an independent
logical page-region with its own `pageId` (`page-N-rK`), own crop `{x,y,w,h}`, own category/subLabel,
own scale, and own position in the reference tree. Source sheets with regions become carve-surface-only
(Draw/Edit/Scale/Categorize suppressed; shown as "(full sheet)" in sidebar). Region-pages appear as
"Region K of p.N" in the sidebar (Unused Pages section until categorized). Each region-page's canvas
is sized to its crop and its (0,0) origin is the crop's top-left — stored geometry is crop-local by
construction (recalibration-independence #22 honored). Snapshot/restore round-trips all carved regions.

**Carving from an aligned source (Build 2, Session 65):** when the source page carries a non-identity PDF
align transform `T = translate(t)·scale(s)` (e.g. an aligned elevation), the carve box — boxed by the user
in aligned-view space but captured in the page's untransformed canvas-world frame — is folded through `T⁻¹`
at commit so the stored crop is the RAW-SHEET rectangle the user visually selected: `crop = (R−t)/s`. The
region also inherits the source's metric scale **divided by the same `s`** (`pxPerMeter ÷ s`), because the
crop re-bases the region into raw-sheet px; without the `÷s` an aligned-source region would mis-measure by
factor `s`. Un-aligned sources (`s=1`) are unaffected — crop and scale pass through unchanged. The decision:
**carve boxes are defined in aligned-view space (what you see is what you get)**; `getCanvasPos` is never
modified; the transform is consumed at commit only, never frozen into a vertex. Making the *entire* aligned
page reachable for carving (over the negative-translate overhang) is a separate deferred layout change
(ADDITIONAL_FUNCTIONALITY #113).

**High-res toggle:**
- Temporary, not persistent. Used specifically when setting scale, to make small
  dimension text legible. Reverts to normal (fast/nimble) resolution otherwise.

**Sidebar:**
- Shows all categorized pages, organized by:
  1. Floor plans, lowest to highest elevation. Plans at slightly different
     elevations within what's conceptually "the same floor" (e.g., a sunken living
     room) are visually indented/sub-grouped under that floor rather than treated as
     a separate floor level.
  2. Elevations: Front, Back, Left, Right (translated from N/S/E/W per compass)
  3. Cross-sections
- Clicking a sidebar entry navigates to that page and shows whatever has been drawn
  on it.
- **Recategorization is non-destructive:** if a page was mislabeled (e.g., "Left
  Elevation" should have been "Right Elevation") and the user has already traced
  windows or geometry on it, recategorizing changes the label/orientation without
  losing the existing geometry or scale.

---

## 5. Ground floor tracing

- Uses the existing, working scale-and-trace tool (calibration → draw → close →
  review/confirm), unchanged.
- **There is no origin capture and no "origin point" step.** The coordinate origin is
  a fixed, arbitrary zero (Section 1) — no vertex is the origin, and the first vertex
  placed on the ground floor carries no special coordinate meaning. *(This reverses the
  earlier "first vertex placed on the ground floor becomes the internal coordinate
  anchor" decision, which is now superseded.)*
- The lowest floor is identified as **the base of the floor stack** — a building fact
  only, surfaced via the `getAnchorFloor` helper. It anchors the Z stack (Section 1),
  not the coordinate origin.
- All floors and elevations relate to each other geometry-to-geometry and via the
  relative-offset Z stack, not through the origin.
- **Front-face designation** happens in this step. After the first polygon is locked
  on the anchor floor, the user clicks the road-facing exterior wall segment to
  designate it as the "front face." This is stored as a one-per-building property
  (`frontFace`) and is used later to map Front/Back/Left/Right elevation naming onto
  the compass N/S/E/W directions established by the compass rose. The user may skip
  this and return to it later.

---

## 6. Multi-floor alignment (replaces the old 8a–8d design entirely)

This is the corrected design — the old vertex-drag/break-point/"unlock inherited
geometry" approach is **not** being rebuilt.

- When the user opens a new floor-plan page, the previous floor's locked geometry
  shows as a **read-only, toggleable reference ghost** — never directly editable.
  The ghost is the **fixed reference**; the PDF backdrop moves to align with it.
- User enters "Align to floor below" mode (toolbar button, gated on ghost source
  existing). In align mode:
  - **Body-drag** translates the PDF backdrop (`tx`, `ty`).
  - **Corner handles** (four amber squares at the ghost's bounding box corners) scale
    the PDF uniformly. Grabbing a corner scales around the **diagonally-opposite ghost
    bbox corner** as the fixed anchor — `tx/ty` are recomputed as scale changes to
    keep that anchor's canvas position fixed. Aspect-locked, no rotation.
  - Handles are anchored to the **ghost** (fixed reference geometry), not the PDF.
    They do not move when the PDF is body-dragged.
- User clicks **"Confirm scale & alignment"** (sub-step 3, BUILT — commits d49060d,
  e4cf8b6, 327e84d, d030a34) — this sets `confirmed: true` on the per-page transform
  and exits align mode. The button then reads "Realign" and re-enters on the existing
  transform without reset. Once confirmed, `getEffectiveScale` borrows the ghost
  source's calibrated `pxPerMeter` (recursing down `FLOOR_ORDER` to the first
  calibrated floor for 3+ floor stacks), unlocking Draw and snap-grid labels without
  re-calibration. The align `s` factor does NOT re-scale the grid — geometry is drawn
  in the shared measure space at the ghost's calibrated scale (verified empirically:
  wall labels read true). The "Set Scale" button is hidden on any page with a ghost
  source; scale on ghosted pages comes exclusively from confirm-and-borrow.
- Once confirmed, **new polygons drawn on this page align directly to the previous
  floor's geometry** (geometry-to-geometry, via the shared snap grid) — alignment is
  automatic, not something the user manages by hand.
- Vertically, each floor relates to the one below it through the **relative-offset Z
  stack** (Section 1): its Z offset is set later in the Section 8 elevation work, and
  absolute Z accumulates up the stack from the base floor.
- The reference ghost remains visible (toggleable) as a non-editable backdrop on any
  page using the same axis alignment.
- **Known bug from the prior implementation (do not reintroduce):** scale appearing to
  reset after confirm, and the reference becoming undraggable. Root cause was the CSS
  transform being applied inconsistently between the PDF canvas and the
  measurement/drawing canvas. **Implementation fix:** a `.pdf-align-layer` div wraps
  ONLY the PDF `<canvas>` inside `.canvas-world` and carries the per-page transform.
  The measurement/drawing canvas (`measureRef`) remains a direct sibling inside
  `.canvas-world` and is NOT inside `.pdf-align-layer` — so only the PDF backdrop
  moves; the ghost and drawn geometry are the fixed reference layer.
  `.canvas-stack` stays as the untransformed clipping viewport; `.canvas-world` carries
  zoom/pan; `.pdf-align-layer` nests inside and applies the per-page transform to the
  PDF only. `getCanvasPos()` uses `getBoundingClientRect()` → auto-compensates for all
  nested transforms (no coordinate mapping changes in existing handlers).
- **Render frame is window-independent (#117, Session 68):** a full-sheet page's render
  footprint — the `measureRef` size, and therefore the coordinate frame that `getCanvasPos`,
  `clampToCanvas`, every draw path, and pan all read off — is pinned to the page's
  `authorScaled` (fallback 1200) in `renderPage`, NOT to the live window width. Region/crop
  pages already pinned to `crop.w`. The window governs ONLY the viewport: an initial
  **fit-zoom** (`min(1, (innerWidth−48)/footprint)`) keeps the whole sheet visible on load,
  and never feeds back into the coordinate frame. This is what lets geometry authored at one
  window width register against the backdrop at any load width.

---

## 7. Roof plan

**What is built (Session 13):**
- Perimeter polygon traced with the standard draw tool (same workflow as floor plans).
- After polygon close on a Roof Plan page, user picks **flat or sloped** (replaces
  immediate Confirm). Flat sections: parapet width entry (inches, always imperial).
  Shape locked with `roofType`, `parapetWidth`, and `lineRoles` fields.
- **Connected-graph internal-line tracer** (`roofGraphRef`): hip/valley/ridge lines
  traced as a shared-vertex graph. Two-clicks-per-segment chain; first click must
  attach to existing geometry; axis snap + midpoint snap + edge-split snap.
  perimParent vertices record attachment points on perimeter edges (polygon untouched).
- **Role assignment mode:** two vocabularies — perimeter edges (Eave/Rake) via
  `shape.lineRoles`; internal lines (Hip/Valley/Ridge) via `edge.role`.
- **Five role colors:** ridge dark-red, hip light-orange, valley blue, eave green, rake violet.
- Undo (Z key + button) heals bisected edges. Delete in role mode applies same heal.

**B3 — Roof in ghost/borrow path (Session 28; commit d4e99d8):**
Roof-plan pages now enter the existing ghost/confirm-borrow mechanic identically to floor pages.
`getGhostSourcePageId` gate widened to admit `category === 'roof-plan'`; subLabel requirement relaxed
(optional free text for roof). Fallback parent scan starts above all FLOOR_ORDER floors and scans down
to the highest floor with locked shapes. Scale borrow via `getEffectiveScale` chain is unchanged;
`__dumpWorld` extended to print world XY for roof polygons. No roof-specific offset logic —
meters-composition + trace-over-aligned-ghost identity from B1 applies unchanged.
Eave projection / roof Z deferred to B4 (needs planning pass before promptable).

**Still to build (deferred per #18):**
- Slope rules + Z-derivation (ridge-to-perimeter junction topology exists; elevation
  inference deferred — "eave rising to meet the ridge" needs slope model + XYZ).
- Eave projection calculation (needs floor-plan and roof-plan perimeter alignment).
- Roof drainage, eavestrough/RWL placement, soffit/fascia heights (see #18 build-order).
- Ridge height and eave height set during elevation work (see Section 8).
- **Eave projection** = horizontal distance between roof perimeter and top-floor wall
  perimeter, per elevation side — feeds plane area, angle, exposure calculations.

---

## 8. Elevation calibration & tracing

**Build status (Sessions 14 + 19):** Partially built.
- **Piece 1 (2942e0e):** `floorHeightsRef` data structure, `accumulateZ` helper, `getFloorLevel` helper. No UI.
- **Piece 2 (e780b88):** Floor-heights entry panel — worklist + Z-stack rows, ft+in ceiling height
  entry, inch-native floor-system presets + custom input. Browser-verified.
- **Piece 3 (4e06de0):** Optional floor-to-floor back-solve entry per non-top row. Derives
  `ceiling = floorToFloor − floorSystemAbove`. `ceilingSource: 'direct'|'solved'` field tracks which
  entry path was last used. Last-edited-wins: direct ceiling edit → `'direct'`; f2f entry → `'solved'`.
  Fork-1 stickiness: editing `floorSystemAbove` on a `'solved'` level re-solves ceiling to hold f2f
  constant. Shared `validateCeiling` guard (ceiling strictly > 0 AND > fsa) called by both paths;
  rejects with inline `fhError` on failure without writing. F2f input absent on top-of-stack;
  disabled-with-hint until floor-system set.
- **Elevation spatial Piece 1 (89b7ba2):** "Set elevation edge" mode on Elevation pages. Floor-plan
  ghost shown; user clicks an edge to designate it as the horizontal reference for this elevation.
  Stored in `elevationEdgeRef.current[elevPageId]` (authoritative indices + endpoint snapshots).
  Purple edge highlight. Selector for multiple floor-plan candidates.
- **Elevation spatial Piece 2 (2007265):** "Align elevation" mode. Temporary bounding box
  with four amber corner handles around the picked edge. Body-drag translates; corner-drag scales
  uniformly (same math as floor-reference align). Zoom/pan active during align. "Confirm alignment"
  stores the elevation's OWN `pageScalesRef` entry — pxPerMeter = `elevPixelLen / realLenMeters` where
  both measurements are in the shared canvas-world coordinate space. Does NOT use `pageRefParentRef`:
  the elevation is a calibrated peer, independent if the source plan is recalibrated (#22 honored).
- **Elevation spatial Piece 3 sub-piece 1 (1cb2c0b):** `drawElevRefLines(ctx)` — draws horizontal
  reference lines on aligned Elevation pages. Teal solid lines for floor levels, amber dashed lines
  for ceiling levels (where non-null). Anchor Y: `elevBaseYRef[pageId] ?? edge-midpoint Y`; spacing
  via `accumulateZ(floorHeightsRef)` in feet × 0.3048 × pxPerMeter. Labels at left edge.
  `floorHeightsTick` added to passive-redraw deps (view, draw, and edit modes) so lines repaint on
  panel edits. Gate: `resolveElevEdge` non-null + confirmed `pxPerMeter` + `fhZStack.length > 0`.
  Initially wired into view mode only; wired into draw/review/edit in Piece 4 sub-piece 1 (5266dc5).
- **Elevation spatial Piece 3 sub-piece 2 (b597e91):** `elevBaseYRef` (per-elevation-page,
  keyed by pageId) — stores a user-placed anchor Y for the stack. Drag the base (lowest present
  level) teal floor line vertically within 8/zoom px to move the whole stack; spacing owned by
  `accumulateZ` is preserved. `elevBaseYRef.current[pageId] ?? edge-midpoint-Y` fallback unchanged.
  Offset persists across page-navigation round-trips; clears on PDF upload. No `floorHeightsRef`
  writes, no height edits, no new React state. Pan on empty canvas unaffected.
- **Elevation spatial Piece 3 sub-piece 3 (DEFERRED):** drag-to-edit individual floor/ceiling line
  heights (last-edited-wins). Height editing stays panel-only. Shelved, not cancelled.
- **Elevation spatial Piece 4 sub-piece 1 (5266dc5, Session 21):** closed-polygon tracing + full
  Edit Shapes suite enabled on Elevation pages. `drawElevRefLines` wired into `redrawDrawCanvas`,
  `redrawReviewCanvas`, and all five `drawEditCanvas` sub-mode paths. `floorHeightsTick` added to
  draw/edit passive-repaint deps. The elevation outline uses the standard closed-polygon workflow
  (trace → close → review → confirm → lock → Edit Shapes) — no category fork, no separate open-
  polyline mode. Decision: closed polygon is the correct primitive for elevation outlines.
  Browser-verified (Session 21; commit 5266dc5).
- **Elevation spatial Piece 4 sub-piece 2 piece 1 (3fae81b, Session 22):** open-polyline grade /
  soil line tool on Elevation pages.
  * `shapeKind: 'grade-line'` discriminator on shape entries — absent = closed wall polygon;
    `'grade-line'` = open reference polyline. No migration of existing shapes.
  * `drawGradeLineShapes(ctx, completedShapes, pageId)` in canvasRenderer.js: green dashed
    open polyline; no closePath; wired into all 13 render paths.
  * Type-discrimination at 7 code sites: `drawLockedShapes`, `drawGhostShapes`,
    `hitTestSegments`, `hitTestShapeBody`, `getEligibleShapes`, and all 5 edit sub-mode
    forEach loops skip grade-line entries.
  * On-closure prompt on Elevation pages: "Trace grade line?" Yes/No alongside normal polygon
    review. Wall polygon never split or modified. Grade line stored alongside it.
  * Grade-line draw mode reuses existing snap/draw conventions; close-snap ring suppressed;
    finish via Enter key or "Finish grade line" button (min 2 vertices).
  * Stored as 2D pixels via makeVertex, no Z; clears on page-nav and PDF upload.
- **Elevation spatial Piece 4 sub-piece 2 piece 2 — finish-anywhere + snap-as-aid (c7a2092,
  Session 24; −28 lines net):** The endpoint-binding requirement (A1, 2b/2c/2d/2e) was built then
  reverted as the wrong abstraction. A grade line ends with ≥2 vertices ANYWHERE — corner, floor
  line, or open space. Trigger: a real grade line legitimately ended in open space between two
  building masses; the binding gate blocked a valid drawing.
  * `getWallVerticesWithId(pageId)` and `gradeEndSnapRef` remain: corner snap is a POSITION AID
    (vertex lands exactly on a corner on click). Shift suppresses.
  * `getLowestFloorLineY()` and `gradeFloorLineSnapRef` remain: floor-line snap is a POSITION AID
    (vertex Y snaps to lowest-floor reference line Y on click). Corner takes priority; Shift suppresses.
  * No `gradeBindings` state, no `boundStart`/`boundEnd` fields. Grade-line shape = piece-1 shape:
    `{ vertices, pageId, status:'locked', shapeKind:'grade-line' }`.
  * Finish gate: `drawVertexCount >= 2` only. `commitGradeLine` has no binding guard.
  * Above/below-grade meaning = read-time intersection of grade polyline against intact wall polygon
    (#41). No stored binding needed. Wall polygon never modified. See #30 and #41.
- **Elevation spatial Piece 4 sub-piece 2 piece 3 — Redraw grade line (e9c04a6, Session 25):**
  "Redraw grade line" toolbar button on Elevation pages when a grade-line shape exists and no mode
  is active (`isElevationPage && gradeLineOnPage && !anyActiveMode`). On click: deletes ALL
  grade-line shapes for `currentPageId` from `completedShapesRef`, repaints, then calls
  `setDrawMode(true)` + `setGradeLineDrawing(true)` — same entry path as `confirmShape` after the
  on-closure prompt. Wall polygon untouched. `commitGradeLine` + snap-as-aid unchanged.
- **3a scope boundary:** datum layer only — named reference elevations per FLOOR_ORDER level.
  No pixels→real-world XYZ coordinate conversion in this step. Per-element Z is deferred to Phase 2.

**Imperial-only assumption (explicit, Session 14):** The floor-heights panel stores and displays
values in ft/in only. Metric rework deferred to ADDITIONAL_FUNCTIONALITY.md #20.

**Purpose:** elevations are **reference-only** for the 3D envelope — they are not
used to generate new floor/wall planes (those already exist from the floor-plan
traces). Elevations exist to:
- Calibrate vertical (Z) heights per floor
- Capture eave projections (combined with roof plan data)
- Capture window/door openings
- Later: serve as the visual reference for envelope penetrations (vents, etc.) at
  their correct 3D location

**Calibration workflow:**
1. User selects which floor-plan edge this elevation represents (the system shows the
   relevant floor-plan reference geometry; user picks the corresponding edge).
2. User scales the elevation PDF first (drag/corner-drag or slider) to a workable
   size — scale does **not** depend on pre-positioned floor lines.
3. The system shows a draggable horizontal reference line for **every floor level AND
   every ceiling level** known to the project. Each line is set either by dragging it
   onto the corresponding line in the drawing, or by typing the distance to its
   adjacent level. Lines carry a live readout.
4. Because each floor level and each ceiling level has its own line, the gap between a
   ceiling line and the next floor line above it directly captures the **floor-system
   thickness** as a first-class value (not inferred later). Bulkheads and floor drops
   are represented as additional lines or offsets on the same mechanic.
5. Z values for **ALL floors** are set here, in context — including free-text-labelled
   Plan Views that have no implicit elevation order. This supersedes any earlier idea
   of capturing a numeric elevation value at page-categorization time.
6. User drags left/right to align a reference corner (vertical alignment uses the
   corner/anchor reference established on the ground/anchor floor; vertical lines
   extend upward from floor-plan corners to align elevations, even where a cantilever
   means corners do not line up exactly floor to floor).
7. User traces the elevation outline as a single continuous polyline (not separate
   polygons per floor segment).

**Scope boundary — geometry vs. interstitial modelling:** Capturing the line geometry
(floor/ceiling line positions, inter-level gaps, floor-system thickness, bulkhead
offsets) is in scope for this step. *Modelling* what interstitial space means — surface
ownership, which level a bulkhead's services belong to — remains deferred to Phase 2
architecture planning per `ADDITIONAL_FUNCTIONALITY.md` entry #4. This mechanic
collects the measurements without committing to the interstitial data model.

**Cantilevers do not require multiple reference points.** The ghost displays the full
previous floor polygon and the user aligns on matching portions naturally. The
per-page transform captures the correct spatial relationship for the whole floor.
This question is closed.

- **#29 first piece — aligned-edge setback/protrusion hover-label (Session 71; commit ed43c6d):**
  On an Elevation page that has an aligned edge (`elevationEdgeRef`), the source floor plan is shown
  as a toggleable amber reference ghost (routed through the EXISTING `drawGhostShapes` via new
  `getEffectiveGhostSource(pageId)` — floor/roof unchanged, else the elevation's
  `elevationEdgeRef.sourcePageId`). Hovering a wall edge of that ghost, in **view mode**, shows a small
  label with the edge's signed perpendicular distance to the aligned reference face — **"protrusion"**
  (forward of the face) or **"setback"** (behind it), in imperial ft+in. Sign is anchored to the source
  polygon's centroid so it is independent of how the edge was drawn. A **"Show floor plan"** toggle
  (view toolbar, reusing the per-page ghost-visibility state) turns the ghost + readout on/off. The
  label appears only on walls **strictly parallel** to the reference face (both endpoints equidistant to
  ~1 mm); perpendicular/angled walls stay hoverable in the ghost but show no label (a non-parallel
  midpoint distance is a meaningless artifact). Scope: view-mode only; single-source-page (#88). This
  is the first slice of the #29 derived-elevation model. Supersedes/closes #53 as a sub-output.

- **#29 Piece A — derived envelope face overlay (Session 73; commit fd1106d):**
  On an aligned Elevation page, the plan-derived **envelope face** is drawn as a **read-only** bright-green
  rectangle laid over the drawn elevation, so you can judge whether the plan-derived envelope matches the
  drawing. **Plan is source-of-truth — there is no manual adjustment;** if the face is wrong, the fix is
  upstream in the plan, the reference edge, or the floor heights. The face's left/right sides sit at the
  reference edge's horizontal extent and its bottom/top sit exactly on the drawn base-floor line and topmost
  ceiling line (it reuses the same height mapping that draws the floor/ceiling reference lines, so it lands
  registered). It has its **own "Show envelope face" toggle**, independent of "Show floor plan" — you can
  show the derived face, the raw floor-plan ghost, both, or neither. v1 derives only the **single aligned
  edge**; if the drawn wall face is wider (several co-facing plan walls at different depths) the green
  rectangle is intentionally narrower — that is the signal for the next piece (**multi-face derivation**:
  derive every wall face facing this elevation, aligned + recessed, as separate faces at their true depths),
  not a bug. Isometric depth view #126 is DONE (it shows this same setback/protrusion as visible depth).

- **#29 multi-face — DONE (Session 74; commit 871ca67):**
  `deriveElevFaces(pageId)` (read-time, stores nothing) derives ALL wall faces co-facing this elevation's
  reference direction. **Facing-bin:** per-edge outward normal (segmentGeom perp, sign-flipped from centroid)
  dotted against the reference edge's outward normal; `dot ≥ FACING_DOT_MIN (0.996 = cos 5°)` passes;
  opposite wall excluded by the SIGN of the dot (dot ≈ −1), perpendiculars by dot ≈ 0 — the sign
  distinction is the keystone (opposite wall excluded by sign, NOT by angle magnitude). **Offset-cluster:**
  signed depth = `signedPerpDist(midpoint, refAw, refBw) × refSign`; cluster by `reconcileThresholdM ?? 0.05 m`;
  collinear merge (min/max canvas x) ONLY within a same-depth cluster. Each face extruded to its own shared
  vertical extent (`elevFaceVerticalExtent` reusing `drawElevRefLines` exact `anchorY + fhZStack + pxPerMeter`).
  Depth hue: aligned `#22c55e` / recessed `#86efac` (lighter) / protruding `#15803d` (darker). Idle-view
  hover-highlight + click-to-deselect (`excludedFaceIdsByPageId`, additive) VISUAL-ONLY — `deriveEnumeration`
  and `deriveF280Heating` never read the exclusion set; no enumerationTick bump; F280 provably untouched.
  Snapshot/restore round-tripped. Rides existing "Show envelope face" toggle; no stored faceKey structure.
  Ben-verified. Remaining: confirm-view posture (B) — open architecture question for a future planning chat
  (may dissolve under plan-is-source-of-truth model). Two untested branches: protruding hue (no fixture
  protruding face) + angled-reference projection (fixture is axis-aligned); see ADDITIONAL_FUNCTIONALITY #29.

---

## 9. Cross-sections

- Reference-only geometry — same as elevations, used for vertical/ceiling-height
  confirmation, not for generating new wall planes.
- Cross-sections use the **same scale-first-then-drag-lines mechanic** as elevations
  (Section 8): scale the PDF to a workable size first, then set each draggable
  floor/ceiling reference line by dragging onto the drawing or typing the distance to
  its adjacent level.
- Unlike elevations, cross-sections are **not aligned to one outside edge** — they cut
  through the whole building, so alignment uses the visible floor-line references
  throughout rather than a single corner/edge match.

---

## 10. Windows & doors

**As-built (Session 26 — Pieces 1+2: placement layer):**

The tray-blank / drag-and-drop design from earlier planning is **superseded**. The
implemented model is a **two-click free-rectangle** on the elevation canvas followed by
a fill-in dialog. This is the dumb-placement layer; the component model (#44) is deferred.

**Placement workflow:**
1. On an Elevation page with scale set, the **"Place opening" button** appears in the toolbar.
2. Entering placement mode defaults the snap grid to **1 inch** (overridable; prior increment restored on exit).
3. **First click** sets one corner of the opening rectangle.
4. **Rubber-band preview** shows the rectangle as the cursor moves; distance-snap is active;
   axis-snap (45°) is deliberately **off** — free rectangle, any width/height ratio.
5. **Second click** completes the rectangle.
6. **First-use dimension-basis gate:** on the very first opening of the project session, a modal
   asks whether dimensions will be entered as **Frame Size** or **Rough Opening**. Answer stored
   project-wide; never re-prompted until next PDF upload.
7. **Opening dialog:** Kind (window / door radio), Type dropdown (Tilt-turn / Casement / Fixed /
   Slider / Hinged door), Width ft+in, Height ft+in (seeded from pixel distance), Label (free
   text), **U-value (`uw`, W/m²K — both kinds)**, and **SHGC (window-only; doors hide it and force
   `shgc:0`)** (added Session 76, #108). Both performance fields optional; blank → null. Confirm locks
   the opening; Cancel discards and immediately repaints (no lingering rect).
8. **Post-placement re-edit (#108, Session 76):** in Edit Shapes (default sub-mode), **double-click** a
   placed opening to reopen the same dialog pre-populated from the record; Confirm updates it in place
   (same id, no duplicate). Only openings are re-editable this way (`isOpening` guard).

**Data stored per opening:**
```
{ id:'sh-N', vertices:[{x,y}×4], pageId, status:'locked',
  shapeKind:'window'|'door', openingType, label, widthM, heightM,
  dimBasis:'frame'|'rough-opening',
  uw: number|null,    // user-facing U-value in W/m²·K (metric); null until entered or bridge-supplied
  shgc: number|null } // dimensionless; windows: bridge value or null; doors: always 0 (opaque-by-model)
```

**Opening thermal fields (Session 52):** `uw` (W/m²·K) and `shgc` are first-class fields on every opening.
- `uw` is verbatim from the WEW bridge `performance.uw` when placed from list; `null` for interactive placement (UI entry deferred).
- `shgc` is verbatim from the bridge for windows; **always `0` for doors** — doors are modeled opaque by definition. Any glazed light in a door is a future parented sub-item (#104, deferred).
- `getRsiW(uw)`: module-level pure function returning `1/uw`. Engine-internal RSI_W — derived on demand, never stored. Mirrors the `resolveEffectiveConfig` pattern.
- `deriveEnumeration` STEP D emits `uw` and `shgc` per fenestration element.

**Edit Shapes compatibility:** openings support segment drag, vertex drag, move, and delete
sub-modes. Openings are excluded from Split Shape hit-test and Combine eligibility.

**Snap selector:** a single persistent `<select>` in the top toolbar — always visible when a
page is loaded, disabled (greyed) when no scale is set. Replaced all prior per-toolbar-mode
selector instances. One selector total, shared across draw / placement / edit modes.

**Place-from-list (Session 50 — #46 Stage Two):**

Openings can also be placed from a **structured holding area** rather than drawn interactively.
A normalized entry (mark, openingKind, operationType, frameWidthM/frameHeightM, roughWidthM/roughHeightM,
quantity, location) sits in `pendingOpeningsRef` until the user places it. The "Openings to place"
sidebar tab lists pending entries; the user clicks "Place" then clicks once on an elevation page —
no two-click sizing. Dimensions come from the entry (frame or rough per the project-level
`dimensionBasisRef`). Shape produced is identical to the interactive path (`confirmOpening()` output):
widthM and heightM are always non-null. `operationType` passes through verbatim.
Remaining count decrements on each placement; the entry is removed when exhausted.
`loadPendingOpenings(entries)` is the public API; `window.__loadPendingOpenings` is the DEV path.
WEW Bridge is the first upstream source; the holding-area and placement code is source-agnostic.
Stage One (recognition/ingestion from raw schedule data) remains gated on #28.

**Deferred (see ADDITIONAL_FUNCTIONALITY.md):**
- #44 — component model (shared instance identity; edit-all/make-unique)
- #45 — window-as-assembly (mullions, sub-sections, frame geometry, glass areas)
- #46 Stage One — schedule import / recognition (gated on #28)
- #100 — auto-match by location text
- #101 — operationType vocabulary reconciliation
- #102 — existing window-schedule reader tool (known asset for #46 Stage One)

**Future connection (not Phase 1.5):** the elevation canvas will later display envelope
penetrations (e.g., bathroom exhaust vents) at their correct location based on stored 3D paths
— this is why elevation geometry is accurately scaled and positioned now.

---

## 10a. Config-driven equipment worklist (§8.2 — Session 33)

The Project Setup panel (§9) drives a derived worklist of mechanical/electrical equipment items to be placed on the drawings.

**Config → spawn → place model:**
- `CONFIG_FIELDS` entries carry a `spawns(value) => [{type, count}]` function hook. Filled on: `space-heating` (heat-pump-ducted → air-handler + outdoor-unit), `ventilation` (hrv/erv → hrv-unit), `bath-fans` (`kind:'count'` numeric field → N × bath-fan). `cooling` spawns null (units already spawned by space-heating; dedup handles overlap).
- `cooling` field has three options: heat-pump-ducted (added Session 37), central-ac, none.
- `ITEM_TYPES` table defines four item types (air-handler, outdoor-unit, bath-fan, hrv-unit), each with an obligation list.
- `resolveEffectiveConfig(rawValues)` + `CONFIG_CROSS_FIELD_RULES` (Session 37): cross-field rules applied before spawn. Current rule: heat-pump-ducted space-heating prefills cooling = heat-pump-ducted when cooling is unset (prefilled-but-editable; never clobbers non-null user choice). `getConfigValue` = raw user intent; `resolveEffectiveConfig` = engine-resolved view; called at exactly deriveWorklist + panel render.
- **`resolve-toh` rule (Session 54):** derives outdoor heating design temperature `toh` (°C). Override wins; falls back to `F280_WEATHER` register lookup by composite `station|||region` key; else null. `toh` is always derived — never stored as raw intent. Consumed by the F280 endpoint when built.

**Climate station register (`src/data/f280-weather.json`):**
- 679 entries, national (all 13 provinces/territories). Extracted once from `F280_Weather.xls` (encrypted) via Excel COM; static bundle.
- Three CONFIG_FIELDS in 'Climate' category: `location-station` (679-option select, value = `"station|||region"` composite for province disambiguation), `toh-override` (`kind:'number'`, allows negatives, step=0.5), and `ti-heating` (`kind:'number'`, indoor heating design temp; added Session 76). `kind:'number'` is a panel render branch distinct from `kind:'count'`; it now reads an optional `field.placeholder`.
- `window.__verifyToh()`: 6 DEV-block assertions (count, exact lookup, province disambiguation, resolver paths). All PASS.
- `deriveWorklist()` collects all spawn requests into `maxCountByType` (dedup: max count per type, not additive), then builds `{ toPlace, obligations }`. A shared appliance implied by two fields appears once. Never stored.

**Placement:**
- Worklist panel (purple button) shows to-place rows with a Place button per row.
- Place button gated to floor-plan and roof-plan pages with confirmed scale.
- Single click places the item as `shapeKind:'equipment-item'` in `completedShapesRef`: a one-vertex point shape storing pixels only. World meters derived on demand via `pageVertexToWorld` — recalibration-independent.
- Placed items rendered as purple circles with type-initials (zoom-compensated). Wired into all 14 render paths.

**Obligations (three kinds):**
- `run` — cross-trade coordination required (plumbing, electrical, envelope); rendered blocked+🔒 until a run path connects both endpoints. Shows "✓ Connected" (green) when satisfied. See §8.2 step 4 below.
- `property` — self-contained attribute set on the item itself (e.g., outdoor unit mount-type: ground/wall). Live `<select>` enabled once the item is placed; written back to `obligationState` on the shape.
- `placement` — reserved kind for future placement-constraint obligations.
- **Trade→role wiring (Beat 3, Session 38, commit 1aae356):** Obligation defs now carry `trades: string[]` (role ids from ROLE_LABELS). RUN_PAIR_MAP entries carry `trade:` (category-level scalar). `deriveWorklist` resolves `ownerRoles: string[]` per obligation (run: category trade → ob.trades fallback; property: ob.trades). Each worklist obligation row shows a secondary "Owner: X" / "Owners: A, B" / "Owner: unassigned" line. Role label only — person-name from roleAssignments is a deferred follow-on (#61). "envelope" obligations have `trades: []` — no ROLE_LABELS entry for envelope work (#78).

**Edit Shapes compatibility:**
- Equipment items support Move and Delete sub-modes.
- Deleting an item returns it to the worklist `toPlace` (worklistTick bumped).
- Equipment items are excluded from insert-vertex, split, and combine (polygon-only ops) via `isEquipmentItem` guard.

**Data stored per equipment item:**
```
{ id:'sh-N', shapeKind:'equipment-item', itemType:'air-handler'|'outdoor-unit'|'bath-fan'|'hrv-unit',
  instanceKey:'type#N', pageId, status:'locked', vertices:[{x,y}],
  obligationState:{ [obligationId]: satisfiedValue } }
```

---

## 10b. Run paths — §8.2 step 4 (Session 34)

Open polylines connecting placed equipment items. A run is a **path**, not a shape or polygon.

**Key model (new — no prior precedent):**
- A run **persists in uncharacterized state** — committed to storage immediately, even with loose ends or an unmapped pair.
- Resting states: grey dashed (uncharacterized), solid amber (lineset / characterized).
- Category is **endpoint-derived** from the pair of item-types at the two ends — never menu-selected.

**`RUN_PAIR_MAP`** — module-level unordered pair→category table:
- `{air-handler, outdoor-unit} → lineset` — satisfies `lineset-endpoint` on the air-handler and `lineset-to-handler` on the outdoor-unit.
- Adding a run type = one data row, no engine change.

**Draw interaction:** "Draw run" button on floor/roof pages with confirmed scale. Reuses draw-mode plumbing. Finish-anywhere ≥2 vertices (Enter or "Finish run"). Purple ring on equipment-item snap hover.

**Characterization:** When committed with both endpoints on items in the map — assigns category, writes `obligationState[obligationId] = runId` on both items. Worklist shows "✓ Connected" (green).

**Reversal:** Delete the run → obligations revert to blocked. Delete an endpoint item → connected characterized runs lose characterization, surviving endpoint obligations revert.

**`drawRunPaths`:** Wired into all 14 render paths. Excluded from all polygon ops (insert/split/combine/ghost).

**3D view:** Run lines appear in ThreeDView at the page's scalar floor Z (same zStack level as the floor plan page). Grey = uncharacterized, amber = lineset.

**Data stored per run:**
```
{ id:'sh-N', shapeKind:'run', vertices:[{x,y}], pageId, status:'locked',
  endpointItems:{ start:'sh-N'|null, end:'sh-N'|null }, category:'lineset'|null }
```

---

## 11. Important scope note — structural plane only (for now)

Everything traced in this phase (floor plans, elevations, roof) represents the
**structural outside face** of the building envelope — not the finished/cladding
face. Additional assembly thickness (e.g., 2" exterior insulation + 3-layer cladding)
will later shift the true outside plane outward from what's traced here. This is a
**Phase 2 assembly-thickness concern**, not something to solve while tracing now, but
it's worth keeping in mind so the data model doesn't accidentally treat the traced
line as the final exterior face.

---

## 11b. F280 above-grade conductive heat-loss endpoint (Session 56)

**`deriveF280Heating(enumeration, resolvedConfig)`** — pure, derive-on-demand, never stored. Called at render time from the F280 Results panel. Two arguments: the return value of `deriveEnumeration()` and `resolveEffectiveConfig(projectSetupRef.current.values)`.

**`F280_TI_HEATING = 22`** — module-level const (°C); now the **fallback only** for indoor heating design temperature. As of Session 76 the `tiC` seam reads the `ti-heating` Climate CONFIG_FIELD (`resolvedConfig['ti-heating']`, NaN-guarded) and falls back to this const when unset. Ti is now project-configurable — the last hardcoded F280 input has been retired (`ti-heating` DONE, Session 76; commit 44615f2).

**No-climate guard:** if `resolvedConfig.toh` is null → returns `{ status:'no-climate', total:null }`. No ΔT computation against null.

**Computation (when `status:'ok'`):**
- `deltaT = tiC − toh`, where `tiC = resolvedConfig['ti-heating'] ?? F280_TI_HEATING` (NaN-guarded; fallback 22)
- Four surface kinds in `bySurfaceKind`:
  - `'wall-surface'`: area = `netAreaM2`, U = `effectiveUValue`
  - `'flat-roof-surface'`: area = `insideFaceAreaM2`, U = `effectiveUValue`
  - `'window'` / `'door'`: area = `widthM × heightM`, U = `uw`
- Surfaces missing U-value: `unresolvedCount++`, area counted, no loss contribution, no silent zero.
- `uAvg` per kind = `uaSum / areaM2`.
- `conductiveAboveGradeW` = sum of all `lossW` across kinds.

**Return shape:**
```js
{
  status: 'ok',
  tiC: 22, tohC: number, deltaT: number,
  bySurfaceKind: { [kind]: { areaM2, uaSum, lossW, count, unresolvedCount, uAvg } },
  conductiveAboveGradeW: number,
  groundCoupled: object | null,   // deriveGroundCoupledLoss result when it resolves; null on no-ground (§11c)
  total: number,   // = conductiveAboveGradeW + groundCoupled.total_W (when ground resolves)
  notModeled: [...],   // 'below-grade-wall'/'slab-on-grade' SHED when ground resolves; 'floor-over-unheated'+'solar-gain' remain
}
```

**Extensible spine:** Adding a genuine HEATING loss endpoint = a bucket + loop body (in-engine) or a separate derive-fn wired into the output (like §11c ground-coupled); no refactor. below-grade-wall and slab-on-grade were exactly such additions. `notModeled[]` marks the current gap explicitly and shrinks as heating endpoints land. NOTE: `'solar-gain'` is NOT a heating bucket — F280 credits zero solar against heating; solar is a COOLING-only term for a future `deriveF280Cooling` endpoint (see ADDITIONAL_FUNCTIONALITY.md #130). It stays in `notModeled[]` permanently and never leaves via a heating build.

**F280 Results panel:** sidebar tab inside consolidated side-panel. Renders: design conditions (Ti / Toh / ΔT), per-kind table (Kind | Area m² | Ū W/m²K | Loss W), amber inline warning for kinds with unresolved U, above-grade conductive subtotal in kW (blue), greyed "Not yet modeled" list. No-climate guard shows explanatory text instead of numbers. Panel re-derives on `enumerationTick` and `projectSetupTick` changes.

**NOT golden-gated** (deliberate — "nearly compliant, sooner" target). The `notModeled[]` list makes incompleteness explicit.

**`window.__dumpF280()`** — DEV console function; prints ΔT, per-kind summary (area/U_avg/loss/unresolved-count), subtotal in W and kW, `notModeled[]`. Tree-shakes from production.

**Unresolved-U coverage:** walls with no `surfaceAssemblyRef` entry formerly showed `[unresolved U]`. **#106 (DONE Session 75; commit `f2d5a57`)** wires Project Setup assemblies to the `getSurfaceAssembly` miss path as a project-level default (`ASSEMBLY_TYPE_DEFAULTS` lookup, placeholder 1/R U-values), so a surface with no per-surface entry now inherits `source:'project-default'` when the matching Project Setup assembly is set. Precedence: explicit manual/library ref > project-default > unset. Verified: setting `assembly-wall` drops the wall `unresolvedCount` 8→0 on the elevation fixture; `__verifyFixture` 44/44 (unset-assembly fixture unchanged).

## 11c. Interim ground-coupled loss engine (Session 78; commit `b92c86a`)

**`deriveGroundCoupledLoss(enumeration, resolvedConfig)`** — a SEPARATE, STANDALONE module-level pure function (NOT a bucket inside `deriveF280Heating`). Consumes the Session-77 `slab-surface` + `below-grade-wall` enumeration kinds; the FIRST thermal endpoint that removes entries from `notModeled[]`.

**Model B (interim) — NOT BASESIMP:** `loss_W = k × effectiveUValue × area × ΔT_ground`, where `ΔT_ground = tiC − groundTempC` and `k = soil-conductivity / 0.85` (Normal 0.85 → ×1.0 honest passthrough; wetter soils raise loss linearly). The input contract (soil conductivity, depth-below-grade `belowGradeHeightM`, exposed perimeter `soilContactPerimeterM`, area) is deliberately BASESIMP-shaped so a future full BASESIMP port swaps the MATH only — the consumed fields do not change. `belowGradeHeightM`/`soilContactPerimeterM` are already on the elements (part of the contract, not yet weighted by the interim math).

**Inputs:**
- **`soil-conductivity` CONFIG_FIELD** (new **Site** category) — 3 BASESIMP classes: `'0.85'` Normal (dry sand/loam/clay), `'1.275'` High (moist soil), `'1.9'` Very wet/permafrost. Unset resolves to `SOIL_CONDUCTIVITY_DEFAULT = 0.85` (×1.0). `SOIL_CONDUCTIVITY_OPTIONS` + `soilClassLabel` module constants.
- **`resolve-ground-temp` rule** (in `CONFIG_CROSS_FIELD_RULES`) — station `dgtemp` lookup via the SAME `station|||region` composite parse as `resolve-toh`; `groundTempC` DERIVED (never stored), null when no station. No override field this pass. Uses the `f280-weather.json` `dgtemp` field (present since Session 54).

**No-ground guard:** if `resolvedConfig.groundTempC` is null → returns `{ status:'no-ground', total:null }`. No ΔT against null. Reachable within a valid climate when `toh-override` is set but no station is selected.

**Return shape (when `status:'ok'`):** `{ status:'ok', groundTempC, tiC, deltaTground, soilConductivity, soilFactor:k, bySurfaceKind: { 'slab-on-grade': {...}, 'below-grade-wall': {...} }, total_W, total_kW, unresolvedCount }`. Per-kind bucket mirrors `deriveF280Heating` (`areaM2`, `uaSum`, `lossW`, `count`, `unresolvedCount`, `uAvg`); slab area = `grossAreaM2`, below-grade area = `belowGradeWallAreaM2`; missing U → `unresolvedCount++`, no silent zero.

**Wiring into `deriveF280Heating` OUTPUT (not its math):** `deriveF280Heating` calls this and, when it resolves, attaches `groundCoupled` and filters `'below-grade-wall'`/`'slab-on-grade'` OUT of `notModeled[]`, and sets `total = conductiveAboveGradeW + ground.total_W`. On `no-ground`, `groundCoupled:null` and `notModeled[]` is unchanged. `'floor-over-unheated'`/`'solar-gain'` always remain.

**F280 Results panel:** adds a ground-coupled conditions zone (ground temp / ΔT_ground / soil class ×factor), a per-kind surfaces table (Kind | Area | Ū | Loss), and a "Ground-coupled subtotal (kW)" line. No-ground guard shows explanatory text (same pattern as the no-climate guard). In the default fixture the below-grade-wall row reads `(none)` (honest — no grade line); slab shows real Watts.

**DEV:** `__dumpF280` extended with ground rows + grand total. New **`window.__setConfig(id, value)`** hook writes through `setConfigValue` (parallels `__ingestAssembly`/`__setCrop`) for deterministic browser verification; tree-shakes from prod.

**Golden harness:** `__verifyFixture` **57/57 PASS** (was 44; +13 checks `gc.a`–`gc.m`). Sidecar `groundCoupledCheck` is a SYNTHETIC slab+below-grade case (the default fixture has a slab-surface but no below-grade-wall). Station Vernon → `dgtemp` 10, `deltaTground` 12; slab 12W + below-grade 24W = 36W at k=1.0; High soil → k=1.5 → 54W. Checks: groundTempC lookup, deltaTground, per-kind loss at soilFactor 1.0, soilFactor≠1.0 flip, no-ground status, and `notModeled[]` add-when-ok / keep-when-no-ground.

**Verified (Claude preview):** `__dumpF280` with station Vernon + `assembly-floor` eng-i-joist → slab-on-grade 19.74 m² × 0.045 × 12 = **10.8 W**, below-grade `(none)`, `notModeled` = `floor-over-unheated, solar-gain`. No-ground path → `no-ground`, total = above-grade only, all four `notModeled` retained. Zero console errors.

**NEXT:** ~~full BASESIMP port~~ **DONE — §11d.**

---

## 11d. BASESIMP ground-coupled wire-in — Stage 1 (Session 79; commit `4f6be45`)

**REPLACES §11c.** The interim Model-B `deriveGroundCoupledLoss` (per-surface `k·U·A·ΔT`) is gone; `deriveGroundCoupledLoss` is now the ADAPTER around the full, float-exact BASESIMP engine (`src/basesimp/engine.js`, acceptance 3/3). Bundled as JSON imports: `BASESIMP_TABLES = { coefficients, cornerCf, weather }`.

**Foundation model (locked, F280-structural):** one foundation = the WHOLE lowest-floor footprint (the single `slab-surface` enumeration element). F280's shape-factor correlations are per-FOUNDATION (whole box), not per-wall — so the per-surface summation was the wrong shape. ONE `computeGroundCoupledLoss` call per building. Multi-foundation-type buildings collapse to one box (§5 approximation, acceptable under the single-reference-edge #88 geometry model).

**The adapter (`deriveGroundCoupledLoss(enumeration, resolvedConfig)`):**
- **Guards (honest absence, same no-ground shape as before):** no station, no `slab-surface` footprint, or pre-Stage-1 enumeration (missing `footprintLengthM`) → `{status:'no-ground', total:null}`. Never calls the engine against null climate.
- **`isBasement` v1 heuristic:** a `below-grade-wall` element deeper than `0.6 m` ⇒ basement; the deepest sets foundation-floor `depth`, wall height = its stored `wallTopZm − wallBottomZm`. Else slab-on-grade (`depth 0.05`, `height 0`).
- **Box:** `length/width` = `slab.footprintLengthM/WidthM` (STEP A.6 bbox, engine sorts max/min); `exposedPerimeter 0` (=full — the whole-building footprint is fully soil-exposed; `soilContactPerimeterM` reserved for a future shared-wall model); `soilConductivity` = RAW W/m·K (NOT the interim `k=value/0.85` factor); `waterTableDepth`/`designHeatingMonth` from new Site CONFIG_FIELDS (defaults 8 m / January).
- **Climate reuse:** `station` ("City\|\|\|Region") passed straight through — the engine's own `resolveClimate` reproduces the `toh`/`dgtemp` Collabinator already resolves (verified: 679/679 key-identical weather tables). No second climate path. Engine uses a FIXED `Troom = 22 °C` (F280 standard) — the `ti-heating` config does NOT enter ground-coupled math.
- **STAGE-1 STUB:** config package HARDCODED — `BCIN_3` basement / `SCB_33` slab; `insExterior/insInterior/addedRsi = 0`, `radiantFraction/fluidTemp = 0`. Result is ENGINE-EXACT but ASSEMBLY-GENERIC. The suffix number alone swings ~26% (BCIN_1 2505 W vs BCIN_3 3157 W) → provisional, not final. Stage-2 fidelity layer = the package-decode surface (ADDITIONAL_FUNCTIONALITY #131).

**STEP A.6 change:** `slab-surface` now carries `footprintLengthM`/`footprintWidthM` (bbox of the already-converted world vertices — no new px↔m math, coordinate seam honored). Bbox OVERSTATES non-rectangular footprints (§5 approximation).

**Output/UI change:** `deriveF280Heating` consumption unchanged (`total_W`/`status`); `notModeled[]` sheds `below-grade-wall` + `slab-on-grade` on resolve, keeps `floor-over-unheated` + `solar-gain`. The F280 panel's per-kind slab/below-grade table is REPLACED by a single whole-foundation figure (type / config-package + Stage-1-stub badge / footprint L×W / wall height (basement) / depth / ground temp / soil class / water-table+month / whole-foundation load + "engine-exact, assembly-generic until Stage 2" note). `__dumpF280` prints the same whole-foundation block.

**Golden harness re-anchored:** `__verifyFixture` **56/56 PASS** (gc block a–m → a–l, 13→12). The gc checks guard the WIRE, not the engine math (engine internals stay float-exact-guarded by `src/basesimp/acceptance.test.js` 3/3): slab synthEnum (footprint 12.1×6.1 + Winnipeg Jan) through the adapter reproduces the SCB_33 workbook value **500.6862 W** (proves box-build + SCB_33 default + climate pass-through); basement synthEnum (below-grade wall 1.75 m > 0.6, height 2.5) asserts adapter box == a direct `BCIN_3` engine call; plus isBasement selection, no-ground, and `notModeled[]` shift.

**Verified (Claude preview, fixture-elevation):** `__dumpF280` station Vernon + `assembly-floor` → whole-foundation box 7.62×2.59 m, slab-on-grade SCB_33, **178.8 W (0.18 kW)**; `notModeled` = `floor-over-unheated, solar-gain`. No-ground path (`toh-override`, no station) → ground no-ground, total = above-grade only, all four `notModeled` retained. Panel renders the whole-foundation zone. Zero console errors.

**§5 approximations (eyes-open, logged):** package hardcoded (Stage-1 stub — engine-exact but assembly-generic); multi-foundation-type collapses to one whole-footprint box; bbox L/W overstates non-rectangular footprints; grade-Z = mean vertex Z (#88); water-table default 8 m understates genuine high-water-table sites; single-reference-edge depth/opening attribution.

**NEXT:** Stage-2 package-decode surface (#131) + `solar-gain` (cooling endpoint #130).

---

## 12. Phase 2 (confirmed scope, for context only — not building yet)

- 3D wireframe model, orbitable
- Spreadsheet output of all outer-shell building envelope data
- Assembly type assignment
- Interior surface geometry generation (derived from exterior plane + assembly
  thickness)

---

## 13a. Consolidated side-panel container (#69 — Session 40)

The four right-side overlay panels (Project Setup, Worklist, Floor Heights, Envelope) are
housed in a single `<div className="side-panel-container">`. One "Panels" toolbar button
(gated the same as the old four: `!calibMode && !drawMode && !editMode && !categorizeMode`)
opens/closes the container.

**State:** `showSidebar` (bool) + `activeTabId` ('project-setup' | 'worklist' | 'floor-heights'
| 'envelope') + `sidebarWidth` (number, 300px default) + `sidebarWidthRef` (useRef). The four
legacy `show*` values are derived constants (e.g., `showProjectSetup = showSidebar && activeTabId
=== 'project-setup'`). Legacy `setShow*` setters are thin wrappers → `setShowSidebar(false)`.

**Layout modes** (driven by `sidebarWidth >= 520`):
- **Narrow (< 520px):** `side-panel-tab-bar` is a vertical flex column — four stacked label bars,
  all always visible; active is highlighted; panel content fills below.
- **Wide (≥ 520px):** `side-panel-tab-bar--wide` makes it a horizontal row of tabs with an active
  underline — browser-style tab UI. Switching mode does not change active panel.

**Drag-to-resize:** `.side-panel-resize-handle` on the left edge; drag left = wider, right =
narrower; clamped 300px–80vw. Width and last-active tab persist across close/reopen within the
session. Cross-session persistence deferred (no localStorage pattern in the codebase).

**CSS override:** `.side-panel-content .fh-panel` resets all absolute-positioning properties
(`position:relative`, `right:auto`, `height:auto`, `width:100%`, etc.) so existing fh-panel
divs flow naturally inside the container. All panel content JSX is preserved verbatim.

---

## 13b. Verification harness — __verifyFixture + golden sidecar (Session 42; sidecar re-frozen Session 43; extended Sessions 46 + 49)

`public/devFixtures/fixture-elevation.json` is the canonical multi-floor scenario fixture. It
carries a window (widthM=0.381, heightM=0.5588) and door (widthM=0.762, heightM=1.7272) on
page-2 (elevation) — hand-placed by Ben, empty labels — both associating to wall-sh-1-seg2-Main_Floor.
Also carries surfaceAssembly data: wall-sh-1-seg2-Main_Floor → tier:'manual', effectiveUValue:0.25,
thicknessM:0.3.

`public/devFixtures/fixture-elevation.expected.json` is the golden sidecar — frozen expected
derived values (wallSurfaceCount, gross/net/openingTotalM2, soffitCount, windowCount, doorCount,
subtractionSurface, assemblyCheck, insideFaceCheck, thermalCheck). Tolerance ±0.0001m² for numeric
fields; strict === for string/null fields (controlLayers). Hand-anchored after human-verified
__dumpEnumeration run; NOT auto-generated at test time. Updated when the scenario evolves by
re-anchoring from a fresh dump.

`window.__verifyFixture()` (async DEV fn, after __dumpEnumeration in the DEV block): fetches sidecar,
calls deriveEnumeration(), runs checks (a)-(m.cl.*) + (s)/(s.area) + partition invariant for all wall
surfaces, closure stub SKIPPED (#87 gated). checkEq helper added Session 49 for strict string/null equality.
Checks: (j) effectiveUValue + (k) thicknessM (assembly-attach, Session 43); (l) insideFaceAreaM2
(Session 46); (m)–(m.cl.*) thermal fields via library-tier surface (Session 49) — includes
null controlLayers.thermal as a deliberate null-preservation check; (s)/(s.area) flat-roof-surface
footprint area (Session 55). Invoke after `await window.__restoreFixture(obj)` with fixture-elevation.json.
Currently **44/44 PASS**.

**Wall-surface elements** (in `deriveEnumeration` STEP A output) carry:
- `effectiveUValue`, `thicknessM`, `assemblySource` (since Session 43)
- `insideFaceAreaM2` (since Session 46)
- `effectiveRSI`, `controlLayers` (since Session 49 — library tier only; null for manual/unset)

**Flat-roof-surface elements** (in `deriveEnumeration` STEP A.5 output, Session 55):
- One element per confirmed roof-plan page, summing all `roofType:'flat'` locked polygons.
- Fields: `id` (`flat-roof-page-N`), `kind:'flat-roof-surface'`, `grossAreaM2`/`netAreaM2`/`openingAreaM2` (= gross/0), `insideFaceAreaM2` (= gross; horizontal ceiling, no thickness offset today), `roofCeilingZm` (top of wall-stack ceiling Z), full assembly seam (`effectiveUValue`, `effectiveRSI`, `controlLayers`, `thicknessM`, `assemblySource`).
- Sloped/pitched surfaces deferred (#18). Visible in Envelope panel under "Flat Roof Surface".

**Slab-surface elements** (in `deriveEnumeration` STEP A.6 output, Session 77; commit `afd0c58`):
- One element from the LOWEST floor's wall polygon footprint (mirrors flat-roof shoelace + adds per-edge length).
- Fields: `id` (`floor-page-N`), `kind:'slab-surface'`, `grossAreaM2`/`netAreaM2`/`openingAreaM2` (= gross/0), `insideFaceAreaM2` (= gross), `soilContactPerimeterM` (Σ world-meter edge lengths), `floorZm` (lowest floor), full assembly seam.
- Inherits `assembly-floor` project-default via `getSurfaceAssembly` (`floor-` prefix now live). Envelope panel "Slab / Floor".
- Geometry-only: on-grade-slab-vs-basement-floor is a downstream config distinction, NOT modeled here. Fixture cross-check EXACT (Crawlspace 19.742 m² / 20.4216 m).

**Below-grade-wall elements** (in `deriveEnumeration` STEP A.7 output, Session 77; commit `afd0c58` — #41 principle→BUILT):
- Per elevation page: grade-line vertices → world-Z via `elevYToWorldZ`, compared against the reference-edge wall face's bottom Z (`floorZm` of the reference level).
- Fields: `id` (`foundation-<shapeId>-seg<i>-<level>`), `kind:'below-grade-wall'`, `belowGradeHeightM` (= `clamp(gradeZ − floorZm, 0, wallHeight)`), `belowGradeWallAreaM2` (= height × reference-segment run length), `runLengthM`, `gradeZm`, `wallBottomZm`, `wallTopZm`, full assembly seam.
- Inherits `assembly-foundation` project-default via `getSurfaceAssembly` (`foundation-` prefix now live). Envelope panel "Below-Grade Walls".
- **Grade-Z model v1 = mean world-Z of the grade line's vertices** (per-segment sloped-grade deferred, pairs with #88). **Inherits the #88 single-reference-edge limitation.**
- **Honest-absence:** emits nothing (not a zero) when the elevation lacks scale/edge, `fhZStack` is empty, no grade line exists, or the reference level/segment can't resolve.
- **Wall polygon is NEVER carved** (#41 invariant held — pure read-time comparison of stored shapes).
- **At Session 77 `notModeled[]` and `deriveF280Heating` were UNCHANGED** (geometry-only). **Session 78 then CONSUMED these quantities:** the interim ground-coupled loss engine (§11c) now sheds `'below-grade-wall'`/`'slab-on-grade'` from `notModeled[]` when a station resolves `groundTempC`.
- **DEV-fixture note (not a bug):** `fixture-elevation`'s reference edge targets Main Floor (above grade) and has no grade line, so `below-grade-wall` correctly emits nothing there. Exercising it live needs a fixture whose reference edge points at a below-grade level plus a locked `grade-line` on an aligned+scaled elevation with `fhZStack` populated — same class of fixture-setup note as the #121 evidence.

**#28 gate:** the harness existing removed one stated blocker of #28, but #28 (plan reader) remains
gated on the post-3D-model deep-review waypoint.

---

## 13. Explicitly deferred / abandoned approaches (do not reintroduce)

- Vertex-drag and break-point insertion directly on **inherited/reference** geometry —
  abandoned in favor of the simpler read-only-ghost + confirm-scale model (Section 6).
- Auto-detecting the compass rose via image recognition — manual alignment only.
- Treating the working-area crop as a permanent crop (it's a default viewport, not a
  destructive crop).
- **Windows/doors tray-blank / drag-and-drop design (§10 original):** side-tray with a
  generic window blank, drag-to-place, resize-by-corner, "suggested reference lines" after
  first placement — superseded by the two-click free-rectangle model (Section 10, as-built).
  Do not reintroduce the tray concept.
