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

## SESSION 9 — Multi-floor sub-step 2: ghost alignment + per-page transform

**Branch:** main | **Commits:** 73f02f1 (Piece A), c2ed3ba (Piece B), 122b077 (Piece C), 6e97f67 (ghost visibility), b210343 (Piece D1), d5425d0 (Piece D2)

### What was built

Sub-step 2 completed in five pieces (D was split for testability):

- **Piece A (73f02f1):** `getCSSTransform(t)` pure helper in canvasRenderer.js. Builds `translate(tx px, ty px) rotate(angle deg) scale(s)` CSS string; returns `'none'` for null/identity. No wiring yet.
- **Piece B (c2ed3ba):** `.pdf-align-layer` div inserted wrapping ONLY the PDF `<canvas>` inside `.canvas-world`. `measureRef` stays a direct child of `.canvas-world` — ONLY the PDF backdrop will move. Reads `pageTransformsRef` at identity; no visible change.
- **Ghost visibility upgrade (6e97f67):** `drawGhostShapes` reworked — amber (#f59e0b) 3.5px dashed stroke at 0.85 opacity, 10% amber fill, 25% 45° hatch clipped to polygon per shape. Bug fixed mid-session: hatch loop used `minX` where it needed `minY` for Y coordinates; fixed to proper bbox-relative offsets.
- **Piece C (122b077):** `alignMode` state + `alignDragRef` + `alignTick` added. "Align to floor below" button in view/draw/edit toolbars (same ghost-source gate). Body-drag in `alignMode` writes `{tx, ty}` to `pageTransformsRef` at `clientDelta / zoom`; `alignTick` bumps to force React re-read. Entering align mode auto-shows ghost if hidden. Resets on page nav and upload.
- **Piece D1 (b210343):** `drawAlignHandles(ctx, completedShapes, ghostPageId, zoom)` added to canvasRenderer.js. Computes combined bbox of all ghost shapes; draws four amber squares (`HANDLE_PX = 12`, exported constant) at TL/TR/BR/BL corners, constant screen size via `HANDLE_PX / zoom`. Hooked into all 8 ghost-draw sites across `drawEditCanvas`, `redrawDrawCanvas`, `redrawReviewCanvas`, `redrawFrontFaceLayer`. `alignMode`, `showGhost`, `alignTick` added to passive-redraw `useEffect` deps for view-mode and edit-mode paths.
- **Piece D2 (d5425d0):** Handle hit-test in `handleMeasureMouseDown` (grab radius `HANDLE_PX / zoom`). Scale drag stores `{mode:'scale', ax, ay, startTx, startTy, startS, d0}` where anchor is the diagonally-opposite ghost bbox corner and `d0` is the grabbed corner → anchor distance (not cursor → anchor). Scale drag: `newS = startS * (d1/d0)` clamped 0.05–20, `tx1 = ax - (ax - startTx) * (newS/startS)`. Body-drag falls through unchanged (`mode:'translate'`). Resize cursor (`nwse-resize`) on handle hover via `alignOverHandle` state.

### Key concept refined during testing

**Ghost is the fixed reference; PDF moves.** Handles are anchored to the ghost bbox corners — they do NOT move when the PDF is body-dragged. The scale anchor (diagonally-opposite corner) is also a ghost bbox corner, so the anchor point is fixed in the ghost's coordinate space regardless of where the PDF has been translated or scaled.

### Bugs found and fixed during testing

1. **HANDLE_PX written inside a comment block** — appeared to be a `const` declaration but was inside `// ...` text; value was `undefined` at runtime; `fillRect` with NaN dimensions draws nothing silently. Fixed: moved `const HANDLE_PX = 12` to executable code before the function.
2. **Two `drawGhostShapes` call sites missed by `replace_all`** — the 6-space-indented sites (vs. 8-space) weren't matched. One was `drawEditCanvas` default sub-mode; the other was `redrawFrontFaceLayer` — the ONLY redraw path that fires in view mode. Handles never appeared in view mode until this was fixed.
3. **`alignMode`/`showGhost`/`alignTick` missing from passive-redraw `useEffect` deps** — toggling align mode or dragging the PDF in view mode didn't repaint the canvas. Added to both `redrawFrontFaceLayer` useEffect (view mode) and `drawEditCanvas` useEffect (edit mode).
4. **`d0` computed from cursor instead of grabbed bbox corner** — using `Math.hypot(pos.x - ax, pos.y - ay)` meant `d0` depended on where exactly the user clicked within the grab radius, causing a scale jump on first mousemove. Fixed to `Math.hypot(hitCorner.x - hitCorner.ax, hitCorner.y - hitCorner.ay)` — always the full corner-to-anchor diagonal.

### Testing-state-loss reminder

No persistence — all geometry and transforms live in memory. Full in-flight test state (multi-page PDFs with calibration, traced shapes, and alignment transforms) cannot survive a page reload. Tested in one un-reloaded tab throughout the session.

### New deferred entries this session

- **#11 — Sidebar auto-hide:** sidebar should collapse after a page selection or on canvas interaction instead of staying open over the drawing.
- **#12 — Page rotation (90° and arbitrary):** 90° rotation for sideways-scanned sheets; arbitrary angle for skewed scans. The `angle` field is already in the transform struct; interaction is not built. Deferred because stacked residential plans are almost always co-oriented.

---

## SESSION 10 — Multi-floor sub-step 3: confirm-scale lock

**Branch:** main | **Commits:** d49060d, e4cf8b6, 327e84d, d030a34

### What was built

Sub-step 3 completed in four pieces (1a, 1a-fix, 1b, 1b-fix+1c):

- **Piece 1a (d49060d):** Confirm gate + Realign re-entry UI. Added `confirmed` field to
  `pageTransformsRef[pageId]`. "Confirm scale & alignment" button (align mode only,
  `snap-btn` class, no `snap-btn--on`) writes `confirmed: true` and exits align mode.
  Align button reads "Realign" once confirmed; re-entering does NOT reset the transform.
  All three toolbar sites (view/draw/edit) updated. `alignTick` bumped on confirm to
  force toolbar re-read. State/UI only — no scale-borrow, no calibration changes.

- **Piece 1a-fix (e4cf8b6):** The scale-drag branch in the align `mousemove` handler
  was writing `{tx, ty, s, angle}` without spreading prior fields, silently dropping
  `confirmed` on any scale drag during Realign. Fix: read `prevScale = pageTransformsRef
  .current[drag.pageId] || {…}` and spread it before writing new values — matching the
  translate branch. Scale math unchanged.

- **Piece 1b (327e84d):** Ghost scale-borrow unlocks Draw on confirmed pages. Added
  `getEffectiveScale(pageId, _visited)` resolver inside the App component (near
  `getVisibleVertices`): returns own calibration if set; else if `confirmed`, recurses
  to `getEffectiveScale(ghostPageId, visited)` walking down `FLOOR_ORDER`; else `null`.
  Visited-set cycle guard threaded through recursion. Routed all 9 scale-read sites
  through it: `snapToGrid`, `applySnap`, `snapPerp`, `commitLabelEdit`, `pageHasScale`,
  both `pxToDisplayDist` synthetic-map call sites, two `isImperial` snap-increment reads,
  Draw `onClick` unit init. `pageGridOriginRef` untouched — borrowed pages keep the
  default `{0,0}` grid, sharing the ghost's coordinate space. `canvasRenderer.js` not
  touched (synthetic map `{ [id]: getEffectiveScale(id) }` passed to `pxToDisplayDist`).

- **Piece 1b-fix + 1c (d030a34):** Two changes in one commit:
  - **1b-fix:** `getEffectiveScale` originally did `pageScalesRef.current[ghostPageId]
    || null` — a non-recursive lookup. On 3+ floor stacks, a middle floor is itself a
    borrower with no own scale; the lookup returned `null` while that floor's effective
    scale resolved fine via the floor below it. Console-log instrumentation (diagnostic
    only, never committed) revealed the branch: "page-5 BORROW from page-4 = null".
    Fixed by recursing (`return getEffectiveScale(ghostPageId, visited)`) so the walk
    continues until a floor with real calibration is found.
  - **1c:** "Set Scale" / "Re-calibrate" button hidden whenever `getGhostSourcePageId`
    returns non-null. Single render-gate condition change; button className/onClick/label
    unchanged.

### Key conceptual resolution

**The borrow uses `pxPerMeter` only — `s` does not enter the grid.** The align `s`
factor is a CSS transform on the PDF backdrop div (`.pdf-align-layer`). The measurement
canvas (`measureRef`) and all geometry live in a fixed measure space where the ghost's
calibrated `pxPerMeter` applies directly. Geometry-to-geometry snap works because all
floors share this same measure-space grid — the PDF backdrop moves to match, not the
grid. This was verified empirically: wall labels read true on a confirmed upper floor
borrowing from the ground floor's calibration.

### Bug discovery story

The recursion bug (#1b-fix) would not have been caught by static review: it requires
at least three categorized floor-plan pages with locked shapes, a calibrated bottom
floor, a confirmed-but-uncalibrated middle floor, and a confirmed upper floor. Only a
real multi-floor PDF with three stacked floors exposes it. The console-log diagnostic
caught the exact branch (`"page-5 BORROW from page-4 = null"`) in one test.

### In-memory-state-loss reminder

No persistence — all geometry and transforms live in memory. A tab reload loses
everything. In-session testing of the confirm gate requires that the tab stays alive
from ghost rendering through alignment through confirmation — a reloaded tab starts
clean and the gate appears not to work until confirmed in the fresh session. This
masked the gate in early testing until a fresh start proved it.

### New deferred entries this session

- **#13 — Ghost vertices as opt-in snap targets:** deliberately not built in sub-step 3.
  Existing axis snap + shared grid handle alignment; reference-vertex snap is a future
  nicety. See `ADDITIONAL_FUNCTIONALITY.md`.
- **#14 — Scale inheritance within a drawing group:** suppress Set Scale across a
  group's pages once one is calibrated. See `ADDITIONAL_FUNCTIONALITY.md`.

---

## SESSION 11 — Multi-floor sub-step 4: cross-page persistence & per-page toggle

**Branch:** main | **Commits:** c7a45e0 (Piece 1), d42296e (Piece 2), 196b0fa (Piece 3)

### What was built

Sub-step 4 in three commits + a verification piece:

- **Piece 1 (c7a45e0):** Per-page ghost toggle. `showGhost` boolean → `showGhostByPageId`
  map (default-on `?? true`); per-page state persists across nav, clears on upload. Added
  draw-mode passive repaint useEffect so toggles repaint immediately; removed stale
  imperative redrawDrawCanvas from toggle onClick (was reading pre-update state — the
  "doesn't toggle until mouse moves" bug).
- **Piece 2 (d42296e):** Context-aware inline Draw-disabled hint replacing the misleading
  "Set scale first" tooltip. Ghosted pages tell the user to confirm alignment; anchor
  floors keep set-scale. Gate logic unchanged.
- **Piece 3 (196b0fa):** "Resume align" cue. Factored shared isConfirmed/alignStarted
  consts; three-way align label (Align to floor below / Resume align / Realign) unified
  across all three toolbars.
- **Piece 4 (verification, no commit):** Cross-page restore verified clean — PDF transform,
  ghost, handles, and per-page toggle all repaint correctly on navigation round-trip with
  no interaction needed and no flash of unaligned state.

### Planning decision this session — directional decoupling (deferred to sub-step 5)

Mid-session, identified that the bottom-up assumption (ghost/borrow scan downward through
FLOOR_ORDER, lowest floor must be traced first) is an arbitrary constraint for the
*reference* purpose. Designed a replacement: a **primary-reference tree** — one project-level
`primaryReferencePageId` (defaulted to first-calibrated, user-reassignable), per-page stored
`referenceParentPageId` (the in-primary-space page each floor confirmed against, stored at
confirm time), `getEffectiveScale` following the parent pointer (acyclic tree rooted at
primary). Any confirmed floor is a valid reference for the next, so trace order is free
(up/down/skip). **getAnchorFloor and the Z-stack stay bottom-up, explicitly unchanged** —
physical floor stack is a building fact, separate from reference/scale topology. Logged as
ADDITIONAL_FUNCTIONALITY #15 and BUILD_ROADMAP sub-step 5. Also logged #16 (multi-select
reference ghosts by floor label) as the display-side bridge to #8.

### In-memory-state-loss reminder

No persistence — all state in memory, lost on reload. Sub-step 4 testing (per-page toggle
round-trips, transform restore) requires one un-reloaded tab built up from PDF upload through
alignment; a reloaded tab starts clean.

---

## SESSION 12 — Multi-floor sub-step 5: primary-reference model

**Branch:** main | **Commits:** 9ef06b1 (Piece A), b8dd9ce (Piece B), 6f7f629 (Piece C)

### What was built

Sub-step 5 replaces the bottom-up FLOOR_ORDER scan with a user-configurable primary-reference tree. Three pieces:

**Piece A (9ef06b1): Reference-layer data model + label derivation**
- `REFERENCE_KIND_DEFAULT = 'plan'` and `PROJECTION_DEFAULT = 'plan'` constants in geometry.js — exist so the data shape is final now and only extended later, never restructured.
- `kindToLabel(kind)` function: `'plan'` → `'reference floor'`; extensible for future entity types.
- `primaryReferenceIdRef = useRef(null)` in App.jsx — set once on first manual calibration (set-once guard: `if (primaryReferenceIdRef.current === null)`), never overwritten. Project-level scale/coordinate root.
- `pageRefParentRef = useRef({})` in App.jsx — per-page map `{ [pageId]: parentPageId }`, written at confirm time (Piece B).
- All three toolbar sites (view/draw/edit): align button, ghost toggle, and Draw-disabled hint now read label from `kindToLabel(REFERENCE_KIND_DEFAULT)` — never hardcode "floor below." Result: "Align to reference floor", "Show reference floor", "Confirm alignment to the reference floor…"
- Both refs cleared on PDF upload.

**Piece B (b8dd9ce): Logic swap — primary-reference tree replaces bottom-up scan**
- `getGhostSourcePageId` updated to accept optional `pageRefParent` map (5th arg): checks stored parent first, falls back to FLOOR_ORDER downward scan as pre-confirm suggestion. All 15 call sites in App.jsx updated to pass `pageRefParentRef.current`.
- `getEffectiveScale` updated to follow `pageRefParentRef.current[pageId]` directly (not `getGhostSourcePageId`). Cycle guard (`visited` set) now does real work — the tree is user-defined, not structurally acyclic by FLOOR_ORDER.
- All three confirm handlers write `pageRefParentRef.current[pageId] = ghostSrc` at confirm time — storing which reference page this page aligned against.
- `getAnchorFloor` and the Z-stack left entirely unchanged.

**Piece C (6f7f629): Reference override picker**
- `refCandidates` derived at render scope: floor-plan pages (not current) with own calibration OR confirmed+parent. Re-evaluated on `alignTick` bumps.
- When `alignMode && refCandidates.length > 1`: a `<select>` picker appears in all three toolbar sites (view/draw/edit). Changing the picker writes `pageRefParentRef.current[currentPageId]` immediately and bumps `alignTick` — ghost switches to the chosen reference without requiring confirm first.
- Autosuggest (FLOOR_ORDER proximity → stored parent) is already implemented by Piece B's `getGhostSourcePageId` priority logic; Piece C is only the manual override UI.

### Architecture decisions this session

- **`REFERENCE_KIND_DEFAULT` / `PROJECTION_DEFAULT`** are constant-valued today and exist ONLY to lock in the final data shape so it extends (not restructures) when new entity/projection types arrive.
- **`primaryReferenceIdRef` is set-once.** The primary is the coordinate root; it defaults to the first manually-calibrated page and can be reassigned later (not yet built — no user action required or built for reassignment today). All scale borrows eventually chain to it.
- **Cycle guard is now real:** since the tree is user-defined (not structurally enforced by FLOOR_ORDER), the visited-set in `getEffectiveScale` is genuine insurance, not cosmetic.
- **Design rationale for #17 (universal reference-layer model) logged in ADDITIONAL_FUNCTIONALITY.md** this session: `referenceKind`/`projection` constants exist so the reference relationship is final now; projection math and multi-entity referencing are gated on the pixels→real-world XYZ coordinate conversion.

### Piece D — verify in your browser

Test scenario to validate the logic swap (trace out-of-order):
1. Upload 3+ page PDF with Basement, Main Floor, 2nd Floor categorized
2. Calibrate Main Floor first → `primaryReferenceIdRef` set to Main Floor's pageId
3. Go to 2nd Floor → ghost suggests Main Floor (FLOOR_ORDER fallback). Align + confirm → `pageRefParentRef["page-2nd"] = "page-main"`. Draw unlocks on 2nd Floor.
4. Go to Basement → no ghost (nothing below Basement). Set scale normally.
5. Return to 2nd Floor → Draw still unlocked, labels still correct. Navigate away and back — no flash.
6. Add a page for 3rd Floor → ghost suggests 2nd Floor. Enter align mode → `refCandidates` should contain Main Floor + 2nd Floor → override picker appears. Picking Main Floor switches ghost immediately.
7. Confirm against Main Floor → `pageRefParentRef["page-3rd"] = "page-main"`. Scale resolves correctly (3rd → Main, not 3rd → 2nd → Main).
8. Cycle guard: not reachable with correct tree, but verify no crash on 3+ floor round-trips.

Key visual checks: "Align to reference floor" / "Show reference floor ON/OFF" / hint text. No "floor below" anywhere. Picker only visible when alignMode + 2+ candidates.

---

## SESSION 13 — Roof-plan tracing (2D typed geometry)

**Branch:** main | **Commits:** a5c1b48 (Pieces A+B+C), 8288a1d (Pieces D-G)

### What was built

**Step 7: Roof-plan tracing — 2D typed geometry only (no elevation/slope/Z)**

Two commits, seven pieces:

**a5c1b48 — Pieces A+B+C: data model, section picker, parapet width**
- `roofType: 'flat'|'sloped'` and `parapetWidth: number|null` (inches, always imperial)
  stored on each locked shape on a Roof Plan page.
- `lineRoles: {}` map stored on shape for per-segment role assignment.
- After polygon close on a Roof Plan page, flow diverges: instead of immediate
  Confirm/Discard, a flat/sloped picker appears. Flat sections show parapet width input.
  "Confirm Section" locks the shape with type metadata.

**8288a1d — Pieces D-G: connected-graph trace tool + roles + heal + colors**
- `roofGraphRef = { verts, edges }` — connected graph replacing the earlier
  open-polyline approach. Vertices have stable string IDs (`rv-N`); edges reference
  vertex IDs (shared at junctions, not duplicated). Three provenance fields on vertices:
  `perimCorner` (coincident polygon corner), `perimParent` (on polygon edge mid-span),
  `roofEdgeParent` (created by splitting a roof edge).
- **Two-clicks-per-segment chain:** first click must attach to existing geometry (vertex,
  midpoint, or edge); second click on geometry ends chain; on free space auto-continues.
  Escape abandons active chain without exiting mode.
- **Snap priority:** graph vertex → perimeter corner → midpoint (perimeter + roof) →
  perimeter edge → roof edge → axis-snapped free point. Snapping to a roof edge calls
  `splitRoofEdge` to replace the original with two half-edges sharing the new vertex.
- **perimParent auto-split:** snapping to a perimeter edge mid-span creates a graph
  vertex with `perimParent: { shapeIdx, segIdx }`. The polygon itself is NOT modified.
  Future slope inference uses polygon vertices + perimParent metadata to find the two
  eave halves — no structural change needed before the slope step.
- **Vertex dedup:** `Math.round(x*2),Math.round(y*2)` key → same snap = same vertex ID.
- **healAfterEdgeRemoval:** called on both Z-undo and Delete. Checks both endpoints of
  removed edge: 0 remaining edges + non-perimeter → drop vertex; 1 remaining edge +
  roofEdgeParent → re-merge (removed edge's far endpoint + remaining half's far endpoint);
  2 remaining edges + roofEdgeParent → full merge of both halves; 3+ → leave intact.
- **Role assign mode:** perimeter edges → Eave/Rake (on `shape.lineRoles[segIdx]`);
  internal graph edges → Hip/Valley/Ridge (on `edge.role`). Delete button in role mode
  removes an edge and runs heal.
- **Five role colors:** ridge #b91c1c (dark red), hip #fb923c (light orange),
  valley #2563eb (blue), eave #16a34a (green), rake #8b5cf6 (violet). Applied to
  graph edges (dashed) and perimeter segments with assigned roles (solid overlay).
- **Crosshair cursor** in trace mode; grab cursor excluded.
- **Dump graph button** (debug, temporary) in trace toolbar.

### Key architectural decision: roofGraphRef over open polylines

Mid-session, the initial open-polyline approach was scrapped after Ben correctly identified
it as the wrong primitive. A CAD-style connected graph with shared vertex identity is
required for a structurally coherent roof model. The graph model was designed and approved
in that conversation; the open-polyline code was fully removed and replaced.

### Two role vocabularies

Perimeter edges (polygon sides) and internal graph edges have different structural roles:
- **Perimeter:** Eave (horizontal overhang edge), Rake (sloped gable edge)
- **Internal:** Hip (ridge sloping to corner), Valley (two planes meeting inward), Ridge (peak)
These are stored in different places: `shape.lineRoles` for perimeter, `edge.role` for graph.

### Deferred from this step

- Slope rules, Z-derivation, peaked-eave inference — all deferred per #18. When a ridge
  endpoint lands on a perimeter edge, the topology is recorded (perimParent vertex), but the
  elevation consequence (eave rising to meet the ridge) requires the slope/Z model.
  Logged in ADDITIONAL_FUNCTIONALITY.md #18 build-order.
- Roof drainage, eavestrough/RWL, soffit/fascia — all in #18 build-order.
- Primary-reference reassignment UI — still deferred from sub-step 5.

### Browser-verified this session

- perimParent auto-split confirmed by graph dump: ridge endpoints snapping to perimeter edges
  produced `perimParent: {shapeIdx, segIdx}` vertices, referenced by shared ID in ridge edge.
  No duplicate floating vertices. Topology genuinely connected.

---

---

## SESSION 14 — Floor-height Z-stack data structure + entry panel

**Branch:** main | **Commits:** 2942e0e (Piece 1), e780b88 (Piece 2)

### What was built

**Step 8 (Elevation calibration + tracing), Pieces 1-2: datum-layer height capture**

**Piece 1 (2942e0e): floorHeightsRef + accumulateZ + getFloorLevel — no UI**
- `floorHeightsRef = useRef({})` in App.jsx — keyed by FLOOR_ORDER level string
  (e.g. `'Main Floor'`), value `{ floorToCeiling: number|null, floorSystemAbove: number|null }`.
  Values stored in feet. First floor-level-keyed ref in codebase (all others are pageId-keyed).
- `accumulateZ(floorHeights, presentLevels, floorOrder)` — pure function in geometry.js.
  Returns `[{level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove}]` base→top.
  `presentLevels` = FLOOR_ORDER levels with at least one categorized Floor Plan page.
  Nulls treated as 0 for accumulation but preserved in output.
- `getFloorLevel(pageId)` — App.jsx helper. Looks up `pages` state array, returns `subLabel`
  if it is a known FLOOR_ORDER level (via `isKnownFloorLabel`), else null. The only helper
  in the codebase that crosses the ref/state boundary (floor level is in React state, not a ref).
- `floorHeightsTick` state counter bumped on every `floorHeightsRef` write (same pattern as
  `alignTick`) to force React re-render from ref mutation. `void floorHeightsTick` silences
  linter while creating the dependency.
- Temporary console dump added, verified correct (React double-invoke in dev Strict Mode fires
  dump 4× — expected, not a bug), then removed before commit.
- Upload reset added to `handleFileChange`: `floorHeightsRef.current = {}` plus all draft
  state cleared (`fhFtVals`, `fhInVals`, `fhExpandedLevel`, etc.).

**Piece 2 (e780b88): Floor-heights entry panel — browser-verified**
- "Floor Heights" toolbar button (teal `.floor-heights-btn`) toggles `.fh-panel` overlay.
  Only visible when PDF loaded + no active mode (draw/edit/calibrate/categorize).
- Right-side overlay: `position:absolute; right:0; height:100%; width:300px; z-index:100;`
  dark semi-transparent background; no effect on canvas area.
- **Outstanding worklist (amber):** lists any missing `floorToCeiling` or `floorSystemAbove`
  for each present level; green "All heights entered" when complete.
- **Stack zone:** one `.fh-row` per `fhZStack` entry, base to top.
  - Level name header.
  - Ceiling height: two `number` inputs (ft + in), matching calibration dialog convention.
    Per-level `fhFtVals`/`fhInVals` maps hold draft values independently per row.
    Storage formula: `ft + inches/12` feet. Null stored if both fields are blank.
  - Floor-system-above: expanding control with presets (2×10 = 10.625", 2×12 = 12.625",
    11⅞″ I-joist = 13.25", 14″ I-joist = 15.375", 16″ I-joist/truss = 17.375",
    24″ truss = 25.375") + Custom inches input (`step="0.125"`) with `+1⅜″ sheathing`
    checkbox. All preset values are total depths in inches; converted via
    `inchesToFhUnit(inches) = fhDisplayUnit === 'ft' ? inches/12 : inches*0.0254`.
    `fhDisplayUnit` derived from first available `pageScalesRef` displayUnit, defaults `'ft'`.
  - Topmost level (`fhTopLevel`) shows "— (top of stack)" instead of floor-system control.
  - Derived readouts: floorZ and ceilingZ (display only, muted grey, computed from `fhZStack`).
- Input-format fix applied before commit: ceiling height was originally a single field;
  changed to ft+in two-field entry. Custom floor-system field explicitly in inches with `in` label.

### Architecture decisions this session

**3a scope boundary (explicit):** Session 14 elevation step captures topology/offsets only.
No pixels→real-world XYZ coordinate conversion. `floorHeightsRef` stores heights in feet
(display unit). Coordinate-space conversion is deferred to Phase 2.

**Datum vs. element framing (new):** `floorHeightsRef` is the DATUM layer — named reference
elevations shared across the project (one per known floor level). Per-element Z on individual
shapes is the ELEMENT layer — does not exist yet and is deferred to Phase 2. `completedShapesRef`
shapes do NOT have `floorLevel` or `elevationZ` fields (CLAUDE.md previously documented these
as present — that was a phantom; corrected in Session 14 doc refresh). Coplanar elements sharing
a datum are NOT merged; see ADDITIONAL_FUNCTIONALITY.md #19.

**Imperial-only (explicit):** floor-heights panel stores/displays ft/in only. Metric rework
deferred to #20.

### Deferred-register entries added this session

- **#19 — Coplanar-distinctness principle (architectural record):** coincidence ≠ identity;
  datum layer vs. element layer; per-element Z deferred to Phase 2 (#7).
- **#20 — Metric dimension-entry rework:** all inputs currently imperial-only; unified
  rework deferred to dedicated session.

### BUILD_ROADMAP.md addition

Waypoint added (⏸ WAYPOINT — Deep-level program review): triggers at Phase 2 threshold,
when full 3D geometry + volume model exists. Purpose: frank reassessment of program goals
informed by Phase 1 experience; rebuild is an explicitly anticipated possible outcome.

---

## SESSION 15 — Floor-heights panel Piece 3: floor-to-floor back-solve

**Branch:** main | **Commit:** 4e06de0

### What was built

**Step 8 Piece 3: optional floor-to-floor entry that back-solves ceiling height**

The floor-to-floor input lets the user enter an inter-floor measurement and derives
`ceiling = floorToFloor − floorSystemAbove`, storing the result in `floorToCeiling`.
This is a UI-only addition; `accumulateZ` in geometry.js is unchanged.

**Four agreed fork resolutions (designed before build):**

1. **Stickiness via `ceilingSource` (Fork 1):** New field `ceilingSource: 'direct'|'solved'`
   on `floorHeightsRef.current[level]`. When `'solved'`, editing `floorSystemAbove`
   (via preset or custom) re-solves the ceiling to hold floor-to-floor constant — writes
   `{floorSystemAbove: newFsa, floorToCeiling: newFtc}` atomically via `setFloorHeightFields`.
   Reject (keep prior floor-system value) if validation fails.
2. **Last-edited-wins (Fork 2):** Editing the ceiling ft/in fields directly writes
   `ceilingSource: 'direct'` (via `setFloorHeightFields`). Entering floor-to-floor writes
   `'solved'`. One flag, two entry paths; no priority hierarchy.
3. **Disabled-hint + absent-on-top (Fork 3):** Floor-to-floor input is ABSENT entirely
   on the top-of-stack row; shows inline `cat-panel-hint`-style text ("Set floor system
   above first") when `floorSystemAbove` is null; enabled otherwise.
4. **Reject negative AND zero (Fork 4):** `validateCeiling(ftc, fsa)` — the ONE shared
   guard — rejects if `ftc ≤ 0` (zero ceiling invalid) OR `ftc ≤ fsa` (equal also
   rejected, as zero remaining clearance is not valid). Called by BOTH the floor-to-floor
   entry onChange AND the Fork-1 re-solve inside `applyFhPreset`/`applyFhCustom`. On
   failure: sets `fhError({level, msg})`, returns without writing anything.

**Shared-guard design:** `validateCeiling` is defined once in App.jsx render scope and
called from both entry points — no duplicated logic. The Fork-1 path reads the sticky
`f2f = floorToCeiling + floorSystemAbove` from the ref before computing `newFtc`,
so the stuck floor-to-floor is always held correctly even when the user re-picks presets
multiple times.

**Controlled-input loop-guard confirmation:** Ceiling inputs are controlled
(`value={fhFtVals[row.level] ?? ''}`). The floor-to-floor onChange back-syncs the
ceiling display by calling `setFhFtVals`/`setFhInVals` directly — this updates the
displayed values WITHOUT firing the ceiling onChange handler (controlled inputs don't
fire onChange on external setState). Loop guard confirmed before build; no workaround needed.

**`fhF2fFtVals` / `fhF2fInVals` draft maps:** The typed floor-to-floor stays visible
in its own inputs after entry and does NOT recompute when Fork-1 re-solves the ceiling.
The f2f input is sticky; only the ceiling display syncs.

**`fhError` state:** `{level, msg}|null`. Clears on next valid entry and on focus-switch
between levels (onFocus clears if `fhError.level !== current level`).

**`.fh-error` CSS:** added to App.css (red `#f87171`, 0.76rem, `width:100%`).

**Runtime probes run (browser-verified before commit):**
- Back-solve: enter f2f → ceiling inputs update, derived readouts correct, upstack
  accumulated-Z ripple verified on 3-level stack.
- Both-direction source-flag round-trip: `'solved'` → edit ceiling → `'direct'` → change
  floor-system preset → ceiling NOT re-solved (correct). `'solved'` → change floor-system
  preset → ceiling RE-solved (correct).
- Fork-1 rejection: increase floor-system on a `'solved'` level past the f2f value →
  red error shown, floor-system not written, prior value retained.
- Absent/disabled states: top level has no f2f row; level with null floor-system shows hint.

---

---

## SESSION 16 — Elevation-spatial planning; coordinate-conversion pulled forward

**Branch:** main | **Commits:** none (planning only — no code written this session)

### What happened

Planning session for the SPATIAL half of Step 8 (elevation PDF alignment +
reference lines). No code was written. The session resolved the design forks for
the elevation mechanic, then surfaced a larger decision that supersedes it.

### Decision: pull the pixels→real-world coordinate conversion forward

Repeatedly, every Z-aware step (floor heights, elevations, roof slope) has had to
work around geometry being stored in canvas pixels rather than real-world units.
The recurring friction is the deferred pixels→real-world conversion (CLAUDE.md's
standing "post-Phase-1.5 refactor" note; the "gated on pixels→XYZ" language in
ADDITIONAL_FUNCTIONALITY #7/#17/#18/#19).

Decision made this session:
1. Scope the pixels→real-world coordinate conversion NOW, as its own dedicated
   step — the foundation. It touches every stored coordinate, every snap, every
   label, every transform consumer; it gets its own planning chat with its own
   loaded context (same "own room to think" reasoning that protects the multi-floor
   work in BUILD_ROADMAP).
2. Per-element 3D identity (the ELEMENT layer — #7 intra-floor Z, #19 coplanar-
   distinctness) stays SEQUENCED BEHIND the conversion. It depends on the
   conversion existing and must be designed deliberately per #19, not bolted on.
3. The elevation spatial step is PAUSED and will be rebuilt on real units once the
   conversion lands (cleaner that way).

### Step-8 spatial forks — RESOLVED BUT PARKED (do not re-litigate when elevation resumes)

- **Edge-as-ghost:** an elevation's ghost reference is the selected floor-plan EDGE
  (already calibrated) projected as a horizontal line of known real-world length.
  It reuses the existing align machinery (.pdf-align-layer, pageTransformsRef,
  getCSSTransform, body-drag + corner handles); handles anchor to the edge-line
  endpoints rather than a polygon bbox. This collapses old Fork C (no separate
  elevation align entry point needed) and old Fork B (horizontal scale is borrowed
  from the edge).
- **Uniform scale always:** the borrowed horizontal scale applies proportionally to
  BOTH axes — no non-uniform/stretched scaling, ever. There is ONE uniform scale per
  elevation, set by the edge-ghost. Floor/ceiling reference lines are positioned
  WITHIN that scale and read height OFF it; they do NOT establish an independent
  vertical scale.
- **Datum-Z this step / element-Z later (old Fork A):** the elevation floor/ceiling
  lines read/write the DATUM layer (floorHeightsRef) only. The traced elevation
  outline is stored as 2D pixels like every other shape — NO per-vertex Z this step.
  Per-element Z is the ELEMENT layer, sequenced behind the coordinate conversion.
- **Last-edited-wins across surfaces:** the elevation line and the floor-heights
  panel are two editing surfaces for the SAME value in floorHeightsRef. Edit one and
  the other updates to match — same last-edited-wins pattern as Piece 3's
  ceilingSource, now spanning two surfaces instead of two fields.
- **Piece sequence (when elevation resumes):** floor-plan edge-select → align
  horizontal to edge-ghost (uniform) → place floor/ceiling lines (read height off
  the uniform scale) → trace outline as single open polyline. Edge-select comes
  FIRST because the edge IS the align ghost.

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
- **Sidebar auto-hide (#11):** collapse on canvas interaction; candidate for same UI pass as #10
- **Page rotation (#12):** 90° viewer convenience + arbitrary alignment rotation; `angle` reserved in transform struct
- **Ghost vertices as opt-in snap targets (#13):** deferred from sub-step 3; shared grid handles alignment for now
- **Scale inheritance within drawing group (#14):** suppress Set Scale across a group once one page is calibrated; needs drawing-group concept
- **Primary-reference reassignment UI (#15 — partial):** `primaryReferenceIdRef` set-once today; UI to reassign (relabel root; geometry doesn't move) deferred
- **Multi-select reference ghosts by floor label (#16):** per-floor-label visibility picker for reference overlays; bridge between single ghost and #8 full layer system
- **Universal reference-layer model (#17):** architectural record; sub-step 5 adopts data shape; projection math + multi-entity referencing gated on pixels→XYZ conversion
- **Roof slope/Z-derivation + peaked-eave inference (#18):** ridge-to-perimeter junction topology built (perimParent vertex); the elevation consequence (eave rising to ridge, sloped surface) needs slope rules + XYZ model — see #18 build-order in ADDITIONAL_FUNCTIONALITY.md
- **Coplanar-distinctness principle (#19):** architectural record — datum vs. element layer; per-element Z deferred to Phase 2
- **Metric dimension-entry rework (#20):** floor-heights panel imperial-only; unified rework deferred to dedicated session
- **Dump graph button (debug):** temporary `console.log` button in trace toolbar — remove before production
- See `ADDITIONAL_FUNCTIONALITY.md` for all deferred items

---

## FORWARD BUILD SEQUENCE

1. ~~Zoom/pan~~ — DONE
2. ~~Compass rose alignment~~ — DONE
3. ~~Step 4a: pageId migration~~ — DONE
4. ~~Step 4b: Page categorization UI~~ — DONE
5. ~~Step 4c: Sidebar + navigation~~ — DONE
6. ~~Ground floor tracing~~ — DONE
7. ~~Multi-floor reference & alignment~~ — DONE
   - ~~Sub-step 1: ghost rendering~~ — DONE (996b5a7)
   - ~~Sub-step 2: ghost alignment + per-page transform~~ — DONE (73f02f1, c2ed3ba, 122b077, 6e97f67, b210343, d5425d0)
   - ~~Sub-step 3: confirm-scale lock~~ — DONE (d49060d, e4cf8b6, 327e84d, d030a34)
   - ~~Sub-step 4: cross-page persistence/toggle~~ — DONE (c7a45e0, d42296e, 196b0fa)
   - ~~Sub-step 5: directional decoupling / primary-reference model~~ — DONE (9ef06b1, b8dd9ce, 6f7f629)
8. ~~Roof plan tracing~~ — DONE (a5c1b48, 8288a1d)
9. **Elevation calibration + tracing (IN PROGRESS)**
   - ~~Piece 1: floorHeightsRef + accumulateZ + getFloorLevel~~ — DONE (2942e0e)
   - ~~Piece 2: Floor-heights entry panel~~ — DONE (e780b88)
   - ~~Piece 3: Floor-to-floor back-solve entry + ceilingSource + validateCeiling~~ — DONE (4e06de0)
   - **Elevation PDF alignment + reference lines (NEXT)**

After elevation: cross-section reference geometry → windows/doors → Phase 2 threshold.
