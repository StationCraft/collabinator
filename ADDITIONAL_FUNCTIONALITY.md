# Collabinator — Additional Functionality Desired (Deferred Register)

*A holding pen for ideas that came up mid-build and would have derailed the current
`BUILD_ROADMAP.md` step without meaningfully advancing it. Not rejected — just held
here until there's a working core program to test them against. Replace the copy in
this Claude.ai Project each time a refreshed version is given.*

---

## How an entry gets added

1. A request is flagged, in a planning chat, as scope drift from the current
   `BUILD_ROADMAP.md` step.
2. Ben confirms it should be deferred rather than worked in immediately.
3. It's logged below with: what was asked, why it was deferred, and current status.

This is saved in memory so it happens automatically in future chats in this Project,
not just this one.

---

## Register

### 1. Parallel/off-axis line snap + in-trace vertex snap + dwell-override

**Logged:** Session 3, right after Feature 1 (start-vertex snap, pre-first-vertex
only) and Feature 2 (edit-mode grid setting control) were sent to Claude Code.

**Description:** Three related ideas raised together:
- Generalize the existing H/V alignment guides to snap against the angle of *any*
  existing edge, not just true horizontal/vertical.
- Extend vertex-snap — currently scoped to only the pre-first-vertex moment — to also
  apply while actively tracing subsequent vertices of a shape.
- A dwell/override mechanic: the snap suggestion shows first, then is overridden by
  moving or holding the cursor away from the suggested location for a short,
  currently-unspecified duration.

**Why deferred:** Materially larger than the just-agreed Feature 1 scope. Introduces
undefined parameters (dwell duration, what counts as "holding away," snap-priority
precedence between angle-snap, vertex-snap, and axis-snap) that need to be pinned
down before it's buildable.

**Status:** Deferred, not started. Revisit once the core toolkit is stable enough to
test snap-priority edge cases against real tracing.

---

### 2. Redundant collinear vertex after complex Combine

**Logged:** Session 3, after combine winding-direction fix was confirmed working.

**Description:** Some complex merges produce a redundant collinear vertex at splice
points that coincide exactly with an existing vertex — visible as a short stray line
segment on the combined shape. The vertex is real (not a rendering artifact) but
carries no geometric meaning: it sits exactly on the line between its two neighbors
and could be removed without changing the shape's outline at all.

Cosmetically harmless — no geometry error, no coordinate drift, the vertex can be
dragged to an adjacent corner to delete manually if needed. The fix would be a
post-merge collinear-vertex pruning pass in `mergePolygons`.

**Why deferred:** Cosmetic only; does not affect any downstream geometry, combine
eligibility, or split behavior. Not worth the risk of touching merge logic mid-session
when everything else was working.

**Status:** Deferred, not started. Good candidate for a focused polish pass once the
Phase 1 toolkit is complete.

---

### 3. Duplicate page
**Logged:** Session 4 planning.
**Description:** When a single PDF page contains multiple drawing types (e.g. a floor
plan and an elevation on the same sheet), a "Duplicate this page" button creates two
virtual copies of that page, each independently assigned a category and working area.
**Why deferred:** Edge case on most residential plan sets. The pageId architecture
being introduced in Step 4a is designed to support this cleanly when prioritized.
**Status:** **SUPERSEDED by #5 crop-carving UI (Session 61, commit 8d6e57d; gate-expiry
sweep Session 63).** The "Duplicate this page" concept is replaced by the carve-a-region
gesture: a source sheet now yields N independent region-pages, each with its own pageId
(`page-N-rK`), crop, category, sub-label, scale, and reference-tree slot. That is strictly
more than two virtual copies. Do not build a separate duplicate-page feature; the need is
met. (Historical note retained for traceability.)

---

### 4. Interstitial space — bulkheads, floor systems, ceiling surface ownership
**Logged:** Session 4 planning.
**Description:** The space between floors (floor system depth, bulkheads, dropped
ceilings) doesn't cleanly belong to either floor level. Working principle: ceiling
surface = part of the level below; floor surface = part of the level above. Bulkheads
add further complexity — they may contain services for either adjacent level. How
these are categorized, displayed, and assigned to discipline layers needs dedicated
architecture planning before any build work.
**Why deferred:** Significant design work required before buildable. Doesn't block
Phase 1 tracing. Interstitial space is a Phase 2 concern.
**Status:** Deferred. Flag for Phase 2 architecture planning chat.

---

### 5. Multi-classification per page + working area selection for elevations

**Logged:** Session 5, during Step 4b testing.

**Description:** A single PDF page may contain multiple drawing types (e.g.
two floor plans and an elevation, or multiple elevations on one sheet). The
current architecture assigns one category per page. Full solution requires:
- Pages array allows multiple classification entries per pageId
- A "Multiple elevations on this page" option in the elevation categorization
  flow that prompts the user to specify which elevations are shown
- Working area selection per classification on a multi-item page (drag a crop
  box, grey out the rest)
- Each classification creates an independent logical page entry in the sidebar

**Why deferred:** Significant data model change affecting pages array, sidebar
(4c), and all downstream readers. Dropped from scope mid-4b to avoid
mid-build architectural risk. The pageId architecture accommodates this
cleanly when prioritised.

**Status:** Deferred. Build as a discrete step after 4c is committed.

**GATED-READY — resurfaced 2026-06-29. NOW PRIORITIZED as the keystone build.** Gates satisfied:
4c (sidebar) done; pageId architecture stable. Supersedes/absorbs #92(b) (multi-elevation per page)
as a sub-behavior — a region-page IS the two-elevations-on-one-sheet solution by definition.

