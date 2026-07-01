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
    [x] Elevation spatial Piece 1 — "Set elevation edge" mode (89b7ba2): pick a floor-plan edge as
        horizontal reference; stored in elevationEdgeRef[elevPageId]
    [x] Elevation spatial Piece 2 — "Align elevation" mode (current): bbox + corner handles,
        uniform-scale drag, Confirm stores elevation's OWN pageScalesRef entry (peer calibration,
        not borrow; #22 honored)
    [x] Elevation spatial Piece 3 — floor/ceiling reference lines on aligned elevation
        Sub-piece 1 (1cb2c0b): drawElevRefLines — read-only teal floor + amber dashed ceiling
          lines in view mode; anchorY provisional at edge-midpoint Y; spacing from accumulateZ;
          floorHeightsTick wired into passive-redraw deps.
        Sub-piece 2 (b597e91): elevBaseYRef (per-elevation-page, pageId-keyed) — drag the base
          (lowest present level) floor line vertically to place the whole stack; offset persists
          across page-nav; provisional fallback unchanged; no floorHeightsRef writes.
        Sub-piece 3 (DEFERRED — shelved, not cancelled): drag individual floor/ceiling lines
          to edit heights (last-edited-wins); height editing stays panel-only for now.
    [x] Elevation spatial Piece 4 sub-piece 1 — closed-polygon tracing + edit on Elevation pages
        (5266dc5): drawElevRefLines wired into all redraw paths (draw/review/edit); floorHeightsTick
        added to draw/edit passive-repaint deps; elevation outline uses standard closed-polygon
        workflow — decision: closed polygon, not open polyline. Browser-verified (Session 21).
    [x] Elevation spatial Piece 4 sub-piece 2 — grade / soil line — DONE (Session 24)
        [x] Piece 1 (3fae81b): open-polyline draw tool + on-closure prompt; shapeKind:'grade-line'
            discriminator; drawGradeLineShapes in all 13 render paths; wall polygon unmodified;
            stored as 2D pixels via makeVertex; finish via Enter/button; clears on nav/upload.
        [x] Piece 2 — finish-anywhere + snap-as-aid (c7a2092, Session 24; net −28 lines):
            2b (2f3f071) and 2c (344668b) built wall-corner binding + floor-line snap. Entire
            binding REQUIREMENT reverted at c7a2092: a real grade line ended legitimately in open
            space between two building masses — the binding gate blocked a valid drawing and was
            the wrong abstraction. Grade line now finishes with >=2 vertices ANYWHERE (corner,
            floor line, or open space). Corner snap + floor-line snap remain as POSITION AIDS only
            (no boundStart/boundEnd written). Above/below-grade meaning = read-time intersection
            against intact wall polygon (#41, R3). Old 2e (follow-on-edit) is MOOT — nothing bound.
        [x] Piece 3 (e9c04a6, Session 25): "Redraw grade line" button — elevation-page toolbar,
            visible when isElevationPage && gradeLineOnPage && no active mode. Click deletes ALL
            grade-line shapes for currentPageId, repaints, re-enters draw mode (setDrawMode +
            setGradeLineDrawing). Wall polygon untouched. Browser-verified.
    [x] Elevation spatial Piece 4 sub-piece 3 — windows/doors Pieces 1+2: placement layer (Session 26)
        Piece 1 (data spine): stable shape ids (shapeIdCounterRef + nextShapeId); shapeKind
          'window'|'door' discriminator; dimensionBasisRef project-level setting; OPENING_TYPES list;
          drawOpeningPoly / drawOpeningShapes in canvasRenderer.js; isOpening() helper at all sites;
          getEligibleShapes excludes openings from combine; Edit Shapes inclusion/exclusion rules.
        Piece 2 (interaction + dialog): "Place opening" toolbar button (elevation + scale gated);
          first-use dimension-basis gate; two-click free rectangle (useAngle=false); opening dialog
          (Kind/Type/Width/Height/Label); confirmOpening + discardOpening with immediate canvas repaint;
          1" default snap on placement + Edit Shapes entry when openings present (priorSnapIncrementRef
          save/restore); persistent top-bar snap selector (one selector, always visible, disabled when
          no scale; prior in-toolbar selectors removed). Browser-verified.
    [x] Windows/doors Beat 1 — storage fix + 3D loop + enumeration panel (Session 36; commits 961d098, 7d939c3)
        Fix (961d098): confirmOpening was discarding user-entered dimensions after sizing the pixel
          rectangle. widthM/heightM never stored → deriveWireframe skipped every opening (guard
          `!op.widthM||!op.heightM`); deriveEnumeration emitted null for both. openingLabel renamed
          to label to match both consumers. storedWidthM/storedHeightM captured from parseFtIn
          before vertex resize. The 3D openingLines render path and STEP D fenestration branch had
          NEVER fired on live data — this was the first execution. Browser-verified: __dumpEnumeration
          showed real widthM/heightM/worldZm; orange opening rectangle visible in 3D View (#55 done).
        Envelope panel (7d939c3): showEnumeration + enumerationTick state; deriveEnumeration()
          hoisted out of the DEV guard into component render scope (was scoped to if(DEV) — invisible
          from JSX); window.__dumpEnumeration re-wrapped in new DEV guard; enum-btn (teal) + enum-panel
          (right:900px) CSS; panel groups by kind (Wall Surfaces/Soffits/Windows/Doors) with named
          fields per element — no recomputation in panel (§7.3 honored); reconcile tags color-coded
          via data-tag; empty state message. Browser-verified: 13 elements match __dumpEnumeration (#52 done).
    [x] #46 Stage Two — place-from-structured-list (Session 50)
        User-assigns placement: normalized opening entries sit in a holding area; user picks an
          entry and clicks once on an elevation page to place. Source-agnostic (WEW Bridge is first
          upstream source; placement path has no WEW-specific code).
        pendingOpeningsRef (useRef([])) + pendingOpeningsTick; persists across page-nav; clears on upload.
        "Openings to place" sidebar tab: lists entries with mark/kind/×qty/operationType(verbatim)/location hint.
          Place button gates on isElevationPage && pageHasScale; closes panel and enters placingFromEntry mode.
        placeOpeningFromEntry(entry, pos): single-click placement; reads frameWidthM/frameHeightM (or rough
          per dimensionBasisRef); always sets non-null widthM AND heightM (the one coupling risk, guarded);
          produces shape identical to confirmOpening() output; decrements remaining; removes entry at 0.
        loadPendingOpenings(entries): normalises entries (adds remaining from quantity).
        window.__loadPendingOpenings(entries): DEV injection path; logs summary.
        SEED OPENINGS DEV-strip button: loads 3 test entries (W1×2, W2×1, D1×1).
        Harness: 24 → 34 PASS (10 new checks n.w, n.d, o.w×2, o.d×2, p.w, p.d, q.w, q.d).
        Stage One (recognition/ingestion from raw schedule data) remains gated on #28.
    [ ] Windows/doors Piece 3 — three-layer snap (off critical path)
    [ ] Windows/doors Piece 4 — dumb duplicate (off critical path)
    [ ] Cross-sections (DEFERRED — windows/doors intentionally builds first)
[x] Pixels→real-world coordinate foundation — DONE (R2 / Path 3; Session 18; commits 040e371, 71e01ca)
    Approach: Path 3 / 3-minimal (supersedes the 4a/store-meters-natively scope from Session 17).
    Geometry stays stored in pixels; meters are a read-time projection through named helpers.
    Piece 1 (040e371): pxToMeters/metersToPx named seam in canvasRenderer.js; all inline px↔meter
    math routed through them (behavior-neutral). Piece 2 (71e01ca): makeVertex(x,y) factory in
    geometry.js; all stored-polygon-vertex construction routed through it (R3-ready shape, z absent).
    R3-readiness criteria met: Z-ready vertex shape + no coordinate-coincidence merging (#19).
    Composing pageRefParent chain onto stored geometry = R3, sequenced after.
[x] Wireframe composition seams B1+B2 — DONE (Session 27; commit 9e5bd0d)
    B1: getWorldOriginM() + pageVertexToWorld(v,pageId) → world XY in meters.
    B2: elevYToWorldZ(y,elevPageId) → world Z in meters (named inverse of drawElevRefLines).
    Composes in METERS (not canvas pixels) — sheet-size dependency dissolved.
    pageRefOffsetRef tried and removed (wrong unit). Scale always resolved via getEffectiveScale.
    __dumpWorld() DEV verification tool added. See WIREFRAME_RECON_REPORT.md for gap tracking.
    [x] B3: widen getGhostSourcePageId so Roof Plan pages enter ghost/borrow path — DONE (d4e99d8)
        Gate widened to admit 'roof-plan' alongside 'floor-plan'; subLabel not required for roof.
        Fallback scan starts at floorOrder.length (above all floors) → highest floor with locked shapes.
        Scale borrow via getEffectiveScale chain identical to floors. __dumpWorld extended with
        roof-plan block. Verified: pxPerMeter=59.08 [confirmed] after confirm (was MISSING before).
    [x] B4: derivation core — DONE (Session 30; commit 106d847)
        Derivation core complete: floor Z lift via accumulateZ; per-edge closest-approach reconcile
        (cantilever/setback/coincident, signed perpendicular distance + point-in-polygon sign);
        soffit/eave combine (roof bbox vs wall-below bbox, threshold from projectConfigRef);
        fenestration Z path (elevYToWorldZ on opening centroidY). Output = __dumpEnumeration
        console dump. No render, no panel.
        Config-store forks settled: minimal physical-only extensible slice; new projectConfigRef
        (NOT the §9 config layer); console dump only.
        [x] Fixture prereq DONE (Session 29): default fixture rebuilt self-contained —
            PDF bytes bundled; Crawlspace + Main Floor composing in world XY (borrow chain,
            pxPerMeter=114.83); roof polygon with 1ft overhang on two edges; elevation page-2
            calibrated with live Z (Z@anchor=0.0000). Verified via __dumpWorld round-trip from
            committed default.
    [x] B5: 3D envelope wireframe — DONE (Session 31; commits 7c44e24, 622e76d)
        SCOPE CLARIFICATION (gate-expiry sweep, Session 63): "DONE" = LINE wireframe only.
        Floor/ceiling RINGS are lifted to their datum Z via accumulateZ — correct. What is NOT
        done and must NOT be claimed: (1) per-ELEMENT z (the makeVertex z field — gated on R3,
        see #66); (2) envelope SURFACES / fill (B6, deferred #54). Checkable "element-Z done"
        condition: `completedShapesRef` vertices carry a non-null `z` resolved through a named
        seam. That field does not exist today (makeVertex returns {x,y}). So element-Z = NOT done.
        Piece 1 (7c44e24): deriveWireframe() pure fn (component scope, outside DEV block) returning
          { floorRings, roofRing, soffitLines, openingLines } in world meters; ThreeDView.jsx component
          (three.js LineSegments, OrbitControls, PerspectiveCamera, cleanup on unmount); "3D View" toolbar
          button (gated on getWorldOriginM() non-null); axis mapping worldX→x, worldY→z, worldZ→y(up);
          floor rings #22d3ee, ceiling rings #f59e0b, walls #94a3b8, roof ring #a78bfa; camera framed to
          wireframe bbox; AxesHelper(0.5) at world origin.
        Piece 1a (folded into 7c44e24): AxesHelper(3) → AxesHelper(0.5) — geometry was correct;
          bug was the helper's 3m Z-arm overshooting the 2.59m Crawlspace footprint. Found after two
          instrumentation passes that exonerated all ring/vertical/roof geometry paths.
        Piece 2 (622e76d): soffitLines (re-derived from world bbox vs roof bbox, same 0.05m threshold
          as deriveEnumeration STEP C; 3 segs/soffit: outer eave edge + 2 returns at eaveZm) and
          openingLines (per opening: world XY via elevation edge midpoint+direction, Z via elevYToWorldZ,
          widthM × heightM rectangle in wall plane); soffit #c084fc, openings #fb923c; legend bar extended;
          __dumpWireframe DEV function extended. 2 soffits (N+W) verified visually; 0 openings in fixture —
          opening-line VISUAL verification DEFERRED until a test opening is placed (#55).
          Lines only; envelope surfaces = B6 (deferred, #54).
[x] Project-configuration layer (§9 step 3) — DONE (Session 32; commits 4cca140, eb82eba, a049854)
    Piece 1 (4cca140): projectSetupRef + CONFIG_FIELDS descriptor schema (10 fields / 4 categories:
      outputs[multi], jurisdiction, 4 assemblies @2-opts, 4 equipment lite); getConfigValue/setConfigValue
      accessor seams; reset-on-upload; __dumpProjectSetup. Distinct from B4 projectConfigRef. Console-verified.
    Piece 2 (eb82eba): operator panel (ps-panel, floor-heights house style) — fields .map()ed from
      CONFIG_FIELDS grouped by category; checkboxes (multi) / dropdowns (single); projectSetupTick re-render.
      Browser-verified: selections persist across close/reopen.
    Piece 3 (a049854): OUTPUT_ROLES + ROLE_LABELS map; getRequiredRoles() computed view (outputs→roles,
      deduped, never stored); roleAssignments store + accessors; "Required Roles" panel section with
      name-entry + owner-fallback marker. Browser-verified: live recompute, dedup, persistence, fallback.
    Forks settled (planning): A=separate ref; B=coarse output→roles map, sub-rules later; C=operator panel
      now (full-page form deferred, ADDITIONAL_FUNCTIONALITY #57); D=2 assembly opts/category;
      E=equipment lite, inert (spawns hook empty, reserved for §8.2).
[x] Config-driven worklist system (§8.2) — DONE (Session 33; commits 4635e59, 6ae5f53, 0a962f5)
    Part A (4635e59): ITEM_TYPES table (4 types: air-handler, outdoor-unit, bath-fan, hrv-unit);
      spawns hook filled as function (value)=>[{type,count}] on space-heating / ventilation /
      bath-fans fields; new 'count' descriptor kind on bath-fans; deriveWorklist() pure computed
      fn (fresh every render, never stored — fh-outstanding precedent); worklistTick re-render;
      worklist panel (purple, right:600px) with to-place list and blocked-obligation preview;
      __dumpWorklist() DEV tool. Console-verified: 5 items, correct obligation output.
    Part B (6ae5f53): isEquipmentItem helper; drawEquipmentItemShapes export (purple circle +
      initials, zoom-compensated) wired into all 14 render paths (5 edit sub-modes, 5 named draw
      fns, 4 inline repaints); single-click placement on floor-plan OR roof-plan pages; point shape
      stored as shapeKind:'equipment-item' in completedShapesRef (single vertex, pixels only,
      recalibration-independent via pageVertexToWorld); deriveWorklist() subtracts placed items by
      instanceKey from toPlace, populates per-placed obligations with live property <select>;
      three obligation kinds: run (blocked, 🔒), property (live-editable once placed), placement
      (reserved); move/delete via Edit Shapes; excluded from insert/split/combine via isEquipmentItem
      guards; __dumpWorklist() extended with world XY + obligationState.
    UX fixes (0a962f5): bath-fans count input uses psCountDrafts string-draft so field clears
      freely (0 renders as empty); delete sub-mode hover ring for equipment markers (red, 18px).
    Verified in browser: place on floor-plan, place on roof-plan, mount-type select live after
      place, world XY via __dumpWorklist(), move updates XY, delete returns to toPlace (#22
      recalibration-independence confirmed: marker stays pinned to PDF on rescale).

[x] §8.2 step 4: Runs as 3D paths (v1) — DONE (Session 34; commit 6d3dc3c)
    RUN_PAIR_MAP module-level pair→category table (seed: air-handler↔outdoor-unit → lineset);
    resolveRunPairEntry() pure lookup; shapeKind:'run' in completedShapesRef (grade-line precedent,
    pixels only via makeVertex); persisted uncharacterized state (new model — no prior precedent);
    buildCharacterizedRun() + clearRunSatisfaction() immutable helpers; commitRun() derives
    endpoints at commit time (fresh proximity check, Z-undo-safe); "Draw run" button (floor/roof
    pages, confirmed scale); purple hover ring on equipment snap; finish-anywhere ≥2 verts;
    drawRunPaths() wired into all 14 render paths; run exclusions in hitTestVertices/hitTestSegments/
    getEligibleShapes/all 5 drawEditCanvas loops/drawLockedShapes/drawGhostShapes; delete sub-mode
    reverses characterization on run delete AND on equipment-item delete; worklist "✓ Connected"
    on satisfied run obligations; deriveWireframe extended with runLines (scalar Z from floor/roof
    zStack); ThreeDView renders run lines by category with legend entries.
    Fenced: #64–68 (envelope-crossing, multi-hop cascade, slope/per-vertex Z, conflict checks,
    role-wiring) — all logged in ADDITIONAL_FUNCTIONALITY.md.
    Browser verification: DONE (Session 35 open; characterization, worklist flip, deletion reversal,
    3D line at level Z all confirmed against fixture).

[x] §8.3 Build 1: run slot storage shape — DONE (Session 35; commits 7c921ff, 607f6be, 2feb3e5)
    Run shapes now carry BOTH raw geometry (vertices:[{x,y}]) AND identity/characterization layers
    (pointSlots:[{id:'ps-N',x,y,itemRef}] + spanSlots:[{id:'ss-N',category}]).
    vertices invariant: vertices[i].x === pointSlots[i].x for all i — verified by __dumpRuns().
    Build 1 regression (dropping vertices from runs broke all uniform iterators) diagnosed and
    fixed in 607f6be. __dumpRuns() extended with MATCH/MISMATCH + positions-agree check.

[x] §8.3 Build 2: profile table + derived solids — DONE (Session 35; commits a961430, cba3932)
    SEGMENT_PROFILES / SEGMENT_PROFILE_FALLBACK / POINT_PROFILES base-case constants (module-level,
    config-read seam comment). deriveWireframe returns solids:[] — cylinder/box-swept per spanSlot,
    block per equipment item; pure parameter objects. ThreeDView two-effect architecture: main
    effect builds scene (dep [wireframe]); toggle effect only flips .visible on solidMeshesRef
    (dep [showSolids]) — camera never resets on toggle. window.__dumpSolids() DEV hook.
    Browser verified: amber tubes correct geometry (r=12.5mm, honest 1" placeholder); purple
    blocks on-level; toggle no camera reset; all regression guards pass.

---

## SEQUENCED TRACK TO PHASE 2 (set Session 36)

**Governing sequencing principle (Session 36):** Do not stack invisible-infrastructure
builds back-to-back. The recent stretch (slot model, enumeration engine) was correct
architecture that produced little or no on-screen change — which reads as "no progress"
to a visual, results-driven owner even though the work was sound. Remedy is ORDER, not
more building: bracket each invisible build with a visible-payoff beat. The track below
is arranged so most beats are things Ben can see.

```
[ ] BEAT 1 (VISIBLE) — Windows/doors 3D loop + enumeration render  [size ~5, paired]
    Pair #55 + #52, built as ONE session (both make already-built computation visible):
    - #55: place a test opening in the fixture; confirm it renders in 3D (orange rect at
      correct world XY/Z) AND fires the enumeration fenestration branch (STEP D) on real data.
    - #52: put deriveEnumeration() output on screen — a deliberately-dumb v1 geometry list
      panel first (rows of elements + size/orientation); sorting/grouping is later polish.
    Payoff: place opening -> see it in 3D -> see it appear as a row in a real geometry list.
    Highest visible-progress-per-hour available in the remaining sequence. Also closes the
    "where did the geometry output go" confusion (it was console-only via __dumpEnumeration).
    §7.3 VIGILANCE: the enumeration panel is the FIRST non-renderer consumer of derived
    quantities. Confirm each quantity is read from ONE named function attached to its element,
    not recomputed in panel code. Cheap to honor now, expensive to retrofit.

[x] BEAT 2a (INVISIBLE) — Config cross-field rules: resolveEffectiveConfig seam + auto-fill + spawn-dedup  [DONE — Session 37, commit f5553fa]
    #58 cases b + c:
    - `heat-pump-ducted` option added to cooling field (honest label)
    - `resolveEffectiveConfig(rawValues)` pure module-level function; `CONFIG_CROSS_FIELD_RULES`
      hand-authored rule array (forward-proofs #74 data-driven replacement)
    - Rule 1: heat-pump-ducted space-heating → prefills cooling = heat-pump-ducted (if unset)
    - Spawn dedup: deriveWorklist collects all spawn requests, merges by type (max count);
      shared appliance appears once in worklist regardless of how many fields imply it
    - getConfigValue = raw user intent; resolveEffectiveConfig called at exactly two consumers:
      deriveWorklist + panel render. Two honest separately-inspectable truths.
    Key lesson: seam was first wired into universal getConfigValue read path — caught and
    reverted to the two specified consumers before verification (over-broad seam would have
    made #74 harder to reason about). See SESSION_HANDOFF_NOTES Session 37.

[ ] BEAT 2b (INVISIBLE) — Config option-gating: energy-source fields + dependency rules  [BLOCKED]
    #58 case a + #59:
    - Utilities/energy-source fields at site (gas, electric, heat-pump-eligible)
    - Option-filtering rules in resolveEffectiveConfig: energy source gates which equipment
      options are offered in space-heating, water-heating, etc.
    PREREQUISITE (#75): Beat 2b must NOT start until Ben's spreadsheet project (#63) is baked
    enough to mine for the energy-source field schema and gating rules. Design before the
    source data exists = redesign when it lands. Ben signals readiness.
    If Beat 2b is blocked, go to Beat 3 next.

[x] BEAT 3 (VISIBLE) — Cross-trade obligation -> role wiring  [commit 1aae356]
    #68 + #61: descriptive trade tags ((plumber)/(electrician)) structured as `trades:[]`
    on ITEM_TYPES obligations; `trade:` scalar on RUN_PAIR_MAP categories. ownerRoles derived
    at worklist time; rows show "Owner: X" / "Owners: A, B" / "Owner: unassigned".
    NOTE: rows show the ROLE LABEL only (e.g. "HVAC Designer"), NOT the assigned person's
    name — person-name lookup (reads roleAssignments) deferred per Session 38 fork B.
    "envelope" obligations (vent-to-exterior, exterior-vent) have trades:[] — no role in
    ROLE_LABELS maps to envelope work (#78 to add role or reclassify).

[x] BEAT 4 — Panel consolidation (#69)  [DONE — Session 40, commit 145d807]
    Four independent overlay panels → one tabbed side-panel container. Narrow (< 520px):
    vertical stacked accordion labels. Wide (≥ 520px): horizontal browser-style tabs.
    Drag-to-resize left edge handle (300px min, 80vw max). Width persists within session;
    cross-session persistence deferred (no localStorage in codebase — needs decision).
    Toolbar gate applies to both the button and the container render.

[x] ASSEMBLIES ONTO SURFACES — Area slice  [DONE — Session 41]
    Gross/net/opening area as named derived quantities on every wall-surface element.
    Opening→wall-surface association via elevationEdgeRef reference-edge key (one reference
    edge per elevation page; all openings on that page attributed to that wall surface).
    Per-surface partition check (gross = net + openings) in __dumpEnumeration; 10/10 PASS
    on fixture. Envelope panel displays area row per wall surface. Limitation #88 logged
    (multi-story elevation: all openings associate to reference-edge floor level only).
    Whole-envelope closure invariant logged as #87 — gated on missing surface kinds.
    NEXT: assembly-type assignment per surface (assemblyId attach layer); extend
    CONFIG_FIELDS options with thicknessM + controlLayerM data.

[x] VERIFICATION INFRA — __verifyFixture harness + golden sidecar  [DONE — Session 42]
    Precondition built (688f8aa): fixture-elevation.json received window (W1 1.2×0.9m) + door
    (D1 0.9×0.4394m) on page-2, both associating to wall-sh-1-seg2-Main_Floor; combined
    opening total 1.47546m² (displays "1.4755" at 4dp).
    Golden sidecar created: public/devFixtures/fixture-elevation.expected.json — frozen expected
    values for 10 wall surfaces, grossTotalM2=68.4695, netTotalM2=66.9941, openingTotalM2=1.4755,
    2 soffits, 1 window, 1 door, subtractionSurface id/gross/net/opening. Tolerance ±0.0001m².
    window.__verifyFixture() (e1a3215): async DEV fn (DEV block, after __dumpEnumeration); fetches
    sidecar; checks (a)-(i): wallSurfaceCount, grossTotal, netTotal, openingTotal, soffitCount,
    windowCount, doorCount, subtractionSurface id+grossM2+netM2+openingM2; partition invariant
    (gross==net+openings for all wall surfaces with height); closure stub prints SKIPPED (#87 gated).
    Browser-verified 12/12 PASS; negative control (grossTotalM2=99) → exactly check (b) fails only.
    The harness existing removed one stated blocker of #28, but #28 (plan reader) remains gated
    on the post-3D-model deep-review waypoint.

[x] ASSEMBLIES ONTO SURFACES — Attach slice 1  [DONE — Session 43; commit 6d849f1]
    Per-surface assembly assignment; data layer only. Two-tier manual/library resolver
    (surfaceAssemblyRef + getSurfaceAssembly). STEP A of deriveEnumeration() extended with
    assemblyTier/effectiveUValue/thicknessM fields. __dumpEnumeration assembly line per surface.
    Golden sidecar extended with assemblyCheck block; __verifyFixture() now 15/15 checks + partition.
    Fixture re-anchored: openings hand-re-placed by Ben (new dims: window 0.381×0.5588m,
    door 0.762×1.7272m); sidecar re-frozen from verified dump (netTotalM2=66.9405,
    openingTotalM2=1.5290). Negative control verified: U-value corruption → exactly check (j) fails.
    Envelope panel row extended: assembly tier + U/thickness per wall surface.
    3D thickness rendering deferred to a later slice.
    Live bug logged: #94 (opening 3D placement wrong side of wall — RESOLVED Session 44, commit 8fe8ba7).

[x] ASSEMBLIES ONTO SURFACES — Attach slice 2  [DONE — Session 45; commit 6dab52d]

[x] 3D WALL-PANEL RENDER — thickness slice  [DONE — Session 46; commit 8f1dd30]
    Part 1: wall panels as solid geometry in ThreeDView; assemblyType-driven growth direction
    (wall inward / horizontal outward); totalThicknessM from assemblyLibraryRef.
    insideFaceAreaM2 derived in STEP A (not yet consumed; F280 next).
    Part 2: TDZ fix — moved const solids=[] before its first use; 3D View now mounts on
    first click. 17/17 harness PASS; Ben visual confirmed inward growth.
    Contract ingest + library-tier resolver (geometry-scoped fields only).
    Contract lives in C:\dev\assemblylibrary\ASSEMBLY_CONTRACT.md (separate repo).
    assemblyLibraryRef: useRef({}) keyed by assemblyId; cleared on PDF upload.
    ingestAssembly(record): stores { assemblyId, label, assemblyType, totalThicknessM, layers[] }
      (layerId/materialId/thicknessM/pathRole per layer). Silently ignores deferred thermal/framing
      fields (effectiveUValue, effectiveRSI, framing, controlLayers, airFilms) — forward-compatible
      with Assembly Builder Part 3 in-flight.
    getSurfaceAssembly library tier: resolves assemblyId → { thicknessM:totalThicknessM, layers, source:'library' };
      missing id → source:'library-unresolved', no crash. Manual tier unchanged.
    window.__ingestAssembly(record): DEV injection path; logs summary + per-layer detail.
    Verified: 15/15 harness PASS; library resolve thickness=0.2540m/layers=5; missing id → unresolved, no crash.
    Assembly Builder Part 3 SHIPPED (2026-06-28) — thermal fields frozen, available to ingest.

[x] ASSEMBLIES — Thermal-field ingest slice  [DONE — Session 49]
    effectiveUValue, effectiveRSI, controlLayers ingested by ingestAssembly and stored on
    assemblyLibraryRef record. getSurfaceAssembly library tier now returns all three fields.
    deriveEnumeration STEP A pushes effectiveRSI + controlLayers onto each wall-surface element
    alongside existing effectiveUValue. controlLayers null-preservation: null = "does not manage
    this function" (not missing data); preserved exactly through ingest → resolver → element.
    Harness extended: __verifyFixture checkEq helper + thermalCheck golden block; fixture self-
    inject record extended with effectiveUValue:0.28, effectiveRSI:3.5714, controlLayers
    {water:'l5', air:'l4', thermal:null, vapour:'l2'}. 7 new checks (m)–(m.cl.*).
    17/17 → 24/24 PASS. Framing block + airFilms silently ignored (tool-side, not ingested).

[x] OPENING THERMAL FIELDS — uw + shgc on opening records  [DONE — Session 52, 2026-06-28]
    Read F280_COMPLIANCE_SPEC.md Section 4 (CollabinatorF280 @ d94c18a, read-only) for the contract.
    Fields added to opening record (additive; widthM/heightM coupling guard unchanged):
      - uw: number | null — user-facing U-value in W/m²·K (metric); verbatim from WEW bridge
        performance.uw; null for interactive placement until dialog UI session adds entry.
      - shgc: number | null — dimensionless; windows: verbatim from bridge performance.shgc or null;
        DOORS: always 0 (opaque-by-model rule — glazed portion is a future parented sub-item, #104).
    getRsiW(uw): module-level pure function = 1/uw; engine-internal only; never stored.
    deriveEnumeration STEP D: uw + shgc emitted per fenestration element.
    Harness: 34 → 42 PASS (8 new (r.*) checks: bridge values verbatim, rsiW absent on record,
      getRsiW derived correctly from real value and null, door shgc === 0).
    Fallback path for no-rated-data projects: #103 (window-builder selector, deferred).

[x] FLAT-ROOF SURFACE ELEMENT — Slice 6 in deriveEnumeration  [DONE — Session 55; commit dccce9e]
    STEP A.5 inserted between wall surfaces (STEP A) and soffits (STEP C).
    Iterates confirmed roof-plan pages; shoelace area of roofType:'flat' locked polygons in world
    meters; one flat-roof-surface element per page carrying grossAreaM2, insideFaceAreaM2,
    roofCeilingZm, and full getSurfaceAssembly seam fields.
    __dumpEnumeration extended; __verifyFixture check (s)/(s.area) added; sidecar re-frozen
    (flat-roof-page-7 area=22.9471 m²). Envelope panel row added. 44/44 PASS.

[x] F280 ENDPOINT — first heat-loss calculation  [DONE — Session 56]
    deriveF280Heating(enumeration, resolvedConfig): pure derive-on-demand, not stored.
    F280_TI_HEATING = 22°C; ΔT = Ti − Toh; four surface kinds (wall / flat-roof / window / door).
    notModeled[] list makes partial coverage explicit. Extensible spine (below-grade, slab, solar
    gain are additive rows). No-climate guard returns { status:'no-climate' }. F280 Results tab
    in consolidated side-panel. __dumpF280() DEV hook.
    NOT golden-gated (deliberate — "nearly compliant, sooner" target; 9/10 walls show unresolved U
    on Bates fixture because surfaceAssemblyRef had only 1 entry when snapshot was saved — not a bug).
    STRATEGIC PIVOT (Session 56): target shifts to "nearly-compliant full heat loss/gain sooner;
    compliance as a later pass." Building paused for geometry back-to-basics review.

    NEAR-TERM ARC (all gated on geometry review first):
    [ ] #106 — Assembly-inheritance fix: wire CONFIG_FIELDS assembly-wall/roof/floor/foundation to
        getSurfaceAssembly miss path; add U-value lookup table; make Project Setup the project-level
        default, Envelope panel inputs per-surface overrides. Unlocks full wall U-coverage.
    [ ] #107 — Flat-roof UI gap: add assembly/U input block to Envelope panel for flat-roof-surface
        rows (App.jsx ~7339–7350). Incidentally handled by #106 default-inherit.
    [ ] #108 — Window/door uw post-placement edit: add edit dialog to change uw/shgc after placement.
    [ ] Below-grade + slab geometry: geometry modeled before loss engine built.
    [ ] Ground-coupled base-level loss: SEPARATE engine (BasementHLR.xls / SlabOnGradeHLR.xls method;
        soil conductivity, depth below grade, exposed perimeter, design month → single Watts result).
        Base-level interim = U·A·ΔT vs a ground temperature once geometry is present.
    [ ] Solar gain: additive result row in deriveF280Heating.

[ ] ENVELOPE PENETRATION SUBSYSTEM (#79) — ARCHITECTURE SETTLED (Session 39), NOT YET SEQUENCED
    Founding-principle subsystem. Entity model, three-way detail derivation, detail-on-assembly,
    responsible-party primitive, PENETRATION_DETAIL_RULES engine, derived trade-plan-set export —
    all settled (see ADDITIONAL_FUNCTIONALITY #79). BUILD GATED on #74 (data-driven rule layer)
    + #75 (spreadsheet authoring pass). Spun off #80 (supplier catalogue), #81 (trade-assignment
    model), #82 (thermal-bridge). Build prompt is authored when #74/#75 unblock — do not sequence
    before then.

[ ] LARGE / SEPARATE CHAT — Differential slot population  [size ~7, wide error bars]
    The payoff of the Session-35 slot model: filling individual point-slots and span-slots
    with different profiles (fitting at an interior bend, size change mid-run) vs the uniform
    tube. Most visible 3D progress AND most likely to fracture into sub-forks. Deserves its
    own room to think. Do NOT pair with Beat 2 (two risky builds back-to-back = fracture risk).
    NOTE: this is POPULATION, not rebuild — the slot structure already supports it.
```

**Off-critical-path (unchanged):** windows/doors Pieces 3+4 (three-layer snap, dumb duplicate)
remain available but are not on this track.

**Fenced / Phase-2-gated (do NOT pull into this track):** #64 envelope-crossing, #65 multi-hop
cascade, #66 per-vertex Z/slope, #67 conflict/clearance, spine taxonomy, duct transitions,
region-spines, DXF export, 6.6 floor-system structural population. The deferral register is
holding; none of these carries weight on the near beats. #66/R3 (per-vertex z-seam) is the
deferral with the longest reach — it will likely define the boundary of "Phase 1 done" — but
is correctly fenced and should NOT be pulled forward.

---

## ⏸ PLATEAU WAYPOINTS — post-#5 / pre-#29  ← TRIGGERED 2026-06-29 (commit 8d6e57d)

**Trigger:** After #5 (region-pages) fully lands — Fork B/C/D done, crop-carving UI working,
region-pages verified — and BEFORE #29 (derived elevations) begins. Two scheduled waypoints,
in sequence.

**STATUS: Trigger condition met; (a) DONE, (b) is this pass.** #5 is fully done (Forks A–D +
crop-carving UI, 44/44 verified). Waypoint (a) coordinate-seam extraction is DONE and pushed. Waypoint
(b) roadmap reconciliation is executing now (Session 70).

**SETTLED SEQUENCE (Session 70):**
Waypoint (a) coordinate-seam extraction is DONE and pushed (`src/coords.js`, Stages 0–6). Waypoint (b)
reconciliation is this pass. Settled near-term order after (b) lands and docs re-upload:
  1. **Beat 0 cheap wins:** #53 (cantilever/setback hover-label — **DONE as a #29 sub-output, Session 71,
     ed43c6d**), #118 (source-sheet arrow-nav exclusion removal — DONE), #112 (carveMode nav-reset — RESOLVED).
  2. **#29 derived elevations — FIRST PIECE DONE (Session 71; commit ed43c6d):** aligned-edge
     setback/protrusion hover-label on the toggleable floor-plan ghost (elevation-hosted via
     `getEffectiveGhostSource` + `drawGhostShapes`; view-mode only; single-source-page #88; strictly-parallel
     walls, `PARALLEL_EPS_M = 0.001`). Remaining pieces: simple-massing derived block, confirm-view,
     isometric depth view (#126, recon-gated). (The #125 opening-on-carve item is an OPEN render-gap bug,
     NOT a #29 dependency and NOT instrumentation — do not couple it to #29.)
  3. **Thermal arc:** #106 (assembly-inheritance default), #107 (flat-roof UI gap), #108 (window/door
     `uw` post-placement edit) — geometry-review gate SATISFIED (geometry-stable review passed after the
     #117/#124 frame work).
A parallel-track approach for #106–108 was considered and REJECTED — all three live inside App.jsx (shared
ground); branch-management overhead is not worth it for a ~5–6 session arc. Run them sequentially on main.

**[x] (a) SIMPLIFICATION PASS — coordinate-layer extraction — DONE (Session 69; commits 8381ef3–7b2479d)**

**Session 63 (overnight plateau deep-review, unsupervised):** Ran the full five-section review
(strategy / UI / code / process / gate-expiry) + self-critique + triage. Findings and ready-to-run
HOLD prompts are in SESSION_HANDOFF_NOTES Session 63. Landed only what was harness-provable and
non-seam: one cosmetic fix (commit d78bd40 — dead `carveMode` cursor ternary) + this doc
reconciliation. Waypoint (a) coordinate-extraction was DESIGNED, not built (too large for
unsupervised — see the HOLD prompt). Waypoint (b) executed as: gate-expiry sweep (#3 SUPERSEDED by
#5; #110 GATED-READY; #111 already GATED-READY) + stale-claim fixes (this file + CLAUDE.md). A
full per-item gate-rephrase across all 112 register entries was NOT mass-edited unsupervised
(judgment-heavy, error-prone); it is a HOLD prompt for a focused pass with Ben. Harness on
fresh restore: __verifyFixture 44/44, __verifyCrop 10/10.

**Session 65 follow-on (commit e92aae3) — Build 2 carve-on-aligned-elevation, changes 1+3 of 3:**
A post-#5 measurement-correctness fix landed before the plateau (does NOT change plateau status). Carving
a region from an *aligned/scaled* source now stores a correct raw-sheet crop (`crop = T⁻¹(boxed) = (R−t)/s`)
and propagates the source scale ÷s onto the region's own pageId (no borrow chain). The build prompt's
literal change-3 ("scale carries directly") was corrected to ÷s — geometrically forced, prevents a silent
factor-s wall mis-measurement (#22). **Change 2 (full-page carve reachability over the negative align
overhang) was surfaced and DEFERRED** — it's a shared-layout seam (measureRef offset + canvas-stack
overflow); logged as ADDITIONAL_FUNCTIONALITY **#113**. Harness on fresh restore: __verifyFixture 44/44,
__verifyCrop 17/17.

**Session 66 follow-on (commit f1fffac) — #114 repaint-trigger fix (does NOT change plateau status):**
The three overlay passive-redraw `useEffect`s keyed on `currentPage` (sheet number) but not `currentPageId`
(logical-page identity), so navigating among a source sheet and its carved regions (which share a sheet
number) cleared `measureRef` but re-fired no repaint → blank overlay until a mode change. Fix = add
`currentPageId` to all three dep arrays (approach-(a), 3 single-line additions; bodies/renderPage/nav/carve
untouched; pure repaint-trigger, no measurement math). Refined trigger: "≥2 logical pages sharing one sheet
number." Verified by Ben's eyeball (harness never the detector). Exposed two PRE-EXISTING bugs, logged not
fixed: **#109** (mis-registration on source-sheet return — now reliably reproducible, was masked by the
blank overlay; batch with #24) and **#115** (carved elevation region has no Place-opening — opening-entry/
category-inheritance gap; needs recon). This is ALIGNED with waypoint (a): the repaint-trigger dependency
seam is now correct; the coordinate/transform extraction (item 1) remains the highest-value plateau work.

**Session 67 follow-on (commit 2521bbd) — #115 fix + #110 region outlines + viewport-as-unit reframe (does NOT change plateau status):**
Three region-pages UX items shipped together. **#115** (carved elevation has no Place-opening): fixed with a
forced-categorize-on-carve modal — every new region must be explicitly classified before it enters navigation;
cancel discards the carve and reverses all companion state. **#110** (standing region outlines on source
sheet): `drawRegionOutlines` in canvasRenderer.js draws green labeled rectangles for confirmed regions,
mapped through the source's align transform. **Viewport-as-unit model** settled (VISION_SUPPLEMENT §11):
carved regions and full sheets are both first-class classified viewports; silent category inheritance is
architecturally wrong and is rejected. Two-field model: `subLabel` = semantic (Z-stack / ghosting consumers);
`regionName` = display name only. Harness: 44/44 + 17/17.
Three regressions reconned read-only — none caused by this arc: **#118** (source-sheet arrow-nav exclusion
wrong under viewport model — low-risk fix); **#117** (transform-registration failure on aligned pages —
HIGH PRIORITY, pre-existing since at least f7aff47; PDF backdrop `.pdf-align-layer` + overlay `measureRef`
diverge when `s≠1`; supersedes/batches #109 + #24); `__restoreFixture _version` error pre-existing cold-call
only (button path correct).
**Next highest-priority work: #117 recon** (read-only, transform-authoring vs. application path) before any
fix attempt.

**Session 62 follow-up (commit ee9427f):** A post-#5 interactive-verification defect was fixed before
the plateau — region render cross-bleed + regionCounter restore-collision. As a side effect, `renderPage`
is now **identity-first** (`renderPage(pdfDoc, pageId, …)`; sheet number derived via `pageNumFromId`;
`goToPage`/`goToRegionPage` unified into `goToPageId`; arrows region-aware via `navPages`). This is
ALIGNED with waypoint (a): the page-identity/navigation seam is already cleaner. The coordinate/transform
seam (item 1 of the simplification pass) is still untouched and remains the highest-value extraction.
Also: gate-expiry sweep tagged **#111 (region auto-fit) GATED-READY**; **#112 (carveMode-on-nav)** logged.

### (a) SIMPLIFICATION PASS — coordinate-layer extraction — DONE (Session 69)

**Outcome:** `src/coords.js` is the single conversion seam. All px↔m, ft/in↔m, screen↔canvas,
similarity/T⁻¹, and CSS-transform-string math routes through it. No raw conversion arithmetic
remains in App.jsx (outside the documented intentional exceptions — see CLAUDE.md seam architecture).

**Stage commits (Session 69):**
- Stage 0 `8381ef3` — coords.js seam file created, primitives moved
- docs `75429bc` — log #120/#121
- Stage 1 `f32c159` — opening px↔m routing
- Stage 2 `edb908f` — derivation feet→m, byte-identical
- Stage 3 `ba38404` — elev Y↔Z unified to one core
- Stage 4 `dc70b72` — ft/in dialog conversions
- docs `2146d36` — log #122/#123
- Stage 5a `5888e4e` — align-drag similarity, both handlers
- Stage 5b `2e7caf5` — carve T⁻¹ + wheel zoom-anchor
- docs `874d9bc` — log #124
- Stage 6 `7b2479d` — JSX pan/zoom CSS builder

**End state (checkable invariant):** the six Tier-2 ref-bound wrappers (`getEffectiveScale`,
`getWorldOriginM`, `pageVertexToWorld`, `elevYToWorldZ`, `getCanvasPos`, `clampToCanvas`) + `coords.js`
are the ONLY places raw scale.pxPerMeter / 0.3048 / 0.0254 / T⁻¹ similarity math may appear in
App.jsx. Any new inline conversion in App.jsx is a regression against this invariant.

**Intentional exceptions (DELIBERATE — do NOT "fix"):**
- `geometry.js` `parseDisplayDistInput` keeps its own 0.0254 — pre-existing pure seam, outside scope
- DEV harness `expectedAnchorZm` (~App line 5128) keeps raw 0.3048 — independent oracle; routing it
  through the same primitive it checks would defeat the check
- Snap-grid `<option>` value literals (~App line 6426) keep raw 0.0254 — data constants, not conversion
  math; routing them shifts by 1 ULP and breaks `<select value>` matching (a visual regression)
- Two CSS-transform builders (`buildViewTransformCSS` for backdrop + `buildPanZoomTransformCSS` for
  pan/zoom) are NOT unified — the two sites emit genuinely different byte-level string shapes; one
  shared shape can't be byte-identical

**Next:** run **(b) ROADMAP RECONCILIATION** before starting #29.

---

### (b) ROADMAP RECONCILIATION + GATE-REPHRASING

**Purpose:** Reset the deferred register against reality before the next large feature block
begins. A one-time pass, not a recurring obligation — but scheduled now so it is not skipped
when the moment comes.

**Scope:**
- Mark true built/building/deferred state. Several items marked "deferred" are done; B5 is
  marked DONE but delivered only line-wireframe (element-Z is NOT done and should not be
  claimed as done).
- Re-walk EVERY deferred item's stated gate. Tag each one:
  **gate-still-real** / **gate-lifted-ready** / **gate-partially-lifted**.
- **Named deliverable:** Rewrite every gate as a CHECKABLE CONDITION, not a vibe. Not "needs R3"
  but the specific thing that must exist (e.g. "needs per-element `z` field on
  `completedShapesRef` entries"). A future session must be able to test the gate yes/no without
  relying on institutional memory. This is the direct fix for the F280-drift failure mode —
  items sitting ready behind a gate that barely exists anymore.
- Reorganize the near-term sequence around what is actually unblocked after the sweep.

**Scope boundary:** Lightweight prose only — do NOT build a formal dependency graph or tracking
system; that would itself rot. Larger strategic questions (refs architecture, #8/#17
discipline-layer model) belong at the ⏸ deep-review waypoint below, not here.

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
