# Collabinator — Session Handoff Notes
*Captures context from chat conversation that is NOT in CLAUDE.md or FUNCTIONALITY_SUMMARY.md,
plus a running record of each session's work and the forward build plan.*

**Note:** CLAUDE.md is kept current by Claude Code at the end of each session to match
the actual implementation. This document captures things that live ONLY in chat
history: tooling fixes, the recovery story, architectural decisions made
conversationally, and a session-by-session log — worth a quick skim against the
current CLAUDE.md to confirm nothing fell through.

---

## SESSION 1 — Full rebuild from the lost App.jsx

### 1. Tooling & environment notes (not project logic — won't belong in CLAUDE.md)

- **Claude Code Desktop project memory:** `C:\Users\ben\.claude.json` has a `projects`
  key that remembers trusted folders. It had a stale entry pointing at
  `G:\Shared drives\The ABC\Collabinator\Phase 1` — fixed by replacing the G: path
  with `C:\Users\ben\Collabinator\pdf-viewer`. If this resurfaces: check this file first.
- **Always explicitly set Project folder** when starting a new Desktop session.
- **Enter key in the Code tab** sometimes inserts a newline — workaround: **Ctrl+Enter**.
- **Permission mode persistence:** `.claude/settings.local.json` has
  `"permissions": {"defaultMode": "acceptEdits"}` — local/gitignored, recreate manually
  on a fresh clone.
- **Git is the actual safety net.** Remote:
  `https://github.com/StationCraft/collabinator.git`, branch `main`. Original App.jsx
  was lost to accidental overwrite — this is why git exists. Confirm commits are pushed
  to origin, not just committed locally.

### 2. Key architectural decisions

- **Vertex-array storage from day one** — `{vertices: [{x,y}]}`, no segment-chain phase.
- **Old 8a–8d multi-floor pattern deliberately NOT rebuilt** — corrected design in
  `FUNCTIONALITY_SUMMARY.md`.
- **Scale-gating is a hard rule** — Draw button disabled until scale is confirmed.
- **Distance snap default is 6"** for plan pages; elevations may want finer later.
- **Combine Shapes geometry rule:** NEVER move, snap, or angle-adjust an
  originally-traced vertex. New splice vertices by exact linear interpolation only.
- **Move Shape snaps final vertex positions to absolute page grid** — not drag delta.
- **New PDF upload must fully reset ALL state.**

### 3. Session 1 achievements

PDF upload/rendering/navigation, calibration workflow, live drawing tool (vertex
arrays, axis/angle snap, distance snap, chaining, undo, escape), shape closure +
review/confirm, alignment guides, scale-before-draw enforcement, post-completion
editing (segment drag, vertex drag, label override, undo, clamping), shared absolute
page grid, Move/Combine/Split sub-modes, Combine collinear-overlap detection, Move
grid-snap precision fix, PDF-upload full-state reset, CLAUDE.md rewrite.

---

## SESSION 2 — Deferred polish list + follow-up fixes

### 1. What was built

- **Delete Shape sub-mode** — red toolbar button, pushes to undo stack, stays active
  with zero shapes (undo always accessible).
- **Vertex insertion** — click-and-hold ~550ms on segment edge, drag to place, snaps
  to grid identically to normal vertex drag.
- **Vertex deletion** — drag vertex onto adjacent vertex, red highlight within 14px,
  release merges. Only when polygon has >3 vertices.
- **Universal Shift-to-release-axis-lock** — draw tool, vertex drag, segment drag,
  Split Shape. Grid snap always applies; only angle constraint is conditional.
- **Undo/Redo stack** — full stack in all five Edit Shapes toolbar contexts. New edits
  clear redo stack. Redo absent when stack is empty.
- **Button label audit** — "Exit" for calibration, "Back" for scale dialog /
  Combine / Split dismissal.

### 2. Bugs fixed

