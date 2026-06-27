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
**Status:** Deferred. pageId design accommodates it without a rewrite.

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

### 10. Full-screen / maximum-width canvas layout

**Logged:** Session 8, while tuning multi-floor ghost visibility against large PDFs.

**Description:** The canvas area currently leaves large unused margins. UI/layout polish: expand the canvas to use the full browser width, and potentially the full height (hiding the toolbar into a collapsible header or side-drawer). This would make dense floor plans and large elevations more readable without constant zooming.

**Why deferred:** Pure UI/layout polish, zero core functionality impact. Ghost rendering tested at current canvas size; margin reductions are a separate visual-design pass. Does not block any tracing workflows.

**Status:** Deferred. Good candidate for a dedicated UI pass after Phase 1 toolkit is feature-complete.

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

**Logged:** Session 20, elevation Piece 3 sub-piece 2 close-out.

**Description:** On PDF upload, run automated visual analysis of each page to propose: page category, what the page shows, approximate scale, and key geometry (e.g., exterior perimeter lines). Present findings to the user as confirm-and-correct prompts with a visual overlay — e.g., "Analysis suggests this is the Basement floor plan; these lines appear to be the exterior perimeter — confirm? If any line is wrong, click it and adjust." This is a fundamentally different build paradigm from the current manual-trace flow: **analysis-first, human-in-the-loop correction** rather than human-first trace from scratch.

Includes raster-image line sensing, ML-assisted classification, and an overlay UI that presents analysis results as candidates rather than facts. Reflects how Ben originally envisioned the program working.

**Why deferred:** The current Phase 1 toolkit (manual trace, snap, align) is the foundation the analysis layer would validate against and hand off to. Building analysis before the manual layer is complete would build on an incomplete reference. This item is explicitly flagged as **relevant input to the scheduled post-Phase-2 deep-review waypoint** — the review should evaluate whether Phase 2 rebuilds around the analysis-first paradigm rather than adding it on top.

**Why it matters for the review waypoint:** This is a paradigm-level choice (analysis-first vs. trace-first), not a feature addition. The deep-review waypoint is the right place to decide whether the tool pivots to this model or continues the trace-first approach.

**Status:** Deferred — not scheduled. Tag as a key input item for the ⏸ deep-level program review (BUILD_ROADMAP.md waypoint).

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

### 46. Window-schedule import + place-from-list

**Logged:** Session 26, windows/doors Pieces 1+2 close-out.

**Description:** Recognize and import an existing window-or-door schedule table from the plan set. Let the user place units directly from the imported list onto elevations (click an entry → appears ready to align) instead of drawing each from scratch. Imported entries autofill the display label.

**Cross-references:**
- **#28 (PDF visual analysis):** recognizing a schedule table is the same recognition problem as page categorization and geometry identification — strong candidate to build under the analysis-first layer when #28 is scoped.
- **#44 (component model):** an imported schedule entry is effectively a component definition; import likely populates the component library directly.

**Why deferred:** Requires #28 (PDF recognition) and #44 (component model). Import/export round-trip should be designed together.

**Status:** Deferred. Revisit alongside #28 and #44.

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
**Status:** Deferred.

---

### 59. Utilities / energy-sources-at-site config fields
**Logged:** Session 33.
**Description:** Project-info fields capturing available fuels/utilities at the site (gas, electric, heat-pump-eligible, etc.) that feed the dependency-rule layer (#58 above) — gating which equipment options are offered. Corresponds to VISION_SUPPLEMENT §3. May fold into #58 as its data half rather than shipping as a separate build.
**Why deferred:** Dependency-rule layer (#58) must be designed first; utilities fields are input to those rules, not standalone.
**Status:** Deferred; likely builds as part of #58.

---

### 60. Dual-fuel space-heating option
**Logged:** Session 33.
**Description:** `space-heating = 'dual-fuel'` (ducted heat pump + gas furnace backup): spawns air-handler + outdoor-unit + furnace. A `furnace` item-type would carry its own obligations (gas line, flue/combustion-venting, condensate drain, power). Pure data addition to ITEM_TYPES + spawns — no engine change. Buildable any time after Session 33.
**Why deferred:** Out of scope for the §8.2 two-type spawns proof-of-concept. No behavior gap now; no current project uses dual-fuel.
**Status:** Deferred; data-only addition when needed.

---

### 61. Cross-trade obligation → §9 role wiring
**Logged:** Session 33.
**Description:** The descriptive trade tags on run obligations ((plumber)/(electrician)/(envelope)) become real owner-role assignments tied to the §9 role model. Currently label-only text with no link to `roleAssignments` in `projectSetupRef`. When wired, the correct role from `ROLE_LABELS`/`getRequiredRoles()` would be derived from the obligation and the obligation row would show the assigned person's name.
**Why deferred:** Role-blind model is correct for the placement proof-of-concept; the trade tags describe who needs to coordinate, not a data relationship today. Full role-wiring belongs after the obligation model is more complete (runs + paths built).
**Status:** Deferred; label-only for now.

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
**Status:** Deferred to a UI polish session after core functionality is complete.

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
- **#69 (panel consolidation) PUSHED to END of pre-Phase-2 run (Beat 4).** Consolidation wants
  to happen once, after panel count stabilizes. Beats 2-3 may add/change panel content; early
  consolidation forces a re-consolidation. Short shelf life if done now.
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
