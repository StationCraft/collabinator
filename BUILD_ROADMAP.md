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
[ ] Step 4c — Sidebar + navigation  <-- YOU ARE HERE
```

**This chat's goal is complete when Step 4 is committed and tested.**

---

## What this leads to (not started, not this chat's job)

Once the infrastructure above is solid, a fresh planning chat picks up at the actual
building-tracing sequence, per `FUNCTIONALITY_SUMMARY.md`:

```
Ground floor tracing + origin point
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
