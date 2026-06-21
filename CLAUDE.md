# Collabinator — Phase 1 Build (pdf-viewer)

This file is read automatically by Claude Code at the start of every session in this
project folder. It exists so a new session understands the project without the user
re-explaining context every time.

## What this is

This is **Phase 1** of Collabinator — a web-based pre-construction design and
coordination platform for residential construction, eventually hosted at
BuildingCollective.ca. The full long-term vision is documented separately (see
"Reference documents" below) but is NOT all being built now. This project folder is
only the first, smallest functional slice.

**Phase 1 goal:** upload a PDF, view it page by page, set a real-world scale by
drawing a reference line over a known dimension, then trace building geometry (walls,
rooms, assemblies) with automatic snap-to-grid and axis-locking. Current focus:
multi-floor coordination — tracing the same building envelope across multiple floor
plans, aligning them, and preparing for elevation-based 3D assembly.

**Owner / primary builder:** Ben — principal at StationCraft Inc (SCI) / Advance
Building Collective (ABC), a residential pre-construction design consulting firm in
BC, Canada. Working on a laptop, which requires zoom for readability.

## Current project location

`C:\Users\ben\Collabinator\pdf-viewer`

## What is built so far (current state)

A React + Vite app with:

- PDF loading and multi-page navigation
- Page-specific canvas sizing for all formats
- Calibration workflow: two-click amber reference line on the PDF canvas,
  imperial (ft + in) or metric (m) scale dialog, per-page scale factor stored
- Live drawing tool (vertex array storage — `{vertices: [{x,y}]}`):
  * Click-to-trace chained polyline segments
  * Axis/angle snap (nearest 45°) — independent toggle, on by default
  * Distance snap (configurable grid: 1″/3″/6″/12″ or 2.5/7.5/15/30 cm) —
    independent toggle, requires scale set
  * Shared absolute page grid: all shapes on a page snap to the same
    `{x:0, y:0}`-origin Cartesian grid, including the first vertex of every
    new shape (prevents per-shape grid drift)
  * Alignment guides: H/V snap to any prior vertex in the active trace,
    10px tolerance, amber dashed guide lines, takes priority over axis snap
  * Undo (Z key removes last vertex), Escape/Stop cancels trace
- Shape closure detection: click near first vertex (16px radius) to close;
  green ring + dashed preview line signals closure zone
- Polygon review/confirm workflow:
  * Closed polygon enters review state (green fill/stroke, static)
  * Confirm locks it to `completedShapesRef` (blue fill/stroke, persists on canvas)
  * Discard removes it; locked shapes from earlier confirms remain visible
  * Escape in review state = discard
- Multiple shapes per page; locked shapes rendered as background on all redraws
- **Edit Shapes mode** — entered after at least one shape is locked on the page:
  * **Segment drag:** click-drag any edge perpendicular to its axis; adjacent
    vertices move with it; canvas-clamped
  * **Vertex drag:** click-drag any corner to reposition; canvas-clamped
  * **Label override:** click a segment length label to type an exact measurement;
    the segment is resized around its midpoint
  * **Undo/Redo:** full undo/redo stack present in all Edit Shapes sub-modes
    (default, Move, Combine, Split, Delete); each new edit clears the redo stack;
    not available for Draw mode (uses Z key for vertex undo instead)
  * **Shift-to-release-axis-lock:** holding Shift during draw-tool rubber-band,
    vertex drag, or segment drag temporarily releases the 45° angle constraint
    while keeping distance-snap grid active; Split Shape cut line also axis-snaps
    by default, released with Shift
  * **Move Shape sub-mode:** click-drag a whole shape; each vertex independently
    snaps to the absolute page grid (prevents float drift from delta-snapping)
  * **Combine Shapes sub-mode:** collinear-overlap detection — two shapes are
    eligible if they each have an edge on the same infinite line (anti-parallel)
    with nonzero overlap length; merge inserts new vertices at the exact overlap
    boundaries via linear interpolation (no rounding/snapping), then splices the
    shared portion out; full-edge-match is a special case and still works
  * **Split Shape sub-mode:** click a shape to select it, draw a two-point cut
    line; the line is extended infinitely to find two boundary intersections and
    produce two independent locked shapes; handles near-collinear and vertex-
    grazing cut lines correctly (robust intersection via perpendicular-distance
    vertex pass, not just edge-parameter check)
  * **Delete Shape sub-mode:** click any locked shape to remove it; pushes to
    undo stack; exits Edit Shapes automatically if last shape is deleted
  * **Vertex insertion:** click-and-hold (~550ms) on any segment edge to arm
    insert mode, then drag the new vertex to position; snaps identically to
    normal vertex drag; quick drag (before hold fires) still does segment drag
  * **Vertex deletion:** drag an existing vertex onto an adjacent vertex (same
    edge); when within 14px the target turns red; release to merge/delete; only
    works if polygon has >3 vertices
  * **Button labels:** "Cancel" only appears where clicking reverts a confirmed
    change; mode-exit buttons say "Done", "Back", or "Exit" as appropriate
