# Collabinator — Phase 1 Build (pdf-viewer)

This file is read automatically by Claude Code at the start of every session in this
project folder. It exists so a new session understands the project without the user
re-explaining context every time.

## How to work in this project (process discipline)

This project is built by Ben (solo, first-time builder, construction-domain expert) in tightly-scoped increments. Follow this working discipline every session. The goal is to build autonomously and surface to Ben ONLY genuine decisions — not to narrate or seek approval for obvious steps.

**Consequential vs. mechanical — the core distinction:**
- CONSEQUENTIAL (STOP, explain the fork briefly, wait for Ben): anything Ben sees or interacts with (UI/UX, labels, behavior); anything that changes workflow; real architectural forks with genuine trade-offs; interpreting ambiguous test results; scope-drift judgment calls. Lay out the alternatives concisely and wait. This is where his input matters.
- MECHANICAL (just do it, report in a sentence, do NOT ask permission): one-line fixes, reverts, log removal, commit grouping, dependency-array wiring, choosing among options with one engineering-correct answer, the next logically-forced step in an already-agreed sequence. Pick the right thing and proceed. Ben can veto anything; he does not pre-approve the obvious.

**Batching:** Chain logically-forced mechanical steps freely (recon -> build -> self-check in one pass where safe). Do NOT make Ben affirm every micro-step. The only thing to avoid is dumping a large number of UNRELATED items at once. Keep each surfaced message digestible. Reserve true "stop and wait" for consequential forks.

**Default to brevity.** Expand explanation only for a genuine fork, a UI/UX call, or a test result to interpret. Cut justification for engineering-obvious steps. If explaining why an obvious step is done a certain way, delete it.

**Build loop:**
- Plan a step into small, committable pieces before writing code. State which piece/sub-step each change belongs to.
- One clearly-scoped change at a time, committed and pushed before the next where practical.
- Commit and push are separate actions; confirm pushes reach origin (GitHub is the safety net).
- After a code change that affects visuals or interaction, do a runtime check before trusting it. When runtime behavior contradicts a static "looks fine" read, TRUST THE RUNTIME — add a console.log and verify rather than reasoning from the file. (This caught a real 3-floor recursion bug and a repaint-lag bug in prior sessions.)
- A piece that needs runtime verification is NOT complete until the runtime result exists. If verification requires Ben's browser (visual/interaction in his dev-server tab), PAUSE and wait for his eyeball BEFORE committing that piece as done and BEFORE session close-out. Do not commit a runtime-dependent piece and hand Ben a test plan as homework, and never declare a step done or name the next step on the strength of a static "looks correct" read. The cycle-guard / out-of-order test in sub-step 5 is the canonical example: it had to be run, not reasoned about.
- NOTE: the console tool reads the preview, not Ben's dev-server tab. For visual/interaction verification Ben eyeballs his own browser (npm run dev, port 5173 or 5174 — preview takes one; confirm the port). Ask him to look, don't assume the preview reflects his tab.

**Scope discipline (critical — Ben has a known tendency to expand scope mid-build):**
- If a new idea surfaces mid-step, judge it: a small in-scope refinement gets folded in with a one-line note. Genuine scope drift gets FLAGGED proactively (don't wait to be asked), and offered for logging in ADDITIONAL_FUNCTIONALITY.md, then redirect to finishing the current step.
- Architectural ideas that reshape the data model get a planning discussion BEFORE code. Capture them in ADDITIONAL_FUNCTIONALITY.md so they aren't lost to session history.

**Session close-out (every session, unprompted):** When a step is committed and pushed, run a close-out: update the five live docs (CLAUDE.md, SESSION_HANDOFF_NOTES.md, BUILD_ROADMAP.md, FUNCTIONALITY_SUMMARY.md, ADDITIONAL_FUNCTIONALITY.md) to match what was built, commit and push the doc update. The five docs are the source of truth for the next session — keep them current.

**Gate-expiry sweep (session-start AND every major-feature boundary):** When regenerating the status board from the five live docs at session start, also scan ADDITIONAL_FUNCTIONALITY.md for any deferred item whose stated gate is now satisfied by completed work — tag it GATED-READY in the entry and flag it to Ben before the session's build work begins. The sweep fires again whenever a #5-sized feature lands: do the sweep before picking the next item. This makes gate-expiry automatic and recurring (part of the process, not of Ben's vigilance) rather than ad-hoc.

**Environment:** Project at C:\dev\collabinator (always confirm the folder at session start; older docs may reference a stale C:\Users\ben\Collabinator\pdf-viewer or G: path). State is in-memory only, lost on reload — build test state in one un-reloaded tab. Per-folder `.claude/settings.local.json` recreation is no longer needed — global user-level Claude Code settings (`~/.claude/settings.json`) now set `defaultMode: acceptEdits` and allow Bash/PowerShell, covering all projects.

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

`C:\dev\collabinator`

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
    eligible if they each have an edge on the same infinite line (parallel OR
    anti-parallel — both winding combinations work) with nonzero overlap length;
    merge inserts new vertices at the exact overlap boundaries via linear
    interpolation (no rounding/snapping), then splices the shared portion out;
    full-edge-match is a special case and still works
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
  * **Snap grid selector in Edit Shapes:** the distance-snap increment
    (1″/3″/6″/12″ or 2.5/7.5/15/30 cm) is exposed in all five Edit Shapes
    toolbar contexts (default, Move, Combine, Split, Delete), reading/writing
    the same underlying setting as Draw mode — stays in sync across modes
- **Start-vertex snap:** before placing the first vertex of a new shape, hovering
  within 9px (HIT_VERT_DIST) of any vertex on visible locked geometry shows a red
  highlight; clicking places the new shape's first vertex exactly coincident.
  Shift suppresses it for a free start point. Implemented via `getVisibleVertices()`
  so it extends automatically to future reference/ghost geometry with no rework.
- **Zoom & pan:**
  * Mouse wheel zooms in/out anchored to cursor position (point under cursor stays
    fixed); clamped 0.1× minimum to 10× maximum
  * Left-drag on empty canvas pans in all modes (view, draw, calib, edit);
    middle-mouse drag pans in all modes
  * Pan drag <3px does not suppress the following click
  * Implementation: `canvas-world` div wraps both canvases inside `.canvas-stack`
    and receives the CSS transform; `getCanvasPos()` via `getBoundingClientRect()`
    auto-compensates — no coordinate mapping changes in any existing handler
  * Zoom and pan reset to defaults on page navigation and PDF upload
