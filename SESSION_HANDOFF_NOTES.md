# Collabinator — Session Handoff Notes
*Captures context from chat conversation that is NOT in CLAUDE.md or FUNCTIONALITY_SUMMARY.md, plus a summary of this session's work and the forward build plan.*

**Note:** CLAUDE.md was rewritten by Claude Code at the end of the last session to match
the actual current implementation. This document assumes that rewrite is accurate and
does not duplicate it — it captures things that live ONLY in chat history: tooling
fixes, the recovery story, and specific architectural decisions made conversationally
that may or may not have made it into CLAUDE.md's prose. Worth a quick skim of the
current CLAUDE.md against this list to confirm nothing fell through.

---

## 1. Tooling & environment notes (not project logic — won't belong in CLAUDE.md)

These caused real friction and are worth remembering if they ever resurface, especially
on a new machine:

- **Claude Code Desktop project memory:** `C:\Users\ben\.claude.json` has a `projects`
  key that remembers trusted folders. It had a stale entry pointing at
  `G:\Shared drives\The ABC\Collabinator\Phase 1` with `hasTrustDialogAccepted: true`,
  which is why new sessions kept silently defaulting to the wrong drive. Fixed by
  editing that file directly and replacing the G: path with
  `C:\Users\ben\Collabinator\pdf-viewer`. If this ever resurfaces (e.g., new machine,
  new install): check this file first.
- **Always explicitly set Project folder** when starting a new Desktop session —
  don't rely on defaults/recents.
- **Enter key in the Code tab** sometimes inserts a newline instead of sending — a
  known, currently-open Claude Code Desktop bug. Workaround: **Ctrl+Enter** sends
  regardless.
- **Permission mode persistence:** `.claude/settings.local.json` in the project folder
  now has `"permissions": {"defaultMode": "acceptEdits"}` added, so new sessions open
  in Auto-accept-edits mode instead of Ask-permissions. This file is local/gitignored —
  personal to this machine.
- **Git is now set up and is the actual safety net.** Remote:
  `https://github.com/StationCraft/collabinator.git`, branch `main`. The original
  `App.jsx` (4 prior sessions of work) was lost to an accidental overwrite with zero
  recoverable backup — this is WHY git now exists and why "commit after every tested
  increment" is a hard rule, not a suggestion.

---

## 2. Key architectural decisions made conversationally this session

Worth confirming these are reflected in CLAUDE.md's current prose, since they were
decided mid-build rather than planned upfront:

- **Vertex-array storage from day one.** The original plan (CLAUDE_cleanup_specs.md,
  A.0.2) was to build segment-chains first and refactor to vertex arrays later. Since
  the rebuild started from scratch anyway, vertex arrays (`{vertices: [{x,y}]}`) were
  used from the very first drawing-tool increment — no segment-chain phase ever
  existed in the rebuild.
- **The old 8a–8d multi-floor pattern was deliberately NOT rebuilt.** It was already
  mid-redesign when lost (vertex-drag/break-point inherited geometry → abandoned for a
  simpler ghost-reference + confirm-scale + lock-transform model). The corrected design
  lives in FUNCTIONALITY_SUMMARY.md and has not been built yet.
- **Scale-gating is a hard rule:** the Draw button is disabled until a page's scale is
  confirmed. No shape can ever exist in unscaled pixel coordinates. This was added
  specifically because it wasn't true initially and could have let bad geometry into
  the data model.
- **Distance snap default is 6" (15cm metric) for plan/floor-plan pages specifically.**
  Elevations and cross-sections will likely want a different default later (finer, for
  window/door placement) — this was flagged explicitly so a future per-category default
  doesn't require fighting a hardcoded value.
- **Combine Shapes geometry rule (important, easy to get wrong):** Combine must NEVER
  move, snap, or angle-adjust any originally-traced vertex. It detects a **collinear,
  overlapping** edge segment between two shapes (not requiring full-edge exact match —
  T-junctions/partial overlaps are valid). Where an edge needs subdividing to splice
  the shapes, new vertices are inserted ONLY by exact linear interpolation on the
  shape's own existing straight edge — never by snapping or estimating. This went
  through three iterations this session (exact-match-too-strict → loosened correctly →
  fixed a related Move-Shape float-drift bug that was breaking eligibility detection
  after a move). If this logic ever needs touching again, preserve this rule above all
  else.