- **PDF upload full-state reset:** uploading a new file clears all locked shapes,
  calibration/scale data, page grid origins, in-progress drawing trace, review
  state, and edit undo/redo history — new file always starts completely clean

**Not yet built (next increments):**
- Zoom & pan
- Multi-floor coordination, compass rose, page categorization (Phase 1.5)

**Deferred polish items:** none — all previously deferred items are complete.

## Data structures (current implementation)

**Polygons (completed shapes):**
```
completedShapesRef.current = Array<{
  vertices: [{x, y}],           // canvas-pixel coordinates
  status: 'reviewing' | 'locked',
  pageNumber: number,
  floorLevel: string,
  elevationZ: number
}>
```

**Per-page scales:**
```
pageScalesRef.current[pageNum] = { pxPerMeter: number, displayUnit: 'ft' | 'm' }
```

**Page grid origins** (default `{x:0, y:0}` — the absolute Cartesian grid anchor):
```
pageGridOriginRef.current[pageNum] = { x, y }
```

All of the above are cleared on PDF upload.

## Known issues

### Bugs (deferred):
- **feet+inches carry-over (low priority):** Display shows `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** Too loose with small snap grids; guides show
  green but snapped endpoint can be off-axis. Defer to post-Phase 1 optimization.

### Design gaps (deferred to Phase 2):
- **Inherited geometry displays on all pages:** Locked polygons from page N show on
  all other pages. Should only show as reference when explicitly toggled. Layer
  management deferred to Phase 2+.

### Limitations (expected at this phase):
- **Segment drag is perpendicular-only by default:** Shift held during segment drag
  switches to free-direction translation (both endpoints move together, each grid-
  snapped). Non-axis-aligned shapes may still have adjacent segments that stretch
  unexpectedly during perpendicular drag — geometrically correct but may surprise.
- **No persistence:** All geometry lives in memory only. Lost on page reload.

## Working environment notes

- Project runs locally via Vite dev server at `http://localhost:5173`
- **Do not place under a path with spaces or inside a cloud-synced folder**
- No authentication, no hosting, no database yet — Phase 1 is local-only
- PDF.js worker loaded via Vite's `?url` import suffix — critical, do NOT change

## Phase 1.5 Roadmap (Post-Cleanup)

After A.0.1–A.0.3 cleanup, Phase 1.5 builds the foundational architecture for 3D envelope:

**B — Page Categorization & Working Area Selection**
- Upload PDF → compass rose alignment → page-by-page: select working area (crop box) →
  assign category (Floor Plan / Elevation / Cross-Section / Detail / Roof Plan) + sub-label
- Sidebar shows organized list (plans lowest-to-highest, elevations N/S/E/W, sections)
- High-res toggle for scale-setting readability
- Store categorization in `projectState.pages`

**C — Ground Floor Tracing + Origin Points**
- Scale-setting + tracing workflow (existing 7a–7c)
- Once locked, all corners are potential reference/origin points (stored automatically)
- User can select which corner is the project origin

**D — Elevation Calibration UI + Tracing**
- Show floor-level reference lines (derived from floor geometry)
- User aligns lowest floor line by dragging PDF
- User scales by dragging slider until next floor line aligns
- User aligns ground-floor corner visually
- User traces elevation outline as polyline
- Store elevation geometry + scale + reference

**E — Roof Plan Tracing**
- Treat like floor plan but at roof Z-elevation
- Select roof type (flat / pitched)
- Trace perimeter + slope lines
- Eave projection calculated from roof perimeter vs. top-floor wall

**F — Cross-Section Reference Geometry**
- Similar to elevations but reference-only
- Align using visible reference lines in the section
- Store as reference polygons with Z-mapping

**Then: Build 3D Wireframe (Phase 2 threshold)**

## Design notes (Phase 1.5+)

- **Coordinate system:** X,Y from plan (per compass rose), Z from elevations (vertical).
  Origin point on ground floor anchors the project.
- **Compass rose:** Manual overlay alignment + rotation input. Defines all axis labels.
- **Plans define structural envelope:** Floor plans + roof plan → outer shell geometry.
- **Elevations show vertical section:** Align to plan edges; show floor heights, roof
  pitch, eave projections; walls/openings traced on top.
- **Cross-sections are reference-only:** Vertical slices aligned to plan reference lines.
- **Real-world coordinate system:** Post-Phase 1.5 refactor; currently all coords are
  canvas pixels. Will convert to feet/meters before Phase 2.

## Reference documents (not in this folder)

The user has a separate Claude.ai Project called "Collabinator" containing:
- `Collabinator_FullVision_v2.1.docx` — complete product vision, architecture, roadmap
- `Collabinator_Overview.md` — developer-facing condensed version

## Working style notes for this project

- Build one clearly-scoped change at a time, tested in the real browser
- Test against real architectural PDFs (multi-page, large-format, dense overlays)
- When Claude Code session approaches token capacity, wrap up and start fresh
- **Design gaps and known limitations are documented; they're not bugs to fix mid-build
  unless they block the current increment's workflow.** Prioritize core functionality
  over edge-case polish.