- Auto-exit stranded undo on last-shape delete → stay in Edit Shapes regardless.
- Undo missing from sub-mode toolbars → added to all five locations.
- Vertex insertion snap precision → snap `origVerts[vertIdx]` to grid before using as
  axis-snap anchor.
- Split Shape failed on near-collinear cut lines → rewrote `linePolyIntersect` with
  two-pass approach (interior crossings + vertex-on-line pass).

### 3. Architectural decisions

- Redo stack cleared by `pushUndo` — single enforcement point.
- `snapshotShapes()` extracted as shared helper.
- `applyAxisSnap` and `projT` as module-level pure helpers.
- `segPending` drag state for mousedown-on-segment.
- `handleSplitClick` accepts `shiftKey` parameter.

---

## SESSION 3 — Structural refactor + start-vertex snap + edit-mode grid + combine fix

**Branch:** main | **Commits:** `0eaf2bb`, `b921f66`, `6d82327`, `c0490fe`

### 1. What was built

**Structural refactor (commit `0eaf2bb`) — zero behavior change**

Split 1875-line monolithic App.jsx into three files:
- `src/geometry.js` (~213 lines) — all pure polygon math and module-level constants
- `src/canvasRenderer.js` (~67 lines) — stateless drawing primitives with explicit
  data params (`drawLockedShapes`, `drawShapePoly`, `drawAlignGuide`, `pxToDisplayDist`)
- `src/App.jsx` (~1555 lines) — everything stateful

`drawLockedShapes` and `pxToDisplayDist` signatures changed to take explicit data
instead of closing over refs; all four call sites updated.

**Feature: Start-vertex snap (commit `b921f66`)**

Before placing the first vertex of a new shape, hovering within `HIT_VERT_DIST` (9px)
of any vertex on visible locked geometry shows a red highlight. Clicking places the
new shape's first vertex exactly coincident. Shift suppresses the snap. Implemented
via `drawStartSnapRef` + `getVisibleVertices(pageNum)` — written generically so it
extends automatically to reference/ghost geometry in later phases with no rework.
Occupies a strictly non-overlapping window from Shift-axis-release (pre-first-vertex
vs. post-first-vertex — no conflict).

**Feature: Snap grid selector in Edit Shapes mode (commit `b921f66`)**

Distance-snap increment dropdown now exposed in all five Edit Shapes toolbar contexts.
Reads/writes the same `snapIncrementRef` + `snapIncrement` state as Draw mode — no
new state. Implemented as computed `editSnapIncrementSelect` JSX variable.

**Bug fix: Combine Shapes winding-direction (commit `6d82327`)**

Root cause: `findCollinearOverlap` line 87 hard-rejected any B edge with dot product
>= 0 against A's direction — accepting only anti-parallel edges. Same-winding adjacent
shapes (both traced clockwise) silently returned null; no amount of vertex dragging
could fix this since winding is set at trace time.

Fix: removed anti-parallel-only filter. Both 'reversed' and 'same' winding pairs
now accepted. Overlap computed with Math.min/Math.max. Result carries `dir`.
`applyMerge` routes `prepareForMerge` ordering and `mergePolygons` traversal branch
through `ov.dir`. The `dir === 'same'` branch in `mergePolygons` was already correct
but was dead code before this fix.

### 2. Known issue logged (not fixed)

Some complex merges produce a **redundant collinear vertex** at splice points — visible
as a short stray line. Cosmetically harmless, no geometry error. Logged in
`ADDITIONAL_FUNCTIONALITY.md`.

### 3. Architectural decisions

- **`getVisibleVertices(pageNum)`** is the canonical snap-target query — generic from
  day one for easy Phase 1.5 extension.
- **Combine now direction-agnostic** — winding direction irrelevant to eligibility.
- **Module boundary going forward:** `geometry.js` = pure math;
  `canvasRenderer.js` = stateless drawing; `App.jsx` = all state/refs/handlers/JSX.

---

---

## SESSION 4 — Zoom/pan + architecture planning + compass rose + pageId migration

