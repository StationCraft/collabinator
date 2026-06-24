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

Two input methods:

1. **Drag-and-drop:** A generic window blank (default 24"×24") sits in a tray on the
   side of the screen. User drags it onto the elevation, drops it aligned to a corner
   of the actual window opening (snapped to a grid), grabbing/dropping by a corner
   handle.
2. **Resize:** Either drag the opposite corner to match the real opening, or click to
   type exact dimensions — when dimensions are typed, the **original drop-handle
   corner stays locked in place** and the opposite corner adjusts.

**Additional UI:**
- A top bar toggle indicates whether the user is entering **frame dimension** or
  **rough opening** dimension.
- A snap-grid setting controls the smallest increment the drag/resize tool honors.
- Once one window's size is set, **"suggested reference lines" activate** (same
  mechanic as floor-plan tracing) to help align subsequent windows.
- Workflow otherwise mirrors floor-plan tracing: click/place, then confirm.

**Future connection (not Phase 1.5, noted for continuity):** the same elevation canvas
will later be used to display envelope penetrations (e.g., a bathroom exhaust vent),
automatically rendered at the correct location based on the penetration's stored 3D
path and elevation — this is why elevation geometry needs to be accurately scaled and
positioned now, even though penetrations themselves are a later phase.

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

## 12. Phase 2 (confirmed scope, for context only — not building yet)

- 3D wireframe model, orbitable
- Spreadsheet output of all outer-shell building envelope data
- Assembly type assignment
- Interior surface geometry generation (derived from exterior plane + assembly
  thickness)

---

## 13. Explicitly deferred / abandoned approaches (do not reintroduce)

- Vertex-drag and break-point insertion directly on **inherited/reference** geometry —
  abandoned in favor of the simpler read-only-ghost + confirm-scale model (Section 6).
- Auto-detecting the compass rose via image recognition — manual alignment only.
- Treating the working-area crop as a permanent crop (it's a default viewport, not a
  destructive crop).
