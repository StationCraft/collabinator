# Collabinator — Build Roadmap & Progress Tracker

*A living "where am I, where is this going" doc. Updated at real checkpoints — end of
a code session, or completing a step — not every message. Replace the copy in this
Claude.ai Project each time a refreshed version is given.*

---

## This chat's goal

Get the codebase through the remaining **infrastructure** items, so the tool itself is
internally clean and ready to start real floor-by-floor building data work. This is a
deliberate boundary: everything below is "make the tool good," not yet "build the
building."

```
[x] Deferred-polish list (Delete/Insert/Delete vertex, Shift-axis-release,
    Split fix, button labels, Undo/Redo) — DONE, committed
[x] Step 1 — Structural refactor (file split, zero behavior change) — DONE, committed
    [x] Bonus: Start-vertex snap (pre-first-vertex only, Shift suppresses)
    [x] Bonus: Snap grid selector in Edit Shapes mode
    [x] Bugfix: Combine winding-direction (same-winding shapes now eligible)
[x] Step 2 — Zoom / pan — DONE, committed
[x] Step 3 — Compass rose alignment — DONE, committed
[x] Step 4a — pageId migration — DONE, committed
[x] Step 4b — Page categorization UI — DONE, committed
[x] Step 4c — Sidebar + navigation — DONE, committed (b314eab, 23d66bc)
[x] Ground floor tracing — DONE
    [x] Step 5a   — getAnchorFloor helper + FLOOR_ORDER — DONE, committed (9266bdc)
    [x] Step 5a-ii — known-level requirement in categorization — DONE, committed (ef09039)
    [-] Step 5b   — origin capture — CANCELLED / DISSOLVED. The fixed-arbitrary-origin
        reframing means there is no origin to capture (see FUNCTIONALITY_SUMMARY.md
        Section 1 & 5). Nothing replaces it.
    [x] Step 5c   — front-face designation — DONE & fully tested, committed (2d6021b)
[ ] Multi-floor reference & alignment
    [x] Sub-step 1 — reference ghost rendering (read-only, toggleable overlay)
        DONE, committed (996b5a7)
    [x] Sub-step 2 — ghost alignment + per-page transform (drag to align, scale)
        DONE, built as five pieces (A, B, C, D1, D2):
        A: getCSSTransform pure helper (73f02f1)
        B: .pdf-align-layer div + identity wiring (c2ed3ba)
        C: translate-only body-drag (122b077)
        Ghost visibility upgrade: amber+hatch (6e97f67)
        D1: four scale handles at ghost bbox corners (b210343)
        D2: handle-grab uniform scale, anchor-preserving tx/ty (d5425d0)
    [x] Sub-step 3 — confirm-scale lock  DONE (d49060d, e4cf8b6, 327e84d, d030a34)
        1a: confirmed flag + Confirm button + Realign re-entry (d49060d)
        1a-fix: preserve confirmed on scale drag (e4cf8b6)
        1b: getEffectiveScale recursive borrow unlocks Draw (327e84d)
        1b-fix + 1c: recursive borrow for 3+ floor stacks; hide Set Scale on ghosted pages (d030a34)
    [x] Sub-step 4 — cross-page persistence & toggle state — DONE (c7a45e0, d42296e, 196b0fa)
    [x] Sub-step 5 — directional decoupling / primary-reference model — DONE (9ef06b1, b8dd9ce, 6f7f629)
        A: REFERENCE_KIND_DEFAULT + kindToLabel + primaryReferenceIdRef + label rewires (9ef06b1)
        B: getGhostSourcePageId checks pageRefParent first, FLOOR_ORDER fallback;
           getEffectiveScale follows pageRefParentRef chain; confirm handlers write parent (b8dd9ce)
        C: refCandidates + reference override picker in all 3 toolbar sites (6f7f629)
```

    [x] Sub-step 5 — directional decoupling / primary-reference model — DONE (see above)
[x] Roof plan tracing — DONE (Session 13; commits a5c1b48, 8288a1d)
    [x] Piece A+B+C: Roof Plan category, flat/sloped section picker, parapet width (a5c1b48)
    [x] Piece D: Role assignment — Assign line roles mode, two vocabularies
        (perimeter: eave/rake; internal: hip/valley/ridge), role colors (8288a1d)
    [x] Piece E: Connected-graph trace tool (roofGraphRef) — shared-vertex junctions,
        dedup, perimParent/perimCorner/roofEdgeParent provenance, axis snap, midpoint
        snap, edge-split snap, auto-split on perimeter edge (8288a1d)
    [x] Piece F: Heal-on-undo/delete — healAfterEdgeRemoval restores split edges (8288a1d)
    [x] Piece G: Five role colors, Z-undo, Undo button in toolbar (8288a1d)