**Branch:** main | **Commits:** de2603b, e75a99d, b56b043, c754c76

### 1. What was built

**Zoom/pan — cursor-anchored wheel zoom + drag pan**

- `canvas-world` div inserted inside `.canvas-stack`, wrapping both canvases
- CSS transform applied to `canvas-world`: translate (pan) + scale (zoom)
- `getCanvasPos()` uses `getBoundingClientRect()` — auto-accounts for CSS
  transforms; zero changes to coordinate mapping in any existing handler
- Mouse wheel: zoom anchored to cursor via
  `newPan = pan + worldPos * (currentZoom - newZoom)`
- Pan: left-drag on empty canvas (all modes); middle-mouse drag (all modes)
- Quick mousedown+up (<3px) does not suppress the following click
- Zoom clamped: 0.1× to 10×
- Zoom and pan reset on page navigation and PDF upload
- Label edit overlay positioned correctly at all zoom/pan states
- Full test checklist passed (anchor accuracy, hit-test accuracy at varied
  zoom/pan, all edit sub-modes, page nav reset, upload reset)

**Compass rose alignment overlay**

- Fixed overlay div (`z-index: 200`) layered above canvas-world — not on canvas
- SVG compass rose (N/S/E/W arms, red N arm with arrowhead, intercardinal arms)
- Drag overlay body to reposition; rotation handle (purple circle on N arm at ~60%
  from center to tip) to rotate
- Arrow key nudge: ±1° per press, ±0.1° with Shift; auto-focuses overlay div on open
- Numeric angle input with its own local string state (no toFixed-on-keystroke bug)
- Confirm stores `compassAngleDeg` + `compassCardinal` (rounded to nearest N/NE/E/SE/S/SW/W/NW)
- Skip stores 0°/N and dismisses
- "Set North" toolbar button re-opens overlay; shows confirmation state once set
- Compass persists across page navigation and zoom/pan reset; clears on PDF upload
- Transparent overlay background — PDF visible through it; controls have subtle semi-opaque backing
- Instruction text above rose: "Move this panel over your plan's compass rose, then drag the handle on the N arm to rotate until it matches."

**Step 4a — pageId migration (structural refactor, zero behavior change)**

- `pageIdMapRef.current[pageNum] = pageId` populated at PDF load (`"page-1"`, `"page-2"`, etc.)
- `getPageId(pageNum)` helper; `currentPageId = getPageId(currentPage)` derived value
- `pageTransformsRef` added as placeholder for Step 4b
- All page-keyed refs migrated: `pageScalesRef`, `pageGridOriginRef` now keyed by pageId string
- All shape fields migrated: `pageNumber` → `pageId`; all filter/create sites updated
- All internal function params renamed from `pageNum` to `pageId` where used as ref keys
- Changes span `App.jsx`, `canvasRenderer.js`, `geometry.js`

### 2. Bugs fixed this session

- **Locked shapes invisible in view mode** — `useEffect` and `confirmShape` were passing
  `currentPage` (number) to `drawLockedShapes` after shapes migrated to string `pageId`.
  Fixed both call sites to use `getPageId(currentPage)`.
- **Compass rotation handle position** — handle was outside the arrowhead tip (felt like
  a target, not a control). Moved to `top: 15px` (~60% along the N arm from center).
- **Compass numeric input controlled-input bug** — `toFixed()` on every keystroke caused
  "180" to produce "1.1". Fixed with separate `compassInputVal` string state; only parsed
  on blur/Enter; arrow keys inside input stop propagation.

### 3. Architecture decisions locked in planning chat

- **pageId as governing key**: all page-keyed state migrates from pageNum to
  pageId in Step 4. pageNum retained only for PDF.js rendering. pageId assigned
  at load time — including uncategorized/skipped pages.
- **Plan Views** is the umbrella category (replaces "Floor Plans"). Sub-labels:
  Ground / L1 / L2 / Foundation / Roof / Crawlspace / Basement / etc.
