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

## Review checkpoints

- [ ] After this chat's goal is complete (`BUILD_ROADMAP.md` Step 4 done) — quick pass
      to see if any entries are now small enough to fold into a dedicated polish
      session before moving to floor-by-floor work.
- [ ] Final review once Phase 1's toolkit is fully built and tested against real plan
      sets — use this list deliberately to chase down edge cases, rather than
      reactively mid-feature.
