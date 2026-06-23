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

**Environment:** Project at C:\Users\ben\Collabinator\pdf-viewer (Code can default to a stale G: path — always confirm the folder at session start). State is in-memory only, lost on reload — build test state in one un-reloaded tab. The .claude/settings.local.json file is gitignored, recreate on a fresh clone.

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

**Not yet built (next increments):**
- Elevations, cross-sections, windows/doors
- Slope rules + Z-derivation for roof (needs coordinate model — see #18)
- Primary-reference reassignment UI (primaryReferenceIdRef set-once today; UI to reassign deferred)

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

**Polygons (completed shapes):**
```
completedShapesRef.current = Array<{
  vertices: [{x, y}],           // canvas-pixel coordinates
  status: 'reviewing' | 'locked',
  pageId: string,               // e.g. "page-1"
  // Roof-plan pages only:
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
- `src/App.jsx` — all React state, refs, event handlers, stateful canvas
  drawing (drawEditCanvas, redrawDrawCanvas), and JSX (~3400 lines)

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
- **Real-world coordinate system:** NEXT ACTIVE STEP (scoped Session 17 — target R2).
  Currently all coords are canvas pixels; this refactor converts geometry to a single
  shared real-world XY frame stored in **meters** (canonical unit; imperial ft+in
  remains the display/entry convention, untouched — see #20). Target model: the
  **primary-reference page** (`primaryReferenceId`) defines the frame; every other
  page is placed into it by composing the existing `pageTransformsRef` align
  transforms down the `pageRefParent` chain. A **fixed arbitrary origin** (coincident
  with the primary page's zero), all relationships computed **geometry-to-geometry**,
  floor levels as a **relative-offset Z stack** (datum layer — `floorHeightsRef` —
  unchanged by this step). Geometry is stored in meters natively (conversion isolated
  to two seams: input events and render); built to **R3-readiness** — vertices carry
  an optional-Z-ready shape and per-element identity is preserved (no coordinate-
  coincidence merging, per #19) — so the future per-element-Z layer (ELEMENT layer,
  R3, #7/#19) extends this without rework. Named control/reference points (e.g. the
  CAD-export datum, #6) stored as data at their computed coordinates within the space.

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