- **Sidebar structure confirmed**: Plan Views | Elevations | Cross-Sections | Details
- **Compass rose flow**: navigation-first — user browses to whichever page has
  the north arrow, then aligns. Does NOT auto-show on page 1 only.
- **Front face designation**: popup after first Plan View polygon is locked,
  prompting user to click the road-facing wall segment. Built in the ground floor
  tracing step, not in Step 3 or 4.
- **Interstitial space** (bulkheads, floor systems, ceiling surface ownership)
  flagged as future architecture problem — logged in ADDITIONAL_FUNCTIONALITY.md.
- **Duplicate page** deferred — logged in ADDITIONAL_FUNCTIONALITY.md. pageId
  architecture designed to accommodate it cleanly when prioritized.
- **Working area selection dropped from Step 4b scope** — zoom makes it redundant
  for the current workflow; duplicate page handles mixed-page case when prioritized.
- **Step 4 splits into 4a and 4b** — 4a complete; 4b is page categorization UI.

---

## SESSION 5 — Compass rose polish + Step 4a + Step 4b

**Branch:** main

### Completed and committed

- Compass rose numeric input bug fix (controlled-input, local `inputVal` state)
- Compass overlay: transparent background, amber instruction text styling
- Compass rotation handle repositioned to 60% along N arm
- **Step 4a: pageId migration** — all page-keyed refs and shape fields migrated
  from `pageNum` to `pageId`; `pageIdMapRef` and `getPageId` helper added;
  `pageTransformsRef` placeholder added
- Bug fix: locked shapes invisible in view mode (`drawLockedShapes` call sites
  passing `pageNum` instead of `pageId`)
- **Step 4b: page categorization UI** — Site Plan / Floor Plan / Elevation /
  Cross-Section / Detail / Roof Plan categories; simplified floor sub-labels
  (Basement / Crawlspace / Main Floor / 2nd / 3rd / Other); auto-triggers after
  compass; compact summary mid-categorization; recategorize non-destructive;
  zoom fix in categorize mode; post-Done nav cycles categorized pages only;
  re-entry via "+ Categorize more pages" cycles uncategorized pages only;
  "All pages categorized" end state

Working area dropped from scope — zoom makes it redundant; duplicate page
handles mixed-page case when prioritised (logged in `ADDITIONAL_FUNCTIONALITY.md`).

---

## SESSION 6 — Sidebar overlay + planning decisions

**Branch:** main | **Commits:** b314eab, 23d66bc

### What was built

**Step 4c: Sidebar + navigation (commit b314eab)**
- Collapsible sidebar floats as overlay over canvas (position:absolute, z-index:100)
- 240px open / 32px closed, no width transition (avoids frozen mid-animation issue)
- Semi-transparent background rgba(15,23,42,0.20) with backdrop-filter blur(2px)
- Sections rendered in order: Plan Views, Elevations, Roof Plans, Cross-Sections, Details, Site Plans, Unused Pages
- Intra-section ordering: floor plans Basement→3rd Floor then free-text; elevations N/S/E/W
- Active page highlighted; clicking any entry calls goToPage(pageNum)
- Canvas area always fills full window width — sidebar does not push content

**Sidebar light-scheme hover/active fix (commit 23d66bc)**
- Hover: rgba(255,255,255,0.25) background, #111 text
- Active: rgba(29,78,216,0.20) background, #1d4ed8 text, 3px solid #1d4ed8 left border
- Replaced dark-scheme colours that were illegible over transparent sidebar

### Planning decisions made this session

- **Origin point dropped as a user step** — internal coordinate anchor derived automatically from first vertex placed on ground floor; no user action, no UI needed. The coordinate system is self-contained: scale factor from calibration, per-page transforms from ghost alignment, Z from elevation calibration.

- **Cantilever/multiple-reference-points question closed** — the ghost displays the full previous floor polygon; the user aligns on matching corners naturally. Cantilevers do not require multiple pinned reference points. The per-page transform captures the correct spatial relationship for the whole floor.

