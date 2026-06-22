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
    [ ] Sub-step 4 — cross-page persistence & toggle state (save/restore)  <-- YOU ARE HERE
    [ ] Sub-step 5 — directional decoupling / primary-reference model
        (see ADDITIONAL_FUNCTIONALITY #15). Replaces bottom-up ghost/borrow with a
        user-reassignable primary-reference tree; trace order no longer forced.
        Z-stack + getAnchorFloor explicitly unchanged. Own pieces + cycle-guard testing.
```

**Sub-step 3 (confirm-scale lock) is complete. Next: Sub-step 4
(cross-page persistence & toggle state — save/restore per-page transform and toggle).**

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