[ ] Elevation calibration + tracing
    [x] Piece 1 — floorHeightsRef data structure + accumulateZ + getFloorLevel (2942e0e)
    [x] Piece 2 — Floor-heights entry panel UI (e780b88)
    [x] Piece 3 — Floor-to-floor back-solve entry, ceilingSource, validateCeiling (4e06de0)
    [~] Elevation PDF alignment + reference lines — PAUSED (forks resolved; rebuild on real units after coordinate conversion; see SESSION_HANDOFF_NOTES Session 16)
[ ] Pixels→real-world coordinate conversion (FOUNDATION) — SCOPED (R2); ready to build
    Target R2: single shared real-world XY frame, fixed arbitrary origin, Z stays
    datum-layer, built to R3-readiness (Z-ready vertex shape + no coordinate-
    coincidence merging — both hard acceptance criteria). Sub-forks resolved:
    1a primary-ref page defines frame; meters canonical (imperial display untouched,
    #20 deferred); getEffectiveScale feeds conversion; 4a store-meters-natively
    (convert only at input + render seams). FIRST BUILD STEP = sub-fork 5 consumer
    inventory. Per-element Z (R3 / #7 / #19) sequenced AFTER. Full scope in
    SESSION_HANDOFF_NOTES Session 17.
**Floor-heights Pieces 1-3 done (Sessions 14-15). Next: pixels→real-world coordinate conversion (foundation), then resume elevation spatial work on real units.**

---

## What this leads to (not started, not this chat's job)

Once the infrastructure above is solid, a fresh planning chat picks up at the actual
building-tracing sequence, per `FUNCTIONALITY_SUMMARY.md`:

```
Ground floor tracing (no origin capture — origin is a fixed arbitrary zero)
  -> Multi-floor reference & alignment (built correctly this time)
    -> Roof plan tracing
      -> Elevation calibration + tracing
        -> Cross-section reference geometry
          -> Windows / doors placement
            -> Phase 2 threshold (3D wireframe + spreadsheet output)
```

---

## ⏸ WAYPOINT — Deep-level program review (scheduled, not optional)

**Trigger:** Once a full 3D geometry expressing the building envelope + assembly thicknesses exists and correlates to the volume model (Phase 2 threshold reached).

**Purpose:** A frank, ground-up review of what Collabinator is actually for, informed by the understanding gained through building Phase 1 — not the understanding held at the start. Ben has flagged that the program's true goal will be clearer in hindsight than it could be at the outset, and that the right move is to reserve dedicated time for that reassessment rather than let early assumptions ossify.

**Explicitly in scope for this review:**
- Whether the data model built through Phase 1.5 still serves the goal as then-understood, or whether a full rebuild is warranted. A rebuild is a legitimate, anticipated possible outcome — Phase 1 is partly a learning vehicle, and a clean, well-documented rebuild informed by real understanding is a success, not a failure.
- Re-examination of every deferred ADDITIONAL_FUNCTIONALITY entry against the matured understanding.
- The core question: what is the program's goal, restated from experience.

**Why recorded now:** So the intention survives session history and is treated as a real milestone, not a vague someday. The disciplined deferral practiced throughout Phase 1 (clean data model, documented decisions, deferred-not-deleted register) is precisely what makes this review cheap and what makes a rebuild — if chosen — fast and informed rather than a loss.

---

That's intentionally a separate chat's goal — it deserves its own room to think,
especially the multi-floor work, which is the feature that got lost once already.

---

## Scope discipline — the thing to watch for

Ben flagged a real tendency to add complexity mid-build. The rule for this chat:

- If a new idea surfaces while working on the **current step**, name it, log it in
  `ADDITIONAL_FUNCTIONALITY.md`, and **finish the current step first**.
- Claude proactively flags scope drift rather than waiting to be asked.
  (Saved in memory so it carries into future sessions in this Project.)

---

## How to use this doc

- At the start of a planning conversation: check "YOU ARE HERE" to know what's next.
- After a code session completes and is committed: ask for a refreshed version of this
  file, and replace the copy in the Project.
- If a step splits into more than one session (likely for Step 4), the tree above gets
  a sub-list under that step rather than a rewrite of the whole doc.