---

---

## SESSION 7 — Ground floor tracing (Steps 5a, 5a-ii, 5c) + coordinate-model reframing

**Branch:** main | **Commits:** 9266bdc, ef09039, ad50e3b, 2d6021b

### What was built

**Step 5a — getAnchorFloor helper + FLOOR_ORDER (commit 9266bdc)**

Extracted `FLOOR_ORDER` array (`['Basement', 'Crawlspace', 'Main Floor', '2nd Floor',
'3rd Floor']`) as the single source of truth for floor-level ordering. Added
`getAnchorFloor(pages, FLOOR_ORDER)` helper in `geometry.js`: scans all categorized
floor-plan pages, returns the lowest known floor level present per `FLOOR_ORDER`, or
`null` if no floor-plan pages are categorized yet. Used to drive the front-face
designation trigger (Step 5c) and will drive multi-floor Z-stack logic in Phase 1.5.

**Step 5a-ii — Known floor level required in categorization (commit ef09039)**

Floor Plan pages now require a known level (one of the `FLOOR_ORDER` values) before
Confirm is enabled. The old "Other + free text" option in the floor sub-label dropdown
was removed. Free-text demoted to an optional `subLabelNote` field — visible as a
secondary input once a known level is selected, purely for notes (e.g., "split level",
"mezzanine"). This ensures `getAnchorFloor` always has reliable, comparable level data.

**Coordinate-model reframing (commit ad50e3b — docs only, no code change)**

The earlier decision that "the first vertex placed on the ground floor becomes the
internal coordinate anchor" was identified as conceptually confused and reversed. The
new model:
- The coordinate origin (0,0,0) is a **fixed, arbitrary zero** — not a building
  feature. Nothing "is" the origin.
- All geometric relationships are computed **geometry-to-geometry**, never by
  measuring against the origin.
- Floor levels (Z) are a **relative-offset stack**: each floor stores its offset from
  the floor below; absolute Z accumulates upward. Changing a lower floor's height
  shifts every floor above it — physically correct behavior.
- `getAnchorFloor` identifies the **base of the floor stack** — a building fact only,
  not a coordinate anchor.
- **Step 5b (origin capture) was CANCELLED / DISSOLVED** by this reframing. There is
  no origin to capture. Nothing replaces it.

The reframing is documented in CLAUDE.md Design notes and FUNCTIONALITY_SUMMARY.md
Section 1 and 5.

**Step 5c — Front-face designation (commit 2d6021b) — FULLY TESTED**

After the first polygon is locked on the anchor-floor page, the app prompts the user
to click the road-facing exterior wall segment. Stored as:

```
frontFace = { pageId, shapeIndex, segmentIndex, endpointA: {x,y}, endpointB: {x,y} }
```

The segment indices are authoritative; `endpointA/B` are staleness sanity-check
snapshots (stale if the polygon has since been edited without re-picking). Pick-mode
hover-highlights all outer-perimeter segments of locked shapes on the anchor page.
"Skip for now" dismisses without setting `frontFace`. Selected segment visually marked
across all redraws. Normal draw/edit interactions suppressed while pick mode is active.
Trigger is re-checked after every polygon lock and after every categorization change;
never re-prompts once set. Verified: survives all Edit Shapes sub-modes (segment drag,
vertex drag, vertex insertion, vertex deletion, Move, Combine, Split, Delete). Cleared
on PDF upload.

**Purpose of frontFace:** maps the road-facing direction onto the compass cardinal
(N/S/E/W already set by compass rose), enabling Front/Back/Left/Right elevation naming
in the sidebar and downstream elevation-tracing tools.

### New deferred-register entries this session

- **#6 — CAD-export datum:** named control/reference point stored at its computed
  coordinates within the space (e.g., a surveyed corner), used as the datum for CAD
  export. Not an origin — just a known coordinate within the model. Deferred to Phase 2
  or post-Phase 1.5.