**Planning-chat definition (2026-06-29):**
One PDF sheet = one source document. The user carves crop boxes on the sheet; EACH crop becomes
an independent logical page in the sidebar, cropped to that region, carrying its OWN pageType
(floor-plan / elevation / cross-section / roof / etc.) and label. The rest of the sheet is
greyed out. Each crop has its own `pageId`, own coordinate frame (crop-local origin at top-left
of the crop box), own category + subLabel, own scale, and participates in the reference tree
independently. This model generalises to ANY mixed-content sheet and unifies #5 + #92. It is
the prerequisite for region-scoped derived elevations (#29).

**Four design forks to resolve before build session (from Session 57 recon):**
- **Fork A — DONE (commit f41cb7c, Session 58) + NAV-VERIFIED (Session 59).** `currentPage` (pageNum)
  → `currentPageId` first-class React state. Multi-page navigation verified clean in-browser
  (toolbar-arrow + sidebar-jump paths, both directions; page-gated toolbar tracks correctly; zero
  console errors). `currentPage` (pageNum) remains the "which PDF sheet" pointer for `renderPage`.
- **Fork B — DONE (commit 4928a5a, Session 59).** `renderPage` establishes a crop-local coordinate
  frame when `pageCropsRef.current[pageId] = {x,y,w,h}` is set: `measureRef` sized to the crop box
  (its (0,0) = crop top-left → stored geometry crop-local by construction), backdrop rasterized with
  viewport offset `(-crop.x*mult, -crop.y*mult)` so the crop maps to canvas (0,0) and crop-sized canvas
  bounds clip the rest. Absent crop = full-sheet fallback (today's behavior verbatim). Approach:
  **rasterization-offset** (not a standing CSS crop layer) — the crop offset is consumed at the
  rasterization read ONLY, never frozen into stored coords / `pageTransformsRef` / `getEffectiveScale`;
  the user `pdf-align-layer` composes on top unchanged (recalibration-independence #22 untouched).
  `pages[i].crop` is the serialized mirror. DEV: `__setCrop`, `__verifyCrop` (10/10, incl. placed-point
  world-coordinate invariance). No crop-carving UI yet — that is the user-facing half, after Fork D.
- **Fork C — RESOLVED.** Dissolved automatically when Fork A landed (`currentPageId` is set directly,
  no longer derived from `pageIdMapRef`).
- **Fork D — DONE (commit 579bbf1, Session 60).** Categorization confirm/skip handlers
  rekeyed from `pageNum` to `pageId`: `recatPageNum` → `recatPageId`, all `p.pageNum === currentPage`
  map predicates → `p.pageId === currentPageId`, `currentPageEntry` lookup, `useEffect` load-draft
  deps, and JSX summary guard. `advanceToNextUncategorized` left on pageNum (PDF navigation — correct).
  Behavior-preserving today (one region per sheet); payoff lands when crop-carving UI adds multiple
  pageIds per sheet. Build is clean; Ben to browser-verify + run `__verifyFixture` 44/44.

**Everything else is a clean extension** (pageScalesRef, completedShapesRef filtering, elevationEdgeRef,
openingsByWallId, getFloorLevel, getGhostSourcePageId, getEffectiveScale, sidebar section derivation —
all already keyed by pageId and accept new pageIds without structural change).

**Z-datum guardrail (2026-06-29):** Region-pages MUST NOT region-scope or sheet-scope the Z datum. The base datum and `accumulateZ` stay building-wide and FLOOR_ORDER-keyed so #7's per-shape Z (and the datum-mode toggle) resolve through the building base, never a per-region zero. See #7 Z-datum model block.

**DONE (commit 8d6e57d, Session 61 — 2026-06-29):** Crop-carving UI — the user-facing half of #5 — fully built and verified:
- "Add region" toolbar button enters carve mode; amber dashed overlay during drag; mouseup commits rectangle ≥20×20px as new region-page (`page-N-rK`).
- Source sheets with carved regions become carve-surface-only: Draw/Edit/Set Scale/Categorize/Set North/Set elevation edge/Align elevation/Place opening/Draw run suppressed. `currentPageIsSourceSheet` derived gate.
- Sidebar: source sheet shows "(full sheet)" chip; region-pages appear as "Region K of p.N" entries; uncategorized regions land in Unused Pages.
- `goToRegionPage(pageId)` navigation helper. `advanceToNextUncategorized` and `enterCategorizeReentry` reworked to skip source sheets and navigate by pageId.
- `__dumpRegions()` DEV helper: partition check, unique-ID summary.
- Snapshot/restore round-trips pageCrops (via existing `pageCropsRef.current` capture at line 4789).
- Verified: 44/44 fixture checks pass; region canvas resizes to crop dims; sidebar correct; snapshot round-trip confirmed.

---

### 6. CAD-export datum (named reference point)

**Logged:** During Step 5a-ii planning, while discussing how the anchor/lowest floor is designated.

**Description:** A **named reference point stored at computed coordinates inside the coordinate space**, used as the datum on CAD/3D export (e.g. SketchUp, DWG/DXF). It is placed deliberately OUTSIDE all building geometry — roughly 10 ft below the lowest floor level and roughly 10 ft clear of any building geometry (exact margin convention TBD) — so that on export the whole building sits in one quadrant with this point as the axis convergence, matching how a site survey benchmark is set. This does **not** redefine or relate to the coordinate origin: the origin is already a fixed arbitrary zero (FUNCTIONALITY_SUMMARY.md Section 1), and this datum is simply another piece of stored geometry within the space.

**Open questions to resolve when built:**
- Exact offset convention: fixed 10 ft, or "clear of geometry bounding box + 10 ft"? Below the lowest floor's Z specifically?
- Does the datum recompute as geometry grows, or freeze once set? (It cannot be computed until some geometry exists, so it is necessarily derived after initial tracing.)

**Why deferred:** Part of the real-world coordinate-system refactor that CLAUDE.md defers ("Real-world coordinate system: Post-Phase 1.5 refactor; currently all coords are canvas pixels. Will convert to feet/meters before Phase 2."). It supports the DWG/DXF interchange flagged as Phase 2 in the vision docs. Not a Step 5 concern; Step 5 only needs to know which floor is lowest, which this depends on but does not replace.

**Status:** Deferred to the coordinate-system refactor (post-Phase 1.5, pre-Phase 2). A stored datum point, not an origin redefinition.

---

### 7. Intra-floor Z / split-level: designating the lowest shape on a floor page

**Logged:** During Step 5a-ii planning, while discussing anchor-floor designation.

**Description:** A single floor-plan page may contain multiple shapes at different vertical levels (e.g. a sunken living room, a split-level floor). The idea raised: when the designated lowest floor page has more than one shape, the user picks which shape is actually lowest. This is a Z relationship that sits **within the relative-offset floor-stack Z model** (FUNCTIONALITY_SUMMARY.md Section 1) — i.e. these intra-floor levels would carry their own offsets within the stack. It requires per-shape Z, which the current data model does not carry — shapes are stored as 2D {vertices:[{x,y}]} in canvas pixels only. It does not touch the coordinate origin (which is a fixed arbitrary zero).

**Why deferred:** Depends on a Z-modelling layer that does not exist yet. Per the rewritten Section 8, Z values (offsets in the stack) are set later on elevation/cross-section sheets via the floor/ceiling line-slider mechanic — that is where "which shape sits at which Z" becomes answerable with real data. Also overlaps the interstitial-space architecture already deferred in entry #4 (and the sidebar's sunken-living-room sub-grouping note in Section 4). Building it now would require inventing per-shape Z ahead of the elevation work that properly establishes it.

**Status:** Deferred. Fold into the Section 8 elevation line-slider work and entry #4 interstitial architecture when the relative-offset Z stack is built.

**Z-DATUM MODEL (planning chat 2026-06-29, settled):**

- **One building-wide base datum** = the lowest NAMED (FLOOR_ORDER) floor's floor plane, fixed once set. The base never moves to chase the lowest actual geometry.
- **Every Z is a SIGNED offset from the base:** areas above = positive; areas below (footings, sumps, sub-base splits, out-of-column wings that still reference the building base) = negative.
- **Z is by reference, not by coordinate-position:** areas NOT stacked above the lowest floor area still reference the building base for their elevation. (Coplanar-distinctness #19 running vertically: shared datum, distinct elements.)
- **`accumulateZ` extension:** today it accumulates upward from lowest-present-level-as-zero with no negative concept. #7's change: base becomes an explicit named anchor; offsets may go negative. Clean extension of the existing pure function — do NOT reintroduce an implicit lowest-is-zero assumption.
- **DATUM-MODE TOGGLE:** user flips zero between "lowest floor = 0" and "ground level = 0." Geometry is identical either way — the toggle only re-origins the number line. It is a READ-TIME render parameter (a flippable view toggle, NOT a stored project setting), so every Z readout surface (height panel, enumeration, F280 conditions, 3D axis) must render relative to the active mode on the fly.
  - "lowest floor = 0" — buildable when #7 lands.
  - "ground level = 0" — DISABLED-WITH-HINT until grade-line-to-Z resolves (recon gap 7, R3-gated). Lights up for free when that gate lifts.

---

### 8. General layer-visibility model (discipline layers, reference toggles)

**Logged:** Session 8, while implementing multi-floor ghost rendering.

**Description:** The multi-floor ghost is the **first concrete instance of a layer-visibility system**: a toggleable reference layer that coexists with a single active working layer. The full vision: a discipline-layer architecture where (e.g.) structural walls, MEP routing, and finish layers all have independent visibility toggles, live on the same coordinate space, but only one is editable at a time. Multi-floor is just the first use case — same plumbing, same interaction pattern.

The ghost rendering implementation (`getVisibleVertices` plumbing, `showGhost` toggle, redraw integration) is written generically to extend to future reference layers without rework.

**Why deferred:** Phase 2+ layer-management architecture. Phase 1.5 is single-layer-per-page (the floor you're tracing). Building the full discipline-layer system now would over-architect before the demand is clear.

**Status:** Deferred. Multi-floor ghost is the prototype. Full layer system scoped to Phase 2 architecture planning.

---

### 9. Scale matching from shared printed scale notation

**Logged:** Session 8, multi-floor planning.

**Description:** When a page displays the same printed scale notation (e.g. "1/4\" = 1'-0\"") as a page already calibrated, automatically apply the calibrated scale without requiring the user to re-measure. Requires PDF text recognition (OCR or embedded text extraction) to read the notation, then notation-matching logic to find prior pages with the same notation. The matched scale is a calibration-verified value copied from a previous measurement — more reliable than reading and applying the scale string directly.

**Why deferred:** (1) Requires PDF text extraction or OCR, deliberately absent from Phase 1 (the tracing tool is hand-driven, not automated; scale reading by eye is intentional). (2) An accelerator on top of the manual ghost-alignment mechanic, never a replacement. (3) Notation-matching and scale-history tracking add data-model scope. (4) Most real plan sets already have the calibrated scale per-page written consistently (e.g. all floors printed at "1/4\" scale"), so manual-once-per-unique-scale is workable for Phase 1.

**Status:** Deferred to Phase 2+ when PDF text tooling is available and multi-page scale normalization is prioritised as a workflow bottleneck.

---

### 10. Full-screen / maximum-width canvas layout + PDF render resolution

**Logged:** Session 8, while tuning multi-floor ghost visibility against large PDFs. **Amended:** Session 42 (resolution + viewport items folded in).

**Description:** Three related canvas real-estate and readability items:

(a) **Maximum-width canvas:** The canvas area currently leaves large unused margins. UI/layout polish: expand the canvas to use the full browser width, and potentially the full height (hiding the toolbar into a collapsible header or side-drawer). Dense floor plans and large elevations would become more readable without constant zooming.

(b) **App working area does not fill the browser viewport in fullscreen:** Even when the browser window is maximized, the usable drawing area is smaller than it could be — toolbars and padding consume significant vertical and horizontal space. Tied directly to (a); same fix pass.

(c) **PDF render resolution too low:** ~~DONE Session 51 (commit 6e06677).~~ Three-tier backdrop resolution toggle: Normal (1×), Enhance (2×), No seriously, enhance (4×) with De-enhance to drop back to Normal. Backdrop-only: `measureRef` dimensions, `getCanvasPos`, snap, and all stored geometry are completely untouched. Auto-resets to Normal on page navigation, PDF upload, and fixture restore. The `resizeMeasure` flag on `renderPage` is the key seam — same-page enhance re-renders pass `false` so `measureRef` bitmap is never cleared.

**Why deferred:** All three are pure UI/layout and rendering-quality polish, zero core functionality impact. Ghost rendering tested at current canvas size; margin and resolution improvements are a separate visual-design pass. None block any tracing workflows.

**Status:** (c) DONE (Session 51, commit 6e06677). (a)+(b) still deferred — good candidate for a single dedicated UI pass after Phase 1 toolkit is feature-complete.

---

### 11. Sidebar auto-hide

**Logged:** Session 9, during multi-floor sub-step 2 (alignment) testing.

**Description:** The page-navigation sidebar overlay should auto-hide (collapse) when not in use — e.g. collapse after a selection, or when the user begins interacting with the canvas — rather than staying open and occupying screen space over the drawing. Currently it stays in whatever open/closed state the user last set.

**Why deferred:** Pure UI/layout behavior, no impact on the alignment mechanic or any core geometry. Surfaced mid-Piece-C; logged rather than worked in to keep the alignment commit clean. Related to entry #10 (full-screen / max-width canvas layout) — both are canvas-real-estate polish and could be tackled together.

**Status:** Deferred. Candidate for the same UI pass as #10 once the Phase 1 toolkit is feature-complete.

---

### 12. Page rotation (90° viewer rotation + arbitrary alignment rotation)

**Logged:** Session 9, during multi-floor sub-step 2 Piece D (scale alignment) planning.

**Description:** Two related but distinct rotation capabilities, both deferred:
- **90° page rotation** — a viewer convenience to rotate the whole PDF page in 90° increments when a sheet was scanned/exported sideways. Applies to the page display generally, independent of floor alignment.
- **Arbitrary alignment rotation** — rotating a floor-plan PDF by a free angle to align its geometry to the floor-below ghost when the sheet came in skewed. This is the `angle` field already present in the per-page transform struct `{tx,ty,s,angle}`; the field exists so this can be added later without a data-model refactor, but the rotation *interaction* (handle, anchor, compose with scale/translate) is not built.

**Why deferred:** Stacked residential floor plans are almost always drawn at the same orientation on their sheets, so alignment needs only translate (Piece C) + scale (Piece D); rotation is an edge case for skewed scans. Adding it to Piece D would double the corner-handle interaction complexity for a case that may not arise. The transform struct already reserves `angle`, so adding it later is non-destructive.

**Status:** Deferred. Pull off this list and build as its own piece if a real skewed/sideways plan set appears in testing.

---

### 13. Ghost vertices as opt-in snap targets

**Logged:** Session 10, during multi-floor sub-step 3 planning (scoped in but deliberately not built).

**Description:** While tracing on a confirmed upper-floor page, allow the user to snap to
vertices of the ghost (floor-below) geometry — not just the shared measure-space grid. This
would let a user place a wall corner exactly coincident with the corner below it by hovering
near the ghost vertex. Vertices only (no ghost edge/segment snap, no dwell mechanics, no
priority rework over axis snap or grid snap).

**Why deferred:** The existing axis snap + shared measure-space grid already handles
geometry-to-geometry alignment for standard wall tracing. Ghost-vertex snap is a nicety for
corner-exact coincidence, not a blocker. Adding it mid-sub-step-3 would have grown the scope
beyond the confirm-gate goal. The `getVisibleVertices` plumbing is written generically and
could include ghost vertices with a small addition when this is prioritized.

**Status:** Deferred. Low complexity to add when sub-step 4 is done and the ghost-chain
architecture is stable.

---

### 14. Scale inheritance within a drawing group

**Logged:** Session 10, during multi-floor sub-step 3 planning.

**Description:** On plan sets where multiple pages share the same printed scale (e.g. all
floor plans at 1/4" = 1'-0"), automatically suppress the "Set Scale" prompt across sibling
pages once one page in the group has been manually calibrated. The calibrated scale would be
inherited by uncalibrated siblings without requiring alignment confirmation. This is a sibling
to entry #9 (scale matching from shared notation) — but rather than reading notation, it would
work within a user-defined "drawing group" concept where a designated scale-source page shares
its `pxPerMeter` with the rest of the group.

**Why deferred:** Requires two things that don't exist yet: (1) a drawing-group concept (pages
grouped by shared-scale intent, separate from floor-level categorization), and (2) a designated
scale-source page within that group. Neither is in the current data model. The sub-step-3 confirm-
and-borrow mechanism handles the floor-stack case cleanly; sibling-group inheritance is a distinct
workflow that deserves its own design.

**Status:** Deferred. Design alongside entry #9 when PDF text tooling and multi-page scale
normalization are prioritized.

---

### 15. Directional decoupling: primary-reference model (replaces bottom-up ghost/borrow)

**Logged:** Session 11, mid sub-step 4.

**Description:** Today the ghost reference and scale-borrow are strictly bottom-up — `getGhostSourcePageId` scans *downward* through `FLOOR_ORDER`; `getEffectiveScale` borrows toward the lowest calibrated floor. This forces tracing the lowest floor first. Replace with a **primary-reference tree**:
- One project-level `primaryReferencePageId` — the scale-and-coordinate root. **Defaulted to the first page calibrated**, but **user-reassignable** (relabel the root; geometry doesn't move, since all confirmed pages already share the primary's space).
- Per-page stored `referenceParentPageId` — which already-in-primary-space page *this* page was aligned/confirmed against (stored at confirm time, not computed by floor order). A confirmed page is itself a valid reference for the next, so alignment is direction-agnostic (up/down/skip).
- `getEffectiveScale` follows the stored parent pointer to the primary (direct chain, not a `FLOOR_ORDER` scan) — simpler, and structurally acyclic (tree rooted at primary; every confirm adds a leaf pointing at an existing node).
- Ghost source becomes "nearest confirmed reference" (or user-picked), not "nearest lower floor." Open UI question: auto-pick adjacent confirmed page vs. let user choose the reference.

**Explicitly unchanged:** `getAnchorFloor` and the relative-offset **Z-stack** stay bottom-up — the physical floor stack (base = lowest, Z accrues upward) is a building fact, fully separate from the reference/scale/trace-order axis. Primary-reference (coordinate-space root) and anchor-floor (Z-stack base) are two distinct concepts and must stay separate.

**UI copy impact:** "floor below" → "reference floor"/"reference plan" across align button, Draw-disabled hint, ghost toggle.

**Why deferred:** Redefines sub-step 1 + 3 core logic in the feature that was lost once and carefully rebuilt; needs its own planning + pieces + testing (the cycle guard, currently cheap insurance, must be verified against the new tree). Not sub-step 4.

**Status:** Built in sub-step 5 (commits 9ef06b1, b8dd9ce, 6f7f629). Primary-reference reassignment UI (letting user change `primaryReferenceIdRef` after initial set) remains deferred — the tree works with first-calibrated as root; reassignment is a non-blocking enhancement.

---

### 16. Multi-select reference ghosts by floor label

**Logged:** Session 11, end of sub-step 4.

**Description:** Today exactly one reference ghost shows — the single nearest source page (sub-step 1–3), and entry #15 makes *which one you align against* user-pickable. This is different: let the user choose **which floors are shown as reference ghosts, multi-select by floor label**, displaying several reference plans at once (e.g. while tracing 2nd Floor, show both Main Floor and Basement as overlays). Visibility is independent of which floor is the alignment parent (#15) — a floor can be shown as reference without being the thing you align/borrow scale from.

This is the floor-specific instance of the general layer-visibility model (#8): a per-floor-label visibility picker (checklist of categorized Floor Plan pages → toggle each on/off as a reference overlay). Same plumbing as the existing single ghost (`getVisibleVertices`, `showGhostByPageId`, `drawGhostShapes`), generalized from one source to a selected set. The per-page toggle built in sub-step 4 (Piece 1, `showGhostByPageId`) is the seed pattern this extends.

**Open questions when built:**
- Visual disambiguation when multiple ghosts overlap (per-floor colour/opacity, or label tags on each ghost).
- Interaction with the alignment-parent ghost: is the align reference always shown, or independently toggleable too?
- Whether selection is by floor label specifically, or any categorized page.

**Relationship to #8 and #15:** #8 is the full discipline-layer system (Phase 2). #15 is reference/scale *topology* (which floor is primary, which is the align parent). This (#16) is reference *display* — which floors are visible as ghosts — and is the natural bridge between today's single ghost and #8's full multi-layer visibility.

**Why deferred:** Display/visibility feature on top of the reference system; not needed to finish multi-floor alignment. Best built after #15 settles the reference topology, and shares design with #8.

**Status:** Deferred. Build alongside or after #15; design with #8.

---

### 17. Universal reference-layer model (architectural — the endgame data model)

**Logged:** Session 12, before sub-step 5 planning. This is the architectural spine that #8 (layer-visibility) and #16 (multi-select reference ghosts) are partial views of; both are subsumed by this. Recorded here so the principle drives data-model shape from sub-step 5 onward, even though it is built incrementally.

**The model:** Every entity in the project lives in one shared 3D coordinate space on a universal snap grid. Any entity can be displayed as a **reference layer** on any working view. A reference layer is a **projection** of a 3D entity onto the current view's plane — e.g. on the roof view, the basement walls shown projected onto the roof's 2D plane (NOT a flat pixel copy of another page; a computed projection of real geometry). Each reference layer independently toggles (a) its visibility and (b) its control points/vertices as snap targets. Arbitrarily many reference layers stack at once. This is what lets a user trace one floor's joists against another floor's walls against another layer's electrical, simultaneously — every layer in the same coordinate space, on the same snap grid.

**Reference relationship — final data shape (adopted in sub-step 5):**
A reference is modeled as a typed, projected pointer, not a floor-specific one:
- `sourceId` — the referenced entity (a pageId today; any entity id later).
- `referenceKind` — what the source is, used to derive UI labels ("reference floor" / "reference wall" / "reference drawing"). Always `'plan'` today.
- `projection` — how the source is projected onto the current viewing plane. Always `'plan'` (top-down onto XY) today; `'north-elevation'`, `'section-AA'`, etc. later.
- Plus the scale/coordinate tree: project-level `primaryReferenceId` (root, defaulted to first-calibrated, reassignable) and per-page `referenceParentId` (which in-primary-space entity this one aligned/confirmed against).

`referenceKind` and `projection` are constant-valued today and exist purely so the relationship structure is **final now and only extended later, never restructured**. Labels derive via a `kindToLabel(referenceKind)` lookup from day one — never a hardcoded "floor below."

**Built incrementally — the today-vs-later line:**
- **Sub-step 5 (now):** the reference-relationship data model in its final shape above; autosuggest-with-override reference picker; bottom-up → primary-reference-tree logic swap (#15). Tested against multi-floor plan-view PDFs where `referenceKind` and `projection` are constant `'plan'`.
- **Downstream, each its own step, all gated on the pixels→real-world XYZ coordinate conversion (CLAUDE.md flags this as pending pre-Phase-2):** projection math (the collapse-onto-plane transform), per-reference-layer vertex-snap toggles, arbitrary multi-layer stacking UI, non-plan `referenceKind`/`projection` values and the entity types that carry them.

**Why not build more now:** Projection and cross-entity referencing require the real-world 3D coordinate model that does not exist yet (everything is canvas pixels today). Building projection before that conversion is building on sand. The data shape anticipates it; the behavior waits for the foundation.

**Relationship to #8, #15, #16:** #17 is the unifying model. #15 is its scale/coordinate-topology slice (primary tree, align parent) — built in sub-step 5. #8 is its full discipline-layer expression (Phase 2). #16 (multi-select reference ghosts by floor label) is an early display slice of #17 and should be built as the first concrete multi-layer step once projection exists. #8 and #16 remain as detail references; #17 is the governing architecture.

**Status:** Architectural record. Sub-step 5 adopts the data shape; downstream behaviors deferred pending 3D coordinate conversion.

---

### 18. Roof system model (architectural — slope-derived geometry, deferred build)

**Logged:** Session 13, before roof-plan-trace step. Records the full roof model so the minimal trace-only step does not foreclose it. Most of this is deferred to dependencies (wall geometry, elevation drawings, slope model, pixels→real-world XYZ conversion); only typed 2D roof-line tracing is built now.

**Core principle — Z is derived, never hand-placed:** The roof plan is the only thing traced directly. Elevation (Z) anywhere on the roof is COMPUTED from traced lines + an applied slope rule, not entered per-vertex. Pitched roof: hip/valley/ridge lines + slope value compute elevation across the surface. Flat roof: drain points + slope rule do the same. This same data later drives roof drainage planning (eavestrough / rainwater leader locations).

**What is traced (and built now, trace-only):** Roof plan outline at the eaves, plus internal hip / valley / ridge / eave lines, as TYPED 2D geometry. Line type (eave / hip / valley / ridge) is tagged at trace time — every downstream behavior (slope rules, Z-derivation, drainage, elevation referencing) attaches to line type, so typing is mandatory even though slope/Z are deferred. No slope, no Z, no 3D this step.

**Derived (not traced), deferred to wall geometry:**
- **Ceiling** = region inside the walls, offset by wall thickness. Ceiling height understood from wall heights.
- **Soffit** = region outside the walls (wall line to eave); modeled as an adjustment for the outside-of-wall surfaces.

**Ceiling plan with vault lines (separate drawing type, deferred):** A distinct drawing where vault lines are traced, slope applied, and 3D geometry derived. Key coupling: a sloped ceiling line MODIFIES the intersecting exterior wall — the wall rises to a peak as the thermal boundary, increasing room volume. This is a real geometry coupling between ceiling and wall, not annotation.

**Elevation-stage interactions (deferred to elevation drawings + #17 reference layers):** The roof plan is referenced on elevation drawings; soffit and fascia heights are SET there (fascia can have variable height), which then characterizes roof finish geometry. Fascia drawn level on an elevation is the trigger for the drainage feature below.

**Eavestrough / rainwater leader auto-prompt (deferred workflow feature):** When fascias are drawn level on elevations, auto-prompt the user for eavestrough and rainwater-leader input at those locations. Ties to the drainage payoff of slope-derived Z.

**Ridge-to-perimeter junction / peaked eave (deferred):** When a ridge endpoint lands on a perimeter edge, the graph topology records the junction (perimParent vertex). The *elevation inference* from that junction — the eave rising to meet the ridge, the roof surface sloping — requires Z-derivation from slope rules and is deferred to step (2). Do NOT fake a visual peak without real Z behind it.

**Build order:** (1) typed roof-line trace + graph topology (including perimParent junctions) [built Session 13]; (2) slope rules + Z-derivation [needs slope model + XYZ] — this step resolves the ridge-to-perimeter peaked-eave inference; (3) ceiling/soffit derivation [needs wall geometry]; (4) vault-line ceiling plan + wall coupling [needs walls + slope]; (5) elevation-set soffit/fascia heights [needs elevation drawings]; (6) eavestrough/RWL auto-prompt [needs fascia-on-elevation].

**Status:** Deferred except step (1) typed roof-line trace, which is the current build step.

---

### 19. Coplanar-distinctness principle (architectural record — element identity vs. shared datum)

**Logged:** Session 14, during elevation numeric-editor planning (Piece 2).

**The principle:** Coincidence in one or more coordinates is NOT identity. Two elements sharing an elevation (same Z), or sharing X/Z with a Y separation, or coincident in any subset of coordinates, are distinct entities that happen to be coplanar — never to be merged on the basis of the shared coordinate. Identity is always per-element; it is never inferred from coordinate coincidence. Every element that can sit on a shared plane must carry its own identity and attributes.

**Motivating case:** Two areas of a building at the same floor elevation — one slab-on-grade concrete, the other a wood-frame floor over a basement, vertically aligned. Same floor-plane Z, categorically different elements (different assembly, different what-is-below, different everything). The model must keep them separate despite the shared elevation.

**Datum layer vs. element layer (the resolution adopted in Piece 1/2):** The floor-level Z-stack (floorHeightsRef, keyed by FLOOR_ORDER level, built Piece 1) is a DATUM layer — a small set of named reference elevations the building hangs off. Multiple coplanar elements correctly SHARE a datum (both the slab area and the wood-frame area reference "Main Floor floor plane Z"). Sharing a datum is the system working correctly, not a collapse. Per-element distinctness lives in the ELEMENT layer (completedShapesRef and its future per-element Z + assembly attributes), where each element references a datum but is never merged into it or into a sibling that shares the datum.

**Current state:** Per-element Z and per-element assembly identity DO NOT yet exist in the data model — shapes store { vertices, pageId, status } only (recon-confirmed, Session 14). The numeric editor (Piece 2) populates the datum layer only; it is explicitly NOT where slab-vs-wood-frame or any per-element distinction is captured.

**Why deferred:** Per-element Z is #7 (intra-floor Z / split-level). Per-element assembly identity is Phase 2 (assembly assignment, Section 12). Both need the coordinate model and assembly model that Phase 1.5 / 3a deliberately defers. This entry exists so that WHEN #7 and the Phase 2 assembly model are built, they are designed from the start to honor per-element identity (no coordinate-coincidence merging) rather than retrofitting it.

**Relationship to other entries:** Governs the data-model shape of #7 (per-element/intra-floor Z) and Phase 2 assembly assignment. Sibling in kind to #17 (universal reference-layer model) — both are architectural records that drive deferred build shape rather than describing a near-term feature.

**Status:** Architectural record. No build now; constrains the design of #7 and Phase 2 element-Z/assembly work.

---

### 20. Metric dimension-entry logic (unified rework — separate session)

**Logged:** Session 14, during elevation numeric-editor Piece 2 input-format work.

**Description:** Dimension input fields currently assume imperial display. The floor-heights panel uses feet-and-inches entry for ceiling heights (two fields: feet + decimal inches) and inches for floor-system thickness (presets and custom are inch-native). These input formats are correct for imperial-display projects but are NOT defined for metric-display projects. A unified rework is needed that defines dimension-entry input logic consistently across ALL typed-dimension surfaces — calibration/scale dialog, ceiling heights, floor-system thickness, and any future dimension entry — for both imperial and metric display units. This is a cross-cutting input-convention design, not a per-field patch.

**Why deferred:** Touches multiple existing input surfaces, not just the floor-heights panel; doing it piecemeal per field would create inconsistent conventions. Deserves its own session to define the input model once, coherently, across imperial and metric. Storage under the hood is already unit-normalized (values normalized to one unit before accumulateZ); this is specifically about INPUT field format and parsing per display unit.

**Current assumption (explicit):** The floor-heights panel and its ceiling/floor-system inputs assume imperial display. On a metric project these fields are not correctly defined and must not be trusted until this rework lands.

**Status:** Deferred to a dedicated dimension-entry-logic session.

---

### 21. Planes/edges as rule-imposing boundaries (surface semantics / barrier-on-crossing)

**Logged:** Session 18, during R2 close-out.

**Description:** An ELEMENT-LAYER architectural requirement. An edge in the model is not merely
a line connecting two vertices — it is a **boundary with rules**. When geometry (a line, a path,
a service run) crosses a plane defined by an edge, that plane imposes rules: a wall plane blocks
or constrains what crosses it; a floor plane separates the level above from the level below. The
edge's semantic identity (wall face, floor surface, roof plane) determines what crossing it means.
This is distinct from — and must not be collapsed into — the coordinate coincidence that marks
coplanar elements (#19): two elements at the same Z share a datum, but they are separate entities
with separate rule sets.

**Relationship to other entries:** Governs the element-identity model (#7, #19). Ties directly to
the Phase 2 assembly model (Section 12, FUNCTIONALITY_SUMMARY): an assembly is a stack of planes
each with its own rule-set. The universal reference-layer model (#17) is the display/reference
architecture; this is the semantic/rules architecture. Both must be coherent.

**Why deferred:** Requires the per-element identity layer (ELEMENT layer, R3/Phase 2) that does
not exist yet. Per-element Z and assembly identity (#7, Phase 2) are the near-term prerequisites.
Designing the rule model before those exist would produce abstractions without concrete anchors.

**Status:** Architectural record. Constrains R3/element-layer and Phase 2 assembly design. Do NOT
build now; flag if any R3 design choice forecloses this.

---

### 22. Recalibration-independence invariant (architectural guard)

**Logged:** Session 18, as the explicit rationale for choosing Path 3 over 4a.

**Description:** Geometry must remain **scale-independent in storage** — no conversion ratio is
ever frozen into stored coordinates. If the px↔meter ratio for a page changes (recalibration, or
a parent page in the borrow chain being recalibrated), stored geometry must remain correct without
migration. This invariant is what Path 3 protects: pixels stored, meters projected at read time via
`pxToMeters`/`metersToPx`. The alternative (4a: store meters natively) would freeze the
`pxPerMeter` value at write time; a recalibration event would orphan the stored meters, silently
corrupting all downstream geometry and labels.

**Why logged:** To make this property visible so no future step reintroduces a frozen conversion
ratio in storage. Any proposal to "store real-world values" or "pre-compute coordinates at write
time" must be checked against this invariant before proceeding.

**Status:** Architectural invariant — active, not deferred. Path 3 already honors it. Future
steps (R3 per-element Z, Phase 2 assembly attributes) must be designed to honor it too.

---

### 23. Isometric multi-reference elevation alignment (Z-driven display)

**Logged:** Session 19, elevation Piece 2 close-out.

**Description:** Show one or more floor-plan references isometrically alongside the picked edge,
with the selected edge highlighted and a bounding box around the whole projected image. Each
reference's display is driven by its Z value (floor height), enabling the user to visually verify
vertical positioning relative to multiple floors simultaneously. Supports one or more reference
geometries whose Z values drive the projection.

**Why deferred:** Requires per-reference Z values (R3/Phase 2 — gated by #7 intra-floor Z and
#19 element-identity model) and the universal reference-layer model (#17) to project floor-plan
geometry isometrically onto the elevation view. The current two-piece mechanic (edge pick +
uniform-scale align) is the non-Z foundation this extends.

**Status:** Deferred. Held until post-Phase-2 review once the 3D coordinate model and reference-layer
projection exist.

---

### 24. Global drag-release robustness (bug / polish — app-wide)

**Logged:** Session 20, elevation Piece 3 sub-piece 2 close-out.

**Description:** Drag interactions that end with the mouse cursor outside the browser window do not release on `mouseup`, because `mouseup` fires on the element, not on `window`. This affects elevation-edge align, floor-reference align, elevation base-line drag, and likely any other drag interaction in the app. Fix pattern: listen for `mouseup` on `window` (and ideally `pointercancel` / `mouseleave`) in addition to the canvas element's handler; tear down the drag ref in all three paths. Low-risk, no geometry change; app-wide effect.

**Why deferred:** Surfaced mid-close-out, not mid-build; doesn't block any current workflow unless the user releases outside the window (an uncommon but real path). Deserves its own small, focused polish pass that touches all drag interactions at once rather than patching each individually.

**Status:** Deferred. Good candidate for a dedicated drag-robustness pass before Phase 2.

---

### 25. Edge-select button labels (UI polish — Piece 1)

**Logged:** Session 20, elevation Piece 3 sub-piece 2 close-out.

**Description:** In "Set elevation edge" mode (Elevation spatial Piece 1), after the user clicks an edge the only toolbar button is "Exit". The expected UX is two buttons: "Confirm edge selection" (stores and exits pick mode) and "Choose again" (clears the current selection and lets the user re-pick). The current "Exit" doubles as a confirm, which is unclear.

**Why deferred:** UI-label improvement to an already-built and working piece; doesn't block elevation work. Best batched into a UI polish pass with other similar label/button improvements rather than a standalone commit.

**Status:** Deferred. Batch into a UI polish session.

---

### 26. Categorization exit navigation bug (bug — Step 4b)

**Logged:** Session 20, elevation Piece 3 sub-piece 2 close-out.

**Description:** If the user ends a categorization pass while the current page is uncategorized and then exits categorize mode (clicks "Done"), the view remains on the uncategorized page. It should navigate to the last categorized page (or the most-recently confirmed page). Step 4b categorize-mode exit logic does not currently account for this.

**Why deferred:** Affects categorization flow only; does not block tracing or elevation work. No geometry or data impact. UI navigation fix, targeted to a polish pass.

**Status:** Deferred. Fix alongside other categorize-mode polish items.

---

### 27. Reference-line snap-suggest to known Y positions (feature — near-term candidate)

**Logged:** Session 20, elevation Piece 3 sub-piece 2 close-out.

**Description:** When dragging the elevation floor/ceiling reference-line stack (Piece 3 sub-piece 2), snap-suggest the base line toward known reference Y positions — e.g., the elevation-edge ghost line's midpoint Y, or the Y of a previously placed reference line on another elevation page that shares the same source edge. Same UX family as start-vertex snap-suggest: a red proximity highlight when the dragged line approaches a known anchor, releasing gives exact alignment. No PDF image analysis required — all reference Ys are derived from stored geometry.

**Why deferred:** Surfaced at close-out; doesn't block placement. Requires knowing what Y positions are "known" on the current elevation page (edge midpoint, peer page offsets), which is computable but adds hit-test logic to the drag path. Near-term candidate; relates directly to the Piece 3 drag work already built.

**Status:** Deferred. Candidate for the next elevation polish pass after Piece 4 is done.

---

### 28. PDF visual analysis / analysis-first front end (MAJOR VISION — deep-review waypoint)

**Logged:** Session 20, elevation Piece 3 sub-piece 2 close-out. **Expanded:** Session 42 (fuller vision scope added; gate reaffirmed).

**Description:** On PDF upload, run automated visual analysis of each page to propose: page category, what the page shows, approximate scale, and key geometry (e.g., exterior perimeter lines). Present findings to the user as confirm-and-correct prompts with a visual overlay — e.g., "Analysis suggests this is the Basement floor plan; these lines appear to be the exterior perimeter — confirm? If any line is wrong, click it and adjust." This is a fundamentally different build paradigm from the current manual-trace flow: **analysis-first, human-in-the-loop correction** rather than human-first trace from scratch.

Includes raster-image line sensing, ML-assisted classification, and an overlay UI that presents analysis results as candidates rather than facts. Reflects how Ben originally envisioned the program working.

**Expanded scope (Session 42):** The analysis layer extends beyond geometry into document-level metadata and schedules:
- **Page classification** — auto-assign category (Floor Plan / Elevation / Section / Roof Plan / Site Plan / Detail) from visual content; confirmed or corrected per page.
- **OCR of schedules and assemblies** — read door/window schedules, wall assembly callouts, and spec notes directly from the PDF; auto-populate project fields that are currently hand-entered (opening labels, assembly types, room counts).
- **Auto-populate project-level fields** — extract address, client name, floor count, building permit number, and similar header/title-block data from the PDF at upload, pre-filling the project-configuration layer (§9) without manual entry.

All three are confirm-and-correct surfaces — the system proposes; the user confirms, rejects, or adjusts. The manual workflow remains authoritative; the analysis layer is a friction-reduction accelerator on top of it.

**Why deferred:** The current Phase 1 toolkit (manual trace, snap, align) is the foundation the analysis layer would validate against and hand off to. Building analysis before the manual layer is complete would build on an incomplete reference. **The expanded scope (OCR, schedule ingestion, auto-populate) amplifies this dependency further** — extracted data must have a complete, tested data model to land in, and those models are still being built (assembly types, project config fields). Analysis built prematurely creates a loop: model changes force re-integration of the extractor.

**Gate (explicit, reaffirmed Session 42):** This item is DEFERRED until the post-3D-model deep-review waypoint. It MUST NOT be built before automated verification exists. The deep-review is the right place to decide whether Phase 2 rebuilds around the analysis-first paradigm or adds it as an accelerator layer.

**Why it matters for the review waypoint:** This is a paradigm-level choice (analysis-first vs. trace-first), not a feature addition. The deep-review waypoint is the right place to decide whether the tool pivots to this model or continues the trace-first approach.

**Status:** Deferred — not scheduled. Gate: post-3D-model + automated verification. Tag as a key input item for the ⏸ deep-level program review (BUILD_ROADMAP.md waypoint). Do NOT build any piece of this before that review.

---

### 29. Derived envelope block + confirm-and-annotate elevation model (architectural)

**Logged:** Session 21, during Piece 4 close-out.

**Description:** A model shift for how elevation outlines relate to floor-plan geometry. Instead of treating elevation polygons as independent traced shapes, the derived-envelope-block approach:

- **Four boundary surfaces per floor stack:** front wall plane, rear wall plane, left wall plane, right wall plane — each the canonical extent of that face of the building.
- **Reference-boundary rule:** these surfaces are DERIVED from floor-plan polygons (the outermost extents in each compass direction), not drawn freehand. The elevation drawing is used to CONFIRM and ANNOTATE them (add windows, doors, height annotations) — not to define them.
- **Source-of-truth = floor-plan block geometry.** An elevation trace that contradicts the floor plans is wrong by definition.
- **Interaction posture shift:** user confirms/adjusts pre-drawn boundary lines (derived from the plan), then traces openings and surface detail ON TOP of those confirmed surfaces.
- **Simple-massing boundary first:** initial derived block is the bounding box of floor-plan polygons projected onto each elevation face. Actual complexity comes from plan-polygon edge projection, not freehand tracing.
- **Cross-ref #28** (analysis-first front-end): derived surfaces are already "known," so only detail needs human input — natural fit for analysis-first annotation.

**Why deferred:** The derive-from-plan-polygon projection requires R3 (per-element Z, real-world XY frame on the plan polygon). The current confirm-and-trace Piece 4 approach is the correct interim step. This is the Phase 2 / post-review target.

**Status:** Architectural record. Constrains Phase 2 elevation-annotation design. Flag if any Piece 4 decision forecloses this.

**GATED-READY — resurfaced 2026-06-29.** R2 (path-3 coordinate seam) + B1/B2 (wireframe
composition seams) satisfy the "projection prerequisite" stated in the original gate — these
provide `pageVertexToWorld` and the world-meter read-time projection. Queue BEHIND #5 (region-pages
must exist before region-scoped derived elevations make sense).

**Planning-chat definition of the derived-elevation step (2026-06-29):**
Once region-pages exist, an elevation region's envelope geometry is DERIVED from its picked
floor-plan reference edge + `accumulateZ` heights — shown to the user for CONFIRM rather than
freehand-traced. `deriveEnumeration` STEP A already emits `orientationDeg` + reconcile tags
per wall edge; setback walls render in the existing reconcile color. Walls sharing the same
facing-direction stay as separate elements grouped by a `faceKey` (orientation-bin + plane-offset
cluster) so U-court / different-plane walls produce subset elevations automatically. No ghost-align,
no freehand trace — the floor-plan polygon IS the geometry source.

---

### 30. Grade / soil line — Elevation Piece 4 sub-piece 2

**Logged:** Session 21, designated as next elevation increment.

**Description:** An open polyline drawn across the elevation canvas representing the finished grade / soil line. Visually distinguishes above-grade from below-grade portions of the elevation. Geometry only — no Z-value derivation. R3/element-layer for Z association deferred (see #21).

**Status:** Piece 1 **DONE** (Session 22; 3fae81b). Piece 2 **DONE** (Session 24; c7a2092). Piece 3 **DONE** (Session 25; e9c04a6). Sub-piece 2 fully complete.

**Piece 2 final — finish-anywhere + snap-as-aid (c7a2092, Session 24):**

2b (2f3f071) built wall-corner binding; 2c (344668b) added floor-line snap. The entire binding REQUIREMENT was then reverted at c7a2092 because it was the wrong abstraction. Trigger: a real grade line legitimately ended in open space between two building masses — the binding gate blocked a valid and common drawing. A grade line is drawn under normal snap rules; it finishes with ≥2 vertices anywhere (corner, floor line, or open space). Corner snap and lowest-floor-line snap remain as POSITION AIDS only — they affect where a vertex lands, they record nothing. No `boundStart`/`boundEnd` fields exist on the shape.

**A1 model: superseded and withdrawn.** A1 (both endpoints must bind) and its floor-line-termination amendment were the wrong framing. The open-space end is not an edge case — it is the normal case for a grade line that continues past the building. Stored bindings would also have required follow-on-edit (2e), adding machinery for a requirement that shouldn't exist. The revert left the codebase −28 lines cleaner.

**Above/below-grade meaning — #41 only.** Above-grade vs. below-grade portions of the wall are derived at READ-TIME by intersecting the grade line with the intact wall polygon (#41). No stored binding needed. One wall element, read two ways. This is the sole model.

**Piece 3: DONE (e9c04a6, Session 25).** "Redraw grade line" button on Elevation-page toolbar, visible when `isElevationPage && gradeLineOnPage && !anyActiveMode`. Click deletes ALL grade-line shapes for `currentPageId` from `completedShapesRef`, repaints, then calls `setDrawMode(true)` + `setGradeLineDrawing(true)` — same entry path as after the on-closure prompt. Wall polygon untouched. Browser-verified.

---

### 31. Dev test fixture Piece 2 — Save/Load buttons

**Logged:** Session 21, after dev fixture (21a967c) committed.

**Description:** UI buttons (DEV-guarded) for saving and loading a fixture snapshot without going through the browser console. LOAD FIXTURE fetches from `/devFixtures/fixture-elevation.json`; SAVE FIXTURE downloads a timestamped JSON file.

**Status:** DONE — live in the DEV strip (Session 22; confirmed in code Session 24 doc check).

---

### 32. Categorize-as-you-go UX shortcut (minor UI)

**Logged:** Session 21 close-out.

**Description:** When the user is drawing on an uncategorized page, offer an inline "Categorize this page" shortcut button in the draw-mode toolbar rather than requiring them to leave draw mode and enter the categorize flow. Reduces context-switching friction during early sessions.

**Why deferred:** Convenience only; no geometry or data impact. Bundle into a UI polish pass.

**Status:** Deferred.

---

### 33. Button colour/priority audit (UI polish)

**Logged:** Session 21 close-out.

**Description:** Button highlight and color states across modes (draw, edit, categorize, align, elevation) are not driven by a single documented rule — each mode was built incrementally with slightly different conventions. A coherent audit should define: primary action color, destructive color, active/toggled color, disabled state — and apply those rules consistently across all toolbar contexts. See also CLAUDE.md known issue "Categorize-input button color scheme not documented."

**Why deferred:** No user-facing bug. Deserves a short session with a written color-state spec before implementation.

**Status:** Deferred. Candidate for UI polish session.

---

### 34. Ghost-vertex snapping note / getVisibleVertices gap (extends #13)

**Logged:** Session 21 close-out.

**Description:** `getVisibleVertices()` currently returns only locked shapes on the CURRENT page — it does NOT include ghost shapes from the reference page. For ghost-vertex or ghost-edge snapping to work (see #13), ghost geometry must be made explicitly available to the snap system. This is the concrete implementation note for #13 sub-piece 1b: the snap extension for ghost targets requires updating `getVisibleVertices` to include the ghost source shapes.

**Why deferred:** Implementation note on top of existing #13 deferral.

**Status:** Note on #13 — record here so the gap is visible when #13 is built.

---

### 35. Elevation align-handle cursor mirroring (UI micro-polish)

**Logged:** Session 21 close-out.

**Description:** The four corner handles on the elevation align bbox all use `nwse-resize` cursor. This is correct for NW and SE corners but looks wrong for NE and SW corners, which should show `nesw-resize`. One-liner fix in the cursor-assignment logic in the align hover handler.

**Why deferred:** Visual micro-polish; no functional impact. One-liner — batch into a cursor/hover polish pass.

**Status:** Deferred.

---

### 36. Sidebar auto-collapse on canvas interaction (extends #11)

**Logged:** Session 21 close-out.

**Description:** When the sidebar is open and the user begins interacting with the canvas (mousedown on canvas area), auto-collapse the sidebar. Extends #11 (auto-hide on selection) — both are canvas-real-estate behaviors. Related to #10 (full-screen canvas layout).

**Why deferred:** Same rationale as #11. Batch with #10/#11 in a canvas-real-estate UI pass.

**Status:** Deferred. Extends #11.

---

### 37. Edge-select "select the edge this elevation faces" copy (UI polish — extends #25)

**Logged:** Session 21 close-out.

**Description:** In "Set elevation edge" mode, the toolbar should display a contextual instruction: "Select the floor-plan edge this elevation faces." Currently self-explanatory only if you already know what the mode does. A one-line note would clarify for first-time users. Related to #25 (edge-select button labels: "Confirm edge selection" / "Choose again").

**Why deferred:** Copy/UX polish. Batch with #25.

**Status:** Deferred. Extends #25.

---

### 38. Isometric ghost preview on edge selection (extends #23)

**Logged:** Session 21 close-out.

**Description:** When the user selects a reference edge in "Set elevation edge" mode, show an isometric or perspective-projected preview of the building from that elevation direction. Visual payoff confirming the selected face before commit. Ties to #23 (isometric multi-reference elevation alignment). Same R3/Z prerequisites as #23.

**Why deferred:** R3 / Phase 2 prerequisites. Same deferral as #23.

**Status:** Deferred. Extend with #23 when the 3D coordinate model exists.

---

### 39. Reference-line label stacking + unconfirmed-height indicator (UI polish)

**Logged:** Session 21 close-out.

**Description:** Two related polish items for `drawElevRefLines`:
(a) **Label stacking:** when floor/ceiling lines are close vertically, left-edge labels overlap. Labels should offset vertically when tight so each is readable.
(b) **Unconfirmed indicator:** lines whose corresponding floor height is null (not yet entered in the panel) should render RED/amber to show they are placeholder positions, not confirmed heights.
Both are single-pass changes.

**Why deferred:** UI polish on working reference lines. Batch in an elevation-reference-lines polish pass.

**Status:** Deferred.

---

### 40. Floor-to-floor field auto-grey when ceiling + floor-system both set (UI polish)

**Logged:** Session 21 close-out.

**Description:** In the floor-heights panel, when both ceiling height AND floor-system-above are already entered for a level, the floor-to-floor back-solve field is fully constrained and redundant. The field should grey out or display a read-only derived value, preventing accidental overwrite of a solved value. Display-layer only — no change to `ceilingSource` logic or stored data.

**Why deferred:** Panel ergonomics. Batch with floor-heights panel polish.

**Status:** Deferred.

---

### 41. Grade line: read-time above/below-grade interpretation — no polygon split (architectural principle)

**Logged:** Session 22 follow-up (after close-out commit 82de016).

**Description / principle:** The wall/outline polygon is NEVER divided by the grade line. The grade line is stored reference data laid across the intact wall polygon. Above-grade vs. below-grade quantities (e.g. below-grade wall area for an energy model or downstream program) are **derived on read** by intersecting the grade line with the wall polygon geometry — never stored as separate shapes. One wall element exists; it is read two ways.

This is the same store-inputs/project-at-read-time pattern as the `pxToMeters` recalibration-independence seam (#22): inputs (the polygon, the grade line) are stored unchanged; the derived quantity is computed fresh from them every time it is needed. Changing the grade line or editing the polygon automatically updates every derived quantity without any stored state to patch.

The intersection/quantification logic (the "read" half) is R3 / element-layer, deferred. See also: #29 (derived envelope block), #19 (coplanar-distinctness / element identity), #21 (planes/edges as rule-imposing boundaries).

**Why logged:** To make the no-split decision explicit and durable — so a future build step does not accidentally split the polygon or store redundant area geometry under time pressure.

**Status:** Principle only — no build needed at this stage. Enforce at design-review time before any above/below-grade feature is scoped.

---

### 42. Trackpad / wheel zoom speed — too fast on laptop

**Logged:** Session 24.

**Description:** Mouse-wheel zoom step is calibrated for a scroll wheel (large discrete delta per tick). On a trackpad, deltas are continuous and small but frequent — the same multiplier produces over-sensitive zoom that overshoots. Needs a delta-magnitude clamp or separate sensitivity path for trackpad events (check `e.deltaMode` and magnitude). Input polish, no geometry impact.

**Status:** Deferred — not blocking anything. Fix in a dedicated input-polish session.

---

### 43. Grade-line draw-UI clarity pass

**Logged:** Session 24.

**Description:** The toolbar text and prompt flow during grade-line draw could be clearer — what constitutes a valid line, what the snap indicators mean, and when Finish enables. Low priority; the mechanics work. Polish pass once the overall elevation workflow is stable.

**Status:** Deferred.

---

### 44. Window/door component model (shared instance identity)

**Logged:** Session 26, windows/doors Pieces 1+2 close-out.

**Description:** Today each placed opening is a dumb-duplicate rectangle — no shared identity with other openings of the same type. The component model makes openings instances of project-level shared type definitions. Capabilities:
- Project-level opening definitions store dimensions + type + frame/RO basis only. Edit a definition → prompt "edit all instances of this type" vs. "make unique."
- Cross-elevation place-from-existing picker: instead of drawing a new rectangle, pick an already-placed opening to inherit its definition.
- Definitions store NO Z and NO 3D position — instances stay 2D rectangles at page-specific pixel coords; per-instance Z is R3 / the #19 seam.
- The current dumb-placement layer (Pieces 1+2) is explicitly throwaway: it migrates into or re-places as component instances here. No legacy compatibility required.

**Why deferred:** Placement layer (Pieces 1+2) must be stable first. Component model is the logical next windows/doors session.

**Status:** Deferred. Next windows/doors session after Pieces 1+2 stable.

---

### 45. Window-as-assembly model (MAJOR)

**Logged:** Session 26, windows/doors Pieces 1+2 close-out.

**Description:** A window is an assembly, not a rectangle. A dedicated "edit" mode where dragging horizontal and vertical lines in from the unit's sides creates **mullions** subdividing it into sub-sections, each carrying independent properties (e.g. operation type per pane: fixed / casement / tilt-turn). Frame edges are first-class geometry **with width**, tracked differentially from glass. The app's job is **2D dimensional data only** — frame dimensions, glass sub-areas, overall unit dimensions. NO Z, NO 3D in this layer.

**Performance coefficients (U-value, SHGC, etc.) are downstream math computed OUTSIDE the geometry layer** — naturally as columns in an export spreadsheet. The app stores dimensions; the spreadsheet computes performance. This is NOT in-app calculation.

Feeds window schedule export (anticipated large function). Depends on #44.

**Why deferred:** Substantial standalone build; depends on #44 (component model) and on the export layer being scoped. Major future session.

**Status:** Deferred. Own planning session when #44 is stable.

---

### 46. Window-schedule import + place-from-list ("Additional" placement category) — SUPERSEDES #85
**Logged:** Session 26. **Amended:** Session 40.
**Description:** Recognize/import a window-or-door schedule and place units directly from the
imported list onto elevations — click an entry -> drop a pre-sized opening (position from
click, size/type/label/attributes pre-filled) rather than draw each. UI home: a new
"Additional" placement category beside the worklist to-place items, mirroring that UX.
Imported entries autofill label AND carry tracked performance attributes (Uw, SHGC, U-value,
R-value, glass Ug/g) that feed the F280/H2K energy model — these live in the #45 attribute
set, computed downstream as spreadsheet columns, NOT in-app calc.
**Two-stage shape (Session 40):** (1) RECOGNITION/INGESTION — PDF window package ->
structured rows; the hard, manufacturer-variable part = #28 (PDF recognition), possibly OCR.
(2) PLACEMENT — structured rows -> "Additional" queue -> pre-sized one-click drop; rides the
Session-26 openings model. The placement half can be built against a STRUCTURED input (a
schedule spreadsheet / WEW-style payload, #83) BEFORE #28 exists — first slice that decouples
the easy half from the hard half.
**Controlled-vocabulary fork:** supplier system/type names will NOT match the fixed
OPENING_TYPES five. Import must MAP supplier types onto the five or TEACH new types — settle
when scoped. The WEW reference doc's vocabularies are the example set.
**Reference material (Session 40):** WEW_Integration_Interface_Reference.docx — interface
spec for a live WEW window system: API contract (/api/quote, QuoteSubmission payload for
Client/Project/Windows/EntranceDoors/PatioDoors), controlled vocabularies, verified schedule
column map (A-Q inputs, R+ formula-driven), INTAKE cell map, performance outputs (computed
Uw/SHGC/R/RO + H2K rollup as cleanest read surface). Window packages + window spreadsheet to
be loaded to Project (not yet as of Session 40). Structured-input source for the first-slice
placement build + attribute schema.
**Cross-references:** #28 (recognition), #44 (component model — imported entry ~ component
definition), #45 (window-as-assembly + performance attributes), #83 (spreadsheet interop).
**Why deferred:** Recognition needs #28; full feature needs #44/#45. Placement-first-slice
needs a stable structured-input contract + the openings model (have it).
**Status:** Deferred. Re-surfaced + amended Session 40. Retire #85 — folded here. First
scopable slice = place-from-structured-list once a window spreadsheet/payload is loaded.

---

### 47. Top-bar snap selector: metric label fallback on no-scale page (minor polish)

**Logged:** Session 26, windows/doors Pieces 1+2 close-out.

**Description:** On a page with no scale set, the top-bar snap selector shows metric (cm) options instead of imperial because `getEffectiveScale(currentPageId)?.displayUnit` returns undefined and the selector defaults to the metric branch. Cosmetic only — the control is `disabled` when there is no scale, so no user interaction is possible. Labels resolve correctly once scale is set or borrowed.

**Why deferred:** Cosmetic only; no functional impact. Same display-format path as #20 (metric dimension-entry rework). Fix together with #20 or in a UI polish pass.

**Status:** Deferred. Bundle with #20.

---

### 48. Align/scale drag visual inversion (UX — planning required before build)

**Logged:** Session 28, B3 close-out.

**Description:** During the corner-handle scale drag in align mode (floor-reference align or elevation
align), the apparent motion is counterintuitive: the PDF background shrinks/grows while the ghost bbox
handles stay fixed. Inverting the apparent motion would make the PDF appear to hold still while the
polygon (ghost) appears to grow toward it — matching the mental model of "I'm resizing the floor plan
to fit the building."

The actual mechanism is UNCHANGED: `pageTransformsRef` (tx/ty/s) is what moves; polygon coordinates
never change (recalibration-independence invariant #22 is preserved). The visual inversion remaps how
drag-delta maps to `{tx, ty, s}` — not what is stored.

**⚠️ FLAG — NOT purely cosmetic:** This changes how the drag delta maps to `pageTransformsRef` values.
Before building, confirm the inverted mapping is still recalibration-safe (#22): the stored `{tx, ty, s}`
must remain a passive visual-only PDF transform that can be discarded without affecting stored geometry.
Needs a short planning pass to verify the math is neutral before any code change.

**Why deferred:** Mid-session observation, not blocking anything. Requires planning, not a quick visual flip.

**Status:** Deferred. Plan before build; confirm #22 compliance.

### 52. B4 render/panel — console-only derivation output

**Logged:** Session 30, B4 close-out.

**Description:** `deriveEnumeration()` outputs wall-surface classifications, soffits, and fenestration Z to the browser console only (`__dumpEnumeration`). A rendered panel or 3D wireframe display of the enumeration output was deferred.

**Status:** DONE — Session 36, Beat 1 (commit 7d939c3). "Envelope" panel added: right-side overlay calling deriveEnumeration() at render time; groups by kind (Wall Surfaces / Soffits / Windows / Doors); shows named fields per element (widths, heights, Z values, bearing, reconcile tags color-coded); no recomputation in panel (§7.3). deriveEnumeration() hoisted out of the DEV guard so it is callable from JSX. __dumpEnumeration remains as a DEV verification tool. Browser-verified: 13 elements match dump output.

---

### 53. B4 cantilever/setback UI annotation (hover label on wall edge)
**Logged:** Session 30, B4 close-out.
**Description:** Hover a wall edge on a floor-plan page → show reconcile tag (cantilever / setback / coincident) + signed distance inline. No user input required — read-only derivation display.
**Why deferred:** Needs a hover-label render pass wired into redrawFrontFaceLayer + drawEditCanvas; minor scope mid-B4. Deferred until panel/render work is active.
**Status:** Deferred. Design alongside any future derivation annotation panel.

**GATED-READY — resurfaced 2026-06-29.** #52 (enumeration panel) is done; reconcile tags
(`cantilever` / `setback` / `coincident` + signed distance) are already computed in
`deriveEnumeration` STEP A per wall edge. Cheap visible win — hover-label pass wired into
`redrawFrontFaceLayer`. Interleave when convenient; no architectural dependency.

---

### 54. B6: envelope surfaces (3D fill layer)
**Logged:** Session 31, B5 Piece 2 close-out.
**Description:** Add rendered surfaces (face meshes) to the 3D wireframe: floor decks, roof deck, wall faces, notch return, soffit fill. Needs face culling + transparency so the line wireframe stays readable underneath.
**Why deferred:** B5 (line wireframe) is the substrate the surface layer builds on. Surface rendering is presentation polish; the existing line wireframe already serves as a conflict-testable geometry substrate. Off critical path.
**Status:** Deferred. NOT cancelled. Build after critical-path project-configuration layer.

---

### 55. 3D opening-line visual verification
**Logged:** Session 31, B5 Piece 2 close-out.
**Description:** Confirm opening rectangles render correctly in the 3D view. The opening-line code path is built and dump/code-verified, but the fixture has zero openings — no visual confirmation was possible.
**Why deferred:** No test opening exists in the fixture. Place a test opening on an elevation page in a future session, then open 3D View to confirm the orange rectangle renders at the correct world XY and Z.
**Status:** DONE — Session 36, Beat 1. Storage fix (widthM/heightM/label) landed first; then placed test opening on fixture elevation page; orange rectangle confirmed visible in 3D View. First live execution of the openingLines render path.

---

### 56. 3D axis nub visibility
**Logged:** Session 31, B5 Piece 1a fix.
**Description:** AxesHelper(0.5) at world origin is not visible at the scale of the fixture (building footprint ~5–8m). The 0.5m arms are correct (they don't overshoot the building edges) but vanish at default camera distance. Minor cosmetic — could resize, offset, or recolor for visibility.
**Why deferred:** Cosmetic; no geometric impact. The fix that mattered was shrinking from 3m to 0.5m to remove the stray line; visibility is a separate polish item.
**Status:** Deferred. Low priority cosmetic pass.

---

### 57. Project Setup as a dedicated full-page form
The Session-32 config panel (ps-panel, floor-heights overlay style) is a functional stand-in. Target:
a navigable full-page form holding the complete project-configuration set (VISION_SUPPLEMENT §3/§6.4/§8.2
+ vision docs) — all fields as a real form, with autofill + derived-requirements behavior (Fork C)
rendered properly. CONFIG_FIELDS descriptor rendering already supports growing the field list without
logic changes; this is about the surface/layout, not the data model. The Required-Roles computed view +
accessors port directly into the form as one section.

---

### 58. Config field-interdependency / dependency-rule layer
**Logged:** Session 33.
**Description:** Fields constrain and drive each other across three cases: (a) utilities/energy-sources-at-site gate which equipment options are valid/offered; (b) selecting a ducted heat pump for space-heating auto-fills cooling = heat pump (not a separate user choice); (c) spawn-dedup so a shared appliance (heat pump as both heat + cool source) spawns its items ONCE, not once per triggering field. First case of cross-field rules in the §9 config layer — currently all fields are flat/independent. Upstream of the spawn engine; does NOT change placement or rendering.
**Why deferred:** Adds significant cross-field logic complexity mid-session; current flat model is correct for distinct equipment combos. Revisit when the config schema is more complete or a real cross-field case blocks a user task.
**Status (cases b + c): DONE** — Session 37 Beat 2a, commit f5553fa. `resolveEffectiveConfig` seam built; heat-pump auto-fill rule live; spawn-dedup live. See #74 (seam ready for data-driven rules) and #76 (furnace-as-air-handler, same session finding).
**Status (case a): Deferred as Beat 2b** — requires #59 (energy-source fields) and #75 (authoring prerequisite). Do not start until both are ready.

---

### 59. Utilities / energy-sources-at-site config fields
**Logged:** Session 33.
**Description:** Project-info fields capturing available fuels/utilities at the site (gas, electric, heat-pump-eligible, etc.) that feed the dependency-rule layer (#58 above) — gating which equipment options are offered. Corresponds to VISION_SUPPLEMENT §3. May fold into #58 as its data half rather than shipping as a separate build.
**Why deferred:** Dependency-rule layer (#58) must be designed first; utilities fields are input to those rules, not standalone.
**Status:** Deferred as Beat 2b; builds after #75 (authoring prerequisite) is ready. Do not start until Ben's spreadsheet is baked enough to mine for the energy-source field schema.

---

### 60. Dual-fuel space-heating option
**Logged:** Session 33.
**Description:** `space-heating = 'dual-fuel'` (ducted heat pump + gas furnace backup): spawns air-handler + outdoor-unit + furnace. A `furnace` item-type would carry its own obligations (gas line, flue/combustion-venting, condensate drain, power). Pure data addition to ITEM_TYPES + spawns — no engine change. Buildable any time after Session 33.
**Why deferred:** Out of scope for the §8.2 two-type spawns proof-of-concept. No behavior gap now; no current project uses dual-fuel.
**Status:** Deferred; data-only addition when needed.

---

### 61. Cross-trade obligation → §9 role wiring
**Logged:** Session 33. **Partially done:** Session 38 (Beat 3, commit 1aae356).
**Description:** The descriptive trade tags on run obligations ((plumber)/(electrician)/(envelope)) become real owner-role assignments tied to the §9 role model.
**What Beat 3 built:** `trades: string[]` on ITEM_TYPES obligation defs; `trade:` scalar on RUN_PAIR_MAP categories; `ownerRoles` derived at worklist time; obligation rows show the role LABEL ("Owner: HVAC Designer"). Person-name lookup (reads roleAssignments) is the remaining piece.
**Remaining:** Show the assigned person's name from `projectSetupRef.current.roleAssignments[roleId]` alongside or replacing the role label. One-line addition once the team decides the exact display order (label + name vs name only).
**Status:** Role-label display done. Person-name follow-on deferred (fork B from Session 38).

---

### 62. Floor-plan-derived bath-fan count
**Logged:** Session 33.
**Description:** The bath-fans count (currently manual numeric entry in the Project Setup panel) sourced from floor-plan room detection instead — count bathrooms/wet rooms, auto-populate the field. Same downstream quantity input to spawns, different upstream source. Layer-on, not rebuild.
**Why deferred:** Room detection requires semantic floor-plan analysis not yet built. Manual entry is correct fallback.
**Status:** Deferred.

---

### 63. Spreadsheet-derived data-flow source
**Logged:** Session 33.
**Description:** Ben has a separate spreadsheet-built project encoding input/output data flows (half-baked). Future source to mine for config schema, equipment/dependency rules, and export field mappings. Likely the AUTHORING SOURCE for the dependency-rule layer (#58) rather than a separate effort — once the spreadsheet is baked, drop into Project + run a recon session before building #58. Nothing actioned now.
**Why deferred:** Spreadsheet not ready; no action until Ben signals it's complete enough to mine.
**Status:** Deferred; flag when spreadsheet is baked.

---

### 49. Project-owned PDF persistence (web/multi-machine)
**Logged:** Session 29, fixture-PDF work.
**Description:** Once a PDF is uploaded it must live WITH the project, not as a pointer to the
machine that loaded it. The program operates web-based across many machines, so a filesystem path
is meaningless on reopen elsewhere. The PDF bytes (or a project-owned blob) travel with the project.
The fixture-PDF bundling built this session (documents[] with base64 bytes) is the dev-tooling base
case of this principle. The backdrop stays VISUAL-ONLY: its on-screen position is derived from the
stored per-page pageTransforms {tx,ty,s}, never from geometry reference points baked into the image.
Geometry truth stays in shapes + transforms; the PDF is positioned BY the transform, never the reverse.
**Why deferred:** Real project persistence (how a whole project serializes/stores web-side, how blobs
travel) is a large subsystem, part of the project-configuration/persistence layer (Vision §3). Not
pulled into the fixture fix.
**Status:** Deferred. Principle set; base case built for the dev fixture only.

### 50. Multiple PDFs per project, all referencing one wireframe
**Logged:** Session 29, fixture-PDF work.
**Description:** Eventual requirement: a project loads several separate PDFs, all applicable to the
single wireframe for reference. The project owns a SET of source documents, each with its own
page→category mapping, all composing into the one coordinate space. The fixture's documents[] is
already a keyed/array structure (one entry today) specifically so this generalizes as a layer-on,
not a tear-out (§5.3). Pairs with #49 (project-owned PDF persistence).
**Why deferred:** Today is one multi-page PDF per project. Multi-PDF is downstream of project
persistence; not now.
**Status:** Deferred. Fixture structure already accommodates it (documents[] array).

### 51. Elevation reference line: auto-seat on confirmed reference edge
**Logged:** Session 29, elevation calibration during fixture build.
**Description:** When a floor-plan edge is set as the elevation reference edge, the system knows the
true Y of that specific floor's line. On confirm, the elevation line matching that level should
AUTO-SEAT on the reference edge — no manual base-drag — because that Y is known, not eyeballed.
Currently all lines render stacked at the provisional anchor and the user must drag the base into
place by eye even when a reference edge was set. The manual base-drag (elevBaseYRef, sub-piece 2)
stays as the fallback for the no-edge-set case.
**Why deferred:** Observed mid-fixture-build, not blocking. Small targeted fix to the anchor logic.
**Status:** Deferred. Auto-seat on confirm when reference edge present; manual drag remains fallback.

---

### 64. Run-path envelope-crossing detection
**Category:** Run paths (§8.2 step 4 follow-on)
**Logged:** Session 34 (§8.2 step 4 build), fenced per spec.
**Description:** When a run path crosses the building envelope plane (e.g. an exhaust duct crossing
a wall), the system should auto-detect the crossing and either prompt for a penetration element or
auto-spawn a run representing the penetration. This is the "envelope-interaction engine" discussed
in the vision supplement — it requires run path geometry to be intersected against wall polygon
edges in world space.
**Why deferred:** Requires world-space geometry intersection engine not yet built. Sequenced after
the full run-path model is verified in the browser.
**Status:** Deferred. Do not build until run paths are complete and browser-verified.

---

### 65. Multi-hop cascade (run obligations spawning further obligations)
**Category:** Run paths (§8.2 step 4 follow-on)
**Logged:** Session 34 (§8.2 step 4 build), fenced per spec.
**Description:** A characterized run (e.g. a lineset) might spawn further obligations — e.g. a
lineset endpoint obligates a refrigerant line access panel. This is a multi-hop cascade where
satisfying one obligation creates a new one.
**Why deferred:** Requires extension to RUN_PAIR_MAP + obligation cascade engine. The current
obligation model is strictly two-sided (pair of placed items). Multi-hop is a new layer on top.
**Status:** Deferred. Keep RUN_PAIR_MAP data-additive; the engine change is self-contained.

---

### 66. Run-path slope / drops / per-vertex Z
**Category:** Run paths (§8.2 step 4 follow-on)
**Logged:** Session 34 (§8.2 step 4 build), fenced per spec.
**Description:** Real MEP runs slope (condensate drains, exhaust ducts). Per-vertex Z and slope
calculation would require either: (a) Z-entry per vertex from a cross-section page, or (b) rule-
based slope inference from endpoint elevations. Current model uses a single scalar Z from the page
level — correct for v1 horizontal runs.
**Why deferred:** No coordinate seam for per-vertex Z on plan-page geometry at this phase. R3
adds z to makeVertex; that is the correct entry point.
**Status:** Deferred to R3 / Phase 2.

---

### 67. Run-path conflict / clearance checks
**Category:** Run paths (§8.2 step 4 follow-on)
**Logged:** Session 34 (§8.2 step 4 build), fenced per spec.
**Description:** Checking whether runs conflict with structural members, other runs, or envelope
elements. Requires world-space 3D proximity engine.
**Status:** Deferred to Phase 2.

---

### 68. Run-path role-wiring (trade tags on runs)
**Category:** Run paths (§8.2 step 4 follow-on)
**Logged:** Session 34 (§8.2 step 4 build), fenced per spec.
**Description:** Associating a trade role (electrician, plumber, HVAC) with each run category,
and surfacing this in the project-setup role panel. Currently run categories appear in the
worklist but are not wired to the §9 role layer.
**Status:** Deferred. Wire RUN_PAIR_MAP.category → OUTPUT_ROLES when roles layer is extended.

---

### 69. Panel consolidation UI (worklist + floor-heights + project-setup)
**Category:** UI / panel management
**Logged:** Session 35 close-out.
**Description:** Three right-side overlay panels (worklist, floor-heights, project-setup) each
open independently via toolbar buttons. As the panel count grows they can overlap and require
explicit close discipline. A future UI pass should consolidate into a single right-side drawer
or tabbed panel, with only one open at a time. No core functionality impact — pure UI/layout
polish.
**Status:** DONE — Session 40, Beat 4. Commits 145d807 (build) + 965c386 (docs).
Consolidated the four right-side panels (Project Setup / Worklist / Floor Heights /
Envelope) into one container: accordion when narrow (stacked labels, expanded one anchors
to bottom), left-to-right tabs when wide (>=520px), drag-to-resize left edge; last-active
tab + width persist across close/reopen (session-only, see #86). Adaptive task-layer
version = #84.

---

### 70. Display-scale option for small solids (§8.3 Build 2)
**Category:** 3D view / solids
**Logged:** Session 35 (§8.3 Build 2 browser verify).
**Description:** The lineset tube (radiusM=0.0125, ~1") is geometrically correct but reads as
near-hairline against a multi-metre building envelope. The honest base-case placeholder must
NOT be inflated to improve legibility. A future option could offer a "display scale" multiplier
for solid geometry (e.g. 3× visual for thin tubes) that is clearly labelled as non-dimensional
and does not affect derived quantities. Requires planning pass on where the multiplier lives
(profile table vs. ThreeDView render param) and whether it persists across sessions.
**Status:** Deferred. Legibility-by-fake-dimension is a planning decision, not a code fix.

---

### 71. Duct category has a profile but no run currently resolves to 'duct'
**Category:** Run paths / profile table
**Logged:** Session 35 (§8.3 Build 2 close-out).
**Description:** `SEGMENT_PROFILES` contains a duct entry (`sweep:'extrude-rect', widthM:0.150,
heightM:0.150`) as deliberate forward-proofing. No entry in `RUN_PAIR_MAP` currently maps any
pair to `category:'duct'`, so the duct profile is never read. When a duct run type is added
to RUN_PAIR_MAP (one new row, no engine change per principle 5.3), the duct solid will render
automatically. No code change needed at that point for the profile itself.
**Status:** Forward-proofed. Track as a reminder that the duct solid profile exists and is
ready when the pair-map entry is authored.

---

### 72. Multiple loadable DEV fixtures (fixture picker)
**Category:** DEV tooling / testing
**Logged:** Session 36.
**Description:** Today there is ONE dev fixture (one do-everything scenario, restored via
`__restoreFixture` / snapshotted via `__snapshotFixture`, bundled PDF in `documents[]`). As the
feature set grows, the single fixture both mutates to test new features AND serves as the
regression scenario for old ones — a tension. Target: multiple named fixtures (e.g. minimal
"openings", "runs", full "everything"), each the smallest scenario that exercises its feature,
selectable from the DEV strip. DATA LAYER IS ALREADY THERE: snapshots are plain JSON and the
bundled-PDF structure is already a `documents[]` array (built that way per #50 so multi-doc
generalizes as a layer-on). What's missing is only the UI/UX: the LOAD FIXTURE button becomes a
picker; decisions needed on where fixtures are stored/named, and whether they ship in-repo or
stay local (current single fixture PDF is gitignored).
**Why deferred:** Not needed for Beat 1 — an opening can be added to the existing fixture
additively and re-snapshotted without disturbing the run/slot scenario. Building a picker now
solves a problem not yet felt, at the cost of delaying visible payoff.
**Revisit trigger:** If a build's recon shows the single fixture genuinely cannot host a new
test scenario without disturbing an existing one (Beat 1 recon A5 is the first check). That is
real evidence the single-fixture model is binding; reprioritize then with a concrete reason.
**Status:** Deferred; data layer ready, picker UI is the build.

---

### 73. Platform infrastructure — auth, profiles, project persistence (the "expected SaaS stuff")
**Category:** Platform / persistence (Vision §3)
**Logged:** Session 36.
**Description:** The program will eventually need the standard web-app substrate: user login/auth,
a user profile with saved settings/preferences, and PROJECTS that persist server-side and can be
recalled across sessions and machines. This is the large subsystem implied by VISION_SUPPLEMENT
§3 (project-configuration layer) and already partially anticipated by #49 (project-owned PDF
persistence — PDF bytes travel WITH the project, not as a machine-local path) and #50 (multiple
PDFs per project). Currently ALL state is in-memory only, lost on reload; git-on-origin is the
ONLY durability and it's developer-facing, not user-facing. This entry is the umbrella for the
whole persistence/identity layer; #49 and #50 are sub-pieces of it.
**Why deferred:** This is a Phase-2+ subsystem (backend, storage, identity) orthogonal to the
geometry/modeling work that is the current focus. The geometry model is being built deliberately
in a serialization-friendly way (refs are plain data, snapshots are JSON) so the persistence layer
is a layer-on, not a rebuild — which is exactly why it can safely wait.
**Planning notes captured (Session 36, to expand):** serialization-readiness of the current data
model is the key precondition and is being maintained; the snapshot/restore machinery is the local
proof-of-concept of project serialize/deserialize; auth+profile is conventional and low-architectural-
risk; the interesting design question is how a project's full state (geometry + transforms + config +
PDF bytes) packages and travels — see #49/#50.
**Status:** Deferred to Phase 2+. Umbrella entry; keep the data model serialization-friendly meanwhile.

---

### 74. Data-driven dependency-rule layer (replaces hand-authored CONFIG_CROSS_FIELD_RULES contents)
**Logged:** Session 37.
**Description:** The `CONFIG_CROSS_FIELD_RULES` array inside `resolveEffectiveConfig` is currently hand-authored — one rule today (heat-pump-ducted implies cooling). When the rule set grows (case a gating from #58, plus future equipment interdependencies), the rule authoring becomes unwieldy as raw JS. This entry covers replacing the CONTENTS of `CONFIG_CROSS_FIELD_RULES` with a data-driven layer: rules described as structured data (e.g. JSON/config, drawn from Ben's spreadsheet project per #63), parsed into the same `{id, when, apply}` shape at load time. The seam (`resolveEffectiveConfig` + `CONFIG_CROSS_FIELD_RULES`) is already built and correct — only the rule contents change; consumers are untouched.
**Why deferred:** One rule doesn't justify the machinery. Build the data layer when the rule count makes hand-authoring painful, or when #63 (spreadsheet-derived data-flow source) is ready to mine.
**Status:** Deferred; seam is built (Session 37 f5553fa). Ready to receive data-driven rules when authored.

---

### 75. Authoring prerequisite — config schema from Ben's spreadsheet (#63 readiness gate)
**Logged:** Session 37.
**Description:** Beat 2b (option-gating, #58 case a + #59) must not start until Ben's spreadsheet project (#63) is baked enough to mine for the energy-source field schema and gating rules. This is the authoring prerequisite: if the rule set is designed before the source-of-truth data exists, it will be redesigned when the spreadsheet lands. The correct sequence is: spreadsheet ready → recon session → Beat 2b. This entry tracks that gate.
**Why deferred:** Spreadsheet not yet ready (as of Session 37).
**Status:** Deferred; unblocks Beat 2b when ready. Ben to signal when the spreadsheet is baked.

---

### 76. Furnace is an air handler — air-handling role shared across heat-source equipment
**Logged:** Session 37 (side finding during Beat 2a).
**Description:** A gas furnace is itself an air handler — it provides the air distribution function. Under the current model, `furnace-gas` for space-heating spawns nothing (no air-handler, no outdoor-unit), while `heat-pump-ducted` spawns both. This is incomplete: a gas furnace project still needs an air handler (the furnace IS the air handler) and the obligation model should reflect that. Full treatment: furnace-gas spawns a `furnace` item-type with its own obligations (gas line, flue/combustion-venting, condensate drain, power); the air-distribution role is recognized as shared across equipment types. Pairs with #60 (dual-fuel, which explicitly requires furnace + heat-pump outdoor-unit), and with #74 (data-driven rules, which is the long-term home for equipment-topology logic).
**Why deferred:** Equipment-topology nuance; Beat 2a's current behavior (air-handler spawns for heat-pump only) is incomplete-but-not-wrong as a cross-field-rules proof. Deferred to a dedicated equipment-setup session.
**Status:** Deferred; pairs with #60 and #74.

---

### 77. Worklist classification / suggest-revision routing / registered-interest acknowledgment
**Logged:** Session 38 scope boundary.
**Description:** Downstream routing from obligation state: when an obligation is unresolvable (e.g. conflicting trades, envelope penetration needs design decision), route it to a classification queue or generate a "suggest revision" flag to the appropriate role. Registered-interest acknowledgment: once a role-holder acknowledges an obligation row, record the acknowledgment so it drops off the worklist for that role. Full coordination/buy-in story; requires the trade→role wiring (Beat 3) as prerequisite.
**Why deferred:** Beat 3 built the structural wiring. Routing and acknowledgment are the next coordination layer.
**Status:** Deferred; Beat 3 prerequisite done.

---

### 78. Envelope role gap — vent-to-exterior and exterior-vent obligations unowned
**Logged:** Session 38 (Beat 3 D3 finding).
**Description:** Two obligations — `vent-to-exterior` on bath-fan and `exterior-vent` on HRV/ERV — carry the parenthetical "(envelope)" in their label, indicating they involve a building-envelope penetration. ROLE_LABELS has no "envelope" or "general contractor" role today, so both obligations resolve to `trades: []` and display "Owner: unassigned" in the worklist. Options: (a) add an 'envelope' or 'contractor' role to ROLE_LABELS and reclassify; (b) map envelope work to 'designer' (who specifies penetration details); (c) leave unassigned and treat as a reminder for the designer to coordinate. Decision requires input on who in the BC residential workflow owns envelope-penetration specifications.
**Why deferred:** D3 rule — no role invented; gap reported. Requires product decision on role vocabulary.
**Status:** RESOLVED THROUGH #79 (Session 39). These obligations ARE penetrations (a bath-fan vent / HRV exterior-vent crossing the envelope). They carry responsible-party SCOPES derived by the penetration rules (exterior-cladding always; framing-blocking if backing required; air-barrier-continuity if poly interaction), resolved to a named party via #81. No standalone "envelope" role is invented. Remains "unassigned" in the worklist until #79 builds.

---

## Session 36 repositioning notes (sequencing decisions — see BUILD_ROADMAP "SEQUENCED TRACK TO PHASE 2")

- **#52 (enumeration render) PULLED FORWARD into Beat 1**, paired with #55. Rationale: it is
  not really "future" — it is the visible half of an already-built, already-verified feature
  (deriveEnumeration is console-only via __dumpEnumeration). Leaving it deferred is what created
  the owner's "where did the geometry output go" confusion. Outsized weight relative to its size:
  converts a finished-but-invisible subsystem into something visible and trustable. Ship a dumb
  v1 list first; sorting/grouping is later polish.
- **#55 (3D opening visual verification) PULLED FORWARD into Beat 1**, paired with #52. Placing
  one test opening fires both the 3D opening-render path and the enumeration fenestration branch
  on real data for the first time. Double duty, smallest item with a visible payoff.
- **#69 (panel consolidation) DONE — Session 40, commit 145d807.** Four independent panels →
  one tabbed side-panel container with narrow (accordion) / wide (horizontal tabs) modes and
  drag-to-resize. Cross-session width persistence deferred pending a storage decision.
- **§7.3 named-derived-quantity discipline flagged as VIGILANCE at Beat 1**: the enumeration panel
  is the first non-renderer consumer of derived quantities. Not a build to pull forward — a rule
  to honor at the exact session it first pays. Confirm quantities read from one named function per
  element, never recomputed in panel code.

---

- [ ] After this chat's goal is complete (`BUILD_ROADMAP.md` Step 4 done) — quick pass
      to see if any entries are now small enough to fold into a dedicated polish
      session before moving to floor-by-floor work.
- [ ] Final review once Phase 1's toolkit is fully built and tested against real plan
      sets — use this list deliberately to chase down edge cases, rather than
      reactively mid-feature.

---

### 79. Envelope penetration subsystem — rule-generated coded detail + derived trade-plan-set export (FOUNDING-PRINCIPLE ANCHOR; architecture settled Session 39)
**Category:** Envelope / DPM / export layers / program architecture (Vision §6 export, lines 213–219, 257; §5.3)
**Logged:** Session 38. **Architecture settled:** Session 39 (intensive planning, no build).

**ENTITY MODEL (settled):**
- **Penetration** — a DERIVED entity, not authored. Two sources, one unified entity, origin-blind downstream: `source: 'run' | 'item'`. Run-sourced = a 3D run-spine crossing an envelope plane (intersection point IS the location, spine-vs-plane). Item-sourced = a placed item declared to penetrate (its point-spine supplies the location). Stores location (X/Y/Z) + the set of crossings.
- **Crossing** — one (penetration × assembly-plane × layer) tuple. Carries which layer + `exposure: 'interior' | 'exterior'`. Planes exist as both interior and exterior; some penetrations cross interior-only, some cross both. Interior+exterior modelled together from the start (not exterior-first).
- **Detail** — ONE coordinated coded detail per penetration (NOT one-per-layer; NOT one-per-trade). Per-layer treatments are FACETS within the single detail. One detail on the plan.
- **Three-way derivation:** detail code = (assembly parameters: which layers exist & what they are) × (project-wide envelope settings: WRB type, air-barrier strategy, cladding type, penetration treatment) × (the interacting item: duct/pipe/etc, type & size). None of the three stores the detail; it is computed through the rule seam (§5.1).
- **Generic tier is the base; supplier is refinement.** The detail resolves first to generic parameters ("exterior membrane WRB — loose" vs "self-adhered", "interior air/vapour control — poly"). Fully valid and complete with NO supplier. Supplier selection (SIGA-style) is an OPTIONAL layer resolving the generic type to specific products + order sheet. Supplier integration is NEVER a prerequisite (§5.3).
- **Detail RESIDES ON THE ASSEMBLY as an area-occupying sub-region** (like a specialised assembly-zone, §6.4 discipline): distinct identity, derived at read-time, host assembly NEVER fragmented (§5.1.2, §6.2/#19). Carries two stored-now / consumer-deferred slots: (a) **occupied area** (will net against / sub-divide envelope-area outputs — integration deferred); (b) **thermal-bridge value** (building-understanding metric, deferred quantification; explicitly NOT a compliance / H2K / F280 feed — it is more advanced than those require).

**FACETS & RESPONSIBLE PARTY (settled):**
- Each per-layer facet carries a **responsible party** — born holding a responsibility SCOPE at detail-generation (e.g. air-barrier-continuity, exterior-cladding, framing-blocking), resolved DOWNSTREAM to a named party via the project trade-assignment map. ONE slot: starts as scope, ends as person. Term is "responsible party" (not "person" — there is no person at birth; not "role").
- Facet also carries material-category + the plan-amendment it generates (e.g. blocking note → framing plan).
- Penetration rules emit responsible-party SCOPES only; they NEVER reference concrete roles/people. The trade→responsible-party→person resolution is a separate model (see #81). NO ROLE_LABELS edit happens in the #79 build.

**RULE ENGINE (settled):**
- **`PENETRATION_DETAIL_RULES`** — a DISTINCT rule engine, separate schema from Beat 2a's `CONFIG_CROSS_FIELD_RULES`. Reads the three-way combine; OUTPUT is an AUTOFILL GENERATOR producing a complete, PREFILLED, EDITABLE coded detail (per-layer facets w/ responsible-party scope + material-category + plan-amendment). User edits properties on the generated result.
- Shares #74's data-source + authoring pipeline (spreadsheet #63, parsed at load) but sits BESIDE CONFIG_CROSS_FIELD_RULES as a second rule type, not inside it. Forcing the three-way-combine-in / coded-detail-out shape into the flat `{when, apply}` config schema would be a §5.3 tear-out.
- **Auto-prompt is parameter-completeness-driven, NOT crossing-driven.** If project parameters fully define the detail → resolves silently, complete. If underspecified (e.g. supplier unset, an open gasket choice) → auto-prompt fires with a prefill to confirm or a final selection to make (§5.2: geometry+params propose, deliberate input is authoritative, prompt is the correction surface only when needed).

**EXPORT — TRADE-SPECIFIC PLAN SET (settled):**
- A trade-plan-set is a PURELY DERIVED projection (§5.4): filter detail facets by responsible party + a layer selection, at export time. NO stored authored "plan set" artifact (would drift from the model). Customizability layer-on: a useful filter may be SAVED as a named filter spec (stores the filter only, never the rendered set) — same pattern as the reference-override picker.
- Envelope details affect EVERY trade, so this layer touches all of them — the clearest demonstration of the architecture thesis: clean data structure → outputs scale per layer added.
- **Penetration register + QR:** QR = Quick Response code. QR is PER-PENETRATION — each detail on the exported paper plan carries its own QR linking to its register entry. The register entry behind the QR holds the spec, materials, and supplier order line if resolved, AND a VIDEO of how that specific coded detail is accomplished (install method), playable on the device when scanned off the paper plan. The penetrations PAGE is the index. Per-penetration makes per-page a free layer-on (Vision §6 + the penetration-register/video-link model, lines 213–219, 257).
- **Interior/exterior output split is a FUTURE read-time division** — a later parse separating the interior detail from the exterior for output. NOT a decision now and NOT a reason to fragment the stored single detail.

**Dependencies / build gate:** #74 (data-driven rule layer — home for the rules) and #75 (spreadsheet authoring pass) are PREREQUISITES. #79 build does NOT start until both are ready. Spun-off subsystems: #80 (supplier-catalogue integration), #81 (trade-assignment model), #82 (thermal-bridge quantification). Beat 3's `ownerRoles` is the substrate the responsible-party resolution extends. The DPM (penetration spawns obligations exactly as equipment placement does). Vision §6 export model.
**Status:** ARCHITECTURE SETTLED (Session 39) — still DO NOT BUILD; gated on #74 + #75. The build prompt is written when #74/#75 unblock, not before.

---

### 80. Supplier-catalogue integration — detail-type → product + order-sheet resolution
**Category:** Envelope / supplier / export. **Logged:** Session 39 (spun off #79).
**Description:** Optional refinement layer over the generic penetration-detail tier (#79). A supplier (e.g. SIGA) has its product catalogue designed into the system; selecting that supplier autopopulates the generic detail-types with specific products AND a prefilled order sheet. Envelope-area outputs link to the same quantities. The detail stores a generic detail-TYPE + parameters, never a product; the supplier catalogue is an INTERPRETER (§6.9 pattern) resolving type → SKU + quantity + order line. Generic tier is fully functional without any supplier (§5.3 base case).
**Why deferred:** Large self-contained subsystem (catalogue ingestion, per-supplier product mapping, order-sheet generation). #79 designs the seam (detail-type, never product); the catalogue builds later.
**Status:** Deferred; seam designed in #79.

---

### 81. Trade → responsible-party → person assignment model (many-to-many, parameter-derived)
**Category:** Roles / DPM / project config. **Logged:** Session 39 (spun off #79; full realization of Beat 3 Fork B).
**Description:** Roles are derived from TRADE, not authored as a fixed ROLE_LABELS list. Many-to-many: one team member may hold several responsible-party scopes (e.g. builder = framer + air-barrier + exterior-cladding); one scope may split across people. WHICH trade fulfills a given responsibility is itself PARAMETER-DERIVED, not fixed: "exterior cladding" may resolve to a mason, stucco crew, or carpentry crew per the project's cladding-type parameter. Model = (a) a responsibility-scope vocabulary the rules emit; (b) a project-level trade-assignment map (scope → trade/member, many-to-many); (c) read-time resolution: obligation's responsibility-scope × project assignment → owner; person-name is the last hop. Obligations NEVER store who — they store the required scope. Extends Beat 3's derived `ownerRoles` + the deferred person-name lookup (Fork B).
**Why deferred:** Separate definition exercise; the scope vocabulary + assignment-map UI + parameter-driven trade resolution are their own build. #79 emits responsibility SCOPES only and references no concrete roles/people, so #79 is unblocked by this being deferred.
**Status:** Deferred; #79 emits the scope primitive this model later resolves.

---

### 82. Thermal-bridge quantification at penetrations (advanced building-understanding)
**Category:** Envelope / analysis. **Logged:** Session 39 (spun off #79).
**Description:** A penetration detail occupies area of an assembly and is a thermal bridge with a heat-loss value. #79 stores the thermal-bridge SLOT on the detail now; this entry covers the quantification + the analysis output that consumes it (significant thermal bridges across the building). Explicitly NOT a code-compliance path: more advanced than H2K / F280 require; insignificant for compliance, significant for overall building thermal understanding.
**Why deferred:** Property residence exists from #79 (§5.3); the calculation + advanced-analysis consumer build later. Not on any compliance interpreter.
**Status:** Deferred; slot stored in #79, no compliance dependency.

---

### 83. Spreadsheet output / form-autofill — Collabinator data -> existing client spreadsheets & overall project sheet
**Category:** Export / projection / interop. **Logged:** Session 40.
**Description:** Collabinator's coordinated data model is the source; spreadsheets are an
OUTPUT target. Ben already uses client spreadsheets/forms holding client data, window
information, geometry, and some reusable pages. Two flavors, same direction (app -> sheet):
(a) autofill Collabinator-derived data into Ben's existing per-form spreadsheets;
(b) preferred — autofill into a single overall PROJECT spreadsheet that the per-forms
project from. Pure derived projection (same family as the #79 trade-plan-set export and #80
order-sheet), NOT a data source to mine and NOT the #75 rule-authoring gate — flow is
app->sheet, not sheet->rules.
**Why deferred:** Export subsystem; needs the data model populated first (Phase 2+). Keep
derived data projection-friendly meanwhile. Distinct from #80 (supplier order-sheet) — this
is general form/field autofill into Ben's own templates.
**Status:** Deferred; builds as a projection once the data model is populated.

---

### 84. Adaptive task-layer-aware sidebar (UX layer over #69 tabbed shell)
**Category:** UI / UX / panel management. **Logged:** Session 40.
**Description:** Refinement on top of the #69 consolidated sidebar. The static shell (#69)
gives stacked tabs / wide-mode tab row + resize. This entry makes it adaptive: the sidebar
reads the TASK LAYER the user is in and auto-organizes — promoting the relevant panel,
filling remaining space with the next-most-likely tool for that layer, whole panel scrolling.
Needs two concepts the app lacks: (a) a "current task layer" the UI can consume; (b) a
tool-likelihood ranking per layer. Layers ON the #69 shell; does not change its bones.
**Why deferred:** Two new subsystems beyond a layout pass. #69 is the honest base case; the
adaptive logic sits on it without rework.
**Status:** Deferred; explore after #69 shell is in real use.

---

### 85. SUPERSEDED by #46 (Session 40).

---

### 86. Cross-session UI-preference persistence (sidebar width, active tab, panel state)
**Category:** Persistence / UI. **Logged:** Session 40.
**Description:** The #69 sidebar width + active tab persist across close/reopen within a
session but reset on reload — the app has NO localStorage/sessionStorage; nothing survives
reload (the dev fixture doesn't either). This covers cross-session persistence of UI prefs.
Deliberately NOT solved at #69 time: bolting localStorage onto one width slider ahead of a
real persistence decision is a precedent that pairs with project save/load (#48-family) and
would be half-torn-out. Decide as a subsystem — what persists, where, alongside project
serialization.
**Why deferred:** Architecture decision (pairs with #48), not UI polish. Session-only width
is the honest base case.
**Status:** Deferred; decide alongside project save/load.

---

### 87. Whole-envelope closure invariant
**Category:** Derivation / Validation. **Logged:** Session 41 (area slice).
**Description:** Sum of ALL envelope sub-areas (walls, roof planes, floors-over-unheated,
party walls, openings, penetrations) should equal the total building-envelope area —
gap-free and overlap-free. This is the completeness check that proves the enumeration is
accounting for every surface metre. Session 41 built only the per-wall-surface partition
(gross = net + openings); the whole-envelope invariant is gated on surface kinds that don't
exist yet: roof-plane area, floor-over-unheated area, party walls, rim/band areas.
**Why deferred:** Missing surface kinds (roof plane, exposed floor, party wall) must exist
before the sum is meaningful. Building a partial sum and calling it "closure" would be
misleading.
**Status:** Deferred; revisit after roof-plane and floor-over-unheated area surfaces are added.

---

### 88. Multi-story elevation opening association
**Category:** Derivation / Association. **Logged:** Session 41 (area slice).
**Description:** Openings on a multi-story elevation page are currently all associated with
the single floor-plan wall segment used as the elevation's reference edge (the segment set
via "Set elevation edge"). In a multi-story building, a window at the 2nd-floor Z level
should ideally associate with a 2nd-floor wall surface, not the Main Floor reference edge
segment. Fixing this requires either (a) per-opening Z-based floor-level lookup against
the full wall-surface set for that elevation's orientation, or (b) a multi-level elevation
geometry model where each floor gets its own reference edge.
**Why deferred:** Current fixture has single-story data only; the limitation has no visible
impact yet. The association model used today (one reference edge per elevation page) is the
only unambiguous per-segment join available in the current data model.
**Status:** Deferred; address when a multi-story fixture exposes the limitation.

---

### 89. Ghost start-vertex snap does not fire on upper-floor trace — RESOLVED: MISSING NICETY
**Category:** Snap / Multi-floor tracing. **Logged:** Session 42. **Resolved:** Session 51 (runtime recon, code-only triage).
**Cross-references:** #13 (ghost vertices as opt-in snap targets), #34 (getVisibleVertices gap note).

**Description:** When tracing a new shape on an upper-floor page while the floor-below ghost is visible, the start-vertex snap (red highlight + exact coincident placement) does NOT fire on ghost vertices — not even the "snap suggestion" UX fires.

**Triage verdict (Session 51 — NOT a bug):**

Code evidence:
- `getVisibleVertices` (`App.jsx:919`) filters `completedShapesRef` by `s.pageId === pageId` — current page only. Ghost source shapes live under a different `pageId` and are never included. `drawStartSnapRef` is fed exclusively from this function (`App.jsx:2540`), so the red-ring snap cannot fire on ghost corners. Confirmed.
- `drawGhostShapes` (`canvasRenderer.js:158`) renders ghost vertex coordinates (`v.x, v.y`) directly into the shared canvas-world context with no transform applied. Ghost geometry occupies identical pixel positions in the same coordinate space as the upper-floor tracing canvas.
- `snapToGrid` (`App.jsx:813–824`) on the upper-floor page resolves scale via `getEffectiveScale` → `pageRefParentRef` chain → ghost source's calibrated `pxPerMeter` (same scale). Grid origin: `pageGridOriginRef.current[pageId] || {x:0, y:0}` — both the upper-floor page and the ghost source page default to `{x:0, y:0}` (calibration confirm deletes/resets the entry). Same origin + same scale + same snap pitch = the upper-floor snap grid is **identical** to the grid on which the ghost source shapes were originally traced.
- Ghost corners are therefore grid-aligned by construction — they sat on grid intersections when traced, and those intersections exist at the same pixel positions on the upper floor's grid.

Conclusion: the user CAN place a start vertex exactly coincident with a ghost corner via grid-snap at adequate zoom. The only gap is visual: no red-ring confirmation that the correct grid point was targeted, so at low zoom a nearby grid point could win instead of the intended ghost corner. Correctness is fine; this is a usability convenience gap only.

**Resolution:** Folded into #13/#34 as originally deferred. Ghost-vertex start-snap (red-ring highlight on ghost corners) is the #13/#34 enhancement — a visual confirmation aid, not a correctness fix. Multi-floor tracing is NOT blocked by this.

**Status:** RESOLVED — MISSING NICETY. Deferred enhancement tracked under #13/#34. No standalone fix needed.

---

### 90. Replicate previous floor's shape as the starting point for the next floor
**Category:** Multi-floor tracing / UX. **Logged:** Session 42.

**Description:** An option to directly copy the traced polygon from the floor-below reference (the ghost) into the current page as an editable locked shape — bypassing the trace-from-scratch workflow for floors where the building outline is substantially unchanged (setbacks, simple additions aside). The user would invoke "Start from floor below," get the ghost's polygon locked onto the current page, then drag-edit or add/delete vertices for the specific differences on this level.

**Relationship to existing features:** This is distinct from the visual ghost (read-only reference) and from the "Align to floor below" mechanic (which moves the PDF backdrop). It is a DATA COPY — the floor-below polygon arrives as real geometry on the current page, eligible for all Edit Shapes operations.

**Open questions:** (a) What happens if the ghost source has multiple shapes — copy all, or let the user pick? (b) Does the copy arrive as already-confirmed (locked) or as a reviewing polygon requiring confirm? (c) How does this interact with the scale-borrow model — if the upper floor borrows scale from below, does the pixel-copied polygon land at the correct real-world dimensions automatically? (Yes, because pixels are stored and the scale is shared via borrow.)

**Why deferred:** Tracing from scratch against the ghost is the current workflow and works. This is an acceleration feature for the common case of similar floorplates, not a correctness fix. Requires design resolution on the above open questions before building.

**Status:** Deferred. Design pass needed; build when multi-floor workflow testing shows it is a real friction point.

---

### 91. Roof draw page: multiple shapes required (currently single-shape only)
**Category:** Roof plan tracing / Data model. **Logged:** Session 42.

**Description:** The current roof-plan tracing workflow assumes ONE closed polygon per roof page (the outer perimeter). Real roof plans routinely include multiple distinct polygons — e.g. a main roof perimeter AND a separate garage roof perimeter, or a complex multi-section roof with distinct polygons for each hip. The flat/sloped type picker, parapet width, and role-assignment mode all operate on a single shape.

**What breaks with multiple shapes today:** After locking the first roof polygon, the section picker and parapet input appear. Locking a second polygon on the same page likely hits the same UI path and either overwrites or orphans the first shape's metadata. The `roofGraphRef` is shared across the page (not per-shape), which is correct, but the polygon-level metadata (`roofType`, `parapetWidth`, `lineRoles`) is stored on the shape object — so multiple shapes SHOULD work at the data level but the UI flow probably does not handle the "which shape are you picking a type for?" decision cleanly.

**What is needed:** (a) Verify whether locking a second shape on a roof page silently breaks anything (runtime check — do not assume from static read). (b) If broken, extend the post-close type-picker to target the JUST-CLOSED shape by index, not a shared state variable. (c) Role assignment mode must support per-shape scope (currently it operates on all shapes on the page).

**Why deferred:** Single-shape roof plans are the common case for simple residential; the limitation is not blocking current sessions. But any real hip/valley roof on a non-trivial plan will have multiple polygons.

**Status:** Deferred; triage (a) as a runtime check before the next session that involves a multi-section roof plan.

---

### 92. Elevation reference edge rotation + multi-elevation assignment per page
**Category:** Elevation calibration / page model. **Logged:** Session 42.
**Cross-reference:** #5 (multi-classification per page — broader; this is elevation-specific and distinct).

**Description:** Two related elevation-specific items:

**(a) Reference edge visual rotation:** The reference edge shown as a ghost on an elevation page represents the floor-plan wall that the elevation faces. On plan, this edge may run at an angle (non-axis-aligned building). On the elevation page, it should visually rotate to appear horizontal — the elevation view IS a head-on view of that edge, so by definition the edge is horizontal in the elevation frame. Today the ghost edge is drawn in its plan-page orientation, which can be confusing. This is a VISUAL-ONLY transform scoped to the elevation rendering path; it does not affect stored geometry, stored pixel coordinates, or the `pxPerMeter` derivation.

**(b) Multiple elevation assignments on one page:** A single PDF page may carry more than one elevation drawing (e.g. West Elevation and East Elevation side-by-side on the same sheet). Today `elevationEdgeRef` stores one reference edge per elevation page. To support two elevations on one page, either: (i) a page carries TWO `elevationEdgeRef` entries (multi-entry map), each with its own reference edge, align transform, and base Y; or (ii) the duplicate-page mechanic (#3) creates two logical pages from one PDF page, each independently set up. Option (ii) is already designed; option (i) is a data-model extension.

**Relationship to #5:** Entry #5 covers the general multi-classification-per-page problem (any mix of drawing types). This entry is scoped to the specific elevation case (two elevations on one sheet) and the reference-edge rotation affordance unique to elevations. Do NOT merge into #5; the elevation-specific mechanics (reference edge, align transform, base Y) need their own targeted design.

**Why deferred:** Single-elevation-per-page is the common case. The reference-edge rotation is a visual polish item. Multi-elevation-per-page is an edge case until a real plan set with that layout appears.

**Status:** Deferred. (a) is a targeted visual-polish fix; (b) depends on a design decision between option (i) and option (ii). Revisit when a real multi-elevation sheet appears in testing.

---

### 93. Opening-edge dimension labels intercept drag-to-resize in Edit mode

**Category:** UI / Edit Shapes / Windows-Doors. **Logged:** Session 43.

**Description:** Dimension labels rendered on opening (window/door) edges in Edit Shapes mode
intercept the pointer hit-test for segment drag. Because the label sits visually on the edge,
the click target is the label hit area rather than the underlying segment, blocking
drag-to-resize. The user cannot reliably drag an opening edge to resize it in the area
covered by the label.

**Resolution:** Click-to-edit-label removed entirely (not just reordered). `hitTestLabels`,
`commitLabelEdit`, `labelEditState`, `parseDisplayDistInput` import, the `labelClick` mousedown/
mouseup branches, Escape handler, and label-edit-overlay JSX all removed. The label-override
resize fallback noted in the original entry no longer exists. Segment drag now wins on any
click in the label area. `segLabelRectsRef` population left intact (renders labels visually;
now a populated-but-unread dead ref — intentional). Browser-verified: click-drag on a
dimension label in Edit Shapes starts segment drag with no text input appearing.

**Status:** RESOLVED — Session 55, commit 27257b9.

---

### 94. Openings render on wrong side of wall in 3D View — RESOLVED (Session 44; commit 8fe8ba7)

**Category:** 3D View / Derivation geometry. **Logged:** Session 43. **Resolved:** Session 44.

**Root cause (derivation bug):** The `hOffsetM` formula in `deriveWireframe` used a scalar
canvas-X offset `(centX − midPxX) / pxPerMeter`. This is correct only when the reference edge
is traced left-to-right (dirX = +1). When the edge is traced right-to-left (dirX = −1), the
sign is wrong and every opening mirrors to the wrong end of the wall — landing at exactly
`2 × midpoint − correct position`.

**Fix (8fe8ba7):** Replaced the scalar offset with a proper vector projection of the 2D canvas
offset vector `(centX − midPxX, centY − midPxY)` onto the A→B canvas direction vector, normalised
by the edge length in pixels. This produces a signed scalar in the A→B direction that is correct
for any edge orientation including diagonal edges.

**Verification:** `__verifyFixture()` 15/15 PASS (area/assembly arithmetic unaffected). Opening
center world-X: window 1.1557 m, door 2.2606 m (were 7.2263 m / 6.1214 m). Ben visual confirm
in 3D View — both openings sit in the wall plane at the correct end.

### 95. Angled-elevation-edge opening placement — fixture coverage gap

**Category:** 3D View / Derivation geometry. **Logged:** Session 44.

**Description:** The vector-projection formula introduced in commit 8fe8ba7 (fix #94) handles
diagonal reference edges by construction — the dot-product projection onto the A→B canvas
direction works for any orientation. However, the only fixture in the repository uses a
horizontal reference edge (the north wall of the Main Floor polygon, traced left-to-right),
so the angled-edge code path has never been exercised against a real case.

**What to do when convenient:** Build a fixture where the elevation reference edge is diagonal
(e.g. a plan polygon with an angled wall and an opening placed on its elevation page), run
`__dumpWireframe()` and `__verifyFixture()` to confirm the opening center lands at the
expected world position. If a discrepancy is found, it would indicate a further sign or
normalisation issue in the projection formula.

**Priority:** Low — axis-aligned walls are the standard residential case; diagonal reference
edges are unusual. Not blocking any current track.

**Status:** Open — deferred, not cancelled.

---

### 96. Wall corner reconciliation — solid interpenetration + inside-face area overcount

**Category:** 3D geometry / Derivation accuracy. **Logged:** Session 46 (surfaced during 3D-thickness slice review).

**Description:**

Each wall panel is generated independently from its own traced edge, offset inward by
`totalThicknessM` along its own edge normal. There is currently NO corner-condition logic — no
miter, no junction reconciliation, no shared-corner ownership between adjacent walls. This has
two distinct consequences:

**(1) 3D solid interpenetration (cosmetic, today).** Two walls meeting at a corner each grow
their full thickness inward, so the two solids occupy the same wedge of space at the corner —
the rendered panels visibly interpenetrate. Render-only today; corrupts no data because the
solids are not measured.

**(2) Inside-face area overcount (affects F280 accuracy).** `insideFaceAreaM2` is computed
per-edge: each wall's inside face runs to the traced (outside) corner point and offsets inward
by its own thickness, independently. The true interior face of a wall stops where it meets the
adjacent wall's interior face — NOT at the projected outside corner. So per-edge inside-face
lengths are each measured slightly long at every corner, and inside-face areas systematically
**overcount**. The error is small per corner (≈ wall thickness × height × number of corners)
and always in the same direction (over, never under).

**Decision / Status:**

Overcount ACCEPTED for the first F280 pass. F280 is a design heat-loss calculation whose own
tolerance is expected to swamp a few-corner thickness overcount; the priority is a working
end-to-end heat-loss number that can be sanity-checked against reality before investing in
corner geometry. Corner reconciliation is deferred to an ACCURACY-REFINEMENT slice to be
scheduled once F280 output is visible and the real-world significance of the error can be judged.

When built, the reconciliation slice must decide, at each corner, which wall "owns" the corner
length (or how the shared length is split) so that inside-face lengths sum correctly — the
inside-face equivalent of mitering. This is real geometry work and would gate F280 ONLY if a
future judgment finds the overcount material.

**Relation to #87:** Distinct. #87 (closure invariant) checks that enumerated SURFACES sum to
the whole envelope gap-free/overlap-free; this entry is about 3D solid overlap and inside-face
LENGTH measurement at corners. Do not conflate.

**Status:** Deferred — overcount accepted for initial F280 pass. Revisit once F280 output is
visible and the real-world error magnitude can be judged.

---

### 97. Window/door operation-type registry (WEW Bridge wire-in — #46)

**Category:** Window/door placement (#46 wire-in). **Logged:** 2026-06-28 (Assembly Library / WEW Bridge side-quest).

**Description:**

The WEW Bridge emits an **additive** operation-type list rather than a fixed closed set. Supplier
Type/Config values (e.g. from WEW schedule rows) pass through verbatim; unknown values append to
the list rather than being rejected. This implies a small persistent **type registry** that
Collabinator's window-placement track reads and writes.

Currently `OPENING_TYPES` is a module-level constant array (`['Tilt-turn', 'Casement', 'Fixed',
'Slider', 'Hinged door']`). When the WEW Bridge output wires into #46, that constant must become
a mutable registry — readable by placement dialogs, writable by the bridge ingest path — so
supplier-specific type names round-trip without loss.

**Scope boundary:** This is a #46 wire-in concern only. Nothing in the current placement layer
or bridge code needs changing before then. Do NOT convert `OPENING_TYPES` to a ref ahead of the
actual wire-in.

**Status:** Deferred — no action until #46 wire-in is scoped.

---

### 98. Glass Ug/g lookup — values are LISTS-sheet-derived, not row-literal (WEW Bridge — #46)

**Category:** Window performance data / WEW Bridge (#46 wire-in). **Logged:** 2026-06-28 (Assembly Library / WEW Bridge side-quest).

**Description:**

Window performance values `ug` (glass U-value) and `g` (solar heat gain coefficient / SHGC) are
**not present on individual schedule rows** in the WEW workbook. They resolve from the glass
option (schedule column J) looked up against the WEW workbook's LISTS sheet. The WEW Bridge
reader already performs this lookup, so `ug`/`g` values arriving from the bridge are
lookup-derived — not row-literal values.

**Implication for #46 wire-in:** When bridge output is ingested, `ug`/`g` fields should be
treated as pre-resolved — store them as-received, do not attempt to re-derive from schedule row
data. The bridge is the authoritative lookup source for these fields; Collabinator does not need
to carry the LISTS sheet or re-implement the lookup.

**Status:** Note for #46 wire-in — no action before then.

---

### 99. Opening (window/door) U-value source for F280 — RESOLVED (F280 side-quest, 2026-06-28)

**Category:** Thermal derivation / F280 endpoint. **Logged:** Session 49 (thermal-field ingest slice close-out). **Resolved:** F280 side-quest (2026-06-28).

**Description:**

`effectiveUValue` stored on an assembly record is the **bare-assembly** value — parallel-path
result, air films included, openings excluded (per `ASSEMBLY_CONTRACT.md`). The value is correct
for an uninterrupted wall area. For F280 heat-loss, a wall surface carrying one or more openings
needs an effective U for the opening area that is DISTINCT from the wall assembly U.

**RESOLVED — Opening thermal-data model:**

F280 requires two values per opening: a conductive value (for heating loss Cl. 5.2.1 and the
conductive cooling term Cl. 6.2.2) and a solar value (for the cooling solar term Cl. 6.2.2 only).

- **U-value** is the user-facing conductive field. Enterable in imperial (BTU/h·ft²·°F) or
  metric (W/m²·°C) per the user's unit preference. This mirrors how wall assemblies surface
  `effectiveUValue` to the user.
- **SHGC** (solar heat gain coefficient, dimensionless) is a first-class user-facing field on
  every opening. Required by F280's cooling calc; has no wall-assembly analogue.
- **RSI_W** (m²·°C/W) is **ENGINE-INTERNAL ONLY** — derived from the user-entered U-value
  (`RSI_W = 1 / U_SI`) for use in the F280 formula. Never shown to the user. This mirrors the
  `getConfigValue` (raw user intent) vs `resolveEffectiveConfig` (engine-resolved) split already
  present in the config layer.

Both U-value and SHGC are per-opening fields (option 1 from the original candidates). The
preferred source is manufacturer-rated test data (CAN/CSA-A440 / A440.2 / CGSB 82.1), arriving
via the WEW Bridge schedule (#46) or manual entry. The F280 Tables 6E–6H default lookup (six
physical descriptors → U-value + SHGC) is a retrofit/no-data fallback — see #103.

**Status:** **RESOLVED.** Gate on F280 endpoint lifted. See BUILD_ROADMAP.md F280 ENDPOINT block.

---

### 100. Auto-match openings to elevation by location text

**Category:** Opening placement / UX. **Logged:** Session 50 (#46 Stage Two close-out).

**Description:**

`entry.location` is the WEW "Location" field — unstructured free text (e.g. "Living room north wall",
"Master bedroom"). The current model is **user-assigns**: the user navigates to the correct elevation
page and clicks where the opening should go. Location text is shown as a hint in the "Openings to
place" panel but never acted on.

A future layer could attempt structured or fuzzy matching of `entry.location` against elevation page
`subLabel` (N/S/E/W) to pre-filter or pre-navigate, reducing the number of clicks for projects where
WEW location text is consistent with the page naming convention.

**Why deferred:** Location text is not canonical — it describes where the opening is in plan, not
which elevation face it belongs to. Auto-match would be fragile on any project where WEW text does
not cleanly map to N/S/E/W labels. The user-assigns model is always correct; the match layer is a
polish convenience, not a correctness concern.

**Status:** Deferred LATER layer on top of the user-assigns placement model. Do not build until Ben signals.

---

### 101. WEW operationType ↔ OPENING_TYPES vocabulary reconciliation

**Category:** Opening placement / data model. **Logged:** Session 50 (#46 Stage Two close-out).

**Description:**

WEW Bridge `operationType` is an additive open list (verbatim passthrough — "Fixed", "Casement",
"Single Inswing", "Lift & Slide", etc.). Collabinator's `OPENING_TYPES` array is a fixed list
("Tilt-turn", "Casement", "Fixed", "Slider", "Hinged door"). The two vocabularies do not match 1:1.
Currently, `placeOpeningFromEntry` stores WEW's string verbatim — no crash, no mapping. The
`openingType` field is free-form; the panel and enumeration display it as-is.

Reconciliation (a mapping table or canonical expansion of `OPENING_TYPES`) is required only if a
downstream consumer needs to ACT on opening type — e.g. a frame-type heat-loss coefficient lookup,
a permit-set legend, or the F280 calculation. Building the map prematurely risks building it for
the wrong vocabulary if the F280 spec or a later Track B tool dictates the target values.

**Why deferred:** Cosmetic for now (verbatim passthrough, no crash). Revisit when the first
consumer that must act on opening type is scoped; do not build the map twice.

**Status:** Deferred. Revisit when an opening-type consumer is scoped (F280 glazing path likely first).

---

### 102. Existing window-schedule reader tool — known asset for #46 Stage One

**Category:** Opening ingestion / #28 track. **Logged:** Session 50 (#46 Stage Two close-out).

**Description:**

Ben has a prior program that partially reads/automates window schedules into the WEW spreadsheet.
This tool is the known starting asset and adaptation point for #46 Stage One (recognition and
ingestion of raw schedule data into the normalized `WEW_BRIDGE_CONTRACT.md` shape).

Stage One is the "harder half" of #46: recognizing opening data from raw source material (PDF
schedules, spreadsheets, typed input) and normalising it into the bridge contract. Stage Two
(place-from-structured-list) is DONE. Stage One feeds Stage Two.

**Why deferred:** #46 Stage One is gated on #28 (the plan reader / deep-review waypoint). The
harness existing (`__verifyFixture` 34/34 PASS) removed one stated blocker of #28, but the
broader #28 review threshold has not been reached.

**Status:** Logged as a KNOWN ASSET. Do not build now; gated on #28. When #28 unblocks, start
#46 Stage One from Ben's existing tool as the adaptation baseline.

---

### 103. Window-builder selector (retrofit / no-rated-data path)

**Category:** Opening thermal data / F280 fallback. **Logged:** F280 side-quest (2026-06-28).

**Description:**

A selector over the six F280 Table 6E–6H physical descriptors — glazing layers, frame material,
operability, spacer type, coating, gas fill/gap — that derives U-value + SHGC from the F280
default tables when no manufacturer-rated values exist.

The six descriptors required to key the tables:
1. Glazing layers: single / double / triple / TG-2
2. Frame material: Aluminum / Wood or Vinyl
3. Operability: Fixed / Operable
4. Spacer type: Metal / Insulating (double/triple only; N/A for single/TG-2)
5. Glazing coating: Clear / Low-E (double/triple only; TG-2 is Low-E by definition)
6. Gap gas and size: 6mm Air / 6mm Argon / 9mm Krypton / 13mm Air / 13mm Argon (double/triple);
   storm window Yes/No (single only)

**Relationship to the resolved #99 model:**

The resolved opening thermal-data model (see #99) designates manufacturer-rated data as the
preferred source and RSI_W as engine-internal. This selector implements the **generic tier
fallback**: when no manufacturer-rated U-value + SHGC are available, the user provides the six
physical descriptors and the selector resolves the F280 table values. Consistent with the
principle "supplier integration is optional refinement over a fully valid generic tier" — the
6E–6H lookup IS the generic tier for openings; manufacturer-rated data is the refinement,
normally arriving via the window-schedule import path (#46 / WEW).

**Source material:** Default table values are in `F280_COMPLIANCE_SPEC.md` / `F280_OCR_RAW.md`
(Tables 6E–6H), held in the external CollabinatorF280 repo:
https://github.com/StationCraft/CollabinatorF280.git (private, branch `master`).

**Build only if retrofit applications require it.** Not needed for the initial F280 endpoint
build — the endpoint can accept a manually-entered U-value + SHGC directly (same fields, different
source). The selector is a convenience path for projects where window specs are unknown.

**Status:** Deferred. Log only — do not build until retrofit scope is confirmed.

---

### 104. Glazing-in-door as parented sub-item

**Category:** Opening model / data. **Logged:** Session 52 (2026-06-28).

**Description:**

A glazed light within a door is entered as a separate **window entity PARENTED to the door item**. Its area subtracts from the door's area (not from the wall), and the door's net opaque area is derived after the child window is cut out.

Under this model doors are always opaque (`shgc = 0`) and glazed doors need no special-casing — the glazing is a child window with its own `uw`/`shgc`. The door's residual area is the frame + opaque panel; the child window contributes the glazed-area solar gain.

**Open design questions:**
- How a sub-item is entered and bound to its parent door
- How area subtraction chains (window → door → wall)
- How the door's residual opaque area is derived in `deriveEnumeration`
- How F280 enumerates parent + child as distinct surfaces (opaque door at RSI Table 6I + glazed portion at RSI_W/SHGC)

**Relationships:** Same class of problem as #45 (unit subdivided into sub-sections with differential area/properties) and #44 (parent/child instance identity) — likely sequenced with or after them.

**Why deferred:** Requires its own design pass. Do not build inline. The opaque-door model (`shgc = 0`, `uw` retained) is correct and complete for the F280 endpoint; this entry handles future glazed-door refinement only.

**Status:** Deferred. Own design pass required before build.

---

### 105. Climate-change resiliency mode — heat loss at extreme design temperature

**Category:** F280 / heat-loss output. **Logged:** Session 53 (2026-06-28).

**Description:**

A user-facing toggle on the F280 heat-loss output panel that re-runs the same above-grade conductive heat-loss calculation (`HLage = A / RSI × DTDh`) against a user-set **extreme outdoor design temperature**, displayed alongside — never replacing — the official F280 design-temperature result.

F280 design temperatures are the compliance requirement and remain the authoritative output. Resiliency mode lets the user see how the envelope performs under a harsher future-climate design condition, for design-decision purposes, without altering the compliant number.

**Shape:**
- Rides on the location/Toh override layer being built for the F280 endpoint: same ΔT input mechanism, just a second (extreme) outdoor design temperature value (`TohExtreme`).
- The compliant `Toh` (from the F280 weather register) and `TohExtreme` are stored as two distinct values; `DTDhExtreme = Tin − TohExtreme`.
- The official output always uses the register `Toh`. Resiliency is an **additive view**, not a replacement — both numbers are shown, never blended.
- The toggle is a UI affordance on the F280 results panel; no new `deriveEnumeration` machinery required (same surface data, different DTDh scalar).

**Gating:** Build after the F280 above-grade conductive endpoint + location/Toh override layer exist. Not part of the first endpoint slice.

**Status:** Logged, deferred. Gated on #F280-conductive-endpoint + location/Toh override layer.

---

### 106. Assembly-inheritance default — wire Project Setup assemblies to getSurfaceAssembly miss path

**Category:** F280 / thermal / data wiring. **Logged:** Session 56 (2026-06-29).

**Description:**

A **dual-entry UI trap** was confirmed in Session 56 recon: `CONFIG_FIELDS` fields `assembly-wall`, `assembly-foundation`, `assembly-roof`, `assembly-floor` in the Project Setup panel write to `projectSetupRef.current.values` — but `getSurfaceAssembly(surfaceId)` never reads them. The Envelope panel per-surface U-value inputs (App.jsx:7294–7334) are the ONLY load-bearing path today. A user who fills in Project Setup → Assemblies sees their selection stored but has zero effect on F280. This is the root cause of 9/10 walls showing `[unresolved U]` in `__dumpF280()`.

**Fix shape:**
1. Add a U-value + thickness lookup table: `ASSEMBLY_TYPE_DEFAULTS = { '2x6-r22': { effectiveUValue, thicknessM }, ... }` — module-level, keyed by the `options.value` strings in the four assembly CONFIG_FIELDS.
2. Extend the `getSurfaceAssembly` miss path (App.jsx ~4883): after returning `source:'unset'`, check whether a project-level default exists for this surface's assembly type (wall → read `getConfigValue('assembly-wall')`; roof → `assembly-roof`; etc.); if a match is found in the lookup table, return it with `tier:'project-default'`.
3. Make Project Setup the authoritative **project-level default**. Per-surface Envelope panel entries become **overrides** (the explicit `surfaceAssemblyRef` entry wins over the project default). This eliminates the dual-entry confusion.
4. F280 unresolved-U count drops from 9/10 to 0/10 once all surfaces' assembly types are set in Project Setup.

**Note on `ti-heating`:** `F280_TI_HEATING = 22` is hardcoded (App.jsx module-level). The natural slot is a CONFIG_FIELDS `kind:'number'` entry `ti-heating` in the 'Climate' category. The comment in the code already marks this slot. Adding it is a one-descriptor + one cross-field-rule change.

**Why deferred:** No new geometry required. Scoped and buildable. Deferred to wait until after geometry back-to-basics review.

**Status:** Logged, deferred. First item in the near-term thermal arc after geometry review.

---

### 107. Flat-roof UI gap — no assembly/U input block in Envelope panel

**Category:** F280 / UI. **Logged:** Session 56 (2026-06-29).

**Description:**

The `flat-roof-surface` elements appear in the Envelope panel (one row per confirmed roof page) but the panel renders only a status line — there is no `enum-assembly-inputs` block with U-value and thickness fields (App.jsx:7339–7350). The assembly seam code exists and is keyed identically (`flat-roof-${pageId}`), so a manual per-surface U-value write is possible from code but not reachable from the UI.

**Fix:** Add the same `enum-assembly-inputs` block to the flat-roof panel section that exists for wall surfaces. Three inputs: U-value (W/m²K), thickness (mm), Confirm button — same `onBlur` handler writing to `surfaceAssemblyRef.current[el.id]`.

**Note:** This gap is also resolved incidentally by #106 (project-level default reads `assembly-roof` CONFIG_FIELD). The per-surface override UI is still worth building for multi-assembly roofs.

**Status:** Logged, deferred. Incidentally addressed by #106 default-inherit; explicit per-surface UI is a follow-on.

---

### 108. Window/door uw post-placement edit gap

**Category:** F280 / openings / UX. **Logged:** Session 56 (2026-06-29).

**Description:**

`uw` and `shgc` on opening shapes are populated only via the WEW Bridge import path (`placeOpeningFromEntry`, App.jsx ~3050: `uw: entry.performance?.uw ?? null`). The manual "Place opening" workflow (two-click free-rectangle + opening dialog) always stores `uw: null` and `shgc: null` — the opening dialog has no performance fields.

There is no post-placement path to add or edit `uw`/`shgc` on an existing opening. The Envelope panel displays the values but has no edit control.

**Fix shape:**
- Add performance fields (U-value W/m²K, SHGC 0–1, optional) to the opening dialog for both first placement and re-edit. Blank = null (unresolved in F280). Pre-populate from stored values on re-edit.
- Or: add an "Edit performance" button to the opening row in the Envelope panel (minimal uw + shgc dialog only).

**Status:** Logged, deferred. No geometry dependency; pure UI/data wiring work.

---

### 109. Overlay-to-underlay repaint gap on resize / page-nav

**Category:** Rendering / robustness. **Logged:** Session 59 (2026-06-29).

**Description:**

After a window resize or page-switch, traced shapes (openings, grade line, and other overlay
geometry) render misaligned to the PDF backdrop until the canvas receives a clean redraw — at
which point everything snaps back into correct registration. Stored geometry is CORRECT (canvas-pixel
coordinates are intact). The failure is the render-time transform reapplication not firing on
resize and nav events, not a storage error.

**Root cause location:** The redraw-trigger path — resize and page-nav events are not reliably
flushing all overlay render passes. The fix lives in those event handlers, NOT in stored coordinates.

**Important invariant:** Storing a "corrected" pixel offset at event time would reintroduce the
#22 frozen-offset trap (recalibration-independence). The canvas-pixel coordinates must remain
unmodified; only the repaint timing is the fix.

**Relationship to other entries:** Sibling to #24 (global drag-release robustness) — both are
window-level event handler gaps where the app-level event listener misses a transition. Batch
into the same redraw/event robustness polish pass rather than fixing individually.

**Severity:** Visual-only, low-risk. Does not corrupt stored geometry, does not block any build.
A single mouse move restores correct display. Fix when convenient, not urgently.

**Update (Session 66 — exposed by the #114 fix):** now reproducible on SOURCE-SHEET RETURN after a region
draw, and on some fixture loads. Before #114's repaint-trigger fix the source overlay was BLANK on return
(nothing painted), so this pre-existing registration bug was invisible; now that the overlay repaints
(commit f1fffac), the mis-registration shows — overlay geometry paints in the WRONG location relative to the
backdrop (overlay offset from the elevation drawing), corrected by a clean redraw with the current transform.
The #114 fix did NOT create this — it REVEALED it. This ties to the load-time misalignment Ben has flagged
repeatedly. Recon-and-fix still pending; remains DISTINCT from #114 (that was a not-painted-at-all trigger
gap; this is a paints-but-mis-registered transform/timing gap — different fix).

**Status:** Logged. Batch with #24 in a dedicated redraw/event-robustness polish session. Now has a stronger,
more reliable repro (source-sheet return after a region draw) since Session 66.

---

### 110. Region ghost overlay on source sheet

**Category:** Region-pages (#5) / UX / rendering. **Logged:** 2026-06-29 (region scale/crop recon).

**Description:**

Once a source sheet has regions carved from it, the full-sheet view becomes carve-surface-only
(`currentPageIsSourceSheet` suppresses Draw/Edit/Set-Scale/Categorize, App.jsx ~4141). But the
source sheet gives no visual indication of WHERE the regions were carved — the user sees the bare
full sheet with no marks. They have to rely on the sidebar list ("Region K of p.N") to know regions
exist at all.

Render each carved region as a labeled ghost outline (rectangle = the region's `crop` box, plus its
region label/category) on the full-sheet backdrop, so the source sheet shows the carve map directly.
Read-only overlay; the rectangles are not interactive (navigation stays via sidebar / region entries).

**Fix shape:**
- New stateless drawer (canvasRenderer.js) that takes the crop boxes of all regions whose source is
  the current sheet and strokes labeled rectangles on the overlay. Source-sheet crops come from
  `pageCropsRef` filtered by `pageIdMapRef.current[pageNum] === currentPageId`.
- Gate: only when `currentPageIsSourceSheet`. No geometry, no hit-testing.

**Status:** **GATED-READY (gate-expiry sweep, Session 63).** Checkable gate: "at least one
region-page exists (`pages.some(p => p.crop != null)`) AND a source-sheet view exists
(`currentPageIsSourceSheet` reachable)." Both are now true — region-pages and the
carve-surface-only source-sheet view both landed with #5 (commit 8d6e57d). The feature is
buildable today. NOT auto-built here: it is a new user-facing rendering addition (a UX call
on whether/how to show the carve map), so it is held for Ben rather than landed unsupervised.
Read-only overlay; must not touch stored geometry or the crop offset (#22).

---

### 111. Region-page auto-fit to viewport

**Category:** Region-pages (#5) / UX. **Logged:** 2026-06-29 (region scale/crop recon).

**Description:**

When a region is selected, the crop box is rendered at its raw scaled-sheet pixel size (renderPage
crop branch, App.jsx ~805–811: `canvas.style.width = crop.w`, etc.) at zoom 1. A small carved region
therefore appears as a small image floating in a large canvas area rather than filling the viewport
the way a full sheet does. The full sheet gets an implicit fit-to-width via the PDF.js
`containerWidth / viewport.width` scale (App.jsx ~783); regions get no equivalent fit.

Selecting a region should auto-fit the crop to fill the available canvas viewport — same intent as
the full-sheet fit, but keyed to the crop's dimensions (w/h) rather than the full page's.

**Fix shape:** small UX adjustment in the region-navigation/render path (likely an initial
zoom/pan derived from crop dims vs. viewport, or scaling the crop render itself to the container).
Must not touch stored geometry or the crop offset (recalibration-independence, #22).

**Status:** **DONE (Session 64; commits 5468153, cdb5639, 9ce66df, ccc45e0).** Auto-fit is baked
into `renderPage`'s crop branch (App.jsx ~824–835): on initial navigation (`resizeMeasure:true`) a
`displayScale` is applied to the backdrop CSS dimensions so the region fills the viewport at uniform
scale. **Rule (Session 64, Ben's stated preference): ALWAYS fit-to-HEIGHT** — `displayScale =
availableHeight / crop.h` (availableHeight = `window.innerHeight − 200`), applied uniformly to both
axes (no-distortion invariant). Width overflows when scaled width exceeds the viewport; the
`.canvas-stack` / `.canvas-wrapper` `overflow-x:auto` scrolls to the full width. The earlier
constraining-axis branch (`isHeightBound`) was removed — one consistent rule, no per-region axis
choice. **Companion CSS fix (commit ccc45e0):** the global `canvas { max-width: 100% }` rule was
clamping the backdrop's *rendered* width to the container while the inline style set the auto-fit
width — squishing wide regions horizontally and defeating the scroll. Scoped exemption
`.canvas-world canvas { max-width: none }` (App.css ~228) fixes this; full sheets are unaffected
(inline width = scaled.width ≤ container). Geometry / crop offset untouched (#22 honored).
`__verifyCrop` extended with a rendered-box-aspect == bitmap-aspect check (the on-screen layer the
inline-style uniform-scale check missed) + a deliberately-wide `cropWide` case (now 17 checks).

---

### 112. carveMode not reset by navigation

**Category:** Region-pages (#5) / UX / mode lifecycle. **Logged:** Session 62 (2026-06-29).

**Description:**

`carveMode` is intentionally sticky AFTER a carve commit so the user can carve several regions from one
source sheet in a row (Session 61 design). But it is NOT reset by navigation: `goToPageId` resets every
*other* mode (calib, draw, edit, align, roof, opening, equipment…) yet leaves `carveMode` true, and
`__restoreFixture` doesn't reset it either. Only PDF upload, the "Exit carve ✕" button, and line ~3778
clear it.

Observed consequence (Session 62 verification): after carving a region you are navigated onto that region
with carve mode still on; navigating to another page via sidebar/arrows keeps carve on, which hides
Set Scale / Draw (gated on `!carveMode`) until the user clicks "Exit carve ✕", and a drag on a region
would begin carving a *sub-region* of it. NOT a regression from the Session-62 fix — neither original
nav function reset `carveMode` (carve was added after they were written).

**Fix shape (Ben's UX call):** either (a) add `setCarveMode(false)` to `goToPageId` (consistent with how
it resets every other mode — navigating exits carve; the multi-carve flow still works because the
carve-commit path navigates via `renderPage` directly, not `goToPageId`), or (b) leave sticky and accept
the "Exit carve" step. Recommend (a) for consistency.

**Status:** Logged, not built. Low-risk one-liner; deferred as a UX decision (out of scope for the
two render/counter defects fixed in Session 62).

### 113. Build 2 change 2 — full-page carve reachability over the negative align overhang

**Category:** Region-pages (#5) / carve-on-aligned-elevation / layout seam. **Logged:** Session 65 (2026-06-30).

**Description:**

Build 2 (Session 65) shipped the measurement core of carve-on-aligned-elevation — change 1 (crop ∘ T⁻¹
at commit) and change 3 (scale propagation ÷s onto the region's own pageId). The **third** coupled
change — making the ENTIRE aligned page carve-able — was **deferred** after recon found the real align
transform is large and **negative** (fixture page-2: `tx≈−625.6, ty≈−508.5, s≈1.5017`).

Why it's its own seam: the carve box is captured in the source page's untransformed canvas-world frame via
`getCanvasPos`, whose origin is `measureRef`'s top-left (canvas-world `(0,0)`). The settled change-1 commit
formula `(R−t)/s` is only correct while that origin stays at canvas-world `(0,0)` (offset 0). The visible
aligned page extends far into **negative** canvas-world space (the top-left overhang), and `measureRef`
(CSS `position:absolute; top:0; left:0; width:100%; height:100%`, sized by `.canvas-world`'s `fit-content`
= the *untransformed* backdrop) cannot receive mouse events out there. Covering it requires repositioning
`measureRef` to a negative offset, which (a) forces the commit to reconstruct the canvas-world point as
`getCanvasPos() + off` before `(W−t)/s` — a generalization the literal formula doesn't state; get it wrong
→ silent ~±400px raw-sheet error — and (b) fights `.canvas-stack { overflow-y:hidden; overflow-x:auto }`
and `.canvas-world { width:fit-content }`, i.e. it touches **shared layout CSS**. Per the build's STOP
condition ("if the measureRef resize requires touching the shared geometry-capture sizing path → STOP"),
this was surfaced and deferred so a layout change cannot be confused with a measurement change.

**Current consequence:** on an aligned elevation, carving works correctly across the **reachable** zone
(canvas-world `[0,scaled.w]×[0,scaled.h]`, where the traced geometry sits) — crop is correctly composed
and the region arrives calibrated — but the negative top-left overhang of the visible page is unreachable
(mousedown there lands on `.canvas-world`/`.canvas-stack`, which have no handler — a dead zone, NOT pan).

**Gate / fix shape (for the planning chat):** settle the `measureRef` offset mechanics + `canvas-stack`
overflow handling as their own change, keeping `getCanvasPos` unmodified and folding the offset back into
the commit so stored crop stays `T⁻¹(canvas-world point boxed)`. Verification item 1 (carve across the
ENTIRE aligned page — needs Ben's eyeball) belongs to this deferred change, not to Build 2.

**Status:** Logged, deferred by explicit decision (Session 65). Measurement core (changes 1+3) DONE and
verified; this is the reachability/layout half.

### 114. Region geometry/openings don't paint until a forced re-render (overlapping carved regions, aligned page)

**Category:** Region-pages (#5) / repaint / render-path. **Logged:** Session 65 (2026-06-30).

**Observed** (Session 65 post-Build-2 eyeball verification, fixture page-2 aligned elevation):
After carving two OVERLAPPING regions on the aligned elevation and drawing a shape in one:
- The whole elevation (lines + previously-placed openings) disappeared from the source-sheet view.
- The drawn shape showed in only ONE sub-region display; vanished on scrolling/navigating away; reappeared
  when "Edit shapes" was clicked.
- Elevation lines and placed openings reappeared when "Place Opening" was clicked.

**Diagnosis (provisional, from symptom shape — NOT yet recon'd):**
This is a REPAINT/VISIBILITY bug, not a measurement or data bug. Confirmed NOT a measurement problem: the
drawn shape returns at the correct place and correct real-world size (2'0.0"×2'6.0", no ~1.5× distortion),
and console confirms data intact ("restore complete → page-2 | shapes:5 | scales:['page-3','page-2']").
Geometry reappears INTACT whenever a render is forced (Edit shapes, Place Opening). Signature = a draw path
that does not repaint siblings / region overlays until something kicks the canvas.

**Relation to #109:** RECON-CONFIRMED DISTINCT trigger and distinct fix (same robustness family).
#109 is paints-but-mis-registered (transform/redraw-timing on resize and different-sheet nav — geometry
shows in the wrong place, a clean redraw with the current transform corrects it). #114 was not-painted-at-all
(passive-redraw effect never fired). Adding `currentPageId` (the #114 fix) does NOT resolve #109 and vice
versa. See the appended #109 note: now that #114 makes the source overlay repaint, the pre-existing #109
mis-registration on source-sheet return is VISIBLE (was masked by the blank overlay).

**Scope note:** Build 2 (changes 1+3) measurement seam is UNAFFECTED and held correctly; this is downstream
display only. Does NOT gate any Build-2 commit.

**ROOT CAUSE (recon-confirmed, Session 66):** the three overlay passive-redraw `useEffect`s (view-mode
App.jsx ~1041, edit-mode ~1605, draw-mode ~1609) keyed their dependency arrays on `currentPage` (the numeric
PDF sheet number) but NOT on `currentPageId` (logical-page identity). A source sheet and every region carved
from it share ONE sheet number (`page-2`, `page-2-r1`, `page-2-r2` all → `currentPage === 2`). Navigating
among them changes `currentPageId` and clears `measureRef` inside `renderPage`, but re-fires NO passive
effect because `currentPage` is unchanged → the overlay sits blank until an unrelated dependency changes
(editMode/drawMode/a tick) or an imperative redraw runs (the Edit-shapes / Place-opening recovery Ben used).

**REFINED TRIGGER CONDITION:** "≥2 logical pages sharing one sheet number." A single region + its source
sheet already qualifies (verified — see item 3 below); the OVERLAPPING-siblings case in the original
symptom was incidental to Ben's repro, not causal. Overlap touches nothing in the render path
(`pageCropsRef` is per-pageId, no cross-region composition).

**FIX (approach-(a), commit f1fffac, Session 66):** add `currentPageId` to the dependency array of EACH of
the three effects — three single-line additions, effect BODIES unchanged, `renderPage` / `goToPageId` / carve
path / imperative-draw handlers all untouched. Pure repaint-trigger fix; NO coordinate/scale/crop/geometry
math touched (measurement untouched by construction). Same-sheet logical-page nav now wakes the effects
exactly as a mode change does today (the recovery path Ben already used successfully).

**Different-sheet nav (the one regression risk) — not a regression by construction:** `renderPage` calls
`setCurrentPage` then `setCurrentPageId` back-to-back (App.jsx ~855-856). Under React 18 automatic batching
(Vite + createRoot, batched even after the `await`), both commit in ONE render, so the effect's dependency
check runs ONCE — exactly as before the fix. The dep addition only adds a NEW same-sheet wake condition; it
cannot split an existing single different-sheet fire into two. Before: different-sheet nav fired once. After:
still once.

**VERIFICATION STATE (Session 66):**
- Repaint trigger: VERIFIED (Ben's eyeball) — drawn shape survives nav and paints on its own region without
  a mode change; source sheet repaints its elevation lines + placed openings on return without a mode change;
  sibling region paints its own geometry on arrival.
- Item 2 (no double-paint/flicker on different-sheet nav): NOT explicitly eyeballed; structurally single-fire
  per the batching argument above. A quick different-sheet glance is a cheap follow-up but no double-paint is
  expected.
- Opening-revert sub-check of item 1: BLOCKED by #115 (carved elevation region has no Place-opening), NOT failed.
- Visual registration of the repainted overlay: BLOCKED by #109 (mis-registration on return), NOT failed —
  out of scope for #114 (a repaint-trigger fix, not a registration fix).
- Item 4: `__verifyFixture` 44/44, `__verifyCrop` 17/17 on a fresh restore (harness was never the detector here).
- Item 5: Edit-shapes / Place-opening recovery unchanged.

**Status:** RESOLVED (approach-(a) dependency addition, commit f1fffac, Session 66). Two PRE-EXISTING bugs
were EXPOSED (not caused) by this fix and logged separately: #109 (mis-registration on return, note appended)
and #115 (carved elevation region has no Place-opening). Neither gates this fix.

---

### 115. Carved elevation region does not surface Place-opening (opening-entry gap on region-pages)

**Category:** Region-pages (#5) / Elevation / opening-entry. **Logged:** Session 66 (2026-06-30).

**Exposed by (not caused by):** the #114 repaint-trigger fix. While replaying #114's item-1 break sequence,
the opening-revert sub-check could not be tested because a region carved from an elevation page does NOT
expose the "Place opening" button.

**Description:**

A region carved from an Elevation source sheet does not surface "Place opening", so openings cannot be placed
while working inside a region. The Place-opening button gate (App.jsx ~6397) requires `isElevationPage`
(derived from the page's category) AND `pageHasScale` AND no active mode AND not a source sheet. A freshly
carved region-page starts UNCATEGORIZED (`category: null` — set in the carve-commit `setPages`, App.jsx ~2127),
so `isElevationPage` is false for it until the user categorizes the region as an Elevation. Suspected primary
cause: the region inherits neither the source sheet's Elevation category nor an obvious path to Place-opening.
NEEDS RECON to confirm whether the gap is (a) the region being uncategorized, (b) category not inheriting from
the source sheet on carve, or (c) the Place-opening gate not accounting for region-pages — before any fix.

**Why it matters:** openings are an Elevation-page workflow; if elevation work moves to carved regions
(the point of #5 region-pages), opening placement must follow into the region. Otherwise openings can only be
placed on the full source sheet, which is carve-surface-only once regions exist.

**Refined-trigger note:** independent of #114's trigger; this is an opening-entry/category-inheritance gap,
not a repaint gap.

**Status:** Logged, gated. Needs recon to confirm root cause (category inheritance vs. gate logic) before a
fix is scoped. Do NOT fix blind.

### 116. Locked-region PDF capture as visual surface skin

**Category:** Visual / 3D-render / output-documents. **Logged:** Session 66 (2026-06-30).

**Mental model (Ben's words):** "drawn shape capture screenshot and apply as possible visual surface."

**What:** Once a region or shape is locked (floor-plan polygon, elevation outline, carved
region-page, roof plan), capture the slice of the underlying reference PDF that the locked
geometry overlays as a raster image, and make it a TOGGLEABLE visual layer. Two consumers:
  1. **3D wireframe render** — the captured raster applied as a surface material/texture on the
     corresponding plane.
  2. **Output documents** — the captured PDF slice shown as a visible underlay/overlay layer.

**Why deferred:** hard-depends on stable locked geometry with settled coordinate frames — i.e.
the region-page / carve / coordinate-transform layer must be solid first (the layer being
stabilized in the current track). Capturing a raster against an unsettled transform would bake in
a wrong registration.

**Dependency notes:**
  - Capture is a read-time projection of (locked geometry frame) x (source PDF page raster) —
    store the minimal authoritative source (the geometry + a reference to the source page region),
    derive the raster on demand where possible, per VISION_SUPPLEMENT principle 5.1. Do NOT store a
    frozen screenshot as the authoritative artifact if it can be re-derived from geometry + source page.
  - Relates to the coordinate-registration work (#109) — a correct capture requires a correct
    overlay->backdrop registration, so this cannot be trusted until #109 is resolved.
  - 3D-surface consumer pairs with the existing deriveWireframe / ThreeDView path (planes already
    exist as geometry; this adds an optional material).

**Gate (checkable):** region-page coordinate frames stable (carve + repaint + #109 registration all
resolved) AND deriveWireframe planes carry a stable identity that a captured raster can be keyed to.

**Status:** DEFERRED. Logged for the post-stabilization track; do not start until the gate above holds.
