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

## CURRENT DEFERRED ITEMS

- **Feet+inches carry-over display bug (low priority):** `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** too loose with small snap grids
- **Redundant collinear vertex after complex Combine:** stray short segment, cosmetic
- **Inherited geometry on all pages:** layer management deferred to Phase 2+
- **No persistence:** memory only, lost on reload
- **Working area selection:** dropped from Step 4b scope; zoom makes it redundant; revisit when duplicate page is prioritized
- See `ADDITIONAL_FUNCTIONALITY.md` for larger deferred feature ideas

---

## FORWARD BUILD SEQUENCE

1. ~~Zoom/pan~~ — DONE
2. ~~Compass rose alignment~~ — DONE
3. ~~Step 4a: pageId migration~~ — DONE
4. **Step 4b (NEXT): Page categorization UI** — category + sub-label per page,
   auto-starts after compass Confirm/Skip, stored in `projectState.pages`.
   Working area removed from scope.
5. **Step 4c: Sidebar + navigation**

Then a fresh planning chat picks up at ground floor tracing onward (see
`FUNCTIONALITY_SUMMARY.md`).

---

## NEXT SESSION PROMPT — Step 4b: page categorization