- **#7 — Intra-floor Z / split-level:** buildings with split-level or mid-flight floors
  create floors that sit between the canonical FLOOR_ORDER levels. The relative-offset
  Z stack can accommodate this (additional named levels inserted between existing ones)
  but the categorization UI and Z-stack logic do not yet handle it. Deferred to Phase 2.

---

## CURRENT DEFERRED ITEMS

- **Feet+inches carry-over display bug (low priority):** `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** too loose with small snap grids
- **Redundant collinear vertex after complex Combine:** stray short segment, cosmetic
- **Inherited geometry on all pages:** layer management deferred to Phase 2+
- **No persistence:** memory only, lost on reload
- **Working area selection:** dropped from Step 4b scope; zoom makes it redundant; revisit when duplicate page is prioritized
- **CAD-export datum (#6):** named point at computed coordinates for CAD export — not an origin, deferred to post-Phase 1.5
- **Intra-floor Z / split-level (#7):** FLOOR_ORDER does not accommodate mid-flight levels; deferred to Phase 2
- See `ADDITIONAL_FUNCTIONALITY.md` for larger deferred feature ideas

---

## FORWARD BUILD SEQUENCE

1. ~~Zoom/pan~~ — DONE
2. ~~Compass rose alignment~~ — DONE
3. ~~Step 4a: pageId migration~~ — DONE
4. ~~Step 4b: Page categorization UI~~ — DONE
5. ~~Step 4c: Sidebar + navigation~~ — DONE
6. ~~Ground floor tracing~~ — DONE
   - ~~5a: getAnchorFloor + FLOOR_ORDER~~ — DONE (9266bdc)
   - ~~5a-ii: known-level required in categorization~~ — DONE (ef09039)
   - ~~5b: origin capture~~ — CANCELLED / DISSOLVED by coordinate-model reframing
   - ~~5c: front-face designation~~ — DONE & fully tested (2d6021b)
7. **Multi-floor reference & alignment (NEXT)** — fresh planning chat; this is the
   feature that was lost once already and deserves its own room to think.

After multi-floor: roof plan tracing → elevation calibration + tracing → cross-section
reference geometry → windows/doors → Phase 2 threshold (see `FUNCTIONALITY_SUMMARY.md`).

---

## SESSION 8 — Multi-floor sub-step 1: read-only reference ghost rendering

**Branch:** main | **Commit:** 996b5a7

### What was built

**Step 6, Sub-step 1 of 4: Ghost reference rendering (commit 996b5a7)**

Multi-floor feature split into four focused sub-steps:
1. **Read-only reference ghost (THIS SESSION)** — display floor-below geometry
2. **Ghost alignment + per-page transform** — drag to align, lock transform
3. **Confirm-scale lock** — make geometry-to-geometry snap permanent across pages
4. **Cross-page persistence** — save/restore per-page transform and toggle state

Built this session:

- **`getGhostSourcePageId(pages, currentPageId, completedShapes, floorOrder)` helper in geometry.js:**
  Scans downward through `FLOOR_ORDER` to find the nearest-lower categorized Floor Plan page
  with at least one locked shape; returns its `pageId` or `null` if no qualifying floor exists.
  Used by all redraw functions (draw, review, edit, front-face) to determine whether a ghost
  should be rendered.

- **`drawGhostShapes(ctx, completedShapes, ghostPageId)` stateless drawer in canvasRenderer.js:**
  Renders locked shapes from the ghost-source page in muted purple (#a78bfa), 2px dashed line
  at 0.85 opacity, no fill. Drawn as a background layer (below current page's locked shapes and
  in-progress trace) so working geometry always reads on top. Never hit-tested, never editable,
  never snapped to — purely visual reference.

- **`showGhost` toggle state in App.jsx:**
  Boolean state (default `true`), toggleable via "Show floor below ON/OFF" buttons in draw-mode
  and edit-mode toolbars. Button only appears when `getGhostSourcePageId` returns non-null
  (i.e., a ghost source exists). Toggling triggers immediate redraw; persists across zoom/pan
  and page navigation; clears on PDF upload.

- **Ghost integrated into all canvas redraw functions:**
  `redrawDrawCanvas`, `redrawReviewCanvas`, `redrawFrontFaceLayer`, and `drawEditCanvas` (all
  sub-modes). Ghost always drawn first (background), before locked shapes and working geometry.

### Architecture decisions this session

**Per-page alignment transform placement (forward-looking, not yet implemented):**

The per-page transform required for Sub-step 2 (alignment) will be applied to a **new div
nested INSIDE `.canvas-world`** (which is already inside `.canvas-stack` wrapping both canvases).

**Why inside `.canvas-world`:**
- `.canvas-stack` is the untransformed clipping viewport (zoom/pan origin)
- `.canvas-world` already carries the CSS transform for zoom/pan
- Both canvases are already shared children of `.canvas-world`
- New align div nesting inside `.canvas-world` keeps the alignment transform correctly
  nested within the zoom/pan coordinate space
- `getCanvasPos()` uses `getBoundingClientRect()` → auto-compensates for all nested transforms
  (no coordinate mapping changes needed in any existing handler)
- **Structurally guarantees:** both canvases move as one unit under zoom/pan; alignment
  transform applies symmetrically to both canvases; no inconsistency between PDF canvas
  and measure canvas (the bug from the prior lost attempt)

**This supersedes FUNCTIONALITY_SUMMARY.md Section 6's "apply to .canvas-stack" wording.**

### Carried-forward item resolved

**Step 5c (front-face designation) confirmed fully tested** this session: ghost rendering
did not disturb it; front-face selection and visual marking still works correctly in all modes.

### Known deferred items

See `ADDITIONAL_FUNCTIONALITY.md` #8, #9, #10 (added this session) and prior entries.

---

## CURRENT DEFERRED ITEMS

- **Feet+inches carry-over display bug (low priority):** `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** too loose with small snap grids
- **Redundant collinear vertex after complex Combine:** stray short segment, cosmetic
- **Inherited geometry on all pages:** layer management deferred to Phase 2+
- **No persistence:** memory only, lost on reload
- **Working area selection:** dropped from Step 4b scope; zoom makes it redundant; revisit when duplicate page is prioritized
- **CAD-export datum (#6):** named point at computed coordinates for CAD export — not an origin, deferred to post-Phase 1.5
- **Intra-floor Z / split-level (#7):** FLOOR_ORDER does not accommodate mid-flight levels; deferred to Phase 2
- **Layer-visibility model (#8):** multi-floor ghost is the first instance; full discipline-layer system deferred to Phase 2
- **Scale matching from shared notation (#9):** auto-apply calibrated scale if printed notation matches; deferred
- **Full-screen canvas layout (#10):** UI polish, no core functionality; deferred
- See `ADDITIONAL_FUNCTIONALITY.md` for all deferred items

---

## FORWARD BUILD SEQUENCE

1. ~~Zoom/pan~~ — DONE
2. ~~Compass rose alignment~~ — DONE
3. ~~Step 4a: pageId migration~~ — DONE
4. ~~Step 4b: Page categorization UI~~ — DONE
5. ~~Step 4c: Sidebar + navigation~~ — DONE
6. ~~Ground floor tracing~~ — DONE
7. **Multi-floor reference & alignment (IN PROGRESS)**
   - ~~Sub-step 1: ghost rendering~~ — DONE (996b5a7)
   - **Sub-step 2: ghost alignment + per-page transform** — NEXT
   - Sub-step 3: confirm-scale lock
   - Sub-step 4: cross-page persistence/toggle

After multi-floor sub-steps 2-4: roof plan tracing → elevation calibration + tracing →
cross-section reference geometry → windows/doors → Phase 2 threshold.
