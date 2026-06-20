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

## What is built so far (current state after session 4, before cleanup)

A React + Vite app with:

- PDF loading and multi-page navigation with per-file page memory
- Page-specific canvas sizing for all formats
- Full calibration workflow (scale + snap setup)
- Live drawing with axis/angle snap and distance snap (independent toggles)
- Chained segments with undo/escape
- Shape closure detection and polygon review/confirm workflow
- Post-completion editing (segment drag + label numeric override)
- Zoom & pan with correct coordinate mapping
- Multi-floor support (8a–8c partial):
  * Global scale lock after page 1
  * Per-polygon floor assignment (level + elevation Z)
  * Inherited geometry overlay from previous floor (8b)
  * Per-page PDF scale adjustment (8c corner drag)
  * 8d confirm-scale button (has alignment bug — see below)

## Pre-Phase 1.5 Cleanup Sessions (A.0.1–A.0.3)

Before building compass rose and page categorization, the codebase needs three focused
refactor sessions to fix bugs and simplify structures. **These are required before
Phase 1.5 begins.**

See `CLAUDE_cleanup_specs.md` for detailed specs. Summary:

**A.0.1 — Fix 8d alignment bug:**
- **Problem:** After confirming scale on page 2, PDF canvas is transformed but measure
  canvas is not. Traces land offset from the visual PDF.
- **Fix:** Apply CSS transform to whole `.canvas-stack` div (both canvases together)
- **Test:** Draw on page 2 after scale confirm; verify traces land exactly on visual PDF

**A.0.2 — Vertex array refactor + dead code cleanup:**
- Switch polygon storage from `{segments: [{a,b,dist}]}` to `{vertices: [{x,y}]}`
- Delete dead `scaleSet` state
- Delete redundant `pageScaleConfirmedRef`
- Make `floorElevZ` optional in modal
- Merge `getAngleSnapped` and `getSnapped`
- **Outcome:** Cleaner data, shorter code, prep for elevation geometry work

**A.0.3 — Per-page transform struct + page categorization:**
- Store per-page transform as struct `{tx, ty, s, angle}` instead of CSS strings
- Add `projectState.pages` array for page metadata (category, subcategory, working area)
- Create helper functions for transform math and page queries
- **Outcome:** Ready for compass rose rotation and sidebar navigation in Phase 1.5

**After A.0.1–A.0.3:** Codebase is cleaner, bugs fixed, structures simplified. Ready
to build Phase 1.5 features (compass rose, categorization, elevations) on solid ground.

## Data structures (current implementation, pre-cleanup)

**Polygons (completed shapes):**
```
completedShapesRef.current = Array<{
  segments: Segment[],           // Will switch to vertices in A.0.2
  status: 'reviewing' | 'locked'
  pageNumber: number,
  floorLevel: string,
  elevationZ: number
}>
```

**Project state:**
```
projectRef.current = {
  scaleLocked: boolean,
  scaleRef: { factor, unit, snapPx },
  floors: [{pageNumber, floorLevel, elevationZ}],
  pdfOffsets: [{pageNumber, offsetX, offsetY}],
  pages: [] // Added in A.0.3
}
```

**Per-page transforms (current, will change in A.0.3):**
```
pageTransformsRef.current[pageNum] = {
  transform: 'translate(...) scale(...)',  // CSS string
  transformOrigin: '...'
}
// Will become: {tx, ty, s, angle}
```

## Known issues

### Critical (fixed in cleanup):
- **8d alignment bug:** PDF canvas transformed, measure canvas not. Traces misaligned.
  Fixed in A.0.1.

### Bugs (deferred):
- **feet+inches carry-over (low priority):** Display shows `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** Too loose with small snap grids; guides show
  green but snapped endpoint can be off-axis. Defer to post-8f optimization.

### Design gaps (documented, deferred to Phase 2):
- **Inherited geometry displays on all pages:** Locked polygons from floor N show on
  N+1, N+2, etc. Should only show as reference when explicitly toggled. Layer
  management deferred to Phase 2+.
- **No vertex-level editing in Phase 1:** Shape editing is segment-level only (drag
  perpendicular, override length). No break-point insertion or vertex repositioning.
  Deferred to Phase 2+ if needed.

### Limitations (expected at this phase):
- **Segment drag is perpendicular-only:** Non-axis-aligned shapes may have adjacent
  segments that stretch unexpectedly. Geometrically correct but may surprise users.
- **No persistence:** All geometry lives in memory only. Lost on page reload.
- **Cartesian snap in free-angle mode (known gap):** When Shift held, snap is radial
  not Cartesian. Address before widespread use.

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