- **Move Shape must snap final vertex positions to the absolute page grid directly** —
  not snap the drag delta and add it to the original position. The latter caused
  floating-point drift that silently broke Combine eligibility after a move. Same
  `snapToGrid` formula must be used everywhere a vertex coordinate is finalized.
- **New PDF upload must fully reset ALL state** — completed shapes, in-progress trace,
  review state, scale/calibration, page grid origin, undo history — on every page, not
  just the current one. This was a real bug found and fixed this session.

---

## 3. This session's achievements (full rebuild from the lost App.jsx)

Everything below is built, tested, and committed to git:

1. PDF upload, rendering, page navigation (carried over from before the loss)
2. Calibration workflow — page reference line (now axis-snapped), imperial/metric
   scale dialog, scale-factor storage per page
3. Live drawing tool — vertex-array storage, axis/angle snap, distance snap with
   selectable increment (1″/3″/6″/12″ or metric equivalents, defaulting to 6″, ON by
   default), chaining, undo, escape
4. Shape closure detection + review/confirm workflow — distinct visual states
   (green = reviewing, blue = locked), discard bug fixed
5. Alignment guides within the active trace — snaps to other vertices in the same
   shape (H/V, ~10px tolerance), takes priority over axis snap, combines with distance
   snap — fixes the "accidentally non-square corner" problem
6. Scale-before-draw enforcement (Draw disabled until calibrated)
7. Post-completion editing on locked shapes: segment drag (perpendicular),
   vertex drag (grid-snapped), label numeric override (fixed to extend symmetrically,
   not just in original draw direction), undo stack, canvas-bounds clamping,
   button relabeling (Done / Edit Shapes)
8. Shared absolute page grid — first vertex of any new shape now also snaps to the
   same grid as everything else (previously only 2nd+ vertices did), so independently
   drawn shapes can share exact coordinates
9. Move / Combine / Split edit sub-modes
10. Combine Shapes — collinear-overlap detection (handles T-junctions, not just
    exact full-edge matches), strictly non-destructive to original geometry
11. Move Shape grid-snap precision fix (eliminates float drift breaking Combine
    after a move)
12. PDF-upload full-state reset bug fixed
13. CLAUDE.md rewritten to match actual current implementation

---

## 4. Deferred items (small, scoped, not yet built)

Carried from CLAUDE.md's "deferred" note — listed here too in case that note needs
double-checking:

- Delete-shape button in Edit Shapes mode
- Vertex insertion at edge midpoint (click-drag to add a control point), constrained
  to the active snap grid like all user-created/dragged vertices
- Vertex deletion via drag-onto-neighbor merge
- "Cancel" buttons currently mislabel exits that don't revert anything — should only
  say "Cancel" when clicking would actually revert a confirmed change; otherwise
  "Done"/"Back" language is more accurate
- Universal Shift-to-temporarily-release-axis-lock across ALL drawing/editing tools
  (currently inconsistent) — must still always respect the snap grid even with axis
  lock released; Split Shape specifically has no axis-lock at all yet and needs one
  added before this can be made universal

---

## 5. Forward build sequence (not yet started)

Per the original phased plan, after Phase 1's core tracing/editing toolkit is solid:

1. **Zoom/pan** — last remaining piece of the original Phase 1 toolkit. Worth doing
   before real architectural PDFs get traced, since dense/large-format drawings are
   hard to work with at fixed zoom.
2. **Compass rose alignment** — manual draggable/rotatable overlay, confirm, store
   actual angle + rounded N/NE/E/etc. label
3. **Page categorization + working area selection + sidebar** — category first, then
   crop/working-area box, fit-to-screen viewport, high-res toggle (temporary, for
   scale-setting), non-destructive recategorization
4. **Ground floor tracing + origin point** — same tracing tool, plus: any exterior
   corner can be the origin, user-selected with confirmation, changeable later
5. **Multi-floor reference & alignment, built correctly this time** — read-only
   toggleable reference ghost, confirm-scale locks the per-page transform
   `{tx, ty, s, angle}` to the whole canvas-stack (not just the PDF canvas — this was
   the original 8d bug), new polygons auto-snap to the same grid. Explicitly NOT the
   abandoned vertex-drag/break-point inherited-geometry model.
6. **Roof plan tracing** — same tool, flat/pitched type selection, slope lines
7. **Elevation calibration + tracing** — floor-line references derived from plan data,
   scale-to-next-floor-line, corner alignment, single continuous outline polyline
