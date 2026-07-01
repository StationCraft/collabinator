# Collabinator — Session Handoff Notes
*Captures context from chat conversation that is NOT in CLAUDE.md or FUNCTIONALITY_SUMMARY.md,
plus a running record of each session's work and the forward build plan.*

**Note:** CLAUDE.md is kept current by Claude Code at the end of each session to match
the actual implementation. This document captures things that live ONLY in chat
history: tooling fixes, the recovery story, architectural decisions made
conversationally, and a session-by-session log — worth a quick skim against the
current CLAUDE.md to confirm nothing fell through.

---

## SESSION 71 — #29 first piece: aligned-edge setback/protrusion hover-label (2026-07-01)

**Branch:** main | **Code commit:** `ed43c6d` | **Docs commit:** (this close-out).

**What this session built:** the first #29 piece and the #53 sub-output, in one arc, verified in Ben's
browser before commit.

**Three recons first (read-only), then build:**
1. *Reference-face datum scope* — established the aligned/reference face is stored per-ELEVATION-page in
   `elevationEdgeRef` (points into a floor-plan polygon edge via `sourcePageId`), NOT on floor-plan pages;
   facing direction is otherwise only read-time `orientationDeg`. Resolves #29's OPEN RECON ITEM.
2. *First-piece wiring* — confirmed the elevation→wall-edges correspondence is directly resolvable
   (mirrors the opening-association map at App.jsx STEP-A pre-pass), both project into one world frame via
   `pageVertexToWorld`, and the only new primitive needed is a signed-perp-distance-to-one-edge helper
   (the polygon-based `pointInPolygon` sign does NOT transfer to a single reference edge).
3. *Ghost-hosting* — confirmed `drawGhostShapes` draws at raw source-page coords (same frame as the
   one-off draw), is page-type-agnostic, and already hosts the elevation case transiently in
   elev-edge/elev-align. Verdict (a): route through the existing ghost, don't keep a one-off draw.

**Consequential fork surfaced (Ben decided):** which page hosts the readout. Ben chose the ELEVATION page
(source floor plan drawn there as a ghost), not the floor-plan page.

**Build shape (final):**
- `signedPerpDist(pt, refA, refB)` (geometry.js) + `formatDistM(m, unit)` (coords.js).
- `getEffectiveGhostSource(pageId)` (App.jsx): floor/roof via `getGhostSourcePageId` (untouched), else the
  elevation's `elevationEdgeRef.sourcePageId`.
- Ghost routed through `drawGhostShapes` in `redrawFrontFaceLayer` (falls back to plain source during
  elev-edge/align → no double-draw); one-off faint-purple draw removed.
