# Collabinator Phase 1 — Cleanup & Refactor Specs (A.0.1–A.0.3)

These three focused sessions prepare the codebase for Phase 1.5 (compass rose, page categorization, elevations).

---

## Session A.0.1 — Fix 8d Alignment Bug

**Problem:** After confirming scale on page 2 (8d), the PDF canvas is transformed (translate + scale) but the measure/drawing canvas (sibling in `.canvas-stack`) is not. Traces land in the wrong spot because `getCanvasPos()` reads from the unshifted measure canvas.

**Fix:** Apply the CSS transform to the entire `.canvas-stack` div instead of just the PDF canvas. Both canvases move together, `getBoundingClientRect()` on `measureRef` returns the correct shifted position.

**Changes:**
1. In `handleConfirmScale`, change target from `canvasRef.current.style` to `canvasStackRef.current.style` (or add a new ref to the `.canvas-stack` div if it doesn't exist)
2. Test: page 1 → draw polygon, confirm floor → page 2 → show ref → align → scale → confirm → draw a new polygon on page 2 → verify it traces directly over the visual PDF, not offset

**Success criteria:** Drawing on a scaled/aligned page 2 lands exactly where you see the PDF, with no drift.

---

## Session A.0.2 — Vertex Array Refactor + Dead Code Cleanup

**Part 1: Switch polygon storage from segment-chains to vertex arrays**

Current: `{segments: [{a, b, dist}], pageNum, floorLevel, elevationZ}`
New: `{vertices: [{x, y}], pageNum, floorLevel, elevationZ}`

Changes:
1. Update `completedShapesRef.current` structure — store vertices, not segments
2. Update all places that create/modify shapes:
   - `handleDrawClick` (when closing polygon)
   - `confirmShape` (when confirming review state)
3. Update all places that read shapes:
   - `drawCompletedShape` — derive segments from vertices on-the-fly
   - `drawGhostShape` — derive segments from vertices
   - `computeGhostBBox` — iterate vertices directly (simpler)
   - `hitTestCompleted` (both segment and label hit tests) — derive segments
   - `handleSegmentDrag` — derive segments, update vertices
   - `commitLabelEdit` — update vertex, recalc adjacent segments
   - `applyGhostTransform` — work with vertices directly
4. Helper function: `getSegmentsFromVertices(vertices)` — return segment array (used wherever segments are needed)
5. Test: draw a polygon, close it, edit it (drag segments, type labels), verify it still works identically to before

**Part 2: Delete dead code**

1. Delete `scaleSet` state (line ~317) and its setter
2. Delete `pageScaleConfirmedRef` ref (line ~349) — replace all uses with `pageTransformsRef.current[pageNum] != null`
3. Make `floorElevZ` optional in floor modal (remove `required` validation)
4. Merge `getAngleSnapped` and `getSnapped` — add a `distSnap: boolean` parameter to `getSnapped`, use that to conditionally apply distance snap
5. Test: entire app still works, no console errors, no broken functionality

**Success criteria:** Polygon data is cleaner, code is shorter, all functionality preserved.

---

## Session A.0.3 — Per-Page Transform Struct + Page Categorization Data

**Part 1: Per-page transform as struct (not CSS strings)**

Current: `pageTransformsRef.current[pageNum] = { transform: 'translate(...) scale(...)', transformOrigin: '...' }`
New: `pageTransformsRef.current[pageNum] = { tx: number, ty: number, s: number, angle: number }`

Changes:
1. Update `handleConfirmScale` to store `{tx, ty, s, angle: 0}` instead of CSS strings
2. Create helper `getCSSTransform({tx, ty, s, angle})` that returns the CSS string (used when applying to DOM)
3. Update `applyStoredPdfTransform(pageNum)` to use the helper
4. Update `cornerDragRef` and corner-scale math to work with the struct
5. Test: 8c corner scaling still works, 8d confirm still works, visual transforms are identical to before

**Part 2: Page categorization data structure**

Add to `projectState`:
```
pages: [{
  pageNum: number,
  category: 'floor-plan' | 'elevation' | 'cross-section' | 'detail' | 'roof-plan',
  subcategory: string,  // "Ground", "L1", "L2", "North", "South", etc.
  workingArea: {x1, y1, x2, y2} | null,  // crop box coords, null if not set
  compass: {angle: number} | null  // compass rose rotation, null if not set
}]
```

Changes:
1. Add `pages` array to `projectState` initialization
2. Create a helper `getPagesByCategory(category)` to query pages
3. Update `goToPage` to recognize pages by their stored metadata (prep for sidebar in Phase 1.5)
4. No UI changes yet — just data structure plumbing
5. Test: project state persists page metadata, no errors

**Success criteria:** Page metadata can be stored, queried, and persists through page navigation.

---

## Outcome

After these three sessions:
- 8d alignment bug fixed and tested
- Polygon storage simplified (vertices, not segments)
- Dead code removed
- Per-page transforms as queryable structs (ready for compass rose math)
- Page categorization data structure in place (ready for sidebar in Phase 1.5)
- Codebase is cleaner, ready for compass rose overlay

**Next:** Phase 1.5 begins with Session A.1 — Compass Rose Alignment UI.