8. **Cross-section reference geometry**
9. **Windows/doors placement** — drag-and-drop blank + resize, frame vs. rough-opening
   toggle, suggested reference lines
10. **Phase 2 threshold** — 3D wireframe + spreadsheet output

Full detail for steps 2–9 is in `FUNCTIONALITY_SUMMARY.md` — that file should be read
by Claude Code before any of these increments are built, alongside CLAUDE.md.

---

## 6. Recommended next-session sequence

Given the deferred items are small/scoped and the forward sequence is larger new
feature work, recommend clearing the deferred list first (one focused session), then
moving to zoom/pan, then compass rose onward.

### Session prompt 1 — clear the deferred polish list

```
Read CLAUDE.md and FUNCTIONALITY_SUMMARY.md before starting.

Current state: drawing, calibration, shape closure/review/confirm, post-completion 
editing (segment/vertex drag, label override, undo, clamping), shared absolute page 
grid, and Move/Combine/Split edit sub-modes are all built and tested. Do not change 
the underlying snap, drag, or combine logic itself except where these fixes require 
touching axis-lock behavior specifically.

Four small fixes, all scoped to UI/interaction polish:

1. Delete-shape button: in Edit Shapes mode, add a way to delete a locked shape 
   entirely (e.g., select a shape, click Delete — confirm exact interaction pattern 
   makes sense given existing Move/Combine/Split selection UI). Deleting should push 
   to the undo stack like other edit actions.

2. Vertex insertion + deletion on existing shapes (in Edit Shapes mode):
   - Click-and-hold at a point along an existing segment (not on a vertex) to create 
     a new vertex there, then drag it to a new location. The new vertex's FINAL 
     dropped position must be constrained to the active snap grid, exactly like 
     existing vertex drag — this is a user-created/dragged vertex, not a geometry-
     preserving interpolation like Combine's splice points, so it should snap.
   - Vertex deletion: dragging an existing vertex until it overlaps another vertex on 
     the same edge should merge them (delete the dragged vertex, leaving the shape 
     with one fewer vertex at that location).

3. Button label logic: "Cancel" should only appear where clicking would revert an 
   already-confirmed change. Anywhere else that currently says "Cancel" but is really 
   just exiting/closing a mode with nothing to revert should say "Done" or similar — 
   audit all current "Cancel" button usages and relabel appropriately.

4. Universal Shift-to-release-axis-lock: currently axis-lock behavior is inconsistent 
   across tools. Add Shift-held-temporarily-releases-axis-lock to EVERY drawing/
   editing tool that has axis lock (draw tool, segment drag, vertex drag, label edit 
   where applicable). Split Shape currently has NO axis-lock at all — add axis-lock to 
   Split Shape first, then apply the Shift-release behavior to it along with 
   everything else. Releasing axis lock must NEVER bypass the active distance snap 
   grid — only the angle constraint is released, not grid snapping.

Stop when complete and give me a test checklist covering all four fixes individually. 
Commit once I confirm each works (commit all four together if they're tested in one 
pass, or incrementally if easier to verify separately — your call).
```

### Session prompt 2 — zoom/pan (send after prompt 1 is confirmed and committed)

```
Read CLAUDE.md and FUNCTIONALITY_SUMMARY.md before starting.

Current state: full drawing/editing toolkit (calibration, drawing, closure, post-
completion editing, Move/Combine/Split) is built and tested. Do not change any 
existing drawing/snap/edit logic.

Next increment: zoom and pan, per CLAUDE.md's description from the original Phase 1 
toolkit — mouse wheel to zoom, click-drag (or appropriate modifier) to pan, with 
correct coordinate mapping so that all existing tools (drawing, snap, alignment 
guides, segment/vertex drag, label click targets) continue to work correctly at any 
zoom level and pan offset. This is the last piece of the original Phase 1 toolkit 
before moving to compass rose and multi-floor work.

Stop when complete and give me a test checklist that specifically verifies snap 
accuracy and click-target accuracy (vertex hit-testing, label hit-testing) at several 
different zoom levels, not just at default zoom. Commit once confirmed.
```

After zoom/pan is confirmed and committed, the next prompt should cover **compass rose
alignment** (Section 5, item 2 above) — draft that fresh once you're there, since it's
genuinely new feature territory and deserves a clean prompt written against whatever
state the code is actually in at that point.