- View-mode **"Show floor plan"** toggle added to the elevation view toolbar (reuses per-page
  `showGhostByPageId`). NOTE: the spec's "widen the ~6879/~7018 toggle gate" was based on a slightly
  inaccurate toolbar map — those two toggles are the DRAW and EDIT toolbars, and there was NO pre-existing
  view-mode toggle. Since the feature is view-mode-only, a NEW view-toolbar toggle was added instead of
  widening draw/edit (which would control a ghost those renderers don't draw for elevations). Flagged to
  Ben; accepted.
- Readout: `resolveElevMeasureRef` (reference-edge world endpoints + source-polygon-centroid sign-anchor,
  winding-independent), `hitTestElevMeasureSegment`, `drawElevMeasureLabel`, `elevMeasureHoverRef`.
- **Strictly-parallel label gate** (`PARALLEL_EPS_M = 0.001` m, module-level const): both hovered-edge
  endpoints must be equidistant from the reference plane, else no label — perpendicular/angled walls stay
  hoverable/visible in the ghost but a non-parallel midpoint distance is a meaningless artifact (Ben's
  refinement after first verification).

**Verification (Ben's eyeball, twice):** ghost-routing pass — all 5 checks (amber ghost, toggle +
persistence, sign correct, no draw/edit/review label, no floor/roof regression). Parallel-gate pass — all
5 checks (parallel labels unchanged number/sign, perpendicular + angled suppressed, coincident still
suppressed, sign correct).

**Scope held:** view-mode only; single-source-page (#88). Remaining #29 pieces (simple-massing derived
block, confirm-view, isometric depth view) NOT built.

**New deferred entry logged:** #126 ISOMETRIC DEPTH VIEW (Ben's request) — an iso render of flat plan
geometry on scalar floor Z to make setback/protrusion legible visually; recon-gated against the #23/#17
projection fence before scoping (a flat scalar-Z iso may avoid R3, unconfirmed). Do NOT build.

**Register close-out:** #53 → DONE-as-#29-sub-output; #29 → first-piece recorded + open-recon-item
resolved; #116 → #29 dependency note (reference face = capturable surface region); #126 → new entry.

---

## SESSION 70 — Waypoint (b) roadmap reconciliation (docs-only) (2026-07-01)

**Branch:** main | **Scope:** DOCS ONLY — no `src/` edits, no harness runs, no behavior change.

**What this session did:** executed plateau waypoint (b) — the one-time roadmap reconciliation +
gate-rephrasing pass — following waypoint (a) (coordinate-seam extraction, Session 69, DONE).

**Baseline discrepancy found and handled (recorded so it isn't re-litigated):** the run prompt
assumed the register ended at #119 and instructed appending #124/#125. Recon showed **#124 and #125
already exist** on main (added by commits `874d9bc` and `0127ccb`, after the prompt author's baseline),
and #125 was **mischaracterized** in the prompt (it thought #125 = "opening-on-carve localization log"
consumed by #29; the real #125 = "openings don't render on a carved region," an OPEN bug, not
instrumentation, not a #29 dependency). Git baseline (the four named commits) matched exactly. Ben
approved the adaptation: skip the duplicate append; retag the existing #124/#125; write the settled
sequence without the false #125↔#29 coupling; mark #115 RESOLVED for its entry-gap symptom with a
cross-ref to #125's still-open render question.

**Edits made:**
- **ADDITIONAL_FUNCTIONALITY.md:** added a consolidated **Gate-rephrasing sweep (Session 70)** block at
  the top of the Register — every deferred entry tagged (gate-lifted-ready / gate-partially-lifted /
  gate-still-real / architectural-record / CLOSED / fenced) with a checkable condition, plus the B5 /
  element-Z HARD GUARD (line wireframe only; `makeVertex` returns `{x,y}`; R3-gated items stay
  gate-still-real). Corrected #110 → DONE (drawRegionOutlines, 2521bbd) and #115 → RESOLVED (entry-gap;
  forced-categorize-on-carve, 2521bbd) with a #125 cross-ref. Retagged #106/#107/#108 to
  gate-lifted-ready (geometry-stable review passed). Retagged #125 explicitly OPEN / gate-still-real.
- **BUILD_ROADMAP.md:** refreshed the PLATEAU STATUS line ((a) DONE, (b) executing) and added the
  **SETTLED SEQUENCE (Session 70)** block: Beat 0 (#53/#118/#112) → #29 → thermal arc (#106/#107/#108);
  #106–108 parallel-track rejected (all in App.jsx, run sequentially).
- **CLAUDE.md:** refreshed the plateau/next-steps block (both waypoints done; settled sequence; #124/#125
  noted); corrected the stale #109 (RESOLVED BY #117) and #115 (RESOLVED entry-gap; #125 render-gap OPEN)
  known-issue entries.
- **FUNCTIONALITY_SUMMARY.md and PARALLEL_TRACKS_LEDGER.md:** reviewed — neither carries a stale
  #110/#115/#117/#109 or B5/element-Z claim, so both left unchanged.

**Fence-confirm (unchanged, not pulled forward):** #24, #28, #64–68, #79, #103, #113 (+ #102 gated on
the #28 fence). B5 scope-clarification block (BUILD_ROADMAP.md ~182–188) confirmed intact and not weakened.

**Open item after this session:** next build work is Beat 0 (#53/#118/#112), then #29.

---

## SESSION 69 — Coordinate-seam extraction, waypoint (a) DONE (2026-06-30)

**Branch:** main | **Commits:** 8381ef3 (Stage 0) → 7b2479d (Stage 6) — 11 commits total.
**Harness (fresh restore at Stage 6):** `__verifyFixture` **44/44** + `__verifyCrop` **17/17**. Two-width live eyeball (wide + ~1000px narrow): backdrop/overlay register, pan + zoom correct at both widths.

**What this session built:**

Full behavior-preserving extraction of all coordinate, unit-conversion, similarity/T⁻¹, and CSS-transform-string math from App.jsx into `src/coords.js`. The waypoint (a) goal — "no raw conversion arithmetic in App.jsx" — is met. End-state: `coords.js` + the six Tier-2 ref-bound wrappers are the only places that math may appear.

**Stage-by-stage summary:**
- **Stage 0** (`8381ef3`): coords.js seam file created; `pxToMeters`/`metersToPx`/`pxToDisplayDist` moved from canvasRenderer.js; `ft/in` helpers added; `buildViewTransformCSS`/`getCSSTransform` seeded (from earlier Stage 0 groundwork in prior sub-step commits); `similarityFromHandleDrag`, `screenDeltaToWorld`, `invSimilarityPoint`, `zoomAnchorPan` added.
- **Stage 1** (`f32c159`): opening placement px↔m routing (all placement/sizing paths through `pxToMeters`/`metersToPx`).
- **Stage 2** (`edb908f`): derivation feet→m in `deriveWireframe`/`deriveEnumeration`; byte-identical output proved by `__dumpEnumeration` dump comparison.
- **Stage 3** (`ba38404`): elevation Y↔Z — `elevYToZFeet`/`zFeetToElevY` unified to one core; all four draw paths + the DEV oracle route through them.
- **Stage 4** (`dc70b72`): ft/in dialog entry conversions (calibration dialog, opening dialog, floor-heights panel, label-edit commit) all routed through `feetInchesToMeters`/`metersToInches`.
- **Stage 5a** (`5888e4e`): align-drag similarity — `handleAlignMouseMove` (both floor and elevation handlers) through `similarityFromHandleDrag`; `screenDeltaToWorld`/`invSimilarityPoint`/`zoomAnchorPan` wired.
- **Stage 5b** (`2e7caf5`): carve-commit T⁻¹ through `invSimilarityPoint`; wheel zoom-anchor through `zoomAnchorPan`. These two paths are NOT exercised by the harness — verified only by live carve + scroll interaction.
- **Stage 6** (`7b2479d`): JSX pan/zoom CSS — last remaining hand-built transform literal in JSX replaced with `buildPanZoomTransformCSS(panX, panY, zoom)`.

**Key deviation (Stage 6 — approved):** The two CSS-transform sites emit genuinely different byte-level strings (comma spacing, rotate term, identity shortcut). The fence required byte-identical output, so they use **two dedicated builders** rather than one shared shape. `buildViewTransformCSS` serves the backdrop align layer; `buildPanZoomTransformCSS` serves the canvas-world pan/zoom. This is the correct outcome — do not unify them.

**Snap-grid ULP fence catch (Stage 4):** snap-grid `<option>` value literals were initially in scope. Routing them through `inchesToMeters(1)` shifts by 1 ULP from the hardcoded `0.0254` (floating-point identity break), causing `<select value>` matching to fail silently. They were excluded and documented as intentional exceptions.

**Two-commit Stage 1/2 split recovery:** Stage 1 was initially over-scoped (derivation paths included). Reverted to the correct scope (opening placement only) before Stage 2 — caught by explicit dump comparison before commit.

**KEY LEARNINGS (record for future refactors):**

1. **A behavior-preserving refactor's verification must exercise the full interactive + render surface**, not just harness dumps. The harness does NOT traverse the carve-commit T⁻¹ path or the wheel zoom-anchor — those paths required live interaction to verify. Dump equality proves the math routed correctly into the seam; it does not prove the wiring was correct end-to-end.

2. **Byte-identity proves the MATH routed correctly; it does not prove the WIRING.** For each stage: byte-identical dump output confirms the math is unchanged; live browser interaction (pan/zoom, carve, wheel) closes the wiring half. Both halves are required.

3. **"One seam" is the goal, but never at the cost of changing an emitted byte.** When two CSS sites emit genuinely different string shapes, two dedicated builders preserving each shape is the correct outcome. Do not relax the byte-identical fence to force a single builder.

**Open items after this session:**
- **(b) ROADMAP RECONCILIATION** — next plateau waypoint; run before #29.
- `.claude/launch.json` is **tracked** (not gitignored like `settings.local.json`). A session's temp port config can leak into a commit. Consider gitignoring + untracking to match `settings.local.json` — flag to Ben before actioning.

---

## SESSION 68 — #117 transform-registration FIXED via C-REDERIVE (frame pin) (2026-06-30)

**Commit:** `57fb605` (code) + this doc close-out. Resolves #117 and, as a consequence, #109.

**Four-beat arc:**
1. **Recon (read-only):** mapped the two transform paths. Established the apply path is CLEAN and
   author-frame == apply-frame, so the stored `{tx,ty,s}` cannot be the culprit — a load-time
   divergence requires a parameter that changed between author and load.
2. **Instrumentation (confirmed cause (i)):** temporary logging + backdrop-pixel measurement proved
   the printed door/window head-sill land on the traced geometry to **<0.3px when load `scaled`
   == author `scaled` (1200)** and diverge (scaling with the width ratio) otherwise. Root cause:
   the full-sheet render frame was derived from live window width (`containerWidth =
   min(innerWidth−48,1200)`), so geometry frozen at author width mis-registered at any other width.
3. **Ratio fix (v1) built and REVERTED:** compensated only the backdrop by `ratio =
   authorScaled/currentScaled`. It re-registered the ink at both widths (and passed a two-width
   INK check) but regressed the overlay the other way — pan reached only the load-visible region,
   ghost/shapes clipped to the narrow frame, main-floor ghost badly offset. A follow-on consumer-map
   recon proved a *working* A-EXTEND (patch every frame consumer with the ratio) collapses into
   C-REDERIVE.
4. **C-REDERIVE (shipped):** pin the full-sheet render footprint to the page's `authorScaled`
   (fallback 1200) instead of the live-window `containerWidth`. `measureRef` — and everything reading
   off it (`getCanvasPos`, `clampToCanvas`, all draw paths, pan) — is now window-independent by
   construction. Backdrop uses the RAW stored `{tx,ty,s}`. `authorScaled` stamped at the four confirm
   sites as the render-target pin. Viewport-only **fit-zoom** `min(1,(innerWidth−48)/footprint)` keeps
   the whole sheet visible on load; it never feeds back into the frame.

**Both-width verification (wide + ~1000px):** ink registers identically at both widths (door head/sill
177.8/376.0 at both); pan reaches the full sheet; ghost/shapes render complete (edge x=1032.5 now
within the pinned `measureRef`, was clipped under v1); whole sheet visible on load (fit-zoom 0.793 at
1000px). Harness `__verifyFixture` **44/44** + `__verifyCrop` **17/17** on fresh restores. #22 held —
no writes to `getEffectiveScale` / `pageScalesRef` / `pageCropsRef` / vertices; render footprint +
initial zoom only.

**KEY LEARNINGS (record explicitly):**
- **A two-width INK-registration pass is NOT sufficient to verify a frame fix.** The v1 ratio fix
  passed ink-registration at both widths and still regressed pan / ghost / shape completeness.
  Verifying a frame fix must exercise the FULL interaction + render surface (pan reach, ghost/shape
  completeness, on-load fit), not just ink-on-geometry at a couple of widths.
- **A-EXTEND collapses into C-REDERIVE.** When a frame is derived from an ephemeral parameter (here,
  live window width), do NOT patch each downstream consumer to compensate — fix it at the DERIVATION.
  Patching N consumers is fragile (each a place the compensation can be silently dropped) and, done
  coherently, converges to the single-point source fix anyway.

**#109 resolved as a consequence** (same window-derived-frame → overlay/backdrop split). **#24 stays
OPEN and un-batched** — its scope (global drag-release: `mouseup`/`pointercancel` outside the window)
is a real event-handler gap unrelated to the frame pin.

---

## SESSION 67 — #115 fix + #110 region outlines + viewport-as-unit reframe (2026-06-30)

**Branch:** main | **Commit (code):** 2521bbd | **Docs commit:** (this close-out) | **Harness (fresh restore):** __verifyFixture **44/44**, __verifyCrop **17/17**.

**What this session built:**

Three interrelated features shipped together in commit 2521bbd:

1. **#115 forced-categorize-on-carve modal.** When a region is carved, instead of silently pushing
   `category: null`, a non-dismissable modal opens targeting the new region's `pageId`. Stores
   `category` + semantic `subLabel` (floor level / elevation direction / freetext) and a separate
   display `regionName`. Cancel discards the region and reverses all companion state
   (`pageCropsRef`, `pageScalesRef`, `regionCounterRef`). Key mechanism: new `carvePending` state
   holds the just-carved region info while the modal is open; `confirmCarveCategory` /
   `cancelCarveCategory` handlers; `writePageCategory` extended with `extra={}` param so the carve
   path can write `regionName` without clobbering it on recategorize.

2. **#110 standing region outlines on the source sheet.** `drawRegionOutlines(ctx, regions, zoom)`
   in canvasRenderer.js draws solid green (#22c55e) labeled rectangles on the source sheet for all
   confirmed (non-null category) regions. The crop rect is mapped through the source page's align
   transform `T = translate(t)·scale(s)` before drawing so the outline lands at the correct
   visual position on an aligned source. Label chip: `regionName || subLabel || categoryLabel(category)`.
   Gated to source-sheet views only (`regionIndexOf(currentPageId) === 0`).

3. **Two-field model (settled mid-build after a wrong first attempt merged the fields into
   `subLabel`).** `subLabel` = semantic meaning only (floor level / compass direction); `regionName`
   = display name only. Independent; `writePageCategory` `extra={}` keeps them separate.

**Architectural decision logged to VISION_SUPPLEMENT.md §11:** the viewport-as-unit model — a
carved region and an un-carved full sheet are both first-class classified geometry units differing
only in extent. Category cannot be silently inherited from the source sheet; every viewport must be
explicitly classified.

**Three regressions reconned (read-only) — none caused by this arc:**

- **Source-sheet arrow-nav exclusion** (`!sheetsWithRegions.has()` filter on all three `navPages`
  lists, App.jsx ~4510-4512): by-design Session-61 exclusion, now considered wrong under the
  viewport model. Logged as **#118**.
- **`__restoreFixture` `_version` error on cold call**: pre-existing since Session 21; only fires
  when called with stale/no-arg object in console. Button path works correctly (feeds current file
  with `_version:1`). Not a new regression.
- **Bottom-right overlay mis-registration on aligned pages (transform-registration failure)**:
  confirmed pre-existing by `git stash` test (persists on f7aff47). Root cause: the PDF backdrop
  (`.pdf-align-layer` with `getCSSTransform(t)`) and the overlay (`measureRef`, sibling) diverge
  because only one receives the align CSS transform. Logged as **#117** — HIGH PRIORITY, next
  high-priority recon. Supersedes/batches with #109 and #24.

**Arc safety confirmed:** `git stash` test proved the mis-registration is pre-existing; the arc's
edits were stashed, fixture restored, same offset visible → stash popped, arc confirmed safe.

**Open items going into next session (priority order):**
1. **#117 recon + fix** (transform-registration, HIGH): read-only recon of the align-transform
   authoring-vs-application path before any fix attempt. See ADDITIONAL_FUNCTIONALITY #117 for the
   full recon checklist.
2. **#118 fix** (source-sheet nav exclusion, low-risk one-liner): remove `!sheetsWithRegions.has()`
   from all three navPages lists.
3. **#119** (opening dialog door/window option sets, low priority): deferred to opening-entry polish.

---

## SESSION 66 — #114 fix: overlay repaints on same-sheet logical-page navigation (2026-06-30)

**Branch:** main | **Commit (code):** f1fffac | **Docs commit:** (this close-out) | **Harness:** unchanged
(harness was NEVER the detector — the defect is an invisible-to-harness blank overlay; verification is Ben's
eyeball on a navigation sequence).

**What this was:** the fix for #114, scoped in a planning chat against the Session-65 read-only recon. Root
cause was SETTLED before any code: the three overlay passive-redraw `useEffect`s (view ~1041, edit ~1605,
draw ~1609) keyed their dependency arrays on `currentPage` (numeric sheet number) but NOT `currentPageId`
(logical-page identity). A source sheet and every region carved from it share one sheet number, so navigating
among them changed `currentPageId` + cleared `measureRef` in `renderPage`, but re-fired no passive effect
(`currentPage` unchanged) → blank overlay until a mode change or imperative redraw kicked it.

**The fix (approach-(a), surgical):** add `currentPageId` to each of the three dependency arrays. THREE
single-line additions. Effect bodies unchanged; `renderPage` / `goToPageId` / carve path / imperative-draw
handlers untouched. No coordinate/scale/crop/geometry math — pure repaint-trigger.

**Refined trigger condition:** "≥2 logical pages sharing one sheet number." A single region + its source
sheet already qualifies (item 3 verified). The OVERLAPPING-siblings framing in the original symptom was
incidental to Ben's repro, not causal — overlap touches nothing in the render path.

**Different-sheet nav (the one regression risk) — safe by construction:** `renderPage`'s `setCurrentPage` +
`setCurrentPageId` (App.jsx ~855-856) batch into ONE render under React 18 auto-batching (Vite + createRoot,
batched even after the `await`), so the effect still fires exactly ONCE on different-sheet nav. The dep
addition only adds a new same-sheet wake condition; it can't split a single existing fire into two.

**Verification (Ben's eyeball, his dev-server tab):**
- VERIFIED: drawn shape survives nav and paints on its own region without a mode change; source sheet
  repaints its elevation lines + placed openings on return without a mode change; sibling paints on arrival.
- Item 2 (no double-paint/flicker on different-sheet nav): NOT explicitly eyeballed; structurally single-fire
  per the batching argument. Cheap follow-up glance recommended; no double-paint expected.
- Item 4: `__verifyFixture` 44/44, `__verifyCrop` 17/17 on a fresh restore. Item 5: recovery paths unchanged.

**TWO PRE-EXISTING BUGS EXPOSED (not caused) by this fix — logged, NOT fixed this session:**
- **#109 (note appended):** mis-registration on source-sheet RETURN after a region draw (and on some fixture
  loads). Before the fix the source overlay was blank, so this registration bug was invisible; now that the
  overlay repaints, the mis-registration shows (overlay offset from backdrop, corrected by a clean redraw
  with the current transform). The #114 fix REVEALED it, did not create it. DISTINCT from #114 (that was a
  not-painted-at-all trigger gap; this is paints-but-mis-registered — different fix). Recon-and-fix pending.
- **#115 (new entry):** carved elevation region does not surface "Place opening" (opening-entry gap on
  region-pages — a freshly carved region starts `category: null`, so `isElevationPage` is false and the
  Place-opening gate hides). Blocked the opening-revert sub-check of #114 item 1. Needs recon (category
  inheritance vs. gate logic) before a fix.

---

## SESSION 65 — Build 2: carve-on-aligned-elevation crop∘T⁻¹ + scale propagation (2026-06-30)

**Branch:** main | **Commit (code):** e92aae3 | **Harness (fresh restore):** __verifyFixture **44/44**,
__verifyCrop **17/17** (live preview, port 5175).

**What this build was:** the measurement core of carving a region out of an *aligned* elevation page.
Scoped in a planning chat against the read-only recon as "three coupled changes." Two were built; one
was deferred. Two forks were surfaced and settled mid-build before any code (see below).

**The scenario (why it mattered):** the fixture's elevation page-2 carries a large, **negative** PDF-align
transform `pageTransformsRef['page-2'] = {tx:−625.6163, ty:−508.4895, s:1.5016695524872303, angle:0}`
(uniform similarity, angle 0). Before this build, carving from it stored a raw crop at the *untransformed*
canvas-world coordinates and propagated no scale — so the region showed the wrong slice of the sheet and
came up uncalibrated.

**Change 1 — crop ∘ T⁻¹ at carve commit** (`handleMeasureMouseUp`, carve branch ~line 2087). The carve
box `(rx,ry,rw,rh)` is still captured exactly as before (untransformed canvas-world via `getCanvasPos`,
unmodified). At commit, the source page's align transform is folded back out so the **stored** crop is a
raw-sheet rectangle matching what the user visually boxed: `T⁻¹(p) = (p−t)/s`, i.e.
`{ x:(rx−tx)/s, y:(ry−ty)/s, w:rw/s, h:rh/s }`. Read defensively (`tS = (srcT&&srcT.s)?srcT.s:1`, `tTx/tTy
?? 0`) ⇒ un-aligned source = identity = crop stored byte-for-byte as before. Consumed at commit only;
never frozen into a vertex; region geometry stays crop-local (raw-sheet px).

**Change 3 — scale propagation onto the region's OWN pageId, ÷s** (same block). Propagate
`getEffectiveScale(sourceId)` to `pageScalesRef.current[newRegionPageId]` **divided by the same s**:
`{ ...srcScale, pxPerMeter: srcScale.pxPerMeter / tS }`. Geometrically forced — change 1 rescales the
region's pixel frame by `1/s`, so the source's canvas-world px/m must divide by `s` to live in the region's
raw-sheet frame. No `pageRefParentRef` write, no borrow chain; uncalibrated source ⇒ region left
uncalibrated. **This corrected the build prompt's literal change-3 text** ("carries directly"), which
would have made walls in an aligned-source region measure by factor s (~1.5×) wrong — silent #22.

**Change 2 — DEFERRED** (full-page carve reachability over the negative align overhang). Recon found that
covering the negative top-left overhang requires repositioning `measureRef` to a negative offset (forcing
an offset-fold the literal `(R−t)/s` doesn't state) and touching shared layout CSS (`.canvas-stack`
overflow, `.canvas-world` fit-content). Surfaced per the build's STOP condition; Ben chose "ship 1+3 now,
defer 2." Logged as ADDITIONAL_FUNCTIONALITY **#113**. Verification **item 1** (carve across the ENTIRE
aligned page — Ben's eyeball) belongs to that deferred change, NOT to this build.

**Two forks surfaced & settled before coding:**
1. *Change-2 scope* — large-negative transform makes full-page reachability a layout seam → **defer**.
2. *Change-3 ÷s* — proved the region frame is raw-sheet px (change 1's ÷s), source scale is canvas-world
   px/m, so propagation must ÷s → **apply ÷s** (Ben confirmed his written formula was wrong).

**Verification (live preview, fresh `__restoreFixture` each):**
- `__verifyFixture` **44/44** (run once, immediately, before any interaction — destructive).
- Re-restore → `__verifyCrop` **17/17**.
- Re-restore → page-2 (aligned) → real carve via dispatched mouse events through the actual handler ×2
  overlapping: `__dumpRegions` showed `page-2-r1 crop≈(483.2,391.5 133.2×106.4)` and
  `page-2-r2 crop≈(549.8,438.1 119.9×99.7)` — matching `(R−t)/s` (x/w exact; ~0.4px y delta is a 338-vs-339
  sub-pixel artifact of synthetic dispatch, not the code) — **ownScale=76.47 = 114.83/1.5017** on each,
  **refParent=none** each, partition unique=true. (Items 2-scale, 3.)
- Re-restore → page-3 (un-aligned, no transform) → carve → `page-3-r1 crop=(120.0,89.5 220.0×159.7)`
  (x/w **exact** identity), **ownScale=114.83** (carries directly, s=1), refParent=none. (Item 5.)
- Item 2's "wall lands at correct WORLD coord via __dumpWorld" is satisfied by construction: the region's
  own pxPerMeter is verified-correct (76.47), `pageVertexToWorld` is unchanged, and `__verifyCrop` already
  proves crop-local vertices are world-invariant. (A literal end-to-end draw+__dumpWorld in a region needs
  the full categorize+draw UI; Ben can confirm that in his tab alongside the deferred item-1 eyeball.)

**Verify aid added:** `__dumpRegions` now prints each region's `ownScale` (from `pageScalesRef`) and
`refParent` (from `pageRefParentRef`) — DEV-only, tree-shaken.

**Next:** ADDITIONAL_FUNCTIONALITY **#113** (change 2 reachability) when the planning chat scopes the
offset + overflow mechanics; then the still-pending plateau waypoints (a) App.jsx simplification pass,
(b) roadmap reconciliation, then #29 derived elevations.

---

## SESSION 64 — Region auto-fit: always fit-to-height + wide-region squish fix (2026-06-30)

**Branch:** main | **Commits:** 5468153, cdb5639 (auto-fit landed pre-session) → 9ce66df (always
fit-to-height) → ccc45e0 (max-width squish fix + harness check) | **Harness:** __verifyFixture 44/44,
__verifyCrop **17/17** on fresh restore (live dev-server verified, viewport 1280×800).

**What this session was:** finished #111 (region auto-fit to viewport). Two defects fixed in sequence,
each recon'd before the fix.

1. **Axis rule wrong for wide/short regions (commit 9ce66df).** Auto-fit picked the constraining axis
   (`isHeightBound`), so wide/short regions fit-to-WIDTH and sat as a short band with empty space below.
   Per Ben's stated preference, made it **universal fit-to-HEIGHT**: `displayScale = (innerHeight−200) /
   crop.h`, uniform both axes; width overflows → horizontal scroll. Removed the per-region axis branch.

2. **Wide regions rendered horizontally SQUISHED (commit ccc45e0).** Recon pinned it: the global
   `canvas { max-width: 100% }` (App.css) clamped the backdrop's *rendered* width to the container
   (~1200px) while the inline style set the auto-fit width (e.g. 3840px) — the bitmap (aspect 6.4) was
   drawn into a 2.0-aspect box. It also defeated the `overflow-x:auto` scroll (canvas could never exceed
   container → shrank instead of scrolling). **`__verifyCrop` passed despite this** because it checked
   only `c.style.width/height` (inline, uniform) and never `getBoundingClientRect` (the clamped rendered
   box). Fix: scoped `.canvas-world canvas { max-width: none }`. Harness gap closed: `__verifyCrop`
   `dimsOk` now asserts rendered-box aspect == bitmap aspect (transform-robust) + a deliberately-wide
   `cropWide` (aspect 6.4) case that gives the check teeth.

**Verification highlights (live):** wide region → rendered 3840×600, fills viewport height, aspect 6.4
matches bitmap, stack scrollWidth 3840 > clientWidth 1200 (genuinely scrolls). Tall region → fills
height, aspect correct, no unwanted scroll. **Full-sheet regression** → 1200×800, 1:1, scrollWidth ==
clientWidth (no scroll) — removing the cap did NOT cause full-sheet overflow (inline width =
scaled.width ≤ container). **Sanity test (not rubber-stamped):** reimposing `max-width:100%` via injected
style made the new check FAIL (rendered aspect 2.0 vs bitmap 6.4). Geometry / crop offset untouched (#22).

**Process note:** `__verifyFixture` is DESTRUCTIVE (it deletes a door and checks removal) — it must run
exactly ONCE per fresh `__restoreFixture`. Running it repeatedly in one JS session pollutes state and
yields a false "6/32 FAILED". Confirmed unrelated to this session's changes by reproducing 6/32 with the
changes git-stashed, then 44/44 on a fresh server + single restore + single verify.

---

## SESSION 63 — Plateau deep-review (overnight, unsupervised) — review + reconciliation (2026-06-29)

**Branch:** main | **Commits:** d78bd40 (cosmetic) + this docs commit | **Harness:** __verifyFixture
44/44, __verifyCrop 10/10 on fresh restore (verified live via dev server).

**What this session was:** the post-#5 / pre-#29 PLATEAU waypoint, run as an unsupervised overnight
deep review. Full five-section review + adversarial self-critique + triage into EXECUTE-NOW vs
HOLD-FOR-BEN. The arbiter for every call was the documented source intention (VISION_SUPPLEMENT,
FUNCTIONALITY_SUMMARY, BUILD_ROADMAP). Almost everything substantive triaged to HOLD (by design —
the plateau is a refactor-planning + reconciliation moment, not a feature-build moment, and the one
large item — coordinate-layer extraction — is explicitly "design, don't build unsupervised").

**What was LANDED (both harness-verified / reversible / non-seam):**
1. **d78bd40** — collapsed a dead `carveMode` cursor ternary in App.jsx (`carveMode ?
   (carveDragRef.current ? 'crosshair' : 'crosshair') : …` → both inner branches identical).
   Provably behavior-identical. Cosmetic readability only.
2. **Doc reconciliation (this commit):** gate-expiry sweep + stale-claim fixes (below).

**Gate-expiry sweep (the recurring must-do):** #5 (region-pages, all forks + crop-carving) and the
identity-first renderPage/goToPageId/navPages refactor lifted exactly three gates:
- **#3 (Duplicate page) → SUPERSEDED** by #5 crop-carving. Do not build a separate duplicate feature.
- **#110 (region ghost overlay on source sheet) → GATED-READY** (regions now exist). New user-facing
  rendering — HELD for Ben, not auto-built. Checkable gate: `pages.some(p => p.crop != null)`.
- **#111 (region auto-fit) → already GATED-READY** (Session 62). User-facing viewport behavior — HELD.
The big gates remain genuinely CLOSED: R3 / per-vertex z (#66), geometry back-to-basics review
(#106–108), #74/#75 spreadsheet schema (Beat 2b, #79 penetration), #28 plan reader. None expired.

**Stale-claim fixes:** App.jsx line count in CLAUDE.md (`~3400` → `~8090`, with debt metrics);
B5 scope clarification in BUILD_ROADMAP (DONE = line wireframe only; element-Z is NOT done, gated
on R3 — checkable condition stated).

**Five-section review — headline findings** (full prose was delivered in the review chat):
- **§1 Strategy — PLAN STILL RIGHT.** Wireframe-first dependency chain (VISION_SUPPLEMENT §9) holds;
  built order matches it. No redundant/over-scoped active items. The only drift risk is doc-claim
  optimism (B5 "DONE"), now corrected. Recommendation: run waypoint (a) then (b) before #29, as planned.
- **§2 UI — accretion is real but not yet urgent.** The toolbar gate-chains (`!calibMode &&
  !drawMode && … && !carveMode && !elevEdgeMode && !elevAlignMode`) are repeated inline at ~15 sites
  with DIFFERENT mode-sets per button — there is NO single `anyActiveMode` to collapse to safely.
  This is a genuine simplification but NOT a blind one (the sets differ); belongs in waypoint (a).
  #112 (carveMode sticky across nav) is the one concrete UX leak. HELD (Ben's UX call, recommend fix a).
- **§3 Code — the concentration IS the debt.** One 8090-line component: 66 refs, 108 states, 7 ticks,
  ~47 shapeKind branches, geometry.js duplicating the shape-kind exclusion list inline
  (getEligibleShapes:232). geometry.js itself is clean and well-tested; no latent bugs found there.
  The getEffectiveScale cycle guard is correct. No correctness-risk findings landed; all structural
  debt routes into waypoint (a).
- **§4 Process — the discipline is working.** Recurring lessons (over-broad seam wiring caught &
  reverted S37; storage-shape-add-not-replace S35; compile-clean≠verification; trust-runtime) are all
  captured and were respected this session (I hit a FALSE 2/44 from running __verifyFixture while
  __verifyCrop had parked the app on page-3 — diagnosed as test-sequencing, re-ran clean = 44/44, did
  NOT touch code on a false red). **Protocol note for next sessions: run __verifyFixture immediately
  after a fresh __restoreFixture; run __verifyCrop separately (it navigates to the origin floor page
  and pollutes currentPage for any subsequent __verifyFixture, whose placement checks p.w/p.d then fail).**
- **§5 Gate-expiry — covered above.**

**WITHDRAWN on self-critique** (review that withdraws nothing wasn't skeptical):
- *Auto-collapse toolbar gate-chains into one `anyActiveMode`* — withdrawn as a standalone fix: the
  per-button mode-sets are NOT identical, so a blind collapse would change which buttons show in which
  mode. Folded into waypoint (a) instead.
- *Land #112 / #110 / #111 now* — withdrawn from EXECUTE: all three are user-facing behavior changes;
  discipline holds user-facing 50/50s for Ben even when low-risk. Emitted as HOLD prompts.
- *Add `isPolygonShape` helper to geometry.js and dedupe the getEligibleShapes exclusion list* —
  withdrawn as a one-off: it is one instance of the shape-kind-dispatch-table item (waypoint a, item 3);
  doing it alone fragments that work.

### READY-TO-RUN HOLD PROMPTS (ranked; fire after morning review)

**HOLD-1 — Coordinate/transform-layer extraction (plateau waypoint a, item 1). HIGHEST VALUE.**
Model: Opus/high to plan + define the seam boundary; Sonnet/medium for the mechanical move once agreed.
Prompt: "Behavior-preserving extraction (Fork-A discipline). Move the coordinate/transform seam —
`pxToMeters`/`metersToPx` (already in canvasRenderer.js), `getEffectiveScale`, `getWorldOriginM`,
`pageVertexToWorld`, `elevYToWorldZ`, and `makeVertex` — behind ONE clean module boundary so App.jsx
never does raw px/meter arithmetic inline. CONSTRAINTS (load-bearing, do not violate): geometry stays
stored in PIXELS (Path 3); the crop offset is never folded into scale (#5 Fork B); scale is ALWAYS
resolved via getEffectiveScale, never raw pageScalesRef (origin-poisoning guard); recalibration-
independence (#22) preserved. Do NOT widen the seam into a universal read path — the S37 lesson
(resolveEffectiveConfig wired into getConfigValue, reverted) applies directly: keep named consumers.
AUDIT every call site before moving any code; the success criterion is 'nothing changed'. Verify:
__verifyFixture 44/44 + __verifyCrop 10/10 on fresh restore, AND __dumpWorld output byte-identical
before/after. Land in one reviewable commit; STOP-ON-RED revert if any check drops."

**HOLD-2 — Full gate-rephrase pass (plateau waypoint b completion).** Doc-only, judgment-heavy.
Prompt: "Walk EVERY deferred entry in ADDITIONAL_FUNCTIONALITY.md. Tag each gate gate-still-real /
gate-lifted-ready / gate-partially-lifted, and rewrite each as a CHECKABLE CONDITION (the specific
thing that must exist — e.g. 'needs non-null z on completedShapesRef vertices via a named seam' — not
'needs R3'). Lightweight prose only; no formal dependency graph. Session 63 already did the bounded
expiry sweep (#3/#110/#111) and the near-term gates; this is the exhaustive remainder. Do WITH Ben for
the construction-domain gates (#106 U-values, #18 roof slope, #79 penetration)."

**HOLD-3 — #112 carveMode reset on navigation.** One-liner, but user-facing → Ben's call.
Recommended: add `setCarveMode(false); carveDragRef.current = null` to `goToPageId` (App.jsx:952),
matching how it already resets every other mode. Safe for multi-carve: the carve-commit path navigates
via `renderPage` directly (App.jsx:2088), not goToPageId, so chained carving is unaffected. Verify:
carve a region, then sidebar-nav away → carve exits and Set Scale/Draw reappear; harness still green.

**HOLD-4 — #110 region ghost overlay on source sheet (GATED-READY).** New stateless drawer in
canvasRenderer.js stroking labeled rectangles for each region whose source is the current sheet
(crops from `pageCropsRef` filtered by `pageIdMapRef.current[pageNum] === currentPageId`); gate on
`currentPageIsSourceSheet`; read-only, no hit-testing. UX call: whether the carve map shows.

**HOLD-5 — #111 region auto-fit to viewport — DONE (Session 64; commits 9ce66df, ccc45e0).** Baked
into `renderPage`'s crop branch: always fit-to-HEIGHT (`displayScale = (innerHeight−200)/crop.h`,
uniform), width overflows → horizontal scroll. Companion CSS fix exempts `.canvas-world canvas` from
the global `max-width:100%` cap (was squishing wide regions). Geometry / crop offset untouched (#22).

**HOLD-6 — #106 assembly-inheritance fix (thermal arc, gated on geometry review).** Wire the four
Project Setup `assembly-*` CONFIG_FIELDS to the `getSurfaceAssembly` miss path via an
`ASSEMBLY_TYPE_DEFAULTS` lookup (U + thickness, Ben's construction values); Project Setup = project
default, Envelope per-surface inputs = override. Touches the assembly resolver seam + changes F280
results → HOLD. Gated until the geometry back-to-basics review completes.

---

## SESSION 62 — Page-region fix: render-identity + regionCounter self-heal — DONE (2026-06-29)

**Branch:** main | **Commit:** ee9427f (fix) + docs commit

### The two defects (from prior read-only recon)

Interactive verification of the Session-61 crop-carving UI surfaced a "scale/crop cross-bleed":
calibrating/Enhancing one region appeared to change what a *different* region rendered. A read-only
recon (prior session) diagnosed it as **render-only — geometry was always safe** (crop-local by
construction; `__verifyCrop` 10/10 proves world coords invariant under crop). Two defects:

**Defect 1 — incomplete `forPageId` plumbing (the cross-bleed).** `renderPage` resolved its target as
`forPageId ?? getPageId(pageNum)`, and `getPageId(pageNum)` returns the SOURCE sheet's `page-N` for any
region (regions share their source's `pageNum`; `pageIdMapRef` is 1:1 `pageNum→page-N`). So any
`renderPage` call WITHOUT `forPageId` — Enhance/De-enhance, toolbar arrows (via `goToPage`), fixture
restore — rendered the source full sheet instead of the region's cut.

**Defect 2 — `regionCounterRef` not persisted.** Reset on upload, incremented per carve, but NOT
snapshotted/restored. Restore a fixture with `page-N-r1/r2` then carve → counter restarts at 1 →
new region collides on `page-N-r1` (true data collision: shared pageId/crop/scale/geometry).

### The fix (root-cause, not per-call-site patch)

**Defect 1 — `renderPage` is now identity-first.** Signature changed `renderPage(pdfDoc, pageNum, {…, forPageId})`
→ **`renderPage(pdfDoc, pageId, {resizeMeasure})`**. The PDF sheet to rasterize is DERIVED from the pageId
via the new **`pageNumFromId(pageId)`** helper (decodes `page-8` → 8, `page-8-r2` → 8 — every pageId
encodes its source sheet). There is NO `getPageId(pageNum)` fallback left to forget. The caller always
supplies the authoritative pageId: navigation supplies the destination; the Enhance same-page re-render
supplies `currentPageId` (correct because it isn't navigating).
- **`goToPage` + `goToRegionPage` unified into `goToPageId(pageId)`** — the single navigation entry point
  (handles root sheets AND regions; renderPage decodes the sheet). All call sites updated.
- **Toolbar arrows are now region-aware.** Old `navSet` (pageNums) → new `navPages` (ordered LOGICAL
  pages by pageId): `orderLogical` sorts by `(pageNum, regionIndexOf)`. `handlePageNav` steps by
  `navOrderKey` (works even when the current page isn't in the set, e.g. sitting on a source sheet).
  Each region is a distinct arrow stop rendering its own cut. Source sheets excluded.
  New helper **`regionIndexOf(pageId)`** (`page-8` → 0, `page-8-r2` → 2).
- **Snapshot now stores `currentPageId`**; restore renders `obj.currentPageId ?? getPageId(obj.currentPage)`
  (fallback decodes the sheet for pre-region snapshots like `bates.json`). So restore can target a region.
- Enhance, restore, and the DEV helpers (`__setCrop` guard, `__verifyCrop` render calls) all pass pageId.

**Defect 2 — restore self-heals the counter.** After restoring `pageCrops`, `regionCounterRef` is rebuilt
from the max existing `-rK` suffix per sheet (`/^page-(\d+)-r(\d+)$/`). The next carve picks max+1 and
cannot collide even if the counter was lost. (Self-heal, NOT snapshotting the counter.)

### Verification (browser — bates.json 10-page real set + fixture-elevation.json)

A **missed edit caught at runtime** (this is why we verify, not reason): the Enhance call site still passed
`currentPage` (a number) after the signature change → `renderPage` threw `getPage(null)` and no-opped, so an
early "cut stays region" read was a FALSE PASS (Enhance was simply erroring). Fixed (`currentPage` →
`currentPageId`), then re-verified non-vacuously:
- Enhance on a region keeps the cut (CSS 300px = region) AND scales resolution (bitmap 300→600);
  full-sheet enhance still scales (673→1346).
- Arrows step each region as its own page: Page 1 (673) → Page 3 (673) → R1 (300) → R2 (220) → R3 (210).
- Restore onto a region renders the region cut (`currentPageId: page-9-r3` → 210px, not the 673 sheet).
- Restore + carve → `page-9-r3`, no collision, `r1` crop unchanged (defect 2 self-heal).
- **Original symptom refuted:** calibrating region 1 wrote scale ONLY to `page-9-r1` —
  `pageScaleKeys: [page-4, page-8, page-9-r1]`; siblings r2/r3 and source page-9 got nothing.
  A wall drawn on region 1 partitions to its pageId (`__dumpRegions`: 1 shape / 3 regions, IDs unique).
- Fresh restore: `__verifyFixture` 44/44, `__verifyCrop` 10/10 (geometry untouched). Build clean; lint
  neutral (76 problems on HEAD and working tree — 0 new).

### Observations / flags for Ben

- **`carveMode` is not reset by navigation** (`goToPageId` resets every OTHER mode but not carve; restore
  doesn't either). It IS intentionally sticky after a carve-commit (multi-region carving). But navigating
  to a region via sidebar/arrow while carve is still on hides Set Scale/Draw until "Exit carve ✕", and a
  drag on a region would carve a sub-region. Logged as **ADDITIONAL_FUNCTIONALITY #112** (UX call — left
  for Ben; out of scope for these two defects). NOT my regression — neither original nav function reset it.
- **Gate-expiry sweep:** **#111 (region auto-fit) is now GATED-READY** — its stated gate was "pair with the
  scale/crop-bleed fix session," which is this one. Flagged below; not built.
- CLAUDE.md project-path line corrected to `C:\dev\collabinator` (was the stale `pdf-viewer` path).

### Next

Plateau waypoints (still pending, #5 done): (a) simplification pass — coordinate-layer extraction from
App.jsx (plan with Opus first); (b) roadmap reconciliation. Then #29 (derived elevations).

---

## SESSION 61 — Page-region model (#5): crop-carving UI — DONE (2026-06-29)

**Branch:** main | **Commit:** 8d6e57d

### What was built

**Crop-carving UI — the user-facing half of #5 (all four infrastructure forks A–D were done in prior sessions).**

Design confirmed with Ben before code (prose design proposal approved with one fork-2 mod: source sheets
get a "(full sheet)" chip AND become carve-surface-only once they have regions, preserving the no-overlap invariant).

**Core mechanics:**
- `carveMode` state + `carveDragRef.current = {x1,y1,x2,y2}` live drag + `carveTick` for repaint.
- mouseup commits: if drag ≥20×20px → `regionCounterRef.current[pageNum]++`, new `page-N-rK` pageId,
  `pageCropsRef.current[newPageId] = crop`, `setPages(prev => [...prev, { pageId, pageNum, crop, ... }])`,
  then `renderPage(pdf, currentPage, { forPageId: newPageId })` to navigate immediately.
- Carve mode stays active after each commit (allows multiple regions per session entry).
- Amber dashed rect overlay drawn from `carveDragRef.current`; `carveTick` in passive-repaint deps drives it.

**Suppression (`currentPageIsSourceSheet`):**
- `sheetsWithRegions`: derived Set of root pageIds that own ≥1 region-page.
- All mode-specific toolbar buttons gated with `!currentPageIsSourceSheet` (Draw, Edit, Scale) or
  `!carveMode` (Set North, elevation buttons, grade line, Draw run). `drawDisabledHint` source-sheet message
  takes priority. Categorize panel shows inline suppression message.

**Navigation:** `goToRegionPage(pageId)` → finds `pageEntry.pageNum` → `renderPage(pdf, pageNum, {forPageId})`.
`advanceToNextUncategorized` iterates `pages[]`, computes `srcSheets` fresh from passed `pagesList`, skips
source sheets, calls `goToRegionPage`.

**Sidebar:** source sheet shows "(full sheet)" chip; regions appear as "Region K of p.N" in Unused Pages.
Active check and click both keyed by `pageId`.

**DEV:** `__dumpRegions()` — groups regions by source sheet, partition check, unique-ID summary.

**CSS:** `.carve-btn`, `.carve-exit-btn`, `.sidebar-full-sheet-chip`.

### Verification

- 44/44 `__verifyFixture()` on clean restore ✓
- Two carved regions: correct crops, sidebar entries, canvas resized to crop dims ✓
- Carve mode: all non-carve buttons hidden ✓
- Snapshot/restore round-trip: `pageCrops` survives ✓
- `__dumpRegions()` partition: `all IDs unique: true` ✓

**Interactive verify Ben still needs (in his dev-server tab):**
- Carve two regions on one real sheet; categorize each independently
- Place a shape in a region; verify world coordinate via `__dumpWorld()`
- Run `__verifyFixture` → 44/44

### Gate-expiry sweep — ⏸ PLATEAU WAYPOINTS now triggered

#5 is fully done. The two plateau waypoints in BUILD_ROADMAP.md §⏸ are now unblocked:
(a) SIMPLIFICATION PASS — coordinate-layer extraction (plan with Opus first; hard gate was #5 done).
(b) ROADMAP RECONCILIATION — gate-rephrasing + deferred-register sweep.
Both fire before #29 (derived elevations). Next session should begin with plateau planning.

### Forward

1. **⏸ Plateau waypoints (a) then (b)** — before any feature work.
2. **#29 (derived elevations)** after plateau.
3. F280 track still paused (geometry review applies at plateau).

---

## SESSION 60 — Page-region model (#5): Fork D categorization rekey (2026-06-29)

**Branch:** main | **Commit:** 579bbf1

### What was built

**Fork D — rekey categorization handlers from pageNum to pageId (commit 579bbf1).**

Full audit before any code: 13 sites identified, all in App.jsx. `recatPageNum` state
renamed to `recatPageId` (holds a pageId string). All confirm/skip/startRecategorize map
predicates changed from `p.pageNum === currentPage` to `p.pageId === currentPageId`. The
`currentPageEntry` derived const rekeyed. The `useEffect` that loads the draft on mode-entry
and page-navigation rekeyed (dep array: `currentPage` → `currentPageId`). JSX summary-vs-editor
guard rekeyed (`recatPageNum !== currentPage` → `recatPageId !== currentPageId`). All four
`setRecat*(null)` reset callsites updated. `advanceToNextUncategorized` intentionally left on
pageNum — it cycles through PDF sheets for navigation (`goToPage(pn)` takes a pageNum) and is
correct as-is.

Build: clean (vite build 750ms, no errors). App loads with no console errors.

**Browser verification required (Ben's dev-server tab):** restore fixture, categorize a floor
plan / elevation / roof page, confirm each lands correctly, verify Recategorize works, run
`window.__verifyFixture()` → 44/44.

### Gate-expiry sweep

No new gates expired this session — Fork D is a pure structural rekey. The next gate expiry
fires when the **crop-carving UI** lands (that completes #5 and triggers the plateau waypoints
in BUILD_ROADMAP.md §⏸).

### Forward

**Next: crop-carving UI** — the user-facing half of #5. User drags a crop box on the PDF sheet;
each crop spawns a `pages[]` entry with `pageId`, `crop: {x,y,w,h}`, own category+subLabel, own
scale, own position in the reference tree. Once this lands, #5 is done and the plateau waypoints
(simplification pass → roadmap reconciliation) become unblocked.

---

## SESSION 59 — Page-region model (#5): Fork A nav verify + Fork B crop-local frame (2026-06-29)

**Branch:** main | **Commit:** 4928a5a (Fork B) + this doc-update commit.

### Fork A navigation gate — VERIFIED CLEAN (the outstanding Session-58 gate)

Drove multi-page navigation in the dev browser by **both paths in both directions** — toolbar
arrows (‹ ›, which cycle categorized pages only: 2→3→5→7) and direct sidebar jumps — across the
fixture's category spread (page-2 elevation, 3 Crawlspace floor, 5 Main Floor floor, 7 roof,
1 site). Read the page-gated toolbar at each stop. Results: elevation buttons (Set elevation edge /
Align elevation / Place opening) appear ONLY on page-2 and **re-light on every re-entry by any path**
(sidebar jump AND reverse arrow) — the canonical stale-pointer test passed. Floor pages gate Draw/
Edit/Draw-run correctly and even differentiate anchor floor ("Scale set ✓ Re-calibrate") from
borrow-chain floor ("Realign"). Roof gates correctly; site plan shows minimal (Set Scale, Draw;
no Edit, no elevation). Zero console errors. `currentPageId` (first-class state since f41cb7c)
tracks correctly across navigation. **No code changed — verification only.** Fork B unblocked.

### Fork B — crop-local coordinate frame in renderPage (commit 4928a5a)

**Consequential seam planned-as-prose and confirmed with Ben before code** (rasterization-offset
model chosen over an explicit CSS crop layer; `pages[i].crop` as data location with full-sheet
fallback; placed-point world-coordinate assertion added to verification).

- **`pageCropsRef.current[pageId] = {x,y,w,h}`** (scaled-sheet pixels) — hot-read store for
  `renderPage` (useCallback []; stale-closure-safe via ref). `pages[i].crop` is the serialized
  mirror. Reset on PDF upload; round-tripped through snapshot/restore.
- **renderPage:** when a crop is present, `measureRef` is sized to the crop box (its (0,0) becomes
  the crop's top-left, so stored geometry is crop-local **by construction** — no offset is added to
  any vertex); the backdrop is rasterized via `page.getViewport({ scale: scale*mult, offsetX:
  -crop.x*mult, offsetY: -crop.y*mult })` so the crop maps to canvas (0,0) and the crop-sized canvas
  bounds clip the rest (viewport translate + clip). **Absent crop = byte-for-byte today's full-sheet
  path** (preserved verbatim in the `else` branch).
- **Passive/never-frozen guarantee:** the crop offset is consumed at rasterization only — never
  written to `pageTransformsRef`, never folded into `getEffectiveScale`, never stored on a vertex.
  The user-driven `pdf-align-layer` composes on top unchanged → recalibration-independence (#22)
  untouched. The CSS transform stack (canvas-world zoom/pan → pdf-align-layer user_align → canvasRef)
  is **unchanged**; crop_viewport is the innermost transform, realized at the rasterization read.
- **DEV:** `window.__setCrop(pageId, crop)` writer; `window.__verifyCrop()` — 10 checks: frame
  sizing (measureRef = crop box, backdrop bitmap = crop×mult, backdrop CSS = crop box) at two
  distinct crops + cleared, plus the **placed-point world-coordinate assertion** (the origin floor's
  traced world coords are invariant under crop A, crop B, and clear).

**Verified (preview/dev server 5175):** existing `__verifyFixture` **44/44 PASS** (no-crop path
unchanged); `__verifyCrop` **10/10 PASS**; screenshot confirmed the backdrop offset+clip (crop's
top-left → canvas (0,0), rest clipped). Zero console errors.

### Forward

**Fork C is already resolved** (dissolved when Fork A landed — `currentPageId` set directly).
**Next: Fork D** — rekey categorization confirm/skip handlers from `pageNum`
(`p.pageNum === currentPage`) to `pageId` so two crops on one sheet categorize independently.
**Then the crop-carving UI** (drag a crop box on the sheet → spawn a region-page entry with
`pages[i].crop` + parent sheet + own category) — the user-facing half of #5. Z-datum guardrail
still holds: region-pages must NOT region-scope the Z datum (#7).

---

## SESSION 58 — Page-region model (#5), Fork A + Z-datum model doc update (2026-06-29)

**Branch:** main | **Commits:** f41cb7c (Fork A refactor); doc-update commit this session.

### What was built

**Fork A — `currentPageId` promoted to first-class React state (commit f41cb7c).**
Removed the render-scope derived const `const currentPageId = getPageId(currentPage)`.
`currentPageId` is now `useState(null)`, set inside `renderPage` alongside `setCurrentPage`,
and cleared alongside `setCurrentPage(null)` on PDF upload. All 20 `getPageId(currentPage)` call
sites converted to direct `currentPageId` reads. `getPageId()` helper survives — used only in
`renderPage`. Verified: clean load, zero console errors, zero remaining `getPageId(currentPage)` calls.

**Fork C resolved:** `pageIdMapRef` 1:1 assumption dissolves naturally once Fork A is done
(now `currentPageId` is set directly, not derived from `pageIdMapRef`). No explicit Fork C work needed.

### Outstanding verification (DO BEFORE FORK B)

**Multi-page navigation was NOT explicitly exercised.** Load-clean was confirmed; toolbar gates and
elevation mode activation per-page were NOT verified. Promoting derived→state fails at NAVIGATION,
not load — the initial value matches, but a stale-closure or missing dep could leave `currentPageId`
behind on page switch. Before Fork B: load a multi-page PDF, navigate between pages, and confirm
toolbar gates (draw/edit/elevation/align buttons) update correctly per-page.

### Z-datum model doc update (this session)

Added "Z-DATUM MODEL (planning chat, settled)" block to ADDITIONAL_FUNCTIONALITY.md #7:
- One building-wide base datum = lowest FLOOR_ORDER floor's floor plane, fixed once set.
- All Z values are signed offsets from base (above = positive, below = negative).
- `accumulateZ` extends cleanly — no implicit lowest-is-zero assumption reintroduced.
- Datum-mode toggle: "lowest floor = 0" / "ground level = 0" — READ-TIME render parameter only
  (NOT stored project setting). Ground-level mode DISABLED-WITH-HINT until grade-line-to-Z
  resolves (R3-gated). Lights up for free when that gate lifts.

Added Z-datum guardrail to #5 (region-pages must NOT region-scope the Z datum; base datum and
`accumulateZ` stay building-wide and FLOOR_ORDER-keyed).

### Forward

**Next build session:** Verify multi-page navigation before Fork B. Then Fork B (crop-local
`renderPage` coordinate frame) — CONSEQUENTIAL seam: crop-offset MUST be passive/visual only;
recalibration-independence invariant #22 must be honored; compose
`crop_viewport → user_align → canvas_world` at READ time, never freeze the offset into stored
pixel coordinates. Fork D (rekey categorization handlers by pageId not pageNum) follows.

---

## SESSION 57 — Page-region model (#5) recon + gated-ready resurfacing (2026-06-29)

**Branch:** main | **No code built this session — recon + doc updates only.**

### What was done

**Task 1 — pageId-consumer recon (read-only).** Full inventory of every consumer that keys off
`pageId` and what a logical region-page (a pageId carrying a parent-sheet id + crop rectangle +
own category) would require of it. Summary: 13 consumers are clean extensions (already keyed by
pageId, accept new pageIds transparently). Four consumers are design forks requiring explicit
resolution before the #5 build session:

- **Fork A:** `currentPage` (pageNum) must become `currentPageId` (region pageId) as the primary
  navigation pointer. `getPageId(currentPage)` is 1:1 today; it is ambiguous 1:M with regions.
  ~20 call sites migrate. `currentPage` (pageNum) stays as the "which PDF sheet" pointer.
- **Fork B:** `renderPage` must establish a crop-local coordinate frame. `measureRef` must be
  sized to the crop box, not the full sheet. The PDF backdrop renders with a viewport translate+clip
  so canvas pixel (0,0) maps to the crop's top-left. A fixed crop-offset transform composes
  beneath the existing user-driven `pageTransformsRef` alignment transform.
- **Fork C:** `pageIdMapRef` 1:1 assumption dissolves (resolved when Fork A is done).
- **Fork D:** Categorization confirm/skip handlers key by `pageNum` (`p.pageNum === currentPage`);
  must rekey by `pageId` so two crops on the same sheet can be independently categorized.

**Task 2 — gated-ready sweep.** Added "GATED-READY (resurfaced 2026-06-29)" notes to
ADDITIONAL_FUNCTIONALITY.md entries #5, #29, #53. Confirmed #28, #23, #17, #16, #8 remain
correctly gated (all need R3 / Phase 2 or the post-3D deep-review waypoint).

**Task 3 — planning-chat definitions logged into ADDITIONAL_FUNCTIONALITY.md.** Added to #5
(page-region model: one sheet → user carves crops → each crop = independent logical page) and
to #29 (derived-elevation step: derives from floor-plan edge + accumulateZ, shown for confirm,
not freehand-traced; faceKey grouping for U-court / different-plane walls).

**Task 4 — PARALLEL_TRACKS_LEDGER.md updated.** #93 resolved (click-to-edit labels removed,
commits 27257b9 + c96de9f) recorded in new "Resolved side-quests" table.

### No code changes

Session is recon and documentation only. Zero changes to App.jsx, geometry.js, canvasRenderer.js,
or any source file.

### Forward

**Next build session:** Start with the four forks from the Task 1 recon. Resolve Fork A first
(makes `currentPageId` first-class state — unlocks Forks C and D). Then Fork B (crop-local
`renderPage`). Build in pieces; each fork is independently verifiable in the browser.

**After #5 is built:** #29 (derived elevations) queues behind it. #53 (setback hover annotation)
is a cheap interleave anytime after the page-region build.

**F280 track remains paused** until geometry/input layer is reviewed and stable.

---

## SESSION 56 — F280 above-grade conductive endpoint (2026-06-29)

**Branch:** main | **Commits:** App.jsx F280 changes committed and pushed to origin.

### What was built

**`deriveF280Heating(enumeration, resolvedConfig)` — pure derive-on-demand function.**

- **`F280_TI_HEATING = 22`** — module-level const (°C); indoor heating design temperature; hardcoded pending a project config field (#106). Comment marks the future `ti-heating` CONFIG_FIELDS entry.
- Four surface kinds in `bySurfaceKind` map: `'wall-surface'` (netAreaM2 × effectiveUValue), `'flat-roof-surface'` (insideFaceAreaM2 × effectiveUValue), `'window'`/`'door'` (widthM × heightM × uw).
- No-climate guard: `toh === null` → `{ status:'no-climate', total:null }`. ΔT never computed against null.
- Surfaces missing U-value increment `unresolvedCount` per kind — area still counted, no loss contribution, no silent zero.
- `notModeled: ['below-grade-wall','slab-on-grade','floor-over-unheated','solar-gain']` — explicitly marks the subtotal as incomplete.
- Extensible spine: adding a below-grade or slab result row = adding a bucket and a loop; no refactor.
- **`'f280'` tab** added to `SIDEBAR_TABS`; `showF280` derived flag.
- **F280 Results panel** inside consolidated side-panel: design conditions block, per-kind table (Kind | Area m² | Ū | Loss W), amber unresolved-U warnings, kW subtotal, greyed notModeled list. No-climate guard shows explanatory text.
- **`window.__dumpF280()`** — DEV console hook, tree-shakes from production.

### Unresolved-U diagnosis (recon only)

`__dumpF280()` on the Bates fixture shows 9/10 walls unresolved. **Verdict: (A) incomplete assignment — not a seam bug.**

- Wall seam is internally consistent: `surfaceAssemblyRef` had only one entry when the fixture was saved. No key-mismatch bug.
- **Dual-entry UI trap confirmed:** `CONFIG_FIELDS` `assembly-wall`/`assembly-foundation`/`assembly-roof`/`assembly-floor` in Project Setup write to `projectSetupRef.current.values` and are **never read** by `getSurfaceAssembly`. The Envelope panel per-surface U inputs are the ONLY load-bearing path. Scoped as #106.
- **Flat-roof:** assembly seam code exists, UI input block is absent (App.jsx:7339–7350). Incidentally fixed by #106. Logged as #107.
- **Windows/doors:** `uw` stored at placement via WEW bridge; manual placement lands `uw:null` permanently; no post-placement edit path. Separate gap logged as #108.

### Strategic pivot (settled this session)

**Target: "nearly-compliant full heat loss/gain sooner, compliance as a later pass."** The `notModeled[]` list in `deriveF280Heating` is the explicit acknowledgement of incompleteness.

**Decision to pause building for a geometry back-to-basics review.** Geometry layer (wireframe / enumeration) is layer one; F280 is downstream. Further thermal builds wait until the geometry model is reviewed and confirmed stable.

### Forward

Next: geometry back-to-basics review as a planning session. Then: #106 assembly-inheritance fix (unlocks full wall U-coverage) → below-grade + slab geometry → ground-coupled base-level loss (separate engine from above-grade, using `BasementHLR.xls` / `SlabOnGradeHLR.xls` supplemental calculators) → solar gain. Each is an additive result row in `deriveF280Heating`.

---

## SESSION 55 — Flat-roof-surface element in deriveEnumeration (F280 conductive prep) (2026-06-28)

**Branch:** main | **Commit:** dccce9e — pushed to origin.

### What was built

**Flat-roof ceiling surface as a named element in `deriveEnumeration()` STEP A.5:**

- New STEP A.5 inserted between STEP A (wall surfaces) and STEP C (soffits) in `deriveEnumeration()`.
- Iterates all confirmed roof-plan pages; for each, collects locked non-shapeKind shapes with `roofType === 'flat'`, projects their vertices to world meters via `pageVertexToWorld`, computes shoelace area, sums all flat sections into a single `flat-roof-surface` element per page.
- Element fields: `id` (`flat-roof-page-N`), `kind:'flat-roof-surface'`, `pageId`, `grossAreaM2`, `netAreaM2` (= gross; no openings today), `openingAreaM2: 0`, `insideFaceAreaM2` (= gross; horizontal ceiling, interior = exterior, no offset), `roofCeilingZm` (ceiling Z of highest floor from `accumulateZ` topRow), and the full assembly seam fields (`effectiveUValue`, `effectiveRSI`, `controlLayers`, `thicknessM`, `assemblySource`) from `getSurfaceAssembly`.
- Sloped/pitched roof Z-derivation deferred (#18); only `roofType:'flat'` shapes included.
- If multiple flat polygons exist on a roof page, their areas are summed → one element per page.

**Harness extension — check (s)/(s.area):**
- `__dumpEnumeration` extended with `flat-roof-surface` branch: prints footprint area, roofCeilingZ, assembly U/thickness.
- `__verifyFixture` extended with checks `(s) flatRoofSurface exists` and `(s.area) flatRoofSurface.grossAreaM2`.
- `fixture-elevation.expected.json` re-frozen with `flatRoofSurface: { id:'flat-roof-page-7', grossAreaM2:22.9471 }`.
- **44/44 PASS in browser** on fixture-elevation.json.
- Negative control: corrupting `grossAreaM2` in sidecar → exactly `(s.area)` fails.

**Envelope panel:**
- `flat-roof-surface` added to `KIND_ORDER` and `KIND_LABELS` between wall-surfaces and soffits.
- Panel row shows: footprint area (m²), ceilingZ, assembly status (manual U/thickness or "(no assembly — unset)").

### Forward

F280 above-grade conductive endpoint is the next slice — it is the visible payoff. All gates are now lifted:
- `toh` → `resolveEffectiveConfig().toh` (e7a52bf)
- Wall surfaces → `netAreaM2` + `effectiveRSI` in `deriveEnumeration()` STEP A
- Openings → `widthM × heightM` + `getRsiW(uw)` in STEP D
- Flat-roof ceiling → `insideFaceAreaM2` + assembly seam (this session)
- Scope fork (above-grade conductive only vs full 13-surface loop) is Ben's call before build starts.

---

## SESSION 54 — F280 Climate slice: location/Toh prerequisite data layer (2026-06-28)

**Branch:** main | **Commit:** e7a52bf — pushed to origin.

### What was built

**Three-part climate input slice — prerequisite for the F280 conductive heat-loss endpoint:**

**Part A — Static weather register (`src/data/f280-weather.json`):**
- Extracted from `C:\dev\CSA_F280-12\F280_Weather.xls` (encrypted; opened via Excel COM on Windows).
- 679 entries (730 rows minus 51 blank city/region rows). National coverage: BC 108, ON 230, QC 125, AB 55, all other provinces present.
- Fields per entry: `station`, `region`, `dhdbt` (=Toh), `dcdbt`, `degday`, `strange`, `ohr`, `dgtemp`, `janWind`, `julWind`, `monthlyTemps[12]`, `lat`, `lng`.
- All fields carried even though only `dhdbt` is consumed this slice — avoids re-extracting for BASESIMP/AIM-2/cooling later.
- The encrypted .xls is NOT a runtime dependency and NOT copied into the repo.

**Part B — Two new CONFIG_FIELDS in 'Climate' category:**
- `location-station` (multi:false, select): 679 options, value = `"station|||region"` composite (e.g. `"Vernon|||BC"`) — unique across provinces. Cities like Richmond, Princeton, Windsor appear in multiple provinces; composite key prevents duplicate-key React warnings and lookup ambiguity. Label = `"Vernon, BC"` etc.
- `toh-override` (kind:'number', multi:false): number input, `step=0.5`, allows negatives (Toh ranges from −45 to +28 in the register). Empty = null = no override. New `kind:'number'` render branch added before `kind:'count'` in the Project Setup panel JSX.

**Part C — `resolve-toh` cross-field rule in `CONFIG_CROSS_FIELD_RULES`:**
- Override wins: if `toh-override` is a non-null, non-NaN number → `resolved.toh = that number`.
- Register lookup: else if `location-station` set → parse `station|||region`, find exact match in `F280_WEATHER`, return `entry.dhdbt`.
- Neither → `resolved.toh = null`.
- `toh` is DERIVED — never stored as raw intent. `getConfigValue` returns raw; `resolveEffectiveConfig` returns resolved. Two honest truths, identical to existing pattern.

**DEV — `window.__verifyToh()`:** 6 checks, all PASS:
1. Register count > 650 (got 679) ✓
2. Vernon exact match → dhdbt = -20 ✓
3. Victoria / Victoria Gonzales Height are distinct entries ✓
4. `location-station = 'Vernon|||BC'`, no override → resolved toh = -20 ✓
5. `toh-override = -25` → resolved toh = -25 (override wins) ✓
6. Neither set → resolved toh = null ✓

**Bug caught and fixed during build:** Duplicate React `key` warnings from bare station name as option value — cities appear in multiple provinces (Richmond BC + ON, Grand Falls NB + NL, etc.). Fixed by using `station|||region` composite as both `value` and React key.

### Forward

F280 above-grade conductive endpoint: consume `resolveEffectiveConfig().toh` (now available) + `deriveEnumeration()` wall surfaces + openings → `HLage = A / RSI × DTDh` per surface → `HLb = Σ`. Scope fork (walls+openings only vs. full 13-surface loop) still Ben's call before that build starts.

---

## SESSION 52 — Opening thermal fields: uw + shgc (F280 opening contract) (2026-06-28)

**Branch:** main | **Commit:** (this session) — pushed to origin.

### What was built

**Opening thermal fields slice — F280-spec-driven data layer:**

Read `F280_COMPLIANCE_SPEC.md` Section 4 from CollabinatorF280 @ d94c18a (read-only). Contract:
- Engine requires `RSI_W` (m²·°C/W, whole-window thermal resistance) and `SHGC` (dimensionless).
- `RSI_W = 1 / uw` where `uw` is the user-facing U-value in W/m²·K (metric). RSI_W is engine-internal only.
- Source hierarchy: manufacturer-rated data preferred; F280 Tables 6E–6H fallback (#103).

**Fields added to opening record (additive — widthM/heightM coupling guard unchanged):**
- `uw: number | null` — W/m²·K metric U-value. From WEW bridge `performance.uw` (verbatim) in `placeOpeningFromEntry`; `null` in `confirmOpening` (interactive dialog UI not yet built).
- `shgc: number | null` — dimensionless. From WEW bridge `performance.shgc` (verbatim) for windows; **always `0` for doors** (opaque-by-model rule — see below). `null` for interactive placement.

**Opaque-door SHGC rule:** Under Collabinator's model, a door is opaque by definition. Any glazed light in a door is a future parented sub-item (#104). Therefore every door's `shgc` is set to `0` (no solar gain through a solid door) in both creation paths. The door's `uw` is retained (still loses heat conductively). Windows are unchanged.

**`getRsiW(uw)`:** Module-level pure function. Returns `1/uw` or `null`. Never stored. Mirrors `resolveEffectiveConfig` pattern: user field (`uw`) is stored intent; engine-internal value derived on demand.

**`deriveEnumeration` STEP D:** `uw` and `shgc` emitted per fenestration element alongside existing fields.

**Harness: 34 → 42 PASS.** 8 new `(r.*)` checks:
- `(r.w.uw)` window uw from bridge === 1.4
- `(r.w.shgc)` window shgc from bridge === 0.32
- `(r.w.rsiW)` rsiW NOT stored on record (undefined)
- `(r.w.derived)` getRsiW(1.4) ≈ 0.7143
- `(r.d.uw)` door uw from bridge === 1.8
- `(r.d.shgc)` door shgc === 0 (opaque, not bridge value)
- `(r.d.rsiW)` rsiW NOT stored on record
- `(r.d.derived)` getRsiW(null) === null

### New deferred entry

**#104** — Glazed-in-door as parented sub-item. See ADDITIONAL_FUNCTIONALITY.md #104.

### F280 fork (not yet settled)

Endpoint scope: above-grade conductive slice only (walls + openings, Cl. 5.2.1 heating) vs full 13-surface loop. Ben's call before F280 endpoint build starts.

### Forward

F280 endpoint. Scope fork to settle first. Opening thermal fields are on every opening record; endpoint can consume `uw` directly.

---

## SESSION 51 — #10(c) PDF backdrop resolution toggle: Enhance / No seriously, enhance / De-enhance (2026-06-28)

**Branch:** main | **Commit:** 6e06677 — pushed to origin.

### What was built

**Three-tier PDF backdrop resolution toggle — backdrop-only, geometry untouched:**

- `BACKDROP_MULTIPLIERS` `{ normal:1, enhance:2, ultra:4 }` + `backdropTierRef` + `backdropTier` useState (render trigger only).
- `renderPage` extended with `{ resizeMeasure = true }` option. Same-page enhance re-renders pass `resizeMeasure: false` — `measureRef` bitmap is never touched, geometry survives intact. Real page-changes (goToPage, upload, fixture restore) keep `resizeMeasure: true` (default) and clear/resize `measureRef` as before.
- PDF backdrop rasterized at `scale × mult` into `canvasRef`; `canvasRef` CSS `width/height` pinned to the logical `scaled.width × scaled.height` so it displays at the same on-screen size as `measureRef` regardless of backing bitmap size.
- Two toolbar buttons (visible when a page is loaded, hidden in all active modes):
  - **Enhance** — cycles Normal→Enhance→Ultra; label reads "Enhance" at Normal, "No seriously, enhance" at Enhance; disabled at Ultra.
  - **De-enhance** — jumps straight to Normal from any tier; disabled at Normal.
- Auto-reset to Normal on `goToPage`, PDF upload, and fixture restore.

### Regression and fix

Initial implementation used a float comparison guard (`measureRef.current.width !== scaled.width`) to skip the clear. Bug: `page.getViewport().width` returns a float (e.g. `1200.47`); after assignment `canvas.width` is an integer (`1200`). Guard was `1200 !== 1200.47 → true` on every call — never skipped. The explicit `resizeMeasure` flag is the correct fix.

### Key architectural note

The `resizeMeasure` flag on `renderPage` is the seam that makes same-page re-renders safe. Any future caller that re-rasterizes the same page (for any reason) should pass `{ resizeMeasure: false }` to avoid wiping the geometry layer without a subsequent repaint.

### Forward

Next: #10(a)+(b) still deferred (full-screen / max-width canvas layout). F280 endpoint gated on opening U-value fork (#99). Beat 2b gated on #75 (Ben's spreadsheet authoring pass).

---

## SESSION 50 — #46 Stage Two: place windows/doors from a structured opening list (2026-06-28)

**Branch:** main | **Commit:** (this session) — pushed to origin.

### What was built

**#46 Stage Two — place-from-structured-list (holding area + single-click placement):**

Source-agnostic: WEW Bridge is the first (and currently only) upstream source, but the
placement path contains no WEW-specific code. Placement consumes the normalized entry shape
(id, mark, openingKind, operationType, frameWidthM, frameHeightM, roughWidthM, roughHeightM,
quantity, location, performance).

**Holding area:**
- `pendingOpeningsRef` (`useRef([])`) — flat array of normalized entries with `remaining` count.
  Persists across page navigation. Clears on PDF upload.
- `pendingOpeningsTick` — `useState(0)` re-render trigger (same pattern as worklistTick).
- `loadPendingOpenings(entries)` — normalises and loads entries, initialising `remaining = quantity`.
- `window.__loadPendingOpenings(entries)` — DEV injection path; logs summary per entry.
- "SEED OPENINGS" DEV-strip button: injects 3 test entries (W1×2, W2×1, D1×1).

**"Openings to place" sidebar tab:**
- New `{ id: 'openings', label: 'Openings' }` entry added to `SIDEBAR_TABS` (between Worklist and
  Floor Heights). Derived flag `showOpenings = showSidebar && activeTabId === 'openings'`.
- Lists each pending entry: mark, openingKind, ×remaining, operationType, location hint.
- "Place" button gates on `isElevationPage && pageHasScale`. Closes the panel, calls
  `saveAndDefaultSnapIncrement()`, sets `placingFromEntry` + `pendingEntryToPlace`.

**`placeOpeningFromEntry(entry, pos)`:**
- Single-click placement — no two-click pixel sizing.
- Reads `dimensionBasisRef.current ?? 'frame'` to choose frame vs rough dimensions.
- Sets non-null `widthM` AND `heightM` from entry — this is the one coupling risk (the
  `!op.widthM || !op.heightM` guards in `deriveEnumeration` STEP D and `deriveWireframe`
  silently skip any opening missing these fields). The function returns early if wM or hM
  is falsy; it will never push a shape with null dimensions.
- Centers the rectangle on the click position: `c1 = pos − (wPx/2, hPx/2)`.
- Pushes a shape **identical** to `confirmOpening()` output: `{ id, vertices, pageId,
  status:'locked', shapeKind, openingType, label, widthM, heightM, dimBasis }`.
- `operationType` passed through verbatim (no vocab mapping — see #100 deferred entry).
- Decrements `entry.remaining`; removes entry from `pendingOpeningsRef` when it reaches 0.
- Bumps `enumerationTick` so Envelope panel updates immediately.
- Cancellable via Escape or the toolbar Cancel button.

**Interaction wiring:**
- `placingFromEntry` state intercepts clicks in `handleMeasureClick` (before `placingEquipmentItem`).
- Escape handler: clears `placingFromEntry` + `pendingEntryToPlace` + calls `restoreSnapIncrement`.
- Crosshair cursor while `placingFromEntry` is true.
- Toolbar feedback: "Click to place W1 (window — Living room)" with Cancel button.
- `goToPage` and PDF upload both reset `placingFromEntry` + `pendingEntryToPlace`.

### Harness: 24 → 34

10 new checks (n)–(q): placed window/door in `completedShapesRef`, non-null widthM/heightM per
shape (4 assertions), `deriveEnumeration` counts both (2), remaining decremented correctly (2).
Test shapes cleaned up inside `__verifyFixture` to avoid polluting fixture state.
Prediction in build prompt said "8 new" — off-by-two: the o-group emits 4 assertions (widthM +
heightM per shape), not 2. All 34 are intentional and correct.

### Design notes

- **user-assigns is the correct model:** `entry.location` is unstructured WEW text (no
  canonical match to elevation page subLabels). Shown as a hint only, never acted on.
  Auto-match deferred → #100.
- **operationType verbatim passthrough:** WEW operationType strings do not map 1:1 to
  `OPENING_TYPES`. No crash (openingType field is free-form). Reconciliation deferred → #101.
- **Stage One (recognition/ingestion) gated on #28:** the existing window-schedule reader
  tool (Ben's prior program) is the known starting asset for ingestion. Logged → #102.

### Forward

Next: F280 endpoint (gated on opening U-value fork #99). `insideFaceAreaM2` + `effectiveUValue`
+ thermal fields are ready; the fork decision (#99) unlocks the build prompt.

---

## SESSION 49 — Thermal-field ingest slice (effectiveUValue / effectiveRSI / controlLayers) (2026-06-28)

**Branch:** main | **Commit:** (this session) — pushed to origin.

### What was built

**Assembly attach Slice 3 — thermal-field ingest:**

Extended `ingestAssembly` and the library-tier resolver (`getSurfaceAssembly`) to pull three
thermal fields from the frozen contract into the assembly record:

- **`effectiveUValue`** (W/m²·K) — BASE value, bare assembly with air films, openings excluded.
  Opening-adjusted U is the main path's responsibility (fork #99, unresolved).
- **`effectiveRSI`** (m²·K/W = 1/effectiveUValue) — same base caveat.
- **`controlLayers`** `{ water, air, thermal, vapour }` — each a layerId string OR null.
  **null is KEPT, MEANINGFUL** ("does not manage this function", not missing data).
  Preserved exactly through all three hops: ingest → `assemblyLibraryRef` → `getSurfaceAssembly`
  → `deriveEnumeration` element field. No `?? null` coercion that could drop an explicit null.

Fields **NOT ingested** (tool-side, silently ignored as before):
- `airFilms` — already baked into effectiveRSI / effectiveUValue.
- `framing` block — tool-side framing rule set; not a Collabinator concern.

All Slice 2 geometry fields (`assemblyId`, `label`, `assemblyType`, `totalThicknessM`, `layers[]`)
are **unchanged** — additive storage-shape extension, no field dropped or renamed.

**`getSurfaceAssembly` library-tier hit** now returns effectiveUValue (was always null), effectiveRSI,
and controlLayers from the stored record. All four return paths (unset / manual / library-hit /
library-unresolved) updated with the new fields.

**`deriveEnumeration` STEP A** pushes `effectiveRSI` and `controlLayers` onto each wall-surface
element (alongside the pre-existing `effectiveUValue`). No recomputation in panel code (§7.3).

**`__ingestAssembly` DEV log** extended: shows U / RSI / controlLayers summary alongside existing
label, type, thickness, layer count.

### Harness extension — 17/17 → 24/24

- `__verifyFixture` extended with a `checkEq` helper (strict `===` for string / null fields).
- Self-injected `asm-fix-1` record extended with:
  `effectiveUValue: 0.28, effectiveRSI: 3.5714, controlLayers: { water:'l5', air:'l4', thermal:null, vapour:'l2' }`.
  `thermal: null` is intentional — verifies null survives the full ingest-to-element pipeline.
- Golden sidecar `fixture-elevation.expected.json` extended with `thermalCheck` block:
  `surfaceId: 'wall-sh-1-seg0-Main_Floor'` (the library-tier surface), expected values for
  U, RSI, and each of the four controlLayers keys (including `thermal: null`).
- 7 new checks: `(m)` surface exists, `(m.uv)`, `(m.rsi)`, `(m.cl.water)`, `(m.cl.air)`,
  `(m.cl.thermal)` (null preserved), `(m.cl.vapour)`.
- **24/24 PASS** confirmed in browser.

### F280 fork (#99 — open, not decided)

`effectiveUValue` is the bare-assembly value (air films included, openings excluded). F280 needs
an effective U for each wall surface that accounts for the openings in it. Three candidate sources
(per-opening thermal property / project default / opening assembly record) — Ben's call.
Logged as #99 in ADDITIONAL_FUNCTIONALITY.md. F280 build is gated on this decision.

### Forward

Next: F280 endpoint (gated on opening U-value fork #99). `insideFaceAreaM2` + `effectiveUValue`
are ready; the fork decision unlocks the build prompt.

---

## SESSION 46 — 3D wall-panel render (thickness slice) + TDZ fix (2026-06-28)

**Branch:** main | **Commit:** 8f1dd30 — pushed to origin.

### What was built

**3D wall-panel render — Part 1 (ThreeDView + deriveWireframe extension):**
- Wall surfaces with a library-tier assembly (`source:'library'`) now render as semi-transparent
  solid panels in ThreeDView using `totalThicknessM` from `assemblyLibraryRef`.
- Growth direction is assemblyType-driven: `'wall'` grows inward (into building footprint);
  horizontal surfaces grow outward. Matching the architectural convention that traced lines are
  the structural outside face.
- `insideFaceAreaM2` derived in `deriveEnumeration` STEP A as a named field on every wall-surface
  element. Not yet consumed downstream — F280 consumes next chat. Layer-by-layer band rendering
  deferred.

**TDZ fix — Part 2 (declaration-order, one line):**
- `deriveWireframe()` threw `ReferenceError: Cannot access 'solids' before initialization`.
- Root cause: `const solids = []` was declared at ~line 4370, but the new wall-panel loop called
  `solids.push(...)` at ~line 4177 — 194 lines earlier in the same function body. JS Temporal
  Dead Zone: `solids` is hoisted but uninitialized until the declaration runs.
- Fix: moved `const solids = []` to immediately after `const floorRings = []` (~line 4132).
  Deleted the original declaration. No other change.
- The throw was caught silently at React's event boundary, which is why 3D View appeared to
  need a second reload to mount — `wireframeData` stayed null on the first attempt.

### Verified (Ben's dev-server tab)

1. Restore fixture → `__verifyFixture()`: **17/17 PASS** (arithmetic unaffected by fix)
2. Hard reload + LOAD FIXTURE → 3D View opens on **first click** ✓
3. Green semi-transparent wall-depth panel visible on `wall-sh-1-seg0-Main_Floor`, ~254mm deep,
   growing **inward** (into footprint, not outward/north) ✓
4. Zero-thickness and manual-tier surfaces remain flat lines ✓

### Forward

Next chat: thermal-field ingest slice (wire `effectiveUValue`/`effectiveRSI`/`airFilms` from
the now-frozen contract into `ingestAssembly`) → then F280 endpoint consuming `insideFaceAreaM2`
+ thermal fields.

### Reconciliation note (added Session 47)

**Assembly Builder Part 3 shipped** — U-value engine + thermal fields + framing `materialId`
are complete. The contract thermal fields (`effectiveUValue`, `effectiveRSI`, `airFilms`,
`controlLayers`, `framing.materialId`) are **frozen and available to ingest**. Session 46's
"Part 3 in-flight" note is superseded by this. See `PARALLEL_TRACKS_LEDGER.md` for the
full cross-track record.

---

## SESSION 45 — Assembly library ingest + library-tier resolver (slice 2, geometry-scoped) (2026-06-28)

**Branch:** main | **Commit:** 6dab52d — pushed to origin.

### What was built

**Assembly attach slice 2 — contract ingest + library resolver (geometry fields only):**

- **`assemblyLibraryRef`** — `useRef({})` keyed by `assemblyId`; value is geometry-scoped
  contract record `{ assemblyId, label, assemblyType, totalThicknessM, layers[] }`.
  Cleared on PDF upload alongside `surfaceAssemblyRef`.
- **`ingestAssembly(record)`** — stores geometry-scoped fields from a contract-shaped record.
  Silently ignores deferred thermal/framing fields (`effectiveUValue`, `effectiveRSI`, `framing`,
  `controlLayers`, `airFilms`) — forward-compatible with Assembly Builder Part 3 in-flight.
  Layer fields stored: `layerId`, `materialId`, `thicknessM`, `pathRole`.
- **`getSurfaceAssembly` library tier extended** — when `tier:'library'` and `assemblyId` is set,
  resolves against `assemblyLibraryRef`; returns
  `{ thicknessM: totalThicknessM, layers, source:'library' }` on hit.
  Missing `assemblyId` → `source:'library-unresolved'`, `thicknessM:null`, no crash.
  Manual tier and `source:'unset'` unchanged. `layers:null` added to all return paths.
- **`window.__ingestAssembly(record)`** — DEV injection path in second DEV block;
  calls `ingestAssembly` + logs summary + per-layer detail. Tree-shakes from production.
  Mirrors `__dumpRuns` / `__dumpSolids` pattern.

### Contract field name check

All geometry-scoped field names in the prompt match the contract exactly:
`assemblyId`, `label`, `assemblyType`, `totalThicknessM`, `layers[]` with `materialId`,
`thicknessM`, `pathRole`. The contract also carries `layerId` per layer (not mentioned in
the prompt's layer description) — stored in full. No discrepancies.

### Deferred (explicitly out of scope this slice)

`effectiveUValue`, `effectiveRSI`, `framing`, `controlLayers`, `airFilms` — not ingested,
not stored. These feed U-value/F280/thermal, not 3D geometry, and `effectiveUValue`/`effectiveRSI`
are still being filled by Part 3 of the Assembly Builder. 3D thickness rendering is the NEXT slice
(walls remain zero-thickness planes this slice).

### Contract location

`C:\dev\assemblylibrary\ASSEMBLY_CONTRACT.md` — separate repo, NOT inside collabinator.
Assembly Builder Part 3 is in flight (adding framing `materialId` + filling `effectiveUValue`/`effectiveRSI`).

### Verified (browser — preview server 5175)

1. Restore fixture → `__verifyFixture()`: **15/15 PASS** ✓ (existing arithmetic unaffected)
2. `__ingestAssembly` with 5-layer record → library tier resolves:
   `source:'library'`, `thickness=0.2540 m`, `layers=5`, `U=null` (deferred) ✓
3. Missing assemblyId → `source:'library-unresolved'`, `thickness=null`, no crash ✓
4. No console errors ✓

### Forward

Next: 3D thickness rendering (walls as solids with depth = `totalThicknessM`), OR
U-value/thermal ingest slice when Assembly Builder Part 3 lands.

---

## SESSION 44 — Fix #94: opening 3D placement via vector projection (2026-06-28)

**Branch:** main | **Commit:** 8fe8ba7 — pushed to origin.

### What was built

**Bug fix #94 — opening 3D placement wrong side/end of wall:**

Root cause (derivation bug, confirmed via recon): `deriveWireframe` computed `hOffsetM` as
`(centX − midPxX) / pxPerMeter` — a scalar canvas-X offset. This is correct only when the
reference edge is traced left-to-right. When traced right-to-left (dirX = −1), the signed
offset has the wrong sign, mirroring every opening to `2 × midpoint − correct` position.
Fixture coordinates were correct; the bug was entirely in the derivation formula.

**Fix:** At the `hOffsetM` line, replaced the scalar formula with a vector dot-product
projection: `projPx = ((centX − midPxX) * edx + (centY − midPxY) * edy) / edgeLenPx`,
then `hOffsetM = projPx / pxPerMeter`. This is sign-correct for any edge orientation
(horizontal left-to-right, right-to-left, or diagonal). `cx = wMidX + dirX * hOffsetM`
and `cy = wMidY + dirY * hOffsetM` are unchanged — hOffsetM is now the correct signed
scalar in the A→B world direction.

### Verified

- `__verifyFixture()`: 15/15 PASS (area, net/gross, assembly arithmetic unaffected) ✓
- `__dumpWireframe()` opening centers: window cx = 1.1557 m, door cx = 2.2606 m
  (before fix: 7.2263 m / 6.1214 m — mirrored values) ✓
- Ben visual confirm: both openings sit in the wall plane at the correct (WEST) end ✓

### New deferred entry

**#95** — Angled-elevation-edge opening placement: the vector projection formula handles
diagonal reference edges by construction, but no fixture with a diagonal edge exists.
Build a fixture to verify the angled-edge path when convenient. Low priority.

### Forward

Beat 2b (gating fields — awaits #75 authoring pass) or next assemblies/envelope slice.

---

## SESSION 42 — Verification infrastructure: __verifyFixture harness + golden sidecar (2026-06-28)

**Branch:** main | **Commits:** 1915e9c (docs reconcile), 688f8aa (fixture openings), e1a3215 (harness) — pushed to origin.

### What was built

**Part 1 — Docs reconcile (1915e9c):**
ADDITIONAL_FUNCTIONALITY.md: #10 title/description expanded to include PDF render resolution sub-items.
#28 gate reaffirmed with fuller scope (OCR/schedule/auto-populate). New entries #89–#92 appended:
  #89 ghost start-vertex snap possible bug | #90 replicate previous floor shape | #91 roof draw
  page multiple shapes | #92 elevation reference edge rotation + multi-elevation assignment.

**Recon (read-only, Part 1):** Four structured questions answered before any code:
  1. Snapshot/restore seam: async; shapeIdCounterRef NOT captured (known gap, harmless for harness).
  2. DEV dump catalog: all 7 fns live in lines 4401–5091; deriveEnumeration() hoisted to render scope.
  3. Expected-value stores: none exist pre-session; golden sidecar is net new pattern.
  4. Cleanest seam: immediately after __dumpEnumeration (line 5002), before __dumpWireframe.

**Precondition (688f8aa) — fixture-elevation.json:**
Added sh-3 (window W1, widthM=1.2, heightM=0.9, pageId='page-2') and sh-4 (door D1, widthM=0.9,
heightM=0.4394, pageId='page-2'). Both associate to wall-sh-1-seg2-Main_Floor via
elevationEdgeRef[page-2] → {shapeIndex:1 (=sh-1), segmentIndex:2}. Combined opening area
1.47546m² → toFixed(4)="1.4755". Gross unchanged at 68.4695m².

**Harness + sidecar (e1a3215):**
Golden sidecar: `public/devFixtures/fixture-elevation.expected.json` — frozen expected values
(wallSurfaceCount:10, grossTotalM2:68.4695, netTotalM2:66.9941, openingTotalM2:1.4755,
soffitCount:2, windowCount:1, doorCount:1, subtractionSurface:{id:'wall-sh-1-seg2-Main_Floor',
grossM2:16.7225, netM2:15.2471, openingM2:1.4755}). Tolerance ±0.0001m².
`window.__verifyFixture()`: fetches sidecar, calls deriveEnumeration(), checks (a)-(i) +
partition invariant for all wall surfaces; closure stub prints SKIPPED (#87 gated); summary line.

### Verified (browser — preview server 5175)

Positive: 12/12 PASS ✓  
Negative control (fetch-patched grossTotalM2=99): exactly check (b) FAIL, all others pass ✓  
Closure stub: SKIPPED message printed ✓  

### Architecture note — golden-sidecar pattern

Fixture JSON holds scenario geometry; sidecar JSON holds frozen expected derived-quantity values.
Separate files intentionally: scenario can evolve by updating fixture + re-anchoring sidecar from
a fresh __dumpEnumeration run. Sidecar is NOT auto-generated at test time — it is a hand-confirmed
snapshot. The harness existing removed one stated blocker of #28, but #28 (plan reader) remains
gated on the post-3D-model deep-review waypoint.

### Forward

Next: assembly-type assignment per surface (assemblyId attach layer). Beat 2b blocked on #75.

---

## SESSION 43 — Assembly attach slice 1: per-surface assembly data + harness re-freeze (2026-06-28)

**Branch:** main | **Commits:** 6d849f1 (code + fixture + sidecar) — pushed to origin.

### What was built

**Assembly attach slice 1 (data only):**
- `surfaceAssemblyRef.current[surfaceId]` — keyed by wall-surface id; value
  `{ tier:'manual'|'library', effectiveUValue, thicknessM, assemblyId }`. Cleared on PDF upload.
- `getSurfaceAssembly(surfaceId)` resolver: two-tier (manual = user U/thickness; library = future
  assemblyId lookup). 3D thickness rendering deferred.
- STEP A of `deriveEnumeration()` extended: assemblyTier / effectiveUValue / thicknessM per
  wall-surface element.
- `__dumpEnumeration` extended with `assembly: [manual|unset] U=... thickness=...` per surface.
- Envelope panel row extended: shows tier + U + thickness.
- CSS: `.asm-row` added.

**Fixture re-anchoring:**
- Session-42 fixture had string-injected openings at bad coordinates. Ben re-placed both by hand.
  New dims: window 0.381×0.5588m (was W1 1.2×0.9m), door 0.762×1.7272m (was D1 0.9×0.4394m).
  Empty labels. surfaceAssembly already in fixture: wall-sh-1-seg2-Main_Floor → manual U=0.25 t=0.3m.
- Sidecar re-frozen: netTotalM2:66.9405, openingTotalM2:1.5290; subtractionSurface
  netM2:15.1935, openingM2:1.5290. grossTotalM2:68.4695 unchanged. assemblyCheck block added.
- `__verifyFixture()` extended with checks (j) effectiveUValue + (k) thicknessM. Now 15/15 checks.

### Verified (browser — Ben's dev-server tab)

- Fixture restore: 5 shapes, page 2 ✓
- `__verifyFixture()`: 15/15 PASS ✓
- Negative control: sidecar effectiveUValue → 0.99 → exactly check (j) FAIL "expected=0.2500
  actual=0.9900", all 14 others pass ✓. Reverted; 15/15 again ✓.
- 3D View: wall planes visible (no geometry change) ✓
- Bug surfaced: openings on wrong side of wall in 3D View (#94 — undiagnosed, logged).

### Side bugs / deferred logged
- **#93:** Opening edge labels intercept drag-to-resize in Edit mode.
- **#94:** Openings render on wrong side of wall in 3D View. UNDIAGNOSED. Next to recon on the
  assemblies/envelope track before any fix attempt.

### Forward

#94 recon pass is next on the assemblies/envelope track. Beat 2b still blocked on #75.

---

## SESSION 41 — Envelope area slice: gross/net/opening area as named derived quantities (2026-06-27)

**Branch:** main | **Commits:** (see code commit below) — pushed to origin.

### What was built

Gross area, net area, and opening area added as named fields on every `wall-surface` element
emitted by `deriveEnumeration()`. Opening→wall-surface association built. Per-surface partition
check added to `__dumpEnumeration`. Envelope panel updated to display area rows.

**Opening association (new `openingsByWallId` map, before STEP A):**
- For each elevation page with a stored `elevationEdgeRef`, reads the reference shape id,
  segment index, and floor level to build a deterministic wall-surface id key.
- All locked openings (window/door) with `widthM` and `heightM` set on that elevation page
  are grouped under that key.
- Limitation logged as #88: all openings on a multi-story elevation associate to the
  reference-edge floor level only; openings at other Z levels are not yet separated by floor.

**Area fields on every wall-surface element (STEP A):**
- `grossAreaM2 = widthM × heightM` (null if `heightM` null — floor height not entered)
- `openingAreaM2` = sum of `widthM × heightM` for all associated openings (0 if none)
- `netAreaM2 = max(0, grossAreaM2 − openingAreaM2)` (null if grossAreaM2 null)
- `openingOverflow: true` (undefined otherwise) — flag when openings exceed gross (bad data)
- `associatedOpeningIds: string[]` — opening shape ids for traceability

**`__dumpEnumeration` extended:**
- Each wall-surface log line now prints gross / net / opening area and a per-surface
  partition assertion (`PASS`/`FAIL`).
- New area + partition summary block at end: PASS count, FAIL count, N/A count, totals.

**Envelope panel:** new area row per wall surface showing gross, net, opening subtraction,
overflow flag. Null-safe: shows "(set floor height)" dimmed when grossAreaM2 is null.

**Whole-envelope closure invariant NOT built** — logged as #87 in ADDITIONAL_FUNCTIONALITY.md.
Gated on missing surface kinds (roof-plane area, floor-over-unheated, party walls).

### Verified (preview server 5175, fixture-elevation.json + synthetic window injection)
a. gross = widthM × heightM spot-check: 6.858 × 2.4384 = 16.723 m² ✓  
b. No-opening surfaces: net = gross, openingAreaM2 = 0 ✓  
c. Surface with injected window (1.2 × 0.9 m): net = 16.723 − 1.08 = 15.643 m²; partition PASS ✓  
d. All synthetic null-height cases: grossAreaM2 = null, netAreaM2 = null, no NaN ✓  
e. `__dumpEnumeration` summary: 10 PASS, 0 FAIL, 0 N/A; gross total 68.47 m² ✓  

### Forward
Assemblies onto surfaces: next slice is assembly-type assignment per surface (the `assemblyId`
attach layer). See ASSEMBLIES_RECON_REPORT.md for candidate attach points. Extend
CONFIG_FIELDS options with `thicknessM` + `controlLayerM` data is also a candidate.

---

## SESSION 40 — Beat 4: panel consolidation (#69) — tabbed side-panel container (2026-06-27)

**Branch:** main | **Commit:** 145d807 — pushed to origin.

### What was built

One consolidated right-side container replacing four independent absolute-positioned overlay panels
(Project Setup, Floor Heights, Worklist, Envelope). Layout/shell only — zero functional change to
any panel's content or behavior.

**State changes (App.jsx):**
- `showProjectSetup`, `showFloorHeights`, `showWorklist`, `showEnumeration` useState → removed.
  Replaced by `showSidebar` (bool), `activeTabId` (string, init `'project-setup'`), `sidebarWidth`
  (number, init 300), `sidebarWidthRef` (useRef 300).
- Four show* values are now derived constants: `showProjectSetup = showSidebar && activeTabId === 'project-setup'` etc.
- Legacy setters defined as `() => setShowSidebar(false)` so existing ✕ buttons and Place-button
  close logic work unchanged.
- `SIDEBAR_TABS` module-level constant (order: Project Setup, Worklist, Floor Heights, Envelope).

**Container (JSX):** Single `<div className="side-panel-container">` replaces four separate panel
divs. Contains: drag-resize handle, tab bar, `.side-panel-content` div with conditional renders of
all four panels (existing fh-panel JSX preserved verbatim inside, including fh-panel-head).

**Two layout modes** driven by `sidebarWidth >= 520` (the wide-mode breakpoint):
- **Narrow (< 520px):** tab bar is a vertical flex column of four clickable label bars. All four
  labels always visible; active is highlighted; content fills below.
- **Wide (≥ 520px):** tab bar becomes a horizontal flex row (standard browser-style tabs across
  top, active underline). Same activeTabId drives both; switching mode does NOT change active panel.

**Drag-to-resize:** mousedown on left-edge handle attaches mousemove/mouseup to document;
`newW = clamp(300, startW - Δx, 80vw)`. Updates both `sidebarWidthRef.current` and
`setSidebarWidth` for immediate DOM update and React re-render. Width persists across
close/reopen within the session. **Cross-session persistence deferred — no localStorage in
this codebase. Needs a storage decision before implementing.**

**Toolbar gate:** `!calibMode && !drawMode && !editMode && !categorizeMode` applied to BOTH the
Panels toolbar button AND the container render — entering a mode hides the container entirely
(not just the button).

**CSS:** New `.side-panel-container`, `.side-panel-resize-handle`, `.side-panel-tab-bar`,
`.side-panel-tab`, `.side-panel-content` rules added. `.side-panel-content .fh-panel` override
resets all absolute-positioning rules so the existing fh-panel divs flow naturally inside the
container. Dead rules removed: `.ps-panel right:300px`, `.wl-panel right:600px`,
`.enum-panel right:900px`, `.wl-btn`/`.enum-btn` color rules.

### Verified (preview server 5175)
a. Open sidebar → narrow mode: four stacked labels, Project Setup expanded at bottom ✓  
b. Click each label → correct panel switches in, others collapse above ✓  
c. All four panel contents render correctly (Floor Heights inputs, Worklist Place buttons,
   Project Setup selects, Envelope enumeration) ✓  
d. Drag wider past 520px → wide mode (horizontal tabs), same active panel; drag back → narrow reverts ✓  
e. Close sidebar, reopen → width and last-active tab both preserved ✓  
f. Reload → width resets to 300px (no cross-session persistence; flagged) ✓ / ⚠ flagged  
g. Enter draw mode → container hidden, "Panels" button hidden; exit draw mode → both reappear ✓  

### Forward
Beat 4 complete. Next: Beat 2b (gating fields — awaits Ben's #75 authoring pass) or the
#79 envelope penetration subsystem (gated on #74/#75). Cross-session panel-width persistence
needs a storage decision when desired.

---

## SESSION 39 — Envelope Penetration Subsystem: architecture settled (#79); no build (2026-06-26)

**Type:** Intensive planning session (no code). Docs-only commit.

### What was settled
Full entity + rule + export model for the envelope penetration subsystem (#79), the founding-principle
anchor logged Session 38. See ADDITIONAL_FUNCTIONALITY #79 for the complete settled model. Headlines:
- Penetration = derived entity, dual-source (run-spine crossing OR placed item), origin-blind downstream.
- ONE coordinated coded detail per penetration; per-layer treatments are facets; one detail on the plan.
- Three-way derivation: assembly params × project envelope settings × interacting item → detail code.
- Generic tier is the base; supplier (SIGA-style) is optional refinement, never a prerequisite.
- Detail resides ON THE ASSEMBLY as an area-occupying sub-region; stores occupied-area + thermal-bridge
  slots now, consumers deferred. Thermal bridge is building-understanding, NOT a compliance feed.
- Each facet carries a RESPONSIBLE PARTY: born as a scope, resolved downstream to a named party.
- PENETRATION_DETAIL_RULES = distinct engine (autofill generator, editable prefill), beside
  CONFIG_CROSS_FIELD_RULES under #74's data roof, separate schema. Auto-prompt fires only on
  parameter underspecification.
- Trade-plan-set export = purely derived projection (filter facets by responsible party + layers),
  with optional saved named filters. QR per-penetration; penetrations page is the index.
- QR per-penetration links to a register entry holding spec + materials + (if resolved) order line
  AND a video of how that coded detail is installed, scanned off the paper plan. Page is the index.

### Spun-off register entries
#80 supplier-catalogue integration · #81 trade→responsible-party→person assignment model ·
#82 thermal-bridge quantification. #78 marked resolved-through-#79.

### Build gate
#79 build does NOT start until #74 (data-driven rule layer) AND #75 (spreadsheet authoring pass)
are ready. This session produced architecture + register entries only; the build prompt is authored
when #74/#75 unblock.

### Forward
Next visible beat unchanged (Beat 4 panel consolidation, or Beat 2b if #75 lands). #79 waits on #74/#75.

---

## SESSION 38 — Beat 3: trade→role structure + role-only owner render (#68 + #61) (2026-06-26)

**Branch:** main | **Commit:** 1aae356 — pushed to origin.

### What was built

**Read-only recon (Beat 3 prep):** Full static trace confirmed trade tags were English prose baked into `ob.label` strings ("Condensate drain (plumber)") — no structured field. The §9 role model (ROLE_LABELS, roleAssignments, person-assignment UI) already existed from Session 32. The gap was one-sided: obligation→role mapping had zero structure.

**`trades: string[]` on ITEM_TYPES obligations:** Every obligation entry now carries a `trades` field with role ids from ROLE_LABELS. Multi-trade where genuinely warranted: `mount-type` gets `['hvac-designer', 'designer']` (clearance + setback/aesthetics), `supply-exhaust-duct` gets `['hvac-designer', 'energy-advisor']` (HRV ducting = HVAC spec + appears in h2k/f280 energy model). Two obligations left at `trades: []`: `vent-to-exterior` and `exterior-vent` — "(envelope)" has no role in ROLE_LABELS (#78).

**`trade` scalar on RUN_PAIR_MAP:** `lineset` entry gets `trade: 'hvac-designer'` — category-level, authoritative for run obligations in the map (takes priority over obligation-level `trades`).

**`ownerRoles` derived in `deriveWorklist`:** For run-kind obligations: check RUN_PAIR_MAP.satisfies for the obligation id → use category `trade` if found, else fall back to `ob.trades`. For property obligations: use `ob.trades` directly. Result is `ownerRoles: string[]` attached to each obligation object.

**Worklist row render:** Secondary `.wl-oblig-owner` line in all three obligation branches (satisfied run / blocked / property): "Owner: X" for one, "Owners: A, B" for many, "Owner: unassigned" for empty. Role label via ROLE_LABELS — NO person-name lookup from roleAssignments (deferred per fork B).

**`__dumpWorklist` updated:** Each obligation log line now shows `ownerRoles=[...]` and the resolved label string.

### Fork B deferred
Person-name lookup (reads `projectSetupRef.current.roleAssignments[roleId]`) was explicitly deferred. The BUILD_ROADMAP Beat 3 line originally said "show the assigned person's name" — amended to reflect role-label-only this build.

### Unresolved trade gap (#78)
"envelope" obligations (bath-fan vent-to-exterior, HRV exterior-vent) have `trades: []` because ROLE_LABELS has no envelope/contractor role. These show "Owner: unassigned" in the worklist. Logged as #78 in ADDITIONAL_FUNCTIONALITY.

### Verification (browser — preview server 5175)
Injected minimal fixture (4 placed equipment items, page-1 Main Floor + scale). Read DOM directly:
- `outdoor-unit#1 / mount-type` → `Owners: HVAC Designer, Designer` ✓ (multi-trade)
- `hrv-unit#1 / supply-exhaust-duct` → `Owners: HVAC Designer, Energy Advisor` ✓ (multi-trade)
- `air-handler#1 / condensate-drain` → `Owner: Plumber` ✓ (single trade)
- `air-handler#1 / lineset-endpoint` → `Owner: HVAC Designer` ✓ (from RUN_PAIR_MAP category)
- `hrv-unit#1 / exterior-vent` → `Owner: unassigned` ✓ (empty trades, envelope gap)
- No person names visible anywhere ✓

### Forward
Beat 2b (gating fields) still pending Ben's #75 authoring pass. Beat 4 (panel consolidation) is next visible beat. #78 (envelope role) and #61-person (person-name on row) are follow-ons.

---

## SESSION 37 — Beat 2a: config cross-field rules — resolveEffectiveConfig seam + auto-fill + spawn-dedup (2026-06-26)

**Branch:** main | **Commit:** f5553fa — pushed to origin.

### What was built

**Beat 2a read-only recon (first):** Full static trace of CONFIG_FIELDS descriptor shape, getConfigValue/setConfigValue, deriveWorklist spawn loop, and panel render. Confirmed the existing flat model — all fields independent, spawns: null on cooling, no dedup. Found that the `cooling` field had no "heat pump" option — only `central-ac` and `none` — which would have forced a semantically wrong auto-fill. Stopped and flagged before writing code.

**Option added — cooling field (f5553fa):** `{ value: 'heat-pump-ducted', label: 'Ducted heat pump (heating + cooling)' }` added as first option in the `cooling` field of `CONFIG_FIELDS`. Narrow honesty fix only — equipment-topology nuance (#60 dual-fuel, #76 furnace-as-air-handler) deferred.

**`resolveEffectiveConfig` seam (f5553fa):** Module-level pure function `resolveEffectiveConfig(rawValues)` with a named `CONFIG_CROSS_FIELD_RULES` array — hand-authored rule set, one entry today. Structure explicitly forward-proofs #74: replace the rule array contents only; consumers are untouched. Added between `ROLE_LABELS` and `function App()`.

**Rule 1 — heat-pump-ducted-implies-cooling:** `when: raw['space-heating'] === 'heat-pump-ducted' && raw['cooling'] == null` → `apply: { cooling: 'heat-pump-ducted' }`. Prefilled-but-editable: only fires on null cooling; never clobbers a non-null user selection. Raw storage is the authoritative user-intent signal.

**Spawn dedup (f5553fa):** `deriveWorklist` now collects all `{type, count}` from all spawn functions into `maxCountByType`, merging by type with `Math.max` (shared appliance = max needed, not additive). Builds to-place and obligations from the deduped set. `air-handler#1` and `outdoor-unit#1` appear exactly once regardless of how many fields imply them.

**Seam wiring — two consumers only:** `getConfigValue` restored to raw (user intent, no resolve). `resolveEffectiveConfig` called at exactly two sites: top of `deriveWorklist` (as `resolvedCfg`) and top of the Project Setup panel render IIFE (as `resolvedPanelCfg`). Both use `resolved[field.id] ?? getConfigValue(field.id)` so default-value handling (count→0, multi→[]) is preserved.

### Key lesson — seam caught before commit

Initial implementation wired `resolveEffectiveConfig` into `getConfigValue` (the universal read path). Ben flagged this as over-broad before verification: the correct boundary is raw=user-intent (getConfigValue), resolved=engine-view (resolveEffectiveConfig at named consumers). The synthesize-on-read approach was mechanically correct for all five checks — the raw null cleanly separates unset from user-set — but the architecture boundary matters more than mechanical correctness here because #74 will pile many rules behind this seam. Reverted and re-wired before any verification ran.

### Verification (all five — Ben confirmed)
1. Space-heating = heat pump, cooling unset → cooling auto-fills "Ducted heat pump (heating + cooling)" ✅
2. User manually sets cooling = Central A/C → not clobbered on re-read ✅
3. User clears cooling to null → auto-fill fires again ✅
4. `__dumpWorklist()` → air-handler#1 and outdoor-unit#1 each exactly once ✅
5. Regression: HRV → hrv-unit#1; bath-fans=2 → bath-fan#1 + bath-fan#2; gas furnace → air-handler/outdoor-unit gone ✅

### Side finding logged
**#76** — Furnace is itself an air handler; gas furnace should also spawn an air-handler item. Deferred to equipment-setup session, pairs with #60 (dual-fuel) and #74 (data-driven dependency layer).

### Forward
Beat 2b (gating — #59 energy-source fields + option-filtering rules) is next but has a prerequisite: #75 authoring pass (Ben's spreadsheet baked enough to mine for config schema). Beat 2b does NOT start until #75 is ready. Beat 3 (cross-trade obligation → role wiring, #68 + #61) is the alternative next visible beat if Beat 2b is not yet unblocked.

---

## SESSION 36 — Beat 1: opening storage fix + 3D loop (#55) + Envelope panel (#52) (2026-06-26)

**Branch:** main | **Commits:** 961d098 (opening storage fix), 7d939c3 (Envelope panel) — both pushed to origin.

### What was built

**Beat 1 read-only recon (first):** Full static trace of opening placement → storage → 3D render path → enumeration STEP D. Found two bugs in `confirmOpening`: (1) `widthM`/`heightM` never stored — `deriveWireframe` guard `!op.widthM || !op.heightM` skipped every opening, making the orange 3D lines a dead code path; (2) `openingLabel` stored but `op.label` read by both consumers. Confirmed fixture already has an elevation page with confirmed scale + edge, so placing one opening would fire both paths.

**Piece 1 — opening storage fix + first live execution (961d098):**
- `confirmOpening`: capture `storedWidthM`/`storedHeightM` from `parseFtIn` before vertex resize; store as `widthM`/`heightM` on shape object; rename `openingLabel` → `label`. No other code used `openingLabel` (confirmed by grep).
- Placed test window on fixture elevation page; `__dumpEnumeration()` showed `widthM=1.4478m, heightM=1.4224m, worldZm=2.2397m` (all real, not null). 3D View showed orange opening rectangle. First live execution of both `openingLines` render path and `STEP D` fenestration branch.
- Ben re-snapshots fixture after this commit (test opening now part of standard scenario).

**Piece 2 — Envelope panel (7d939c3):**
- `deriveEnumeration()` was inside `if (import.meta.env.DEV)` block — inaccessible from JSX, causing `ReferenceError` on panel render. Hoisted to component render scope; `window.__dumpEnumeration` re-wrapped in new DEV guard.
- `showEnumeration` + `enumerationTick` state (mirrors Worklist pattern). Tick bumped on shape lock/delete, floor-height writes, page nav.
- "Envelope" toolbar button (teal `enum-btn`); `enum-panel` at `right:900px`. Panel groups by kind (Wall Surfaces / Soffits / Windows / Doors); named fields per element; reconcile tags color-coded via `data-tag`; empty state message. All quantities read from named element fields — no recomputation (§7.3).
- Browser-verified: 13 elements, matches `__dumpEnumeration()` output exactly.

### Key lesson reinforced
`deriveEnumeration` being inside the DEV guard compiled clean and Vite ran the dev server without a parse error — the `ReferenceError` only appeared at runtime when the panel tried to call it. Compile-clean is NOT the verification line.

### Forward
Beat 2 planning needed. Next candidates: §8.2 step 5, opening Piece 3/4, or panel consolidation (#69 deferred to Beat 4). Ben to re-upload the five docs to the Project.

---

## SESSION 35 — §8.3 Build 1 + Build 2: run slot storage + profile/solids (2026-06-26)

**Branch:** main | **Commits:** 7c921ff (Build 1 slot storage), 607f6be (Build 1 fix), 2feb3e5 (__dumpRuns invariant), a961430 (Build 2 profile+solids), cba3932 (log cleanup) — all pushed to origin.

### What was built

**§8.3 READ-ONLY RECON (first):** Five questions answered before writing code — confirmed deriveWireframe contract, ThreeDView consumption, Z application path (scalar from zStack/roofZFallback), equipment completely absent from 3D (no geometry anywhere), and run interior vertices are anonymous bend-points in storage (no identity until Build 1).

**§8.3 Build 1 — slot storage shape (7c921ff + 607f6be):**
- Run shapes migrated from flat `vertices/endpointItems/category` to carrying BOTH:
  - `pointSlots: [{id:'ps-N', x, y, itemRef:string|null}]` — identity + characterization layer, one per vertex
  - `spanSlots: [{id:'ss-N', category:string|null}]` — one per consecutive vertex pair
  - `vertices: [{x,y}]` — raw geometry layer restored (see regression below); invariant: `vertices[i].x === pointSlots[i].x` for all i
- `psCounterRef` / `ssCounterRef` monotonic counters; `nextPsId()` / `nextSsId()` helpers; both cleared on PDF upload.
- `buildCharacterizedRun` rewrote to use `pointSlots` — builds `newPointSlots` with itemRef, `newSpanSlots` with category; spreads `...run` so vertices flow through.
- `clearRunSatisfaction`, `hitTestShapeBody`, delete sub-mode all updated to read `pointSlots`/`spanSlots`.
- `deriveWireframe` runLines: reads `run.pointSlots[i]` for XY (not `run.vertices`).
- `__restoreFixture`: defensive skip drops pre-Build-1 runs (no `pointSlots`) instead of crashing.
- `__dumpRuns()` extended with per-run `vertCount`, `slotCount`, `MATCH/MISMATCH`, and `positions-agree` boolean.

**Build 1 regression and fix (607f6be):** Initial Build 1 dropped `vertices` from run shapes. Caused two crash sites: `getVisibleVertices` (`.flatMap(s => s.vertices)` no guard — crash on every mouse-move) and `snapshotShapes` (`.vertices.map()` no guard — crash on every delete/undo). Fix: restore `vertices` as raw geometry alongside slots. Uniform iterators get a real array; slots remain authoritative for identity/characterization. Browser-verified: `MATCH` and `positions-agree=true` confirmed.

**§8.3 Build 2 — profile table + derived solids (a961430 + cba3932):**
- `SEGMENT_PROFILES` (lineset → `{sweep:'extrude-circle', diameterM:0.025}`, duct → `{sweep:'extrude-rect', widthM:0.150, heightM:0.150}`), `SEGMENT_PROFILE_FALLBACK`, `POINT_PROFILES` (air-handler/outdoor-unit/bath-fan/hrv-unit block dims) — all module-level constants with "BASE-CASE CONSTANTS, config-read seam comment."
- `deriveWireframe` extended: returns `solids:[]` — one `cylinder`/`box-swept` per spanSlot per run (profile from `SEGMENT_PROFILES[spanCat] ?? fallback`); one `block` per equipment item (profile from `POINT_PROFILES[shape.itemType]`). Pure parameter objects; no three.js. Z resolution for equipment uses identical 4-line scalar-Z lookup as runLines (not a parallel path).
- Equipment block `center.z = equipZ + hM/2` so block sits ON the level, not through it.
- `ThreeDView.jsx` split into two effects: main effect (dep `[wireframe]`) builds scene, renders all meshes (including solids), stores solid meshes in `solidMeshesRef`; toggle effect (dep `[showSolids]`) only flips `.visible`. Camera never resets on toggle.
- `MeshBasicMaterial` (no scene light needed), `opacity:0.45`, `side:DoubleSide`.
- Solids toggle button in header; equipment `■` legend entry (purple 0x8b5cf6).
- `window.__dumpSolids()` DEV hook: calls `deriveWireframe()` and prints kind/radiusM/length/center per solid.
- Build 2 fix (camera reset on toggle) identified and fixed before commit. Lineset cylinder geometry confirmed correct-but-small (r=12.5mm, ~1" honest placeholder); not inflated.

### Architecture decisions locked this session

- **Add-a-layer-not-replace:** when a storage shape grows a new identity layer (`pointSlots`), keep the raw geometry layer (`vertices`) so uniform iterators (which have no shapeKind guard) continue to work. Removing raw geometry is a breaking change disguised as a refactor.
- **`vertices` invariant:** `vertices[i].x === pointSlots[i].x && vertices[i].y === pointSlots[i].y` for all i. `__dumpRuns()` checks this; run it after any run-storage change.
- **Compile-clean ≠ verification; failed-check ≠ passed-check.** Two real bugs survived a clean build this session (the regression and the camera reset). Browser verification with explicit checks is the only close-out line.
- **Inline noisy logs → window.__ hooks:** per-open `console.log` converted to `__dumpSolids()` callable hook following `__dumpRuns()` pattern.
- **Profile table is the config-read seam:** `SEGMENT_PROFILES`/`POINT_PROFILES` are base-case constants with explicit seam comment. Downstream config-driven size layer replaces reads here only (principle 5.2). Never hardcode profile dimensions elsewhere.
- **Derived solids are never stored:** recomputed each `deriveWireframe` call. Parameter objects only; no three.js in the derive fn.
- **Duct category has a profile but no run currently resolves to 'duct':** profile present for when `RUN_PAIR_MAP` gains a duct entry. Not a dead-code warning — it's deliberate forward-proofing.

### Invariant checkers added

- `window.__dumpRuns()` — prints per-run: vertCount, slotCount, MATCH/MISMATCH, positions-agree=true/false, pointSlot detail with itemRef.
- `window.__dumpSolids()` — calls `deriveWireframe()`, prints kind/radiusM/widthM/heightM/length/center for each solid.

---

## SESSION 34 — §8.2 step 4: Runs as 3D paths (v1) (2026-06-25)

**Branch:** main | **Commit:** 6d3dc3c — pushed to origin.

### What was built

**§8.2 step 4 — run-path model, full piece:**

- **`RUN_PAIR_MAP` + `resolveRunPairEntry`** module-level (App.jsx): unordered pair→category table. Seeded with one entry: `{air-handler, outdoor-unit} → lineset`, satisfying `lineset-endpoint` (air-handler) and `lineset-to-handler` (outdoor-unit) using real ids from ITEM_TYPES. Adding a new run type = one new data row only (principle 5.3).
- **Storage:** `shapeKind: 'run'` in `completedShapesRef` (grade-line precedent — single open-polyline array, no separate ref). Stored fields: `{ id, shapeKind:'run', vertices, pageId, status:'locked', endpointItems:{start, end}, category }`. Vertices via `makeVertex` (pixels, recalibration-independent).
- **Persisted uncharacterized state (headline new model):** A run commits to `completedShapesRef` in deliberately-incomplete state and survives page-nav and reload. No prior precedent in the codebase.
- **`runDrawing` useState** + **`runItemSnapRef`** useRef — draw state and live equipment snap target (visual only; no binding until commit).
- **`findEquipSnapTarget(pos)`** — 14px equipment proximity check, current page only.
- **`buildCharacterizedRun(run, currentShapes)`** — immutable; resolves pair map from endpoint items; writes `obligationState[obligationId] = runId` on BOTH endpoint items; returns `{ run: finalRun, updatedShapes }`.
- **`clearRunSatisfaction(run, currentShapes)`** — immutable reversal; called on run delete and on equipment-item delete that has connected characterized runs.
- **`commitRun()`** — derives endpoint items at commit time via fresh proximity check; calls `buildCharacterizedRun`; bumps `worklistTick`. Enter key and "Finish run" button both commit.
- **Draw interaction:** "Draw run" button (floor/roof pages, confirmed scale, no other active mode) enters `drawMode + runDrawing`. Purple ring on equipment-item hover. Finish-anywhere ≥2 vertices. Close-snap suppressed for runs. Wall-vertex `drawStartSnapRef` suppressed for runs (equipment-only snap).
- **Delete sub-mode:** extended to handle `wasRun` (reverse characterization) and `wasEquipment` (reverse characterization on all connected characterized runs, then null their category/endpoints). `worklistTick` bumped for either.
- **`hitTestShapeBody`:** extended with run segment proximity check (between equipment check and polygon check).
- **Exclusions:** `hitTestVertices`, `hitTestSegments`, `getEligibleShapes`, all 5 `drawEditCanvas` forEach loops — all skip runs. `drawLockedShapes` and `drawGhostShapes` in canvasRenderer.js also skip runs.
- **`drawRunPaths(ctx, completedShapes, pageId)`** exported from canvasRenderer.js: grey dashed (uncharacterized), solid amber (lineset), endpoint dots. Wired into all 14 render paths.
- **Worklist panel:** run obligations with `satisfiedValue !== null` render "✓ Connected" (green) before the blocked check — so a connected run obligation shows satisfied, not 🔒.
- **`deriveWireframe` extended:** `runLines` array — one segment per vertex pair per run; scalar Z from `zStack.floorZ` (floor plans) or `roofZFallback` (roof plans); `{ id, category, from, to }`. Return updated to include `runLines`; null-return also includes it.
- **ThreeDView.jsx:** destructures `runLines`; renders by category group (grey 0x9ca3af = uncharacterized, amber 0xf59e0b = lineset); legend entries added.
- **Fenced items logged:** ADDITIONAL_FUNCTIONALITY.md #64–68 (envelope-crossing detection, multi-hop cascade, slope/per-vertex Z, conflict checks, role-wiring).

### Architecture decisions locked this session

- **Run is a PATH, not a shape** — vocabulary enforced in all code comments, labels, and this doc.
- **Endpoint binding at COMMIT TIME** (not per-click) — fresh proximity re-check when "Finish run" fires; handles Z-undo correctly with no per-click tracking refs.
- **Uncharacterized IS the stable resting state** — no distinction between "one loose end" vs "unmapped pair" in storage or rendering; both are grey.
- **Satisfaction is two-sided and reverses** — `clearRunSatisfaction` restores both endpoint obligations to null on any disconnect path; no orphan satisfaction.
- **`deriveWorklist()` mechanism unchanged** — it reads `obligationState` each call; the run model writes/clears `obligationState` directly; no engine change needed.

---

## SESSION 33 — §8.2 config-driven worklist, Parts A + B (2026-06-25)

**Branch:** main | **Commits:** 4635e59 (Part A), 6ae5f53 (Part B), 0a962f5 (UX fixes) — all on origin.

### What was built

**Part A (4635e59) — data model + worklist panel:**
- ITEM_TYPES module-level table (4 types: air-handler, outdoor-unit, bath-fan, hrv-unit) each with obligation list (run/property kinds).
- `spawns` hook on CONFIG_FIELDS filled as a FUNCTION `(value) => [{type, count}, ...]` on space-heating, ventilation, and new bath-fans fields.
- New `kind: 'count'` descriptor on bath-fans field (numeric entry, separate from multi/single-select).
- `deriveWorklist()` pure computed function in render scope — derived fresh every render from config gap minus placed items; never stored (mirror of fhOutstanding precedent).
- `worklistTick` useState(0) bumped in `setConfigValue` so panel re-derives on every spawning-field change.
- Worklist panel (purple button, right:600px overlay) — to-place list + blocked-obligation preview; obligations grayed+🔒 (run) or property select disabled.
- `__dumpWorklist()` DEV console fn. Verified in Ben's browser: 5 items, correct obligation output.

**Part B (6ae5f53) — canvas placement + render wiring:**
- `isEquipmentItem(s)` helper in both App.jsx and canvasRenderer.js.
- `drawEquipmentItemShapes(ctx, shapes, pageId, zoom)` export in canvasRenderer.js — purple circle + type-initials, zoom-compensated radius — wired into **14 render paths** (5 edit sub-modes, 5 named draw functions, 4 inline repaints).
- Single-click placement on floor-plan OR roof-plan pages. Point shape: `{ id, shapeKind:'equipment-item', itemType, instanceKey, pageId, status:'locked', vertices:[makeVertex(x,y)], obligationState:{} }`.
- Pixels stored; world meters derived on demand via `pageVertexToWorld` — recalibration-independence (#22) browser-verified this session.
- Place button per worklist row; worklist closes on Place click; crosshair cursor during placement.
- `deriveWorklist()` extended: subtracts placed items by instanceKey from toPlace; populates per-placed obligations with live property `<select>` (mount-type enabled once outdoor unit placed).
- Equipment items: move/delete editable via existing Edit Shapes suite; excluded from insert-vertex / split / combine via isEquipmentItem guards; hitTestShapeBody extended with 14px proximity check.
- `worklistTick` bumped after delete → item returns to toPlace immediately.
- Placement state cleared on PDF upload and page navigation.

**UX fixes (0a962f5):**
- Bath-fans count input: `psCountDrafts` string-draft map so field clears freely (0 shows as empty; onBlur normalizes; `Number(n)` coercion in spawns unchanged).
- Delete sub-mode: red hover ring (18px / zoom, #dc2626) drawn over hovered equipment markers to match polygon delete-hover affordance.

### Architecture decisions locked this session

- **spawns is a FUNCTION** `(value) => [{type, count}]`, not a static map — required so count-driven bath-fans can pass a numeric value.
- **Worklist is DERIVED** (`deriveWorklist()`), never stored — fh-outstanding pattern. Only placed items are stored (completedShapesRef as shapeKind:'equipment-item').
- **Placed equipment items store PIXELS** (single vertex); world meters re-derive through `pageVertexToWorld` — recalibration-independence (#22) confirmed in browser (marker stays pinned to PDF on rescale).
- **Obligation kinds are an open/extensible set** (run/property/placement), switched on kind — not a baked enum. New kinds are data additions.
- **Obligations are role-blind this build** — cross-trade tags ((plumber)/(electrician)/(envelope)) are descriptive label text only, not wired to §9 roles.
- **Placement is editable via Edit Shapes** (move/delete) but excluded from polygon-only ops (insert/split/combine) via isEquipmentItem guards.

### IMPORTANT field-model finding

The CONFIG_FIELDS model has **separate** `space-heating` and `cooling` fields (NOT a combined heating-cooling field). "Ducted heat pump" = `space-heating` field, value `heat-pump-ducted`. This matters for:
- Any future cooling-side spawn wiring (e.g., cooling='heat-pump' auto-derived from space-heating selection)
- The heat-pump→cooling autofill item logged as ADDITIONAL_FUNCTIONALITY this session

---

## STANDING SESSION-START CHECKLIST (run every session, every fresh working tree)

1. `git pull --ff-only origin main` — confirm clean fast-forward. If NOT clean, STOP.
2. `git log -1 --oneline` — confirm HEAD hash matches last known-good commit.
3. **`.claude/settings.local.json` is now tracked in-repo** (commit f24fd7e). No recreate needed.
   The global git ignore rule (`**/.claude/settings.local.json` in `C:\Users\ben\.config\git\ignore`)
   was permanently overridden by `!.claude/settings.local.json` in the project `.gitignore`.
   The file travels with clones and worktrees. This step is RETIRED — no action needed.
4. Confirm `VISION_SUPPLEMENT.md` + `WIREFRAME_RECON_REPORT.md` present in working tree.
5. `npm install` only if `node_modules` is missing or `package.json` changed; skip otherwise.

Report all five, then WAIT for the build prompt.

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

---

## SESSION 17 — Coordinate conversion (R2) fully scoped

**Branch:** main | **Commits:** none (planning only — no code written this session)

### What happened

Planning session that scoped the pixels→real-world coordinate conversion pulled
forward in Session 16. No code written. Every design fork is now resolved; the next
session is the build, starting with the consumer inventory (sub-fork 5).

### Target: R2 — single shared real-world XY frame

Of three candidate scopes — R1 (per-page real units, no shared frame), R2 (single
shared real-world XY frame, Z stays datum-layer), R3 (full XYZ, per-vertex Z) — the
target is **R2**. R1 is too shallow (no shared frame ⇒ the next Z-step hurts again).
R3 is the ELEMENT layer (#7, #19) and stays SEQUENCED BEHIND the conversion. R2 is
the foundation that makes R3 cheap to add later.

**R2 is built to R3-readiness as a HARD ACCEPTANCE CRITERION, not a nice-to-have:**
1. **Z-ready vertex shape** — vertices stored in a structure designed to carry an
   optional Z from day one (absent/null now), so R3 adds Z as an extension, not a
   hunt-and-patch retrofit.
2. **No coordinate-coincidence merging (#19)** — R2 must NOT merge or dedupe elements
   on the basis of shared XY. Two coplanar elements at the same XY remain distinct
   (slab-vs-wood-frame case). Per-element identity is preserved even though R2 only
   models XY.

### Standing rule for the whole refactor (R2/R3 boundary discipline)

We are building the FOUNDATION (R2). Anything needing per-vertex Z, per-element
offsets, or assembly identity is R3 — it gets logged and sequenced, never folded in.
When a build piece *feels* like it wants Z, that feeling is the signal we've hit the
R2/R3 seam: STOP and check, do not build through it. (Ben flagged he may need
reminding of this as build depth increases; Claude surfaces it proactively, same as
the scope-drift protocol, tuned to this seam.)

### Five sub-forks — RESOLVED

- **1 (origin/frame) — 1a:** the primary-reference page (`primaryReferenceId`, first
  calibrated) defines the shared frame; its calibrated space converted to real units
  IS the frame. Every other page's geometry is placed into it by walking the
  `pageRefParent` chain and composing the existing `pageTransformsRef` align
  transforms. "Fixed arbitrary origin" coincides operationally with the primary
  page's zero — everything still computed geometry-to-geometry. Reuses the multi-floor
  sub-step-5 machinery as-is; no synthetic-frame layer (1b rejected — buys nothing
  until R3).
- **2 (canonical unit) — meters, stored:** all geometry stored in meters (one
  canonical unit; `pxPerMeter` is the natural pivot). DISPLAY/ENTRY stays imperial
  (ft+in), UNTOUCHED by this refactor. This refactor changes STORAGE only. The unified
  metric/imperial ENTRY rework (#20) stays deferred — NOT part of this work. Boundary:
  storage metric, entry/display imperial.
  *(HISTORICAL RECORD — Session 17 planning. **SUPERSEDED by Path 3 in Session 18:** geometry
  stays stored in PIXELS; meters are a read-time projection. See Session 18 entry.)*
- **3 (conversion source) — via `getEffectiveScale`:** own-calibration pages use their
  `pxPerMeter`; confirmed-ghost/borrowed-scale pages use the borrowed
  `getEffectiveScale` value; uncalibrated pages cannot convert and stay excluded /
  pixel-only. Forced by existing machinery.
- **4 (migration model) — 4a, store meters natively:** geometry is stored in meters
  the moment it's created; pixel↔meter conversion happens ONLY at two well-defined
  seams — input events (mouse=pixels in) and render (canvas=pixels out). Refs hold
  meters, period. Rejected 4b (keep pixels, convert-on-read): 4b formalizes the
  pixel/units split into every consumer forever — the exact friction being removed —
  and does NOT lay the foundation. 4a is more upfront work (every consumer changes
  once, = sub-fork 5) but is the least-bug-prone ARCHITECTURE and is neutral-to-cheaper
  at runtime (convert twice per interaction at seams vs. on every read). Ben accepted
  the upfront-work-for-correctness trade explicitly.
  *(HISTORICAL RECORD — Session 17 planning. **SUPERSEDED by Path 3 in Session 18:** pixels
  stored, meters projected at read time via pxToMeters/metersToPx. 4a creates a
  recalibration trap (frozen conversion ratio); Path 3 avoids it. See Session 18 entry.)*
- **5 (consumer inventory + done-state) — the build itself:** every snap, label,
  hit-test, transform consumer, and the draw/edit/calibration handlers that currently
  assume pixels get converted to read meters. This is the bulk of the work and the
  first build step of the next session. **Done-state (as planned in Session 17, superseded):**
  all geometry in the shared real-world XY frame in meters; every consumer reads meters; pixel
  conversion isolated to the two seams; R3-ready vertex shape in place; #19 identity preserved.
  *(HISTORICAL RECORD — Session 17 planned done-state. **SUPERSEDED:** actual done-state per
  Path 3 = geometry stays in pixels, named seam installed, makeVertex factory in place. See Session 18.)*

## SESSION 18 — R2 coordinate foundation (Path 3 / named seam + vertex factory)

**Branch:** main | **Commits:** 040e371 (Piece 1), 71e01ca (Piece 2)

### What was built

**Pixels→real-world coordinate foundation — Path 3 / 3-minimal (behavior-neutral refactor)**

Two pure refactor commits, zero behavior change. Geometry stays stored in pixels.

**Piece 1 (040e371): Named px↔meter conversion seam**
- `pxToMeters(px, pageScales, pageId)` and `metersToPx(m, pageScales, pageId)` added to
  `canvasRenderer.js` — same `(value, pageScales, pageId)` signature as `pxToDisplayDist`.
- `pxToDisplayDist`'s internal `px / scale.pxPerMeter` now routes through `pxToMeters`.
- `snapToGrid`, `applySnap`, `snapPerp` (all three used `scale.pxPerMeter * snapIncrementRef.current`)
  and `commitLabelEdit` (`meters * scale.pxPerMeter`) now route through `metersToPx`/`pxToMeters`.
- Confirmed: `snapIncrementRef.current` is stored in meters (e.g. `0.1524` = 6 inches). Math
  identical. `pxToMeters` available in App.jsx for R3 call sites that need px→m.

**Piece 2 (71e01ca): makeVertex factory + R3-ready vertex shape**
- `makeVertex(x, y)` exported from `geometry.js`: returns exactly `{ x, y }`. z is ABSENT (not null).
- All stored-polygon-vertex construction routes through it:
  - App.jsx: `snapToGrid` return, `applySnap` return, `getAlignmentSnap` snappedPos, `clampToCanvas`
    return, `insertPt`, `applySegmentMove` (both moved verts — this site not listed in recon but clearly
    stored vertices, added for completeness)
  - geometry.js: `findCollinearOverlap` P_start/P_end; `linePolyIntersect` interior + vertex crossing
    points; all six vertex constructions in `splitPolygon`
- Spreads of makeVertex results (`{ ...makeVertexResult }`) are left as-is — spread copies all own
  enumerable properties, correctly propagating z when R3 adds it. Not routed: `getCanvasPos` (input
  seam, not stored), roofGraphRef nodes (graph topology, not polygon vertices), transient mid-calc
  `{x,y}` literals that never reach completedShapesRef.

### The Path 3 decision (supersedes Session 17's 4a scope)

Session 17 resolved sub-fork 4 as "4a / store meters natively." That was SUPERSEDED after a
code-recon pass confirmed that:

1. **4a creates a recalibration trap:** storing meters freezes the `pxPerMeter` ratio at write time.
   If a page (or its borrow-chain parent) is recalibrated, stored meters are silently orphaned —
   a data-corruption path that does not exist in the pixel-stored model.
2. **Path 3 is strictly less machinery for the same R2 outcome:** geometry sharing a real-world
   frame is achieved operationally through shared calibration scale + ghost alignment, not by
   composing coordinates into a single stored representation. Composing the `pageRefParent` chain
   onto actual geometry coordinates is R3 work, not R2.
3. **R2 acceptance criteria fully met:** (a) R3-ready vertex shape via makeVertex — verified by
   static review (returns `{x,y}`, z absent, spreads propagate correctly); (b) no coordinate-
   coincidence merging (#19 honored, coplanar elements stay distinct).

The Session 17 planning docs described 4a. Those docs now reflect Path 3. Historical note:
Session 17's fork-4 resolution (4a) is superseded — it was the right analysis given the
information available; Path 3 emerged from seeing the actual consumer sites during recon.

### New deferred-register entries this session

- **#21 — Planes/edges as rule-imposing boundaries:** ELEMENT-LAYER requirement; edges are
  boundaries with rules, not just point-pairs. Architectural record, constrains R3/Phase 2 design.
- **#22 — Recalibration-independence invariant:** geometry must stay scale-independent in storage;
  no frozen conversion ratio. Active invariant (not deferred) — Path 3 honors it; future steps must too.

---

## SESSION 19 — Elevation spatial Pieces 1+2: edge-pick + align + own-scale confirm

**Branch:** main | **Commits:** 89b7ba2 (Piece 1), current (Piece 2)

### What was built

**Elevation spatial Piece 1 (89b7ba2): "Set elevation edge" mode**
- Toolbar button on Elevation pages opens pick mode.
- Floor-plan ghost drawn on elevation canvas; user clicks any ghost perimeter segment.
- Stored as `elevationEdgeRef.current[elevPageId] = {sourcePageId, shapeIndex, segmentIndex,
  endpointA, endpointB}` — authoritative-indices pattern (same as frontFace).
- Purple edge highlight via `drawSegmentHighlight(ctx, a, b, 'elev-edge')` variant.
- Selector shown when >1 floor-plan candidates with locked shapes.
- Helpers: `hitTestElevEdgeSegment`, `selectElevEdge`.

**Elevation spatial Piece 2 (current): "Align elevation" mode**
- "Align elevation" button: visible on Elevation pages with stored edge; disabled (with title hint)
  when no edge is set or source has no scale.
- Mode: temporary bounding box padded by `ELEV_EDGE_PAD = 24` world pixels around the two
  edge endpoints, four amber corner handles.
- Body-drag → translate; corner-drag → uniform scale, anchor at diagonally-opposite corner.
  Identical math to floor-reference align: `newS = startS * (d1/d0)`, `tx1 = ax - (ax - startTx) * ratio`.
- Drag uses existing `alignDragRef` / `alignTick` / `alignOverHandle` refs — no new drag state.
- Zoom/pan remain active during align.
- Prompt bar: "Drag to translate · drag a corner to scale · then Confirm."
- "Confirm alignment": computes `elevPixelLen = hypot(B-A)` in shared canvas space;
  `realLenMeters = elevPixelLen / srcPxPerMeter`; `elevPxPerMeter = elevPixelLen / realLenMeters`.
  Stores `pageScalesRef.current[elevPageId] = { pxPerMeter: elevPxPerMeter, displayUnit }`.
  Does NOT set `pageRefParentRef` — elevation is a calibrated peer, not a scale child.
  After correct alignment `elevPxPerMeter = srcPxPerMeter` (canvas coordinate space is shared).
- "Exit" dismisses without writing scale.
- Both modes reset on page navigation and PDF upload.

### Key architectural insight confirmed this session (coordinate-system invariant)

The PDF `{tx,ty,s}` transform in `pageTransformsRef` is VISUAL ONLY: it repositions the
`.pdf-align-layer` backdrop div, not the measurement canvas (`measureRef`) or the canvas-world
coordinate system where geometry is drawn. After correct alignment, ghost and elevation PDF
features are co-registered in the same canvas-world space, so the elevation's `pxPerMeter`
numerically equals the source plan's `pxPerMeter`. This is correct behavior — both pages
share one coordinate space. This invariant is now documented in CLAUDE.md Design notes.

### Architecture decisions

- Elevation stores its OWN `pageScalesRef` entry, NOT via `pageRefParentRef` borrow.
  Rationale: own calibration honors #22 (recalibration-independence): if the source floor
  plan is recalibrated, the elevation's stored scale stays fixed. The value equals srcPxPerMeter
  because the coordinate space is shared — but it is stored independently as a calibrated peer.
- `resolveElevEdge(pageId)` helper: always resolves endpoints live from authoritative
  indices (shapeIndex/segmentIndex) rather than from the endpointA/B snapshots.
- `getElevEdgeBbox(A, B)` helper: pads by 24px on all sides so handles are always
  grabbable even for near-degenerate (very short or axis-aligned) edges.

### New deferred-register entries this session

- **#23 — Isometric multi-reference elevation alignment:** Z-driven display of floor-plan
  references projected isometrically onto elevation view. Deferred pending R3/Phase-2
  coordinate model (#7, #17, #19). See ADDITIONAL_FUNCTIONALITY.md.

### Bug / improvement items logged (not built)

- **Front-face select vanishes until next page:** the edge highlight/interaction may not
  persist correctly across all redraws — needs a focused fix session.
- **Categorize-input button color scheme not documented:** "next logical step" highlighting
  logic exists but the color-state rules are not written down; UI polish candidate.

---

## SESSION 20 — Elevation Piece 3 sub-pieces 1+2: reference lines + drag-to-place

**Branch:** main | **Commits:** 1cb2c0b (sub-piece 1), b597e91 (sub-piece 2)

### What was built

**Sub-piece 1 (1cb2c0b): `drawElevRefLines` — read-only floor/ceiling reference lines**
- `drawElevRefLines(ctx)` helper added before `redrawFrontFaceLayer` in App.jsx.
- Called at end of `redrawFrontFaceLayer` (view mode); gates on confirmed `pxPerMeter` +
  `resolveElevEdge` non-null + `fhZStack.length > 0`. View-only — not yet wired into
  draw/edit redraws (elevation tracing is Piece 4, not yet built).
- Teal (`#0d9488`) solid floor lines; amber (`#d97706`) dashed ceiling lines; labels left edge.
- Anchor Y: `elevBaseYRef.current[pageId] ?? (edgeData.A.y + edgeData.B.y) / 2` (provisional fallback).
- Spacing: `anchorY - (Zfeet - lowestFloorZFeet) × 0.3048 × pxPerMeter`.
- `floorHeightsTick` added to passive-redraw `useEffect` deps.

**Sub-piece 2 (b597e91): `elevBaseYRef` + drag-to-place base line**
- `elevBaseYRef = useRef({})` — per-elevation-page pageId-keyed anchor Y; cleared on PDF upload.
- Mousedown intercept: in view mode (before pan), hit-tests within `8 / zoom` px of base line Y.
  If hit: stores `alignDragRef.current = { mode: 'elevBase', startClientY, startBaseY, pageId }` and
  returns (no pan). Mousemove: `dy = (clientY - startClientY) / zoom`; writes `elevBaseYRef`; calls
  `redrawFrontFaceLayer(null)` directly. Mouseup: clears alignDragRef before the `!editMode return`.
- Pan on empty canvas completely unaffected (hit-test fails → falls through to `startPanDrag`).
- Persists across page-nav (pageId-keyed); cleared on PDF upload.

### Key design decisions confirmed this session

- **Option B for Piece 3 drag:** placement-only — drag moves WHERE the stack sits on the elevation;
  drag does NOT edit floorHeightsRef values. Drag-to-edit individual heights is a separate later sub-piece.
- **Drag = whole-stack shift:** one Y-offset for the entire stack; `accumulateZ` spacing is always
  authoritative. Only the base line is the grab target; other lines are not yet interactive.
- **No new React state:** `elevBaseYRef` is a ref (not state). Repaint driven by direct
  `redrawFrontFaceLayer(null)` call from mousemove — no tick bump needed.
- **`alignDragRef` reuse with `mode: 'elevBase'`:** safe because `elevAlignMode` and `alignMode`
  return early before elevBase code would conflict. Clean separation.

### New deferred-register entries this session

- **#24 — Global drag-release robustness:** drags ending outside the browser window don't release
  on mouseup; fix is window-level listener + pointercancel. App-wide, low-risk polish pass.
- **#25 — Edge-select button labels:** Piece 1 "Set elevation edge" shows only "Exit" after
  picking; should offer "Confirm edge selection" / "Choose again". UI polish.
- **#26 — Categorization exit navigation bug:** exiting categorize mode while on an uncategorized
  page stays on that page; should navigate to last categorized page. Step 4b bug.
- **#27 — Reference-line snap-suggest to known Y positions:** when dragging the base line, snap
  toward known reference Ys (edge-midpoint, peer pages). Same UX as start-vertex snap-suggest.
- **#28 — PDF visual analysis / analysis-first front end (MAJOR VISION):** automated per-page
  analysis on upload → confirm-and-correct overlay. Original product vision; flagged for deep-review
  waypoint as a paradigm-level decision (analysis-first vs. trace-first).

---

## SESSION 22 — Elevation Piece 4 sub-piece 2 (grade line) piece 1: open-polyline grade tool + on-closure prompt

**Branch:** main | **Commit:** 3fae81b

### What was built

**Grade-line draw tool (piece 1 of 3) — commit 3fae81b**

- **`shapeKind: 'grade-line'` discriminator** — new optional field on shapes in `completedShapesRef`. Absent (undefined) = closed wall polygon (all existing shapes, zero migration). Present as `'grade-line'` = open reference polyline.

- **Type-discrimination at 7 code sites:**
  - `drawLockedShapes` (canvasRenderer.js): skips grade-line entries (no `closePath`)
  - `drawGhostShapes` (canvasRenderer.js): skips grade-line entries (grade lines don't show as ghost reference on adjacent floors)
  - `hitTestSegments`: skips grade-line shapes (edit hit-test only targets wall polygons)
  - `hitTestShapeBody` / `pointInPolygon`: skips grade-line shapes (no area hit-test on open line)
  - `getEligibleShapes` (geometry.js): excludes grade-line shapes from Combine eligibility
  - All 5 edit sub-mode forEach loops: skip grade-line shapes in drawShapePoly calls

- **`drawGradeLineShapes(ctx, completedShapes, pageId)`** new export in canvasRenderer.js: draws open polylines in green (#16a34a) dashed (8/4) style with vertex dots; no `closePath`; respects pageId filter. Wired into all 13 render paths (view/draw/review/edit sub-modes/roof/role canvases).

- **On-closure prompt on Elevation pages:** when a wall polygon closes on an Elevation page, `setShowGradeLinePrompt(true)` fires alongside `setReviewShape(shape)`. The polygon enters normal review state. Prompt shows "Trace grade line?" with [Yes — trace grade line] / [No] buttons. Yes sets `gradeLinePending: true`; No clears the prompt. Prompt choice is independent of polygon confirm/discard.

- **`confirmShape` integration:** reads `gradeLinePending` before clearing it. If pending: after polygon is locked, `setGradeLineDrawing(true)` — grade-line trace mode starts automatically. Otherwise: `maybePromptFrontFace()` as normal.

- **Grade-line draw mode:** reuses existing `drawVerticesRef` and all snap/draw conventions (axis snap, distance snap, alignment guides, Z undo). Close-snap ring suppressed (`!gradeLineDrawing && vertices.length >= 3`) so the polyline cannot accidentally close back to its start. Finish via Enter key or "Finish grade line" toolbar button (disabled if `< 2` vertices). Escape/Cancel exits draw mode and clears grade-line state.

- **`commitGradeLine()`:** pushes `{ vertices: [...verts], pageId, status: 'locked', shapeKind: 'grade-line' }` to `completedShapesRef`; clears draw state; redraws via `redrawDrawCanvas(null, [], ...)`.

- **State management:** `showGradeLinePrompt`, `gradeLinePending`, `gradeLineDrawing` — all reset on page-nav, PDF upload, `exitDrawMode()`, and `discardShape()`.

- **Wall polygon unmodified throughout:** the grade line is stored alongside the wall polygon; no intersection, splitting, or tagging of the polygon occurs. Above/below-grade interpretation is R3/deferred.

### Known gaps (pieces 2 and 3)

- **Piece 2:** Enforce termination on polygon vertex/edge (grade line must start/end on wall geometry); add lowest-floor reference line as visual guide.
- **Piece 3:** Grade-line editing (vertex drag, segment drag via Edit Shapes or a dedicated edit mode).
- **UX clarity pass:** "Grade line draw UI needs a clarity pass" logged — toolbar text and prompt flow could be cleaner.
- Grade lines are NOT Z-aware (no per-vertex Z); all vertices stored as 2D pixels via makeVertex factory.

### Dev fixture

Dev fixture (commit 21a967c from Session 21) captures `completedShapesRef` including grade-line shapes with `shapeKind` field. Snapshot + restore via console (`copy(JSON.stringify(window.__snapshotFixture()))` / `await window.__restoreFixture(obj)`). Fixture PDF at `public/devFixtures/test-fixture.pdf` (gitignored). Save/Load buttons still deferred (#31).

### New deferred-register entries this session

- Grade-line UI clarity pass: toolbar text and prompt could be more obvious — log for a UI polish session.

---

## SESSION 21 — Elevation Piece 4 sub-piece 1: tracing + edit on Elevation pages; edit-drag index fix; dev fixture

**Branch:** main | **Commits:** 5266dc5 (Piece 4 sub-piece 1), 1a3a144 (edit-drag bug fix), 21a967c (dev fixture)

### What was built

**1a3a144 — Fix elevation edit hover/drag: filtered-local vs. global shapeIdx**
- Root cause: `drawEditCanvas` default path used `.filter().forEach()` which gives LOCAL `shapeIdx` indices; hit-test functions (`getSegHit`, `getVertHit`) return GLOBAL indices into `completedShapesRef`. The elevation shape at global index 1 was filtered to local index 0 — `previewOverride.shapeIdx === shapeIdx` (1 === 0) always false → no preview, no drag visual.
- Floor-plan pages worked by coincidence: their shape is always `completedShapes[0]`; filtered index 0 = global index 0.
- Fix: `.filter().forEach()` → `.forEach()` with `if (shape.pageId !== currentPageId) return`. All other sub-modes already used the correct pattern.
- Three `!editMode` guards kept in `handleMeasureMouseMove` (lines 1447, 1484, 1531) — protect `elevAlignMode`, `alignMode`, and `elevBase` from intercepting edit-mode canvas interactions.
- All `[DBG-MD]`/`[DBG-MM]`/`[DBG-]` instrumentation removed before commit.

**5266dc5 — Elevation Piece 4 sub-piece 1: closed-polygon tracing + edit on Elevation pages**
- `drawElevRefLines` wired into `redrawDrawCanvas`, `redrawReviewCanvas`, and all five `drawEditCanvas` sub-mode paths (was view-mode only).
- `floorHeightsTick` added to draw/edit passive-repaint deps.
- No category fork: Elevation pages use the standard closed-polygon draw/review/confirm/lock/Edit-Shapes workflow directly.
- Decision: elevation outline = CLOSED polygon (not open polyline). Architecturally correct — an elevation outline is a boundary.
- Browser-verified.

**21a967c — Dev-only capture/restore test fixture**
- `window.__snapshotFixture()` and `window.__restoreFixture(obj)` DEV-guarded in component render body.
- Snapshot: all scenario-defining refs + state; excludes non-serialisable `combineEligibleRef` (Set) and ephemeral mode flags.
- Restore: writes all refs → resets modes → fetches `/devFixtures/test-fixture.pdf` → React state cascade + `renderPage`.
- `public/devFixtures/test-fixture.pdf` added to `.gitignore` — never committed.
- `copy(JSON.stringify(window.__snapshotFixture()))` = record; `await window.__restoreFixture(obj)` = restore.

### Key design decisions

- **Closed polygon for elevation outline.** Open polyline rejected — standard workflow correct.
- **Index fix: `.filter().forEach()` → `.forEach()` + early return** — matches existing sub-mode pattern.
- **Two-commit staging:** fixture block temporarily removed, commit A landed, fixture restored, commit B landed.
- **Fixture is console-only:** Save/Load buttons deferred (#31).

### Session runtime lesson

Elevation edit-drag bug survived TWO static-analysis rounds. Only `[DBG-]` instrumentation revealed the filtered-local vs. global index mismatch. Rule reinforced: **when a bug survives a static read, instrument and run.**

### New deferred-register entries this session

- **#29 — Derived envelope block + confirm-and-annotate elevation model:** Phase 2 architectural target; elevation surfaces derived from floor-plan polygons, not traced freehand. Gated on R3.
- **#30 — Grade / soil line:** geometry-only open polyline; Elevation Piece 4 sub-piece 2.
- **#31 — Dev fixture Piece 2: Save/Load buttons** (console-only today).
- **#32–#40 — Small UX notes:** categorize shortcut, button colour audit, ghost-vertex snap gap, align-handle cursor mirror, sidebar auto-collapse, edge-select copy, isometric ghost preview, reference-line label stacking + unconfirmed indicator, floor-to-floor field auto-grey.

### Piece 3 sub-piece 3 status

Drag-to-edit individual heights — **shelved, not cancelled.** Height editing stays panel-only.

### NEXT (after Session 23/24 — binding model reverted, grade line DONE)

Grade-line piece 2 is **DONE** (Session 24; c7a2092). The binding model was reverted — grade line
finishes anywhere with ≥2 vertices; snap is a position aid only. **Next is Ben's choice:**
- Optional grade-line **Piece 3**: "Redraw grade line" button (delete + restart draw), OR
- Move on to **elevation cross-sections / windows-doors**, OR
- Another increment from the deferred list.

---

## SESSION 23 — Elevation Piece 4 sub-piece 2 piece 2: enforced wall-vertex endpoint binding

**Branch:** main | **Commit:** 2f3f071

### What was built

**Grade-line endpoint binding (A1 strict) — commit 2f3f071**

BOTH grade-line endpoints must snap to and bind an existing wall-polygon vertex. Finish is blocked until both ends are bound; the committed shape carries identity refs to the bound vertices.

**New helper — `getWallVerticesWithId(pageId)`:**
Returns `Array<{x, y, shapeIdx, vertIdx}>` for wall-polygon vertices only (excludes `shapeKind === 'grade-line'`). `shapeIdx` = global index into `completedShapesRef`. `getVisibleVertices` and normal polygon start-snap are UNCHANGED — parallel path active only while `gradeLineDrawing`.

**Snap paths:**
- First vertex: mousemove uses `getWallVerticesWithId` (not `getVisibleVertices`) when `gradeLineDrawing`; `drawStartSnapRef` now carries `{x, y, shapeIdx, vertIdx}`. Existing red-ring render reads `.x/.y` — no change.
- Last vertex: new `gradeEndSnapRef = useRef(null)` stores nearest wall vertex during mousemove; red-ring render added.
- Shift suppresses both (but un-snapped last click sets `end = null` → Finish blocked).

**`gradeBindings = {start, end}` state:** Written on every click — first click records `start` identity; each subsequent click records `end` identity (null if no snap). Z-undo clears `end` (and `start` if back to 0). Added to keydown `useEffect` dep array.

**Finish gate:** `gradeCanFinish = drawVertexCount >= 2 && !!gradeBindings.start && !!gradeBindings.end`. Button `disabled={!gradeCanFinish}`; inline hint "Both ends must land on a building corner"; `commitGradeLine` hard-gates independently.

**Committed shape additions:** `boundStart: {shapeIdx, vertIdx}` and `boundEnd: {shapeIdx, vertIdx}` written by `commitGradeLine`. No other shape type carries these fields.

**Reset sites (all 6):** `exitDrawMode`, `discardShape`, `goToPage`, `handleFileChange`, `commitGradeLine`, dev-fixture restore — all clear `gradeBindings` and `gradeEndSnapRef`.

### Architecture decisions

- A1 strict: both endpoints must bind a wall-polygon vertex. No edge-along binding. Edge-termination <1% deferred (#30).
- Follow-on-edit (sub-step 2c) seams identified in recon but NOT built here — piece 3.
- Lowest-floor reference-line snap deferred to piece 3 (or later).

### Browser-verified

Corner-vertex snaps work on both endpoints; Finish stays greyed until both bound; grade line locks green on commit.

*(Session 23 architecture decisions were superseded in Session 24 — see below.)*

---

## SESSION 24 — Grade-line binding reverted; snap-as-aid model confirmed; docs corrected

**Branch:** main | **Commits:** 344668b (2c floor-line snap), c7a2092 (binding revert + revert of 2b/2d), this doc commit (close-out)

### What was built / decided

**Step 2c — lowest-floor reference-line snap (344668b):**
`getLowestFloorLineY()` helper (same formula as `drawElevRefLines`). `gradeFloorLineSnapRef` tracks hover snap. Red dot indicator on floor line at cursor X. Corner snap takes priority. Shift suppresses. Clicking snaps vertex Y to floor-line Y. No binding recorded (was a prerequisite for 2d, now moot).

**Binding model reverted — finish-anywhere + snap-as-aid (c7a2092, −28 lines net):**
The 2b/2c/2d/2e endpoint-binding model was reverted as the wrong abstraction. Trigger: a real grade line legitimately ended in open space between two building masses — the binding gate blocked a valid drawing. This is not an edge case; it is the normal case for a grade line that continues past the building.

Grade line now finishes with ≥2 vertices ANYWHERE (corner, floor line, or open space). Corner snap (`getWallVerticesWithId` + `gradeEndSnapRef`) and floor-line snap (`getLowestFloorLineY` + `gradeFloorLineSnapRef`) remain as POSITION AIDS only — they affect vertex placement, record nothing. No `boundStart`/`boundEnd` fields. No `gradeBindings` state. Finish gate = `drawVertexCount >= 2` only.

**Above/below-grade meaning — #41 only:** read-time intersection of grade polyline against intact wall polygon. No stored binding needed. This is the sole model, confirmed as correct. Old 2e (follow-on-edit) is moot — nothing bound, nothing to follow.

**Dev fixture Save/Load buttons confirmed LIVE:** Discovered during doc check — buttons have been live since Session 22 (#31 done). CLAUDE.md + ADDITIONAL_FUNCTIONALITY.md corrected.

### Process lesson (carry forward)

A reference line drawn under snap rules should be scoped as ONE build (draw + snap + finish) with meaning derived at READ-TIME — NOT fragmented into binding sub-pieces. The grade-line binding work was over-engineered; the runtime (an open-space end) exposed the wrong abstraction; the revert left the codebase leaner. Carry this default into future reference-geometry sequences: snap = drawing aid, interpretation = read-time.

**The doc close-out for this session was missed at the time of c7a2092 and corrected in a separate doc commit.** The code was correct; only the five docs were stale.

### Architecture decisions

- Grade line = polyline, finish anywhere. Wall polygon never modified. #41 (read-time intersection) is the sole model.
- Piece 3 (Redraw grade line button — delete + restart) built Session 25. Sub-piece 2 fully done.
- 2c floor-line snap stays (useful drawing aid regardless of binding).

---

## SESSION 26 — Windows/doors placement layer: Pieces 1+2 + two fix rounds

**Branch:** main | **Commits:** code commit + doc close-out

### What shipped

**Windows/doors Pieces 1+2 — placement layer (browser-verified):**

**Piece 1 — data spine:**
- `shapeIdCounterRef` (monotonic `useRef(0)`) + `nextShapeId()`: assigns `id: 'sh-N'` to every shape at creation. `confirmShape`, `commitGradeLine`, `confirmRoofShape`, and `confirmOpening` all call `nextShapeId()`. Counter cleared on PDF upload.
- `shapeKind: 'window'|'door'` discriminator added to the existing `'grade-line'` discriminator set. Absent = closed wall polygon (default; no migration of existing shapes). `isOpening(s)` helper in both App.jsx and canvasRenderer.js at all discrimination sites.
- `OPENING_TYPES = ['Tilt-turn', 'Casement', 'Fixed', 'Slider', 'Hinged door']` module-level array. Dropdowns derive from this.
- `dimensionBasisRef`: project-level `'frame'|'rough-opening'|null`; set once via first-use gate; persists across page navigation; cleared on PDF upload.
- `drawOpeningPoly(ctx, verts, style)` in canvasRenderer.js: teal fill/stroke (rgba(6,182,212) / #0891b2); same style interface as `drawShapePoly`. `drawOpeningShapes(ctx, completedShapes, pageId)` iterates locked openings. Both wired into all render paths.
- `drawLockedShapes` and `drawGhostShapes` skip openings (`isOpening(shape)` guard). Openings never shown as ghost reference on adjacent floors.
- `getEligibleShapes` in geometry.js excludes `shapeKind === 'window'` and `'door'` from combine eligibility.
- All five edit sub-mode forEach loops handle openings: wall polygons via `drawShapePoly`, openings via `drawOpeningPoly`. Openings excluded from split hit-test (`hitTestShapeBody` guard).

**Piece 2 — interaction + dialog:**
- "Place opening" toolbar button: visible when `isElevationPage && pageHasScale && !anyActiveMode`.
- Two-click free rectangle: `openingCorner1` set on first click; `makeRectVerts(c1, c2)` builds 4-vertex CW rect on second click. `applySnap` called with `useAngle=false` at both clicks and in rubber-band mousemove — axis-snap off, distance-snap active.
- First-use gate: if `dimensionBasisRef.current` null, sets `openingDraftShape.pendingBasis=true` and shows "Frame Size or Rough Opening?" modal first.
- Opening dialog: Kind radio, Type dropdown, Width/Height ft+in (seeded from pixel distance via `openOpeningDialog`), Label, Confirm/Cancel. `parseFtIn` converts to meters.
- `confirmOpening`: pushes shape to `completedShapesRef`, restores snap, repaints.
- `discardOpening`: clears state, restores snap, calls `redrawFrontFaceLayer(null)` — immediate repaint.

**Fix 1 — free rectangle (no axis-snap):** Original build used `useAngle=true` in placement, forcing 45° diagonals (square-only). Fixed to `useAngle=false` in both click handler and mousemove rubber-band.

**Fix 2 — 1" default snap + save/restore:**
- `saveAndDefaultSnapIncrement()`: saves `priorSnapIncrementRef.current = snapIncrementRef.current`, then sets increment to `ONE_INCH_M = 0.0254m`. Called on "Place opening" entry and on "Edit Shapes" entry when `lockedShapesOnPage.some(s => isOpening(s))`.
- `restoreSnapIncrement()`: restores prior value. Called in `discardOpening`, `confirmOpening`, and `exitEditMode`.

**Fix 3 — discardOpening repaint:** `discardOpening` originally cleared state without repainting; rubber-band rectangle stayed on canvas until something else triggered a repaint. Fixed by adding `redrawFrontFaceLayer(null)` as last action.

**Persistent top-bar snap selector:**
- Removed: inline draw-toolbar selector (`snapDist && pageHasScale && (() => ...)`) and `editSnapIncrementSelect` variable + all 5 usages in edit toolbar.
- Added: single `<select>` in `.toolbar` div, always visible when `currentPage && pdf`, `disabled={!pageHasScale}`. onChange triggers `redrawDrawCanvas` in draw mode or `drawEditCanvas` in edit mode. Exactly one selector project-wide.

### Key decisions (carry forward)

- **Placement-first (Path 2 / dumb-duplicate model):** openings are independent rectangles with metadata. No shared identity, no component instances. This layer is explicitly throwaway — it exists so placement works now; the component model (#44) replaces/migrates it later. No compatibility shim needed.
- **Free rectangle, not axis-constrained:** axis-snap off during placement is intentional. Openings are defined by two user-clicked corners; 45° constraint is wrong for this tool.
- **1" snap default is defaulted, not forced:** the selector is live and overridable. Prior setting restored on exit.
- **`discardOpening` must repaint:** any discard/cancel path that clears `openingDraftShape` must also call a canvas repaint. This is the same discipline as `discardShape` calling `redrawDrawCanvas(null, [], ...)`.
- **Component model deferred (#44):** shared instance identity, edit-all-vs-make-unique, cross-elevation place-from-existing. The dumb-duplicate Pieces 1+2 is intentionally the first layer and will migrate.

### Recon findings (for future sessions)

- `isOpening()` must be checked at SEVEN sites: `drawLockedShapes`, `drawGhostShapes`, `hitTestSegments`, `hitTestShapeBody`, `getEligibleShapes`, all five edit sub-mode forEach loops, and the split hit-test. Any new shape-type discriminator touches these same seven.
- Opening shapes included in vertex/segment drag and move sub-mode automatically once the edit forEach loops call `drawOpeningPoly` for openings and `drawShapePoly` for polygons. No new drag logic.
- The rubber-band preview in `handleMeasureMouseMove` must match the click handler's snap params (`useAngle=false`); mismatching them caused the axis-snap-forced-square bug.

### New deferred-register entries

- **#44 — Window/door component model** (shared instance identity; edit-all/make-unique; cross-elevation picker; dumb-duplicate is throwaway; no Z/no 3D on instances; see ADDITIONAL_FUNCTIONALITY.md)
- **#45 — Window-as-assembly model (MAJOR)** (mullions, sub-sections, frame width, glass areas; performance coefficients are spreadsheet math not in-app; depends on #44; see ADDITIONAL_FUNCTIONALITY.md)
- **#46 — Window-schedule import + place-from-list** (recognize schedule table from PDF; cross-ref #28 and #44; see ADDITIONAL_FUNCTIONALITY.md)
- **#47 — Top-bar snap selector metric fallback on no-scale page** (cosmetic; disabled control; bundle with #20)

---

## SESSION 25 — Elevation Piece 4 sub-piece 2 piece 3: Redraw grade line button + sequence decision

**Commit:** e9c04a6 (code) + doc close-out

**What shipped:**
- **"Redraw grade line" button (e9c04a6):** elevation-page toolbar button, visible only when `isElevationPage && gradeLineOnPage && !anyActiveMode`. `gradeLineOnPage` derived from `lockedShapesOnPage.some(s => s.shapeKind === 'grade-line')`. On click: filters `completedShapesRef` removing ALL grade-line shapes for `currentPageId`, repaints (clearRect + drawLockedShapes + drawGradeLineShapes), then calls `setDrawMode(true)` + `setGradeLineDrawing(true)` — same entry path as `confirmShape` after the on-closure prompt. Wall polygon untouched; `commitGradeLine` + snap-as-aid unchanged; finish-anywhere unchanged. Browser-verified by Ben (elevation page, existing grade line confirmed deleted and redrawn).

**Sequence decision:** windows/doors builds NEXT. Cross-sections deferred — windows/doors intentionally comes first.

**Architecture decisions:**
- Sub-piece 2 (grade line) is fully done: draw + corner-snap aid + floor-line-snap aid + finish-anywhere + Redraw button.
- Cross-sections deferred to after windows/doors (intentional ordering, not doc default).

---

## SESSION 27 — Wireframe composition seams B1+B2: pageVertexToWorld + elevYToWorldZ

**Branch:** main | **Commit:** 9e5bd0d

### What was built

**B1 — `getWorldOriginM()` + `pageVertexToWorld(v, pageId)`:**
- `getWorldOriginM()` — building-fixed XY origin in meters. Re-derived every call, never stored.
  Finds lowest present floor plan, resolves scale via `getEffectiveScale` (borrow-safe), converts
  all anchor-floor wall-polygon vertices to meters, returns `{ x: minX, y: minY, originPageId }`.
- `pageVertexToWorld(v, pageId)` — projects canvas-pixel vertex to world XY in meters; subtracts
  origin. Returns `{ x, y, z: null }`. Both functions resolve scale via `getEffectiveScale` — never
  raw `pageScalesRef.current` (a raw read fails if anchor floor borrows scale from parent).

**B2 — `elevYToWorldZ(y, elevPageId)`:**
Named inverse of `drawElevRefLines` Y→Z formula. Returns world Z in meters.
`anchorY - y` in pixels ÷ `(0.3048 × pxPerMeter)` → Z in feet → × 0.3048 → meters.
Implements same formula as `drawElevRefLines` (principle 7.3).

**`window.__dumpWorld()`:** DEV-guarded console test. Prints world XY for all floor-plan wall
polygons, Z@anchor for elevation pages, MISSING scale warnings.

**`pageRefOffsetRef` REMOVED:** canvas-pixel cross-page offset approach was tried in a first
implementation and removed as wrong. Do not reintroduce. All cross-page composition is in METERS.

### Diagnostic: separate canvas spaces

Proved during session that each PDF page has a SEPARATE canvas coordinate space (canvas resizes
per sheet in `renderPage`; `drawGhostShapes` applies no transform). `{0,0}` canvas-pixel offset
is only accidentally correct when all PDF sheets are the same size. Resolution: compose in meters
— sheet-size dependency dissolves because 1 meter = `pxPerMeter` pixels regardless of sheet size.
Identity assumption: cross-page XY is identity because trace-over-ghost bakes registration at draw time.

### Scale-path bug fixed before commit

First meters implementation passed raw `pageScalesRef.current` to `pxToMeters`. If anchor floor
borrows scale (no own calibration), this returns undefined → NaN origin → all vertices poisoned.
Fix: `getEffectiveScale(lowestPage.pageId)` first, then `{ [lowestPage.pageId]: scale }` as scalesArg.

### `__dumpWorld` verification result

- Basement (page-3): origin (0,0) ✓; vertex meter magnitudes ✓; Z@anchor = 0 on lowest floor ✓
- Main Floor (page-4): MISSING effective scale
- Main Floor miss is a **fixture data gap**: Main Floor has no own scale, no confirmed transform, no
  `pageRefParentRef` entry in the restored fixture (alignment never confirmed for that page). Not a seam bug.

### B4 fixture prereq (before B4 multi-floor verification)

Re-run "Confirm scale & alignment" on Main Floor in the test fixture and re-snapshot. Then
`__dumpWorld` will show composition across ≥2 confirmed floors.

### New doc added

`WIREFRAME_RECON_REPORT.md` created — gap tracker for B1–B4 wireframe composition seams
(§3=B1 resolved, §4=B2 resolved, §5/§6 open).

---

## SESSION 28 — B3: wire roof-plan pages into ghost/borrow path

**Branch:** main | **Commit:** d4e99d8

### What was built

**B3 — `getGhostSourcePageId` gate widened for Roof Plan pages (geometry.js)**
- Gate at line ~291 now admits `category === 'roof-plan'` alongside `'floor-plan'`.
  `subLabel` required only for floor pages (known FLOOR_ORDER level); roof's is optional free text,
  so the `!currentPage.subLabel` guard was relaxed for roof.
- Fallback parent scan: `currentFloorIdx = floorOrder.length` for roof (above all floors);
  existing downward scan loop finds the highest floor with locked shapes. Zero new loop logic.
- Scale borrow via `getEffectiveScale` chain is UNCHANGED — roof resolves identically to floors.
  Confirm-alignment writes `pageRefParentRef[roofPageId] = ghostSrc` as usual.
- No roof-specific offset or transform logic. B1 meters-composition + trace-over-aligned-ghost
  identity assumption applies unchanged to roof.

**`__dumpWorld()` extension (App.jsx)**
- New roof-plan block: iterates `pages.filter(p => p.category === 'roof-plan')`, resolves
  `getEffectiveScale`, prints world XY for locked wall polygons.
- Reports `[confirmed]` vs `[NOT confirmed — borrow not active]` so fixture-gap state is legible.

**Verification result:**
- Before confirm: `[world] roof (page-7): MISSING effective scale — confirm alignment to a floor parent first`
- After confirm: `[world] roof (page-7) pxPerMeter=59.08 [confirmed]`
- Roof had no locked polygons in fixture; borrow-chain plumbing proven end-to-end.

### Architecture decisions

- Roof enters the IDENTICAL path as floors — no new machinery per VISION_SUPPLEMENT §9.1.
- Eave projection / roof Z are deferred to B4, which needs a planning pass first
  (§7 recon found NO project-config store for the floor-system/assembly data B4 reads).

### Carry-forward loose ends for next session

1. **RECON-REPORT DIFF:** `WIREFRAME_RECON_REPORT.md` at e7911fd was reconstructed by Claude Code
   from the codebase after the original was lost to context compaction. Diff it against the
   authoritative original for dropped specifics (CLAUDE.md divergences, openingLabel/label field
   name, widthM/heightM-not-stored findings, exact line numbers).
2. **FIXTURE prereq for B4:** Main Floor (page-4) AND roof (page-7) need confirmed scale/alignment;
   roof needs at least one locked polygon; re-snapshot after both confirmed.
   `__dumpWorld` multi-floor verification is blocked until this is done.
3. **Fixture `_version` field:** first `__restoreFixture` this session threw "invalid or missing
   _version". Check that the fixture JSON has the `_version` key; update fixture if missing.
4. **GitHub connector:** check Project settings for a connector to auto-sync these five docs with
   the repo and kill manual re-upload.
5. **`.claude/settings.local.json` decision:** un-ignore (solo tree, no secrets) vs. keep gitignored
   + standing checklist. Decide before next build session.

### New deferred-register entries

- **#48 — Align/scale drag visual inversion:** remap corner-handle drag so the PDF appears to hold
  still and the ghost polygon appears to grow. Actual mechanism (pageTransformsRef) unchanged.
  ⚠️ NOT purely cosmetic — math mapping changes; needs planning pass to confirm #22 compliance
  before build. See ADDITIONAL_FUNCTIONALITY.md.

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
- **Sidebar auto-hide (#11):** collapse on canvas interaction; candidate for same UI pass as #10
- **Page rotation (#12):** 90° viewer convenience + arbitrary alignment rotation; `angle` reserved in transform struct
- **Ghost vertices as opt-in snap targets (#13):** deferred from sub-step 3; shared grid handles alignment for now
- **Scale inheritance within drawing group (#14):** suppress Set Scale across a group once one page is calibrated; needs drawing-group concept
- **Primary-reference reassignment UI (#15 — partial):** `primaryReferenceIdRef` set-once today; UI to reassign (relabel root; geometry doesn't move) deferred
- **Multi-select reference ghosts by floor label (#16):** per-floor-label visibility picker for reference overlays; bridge between single ghost and #8 full layer system
- **Universal reference-layer model (#17):** architectural record; sub-step 5 adopts data shape; projection math + multi-entity referencing gated on R3 coordinate composition
- **Roof slope/Z-derivation + peaked-eave inference (#18):** ridge-to-perimeter junction topology built (perimParent vertex); elevation consequence needs slope rules + XYZ model
- **Coplanar-distinctness principle (#19):** architectural record — datum vs. element layer; per-element Z deferred to Phase 2
- **Metric dimension-entry rework (#20):** floor-heights panel imperial-only; unified rework deferred to dedicated session
- **Planes/edges as rule-imposing boundaries (#21):** ELEMENT-LAYER architectural record; constrains R3/Phase 2 design
- **Recalibration-independence invariant (#22):** active invariant — geometry must stay scale-independent in storage; Path 3 honors it
- **Isometric multi-reference elevation (#23):** Z-driven projected display of floor-plan references on elevation view; gated on R3/Phase 2 coordinate model
- **Global drag-release robustness (#24):** drags ending outside browser window don't release; fix = window-level mouseup + pointercancel; app-wide polish pass
- **Edge-select button labels (#25):** "Set elevation edge" mode shows "Exit" only after pick; needs "Confirm" / "Choose again" — UI polish
- **Categorization exit navigation bug (#26):** exiting categorize mode on uncategorized page stays there instead of navigating to last categorized page
- **Reference-line snap-suggest to known Ys (#27):** when dragging base line, snap toward known anchor Ys; near-term candidate post-Piece-4
- **PDF visual analysis / analysis-first front end (#28):** MAJOR VISION — automated page analysis + confirm-and-correct overlay; flagged for deep-review waypoint
- **Derived envelope block (#29):** Phase 2 architectural target — elevation surfaces derived from floor-plan polygons, not traced freehand; gated on R3
- **Grade / soil line (#30):** pieces 1+2+3 DONE (3fae81b + c7a2092 + e9c04a6); sub-piece 2 fully complete; finish-anywhere + snap-as-aid model; Redraw button built; #41 is the sole meaning model
- **Grade-line read-time interpretation (#41):** active architectural principle — wall polygon never split; above/below-grade derived on read by intersecting grade polyline with polygon; R3/Phase 2 build
- **Dev fixture Piece 2 (#31):** DONE — Save/Load buttons live in DEV strip (Session 22; confirmed Session 24)
- **UX notes (#32–#40):** categorize shortcut, button colour audit, ghost-vertex snap gap, align-handle cursor mirror, sidebar auto-collapse, edge-select copy, isometric ghost preview, reference-line label stacking, floor-to-floor field auto-grey
- **Trackpad/wheel zoom speed (#42):** too fast on laptop; trackpad deltas need scaling/clamping — input polish
- **Grade-line draw-UI clarity pass (#43):** toolbar text/prompt flow could be clearer — polish after elevation workflow stable
- **Window/door component model (#44):** shared instance identity, edit-all/make-unique, cross-elevation picker; dumb-duplicate (Pieces 1+2) is throwaway — migrates here; no Z/3D on instances; next windows/doors session
- **Window-as-assembly model (#45, MAJOR):** mullions, sub-sections, frame geometry, glass areas; performance coefficients are spreadsheet math; depends on #44
- **Window-schedule import + place-from-list (#46):** recognize schedule table from PDF; cross-ref #28 and #44
- **Top-bar snap selector metric fallback (#47):** shows cm labels on no-scale page (disabled so cosmetic only); bundle with #20
- **Elevation Piece 3 sub-piece 3 (deferred/shelved):** drag-to-edit individual floor/ceiling heights; height editing stays panel-only
- **Dump graph button (debug):** temporary `console.log` button in trace toolbar — remove before production
- **B6 envelope surfaces (#54):** floor/roof/soffit fill meshes + face culling + transparency — deferred
- **3D opening-line visual verification (#55):** place test opening on elevation page, confirm orange rectangle renders — deferred
- **3D axis nub visibility (#56):** AxesHelper(0.5) too small at fixture scale; cosmetic — deferred
- See `ADDITIONAL_FUNCTIONALITY.md` for all deferred items

---

## SESSION 32 — §9 project-configuration layer, Pieces 1–3 (2026-06-25)

**Branch:** main | **Commits:** 4cca140 (Piece 1), eb82eba (Piece 2), a049854 (Piece 3) — all on origin.

### Recon findings (read-only pass, start of session)

- **projectConfigRef (B4)** is definition-only (3 physical-derivation thresholds: `cantileverRule`, `reconcileThresholdM`, `soffitCombineThresholdM`), read only by `deriveEnumeration` and `deriveWireframe`, never written after init, NOT reset on upload. Fork A separation clean — a new config ref does not collide with it at all.
- **No prior project-level settings surface existed.** `dimensionBasisRef` has a one-shot first-use modal but no standalone settings panel. Config panel is net-new UI.
- **Floor-heights panel** is the house pattern: `useState` toggle + gated toolbar button (`{pdf && !calibMode && !drawMode && !editMode && !categorizeMode && ...}`) + absolute-overlay div rendered inline in component return; fields `.map()`ed from a derived array.

### What was built

**Piece 1 (4cca140) — data model + descriptor schema:**
- `CONFIG_FIELDS`: 10-field module-level descriptor array (1 Outputs[multi], 1 Jurisdiction, 4 Assemblies @ 2 opts each, 4 Equipment lite). `spawns: null` hook reserved for §8.2 worklist build — empty, never read.
- `projectSetupRef = useRef({ values: {}, roleAssignments: {} })` — §9 operator config store. Distinct from B4 `projectConfigRef` (physical-derivation thresholds). Reset on PDF upload; `projectConfigRef` is deliberately NOT reset.
- `getConfigValue` / `setConfigValue` — sole read/write seam for `values`. `__dumpProjectSetup` DEV console dump.

**Piece 2 (eb82eba) — operator panel:**
- `showProjectSetup` / `projectSetupTick` useState pair (floor-heights pattern).
- `setConfigValue` extended to bump `projectSetupTick` after every write.
- Toolbar button gated identically to Floor Heights; placed alongside it.
- `ps-panel` overlay: fields `.map()`ed from `CONFIG_FIELDS` grouped by `.category`; category order derived from array order (no hardcoded list). `multi:false` → `<select>`; `multi:true` → checkbox group.
- Browser-verified: selections persist across close/reopen.

**Piece 3 (a049854) — output→roles derivation + role assignment UI:**
- `OUTPUT_ROLES` map: `f280` → [hvac-designer, energy-advisor]; `h2k` → [energy-advisor]; `permit-set` → [designer, hvac-designer, plumber, electrician].
- `ROLE_LABELS`: 5 role id → label entries; insertion order = display order.
- `getRequiredRoles()`: pure computed function — unions `OUTPUT_ROLES` across selected outputs, deduped by `Set`, ordered by `ROLE_LABELS` insertion order. Never stored.
- `roleAssignments: {}` added to `projectSetupRef` alongside `values`; reset on upload.
- `getRoleAssignment` / `setRoleAssignment` accessors; `setRoleAssignment` bumps `projectSetupTick`.
- "Required Roles" section in ps-panel: live-recomputed each render; text input per role; unassigned roles show "(unassigned — owner responsible)" owner-fallback marker.
- Browser-verified: F280 → HVAC Designer + Energy Advisor; F280 + Permit Set → Designer + HVAC Designer + Energy Advisor (deduped) + Plumber + Electrician; typed assignment persists across close/reopen; clear → fallback marker returns.

### Forks settled (planning pass)

- **A** — separate ref from B4 projectConfigRef (clean separation confirmed).
- **B** — coarse output→roles map now; sub-rules added incrementally later.
- **C** — operator panel now (overlay, floor-heights style); full-page form deferred (#57).
- **D** — 2 assembly options per category (starter set, extensible).
- **E** — equipment selections stored inert; `spawns` hook empty, reserved for §8.2.

### Carry-forward lesson (recurred twice this session)

Code reported persistence/recompute as "confirmed statically" twice (Pieces 2, 3) — reasoning
through the render path instead of browser-verifying. Both times the planning layer pushed back and
Ben browser-verified before close-out. The standing rule holds: static reasoning does not discharge
a browser-verifiable claim. Build prompts should keep saying "browser-verify; static reasoning does
not count."

### Logged this session (ADDITIONAL_FUNCTIONALITY.md)

- **#57** — Project Setup as a dedicated full-page form (full-page form deferred; overlay panel is functional stand-in).

### NEXT SESSION OPENS WITH

Config-driven layer/worklist system (§8.2) planning — the `spawns` hook on `CONFIG_FIELDS` descriptors is the attach point; needs the symbol/icon library + item-requirement table (VISION_SUPPLEMENT §8.1 planning artifacts) before or alongside.

---

## SESSION 31 — B5: 3D envelope wireframe (2026-06-25)

**Branch:** main | **Commits:** 7c44e24 (Pieces 1 + 1a), 622e76d (Piece 2)

### Sequencing decision

B5 (3D render) built before windows/doors Pieces 3+4. Critical-path next = project-configuration layer (§9 step 3). Windows/doors Pieces 3+4 are off critical path and remain available.

### What was built

**B5 Piece 1 + 1a (7c44e24):**
- `deriveWireframe()` pure function added BEFORE the `if (import.meta.env.DEV)` block (not inside — needed by production toolbar button). Returns `{ floorRings, roofRing, soffitLines, openingLines }` in world meters. Closes over refs.
- `ThreeDView.jsx`: `THREE.LineSegments` + `BufferGeometry` + `Float32BufferAttribute` + `OrbitControls`; `toVec(x,y,z)` axis-mapping helper (world X→three.js X, world Y→three.js Z, world Z→three.js Y up); `addLineLoop` builds explicit from/to pairs. Full cleanup on unmount.
- Colors: floor #22d3ee, ceiling #f59e0b, walls #94a3b8, roof #a78bfa. Camera framed to bbox. AxesHelper(0.5).
- "3D View" toolbar button: gated on `!!getWorldOriginM()`. Wireframe computed once on click, passed as stable prop.
- **Piece 1a:** AxesHelper(3) → AxesHelper(0.5). Geometry was correct; bug was the helper's 3m Z-arm overshooting the 2.59m Crawlspace footprint.

**DEBUGGING STORY (carry forward as a trust-the-runtime lesson):**
Two instrumentation passes (logging all ring/vertical/roof geometry) BOTH EXONERATED the computed geometry — every logged segment was correct. Root cause was AxesHelper(3) at world origin, whose Z-arm coincided with the Crawlspace edge and overshot by 0.41m. The bug was in a DRAW PATH, not in the computed data. Lesson: when instrumentation proves computed geometry correct but the screen is wrong, the bug lives in something that draws but doesn't compute (helpers, renderer objects, attribute packing). Widen instrumentation to those paths; don't re-check coordinates.

**B5 Piece 2 (622e76d):**
- `soffitLines`: re-derived (independently from `deriveEnumeration`) using `worldBboxOf` helper + 0.05m threshold from projectConfigRef; 3 segs/soffit: outer eave edge + 2 returns at eaveZm. Color: #c084fc (violet).
- `openingLines`: world XY via edge-midpoint + direction vector in world space; Z via `elevYToWorldZ`; `widthM × heightM` rectangle in wall plane. Color: #fb923c (orange).
- Legend bar extended; `__dumpWireframe` DEV function extended (soffits by side, openings by id).

### Verification

- Piece 1: stray line gone; floor rings, ceiling rings, verticals, roof ring with overhang, notch — all correct.
- Piece 2: 2 soffits (N+W, 0.3048m) verified visually. 0 openings — correct for fixture. Opening path dump/code-verified; **VISUAL verification DEFERRED** (#55) until a test opening is placed.

### Architecture reminders

- `deriveWireframe` is component-scope, NOT DEV-gated. `__dumpWireframe` is DEV-gated. Split is intentional.
- `deriveEnumeration` is DEV-only and is NOT called by `deriveWireframe`. Soffit/opening geometry re-derived independently.
- `pageRefOffsetRef` does NOT exist. All cross-page composition in meters.

### New deferred-register entries

- **#54 — B6 envelope surfaces:** floor/roof/soffit fill with face culling + transparency. Deferred.
- **#55 — 3D opening-line visual verification:** confirm orange rectangles once a test opening is placed.
- **#56 — 3D axis nub visibility:** AxesHelper(0.5) too small at fixture scale; cosmetic polish.

---

## Session 29 — Fixture-PDF bundling + default fixture rebuild (2026-06-25)

### DONE this session

**(a) Fixture-PDF bundling (commit c5deb8d):**
- `__snapshotFixture` is now `async`. After collecting all geometry fields (unchanged), calls
  `pdf.getData()` → raw `Uint8Array` bytes → base64-encode via `btoa` → stored as
  `documents: [{ pdfBase64, fileName }]` (document-keyed array; one entry today).
- `__restoreFixture` checks `obj.documents?.length > 0` first: if present, decodes base64 →
  `Uint8Array` → `pdfjsLib.getDocument({ data: bytes.buffer })` and proceeds as before.
  Does NOT run the `handleFileChange` clear path — refs are written directly, geometry intact.
  Backward-compatible fallback: if `documents` absent (old fixtures), fetches from
  `/devFixtures/test-fixture.pdf` as before.
- SAVE button `onClick` made `async` to `await __snapshotFixture()`. LOAD button unchanged.
- `handleFileChange` normal upload-clears-refs behavior unchanged.

**(b) Default fixture rebuilt from scratch (commit c5deb8d):**
- New `public/devFixtures/fixture-elevation.json` is self-contained — no machine path dependency.
- Page map: page-3 Crawlspace (calibrated, origin), page-5 Main Floor (borrow chain from page-3,
  pxPerMeter=114.83 confirmed), page-7 roof plan (locked polygon with 1ft overhang on two edges,
  confirmed borrow from Main Floor), page-2 elevation (own scale confirmed, live Z, Z@anchor=0.0000).
- NOTE: fixture page map differs from the old page-4=Main Floor reference. The fixture is now its
  own thing keyed to its specific PDF. Do not assume page numbers match any prior session's fixture.
- Verified via `__dumpWorld` round-trip from committed default: Crawlspace + Main Floor compose
  correctly in world XY; Session 27 "Main Floor MISSING scale" is resolved (borrow chain wired).

### Observation to confirm next session
On scale recalibrate, confirm stored vertex pixels do NOT move (only `pxPerMeter` changes) —
recalibration-independence #22 spot-check. Not confirmed this session.

### NEXT SESSION OPENS WITH
B4 config-store planning pass. Three unsettled forks:
1. How much config to stand up now vs. defer (assembly data, wall types, U-values)?
2. Where it lives: new `projectConfigRef` vs. extending `floorHeightsRef`?
3. Output form: console output / panel display / both?

B4 derivation core is NOT promptable until these are settled. The "what the docs already force"
analysis is in this session's planning chat — re-derive from VISION_SUPPLEMENT §3, §6.3, §6.4,
§6.9, §7.3, §5.3 if not carried forward to the next session.

### Logged this session (ADDITIONAL_FUNCTIONALITY.md)
- **#49** — Project-owned PDF persistence (web/multi-machine): principle set; base case built for dev fixture.
- **#50** — Multiple PDFs per project: documents[] array structure already accommodates it.
- **#51** — Elevation reference-edge auto-seat: auto-seat base line on confirm when reference edge set; manual drag fallback remains.

---

## SESSION 30 — B4 derivation core; gitignore fix; #22 recalibration-independence confirmed (2026-06-25)

**Branch:** main | **Commits:** f24fd7e (gitignore fix), 106d847 (B4 code)

### What was built

**`.claude/settings.local.json` gitignore friction resolved permanently (f24fd7e):**
The file was blocked by a global git ignore rule (`**/.claude/settings.local.json` at
`C:\Users\ben\.config\git\ignore` line 1). Rather than modifying the global rule, added a
project-level negation `!.claude/settings.local.json` in `.gitignore`. File is now tracked
in-repo; the standing checklist "recreate-on-clone" step 3 is RETIRED.

**#22 recalibration-independence confirmed (read-only, no source edits):**
Used `await window.__snapshotFixture()` before and after recalibrating a page.
Scale changed (114.834 → 114.961 pxPerMeter); all page-3 vertices were byte-identical.
Invariant holds: geometry is stored in pixels, recalibration only updates `pxPerMeter`.
Note: `__snapshotFixture` is ASYNC — must use `await`, not sync call (returns empty object `{}`
without await; took two debugging passes to discover).

**B4 derivation core — `deriveEnumeration()` + `window.__dumpEnumeration()` (106d847):**
Console-dump-only enumeration of all envelope surfaces. No render, no panel.

**`projectConfigRef`** — new `useRef({})` for project-level physical derivation config only.
NOT the §9 project-configuration layer (no roles/jurisdiction/U-values/assemblies). Three forks settled:
(a) minimal physical-only extensible slice; (b) new `projectConfigRef`, NOT an extension of
`floorHeightsRef`; (c) console dump only for now. Fields:
- `cantileverRule: 'closest-approach'`
- `reconcileThresholdM: 0.05`
- `soffitCombineThresholdM: 0.05`

**`deriveEnumeration()` — six internal steps:**
- Gets world origin via `getWorldOriginM()`.
- Builds local `zStack` from `accumulateZ(floorHeightsRef.current, presentLevels, FLOOR_ORDER)`.
- Helper `getWorldBbox(pageId)` for soffit derivation (min/max world X/Y of all wall-polygon vertices).
- Builds `floorPageMap` (first categorized page per FLOOR_ORDER level with locked shapes).
- **STEP A+B (wall surfaces):** Per floor in zStack, per locked wall-polygon edge: projects vA/vB via
  `pageVertexToWorld`, computes `widthM`, `orientationDeg` (compass bearing via `atan2(dx, -dy)`).
  Pre-projects floor-below polygon vertices to world meters (`belowWorldShapes`).
  Closest-approach reconcile: `distToSegment(mid, wv[bi], wv[(bi+1)%n])` over all below edges → `minDist`;
  `pointInPolygon(mid, wv)` for sign; classify against `reconcileThresholdM`.
  Pushes `{ id, kind:'wall-surface', ..., reconcile, signedDistM }`.
- **STEP C (soffits):** Per confirmed roof page: compares `getWorldBbox(roofPageId)` vs
  `getWorldBbox(wallPage.pageId)` per side (N/S/E/W); projection > `soffitCombineThresholdM` →
  soffit element with `projectionM`, `spanM`, `eaveZm`.
- **STEP D (fenestration):** Per elevation page with confirmed scale + elevation edge: finds openings
  (`isOpening(s)`), calls `elevYToWorldZ(centroidY, ep.pageId)`, pushes window/door elements with `worldZm`.

**`window.__dumpEnumeration()`:** verbose per-element dump with all fields; reconcile summary at bottom.
Wall-surface lines include `signedDist=+/-X.XXXXm (inside/outside floor-below)`.

**Reconcile rule history (important carry-forward):**
Built bbox-compare first → REJECTED at runtime. A notch in the floor polygon doesn't change the
bounding box; edge midpoints get tested against an unchanged bbox and produce
plausible-but-meaningless coincident tags. Replaced with closest-approach (`distToSegment` +
`pointInPolygon`). Lesson: identical labels can come from two rules; only the signed-distance dump
revealed which was real.

**Verified against fixture (4 sub-checks):**
(a) 12 elements total: 4 Crawlspace wall-surfaces + 6 Main Floor wall-surfaces + 2 soffits.
(b) Main Floor notch: seg3 = -0.305m (setback), seg4 = -0.381m (setback); 4 remaining edges coincident.
(c) Soffits on north/west: projectionM = 0.3048m (1ft overhang, as built in fixture).
(d) No fenestration elements (no openings placed on elevation in fixture).

### Known boundary characteristic (logged, not a bug)

Ray-casting `pointInPolygon` returns "outside" for midpoints EXACTLY on the perimeter (distance = 0).
This is harmless because distance ≤ reconcileThresholdM → tagged coincident before sign matters.
Only relevant if the sign at exactly zero distance becomes meaningful — not required today.

### New deferred-register entries

- **#52 — B4 render/panel:** `deriveEnumeration()` is console-only; a rendered envelope summary
  panel or 3D wireframe render is B5. Deferred.
- **#53 — B4 cantilever/setback UI annotation:** hover a wall edge → show reconcile tag + signed
  distance inline. Deferred until panel/render work is active.

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
9. ~~Pixels→real-world coordinate foundation (R2)~~ — DONE (Path 3; 040e371, 71e01ca)
10. **Elevation calibration + tracing (IN PROGRESS)**
    - ~~Piece 1: floorHeightsRef + accumulateZ + getFloorLevel~~ — DONE (2942e0e)
    - ~~Piece 2: Floor-heights entry panel~~ — DONE (e780b88)
    - ~~Piece 3: Floor-to-floor back-solve entry + ceilingSource + validateCeiling~~ — DONE (4e06de0)
    - ~~Elevation spatial Piece 1: "Set elevation edge" mode~~ — DONE (89b7ba2)
    - ~~Elevation spatial Piece 2: "Align elevation" mode — own-scale confirm~~ — DONE (2007265)
    - ~~Elevation spatial Piece 3 sub-piece 1: drawElevRefLines (view mode)~~ — DONE (1cb2c0b)
    - ~~Elevation spatial Piece 3 sub-piece 2: elevBaseYRef + drag-to-place base line~~ — DONE (b597e91)
    - ~~Elevation spatial Piece 4 sub-piece 1: closed-polygon tracing + edit; drawElevRefLines wired into all redraw paths~~ — DONE (5266dc5)
    - Elevation spatial Piece 3 sub-piece 3: drag-to-edit heights — DEFERRED (shelved)
    - ~~Elevation spatial Piece 4 sub-piece 2: grade / soil line (pieces 1+2+3)~~ — DONE (3fae81b, c7a2092, e9c04a6)
    - ~~Elevation spatial Piece 4 sub-piece 3: windows/doors Pieces 1+2 (placement layer)~~ — DONE (Session 26)
    - **Elevation spatial Piece 4: windows/doors Piece 3 (three-layer snap) — NEXT**
    - **Elevation spatial Piece 4: windows/doors Piece 4 (dumb duplicate) — NEXT**
11. **Wireframe composition seams B1+B2 — DONE (Session 27; commit 9e5bd0d)**
    - ~~B1: pageVertexToWorld + getWorldOriginM (world XY in meters)~~ — DONE
    - ~~B2: elevYToWorldZ (world Z in meters)~~ — DONE
    - ~~B3: widen getGhostSourcePageId for Roof Plan pages~~ — DONE (d4e99d8)
    - ~~B4 fixture prereq~~ — DONE (Session 29; c5deb8d): PDF bundled, Crawlspace+Main Floor+roof+elevation
    - ~~B4: derivation core~~ — **DONE (Session 30; commit 106d847)**
      deriveEnumeration() + __dumpEnumeration; projectConfigRef; closest-approach reconcile;
      soffit/eave combine; fenestration Z path. Verified against fixture (12 elements).
    - ~~B5: 3D envelope wireframe~~ — **DONE (Session 31; commits 7c44e24, 622e76d)**
      deriveWireframe() + ThreeDView.jsx; floor/ceiling rings, verticals, roof ring, soffits, openings (lines only).
      Piece 1a: AxesHelper overshoot fix. Opening visual deferred (#55).

**Next: windows/doors Pieces 3+4 remain available (off critical path); next critical-path build = project-configuration layer (VISION_SUPPLEMENT §9 step 3).**

After project-config → windows/doors cleanup → cross-sections (deferred) → Phase 2 threshold.