- **PDF backdrop resolution toggle (#10c, Session 51; commit 6e06677):** three-tier
  rasterization multiplier applied to the PDF backdrop canvas only — geometry,
  `measureRef`, `getCanvasPos`, snap, and all stored pixel coordinates untouched:
  * Normal (1×, default), Enhance (2×), Ultra (4×). Toolbar buttons "Enhance" /
    "No seriously, enhance" / "De-enhance"; Enhance cycles up, De-enhance jumps to
    Normal. Disabled states: Enhance disabled at Ultra, De-enhance disabled at Normal.
  * `renderPage` accepts `{ resizeMeasure }` flag. Same-page enhance re-renders pass
    `resizeMeasure: false` — `measureRef` bitmap is never touched, geometry survives.
    Real page-changes keep default `resizeMeasure: true` (clears + resizes `measureRef`
    as before, repaint fires from `setCurrentPage` state change as always).
  * `canvasRef` CSS `width/height` pinned to logical `scaled` dimensions regardless of
    backing bitmap size — keeps backdrop pixel-aligned with `measureRef`.
  * Auto-resets to Normal on page navigation, PDF upload, and fixture restore.
- **PDF upload full-state reset:** uploading a new file clears all locked shapes,
  calibration/scale data, page grid origins, in-progress drawing trace, review
  state, and edit undo/redo history — new file always starts completely clean
- **Compass rose overlay:** fixed overlay above the canvas; drag the rose body to
  reposition, drag the rotation handle (~60% along the N arm) to rotate, arrow-key
  nudge (±1°, ±0.1° with Shift), numeric angle input; Confirm stores
  `compassAngleDeg` + `compassCardinal`, Skip stores 0°/N; transparent background
  (PDF visible through it) with amber "action required" instruction styling;
  re-openable via "Set North"; persists across page nav/zoom, clears on PDF upload
- **pageId architecture:** every page is assigned a stable `pageId` at load
  (`pageIdMapRef.current[pageNum] = "page-N"`); `getPageId(pageNum)` helper; all
  page-keyed refs (`pageScalesRef`, `pageGridOriginRef`, etc.) are keyed by
  `pageId`, and shapes carry a `pageId` field (not `pageNumber`). `pageNum` is
  retained only for PDF.js rendering. `pageTransformsRef` populated by sub-step 2.
- **Page categorization:** distinct app mode that auto-triggers after compass
  Confirm/Skip (also re-enterable any time):
  * Categories: Site Plan / Floor Plan / Elevation / Cross-Section / Detail /
    Roof Plan, plus "Skip this page"
  * Sub-labels per category — Floor Plan dropdown (Basement / Crawlspace /
    Main Floor / 2nd Floor / 3rd Floor / Other + free text); Elevation dropdown
    (North / South / East / West); Site Plan / Cross-Section / Detail / Roof Plan
    optional free text
  * Non-modal panel — PDF and page navigation stay usable; Confirm saves and
    advances to the next uncategorized page
  * Compact summary + Recategorize button shows immediately for any already-
    categorized page mid-categorization; recategorize is non-destructive (no
    geometry/scale loss)
  * Sub-labels per category: Floor Plan known-level dropdown (Basement /
    Crawlspace / Main Floor / 2nd Floor / 3rd Floor — no "Other"; free-text
    `subLabelNote` optional but the known level is required to confirm); Elevation
    dropdown (North / South / East / West); Site Plan / Cross-Section / Detail /
    Roof Plan optional free text
  * Stored in `pages` array (`{pageId, pageNum, category, subLabel, subLabelNote}`),
    cleared on PDF upload
  * `getAnchorFloor(pages, FLOOR_ORDER)` helper: scans categorized floor-plan pages,
    returns the lowest known floor level present (per `FLOOR_ORDER` array = Basement →
    Crawlspace → Main Floor → 2nd Floor → 3rd Floor), or `null` if none
  * Navigation: while categorizing the arrows cycle all pages; after Done they
    cycle categorized pages only; re-entry via "+ Categorize more pages" jumps to
    and cycles uncategorized pages only ("All pages categorized" end state)
- **Sidebar (Step 4c):** collapsible sidebar overlay for page navigation:
  * Floats as an overlay (`position:absolute`, `z-index:100`, 240px open / 32px
    closed) — does not push or resize the canvas area
  * Semi-transparent background (`rgba(15,23,42,0.20)`) with `backdrop-filter`
    blur, so the PDF stays visible through it
  * Sections in order: Plan Views, Elevations, Roof Plans, Cross-Sections,
    Details, Site Plans, Unused Pages
  * Intra-section ordering: floor plans low-to-high (Basement → 3rd Floor → free
    text), elevations N/S/E/W
  * Active page: blue left border + blue text; hover: translucent white background
  * Canvas area unaffected by sidebar state (true overlay, not a flex sibling)
- **Front-face designation (Step 5c):** one-per-building property identifying the
  road-facing exterior segment of the anchor-floor polygon:
  * Stored as `frontFace: { pageId, shapeIndex, segmentIndex, endpointA: {x,y}, endpointB: {x,y} }`
    where `endpointA/B` are staleness sanity-check snapshots (the segment indices are
    authoritative; the stored coordinates flag if the polygon has since been edited)
  * Derived trigger: prompts automatically when `frontFace` is `null` AND the anchor
    floor is determinable (via `getAnchorFloor`) AND the anchor page has at least one
    locked polygon; re-checked after every polygon lock and after every categorization
    change; never re-prompts once `frontFace` is set, even if the anchor floor later
    changes
  * Pick-mode interaction: while active, hover-highlights outer-perimeter segments of
    all locked shapes on the anchor page; click selects and stores `frontFace`; normal
    draw and edit interactions are suppressed; "Skip for now" dismisses the prompt
    without setting `frontFace`
  * Selected front-face edge visually marked (distinct color) across all redraws
  * Verified to survive shape edits (edit-mode segment/vertex drag does not clear
    `frontFace`; stale-check coordinates update on next pick if shape was modified)
  * Purpose: maps road-facing direction onto compass cardinal (N/S/E/W), enabling
    Front/Back/Left/Right elevation naming in sidebar and downstream tools
  * Cleared on PDF upload
- **Multi-floor reference ghost (Step 6, sub-step 1 of 4):** read-only, toggleable
  overlay of the floor-below geometry on current floor-plan pages (commit 996b5a7):
  * `getGhostSourcePageId(pages, currentPageId, completedShapes, FLOOR_ORDER)` helper
    in geometry.js: scans downward through FLOOR_ORDER to find nearest-lower categorized
    Floor Plan page with locked shapes; returns its pageId or null
  * `drawGhostShapes(ctx, completedShapes, ghostPageId)` stateless drawer in
    canvasRenderer.js: renders locked shapes in amber (#f59e0b), 3.5px dashed stroke
    at 0.85 opacity, 10% amber fill, 25% 45° hatch pattern clipped to polygon; drawn
    as background layer below working geometry
  * `showGhost` toggle in view/draw/edit toolbars, visible only when a ghost source
    exists; toggles on/off without affecting geometry
  * Ghost is purely visual: never hit-tested, never editable, never snapped to
  * Clears on PDF upload; persists across zoom/pan and page navigation
- **Multi-floor ghost alignment + per-page transform (Step 6, sub-step 2 of 4):**
  PDF-layer translate + uniform scale to align current floor's PDF to floor-below ghost
  (commits 73f02f1, c2ed3ba, 122b077, 6e97f67, b210343, d5425d0):
  * `pageTransformsRef.current[pageId] = {tx, ty, s, angle}` — now populated during
    align interaction (was a reserved placeholder). `angle` reserved in struct but not
    wired (deferred, ADDITIONAL_FUNCTIONALITY #12).
  * `getCSSTransform(t)` pure helper in canvasRenderer.js: builds CSS string
    `translate(tx px, ty px) rotate(angle deg) scale(s)` from a transform struct;
    returns `'none'` for null/identity. Used with `transformOrigin: '0 0'`.
  * `.pdf-align-layer` div wraps ONLY the PDF `<canvas ref={canvasRef} />` inside
    `.canvas-world`; carries the per-page CSS transform. `measureRef` (drawing/overlay
    canvas) remains a direct child of `.canvas-world` and is NOT inside this div —
    the ghost and drawn geometry are the fixed reference; only the PDF backdrop moves.
  * `drawAlignHandles(ctx, completedShapes, ghostPageId, zoom)` stateless drawer in
    canvasRenderer.js: draws four amber square handles (`HANDLE_PX = 12`, exported
    constant) at the ghost bbox corners TL/TR/BR/BL; constant screen size via
    `HANDLE_PX / zoom`; visible only when `alignMode` is true.
  * **"Align to floor below" toolbar button** (view/draw/edit toolbars, same
    `getGhostSourcePageId` gate as Show floor below): enters `alignMode`. If ghost was
    hidden, turns it on automatically. "Exit align" dismisses.
  * **In `alignMode`:** body-drag (canvas, no handle) writes `{tx, ty}` via
    `(clientDelta / zoom)` → `pageTransformsRef`; four scale handles at ghost bbox
    corners — grabbing a handle scales uniformly around the diagonally-opposite ghost
    bbox corner as fixed anchor; `tx/ty` recomputed to keep anchor's canvas point fixed
    as scale changes: `tx1 = ax - (ax - startTx) * (newS / startS)`. `d0` computed
    from grabbed bbox corner to anchor (not cursor), preventing first-move scale jump.
    Scale clamped 0.05–20×. `angle` untouched (stays 0).
  * `alignTick` state bumps on every drag write to force React re-read of
    `pageTransformsRef` for `.pdf-align-layer` style.
  * Resize cursor (`nwse-resize`) shown when hovering a scale handle; grab cursor
    during active drag.
  * `alignMode`, `showGhost`, `alignTick` added to passive-redraw `useEffect` deps for
    `redrawFrontFaceLayer` (view mode) and `drawEditCanvas` (edit mode) so handles and
    ghost repaint live on toggle/drag.
  * `alignMode` resets to `false` on page navigation and PDF upload; `{tx,ty,s,angle}`
    in `pageTransformsRef` persists across page navigation, cleared only on PDF upload.
  * **Scale-drag field preservation:** the scale-drag branch spreads existing transform
    fields (including `confirmed`) before writing new values — matching the translate
    branch — so confirming then re-aligning via scale drag does not silently wipe the
    confirmed flag.
- **Multi-floor confirm-scale lock (Step 6, sub-step 3 of 4):**
  Readiness gate that makes the PDF alignment permanent and unlocks Draw on ghosted
  pages (commits d49060d, e4cf8b6, 327e84d, d030a34):
  * **`confirmed` flag** — `pageTransformsRef.current[pageId]` now carries an optional
    `confirmed: boolean`. Written `true` by the "Confirm scale & alignment" button;
    persists across page navigation; cleared on PDF upload with the rest of the ref.
  * **"Confirm scale & alignment" button** — rendered only while `alignMode` is true,
    alongside "Exit align", at all three toolbar sites (view/draw/edit). On click:
    reads the current transform, writes it back with `confirmed: true`, calls
    `setAlignMode(false)`, and bumps `alignTick` to force a toolbar re-read.
  * **"Realign" re-entry** — once `confirmed` is true the align button reads "Realign"
    instead of "Align to floor below". Clicking it re-enters `alignMode` on the
    **existing** `{tx, ty, s, angle, confirmed}` — the transform is never reset.
    The user can nudge and re-confirm freely.
  * **`getEffectiveScale(pageId, _visited)` resolver** — inside the App component,
    near `getVisibleVertices`. Returns: the page's own calibration if set; else, if
    the page's align transform is `confirmed`, recurses to `getEffectiveScale` on the
    ghost source page (walking down `FLOOR_ORDER` to the first calibrated floor); else
    `null`. A visited-set cycle guard (`_visited`) is threaded through the recursion as
    cheap insurance (the chain strictly descends `FLOOR_ORDER` today so cannot cycle).
    This means a 3+ floor stack where middle floors have no own calibration still
    resolves correctly — the recursion bottoms out at the first floor with real
    calibration. Ghost source's `s` (PDF scale factor) does NOT enter the borrowed
    scale; geometry is drawn in measure space at the ghost's calibrated `pxPerMeter`.
  * **Scale-borrow unlocks Draw** — all current-page scale reads are routed through
    `getEffectiveScale`: `snapToGrid`, `applySnap`, `snapPerp`, `commitLabelEdit`,
    `pageHasScale`, both `pxToDisplayDist` call sites (synthetic single-entry map),
    both snap-increment `isImperial` reads, and the Draw button's default increment
    init. A confirmed ghosted page with no own calibration now passes `pageHasScale`,
    enabling Draw and showing correct wall-length labels without re-calibration.
    Verified empirically: labels read true because the shared measure-space grid is the
    geometry-to-geometry alignment mechanism — `s` only moves the PDF backdrop.
  * **"Set Scale" button hidden on ghosted pages** — the Set Scale / Re-calibrate
    button is suppressed whenever `getGhostSourcePageId` returns non-null. Scale on
    ghosted pages comes from confirm-and-borrow; manual calibration returns only if
    the page is reclassified out of the ghost chain.

- **Multi-floor sub-step 4 (Step 6, sub-step 4 of 4):** cross-page persistence
  & per-page toggle state (commits c7a45e0, d42296e, 196b0fa):
  * **Per-page ghost toggle** — global `showGhost` boolean replaced by
    `showGhostByPageId` map keyed by pageId, default-on via `?? true`. Each page
    remembers its own ghost on/off; persists across navigation, clears on PDF upload.
    Derived `showGhost = showGhostByPageId[currentPageId] ?? true` keeps all existing
    draw guards unchanged.
  * **Draw-mode passive repaint useEffect** added (mirroring view/edit mode) so ghost
    and snap toggles repaint immediately instead of on next mouse move; stale imperative
    redrawDrawCanvas call removed from the toggle onClick (was reading pre-update state).
  * **Context-aware Draw-disabled hint** — inline hint (`cat-panel-hint` style) next to a
    disabled Draw button. Ghosted pages read "Confirm alignment to the floor below…" /
    "Confirm scale & alignment…" per align state; anchor floors read "Set scale…".
    Replaces the misleading title-tooltip. Gate logic unchanged (getEffectiveScale
    already returns null until confirmed).
  * **Three-way align button label** — `isConfirmed` and `alignStarted` factored into
    shared render-scope derived values (consumed by both the hint and the button).
    Label resolves: "Align to floor below" (not started) / "Resume align" (started, not
    confirmed) / "Realign" (confirmed), unified across view/draw/edit toolbars.
  * Cross-page transform/ghost/handle restore verified clean on navigation round-trip
    (no repaint gap; persisted refs repaint on arrival without interaction).

- **Multi-floor sub-step 5 (Step 6, sub-step 5 of 5):** primary-reference tree replaces
  bottom-up scan (commits 9ef06b1, b8dd9ce, 6f7f629):
  * **`REFERENCE_KIND_DEFAULT = 'plan'` / `PROJECTION_DEFAULT = 'plan'`** — constants in
    geometry.js; constant-valued today so the data shape is final and only extended later.
    `kindToLabel(kind)` maps `'plan'` → `'reference floor'`; all UI labels derive from it
    (never hardcoded "floor below").
  * **`primaryReferenceIdRef`** — project-level pageId of first manually-calibrated page;
    set once (set-once guard) on calibration confirm; never overwritten. The scale/coordinate
    root of the reference tree.
  * **`pageRefParentRef`** — per-page map `{ [pageId]: parentPageId }`; written at confirm
    time (`if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc`). Three confirm
    handlers (view/draw/edit) all write this.
  * **`getGhostSourcePageId` updated** — now accepts optional 5th arg `pageRefParent` map;
    checks stored parent first (direct reference to stored parent), falls back to FLOOR_ORDER
    downward scan as pre-confirm suggestion. All 15 call sites pass `pageRefParentRef.current`.
  * **`getEffectiveScale` updated** — follows `pageRefParentRef.current[pageId]` directly
    (not `getGhostSourcePageId`). Cycle guard (`visited` set) now does real work since the
    tree is user-defined. Chains correctly for 3+ floor stacks.
  * **Reference override picker** — when `alignMode && refCandidates.length > 1`, a compact
    `<select>` appears in all three toolbar sites. `refCandidates` = floor-plan pages with own
    calibration OR confirmed+parent (i.e. already in the primary space). Selecting overrides
    `pageRefParentRef.current[currentPageId]` immediately (no confirm required) and bumps
    `alignTick` to repaint ghost to new reference.
  * **Autosuggest:** `getGhostSourcePageId` already implements proximity (FLOOR_ORDER fallback)
    + last-used (stored parent takes priority). Picker is the override UI only.
  * `getAnchorFloor` and the Z-stack are entirely unchanged.

- **Roof-plan tracing (Step 7, Session 13):** 2D typed geometry on Roof Plan category pages
  (commits a5c1b48, 8288a1d):
  * **Section picker after polygon close on roof pages:** closed polygon enters a
    flat/sloped type picker (instead of immediate confirm). Flat: parapet width entry
    (stored in inches, always imperial regardless of display unit). Sloped: no parapet.
    `roofType: 'flat'|'sloped'` and `parapetWidth: number|null` stored on shape object.
    `lineRoles: {}` map also stored for per-edge role assignment.
  * **`roofGraphRef` — connected-graph internal line tracer:** stores hip/valley/ridge
    lines as a shared-vertex graph (NOT independent polylines). Two-clicks-per-segment
    chain; first click must attach to existing geometry; second click on geometry ends
    chain, on free space auto-continues. Snap targets: existing graph vertices, perimeter
    corners, segment midpoints, perimeter/roof edges (edge-snap creates split vertex).
    Axis snap active; Shift releases. Crosshair cursor in trace mode.
  * **perimParent auto-split:** when a chain endpoint snaps to a perimeter edge
    mid-span, a graph vertex is created with `perimParent: { shapeIdx, segIdx }` —
    the perimeter polygon is NOT modified; the vertex records which segment it lies on.
    Future slope inference traverses polygon + perimParent metadata to find the two
    eave halves. perimCorner provenance recorded when snapping to a polygon corner.
    roofEdgeParent provenance recorded when splitting an existing roof graph edge.
  * **Vertex dedup:** coordinates grid-quantized to 0.5 canvas-pixel before keying a
    dedupe Map. Two snaps within 0.5px produce the same vertex ID.
  * **Z-undo + Undo button:** Z key and Undo button in trace toolbar both remove the
    last edge and call `healAfterEdgeRemoval`. Heal logic: 0 connections on a
    non-perimeter vertex → drop; 1 connection on a roofEdgeParent vertex → re-merge
    with the removed edge's far endpoint; 2 connections on roofEdgeParent → full merge
    of both halves (restores original pre-split edge); 3+ → leave intact.
  * **Role assignment mode:** separate from Edit Shapes; classifies each edge.
    Two vocabularies: perimeter edges (from polygon) → Eave or Rake; internal graph
    edges → Hip, Valley, or Ridge. Click edge to select, pick role from toolbar.
    Delete button removes a graph edge and runs the same heal logic.
  * **Five role colors:** ridge #b91c1c, hip #fb923c, valley #2563eb, eave #16a34a,
    rake #8b5cf6. Rendered on both internal graph edges (dashed) and perimeter segments
    (solid, on top of default polygon fill).
  * All roof graph state clears on PDF upload; chain state clears on page nav.

- **Floor-height Z-stack data structure (Step 8, Sessions 14-15 — Pieces 1-3):**
  Datum-layer height capture for all known floor levels (Piece 1: `2942e0e`; Piece 2: `e780b88`; Piece 3: `4e06de0`):
  * **`floorHeightsRef`** — `useRef({})` keyed by FLOOR_ORDER level string (e.g. `'Main Floor'`);
    value `{ floorToCeiling: number|null, floorSystemAbove: number|null, ceilingSource: 'direct'|'solved' }`.
    Storage in feet. `ceilingSource` missing/undefined treated as `'direct'` everywhere — no migration.
    First floor-level-keyed ref in codebase (all others are pageId-keyed). Cleared on PDF upload.
  * **`accumulateZ(floorHeights, presentLevels, floorOrder)`** — pure function in geometry.js;
    returns ordered `[{level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove}]` base→top.
    Nulls preserved in output but treated as 0 for accumulation.
  * **`getFloorLevel(pageId)`** — App.jsx helper; looks up `pages` state array, returns `subLabel`
    if it is a known FLOOR_ORDER level, else null. Bridges the ref/state boundary.
  * **`floorHeightsTick`** — state integer bumped on every `floorHeightsRef` write (same pattern
    as `alignTick`) to force React re-render.
  * **`setFloorHeightFields(level, fieldsObj)`** — merges multiple fields into `floorHeightsRef.current[level]`
    in one write + one tick bump. Used for atomic multi-field updates (e.g. writing `floorToCeiling` +
    `ceilingSource` together).
  * **`validateCeiling(ftc, fsa)`** — shared guard; returns null or error string. `ftc` must be
    strictly > 0 AND strictly > `fsa` (equal/zero rejected). Called by both the floor-to-floor
    entry handler and the Fork-1 re-solve path — never duplicated.
  * **Floor-heights panel (Piece 2)** — right-side overlay (`.fh-panel`), 300px, absolute-positioned,
    dark semi-transparent background. "Floor Heights" toolbar button (teal) toggles it; only shown
    when PDF is loaded and no active mode (draw/edit/calibrate/categorize). Panel contains:
    - Outstanding items (amber worklist): missing ceiling heights and floor-system depths
    - Stack zone: one row per `fhZStack` entry (base to top), showing level name, ft+in ceiling
      height entry (two `number` inputs matching calibration dialog convention), expanding
      floor-system-above control with inch-native presets (2×10 through 24″ truss) + custom
      inches input with optional `+1⅜″ sheathing` checkbox, derived Z readouts (floorZ, ceilingZ)
    - Topmost level shows "— (top of stack)" in place of floor-system control
  * **Floor-to-floor back-solve entry (Piece 3)** — optional ft+in input per non-top row that
    derives ceiling = floorToFloor − floorSystemAbove and stores the result:
    - ABSENT on the top-of-stack level (no floorSystemAbove above it)
    - DISABLED with inline hint when `floorSystemAbove` is not yet set for that level
    - ENABLED otherwise; onChange runs `validateCeiling`, rejects with `fhError` on failure,
      else writes `{ floorToCeiling: derived, ceilingSource: 'solved' }` and syncs ceiling
      draft inputs (`fhFtVals`/`fhInVals`) via direct `setState` (no onChange loop — ceiling
      inputs are controlled, so setState updates display without firing ceiling onChange)
    - **Last-edited-wins (`ceilingSource`):** editing the ceiling field directly writes
      `ceilingSource: 'direct'`; entering floor-to-floor writes `'solved'`. One flag, two entry paths.
    - **Fork-1 stickiness:** when `ceilingSource === 'solved'`, applying a floor-system preset or
      custom value re-solves the ceiling to hold floor-to-floor constant (`newFtc = f2f − newFsa`),
      runs `validateCeiling` (rejects the floor-system write on failure, keeps prior value), and
      writes `{ floorSystemAbove: newFsa, floorToCeiling: newFtc }` atomically. When
      `ceilingSource === 'direct'`, floor-system writes proceed unchanged.
    - `fhError` state (`{ level, msg } | null`): cleared on next valid entry and on focus-switch
      between levels (onFocus of any fh input clears error if `fhError.level !== this level`).
    - `fhF2fFtVals` / `fhF2fInVals` draft maps persist the typed floor-to-floor value; the
      floor-to-floor input does NOT recompute when Fork-1 re-solves the ceiling (sticky draft).
    - `.fh-error` CSS class added to App.css (red, 0.76rem).
  * **3a scope boundary:** this step captures topology/offsets only — NO pixels→real-world XYZ
    coordinate conversion. `floorHeightsRef` stores heights in feet (display unit); coordinate-space
    conversion is deferred to Phase 2.
  * **Datum vs. element framing:** `floorHeightsRef` is the DATUM layer (named reference elevations
    shared across the project). Per-element Z on individual shapes is the ELEMENT layer — deferred
    to Phase 2. Coplanar elements sharing a datum are NOT merged (see ADDITIONAL_FUNCTIONALITY.md #19).
  * **Imperial-only (explicit):** Metric dimension-entry in this panel deferred to a dedicated
    session (see ADDITIONAL_FUNCTIONALITY.md #20). Do not trust the panel for metric projects.

- **R2 coordinate foundation — Path 3 / named seam + vertex factory (Session 18; commits 040e371, 71e01ca):**
  Geometry STAYS STORED IN PIXELS. Meters are a read-time projection through named conversion helpers.
  No coordinate migration, no stored meters, no behavior change — pure refactor establishing the seam R3 will extend.
  * **`pxToMeters(px, pageScales, pageId)` / `metersToPx(m, pageScales, pageId)`** — exported from
    `canvasRenderer.js`; same `(value, pageScales, pageId)` signature as `pxToDisplayDist`. All
    inline px↔meter arithmetic in `pxToDisplayDist`, `snapToGrid`, `applySnap`, `snapPerp`, and
    `commitLabelEdit` now routes through these helpers. `snapIncrementRef` is stored in meters
    (confirmed); `metersToPx` produces the correct snap-pitch in pixels.
  * **`makeVertex(x, y)`** — exported from `geometry.js`; returns exactly `{ x, y }` today, z absent
    (not null). All stored-polygon-vertex construction in App.jsx and geometry.js routes through it:
    `snapToGrid`, `applySnap`, `getAlignmentSnap`, `clampToCanvas`, `insertPt`, `applySegmentMove`,
    `findCollinearOverlap` (P_start/P_end), `linePolyIntersect` (both crossing paths), and all six
    vertex constructions in `splitPolygon`. When R3 adds z, it adds it here and ONLY here.
  * **Path 3 rationale (supersedes 4a/store-meters-natively from Session 17 docs):** Storing meters
    natively would freeze the conversion ratio at storage time; recalibrating a page (or its borrow-
    chain parent) would orphan the stored meters — a data-corruption path that does not exist today.
    Pixels-stored keeps geometry SCALE-INDEPENDENT, which is what makes recalibration robust. Path 3
    is also strictly less machinery. The "operational shared frame" is real: pages share a frame because
    they share calibration scale and ghost-align visually — no explicit geometry composition needed at R2.
    Composing the pageRefParent chain onto stored coordinates is R3 (explicitly NOT built at R2).

- **Wireframe composition seams B1+B2 (Session 27; commit 9e5bd0d):**
  Named functions that project stored pixel coordinates into building-fixed world meters.
  No render change, no behavior change — pure read-time projection seam.
  * **`getWorldOriginM()`** — building-fixed XY origin in meters. Re-derived every call, never stored.
    Finds lowest present floor plan, resolves its scale via `getEffectiveScale` (borrow-safe — never
    reads raw `pageScalesRef.current`), converts all its wall-polygon vertices to meters via
    `pxToMeters({ [pageId]: scale }, pageId)`, returns `{ x: minX, y: minY, originPageId }`.
    Returns null if no calibrated anchor floor is present.
  * **`pageVertexToWorld(v, pageId)`** — projects a canvas-pixel vertex into building-fixed world XY
    in meters. Uses `getEffectiveScale(pageId)` for scale; subtracts `getWorldOriginM()` bbox origin.
    Returns `{ x, y, z: null }` — z stays null until R3 adds it via `makeVertex`. Cross-page alignment
    is IDENTITY: pages share a frame because the user traces over the aligned ghost, baking registration
    at trace time. An explicit offset re-enters `pageVertexToWorld` if that workflow changes (see comment).
  * **`elevYToWorldZ(y, elevPageId)`** — named inverse of `drawElevRefLines` Y→Z formula. Returns world
    Z in meters. `anchorY - y` distance in pixels, divided by `0.3048 × pxPerMeter`, offset by lowest
    floor Z. Returns null if elevation has no own scale, no resolved edge, or fhZStack is empty. Both
    `drawElevRefLines` (draw) and `elevYToWorldZ` (export) implement the same formula — principle 7.3.
  * **`window.__dumpWorld()`** — DEV-guarded console verification tool. Prints world XY for all floor-plan
    wall polygons; Z@anchor for all elevation pages; MISSING scale warnings per page.
  * **`pageRefOffsetRef` does NOT exist.** Canvas-pixel offset approach was tried and removed (wrong unit;
    sheet-size-dependent). Do NOT reintroduce. All cross-page composition happens in meters.
  * **Scale path rule:** both `getWorldOriginM` and `pageVertexToWorld` resolve scale via
    `getEffectiveScale` — never raw `pageScalesRef.current`. Anchor floors can borrow their scale;
    a raw read would return undefined → NaN origin → all vertices poisoned.

- **Wireframe composition seam B3 (Session 28; commit d4e99d8):** Roof-plan pages admitted to
  the existing ghost/borrow path. No new machinery — roof uses the same mechanic as floors.
  * **`getGhostSourcePageId` gate widened** — admits `category === 'roof-plan'` alongside
    `'floor-plan'`. `subLabel` requirement relaxed for roof (it is optional free text, not a required
    known FLOOR_ORDER level). Floors still require a known subLabel.
  * **Fallback parent scan for roof** — `currentFloorIdx` set to `floorOrder.length` (above all
    known floors) so the downward scan finds the highest floor with locked shapes. Same loop body
    as floors; no new code path.
  * **Scale borrow** — roof resolves `getEffectiveScale` via `pageRefParentRef` chain identically to
    floors. Confirm-alignment writes `pageRefParentRef[roofPageId] = ghostSrc`; `getEffectiveScale`
    recurses to the calibrated floor parent. No roof-specific transform offset (B1 meters-composition
    + trace-over-aligned-ghost identity applies unchanged).
  * **`__dumpWorld()` extended** — new roof-plan block prints world XY for locked roof wall polygons;
    reports `[confirmed]` vs `[NOT confirmed — borrow not active]` so fixture-gap state is visible.
  * **Verified:** with roof page confirmed-borrowed to floor parent, `__dumpWorld` reported
    `pxPerMeter=59.08 [confirmed]` (was MISSING before). Roof had no locked polygons in fixture;
    borrow-chain plumbing proven end-to-end.
  * **Eave projection / roof Z deferred to B4** (needs planning pass first — see notes below).

- **Elevation PDF spatial work — Pieces 1+2 (Step 8 spatial, Session 19; commits 89b7ba2, 2007265):**
  Two-piece interaction for aligning elevation PDFs to floor-plan geometry.
  * **Piece 1 — "Set elevation edge" mode (commit 89b7ba2):** Elevation pages get a "Set elevation
    edge" button. Mode shows the floor-plan ghost; user clicks any ghost edge to designate it as the
    horizontal reference. Stored as `elevationEdgeRef.current[elevPageId]` (authoritative shapeIndex +
    segmentIndex indices; endpointA/B are staleness-check snapshots — same pattern as `frontFace`).
    Purple edge highlight. Multiple floor-plan candidates shown in a selector. Gated to Elevation pages.
  * **Piece 2 — "Align elevation" mode (commit 2007265):** Visible on Elevation pages that have a
    stored edge (disabled with title hint otherwise). Entering the mode draws a temporary padded bbox
    around the two edge endpoints, with four amber corner handles. Body-drag translates; corner-drag
    scales uniformly around the diagonally-opposite corner — identical math to floor-reference align
    (`newS = startS * (d1/d0)`, anchor-preserving tx/ty). Zoom/pan active during align.
    "Confirm alignment" stores the elevation's OWN `pageScalesRef` entry: pxPerMeter derived from
    `elevPixelLen / realLenMeters` (both measured in the shared canvas coordinate space). Does NOT
    set `pageRefParentRef` — the elevation is a calibrated peer, independent on later recalibration
    of the source plan (#22 honored). "Exit" dismisses without writing scale. Resets on nav/upload.
  * **Key coordinate-space invariant:** The PDF's `{tx,ty,s}` transform is VISUAL ONLY — it repositions
    the backdrop image and does not affect the canvas coordinate space where geometry is drawn. After
    correct alignment both the ghost and the elevation PDF's features are co-registered in the same
    canvas-world coordinate space, so `pxPerMeter` equals the source plan's `pxPerMeter`. See also the
    Design notes coordinate note below.

- **Elevation PDF spatial work — Piece 3 sub-pieces 1+2 (Session 20; commits 1cb2c0b, b597e91):**
  Floor/ceiling reference lines drawn on aligned Elevation pages. Datum-Z only (placement, not
  height-editing — no floorHeightsRef writes).
  * **`drawElevRefLines(ctx)` (sub-piece 1, 1cb2c0b):** stateless helper called at end of all
    canvas redraw paths (`redrawFrontFaceLayer`, `redrawDrawCanvas`, `redrawReviewCanvas`, and all
    five `drawEditCanvas` sub-mode paths — wired into draw/review/edit in Piece 4 sub-piece 1,
    5266dc5). Gate: `resolveElevEdge` non-null + confirmed `pxPerMeter` + `fhZStack.length > 0`.
    Draws teal solid floor lines and amber dashed ceiling lines spanning canvas width. Labels at
    left edge. Line widths zoom-compensated (`/ zoomRef.current`). Anchor Y:
    `elevBaseYRef[pageId] ?? edge-midpoint Y`. Spacing: each line Y =
    `anchorY - (Zfeet - lowestFloorZFeet) × 0.3048 × pxPerMeter`.
    `floorHeightsTick` added to passive-redraw useEffect deps (view, draw, and edit modes) so panel
    edits repaint lines immediately.
  * **`elevBaseYRef` (sub-piece 2, b597e91):** `useRef({})`, keyed by pageId. Stores the user-placed
    anchor Y for the stack after a base-line drag. Drag hit-test: within `8 / zoom` px of the base
    (lowest present level) floor line in view mode intercepts mousedown before pan; `alignDragRef`
    reused with `mode: 'elevBase'`, vertical-only (`dy = (clientY - startClientY) / zoom`). Writes
    `elevBaseYRef[pageId] = startBaseY + dy` on every mousemove; calls `redrawFrontFaceLayer`
    directly (no tick bump needed). Mouseup clears `alignDragRef`. Persists across page-nav;
    cleared on PDF upload. No new React state.

- **Elevation Piece 4 sub-piece 1 (Session 21; commit 5266dc5):** closed-polygon tracing + full
  edit suite enabled on Elevation pages. `drawElevRefLines` wired into `redrawDrawCanvas`,
  `redrawReviewCanvas`, and all five `drawEditCanvas` sub-mode paths so reference lines remain
  visible during draw and edit. `floorHeightsTick` added to draw/edit passive-repaint deps.
  The elevation outline uses the standard closed-polygon workflow (trace → close → review → confirm
  → lock → Edit Shapes) with NO category fork — the existing machinery works on Elevation pages
  directly. Decision: closed polygon (not open polyline) is the correct primitive for elevation
  outlines (same as floor plans). Browser-verified.

- **Dev-only test fixture (Session 21; commit 21a967c):** `window.__snapshotFixture()` /
  `window.__restoreFixture(obj)` exposed in the component render body, DEV-guarded
  (`import.meta.env.DEV`). Snapshot captures all scenario-defining refs and state (shapes,
  scales, page categories, pageIdMap, transforms, floor heights, elevation edge, frontFace,
  compass, primaryReferenceId, roofGraph, etc.); excludes non-serialisable `Set` and ephemeral
  mode flags. Restore writes all refs, resets ephemeral modes, then triggers React state cascade
  and re-renders the target page from the bundled PDF. Bundled PDF path:
  `public/devFixtures/test-fixture.pdf` — **gitignored; never committed; drop real test PDF there
  on a fresh clone.** Save/Load buttons ARE LIVE (DEV-guarded strip; see #31). Production
  tree-shakes the entire block.
- **Golden sidecar + `__verifyFixture()` (Session 42; commits 688f8aa, e1a3215; sidecar
  re-frozen Session 43 commit 6d849f1):**
  `public/devFixtures/fixture-elevation.json` is the authoritative multi-floor scenario fixture
  (page-2=elevation, page-3=Crawlspace, page-5=Main Floor, page-7=roof; 5 shapes including a
  window 0.381×0.5588m and door 0.762×1.7272m on page-2 — hand-placed, empty labels — both
  associating to `wall-sh-1-seg2-Main_Floor`). `public/devFixtures/fixture-elevation.expected.json`
  is the frozen golden sidecar (wallSurfaceCount, gross/net/openingTotalM2, soffitCount,
  windowCount, doorCount, subtractionSurface id/areas, assemblyCheck; tolerance ±0.0001m²).
  `window.__verifyFixture()` async DEV fn (after `__dumpEnumeration` in the DEV block):
  fetches the sidecar, runs checks (a)-(k) + partition invariant for all wall surfaces, prints
  `[verify] pass` / `[verify] FAIL` per check, prints closure-check SKIPPED (#87 gated), prints
  final `✓ ALL N checks PASSED` or `N/M checks FAILED`. Checks (j) effectiveUValue and (k)
  thicknessM are the assembly-attach checks added Session 43. Run after restoring
  fixture-elevation.json to verify end-to-end. The harness existing removed one stated blocker
  of #28, but #28 (plan reader) remains gated on the post-3D-model deep-review waypoint.

- **Elevation Piece 4 sub-piece 2 (grade line) piece 1 (Session 22; commit 3fae81b):**
  Open-polyline grade / soil line tool on Elevation pages.
  * `shapeKind: 'grade-line'` field on grade-line entries — absent = closed wall polygon (no
    migration of existing shapes). Seven code sites discriminate: `drawLockedShapes` /
    `drawGhostShapes` skip grade-line entries; `hitTestSegments` / `hitTestShapeBody` skip them;
    `getEligibleShapes` excludes them; all 5 edit sub-mode forEach loops skip them.
  * `drawGradeLineShapes(ctx, completedShapes, pageId)` in canvasRenderer.js: draws open
    polylines, green (#16a34a) dashed (8/4), vertex dots, no closePath. Wired into all 13
    render paths.
  * On closure of a wall polygon on an Elevation page: "Trace grade line?" prompt (Yes/No).
    Yes → `gradeLinePending`; after polygon confirm → `gradeLineDrawing` activates.
    Wall polygon is NEVER split, modified, or tagged.
  * Grade-line draw mode: reuses `drawVerticesRef` + existing snap; close-snap ring
    suppressed; finish via Enter or "Finish grade line" button (min 2 vertices).
  * Stored as `{ vertices, pageId, status:'locked', shapeKind:'grade-line' }` via makeVertex, no Z.
  * States `showGradeLinePrompt`, `gradeLinePending`, `gradeLineDrawing` — all reset on
    page-nav, PDF upload, exitDrawMode, discardShape.
- **Elevation Piece 4 sub-piece 2 piece 2 — finish-anywhere + snap-as-aid (Session 24; c7a2092):**
  Endpoint-binding requirement reverted as wrong abstraction. Grade line finishes with ≥2 vertices
  ANYWHERE (corner, floor line, or open space). Trigger: real grade line ended in open space between
  two building masses — binding gate blocked a valid drawing. A1 model and 2b/2c/2d/2e sequence
  superseded; old 2e (follow-on-edit) is moot.
  * `getWallVerticesWithId(pageId)` + `gradeEndSnapRef`: corner snap remains as POSITION AID —
    vertex lands on corner, nothing recorded. Normal polygon start-snap unchanged.
  * `getLowestFloorLineY()` + `gradeFloorLineSnapRef`: floor-line snap remains as POSITION AID —
    vertex Y snaps to lowest-floor reference line Y, nothing recorded. Corner takes priority.
  * `commitGradeLine`: gate = `verts.length >= 2` only. Shape written as piece-1 shape:
    `{ vertices, pageId, status:'locked', shapeKind:'grade-line' }` — NO `boundStart`/`boundEnd`.
  * Above/below-grade meaning = read-time intersection against intact wall polygon (#41, R3).
    No stored binding needed. This is the sole model.
- **Elevation Piece 4 sub-piece 2 piece 3 — Redraw grade line (Session 25; e9c04a6):**
  Toolbar button visible only when `isElevationPage && gradeLineOnPage && !anyActiveMode`.
  * `gradeLineOnPage = lockedShapesOnPage.some(s => s.shapeKind === 'grade-line')` — derived
    alongside `hasSlopedOnPage` from the existing `lockedShapesOnPage` read.
  * On click: filters `completedShapesRef` removing all `{ pageId === currentPageId && shapeKind === 'grade-line' }` entries, repaints immediately, then calls `setDrawMode(true)` + `setGradeLineDrawing(true)` (same entry point as `confirmShape` after the on-closure prompt).
  * No confirm dialog, no vertex editing, wall polygon untouched. Existing `commitGradeLine` + snap-as-aid + finish-anywhere unchanged. Browser-verified (Session 25).

- **Windows/doors placement layer — Pieces 1+2 (Session 26):**
  * **Stable shape IDs:** `shapeIdCounterRef` (monotonic `useRef(0)`) + `nextShapeId()` helper assign `id: 'sh-N'` to every shape at creation — `confirmShape`, `commitGradeLine`, `confirmRoofShape`, and `confirmOpening` all call `nextShapeId()`. Counter cleared on PDF upload. IDs are in-memory stable identity; not persisted across reloads. Future component-instance model (#44) can key on this.
  * **`shapeKind: 'window'|'door'` discriminator:** added alongside `'grade-line'`. Absent = closed wall polygon (default; no migration of existing shapes). `isOpening(s)` helper (`s.shapeKind === 'window' || s.shapeKind === 'door'`) used at all discrimination sites in both App.jsx and canvasRenderer.js.
  * **`OPENING_TYPES`:** module-level array `['Tilt-turn', 'Casement', 'Fixed', 'Slider', 'Hinged door']`; UI dropdowns derive from this; edit the list here to add/remove types.
  * **`dimensionBasisRef`:** project-level `'frame'|'rough-opening'|null`; `null` until set. Set once via first-use gate on first opening placement for the session; persists across page navigation; cleared on PDF upload. Never re-prompted once set for that session.
  * **"Place opening" toolbar button:** visible when `isElevationPage && pageHasScale && !anyActiveMode`. On click: calls `saveAndDefaultSnapIncrement()` then enters `placingOpeningMode`.
  * **Two-click free rectangle:** first click sets `openingCorner1`; second click completes. `makeRectVerts(c1, c2)` builds a 4-vertex CW rectangle from the diagonal corners. `applySnap` called with `useAngle=false` at both clicks and in the rubber-band mousemove — free rectangle, no 45° axis constraint. Distance-grid snap active.
  * **First-use dimension-basis gate:** if `dimensionBasisRef.current` is null when the second click lands, `openingDraftShape` is stored with `pendingBasis: true` and the "Frame Size or Rough Opening?" modal shows before the opening dialog.
  * **Opening dialog:** Kind radio ('window'|'door'), Type dropdown (`OPENING_TYPES`), Width/Height ft+in entry (seeded from pixel distance via `openOpeningDialog`), Label text field, Confirm/Cancel. `parseFtIn(ftStr, inStr)` converts to meters for storage.
  * **`confirmOpening`:** pushes `{ id, vertices, pageId, status:'locked', shapeKind:kind, openingType, label, widthM, heightM, dimBasis, uw:null, shgc:(kind==='door'?0:null) }` to `completedShapesRef`; restores snap increment; repaints via `redrawFrontFaceLayer(null)`.
  * **`discardOpening`:** clears draft state, restores snap increment, calls `redrawFrontFaceLayer(null)` — canvas repaints immediately, preventing the rubber-band rectangle from lingering after Cancel.
  * **Rendering:** `drawOpeningPoly(ctx, verts, style)` in canvasRenderer.js — teal fill/stroke (rgba(6,182,212) / `#0891b2`), same style-switching interface as `drawShapePoly`. `drawOpeningShapes(ctx, completedShapes, pageId)` draws all locked openings on a page. Both wired into all render paths (view, draw, review, all five edit sub-modes).
  * **`drawLockedShapes` / `drawGhostShapes`:** both skip openings via `isOpening(shape)`. Openings never appear as ghost reference on adjacent floors.
  * **Edit Shapes compatibility:** openings ARE included in segment drag, vertex drag, move sub-mode, and delete sub-mode (same logic paths as wall polygons, rendered via `drawOpeningPoly`). Openings are EXCLUDED from: split hit-test (`hitTestShapeBody` in split click guards `&& !isOpening(...)`); combine eligibility (`getEligibleShapes` excludes `shapeKind === 'window'` and `'door'`).
  * **1" snap default on placement and edit:** `saveAndDefaultSnapIncrement()` saves `priorSnapIncrementRef.current` and sets `snapIncrementRef`/`snapIncrement` to `ONE_INCH_M = 0.0254m`. Called on "Place opening" entry and on "Edit Shapes" entry when the page has any locked opening. `restoreSnapIncrement()` restores the prior value on both `discardOpening`/`confirmOpening` (placement) and `exitEditMode` (edit).
  * **Persistent top-bar snap selector:** single `<select className="snap-increment-select">` in the `.toolbar` div, always visible when `currentPage && pdf`. `disabled={!pageHasScale}` (greyed with tooltip when no scale). Options resolve imperial/metric from `getEffectiveScale(currentPageId)?.displayUnit`. onChange calls `redrawDrawCanvas` in draw mode, `drawEditCanvas` in edit mode. All prior in-toolbar selector instances removed — exactly one selector project-wide.

- **Run paths — §8.2 step 4 (Session 34; commit 6d3dc3c):** Endpoint-derived open polylines connecting placed equipment items.
  * **`RUN_PAIR_MAP`** — module-level unordered pair→category table. Seed entry: `{air-handler, outdoor-unit} → lineset`, satisfying `lineset-endpoint` (air-handler side) and `lineset-to-handler` (outdoor-unit side). Adding a run type = one data row (principle 5.3, no engine change).
  * **`resolveRunPairEntry(typeA, typeB)`** — pure lookup; unordered match.
  * **Storage:** `shapeKind: 'run'` in `completedShapesRef` (grade-line precedent). Fields: `{ id, shapeKind:'run', vertices, pageId, status:'locked', endpointItems:{start,end}, category }`. Vertices via `makeVertex` (pixels, recalibration-independent).
  * **Persisted uncharacterized state (new model — no prior precedent):** A run commits to storage immediately in deliberately-incomplete state. Resting states: grey dashed (loose ends OR unmapped pair), solid category-color (both ends match map entry). Survives page-nav and reload.
  * **Endpoint binding at commit time** — fresh `findEquipSnapTarget` proximity check when "Finish run" fires; Z-undo-safe.
  * **`buildCharacterizedRun(run, currentShapes)`** — immutable; resolves pair map; writes `obligationState[obligationId] = runId` on BOTH endpoint items; returns `{run: finalRun, updatedShapes}`.
  * **`clearRunSatisfaction(run, currentShapes)`** — immutable reversal; called on run delete and on equipment-item delete (connected runs lose characterization, surviving endpoint obligations reversed).
  * **Draw interaction:** "Draw run" button (floor/roof pages, confirmed scale, no other active mode); finish-anywhere ≥2 vertices; purple ring on equipment-item hover (`runItemSnapRef`); wall-vertex snap suppressed; close-snap suppressed.
  * **Delete sub-mode:** `wasRun` branch reverses characterization; `wasEquipment` branch reverses all connected characterized runs. `worklistTick` bumped for either.
  * **Exclusions:** runs excluded from `hitTestVertices`, `hitTestSegments`, `getEligibleShapes`, all 5 `drawEditCanvas` forEach loops, `drawLockedShapes`, `drawGhostShapes`. Run segment proximity added to `hitTestShapeBody`.
  * **`drawRunPaths(ctx, completedShapes, pageId)`** — exported from canvasRenderer.js; wired into all 14 render paths.
  * **Worklist:** run obligations with `satisfiedValue !== null` show "✓ Connected" (green).
  * **`deriveWireframe`:** `runLines` array added; scalar Z from `zStack.floorZ` (floor) or `roofZFallback` (roof).
  * **ThreeDView.jsx:** `runLines` rendered by category (grey = uncharacterized, amber = lineset); legend entries added.
  * **Fenced (#64–68):** envelope-crossing detection, multi-hop cascade, slope/per-vertex Z, conflict checks, role-wiring.

- **§8.3 Build 1 — run slot storage shape (Session 35; commits 7c921ff, 607f6be, 2feb3e5):** Run shapes now carry
  THREE co-present layers:
  * `vertices: [{x,y}]` — raw geometry for uniform iterators (no shapeKind guard on many call sites; dropping this layer crashes them)
  * `pointSlots: [{id:'ps-N', x, y, itemRef:string|null}]` — identity + endpoint-binding layer, one per vertex
  * `spanSlots: [{id:'ss-N', category:string|null}]` — characterization layer, one per consecutive vertex pair
  * **Invariant:** `vertices[i].x === pointSlots[i].x && vertices[i].y === pointSlots[i].y` for all i. Verified by `window.__dumpRuns()`.
  * `psCounterRef` / `ssCounterRef` monotonic counters; `nextPsId()` / `nextSsId()` helpers; cleared on PDF upload.
  * `buildCharacterizedRun` uses `pointSlots` for itemRef binding; `clearRunSatisfaction`, `hitTestShapeBody`, delete sub-mode all updated.
  * `deriveWireframe` runLines reads `run.pointSlots[i]` for XY.
  * `__restoreFixture` defensive skip drops pre-Build-1 runs (no `pointSlots`).
  * **Build 1 regression lesson:** dropping `vertices` broke 10+ uniform iterators with no shapeKind guard. Fix = add a layer, never replace raw geometry. Storage-shape changes must be additive.

- **§8.3 Build 2 — profile table + derived solids (Session 35; commits a961430, cba3932):**
  * **Profile table (module-level constants, base-case v1):** `SEGMENT_PROFILES` (lineset → `{sweep:'extrude-circle', diameterM:0.025}`, duct → `{sweep:'extrude-rect', widthM:0.150, heightM:0.150}`), `SEGMENT_PROFILE_FALLBACK`, `POINT_PROFILES` (air-handler/outdoor-unit/bath-fan/hrv-unit block dims). Comment: "BASE-CASE CONSTANTS. v1 placeholder dimensions. A later config-driven size layer replaces these reads at this seam (principle 5.2); do not hardcode these numbers anywhere else."
  * **`deriveWireframe` extended:** returns `solids:[]` alongside existing keys. One `{kind:'cylinder', from, to, radiusM, color}` per spanSlot per run; one `{kind:'block', center, wM, dM, hM, color}` per placed equipment item. Pure parameter objects; no three.js in the derive fn. Z resolution for equipment is the identical 4-line scalar-Z lookup used by runLines. Equipment block `center.z = equipZ + hM/2` so block sits ON the level.
  * **ThreeDView two-effect architecture:** main effect (dep `[wireframe]`) builds scene, renders all meshes (including solids), stores solid `THREE.Mesh` objects in `solidMeshesRef`. Toggle effect (dep `[showSolids]`) only flips `.visible` on stored meshes — camera, controls, and all other scene objects completely untouched on toggle.
  * `MeshBasicMaterial` (no scene light required), `opacity:0.45`, `side:DoubleSide`. Cylinder via `CylinderGeometry`, oriented by `Quaternion.setFromUnitVectors(yAxis, dir)`.
  * Solids toggle button (`Solids ✓` / `Solids`) in header; equipment `■` legend entry (purple 0x8b5cf6); `window.__dumpSolids()` DEV hook.
  * Lineset tube r=12.5mm is correct-but-small (honest 1" placeholder). Display-scale option deferred (#70). Duct profile present, no pair-map entry yet (#71).

- **Session 36 Beat 1 — opening storage fix + 3D loop + Envelope panel (#55 + #52; commits 961d098, 7d939c3):**
  * **Storage fix (961d098):** `confirmOpening` was discarding user-entered dimensions after sizing the pixel
    rectangle — `widthM`/`heightM` were never stored; `openingLabel` stored but `op.label` read by both consumers.
    Fix: capture `storedWidthM`/`storedHeightM` from `parseFtIn` before vertex resize; store as `widthM`/`heightM`;
    rename field to `label`. This was the first live execution of `deriveWireframe` openingLines and
    `deriveEnumeration` STEP D. Browser-verified: real values in dump + orange rectangle in 3D View (#55 done).
  * **Envelope panel (7d939c3):** `showEnumeration` + `enumerationTick` state; `deriveEnumeration()` hoisted out
    of the `if (import.meta.env.DEV)` guard into component render scope (was inaccessible from JSX);
    `window.__dumpEnumeration` re-wrapped in a new DEV guard. Panel groups by kind (Wall Surfaces / Soffits /
    Windows / Doors); named fields per element (width, height, Z, bearing, reconcile tag with color); no
    recomputation in panel (§7.3 honored); empty state message. `enumerationTick` bumped on shape lock/delete,
    floor-height writes, and page nav. Browser-verified: 13 elements match `__dumpEnumeration()` (#52 done).
    NOTE: originally at `right:900px` as a standalone overlay; now housed in the consolidated side-panel
    container (#69 — Session 40). The `showEnumeration` derived flag and panel JSX are unchanged.
  * **Envelope area slice (Session 41):** `grossAreaM2`, `netAreaM2`, `openingAreaM2`,
    `associatedOpeningIds`, `openingOverflow` added as named fields on every `wall-surface` element
    in STEP A. Opening→wall-surface association built via `openingsByWallId` map (keyed by wall-surface
    `id`), populated before STEP A by reading `elevationEdgeRef` for each elevation page — each
    elevation's reference edge identifies the specific `(shape.id, segmentIndex, floorLevel)` triple
    that owns all openings on that elevation page. `grossAreaM2 = widthM × heightM` (null if no floor
    height). `netAreaM2 = max(0, grossAreaM2 − openingAreaM2)`. `openingOverflow: true` if openings
    exceed gross. `__dumpEnumeration` extended with per-surface partition lines and a summary block
    (PASS/FAIL count). Envelope panel shows area row per wall surface. Browser-verified (10/10 PASS,
    net total = gross total − opening total). Limitation #88: all openings on a multi-story elevation
    associate to the reference-edge floor level only.
  * **Assembly attach slice 1 (Session 43; commit 6d849f1):** Per-surface assembly assignment —
    data layer only (two-tier manual/library resolver). No geometry change.
    - `surfaceAssemblyRef.current[surfaceId]` — keyed by wall-surface id string (e.g.
      `'wall-sh-1-seg2-Main_Floor'`); value `{ tier:'manual'|'library', effectiveUValue:number|null,
      thicknessM:number|null, assemblyId:string|null }`. Cleared on PDF upload.
    - `getSurfaceAssembly(surfaceId)` — resolver in App.jsx; returns the stored entry or null.
      Two-tier: `'manual'` = user-entered U-value + thickness (current fixture); `'library'` =
      resolved from a future assembly-library record (assemblyId non-null). 3D thickness deferred.
    - STEP A of `deriveEnumeration()` extended: each wall-surface element gains `assemblyTier`,
      `effectiveUValue`, `thicknessM` fields from `getSurfaceAssembly`. Null when unset.
    - `__dumpEnumeration` extended with `assembly: [manual|unset] U=... thickness=...` line per
      wall-surface. Golden sidecar extended with `assemblyCheck` block (effectiveUValue, thicknessM).
    - Envelope panel row extended: assembly tier + U-value + thickness per wall surface.
    - CSS: `.asm-row` rule added to App.css for assembly display styling.
    - `__verifyFixture()` extended with checks (j) effectiveUValue and (k) thicknessM. Now 15/15
      checks + partition invariant. Negative control: corrupting U-value → exactly check (j) fails.
    - **Live bug #94:** openings render on wrong side of wall in 3D View (see Known issues).

  * **Assembly attach slice 2 (Session 45; commit 6dab52d):** Contract ingest + library-tier
    resolver (geometry-scoped fields only). No visual/3D change (walls remain zero-thickness planes).
    - **`assemblyLibraryRef`** — `useRef({})` keyed by `assemblyId`; value is geometry-scoped
      contract record `{ assemblyId, label, assemblyType, totalThicknessM, layers[] }`.
      Cleared on PDF upload alongside `surfaceAssemblyRef`. NOT in snapshot/restore (session-level only).
    - **`ingestAssembly(record)`** — stores geometry-scoped fields from a contract-shaped record
      (contract at `C:\dev\assemblylibrary\ASSEMBLY_CONTRACT.md`, separate repo).
      Per layer: `layerId`, `materialId`, `thicknessM`, `pathRole`. Silently ignores deferred fields:
      `effectiveUValue`, `effectiveRSI`, `framing`, `controlLayers`, `airFilms` — forward-compatible
      with Assembly Builder Part 3 in-flight.
    - **`getSurfaceAssembly` extended** — library tier resolves `assemblyId` against
      `assemblyLibraryRef`: `{ thicknessM: totalThicknessM, layers, source:'library' }` on hit;
      `{ source:'library-unresolved', thicknessM:null, layers:null }` on miss. No crash.
      All return paths now include `layers` field (null for manual/unset).
    - **`window.__ingestAssembly(record)`** — DEV injection path (second DEV block);
      logs record summary + per-layer detail. Tree-shakes from prod.
    - **Deferred:** `effectiveUValue`/`effectiveRSI` ingest (Part 3 in-flight), 3D wall thickness.

- **3D wall-panel render — thickness slice (Session 46; commit 8f1dd30):**
  Wall surfaces with a library-tier assembly now render as solid panels in ThreeDView.
  - **Growth direction:** `assemblyType === 'wall'` → grows inward (into footprint);
    horizontal types → grows outward. Convention: traced line = structural outside face.
  - **`totalThicknessM`** from `assemblyLibraryRef` drives panel depth.
  - **`insideFaceAreaM2`** added as a named field on every wall-surface element in
    `deriveEnumeration()` STEP A. Not yet consumed downstream — F280 consumes next chat.
  - **Layer-by-layer band rendering deferred** (only total-thickness solid built now).
  - **TDZ fix:** `const solids = []` was declared at ~line 4370 but first used at ~line 4177
    (wall-panel push). Moved to immediately after `const floorRings = []` (~line 4132).
    The throw was caught at React's event boundary, silently preventing 3D View from mounting
    on first load. 17/17 harness PASS; Ben confirmed inward growth on `wall-sh-1-seg0-Main_Floor`.

- **F280 climate input slice (Session 54; commit e7a52bf):** prerequisite data layer for the F280
  conductive heat-loss endpoint — `resolveEffectiveConfig().toh` now available.
  * **`src/data/f280-weather.json`** — 679 stations, national coverage (all 13 provinces/territories).
    Extracted from `C:\dev\CSA_F280-12\F280_Weather.xls` (encrypted) via Excel COM. Fields per entry:
    `station`, `region`, `dhdbt` (=Toh), `dcdbt`, `degday`, `strange`, `ohr`, `dgtemp`, `janWind`,
    `julWind`, `monthlyTemps[12]`, `lat`, `lng`. Encrypted .xls NOT in repo — only the derived JSON.
  * **Two new CONFIG_FIELDS in 'Climate' category:**
    `location-station` (select, 679 options, value = `"station|||region"` composite — province-disambiguated;
    multiple cities share a name across provinces e.g. Richmond BC and ON); `toh-override` (kind:'number',
    allows negatives, step=0.5, null when empty). New `kind:'number'` render branch added to Project Setup
    panel JSX (before existing `kind:'count'` branch).
  * **`resolve-toh` cross-field rule** in `CONFIG_CROSS_FIELD_RULES`: override wins if non-null/non-NaN;
    else register lookup by composite key; else null. `toh` is DERIVED — never stored as raw intent.
    `getConfigValue` returns raw; `resolveEffectiveConfig` returns resolved. Two honest truths.
  * **`window.__verifyToh()`** DEV-block check — 6 assertions (count, Vernon dhdbt, Victoria
    disambiguation, station→toh, override wins, null fallback); all 6 PASS. Tree-shakes from prod.

- **F280 above-grade conductive endpoint (Session 56; DONE):**
  * **`F280_TI_HEATING = 22`** (module-level const, °C; hardcoded — see #106 for future config field).
  * **`deriveF280Heating(enumeration, resolvedConfig)`** — pure, derive-on-demand. No-climate guard
    (returns `{status:'no-climate'}` if `toh===null`). Four surface kinds in `bySurfaceKind` map
    (`'wall-surface'` / `'flat-roof-surface'` / `'window'` / `'door'`). Surfaces missing U-value:
    `unresolvedCount++`, area counted, no silent zero. `notModeled[]` list makes partial coverage
    explicit: `['below-grade-wall','slab-on-grade','floor-over-unheated','solar-gain']`. Extensible
    spine — adding below-grade/slab/solar = one new bucket + one loop body, no refactor.
  * **F280 Results sidebar tab** — in consolidated side-panel; design conditions + per-kind table +
    amber unresolved-U warnings + kW subtotal + greyed not-modeled list. No-climate guard in JSX.
  * **`window.__dumpF280()`** — DEV console hook; tree-shakes from production.
  * **NOT golden-gated** (deliberate — "nearly compliant, sooner" target).
  * **Strategic pivot (Session 56):** Target is "nearly-compliant full heat loss/gain sooner;
    compliance is a later pass." Building is **PAUSED for a geometry back-to-basics review**.
    Geometry layer (wireframe / enumeration) is layer one; F280 is downstream. No further thermal
    builds start until the geometry model is reviewed and confirmed stable.
  * **Dual-entry UI trap identified:** `CONFIG_FIELDS` `assembly-wall`/`assembly-foundation`/
    `assembly-roof`/`assembly-floor` in Project Setup are NEVER read by `getSurfaceAssembly`.
    Envelope panel per-surface U inputs are the ONLY load-bearing path. Fix scoped as #106.
  * **Near-term thermal arc (all gated on geometry review):** #106 assembly-inheritance fix →
    #107 flat-roof UI gap → #108 window/door uw post-placement edit → below-grade + slab geometry →
    ground-coupled loss (separate engine from above-grade, using supplemental `BasementHLR.xls` /
    `SlabOnGradeHLR.xls` calculators) → solar gain.

- **Page-region model #5 — Fork A verified + Fork B built (Session 59; commit 4928a5a):**
  * **Fork A (commit f41cb7c, Session 58) navigation gate CLEARED** — `currentPageId` (first-class
    state) verified to track correctly across multi-page navigation by both toolbar-arrow and
    sidebar-jump paths in both directions; page-gated toolbar (elevation mode, Draw/Edit/Draw-run,
    scale-gating) updates correctly per page; zero console errors. Verification only, no code.
  * **Fork B — crop-local coordinate frame in `renderPage`.** `pageCropsRef.current[pageId] =
    {x,y,w,h}` (scaled-sheet pixels) is the hot-read store; `pages[i].crop` the serialized mirror.
    When a crop is set, `renderPage` sizes `measureRef` to the crop box (its (0,0) = crop top-left →
    stored geometry is crop-local by construction) and rasterizes the backdrop with a viewport offset
    `(-crop.x*mult, -crop.y*mult)` so the crop maps to canvas (0,0); crop-sized canvas bounds clip the
    rest. **Absent crop = byte-for-byte the previous full-sheet path** (preserved in the `else` branch).
    The crop offset is consumed at rasterization ONLY — never written to `pageTransformsRef`, never
    folded into `getEffectiveScale`, never stored on a vertex; the `pdf-align-layer` user transform
    composes on top unchanged, so recalibration-independence (#22) is untouched. The CSS transform
    stack is unchanged; crop_viewport is the innermost transform realized at the rasterization read.
    `pageCropsRef` resets on PDF upload and round-trips through snapshot/restore.
  * **DEV:** `window.__setCrop(pageId, crop)` writer; `window.__verifyCrop()` — 17 checks (frame
    sizing at three crops incl. a deliberately-wide `cropWide` + cleared, the placed-point
    world-coordinate assertion: traced world coords invariant under crop, AND a rendered-box-aspect
    == bitmap-aspect check per crop — the on-screen layer the inline-style uniform-scale check
    misses; was 10 checks pre-Session-64). Verified: `__verifyFixture` 44/44 (no-crop unchanged) +
    `__verifyCrop` 17/17 + screenshot of offset+clip.
  * **Region auto-fit (Session 64; commits 5468153/cdb5639/9ce66df/ccc45e0):** `renderPage` crop
    branch bakes a `displayScale` into the backdrop CSS dims so a region fills the viewport. Rule:
    **ALWAYS fit-to-HEIGHT** (`displayScale = (innerHeight − 200) / crop.h`, uniform both axes);
    width overflows → `overflow-x:auto` horizontal scroll reaches full width. Companion CSS fix:
    `.canvas-world canvas { max-width: none }` (App.css) exempts the backdrop/overlay from the global
    `canvas { max-width: 100% }` cap that was clamping rendered width and squishing wide regions
    horizontally; full sheets unaffected (inline width = scaled.width ≤ container). Geometry / crop
    offset untouched (#22). See ADDITIONAL_FUNCTIONALITY.md #111 (DONE).
  * **Fork C resolved** (dissolved with Fork A). **Fork D — DONE (commit 579bbf1, Session 60)** —
    categorization handlers rekeyed from `pageNum` to `pageId` (see Fork D notes below).
  * **Crop-carving UI — DONE (commit 8d6e57d, Session 61):** User-facing half of #5. "Add region"
    toolbar button enters carve mode; amber dashed overlay during drag; mouseup commits rectangle
    ≥20×20px as new region-page (`page-N-rK`) with own pageId/crop/category/reference-tree slot.
    Source sheets with regions become carve-surface-only (`currentPageIsSourceSheet` gate suppresses
    Draw/Edit/Set Scale/Categorize and all mode-specific buttons). Sidebar: "(full sheet)" chip on
    source sheet; "Region K of p.N" entries in Unused Pages until categorized.
    `goToRegionPage(pageId)` helper (renamed `goToPageId` in Session 62); `advanceToNextUncategorized` reworked to skip source sheets.
    `__dumpRegions()` DEV helper (partition check + unique-ID summary). Snapshot/restore confirmed.
    Verified: 44/44; canvas resizes to crop dims; sidebar correct; partition check passes.
  * **Region render-identity fix + regionCounter self-heal — DONE (commit ee9427f, Session 62):**
    Closed a render-only cross-bleed (geometry was always safe — `__verifyCrop` 10/10) and a
    restore-then-carve data collision.
    - **`renderPage` is identity-first:** signature is now `renderPage(pdfDoc, pageId, {resizeMeasure})`
      (was `(pdfDoc, pageNum, {…, forPageId})`). The PDF sheet to rasterize is DERIVED from the pageId
      via **`pageNumFromId(pageId)`** (decodes `page-8`→8, `page-8-r2`→8). The lossy
      `forPageId ?? getPageId(pageNum)` resolution is GONE — every caller passes the authoritative pageId,
      so no path can silently resolve a region to its source sheet. `pageNum` now means only "which PDF
      sheet to rasterize," never identity.
    - **`goToPage` + `goToRegionPage` → single `goToPageId(pageId)`** (handles roots and regions uniformly).
    - **Toolbar arrows are region-aware:** `navSet` (pageNums) replaced by `navPages` (ordered LOGICAL
      pages via `orderLogical`, sorted `(pageNum, regionIndexOf)`); `handlePageNav` steps by `navOrderKey`
      (robust even when the current page is a source sheet not in the set). Each region is a distinct stop
      rendering its own cut; source sheets excluded. New helper **`regionIndexOf(pageId)`**.
    - **Snapshot stores `currentPageId`;** restore renders `obj.currentPageId ?? getPageId(obj.currentPage)`
      (decode fallback for pre-region snapshots) — restore can now target a region.
    - **`regionCounterRef` self-heals on restore:** rebuilt from the max existing `-rK` per sheet (it is NOT
      snapshotted), so a carve after restore picks max+1 and cannot collide on an existing `page-N-rK`.
    - Browser-verified: Enhance on a region keeps the cut AND scales resolution (300→600); arrows step each
      region; restore-onto-region renders the region; restore+carve→r3 no collision; calibrating one region
      writes scale to ONLY that region's pageId (no sibling/source leak); `__verifyFixture` 44/44 +
      `__verifyCrop` 10/10 on fresh restore.
  * **Build 2 — carve-on-aligned-elevation: crop∘T⁻¹ + scale propagation (DONE; Session 65; commit e92aae3):**
    Carving a region from an *aligned/scaled* source page now stores a correct raw-sheet crop and arrives
    calibrated. Both changes live in the `handleMeasureMouseUp` carve-commit branch (~line 2087).
    - **Change 1 — crop ∘ T⁻¹:** the carve box is still captured in the source's UNTRANSFORMED canvas-world
      frame (`getCanvasPos`, unmodified). At commit, the source's align transform `T = translate(t)·scale(s)`
      (uniform similarity, `angle≡0`) is folded back out so the STORED crop is a raw-sheet rectangle matching
      what the user visually boxed: `crop = { x:(rx−tx)/s, y:(ry−ty)/s, w:rw/s, h:rh/s }`. Read defensively
      (`tS=(srcT&&srcT.s)?srcT.s:1`, `tTx/tTy ?? 0`) ⇒ un-aligned source = identity = crop stored
      byte-for-byte as before. The fold is consumed at commit ONLY — never frozen into a stored vertex; the
      region's geometry stays crop-local in raw-sheet px (recalibration-independence #22 untouched).
    - **Change 3 — scale propagation ÷s onto the region's OWN pageId:**
      `pageScalesRef.current[newRegionPageId] = { ...getEffectiveScale(sourceId), pxPerMeter: src.pxPerMeter / s }`.
      The `÷s` is geometrically forced and is the SAME `s` change 1 uses: change 1 rescales the region's
      pixel frame by `1/s`, so the source's canvas-world px/m must divide by `s` to live in the region's
      raw-sheet frame — else aligned-source region walls measure by factor s (~1.5×) wrong (silent #22).
      `s=1` (un-aligned) ⇒ carries directly. Lands on the region's OWN pageId — **no `pageRefParentRef`
      write, no borrow chain.** Uncalibrated source ⇒ region left uncalibrated.
    - **`__dumpRegions` extended:** prints each region's `ownScale` (`pageScalesRef`) + `refParent`
      (`pageRefParentRef`) — Build-2 verify aid, DEV-only.
    - **Change 2 DEFERRED** (full-page carve reachability over the negative align overhang —
      ADDITIONAL_FUNCTIONALITY #113). The fixture's aligned page-2 transform is large-negative
      (`tx≈−625.6, ty≈−508.5, s≈1.5017`); covering the negative overhang requires repositioning `measureRef`
      (offset-fold the literal formula doesn't state) + shared layout CSS — surfaced per STOP condition,
      deferred. Carving works correctly across the *reachable* zone today; the top-left overhang is a dead
      zone (not pan). Verification **item 1** (entire-page carve, Ben's eyeball) belongs to #113.
    - Verified on fresh `__restoreFixture`: `__verifyFixture` 44/44, `__verifyCrop` 17/17; two overlapping
      page-2 regions each `crop=(R−t)/s`, `ownScale=76.47=114.83/s`, `refParent=none`, partition unique;
      un-aligned page-3 carve stores identity crop + direct 114.83 scale.

**Not yet built (next increments):**
- **⏸ PLATEAU WAYPOINTS: (a) DONE, (b) DONE.** (a) SIMPLIFICATION PASS — coordinate-layer extraction
  to `src/coords.js` (Session 69; Stages 0–6). (b) ROADMAP RECONCILIATION + gate-rephrasing sweep
  (Session 70) — every deferred register entry retagged with a checkable gate; #110/#115 corrected to
  DONE/RESOLVED; #124 (Enhance-on-carved-region frame break) RESOLVED (commit 19ffd8b); #125 (openings
  don't render on a carved region) logged OPEN, gate-still-real. See BUILD_ROADMAP.md §⏸ and the
  ADDITIONAL_FUNCTIONALITY.md sweep block.
- **Settled near-term sequence (Session 70):** Beat 0 cheap wins (#53, #118, #112) → #29 derived
  elevations → thermal arc (#106/#107/#108, geometry-review gate satisfied). #125 is an OPEN render-gap
  bug, NOT a #29 dependency.
- **#29 (derived elevations)** — derives elevation view from floor-plan edge + accumulateZ, shown for
  confirm rather than freehand-traced; gate lifted (region-pages #5 done + `pageVertexToWorld` projection
  exists).
- **Page-region #5 Fork D — DONE (commit 579bbf1, Session 60):** `recatPageNum` → `recatPageId`
  (state); all confirm/skip handlers rekeyed from `p.pageNum === currentPage` to `p.pageId === currentPageId`.
  `advanceToNextUncategorized` left on pageNum (PDF nav). Multi-crop payoff landed with crop-carving UI.
- Windows/doors Piece 3 (three-layer snap) — off critical path; available when ready
- Windows/doors Piece 4 (dumb duplicate) — off critical path
- B3: widen `getGhostSourcePageId` so Roof Plan pages enter the ghost/borrow path — **DONE (d4e99d8)**
- B4: derivation core — **DONE (Session 30; commit 106d847)**: deriveEnumeration() + projectConfigRef;
  closest-approach reconcile + soffit/eave combine + fenestration Z. Console dump only.
- **Envelope area slice — DONE (Session 41)**: grossAreaM2 / netAreaM2 / openingAreaM2 added as named
  fields on every wall-surface element in deriveEnumeration() STEP A; opening→wall-surface association
  via elevationEdgeRef reference-edge key; per-surface partition assertion in __dumpEnumeration;
  Envelope panel shows gross/net/opening area per wall surface. See #87 (whole-envelope closure
  invariant) and #88 (multi-story elevation opening association) in ADDITIONAL_FUNCTIONALITY.md.
- **§9 project-configuration layer — DONE (Session 32; commits 4cca140, eb82eba, a049854)**:
  Three-piece build; browser-verified. Distinct from B4 `projectConfigRef` (physical-derivation thresholds).
  See "§9 Project-configuration layer" data-structures section below for full detail.
- B5: 3D envelope wireframe — **DONE (Session 31; commits 7c44e24, 622e76d)**:
  ThreeDView.jsx + deriveWireframe(); floor/ceiling rings + verticals + roof ring + soffits + openings;
  lines only (envelope surfaces = B6, deferred #54). Opening 3D render path verified Session 36 (#55 done).
- B6: envelope surfaces (floor/roof/soffit fill + face culling) — deferred (#54)
- Cross-sections (deferred — windows/doors intentionally builds first)
- Slope rules + Z-derivation for roof (needs coordinate model — see #18)
- Primary-reference reassignment UI (primaryReferenceIdRef set-once today; UI to reassign deferred)

See `WIREFRAME_RECON_REPORT.md` for full gap tracking on B-series wireframe composition seams.

**Deferred (shelved, not cancelled):**
- Elevation Piece 3 sub-piece 3: drag individual floor/ceiling lines to edit heights (last-edited-wins) — height editing stays panel-only for now

**Deferred polish items:**
- **Redundant collinear vertex after Combine:** some complex merges leave a
  zero-angle vertex where the splice points coincide exactly with existing
  vertices — cosmetically harmless, no geometry error, but adds a redundant
  node. Future polish pass to detect and remove collinear vertices post-merge.

## Data structures (current implementation)

All page-keyed state is keyed by the stable string `pageId` (e.g. `"page-1"`),
not the numeric `pageNum`. `pageNum` is retained only for PDF.js rendering;
`getPageId(pageNum)` maps between them via `pageIdMapRef`.

**Page ID map** (assigned at PDF load, one per page):
```
pageIdMapRef.current[pageNum] = `page-${pageNum}`   // e.g. 1 -> "page-1"
```

**Polygons, grade-line shapes, and opening shapes (completed shapes):**
```
completedShapesRef.current = Array<{
  id: string,                   // stable 'sh-N' identity (assigned at creation via nextShapeId(); monotonic)
  vertices: [{x, y}],           // canvas-pixel coordinates
  status: 'reviewing' | 'locked',
  pageId: string,               // e.g. "page-1"
  shapeKind?: 'grade-line' | 'window' | 'door' | 'run',
                                // absent = closed wall polygon (default); 'grade-line' = open reference polyline;
                                // 'window'|'door' = opening rectangle; 'run' = open run path (§8.2 step 4)
  // Grade-line shapes carry NO binding fields. Endpoints may be snapped to corners or the
  // lowest-floor reference line as drawing aids, but nothing is stored. Above/below-grade
  // meaning is derived at read-time by intersecting the polyline against the wall polygon (#41).
  // Run paths carry THREE co-present layers (§8.3 Build 1):
  //   vertices[]      — raw geometry for uniform iterators (no shapeKind guard on many call sites)
  //   pointSlots[]    — identity + endpoint-binding layer
  //   spanSlots[]     — characterization layer
  // Invariant: vertices[i].x === pointSlots[i].x for all i. Verified by window.__dumpRuns().
  // endpointItems and category are LEGACY fields — superseded by pointSlots/spanSlots but may
  // linger on old fixture shapes. New code reads from slots only.
  pointSlots?: Array<{ id: string, x: number, y: number, itemRef: string|null }>,
                                // 'ps-N' id; itemRef = 'sh-N' of endpoint equipment item or null
  spanSlots?: Array<{ id: string, category: string|null }>,
                                // 'ss-N' id; one per consecutive vertex pair; category null = uncharacterized
  endpointItems?: { start: string|null, end: string|null },  // legacy; use pointSlots[0].itemRef / pointSlots[last].itemRef
  category?: string|null,       // legacy; use spanSlots[i].category
  // Opening shapes (window/door) carry additional fields:
  openingType?: string,         // from OPENING_TYPES (e.g. 'Casement', 'Fixed')
  label?: string,               // free-text label (e.g. 'W1', user-supplied). Stored as 'label' (NOT 'openingLabel' — old name, removed Session 36)
  widthM?: number,              // overall width in meters — from authoritative user-entered ft+in (parseFtIn); null if no scale at placement
  heightM?: number,             // overall height in meters — same source; null if no scale at placement
  dimBasis?: 'frame' | 'rough-opening', // copied from dimensionBasisRef at confirm time
  uw?: number | null,      // user-facing U-value in W/m²·K (metric); from WEW bridge performance.uw or null
  shgc?: number | null,    // solar heat gain coefficient (dimensionless); windows: bridge value or null;
                           // doors: ALWAYS 0 (opaque-by-model — glazed lights are future parented sub-items, #104)
  // RSI_W is engine-internal only: getRsiW(uw) = 1/uw; never stored. Module-level pure function.
  // Roof-plan pages only (wall polygons, not grade lines):
  roofType?: 'flat' | 'sloped' | null,
  parapetWidth?: number | null,  // inches (always imperial); flat sections only
  lineRoles?: { [segIdx: number]: 'eave' | 'rake' }  // perimeter-edge role map
}>
// NOTE: floorLevel and elevationZ are NOT present on shape objects. Per-element Z
// is deferred to Phase 2 (ELEMENT layer). Floor-level heights live in floorHeightsRef
// (DATUM layer). See ADDITIONAL_FUNCTIONALITY.md #19.
```

**Per-page scales:**
```
pageScalesRef.current[pageId] = { pxPerMeter: number, displayUnit: 'ft' | 'm' }
```

**Page grid origins** (default `{x:0, y:0}` — the absolute Cartesian grid anchor):
```
pageGridOriginRef.current[pageId] = { x, y }
```

**Page categorization:**
```
pages = Array<{
  pageId: string,
  pageNum: number,
  category: string|null,
  subLabel: string|null,       // known floor level or compass direction (required for Floor Plan / Elevation confirm)
  subLabelNote: string|null    // optional free-text note (demoted from primary sub-label for Floor Plans)
}>
```

**Front-face designation:**
```
frontFace = {
  pageId: string,              // anchor-floor page
  shapeIndex: number,          // index into completedShapesRef on that page
  segmentIndex: number,        // edge index within the shape's vertices array
  endpointA: { x: number, y: number },  // staleness sanity-check snapshot
  endpointB: { x: number, y: number }   // authoritative refs are the indices above
} | null
```

**Elevation edge reference** (added Session 19, Piece 1 — per Elevation page):
```
elevationEdgeRef.current[elevPageId] = {
  sourcePageId: string,        // floor-plan page the edge comes from
  shapeIndex: number,          // index into completedShapesRef on sourcePageId (authoritative)
  segmentIndex: number,        // edge index within shape's vertices array (authoritative)
  endpointA: { x, y },        // staleness sanity-check snapshot
  endpointB: { x, y }
}
// Resolved live via resolveElevEdge(pageId) before any use.
// Cleared on PDF upload.
```

**Elevation base-line placement offset** (added Session 20, Piece 3 sub-piece 2 — per Elevation page):
```
elevBaseYRef.current[elevPageId] = number  // canvas-pixel Y of the placed base line anchor
// Absent until user drags the base floor line. Falls back to edge-midpoint Y when absent.
// Persists across page navigation; cleared on PDF upload.
// Datum-Z only: stores placement position, NOT any floorHeightsRef value.
```

**Per-page PDF alignment transforms** (written by sub-step 2 align interaction; `confirmed` added by sub-step 3):
```
pageTransformsRef.current[pageId] = {
  tx: number,        // horizontal translate in canvas pixels
  ty: number,        // vertical translate in canvas pixels
  s: number,         // uniform scale multiplier (1 = no scale)
  angle: number,     // rotation in degrees (reserved; always 0 until sub-step 2 rotation built)
  confirmed?: boolean  // true once user clicks "Confirm scale & alignment"; enables scale-borrow
}
```

**Per-page region crop** (Fork B / #5; added Session 59):
```
pageCropsRef.current[pageId] = { x, y, w, h }  // RAW-SHEET pixels (the region's measureRef unit)
// Hot-read store for renderPage (useCallback []; ref read is stale-closure-safe).
// pages[i].crop is the serialized mirror (UI/snapshot). Absent ⇒ renderPage uses the full sheet.
// Consumed ONLY at backdrop rasterization (viewport offsetX/offsetY = -crop.x/.y * mult) and to
// size measureRef/canvasRef to the crop box. NEVER written into stored geometry, pageTransformsRef,
// or getEffectiveScale — the crop offset is passive/visual and never frozen (recalibration-indep #22).
// Cleared on PDF upload; round-tripped through __snapshotFixture/__restoreFixture (obj.pageCrops).
// Build 2 (Session 65): the crop stored at carve time is the RAW-SHEET rectangle T⁻¹(boxed canvas-world
//   region) = (R−t)/s, where T = the SOURCE page's pageTransformsRef align transform (un-aligned ⇒
//   identity ⇒ R unchanged). So crop is in raw-sheet px = the region's own measureRef frame. A region
//   carved from an *aligned* source also gets pageScalesRef[regionId] = source pxPerMeter ÷ s at commit
//   (same s) so its scale lives in that raw-sheet frame. See carve-on-aligned-elevation Build 2 above.
```

**Stable shape identity counter** (added Session 26):
```
shapeIdCounterRef.current = number  // monotonic counter; nextShapeId() returns 'sh-N' and increments
// Cleared on PDF upload. Every shape in completedShapesRef carries id: 'sh-N'.
```

**Run slot identity counters** (added Session 35 — §8.3 Build 1):
```
psCounterRef.current = number  // nextPsId() returns 'ps-N'; one per run vertex (pointSlot)
ssCounterRef.current = number  // nextSsId() returns 'ss-N'; one per consecutive vertex pair (spanSlot)
// Both cleared on PDF upload.
```

**§8.3 Profile table** (added Session 35 — §8.3 Build 2; module-level constants in App.jsx):
```
SEGMENT_PROFILES[category] = { sweep: 'extrude-circle'|'extrude-rect', diameterM?, widthM?, heightM? }
  // Keyed by RUN_PAIR_MAP category string. 'duct' entry present, no pair-map entry resolves to it yet (#71).
SEGMENT_PROFILE_FALLBACK = { sweep: 'extrude-circle', diameterM: 0.025, fallback: true }
  // Used when spanSlot.category is null or unknown.
POINT_PROFILES[itemType] = { sweep: 'placed-block', wM, dM, hM }
  // Keyed by equipment itemType string.
// BASE-CASE CONSTANTS. Config-driven size layer replaces reads at this seam (principle 5.2).
```

**deriveWireframe solids return** (added Session 35 — §8.3 Build 2):
```
// Returned as solids:[] alongside floorRings/roofRing/soffitLines/openingLines/runLines.
// Never stored; recomputed each call.
{ id, kind:'cylinder', from:{x,y,z}, to:{x,y,z}, radiusM, color }   // extrude-circle → span solid
{ id, kind:'box-swept', from:{x,y,z}, to:{x,y,z}, widthM, heightM, color } // extrude-rect → span solid
{ id, kind:'block', center:{x,y,z}, wM, dM, hM, color }             // placed-block → equipment solid
// color is a hex integer (0xf59e0b amber, 0x9ca3af grey, 0x6b7280 dark-grey, 0x8b5cf6 purple).
// Z is scalar (same floor/roof Z as runLines). Equipment block center.z = floorZ + hM/2 (sits ON level).
```

**Dimension-basis setting** (added Session 26, opening placement):
```
dimensionBasisRef.current = 'frame' | 'rough-opening' | null
// Project-level (not per-page). null until first opening placement for the session.
// Set once via first-use modal; never re-prompted. Cleared on PDF upload.
```

**Assembly library** (added Session 45 — geometry-scoped ingest, slice 2):
```
assemblyLibraryRef.current[assemblyId] = {
  assemblyId:      string,         // stable unique id (from contract)
  label:           string | null,  // human name
  assemblyType:    string | null,  // 'wall'|'roof'|'floor'|'foundation'
  totalThicknessM: number | null,  // sum of real layer thicknesses (metres)
  layers: Array<{
    layerId:    string | null,  // stable id within the assembly
    materialId: string | null,  // catalogue pointer
    thicknessM: number | null,  // metres
    pathRole:   string | null,  // 'continuous' | 'framed'
  }>,
}
// Cleared on PDF upload. NOT included in __snapshotFixture/__restoreFixture (session-level only).
// Deferred fields NOT stored: effectiveUValue, effectiveRSI, framing, controlLayers, airFilms.
// ingestAssembly(record): public API for writing — silently ignores deferred fields.
// window.__ingestAssembly(record): DEV injection path (second DEV block), tree-shakes from prod.
// getSurfaceAssembly resolution: tier:'library' → hit → source:'library', thicknessM from totalThicknessM;
//   miss → source:'library-unresolved', thicknessM:null, layers:null. No crash on miss.
```

**§9 Project-configuration layer** (added Session 32; commits 4cca140, eb82eba, a049854):
DISTINCT from B4 `projectConfigRef` (which holds physical-derivation thresholds and is NOT reset on upload).

**Cross-field config resolver (added Session 37; commit f5553fa):**
- `CONFIG_CROSS_FIELD_RULES` — module-level array of `{id, when(raw), apply(raw)}` rule objects.
  Hand-authored rule set (forward-proofs #74 data-driven layer — replace contents only, consumers untouched).
  Current rule: `heat-pump-ducted-implies-cooling` (space-heating === 'heat-pump-ducted' AND cooling null → effective cooling = 'heat-pump-ducted').
- `resolveEffectiveConfig(rawValues)` — pure module-level function; takes `projectSetupRef.current.values`,
  returns a resolved copy with cross-field rules applied.
- **Two honest truths:** `getConfigValue(fieldId)` returns the RAW stored value (user intent — actual stored
  choice or null). `resolveEffectiveConfig` returns the ENGINE-RESOLVED view. `getConfigValue` does NOT
  route through resolve; the two are separately inspectable. `__dumpProjectSetup` shows raw.
- **Exactly two consumers** call `resolveEffectiveConfig`: (1) top of `deriveWorklist` as `resolvedCfg`;
  (2) top of the Project Setup panel render IIFE as `resolvedPanelCfg`. Both fall back to
  `getConfigValue(field.id)` for default-value handling (count→0, multi→[]).
- **Spawn dedup:** `deriveWorklist` collects all `{type, count}` into `maxCountByType`, merges by type
  via `Math.max` (shared appliance = max needed, not additive). Builds to-place/obligations from deduped set.

**Beat 3 — trade→role wiring (Session 38; commit 1aae356):**
- **`trades: string[]`** on every ITEM_TYPES obligation definition. Role ids from ROLE_LABELS. Multi-trade
  where genuinely warranted: `mount-type` → `['hvac-designer', 'designer']`; `supply-exhaust-duct` →
  `['hvac-designer', 'energy-advisor']`. "envelope" obligations (`vent-to-exterior`, `exterior-vent`) → `[]`
  — no ROLE_LABELS entry maps to envelope work (#78 open).
- **`trade: string`** scalar on each RUN_PAIR_MAP entry (category-level; authoritative for run obligations
  in the map, overrides obligation-level `trades`). `lineset` → `'hvac-designer'`.
- **`ownerRoles: string[]`** derived per obligation in `deriveWorklist`: run obligations check RUN_PAIR_MAP
  category first, fall back to `ob.trades`; property obligations use `ob.trades` directly.
- **Worklist row render:** `.wl-oblig-owner` secondary line — "Owner: X" / "Owners: A, B" / "Owner: unassigned".
  Role LABEL only (via ROLE_LABELS); person-name lookup from `roleAssignments` deferred (#61 follow-on).

```
projectSetupRef.current = {
  values: { [fieldId: string]: string | string[] | null },
    // Keyed by CONFIG_FIELDS descriptor id. Single-select: string|null. Multi: string[].
    // Raw user intent: read via getConfigValue(fieldId); written via setConfigValue(fieldId, value).
    // Engine-resolved view: resolveEffectiveConfig(projectSetupRef.current.values).
  roleAssignments: { [roleId: string]: string },
    // Keyed by role id (e.g. 'hvac-designer'). Value = assigned person name string.
    // Absent/empty = unassigned (owner-fallback displayed).
    // Read via getRoleAssignment(roleId); written via setRoleAssignment(roleId, name).
}
// Reset on PDF upload to { values: {}, roleAssignments: {} }.
```

`CONFIG_FIELDS` — module-level descriptor array (11 fields / 4 categories):
- **Outputs** (multi:true): `outputs` — f280, h2k, permit-set
- **Jurisdiction** (multi:false): `jurisdiction` — nbc, obc, other
- **Assemblies** (multi:false, 2 opts each): `assembly-wall`, `assembly-foundation`, `assembly-roof`, `assembly-floor`
- **Equipment** (multi:false): `water-heating` (tank-gas, tankless-gas), `space-heating` (furnace-gas, heat-pump-ducted),
  `cooling` (heat-pump-ducted, central-ac, none — 3 opts; heat-pump-ducted added Session 37), `ventilation` (hrv, erv),
  `bath-fans` (kind:'count')
Each descriptor: `{ id, category, label, options: [{value, label}], multi, spawns }`.
`spawns` is a function `(val) => [{type, count}]` or null. Adding a new field = adding a descriptor entry; panel renders automatically.
Adding a cross-field rule = adding an entry to `CONFIG_CROSS_FIELD_RULES` only.

`OUTPUT_ROLES` — module-level map: output value → role id array (coarse starter set, extensible):
- `'f280'` → `['hvac-designer', 'energy-advisor']`
- `'h2k'` → `['energy-advisor']`
- `'permit-set'` → `['designer', 'hvac-designer', 'plumber', 'electrician']`

`ROLE_LABELS` — module-level map: role id → display label (insertion order = display order):
designer, hvac-designer, energy-advisor, plumber, electrician.

`getRequiredRoles()` — component-scope pure computed function. Unions `OUTPUT_ROLES` across all
selected outputs, deduped via `Set`, ordered by `ROLE_LABELS` insertion order. Never stored — computed
fresh each render. Implements the §3 "required roles derive from chosen outputs" logic.

`projectSetupTick` / `setProjectSetupTick` — `useState(0)` integer; bumped inside both `setConfigValue`
and `setRoleAssignment` to force re-render after every ref write.

**Consolidated side-panel container (#69 — Session 40; commit 145d807):**
  All four right-side panels (Project Setup, Worklist, Floor Heights, Envelope) now live inside a
  single `<div className="side-panel-container">`. ONE "Panels" button (same toolbar gate: `!calibMode &&
  !drawMode && !editMode && !categorizeMode`) opens/closes.
  - State: `showSidebar`, `activeTabId` (init `'project-setup'`), `sidebarWidth` (300px), `sidebarWidthRef`.
    The four `show*` constants are derived: `showProjectSetup = showSidebar && activeTabId === 'project-setup'` etc.
    Legacy `setShow*` setters = `() => setShowSidebar(false)` (existing ✕ buttons and Place-button closes unchanged).
    `SIDEBAR_TABS` module-level constant; order = Project Setup → Worklist → Floor Heights → Envelope.
  - **Narrow mode (< 520px):** vertical flex column of four label bars — all always visible; active highlighted;
    panel content fills below.
  - **Wide mode (≥ 520px):** horizontal tab row across top with active underline (`side-panel-tab-bar--wide` CSS class
    driven by `sidebarWidth >= 520`).
  - **Drag-to-resize:** `.side-panel-resize-handle` on left edge; `clamp(300, startW − Δx, 80vw)`;
    `sidebarWidthRef.current` + `setSidebarWidth` updated live. Width persists within session.
    Cross-session persistence deferred (no localStorage in codebase — decision needed before implementing).
  - CSS: `.side-panel-content .fh-panel` resets absolute positioning via `!important` overrides;
    existing fh-panel div JSX preserved verbatim inside the container. Dead CSS removed: `.ps-panel right:300px`,
    `.wl-panel right:600px`, `.enum-panel right:900px`, `.wl-btn`/`.enum-btn` rules.

**Project Setup panel fields (§9):** Fields `.map()`ed from `CONFIG_FIELDS` grouped by `.category`; category order
derived from array order (no hardcoded list). `multi:false` → `<select>` with placeholder. `multi:true` → checkbox group.
"Required Roles" section below: calls `getRequiredRoles()` each render; text input per role bound to `getRoleAssignment`/`setRoleAssignment`;
unassigned roles show "(unassigned — owner responsible)" fallback marker.

**Primary-reference tree** (added sub-step 5):
```
primaryReferenceIdRef.current = string | null
  // pageId of first manually-calibrated page; set once, never overwritten.
  // Project-level scale/coordinate root.

pageRefParentRef.current = { [pageId: string]: string }
  // Maps each confirmed page to the reference page it aligned/confirmed against.
  // Written at confirm time. getEffectiveScale follows this chain to the primary.
```

**Floor-height Z-stack** (added Sessions 14-15 — datum layer only; ELEMENT Z is Phase 2):
```
floorHeightsRef.current[floorLevel] = {
  floorToCeiling: number | null,          // feet (e.g. 9 = 9 ft); null until entered
  floorSystemAbove: number | null,        // feet (e.g. 0.885 ≈ 10⅝"); null until entered
  ceilingSource: 'direct' | 'solved'      // missing/undefined treated as 'direct'; not in accumulateZ output
}
// floorLevel is a FLOOR_ORDER string ('Basement', 'Main Floor', etc.)
// Only present for levels in FLOOR_ORDER — free-text subLabels excluded.
// Cleared on PDF upload.
```

`accumulateZ(floorHeights, presentLevels, floorOrder)` pure helper in geometry.js:
- Returns `[{level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove}]` base→top.
- `presentLevels` = FLOOR_ORDER levels with at least one categorized Floor Plan page.
- Nulls treated as 0 for accumulation but preserved in output.

**Roof internal-line graph** (added Session 13 — roof-plan tracing):
```
roofGraphRef.current = {
  verts: Array<{
    id: string,              // e.g. "rv-0", "rv-1" — stable across re-renders
    x: number, y: number,   // canvas-pixel coordinates
    // Provenance (one of these present, or neither for a free interior vertex):
    perimCorner?:  { shapeIdx: number, vertIdx: number },  // coincident with polygon corner
    perimParent?:  { shapeIdx: number, segIdx: number },   // lies on a polygon edge mid-span
    roofEdgeParent?: { edgeId: string },                   // created by splitting a roof edge
  }>,
  edges: Array<{
    id: string,              // e.g. "re-0"
    aId: string,             // vertex id
    bId: string,             // vertex id (shared at junctions — not duplicated)
    role: 'hip' | 'valley' | 'ridge'
  }>
}
roofVertCounterRef.current  // monotonically increasing id counter
roofEdgeCounterRef.current  // monotonically increasing id counter
```

Key graph invariants:
- Junction vertices are **shared** — the same `id` appears in multiple edge `aId`/`bId` fields.
- Dedup is by quantized key (`Math.round(x*2),Math.round(y*2)`) — two snaps within 0.5px
  produce the same vertex.
- When a chain endpoint snaps to an existing roof edge, `splitRoofEdge` replaces that edge
  with two new edges sharing the new vertex. `healAfterEdgeRemoval` reverses this on undo/delete.
- Perimeter polygons (`completedShapesRef`) are never modified by the graph; `perimParent`
  vertices record the attachment without splitting the polygon.

All of the above are cleared on PDF upload.

## Known issues

### Bugs (deferred):
- **feet+inches carry-over (low priority):** Display shows `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** Too loose with small snap grids; guides show
  green but snapped endpoint can be off-axis. Defer to post-Phase 1 optimization.
- **Front-face select interaction vanishes until next page:** The selected front-face edge
  highlight/interaction may not persist correctly across redraws — log to fix in a focused
  polish session.
- **Categorize-input button color scheme not documented:** Current button highlight logic
  follows "next logical step" but the exact color-state rules are not written down.
  Document and potentially improve in a UI polish session.
- **Opening 3D placement wrong side of wall (#94): RESOLVED (commit 8fe8ba7).** Root cause
  was a scalar canvas-X offset formula that mirrored openings when the reference edge was
  traced right-to-left. Fixed by projecting the full 2D canvas offset vector onto the A→B
  edge direction (dot-product / edgeLenPx). 15/15 harness PASS; Ben visual confirmed.
- **Overlay blank until forced re-render on same-sheet logical-page nav (#114): RESOLVED
  (commit f1fffac, Session 66).** The three overlay passive-redraw `useEffect`s keyed on
  `currentPage` (sheet number) but not `currentPageId` (logical-page identity); a source sheet
  and its carved regions share one sheet number, so navigating among them changed `currentPageId`
  + cleared `measureRef` in `renderPage` but re-fired no passive effect → blank overlay until a
  mode change / imperative redraw. Fix = add `currentPageId` to the dep arrays of all three
  effects (view ~1046, edit ~1607, draw ~1616). Effect bodies + renderPage + goToPageId + carve
  path untouched; pure repaint-trigger, no coordinate/scale math. Different-sheet nav unaffected
  (setCurrentPage + setCurrentPageId batch into one render → effect still fires once). Refined
  trigger: "≥2 logical pages sharing one sheet number" (single region + source qualifies;
  overlapping is incidental). Verified by Ben's eyeball (harness was never the detector). Two
  PRE-EXISTING bugs were exposed (not caused): #109 (mis-registration on source-sheet return —
  was masked by the blank overlay) and #115 (carved elevation region has no Place-opening). See
  ADDITIONAL_FUNCTIONALITY.md.
- **#109 overlay mis-registration on return — RESOLVED BY #117 (Session 68; commit 57fb605).** The
  "paints-but-mis-registered" symptom was the same overlay/backdrop frame split diagnosed as #117 (the
  full-sheet render frame was window-derived). The C-REDERIVE frame pin makes `measureRef`
  window-independent, so overlay and backdrop share one frame and can no longer diverge. Un-batched from
  #24, whose remaining scope (window-level drag-release event gap) is unrelated and still OPEN.
- **#115 carved elevation region has no Place-opening — RESOLVED (Session 67; commit 2521bbd).** The
  forced-categorize-on-carve modal requires every new region to be classified before it enters navigation;
  an Elevation-categorized region now surfaces Place-opening via the `isElevationPage` gate. Resolves the
  ENTRY gap only. **Openings placed on a carved region still do not RENDER** — a distinct OPEN bug tracked
  at ADDITIONAL_FUNCTIONALITY.md #125 (gate-still-real; needs a localization recon).

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

## Source layout (current)

- `src/geometry.js` — all pure geometry helpers and polygon algorithms
  (distToSegment, applyAxisSnap, findCollinearOverlap, splitPolygon, etc.)
  plus module-level constants (CLOSE_SNAP_RADIUS, HIT_VERT_DIST, etc.)
- `src/canvasRenderer.js` — stateless drawing primitives that take explicit
  data params (drawLockedShapes, drawShapePoly, drawAlignGuide, pxToDisplayDist)
- `src/coords.js` — **the coordinate conversion seam** (Session 69; waypoint (a) done).
  ALL px↔m, ft/in↔m, screen↔canvas, similarity/T⁻¹, and CSS-transform-string math lives here.
  See "Coordinate seam architecture" section below.
- `src/App.jsx` — all React state, refs, event handlers, stateful canvas
  drawing (drawEditCanvas, redrawDrawCanvas), and JSX (~8090 lines as of Session 63 —
  the prior "~3400" was stale; 66 useRefs, 108 useStates, 7 `*Tick` integers, ~47
  `shapeKind` branch sites. Waypoint (a) coordinate-layer extraction is DONE — see seam
  architecture below for the end-state invariant)

## Coordinate seam architecture (Session 69 — waypoint (a) DONE)

**Two-tier model:**

- **Tier 1 — pure primitives in `src/coords.js`** (the seam's public surface): `pxToMeters`,
  `metersToPx`, `feetToMeters`, `metersToInches`, `feetInchesToMeters`, `inchesToMeters`,
  `elevYToZFeet`, `zFeetToElevY`, `pxToDisplayDist`, `similarityFromHandleDrag`,
  `screenDeltaToWorld`, `invSimilarityPoint`, `zoomAnchorPan`, `buildViewTransformCSS`,
  `getCSSTransform`, `buildPanZoomTransformCSS`. No React imports; no ref reads; pure functions
  only.

- **Tier 2 — ref-bound resolvers in `App.jsx`** (thin wrappers that read live refs and call
  Tier-1 primitives): `getEffectiveScale`, `getWorldOriginM`, `pageVertexToWorld`,
  `elevYToWorldZ`, `getCanvasPos`, `clampToCanvas`. These stay in App.jsx because they close
  over live refs — they are NOT eligible for extraction without a larger ref-architecture change.

**Checkable invariant (the end-state a future session tests against):** those six Tier-2 wrappers
+ `coords.js` are the **ONLY** places raw `scale.pxPerMeter` / `0.3048` / `0.0254` / T⁻¹
similarity math may appear in App.jsx. Any new inline conversion arithmetic in App.jsx is a
**regression** against this invariant.

**Frame model (reinforced — do NOT change):** The render footprint (`measureRef` size, and
everything reading off it — `getCanvasPos`, `clampToCanvas`, all draw paths, pan) is
window-independent. Full-sheet pages pin it to `authorScaled` in `renderPage`; crop/region pages
pin it to `crop.w/h`. Window width governs ONLY the viewport (fit-zoom). This is the
"frame-is-intrinsic" model established by #117 (Session 68); it is settled groundwork for the
coordinate seam and must NOT be reintroduced from a window-derived path.

**Intentional exceptions — DELIBERATE, do NOT "fix":**
- `geometry.js` `parseDisplayDistInput` keeps its own `0.0254` — pre-existing pure seam; adding a
  `geometry→coords` dependency is not in scope.
- DEV harness `expectedAnchorZm` (~App line 5128) keeps raw `0.3048` — it is an INDEPENDENT
  oracle; routing it through the same primitive it checks would defeat the verification.
- Snap-grid `<option>` value literals (~App line 6426) keep raw `0.0254` — these are canonical
  data constants, not conversion math; routing them shifts by 1 ULP and breaks `<select value>`
  matching (a visual regression documented in-code).
- **Two CSS-transform builders** (`buildViewTransformCSS` for the backdrop align layer,
  `buildPanZoomTransformCSS` for the canvas-world pan/zoom) are **NOT unified into one**. The two
  sites emit genuinely different byte-level string shapes: comma spacing, presence of `rotate()`,
  and identity-shortcut behaviour all differ. Forcing one shape changes emitted bytes (not just
  CSS semantics). Two dedicated builders preserving each site's exact string is the correct
  outcome — do NOT unify them by relaxing byte-identity.

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
  The origin (0,0,0) is a **fixed, arbitrary zero** — not a building feature. All
  geometry lives in the coordinate space at whatever coordinates it lands on, and all
  relationships are computed **geometry-to-geometry**, never against the origin.
- **No origin point / no origin capture:** nothing "is" the origin. The earlier idea of
  deriving an internal anchor from the first vertex on the ground floor is **reversed** —
  there is no such anchor. The lowest floor is identified (via `getAnchorFloor`) only as
  a **building fact: the base of the floor stack**, carrying no coordinate-origin meaning.
- **Floor levels (Z) are a relative-offset stack:** each floor stores its offset from the
  floor below; absolute Z accumulates up from the base. Changing a lower floor's height
  shifts every floor above it up (intended). Offsets are set via the elevation/cross-
  section line-slider mechanic; floor-system thickness = ceiling-to-next-floor offset.
- **Compass rose:** Manual overlay alignment + rotation input. Defines all axis labels.
- **Plans define structural envelope:** Floor plans + roof plan → outer shell geometry.
- **Elevations show vertical section:** Align to plan edges; show floor heights, roof
  pitch, eave projections; walls/openings traced on top.
- **Cross-sections are reference-only:** Vertical slices aligned to plan reference lines.
- **PDF transform is VISUAL ONLY — canvas coordinate space is shared and unaffected:**
  All geometry — including elevations — is traced on the shared `measureRef` canvas in canvas-world
  coordinates. The PDF `{tx,ty,s}` transform is VISUAL ONLY: it repositions the backdrop image, never
  the coordinate system geometry is drawn in. Therefore 1 meter is always `srcPxPerMeter` pixels
  regardless of the PDF's original drawing scale; after correct alignment the elevation's `pxPerMeter`
  equals the source plan's. Do not assume the PDF transform feeds into px/m — it does not.
- **Render frame is INTRINSIC; the window is ONLY the viewport (#117, Session 68 — established pattern):**
  A page's render footprint (the `measureRef` size, hence the frame `getCanvasPos`, `clampToCanvas`, all
  draw paths, and pan read off) is now WINDOW-INDEPENDENT. Full-sheet pages pin it to the page's
  `authorScaled` (fallback 1200 — the clamp ceiling) in `renderPage`; region/crop pages already pinned
  it to `crop.w`. Window width governs ONLY the viewport (initial fit-zoom `min(1,(innerWidth−48)/
  footprint)`, plus pan/zoom/scroll) — it never sizes the coordinate frame. This closed #117: the frame
  used to be derived from live window width, so geometry authored at one width mis-registered against the
  backdrop at another. **This is the established model — a future coordinate/frame change should EXTEND
  it (keep the frame intrinsic, put window-dependence in the viewport only), never reintroduce a
  window-derived frame.** The full-sheet↔crop convergence is done groundwork for SIMPLIFICATION WAYPOINT
  (a) (coordinate-layer extraction): treat it as settled, do not re-litigate it there. The backdrop still
  carries the raw stored `{tx,ty,s}` align transform (visual-only, per the note above); the frame pin and
  the align transform are orthogonal.
- **Real-world coordinate system — Path 3 / 3-minimal (R2 foundation — DONE, Session 18):**
  Geometry is STORED IN PIXELS. Meters are a READ-TIME PROJECTION through the named conversion seam
  (`pxToMeters` / `metersToPx` in canvasRenderer.js). Refs hold pixels; no frozen conversion ratio
  is ever stored — recalibrating a page or its borrow-chain parent is safe at any time (see #22,
  recalibration-independence invariant). The "shared real-world frame" is OPERATIONAL, not stored:
  pages share a frame because they share calibration scale and ghost-align visually. Composing the
  `pageRefParent` chain onto actual geometry coordinates is R3 — deliberately not built at R2.
  Vertex shape is **R3-ready** via `makeVertex(x, y)` factory in geometry.js: returns `{ x, y }` today
  (z absent); R3 adds z here and only here. Per-element identity is preserved (#19 — no coordinate-
  coincidence merging). Floor levels remain a **relative-offset Z stack** (datum layer,
  `floorHeightsRef`, unchanged). Imperial display and entry untouched (see #20).

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
- **Prefer self-contained Code prompts** that complete a whole piece and report once.
  Minimise checkpoint count without merging pieces that need independent browser verification.
- **Trust the runtime over static code review (reinforced Session 21):** the elevation
  edit-drag bug survived two rounds of static analysis — the first hypothesis (`!editMode`
  guards) was entirely wrong; the second "looks correct" read of the filter path was also
  wrong. Only `[DBG-]` console instrumentation revealed the real cause: `drawEditCanvas`
  default path used `.filter().forEach()` giving LOCAL `shapeIdx` indices, while hit-test
  functions return GLOBAL indices. A mismatch invisible to eye, instantly visible in logs.
  When a bug survives a static read, instrument and run; do not theorize further.
- **Dev fixture is the standard session-start test path:** after a hard reload, restore the
  full scenario with `await window.__restoreFixture(JSON.parse('<snapshot JSON>'))` in the
  browser console. The bundled PDF lives at `public/devFixtures/test-fixture.pdf` (gitignored
  — drop your real test PDF there on a fresh clone). Snapshot with
  `copy(JSON.stringify(window.__snapshotFixture()))`. LOAD FIXTURE and SAVE FIXTURE buttons
  are live in the DEV strip (Session 22; #31 done).
- **`__verifyFixture` is DESTRUCTIVE — run it exactly once per fresh restore:** the harness
  deletes a door as part of its checks, so running it a second time in the same JS session yields
  a false partial-fail (e.g. "6/32, door entry still present"). Standing rule: fresh LOAD FIXTURE →
  `__verifyFixture` once → if re-running is needed, fresh restore again first. This false-fail has
  cost multiple diagnostic detours; always re-restore before concluding a harness regression is real.
  Pairs with: run `__verifyFixture` immediately after restore, before any interaction or
  `__verifyCrop` (which parks the app on another page).
- **Storage-shape changes must add a layer, not replace (Session 35 lesson):** when a shape
  grows a new identity layer (`pointSlots`), keep the raw geometry layer (`vertices`). Many
  uniform iterators (getVisibleVertices, snapshotShapes, etc.) have no shapeKind guard and
  will crash if `vertices` is absent. "Add a layer" is safe; "replace raw geometry" is a
  breaking change that compiles clean and crashes at runtime.
- **Compile-clean is NOT the verification line; a failed check is NOT a passed check (Session 35,
  reinforced):** Two real bugs (Build 1 regression, camera-reset on toggle) survived clean
  builds and were only found by explicit browser verification with stated pass/fail checks.
  State each check explicitly; confirm each before committing; never telescope "probably fine."
- **`window.__dumpRuns()` and `window.__dumpSolids()` are standing invariant checkers:** run
  `__dumpRuns()` after any run-storage change (confirms `vertices[i] ↔ pointSlots[i]` MATCH);
  run `__dumpSolids()` to inspect derived geometry parameters. Both live in the DEV block in
  App.jsx and tree-shake from production.

