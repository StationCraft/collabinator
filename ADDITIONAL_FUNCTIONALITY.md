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

## Review checkpoints

- [ ] After this chat's goal is complete (`BUILD_ROADMAP.md` Step 4 done) — quick pass
      to see if any entries are now small enough to fold into a dedicated polish
      session before moving to floor-by-floor work.
- [ ] Final review once Phase 1's toolkit is fully built and tested against real plan
      sets — use this list deliberately to chase down edge cases, rather than
      reactively mid-feature.
