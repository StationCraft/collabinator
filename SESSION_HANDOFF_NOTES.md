# Collabinator — Session Handoff Notes
*Captures context from chat conversation that is NOT in CLAUDE.md or FUNCTIONALITY_SUMMARY.md,
plus a running record of each session's work and the forward build plan.*

**Note:** CLAUDE.md is kept current by Claude Code at the end of each session to match
the actual implementation. This document captures things that live ONLY in chat
history: tooling fixes, the recovery story, architectural decisions made
conversationally, and a session-by-session log — worth a quick skim against the
current CLAUDE.md to confirm nothing fell through.

---

## SESSION 40 — Beat 4: panel consolidation (#69) — tabbed side-panel container (2026-06-27)

**Branch:** main | **Commit:** 145d807 — pushed to origin.

### What was built

One consolidated right-side container replacing four independent absolute-positioned overlay panels
(Project Setup, Floor Heights, Worklist, Envelope). Layout/shell only — zero functional change to
any panel's content or behavior.

**State changes (App.jsx):**
- `showProjectSetup`, `showFloorHeights`, `showWorklist`, `showEnumeration` useState → removed.
  Replaced by `showSidebar` (bool), `activeTabId` (string, init `'project-setup'`), `sidebarWidth`
  (number, init 300), `sidebarWidthRef` (useRef 300).
- Four show* values are now derived constants: `showProjectSetup = showSidebar && activeTabId === 'project-setup'` etc.
- Legacy setters defined as `() => setShowSidebar(false)` so existing ✕ buttons and Place-button
  close logic work unchanged.
- `SIDEBAR_TABS` module-level constant (order: Project Setup, Worklist, Floor Heights, Envelope).

**Container (JSX):** Single `<div className="side-panel-container">` replaces four separate panel
divs. Contains: drag-resize handle, tab bar, `.side-panel-content` div with conditional renders of
all four panels (existing fh-panel JSX preserved verbatim inside, including fh-panel-head).

**Two layout modes** driven by `sidebarWidth >= 520` (the wide-mode breakpoint):
- **Narrow (< 520px):** tab bar is a vertical flex column of four clickable label bars. All four
  labels always visible; active is highlighted; content fills below.
- **Wide (≥ 520px):** tab bar becomes a horizontal flex row (standard browser-style tabs across
  top, active underline). Same activeTabId drives both; switching mode does NOT change active panel.

**Drag-to-resize:** mousedown on left-edge handle attaches mousemove/mouseup to document;
`newW = clamp(300, startW - Δx, 80vw)`. Updates both `sidebarWidthRef.current` and
`setSidebarWidth` for immediate DOM update and React re-render. Width persists across
close/reopen within the session. **Cross-session persistence deferred — no localStorage in
this codebase. Needs a storage decision before implementing.**

**Toolbar gate:** `!calibMode && !drawMode && !editMode && !categorizeMode` applied to BOTH the
Panels toolbar button AND the container render — entering a mode hides the container entirely
(not just the button).

**CSS:** New `.side-panel-container`, `.side-panel-resize-handle`, `.side-panel-tab-bar`,
`.side-panel-tab`, `.side-panel-content` rules added. `.side-panel-content .fh-panel` override
resets all absolute-positioning rules so the existing fh-panel divs flow naturally inside the
container. Dead rules removed: `.ps-panel right:300px`, `.wl-panel right:600px`,
`.enum-panel right:900px`, `.wl-btn`/`.enum-btn` color rules.

### Verified (preview server 5175)
a. Open sidebar → narrow mode: four stacked labels, Project Setup expanded at bottom ✓  
b. Click each label → correct panel switches in, others collapse above ✓  
c. All four panel contents render correctly (Floor Heights inputs, Worklist Place buttons,
   Project Setup selects, Envelope enumeration) ✓  
d. Drag wider past 520px → wide mode (horizontal tabs), same active panel; drag back → narrow reverts ✓  
e. Close sidebar, reopen → width and last-active tab both preserved ✓  
f. Reload → width resets to 300px (no cross-session persistence; flagged) ✓ / ⚠ flagged  
g. Enter draw mode → container hidden, "Panels" button hidden; exit draw mode → both reappear ✓  

### Forward
Beat 4 complete. Next: Beat 2b (gating fields — awaits Ben's #75 authoring pass) or the
#79 envelope penetration subsystem (gated on #74/#75). Cross-session panel-width persistence
needs a storage decision when desired.

---

## SESSION 39 — Envelope Penetration Subsystem: architecture settled (#79); no build (2026-06-26)

**Type:** Intensive planning session (no code). Docs-only commit.

### What was settled
Full entity + rule + export model for the envelope penetration subsystem (#79), the founding-principle
anchor logged Session 38. See ADDITIONAL_FUNCTIONALITY #79 for the complete settled model. Headlines:
- Penetration = derived entity, dual-source (run-spine crossing OR placed item), origin-blind downstream.
- ONE coordinated coded detail per penetration; per-layer treatments are facets; one detail on the plan.
- Three-way derivation: assembly params × project envelope settings × interacting item → detail code.
- Generic tier is the base; supplier (SIGA-style) is optional refinement, never a prerequisite.
- Detail resides ON THE ASSEMBLY as an area-occupying sub-region; stores occupied-area + thermal-bridge
  slots now, consumers deferred. Thermal bridge is building-understanding, NOT a compliance feed.
- Each facet carries a RESPONSIBLE PARTY: born as a scope, resolved downstream to a named party.
- PENETRATION_DETAIL_RULES = distinct engine (autofill generator, editable prefill), beside
  CONFIG_CROSS_FIELD_RULES under #74's data roof, separate schema. Auto-prompt fires only on
  parameter underspecification.
- Trade-plan-set export = purely derived projection (filter facets by responsible party + layers),
  with optional saved named filters. QR per-penetration; penetrations page is the index.
- QR per-penetration links to a register entry holding spec + materials + (if resolved) order line
  AND a video of how that coded detail is installed, scanned off the paper plan. Page is the index.

### Spun-off register entries
#80 supplier-catalogue integration · #81 trade→responsible-party→person assignment model ·
#82 thermal-bridge quantification. #78 marked resolved-through-#79.

### Build gate
#79 build does NOT start until #74 (data-driven rule layer) AND #75 (spreadsheet authoring pass)
are ready. This session produced architecture + register entries only; the build prompt is authored
when #74/#75 unblock.

### Forward
Next visible beat unchanged (Beat 4 panel consolidation, or Beat 2b if #75 lands). #79 waits on #74/#75.

---

## SESSION 38 — Beat 3: trade→role structure + role-only owner render (#68 + #61) (2026-06-26)

**Branch:** main | **Commit:** 1aae356 — pushed to origin.

### What was built

**Read-only recon (Beat 3 prep):** Full static trace confirmed trade tags were English prose baked into `ob.label` strings ("Condensate drain (plumber)") — no structured field. The §9 role model (ROLE_LABELS, roleAssignments, person-assignment UI) already existed from Session 32. The gap was one-sided: obligation→role mapping had zero structure.

**`trades: string[]` on ITEM_TYPES obligations:** Every obligation entry now carries a `trades` field with role ids from ROLE_LABELS. Multi-trade where genuinely warranted: `mount-type` gets `['hvac-designer', 'designer']` (clearance + setback/aesthetics), `supply-exhaust-duct` gets `['hvac-designer', 'energy-advisor']` (HRV ducting = HVAC spec + appears in h2k/f280 energy model). Two obligations left at `trades: []`: `vent-to-exterior` and `exterior-vent` — "(envelope)" has no role in ROLE_LABELS (#78).

**`trade` scalar on RUN_PAIR_MAP:** `lineset` entry gets `trade: 'hvac-designer'` — category-level, authoritative for run obligations in the map (takes priority over obligation-level `trades`).

**`ownerRoles` derived in `deriveWorklist`:** For run-kind obligations: check RUN_PAIR_MAP.satisfies for the obligation id → use category `trade` if found, else fall back to `ob.trades`. For property obligations: use `ob.trades` directly. Result is `ownerRoles: string[]` attached to each obligation object.

**Worklist row render:** Secondary `.wl-oblig-owner` line in all three obligation branches (satisfied run / blocked / property): "Owner: X" for one, "Owners: A, B" for many, "Owner: unassigned" for empty. Role label via ROLE_LABELS — NO person-name lookup from roleAssignments (deferred per fork B).

**`__dumpWorklist` updated:** Each obligation log line now shows `ownerRoles=[...]` and the resolved label string.

### Fork B deferred
Person-name lookup (reads `projectSetupRef.current.roleAssignments[roleId]`) was explicitly deferred. The BUILD_ROADMAP Beat 3 line originally said "show the assigned person's name" — amended to reflect role-label-only this build.

### Unresolved trade gap (#78)
"envelope" obligations (bath-fan vent-to-exterior, HRV exterior-vent) have `trades: []` because ROLE_LABELS has no envelope/contractor role. These show "Owner: unassigned" in the worklist. Logged as #78 in ADDITIONAL_FUNCTIONALITY.

### Verification (browser — preview server 5175)
Injected minimal fixture (4 placed equipment items, page-1 Main Floor + scale). Read DOM directly:
- `outdoor-unit#1 / mount-type` → `Owners: HVAC Designer, Designer` ✓ (multi-trade)
- `hrv-unit#1 / supply-exhaust-duct` → `Owners: HVAC Designer, Energy Advisor` ✓ (multi-trade)
- `air-handler#1 / condensate-drain` → `Owner: Plumber` ✓ (single trade)
- `air-handler#1 / lineset-endpoint` → `Owner: HVAC Designer` ✓ (from RUN_PAIR_MAP category)
- `hrv-unit#1 / exterior-vent` → `Owner: unassigned` ✓ (empty trades, envelope gap)
- No person names visible anywhere ✓

### Forward
Beat 2b (gating fields) still pending Ben's #75 authoring pass. Beat 4 (panel consolidation) is next visible beat. #78 (envelope role) and #61-person (person-name on row) are follow-ons.

---

## SESSION 37 — Beat 2a: config cross-field rules — resolveEffectiveConfig seam + auto-fill + spawn-dedup (2026-06-26)

**Branch:** main | **Commit:** f5553fa — pushed to origin.

### What was built

**Beat 2a read-only recon (first):** Full static trace of CONFIG_FIELDS descriptor shape, getConfigValue/setConfigValue, deriveWorklist spawn loop, and panel render. Confirmed the existing flat model — all fields independent, spawns: null on cooling, no dedup. Found that the `cooling` field had no "heat pump" option — only `central-ac` and `none` — which would have forced a semantically wrong auto-fill. Stopped and flagged before writing code.

**Option added — cooling field (f5553fa):** `{ value: 'heat-pump-ducted', label: 'Ducted heat pump (heating + cooling)' }` added as first option in the `cooling` field of `CONFIG_FIELDS`. Narrow honesty fix only — equipment-topology nuance (#60 dual-fuel, #76 furnace-as-air-handler) deferred.

**`resolveEffectiveConfig` seam (f5553fa):** Module-level pure function `resolveEffectiveConfig(rawValues)` with a named `CONFIG_CROSS_FIELD_RULES` array — hand-authored rule set, one entry today. Structure explicitly forward-proofs #74: replace the rule array contents only; consumers are untouched. Added between `ROLE_LABELS` and `function App()`.

**Rule 1 — heat-pump-ducted-implies-cooling:** `when: raw['space-heating'] === 'heat-pump-ducted' && raw['cooling'] == null` → `apply: { cooling: 'heat-pump-ducted' }`. Prefilled-but-editable: only fires on null cooling; never clobbers a non-null user selection. Raw storage is the authoritative user-intent signal.

**Spawn dedup (f5553fa):** `deriveWorklist` now collects all `{type, count}` from all spawn functions into `maxCountByType`, merging by type with `Math.max` (shared appliance = max needed, not additive). Builds to-place and obligations from the deduped set. `air-handler#1` and `outdoor-unit#1` appear exactly once regardless of how many fields imply them.

**Seam wiring — two consumers only:** `getConfigValue` restored to raw (user intent, no resolve). `resolveEffectiveConfig` called at exactly two sites: top of `deriveWorklist` (as `resolvedCfg`) and top of the Project Setup panel render IIFE (as `resolvedPanelCfg`). Both use `resolved[field.id] ?? getConfigValue(field.id)` so default-value handling (count→0, multi→[]) is preserved.

### Key lesson — seam caught before commit

Initial implementation wired `resolveEffectiveConfig` into `getConfigValue` (the universal read path). Ben flagged this as over-broad before verification: the correct boundary is raw=user-intent (getConfigValue), resolved=engine-view (resolveEffectiveConfig at named consumers). The synthesize-on-read approach was mechanically correct for all five checks — the raw null cleanly separates unset from user-set — but the architecture boundary matters more than mechanical correctness here because #74 will pile many rules behind this seam. Reverted and re-wired before any verification ran.

### Verification (all five — Ben confirmed)
1. Space-heating = heat pump, cooling unset → cooling auto-fills "Ducted heat pump (heating + cooling)" ✅
2. User manually sets cooling = Central A/C → not clobbered on re-read ✅
3. User clears cooling to null → auto-fill fires again ✅
4. `__dumpWorklist()` → air-handler#1 and outdoor-unit#1 each exactly once ✅
5. Regression: HRV → hrv-unit#1; bath-fans=2 → bath-fan#1 + bath-fan#2; gas furnace → air-handler/outdoor-unit gone ✅

### Side finding logged
**#76** — Furnace is itself an air handler; gas furnace should also spawn an air-handler item. Deferred to equipment-setup session, pairs with #60 (dual-fuel) and #74 (data-driven dependency layer).

### Forward
Beat 2b (gating — #59 energy-source fields + option-filtering rules) is next but has a prerequisite: #75 authoring pass (Ben's spreadsheet baked enough to mine for config schema). Beat 2b does NOT start until #75 is ready. Beat 3 (cross-trade obligation → role wiring, #68 + #61) is the alternative next visible beat if Beat 2b is not yet unblocked.

---

## SESSION 36 — Beat 1: opening storage fix + 3D loop (#55) + Envelope panel (#52) (2026-06-26)

**Branch:** main | **Commits:** 961d098 (opening storage fix), 7d939c3 (Envelope panel) — both pushed to origin.

### What was built

**Beat 1 read-only recon (first):** Full static trace of opening placement → storage → 3D render path → enumeration STEP D. Found two bugs in `confirmOpening`: (1) `widthM`/`heightM` never stored — `deriveWireframe` guard `!op.widthM || !op.heightM` skipped every opening, making the orange 3D lines a dead code path; (2) `openingLabel` stored but `op.label` read by both consumers. Confirmed fixture already has an elevation page with confirmed scale + edge, so placing one opening would fire both paths.

**Piece 1 — opening storage fix + first live execution (961d098):**
- `confirmOpening`: capture `storedWidthM`/`storedHeightM` from `parseFtIn` before vertex resize; store as `widthM`/`heightM` on shape object; rename `openingLabel` → `label`. No other code used `openingLabel` (confirmed by grep).
- Placed test window on fixture elevation page; `__dumpEnumeration()` showed `widthM=1.4478m, heightM=1.4224m, worldZm=2.2397m` (all real, not null). 3D View showed orange opening rectangle. First live execution of both `openingLines` render path and `STEP D` fenestration branch.
- Ben re-snapshots fixture after this commit (test opening now part of standard scenario).

**Piece 2 — Envelope panel (7d939c3):**
- `deriveEnumeration()` was inside `if (import.meta.env.DEV)` block — inaccessible from JSX, causing `ReferenceError` on panel render. Hoisted to component render scope; `window.__dumpEnumeration` re-wrapped in new DEV guard.
- `showEnumeration` + `enumerationTick` state (mirrors Worklist pattern). Tick bumped on shape lock/delete, floor-height writes, page nav.
- "Envelope" toolbar button (teal `enum-btn`); `enum-panel` at `right:900px`. Panel groups by kind (Wall Surfaces / Soffits / Windows / Doors); named fields per element; reconcile tags color-coded via `data-tag`; empty state message. All quantities read from named element fields — no recomputation (§7.3).
- Browser-verified: 13 elements, matches `__dumpEnumeration()` output exactly.

### Key lesson reinforced
`deriveEnumeration` being inside the DEV guard compiled clean and Vite ran the dev server without a parse error — the `ReferenceError` only appeared at runtime when the panel tried to call it. Compile-clean is NOT the verification line.

### Forward
Beat 2 planning needed. Next candidates: §8.2 step 5, opening Piece 3/4, or panel consolidation (#69 deferred to Beat 4). Ben to re-upload the five docs to the Project.

---

## SESSION 35 — §8.3 Build 1 + Build 2: run slot storage + profile/solids (2026-06-26)

**Branch:** main | **Commits:** 7c921ff (Build 1 slot storage), 607f6be (Build 1 fix), 2feb3e5 (__dumpRuns invariant), a961430 (Build 2 profile+solids), cba3932 (log cleanup) — all pushed to origin.

### What was built

**§8.3 READ-ONLY RECON (first):** Five questions answered before writing code — confirmed deriveWireframe contract, ThreeDView consumption, Z application path (scalar from zStack/roofZFallback), equipment completely absent from 3D (no geometry anywhere), and run interior vertices are anonymous bend-points in storage (no identity until Build 1).

**§8.3 Build 1 — slot storage shape (7c921ff + 607f6be):**
- Run shapes migrated from flat `vertices/endpointItems/category` to carrying BOTH:
  - `pointSlots: [{id:'ps-N', x, y, itemRef:string|null}]` — identity + characterization layer, one per vertex
  - `spanSlots: [{id:'ss-N', category:string|null}]` — one per consecutive vertex pair
  - `vertices: [{x,y}]` — raw geometry layer restored (see regression below); invariant: `vertices[i].x === pointSlots[i].x` for all i
- `psCounterRef` / `ssCounterRef` monotonic counters; `nextPsId()` / `nextSsId()` helpers; both cleared on PDF upload.
- `buildCharacterizedRun` rewrote to use `pointSlots` — builds `newPointSlots` with itemRef, `newSpanSlots` with category; spreads `...run` so vertices flow through.
- `clearRunSatisfaction`, `hitTestShapeBody`, delete sub-mode all updated to read `pointSlots`/`spanSlots`.
- `deriveWireframe` runLines: reads `run.pointSlots[i]` for XY (not `run.vertices`).
- `__restoreFixture`: defensive skip drops pre-Build-1 runs (no `pointSlots`) instead of crashing.
- `__dumpRuns()` extended with per-run `vertCount`, `slotCount`, `MATCH/MISMATCH`, and `positions-agree` boolean.

**Build 1 regression and fix (607f6be):** Initial Build 1 dropped `vertices` from run shapes. Caused two crash sites: `getVisibleVertices` (`.flatMap(s => s.vertices)` no guard — crash on every mouse-move) and `snapshotShapes` (`.vertices.map()` no guard — crash on every delete/undo). Fix: restore `vertices` as raw geometry alongside slots. Uniform iterators get a real array; slots remain authoritative for identity/characterization. Browser-verified: `MATCH` and `positions-agree=true` confirmed.

**§8.3 Build 2 — profile table + derived solids (a961430 + cba3932):**
- `SEGMENT_PROFILES` (lineset → `{sweep:'extrude-circle', diameterM:0.025}`, duct → `{sweep:'extrude-rect', widthM:0.150, heightM:0.150}`), `SEGMENT_PROFILE_FALLBACK`, `POINT_PROFILES` (air-handler/outdoor-unit/bath-fan/hrv-unit block dims) — all module-level constants with "BASE-CASE CONSTANTS, config-read seam comment."
- `deriveWireframe` extended: returns `solids:[]` — one `cylinder`/`box-swept` per spanSlot per run (profile from `SEGMENT_PROFILES[spanCat] ?? fallback`); one `block` per equipment item (profile from `POINT_PROFILES[shape.itemType]`). Pure parameter objects; no three.js. Z resolution for equipment uses identical 4-line scalar-Z lookup as runLines (not a parallel path).
- Equipment block `center.z = equipZ + hM/2` so block sits ON the level, not through it.
- `ThreeDView.jsx` split into two effects: main effect (dep `[wireframe]`) builds scene, renders all meshes (including solids), stores solid meshes in `solidMeshesRef`; toggle effect (dep `[showSolids]`) only flips `.visible`. Camera never resets on toggle.
- `MeshBasicMaterial` (no scene light needed), `opacity:0.45`, `side:DoubleSide`.
- Solids toggle button in header; equipment `■` legend entry (purple 0x8b5cf6).
- `window.__dumpSolids()` DEV hook: calls `deriveWireframe()` and prints kind/radiusM/length/center per solid.
- Build 2 fix (camera reset on toggle) identified and fixed before commit. Lineset cylinder geometry confirmed correct-but-small (r=12.5mm, ~1" honest placeholder); not inflated.

### Architecture decisions locked this session

- **Add-a-layer-not-replace:** when a storage shape grows a new identity layer (`pointSlots`), keep the raw geometry layer (`vertices`) so uniform iterators (which have no shapeKind guard) continue to work. Removing raw geometry is a breaking change disguised as a refactor.
- **`vertices` invariant:** `vertices[i].x === pointSlots[i].x && vertices[i].y === pointSlots[i].y` for all i. `__dumpRuns()` checks this; run it after any run-storage change.
- **Compile-clean ≠ verification; failed-check ≠ passed-check.** Two real bugs survived a clean build this session (the regression and the camera reset). Browser verification with explicit checks is the only close-out line.
- **Inline noisy logs → window.__ hooks:** per-open `console.log` converted to `__dumpSolids()` callable hook following `__dumpRuns()` pattern.
- **Profile table is the config-read seam:** `SEGMENT_PROFILES`/`POINT_PROFILES` are base-case constants with explicit seam comment. Downstream config-driven size layer replaces reads here only (principle 5.2). Never hardcode profile dimensions elsewhere.
- **Derived solids are never stored:** recomputed each `deriveWireframe` call. Parameter objects only; no three.js in the derive fn.
- **Duct category has a profile but no run currently resolves to 'duct':** profile present for when `RUN_PAIR_MAP` gains a duct entry. Not a dead-code warning — it's deliberate forward-proofing.

### Invariant checkers added

- `window.__dumpRuns()` — prints per-run: vertCount, slotCount, MATCH/MISMATCH, positions-agree=true/false, pointSlot detail with itemRef.
- `window.__dumpSolids()` — calls `deriveWireframe()`, prints kind/radiusM/widthM/heightM/length/center for each solid.

---

## SESSION 34 — §8.2 step 4: Runs as 3D paths (v1) (2026-06-25)

**Branch:** main | **Commit:** 6d3dc3c — pushed to origin.

### What was built

**§8.2 step 4 — run-path model, full piece:**

- **`RUN_PAIR_MAP` + `resolveRunPairEntry`** module-level (App.jsx): unordered pair→category table. Seeded with one entry: `{air-handler, outdoor-unit} → lineset`, satisfying `lineset-endpoint` (air-handler) and `lineset-to-handler` (outdoor-unit) using real ids from ITEM_TYPES. Adding a new run type = one new data row only (principle 5.3).
- **Storage:** `shapeKind: 'run'` in `completedShapesRef` (grade-line precedent — single open-polyline array, no separate ref). Stored fields: `{ id, shapeKind:'run', vertices, pageId, status:'locked', endpointItems:{start, end}, category }`. Vertices via `makeVertex` (pixels, recalibration-independent).
- **Persisted uncharacterized state (headline new model):** A run commits to `completedShapesRef` in deliberately-incomplete state and survives page-nav and reload. No prior precedent in the codebase.
- **`runDrawing` useState** + **`runItemSnapRef`** useRef — draw state and live equipment snap target (visual only; no binding until commit).
- **`findEquipSnapTarget(pos)`** — 14px equipment proximity check, current page only.
- **`buildCharacterizedRun(run, currentShapes)`** — immutable; resolves pair map from endpoint items; writes `obligationState[obligationId] = runId` on BOTH endpoint items; returns `{ run: finalRun, updatedShapes }`.
- **`clearRunSatisfaction(run, currentShapes)`** — immutable reversal; called on run delete and on equipment-item delete that has connected characterized runs.
- **`commitRun()`** — derives endpoint items at commit time via fresh proximity check; calls `buildCharacterizedRun`; bumps `worklistTick`. Enter key and "Finish run" button both commit.
- **Draw interaction:** "Draw run" button (floor/roof pages, confirmed scale, no other active mode) enters `drawMode + runDrawing`. Purple ring on equipment-item hover. Finish-anywhere ≥2 vertices. Close-snap suppressed for runs. Wall-vertex `drawStartSnapRef` suppressed for runs (equipment-only snap).
- **Delete sub-mode:** extended to handle `wasRun` (reverse characterization) and `wasEquipment` (reverse characterization on all connected characterized runs, then null their category/endpoints). `worklistTick` bumped for either.
- **`hitTestShapeBody`:** extended with run segment proximity check (between equipment check and polygon check).
- **Exclusions:** `hitTestVertices`, `hitTestSegments`, `getEligibleShapes`, all 5 `drawEditCanvas` forEach loops — all skip runs. `drawLockedShapes` and `drawGhostShapes` in canvasRenderer.js also skip runs.
- **`drawRunPaths(ctx, completedShapes, pageId)`** exported from canvasRenderer.js: grey dashed (uncharacterized), solid amber (lineset), endpoint dots. Wired into all 14 render paths.
- **Worklist panel:** run obligations with `satisfiedValue !== null` render "✓ Connected" (green) before the blocked check — so a connected run obligation shows satisfied, not 🔒.
- **`deriveWireframe` extended:** `runLines` array — one segment per vertex pair per run; scalar Z from `zStack.floorZ` (floor plans) or `roofZFallback` (roof plans); `{ id, category, from, to }`. Return updated to include `runLines`; null-return also includes it.
- **ThreeDView.jsx:** destructures `runLines`; renders by category group (grey 0x9ca3af = uncharacterized, amber 0xf59e0b = lineset); legend entries added.
- **Fenced items logged:** ADDITIONAL_FUNCTIONALITY.md #64–68 (envelope-crossing detection, multi-hop cascade, slope/per-vertex Z, conflict checks, role-wiring).

### Architecture decisions locked this session

- **Run is a PATH, not a shape** — vocabulary enforced in all code comments, labels, and this doc.
- **Endpoint binding at COMMIT TIME** (not per-click) — fresh proximity re-check when "Finish run" fires; handles Z-undo correctly with no per-click tracking refs.
- **Uncharacterized IS the stable resting state** — no distinction between "one loose end" vs "unmapped pair" in storage or rendering; both are grey.
- **Satisfaction is two-sided and reverses** — `clearRunSatisfaction` restores both endpoint obligations to null on any disconnect path; no orphan satisfaction.
- **`deriveWorklist()` mechanism unchanged** — it reads `obligationState` each call; the run model writes/clears `obligationState` directly; no engine change needed.

---

## SESSION 33 — §8.2 config-driven worklist, Parts A + B (2026-06-25)

**Branch:** main | **Commits:** 4635e59 (Part A), 6ae5f53 (Part B), 0a962f5 (UX fixes) — all on origin.

### What was built

**Part A (4635e59) — data model + worklist panel:**
- ITEM_TYPES module-level table (4 types: air-handler, outdoor-unit, bath-fan, hrv-unit) each with obligation list (run/property kinds).
- `spawns` hook on CONFIG_FIELDS filled as a FUNCTION `(value) => [{type, count}, ...]` on space-heating, ventilation, and new bath-fans fields.
- New `kind: 'count'` descriptor on bath-fans field (numeric entry, separate from multi/single-select).
- `deriveWorklist()` pure computed function in render scope — derived fresh every render from config gap minus placed items; never stored (mirror of fhOutstanding precedent).
- `worklistTick` useState(0) bumped in `setConfigValue` so panel re-derives on every spawning-field change.
- Worklist panel (purple button, right:600px overlay) — to-place list + blocked-obligation preview; obligations grayed+🔒 (run) or property select disabled.
- `__dumpWorklist()` DEV console fn. Verified in Ben's browser: 5 items, correct obligation output.

**Part B (6ae5f53) — canvas placement + render wiring:**
- `isEquipmentItem(s)` helper in both App.jsx and canvasRenderer.js.
- `drawEquipmentItemShapes(ctx, shapes, pageId, zoom)` export in canvasRenderer.js — purple circle + type-initials, zoom-compensated radius — wired into **14 render paths** (5 edit sub-modes, 5 named draw functions, 4 inline repaints).
- Single-click placement on floor-plan OR roof-plan pages. Point shape: `{ id, shapeKind:'equipment-item', itemType, instanceKey, pageId, status:'locked', vertices:[makeVertex(x,y)], obligationState:{} }`.
- Pixels stored; world meters derived on demand via `pageVertexToWorld` — recalibration-independence (#22) browser-verified this session.
- Place button per worklist row; worklist closes on Place click; crosshair cursor during placement.
- `deriveWorklist()` extended: subtracts placed items by instanceKey from toPlace; populates per-placed obligations with live property `<select>` (mount-type enabled once outdoor unit placed).
- Equipment items: move/delete editable via existing Edit Shapes suite; excluded from insert-vertex / split / combine via isEquipmentItem guards; hitTestShapeBody extended with 14px proximity check.
- `worklistTick` bumped after delete → item returns to toPlace immediately.
- Placement state cleared on PDF upload and page navigation.

**UX fixes (0a962f5):**
- Bath-fans count input: `psCountDrafts` string-draft map so field clears freely (0 shows as empty; onBlur normalizes; `Number(n)` coercion in spawns unchanged).
- Delete sub-mode: red hover ring (18px / zoom, #dc2626) drawn over hovered equipment markers to match polygon delete-hover affordance.

### Architecture decisions locked this session

- **spawns is a FUNCTION** `(value) => [{type, count}]`, not a static map — required so count-driven bath-fans can pass a numeric value.
- **Worklist is DERIVED** (`deriveWorklist()`), never stored — fh-outstanding pattern. Only placed items are stored (completedShapesRef as shapeKind:'equipment-item').
- **Placed equipment items store PIXELS** (single vertex); world meters re-derive through `pageVertexToWorld` — recalibration-independence (#22) confirmed in browser (marker stays pinned to PDF on rescale).
- **Obligation kinds are an open/extensible set** (run/property/placement), switched on kind — not a baked enum. New kinds are data additions.
- **Obligations are role-blind this build** — cross-trade tags ((plumber)/(electrician)/(envelope)) are descriptive label text only, not wired to §9 roles.
- **Placement is editable via Edit Shapes** (move/delete) but excluded from polygon-only ops (insert/split/combine) via isEquipmentItem guards.

### IMPORTANT field-model finding

The CONFIG_FIELDS model has **separate** `space-heating` and `cooling` fields (NOT a combined heating-cooling field). "Ducted heat pump" = `space-heating` field, value `heat-pump-ducted`. This matters for:
- Any future cooling-side spawn wiring (e.g., cooling='heat-pump' auto-derived from space-heating selection)
- The heat-pump→cooling autofill item logged as ADDITIONAL_FUNCTIONALITY this session

---

## STANDING SESSION-START CHECKLIST (run every session, every fresh working tree)

1. `git pull --ff-only origin main` — confirm clean fast-forward. If NOT clean, STOP.
2. `git log -1 --oneline` — confirm HEAD hash matches last known-good commit.
3. **`.claude/settings.local.json` is now tracked in-repo** (commit f24fd7e). No recreate needed.
   The global git ignore rule (`**/.claude/settings.local.json` in `C:\Users\ben\.config\git\ignore`)
   was permanently overridden by `!.claude/settings.local.json` in the project `.gitignore`.
   The file travels with clones and worktrees. This step is RETIRED — no action needed.
4. Confirm `VISION_SUPPLEMENT.md` + `WIREFRAME_RECON_REPORT.md` present in working tree.
5. `npm install` only if `node_modules` is missing or `package.json` changed; skip otherwise.

Report all five, then WAIT for the build prompt.

---

## SESSION 1 — Full rebuild from the lost App.jsx

### 1. Tooling & environment notes (not project logic — won't belong in CLAUDE.md)

- **Claude Code Desktop project memory:** `C:\Users\ben\.claude.json` has a `projects`
  key that remembers trusted folders. It had a stale entry pointing at
  `G:\Shared drives\The ABC\Collabinator\Phase 1` — fixed by replacing the G: path
  with `C:\Users\ben\Collabinator\pdf-viewer`. If this resurfaces: check this file first.
- **Always explicitly set Project folder** when starting a new Desktop session.
- **Enter key in the Code tab** sometimes inserts a newline — workaround: **Ctrl+Enter**.
- **Permission mode persistence:** `.claude/settings.local.json` has
  `"permissions": {"defaultMode": "acceptEdits"}` — local/gitignored, recreate manually
  on a fresh clone.
- **Git is the actual safety net.** Remote:
  `https://github.com/StationCraft/collabinator.git`, branch `main`. Original App.jsx
  was lost to accidental overwrite — this is why git exists. Confirm commits are pushed
  to origin, not just committed locally.

### 2. Key architectural decisions

- **Vertex-array storage from day one** — `{vertices: [{x,y}]}`, no segment-chain phase.
- **Old 8a–8d multi-floor pattern deliberately NOT rebuilt** — corrected design in
  `FUNCTIONALITY_SUMMARY.md`.
- **Scale-gating is a hard rule** — Draw button disabled until scale is confirmed.
- **Distance snap default is 6"** for plan pages; elevations may want finer later.
- **Combine Shapes geometry rule:** NEVER move, snap, or angle-adjust an
  originally-traced vertex. New splice vertices by exact linear interpolation only.
- **Move Shape snaps final vertex positions to absolute page grid** — not drag delta.
- **New PDF upload must fully reset ALL state.**

### 3. Session 1 achievements

PDF upload/rendering/navigation, calibration workflow, live drawing tool (vertex
arrays, axis/angle snap, distance snap, chaining, undo, escape), shape closure +
review/confirm, alignment guides, scale-before-draw enforcement, post-completion
editing (segment drag, vertex drag, label override, undo, clamping), shared absolute
page grid, Move/Combine/Split sub-modes, Combine collinear-overlap detection, Move
grid-snap precision fix, PDF-upload full-state reset, CLAUDE.md rewrite.

---

## SESSION 2 — Deferred polish list + follow-up fixes

### 1. What was built

- **Delete Shape sub-mode** — red toolbar button, pushes to undo stack, stays active
  with zero shapes (undo always accessible).
- **Vertex insertion** — click-and-hold ~550ms on segment edge, drag to place, snaps
  to grid identically to normal vertex drag.
- **Vertex deletion** — drag vertex onto adjacent vertex, red highlight within 14px,
  release merges. Only when polygon has >3 vertices.
- **Universal Shift-to-release-axis-lock** — draw tool, vertex drag, segment drag,
  Split Shape. Grid snap always applies; only angle constraint is conditional.
- **Undo/Redo stack** — full stack in all five Edit Shapes toolbar contexts. New edits
  clear redo stack. Redo absent when stack is empty.
- **Button label audit** — "Exit" for calibration, "Back" for scale dialog /
  Combine / Split dismissal.

### 2. Bugs fixed

- Auto-exit stranded undo on last-shape delete → stay in Edit Shapes regardless.
- Undo missing from sub-mode toolbars → added to all five locations.
- Vertex insertion snap precision → snap `origVerts[vertIdx]` to grid before using as
  axis-snap anchor.
- Split Shape failed on near-collinear cut lines → rewrote `linePolyIntersect` with
  two-pass approach (interior crossings + vertex-on-line pass).

### 3. Architectural decisions

- Redo stack cleared by `pushUndo` — single enforcement point.
- `snapshotShapes()` extracted as shared helper.
- `applyAxisSnap` and `projT` as module-level pure helpers.
- `segPending` drag state for mousedown-on-segment.
- `handleSplitClick` accepts `shiftKey` parameter.

---

## SESSION 3 — Structural refactor + start-vertex snap + edit-mode grid + combine fix

**Branch:** main | **Commits:** `0eaf2bb`, `b921f66`, `6d82327`, `c0490fe`

### 1. What was built

**Structural refactor (commit `0eaf2bb`) — zero behavior change**

Split 1875-line monolithic App.jsx into three files:
- `src/geometry.js` (~213 lines) — all pure polygon math and module-level constants
- `src/canvasRenderer.js` (~67 lines) — stateless drawing primitives with explicit
  data params (`drawLockedShapes`, `drawShapePoly`, `drawAlignGuide`, `pxToDisplayDist`)
- `src/App.jsx` (~1555 lines) — everything stateful

`drawLockedShapes` and `pxToDisplayDist` signatures changed to take explicit data
instead of closing over refs; all four call sites updated.

**Feature: Start-vertex snap (commit `b921f66`)**

Before placing the first vertex of a new shape, hovering within `HIT_VERT_DIST` (9px)
of any vertex on visible locked geometry shows a red highlight. Clicking places the
new shape's first vertex exactly coincident. Shift suppresses the snap. Implemented
via `drawStartSnapRef` + `getVisibleVertices(pageNum)` — written generically so it
extends automatically to reference/ghost geometry in later phases with no rework.
Occupies a strictly non-overlapping window from Shift-axis-release (pre-first-vertex
vs. post-first-vertex — no conflict).

**Feature: Snap grid selector in Edit Shapes mode (commit `b921f66`)**

Distance-snap increment dropdown now exposed in all five Edit Shapes toolbar contexts.
Reads/writes the same `snapIncrementRef` + `snapIncrement` state as Draw mode — no
new state. Implemented as computed `editSnapIncrementSelect` JSX variable.

**Bug fix: Combine Shapes winding-direction (commit `6d82327`)**

Root cause: `findCollinearOverlap` line 87 hard-rejected any B edge with dot product
>= 0 against A's direction — accepting only anti-parallel edges. Same-winding adjacent
shapes (both traced clockwise) silently returned null; no amount of vertex dragging
could fix this since winding is set at trace time.

Fix: removed anti-parallel-only filter. Both 'reversed' and 'same' winding pairs
now accepted. Overlap computed with Math.min/Math.max. Result carries `dir`.
`applyMerge` routes `prepareForMerge` ordering and `mergePolygons` traversal branch
through `ov.dir`. The `dir === 'same'` branch in `mergePolygons` was already correct
but was dead code before this fix.

### 2. Known issue logged (not fixed)

Some complex merges produce a **redundant collinear vertex** at splice points — visible
as a short stray line. Cosmetically harmless, no geometry error. Logged in
`ADDITIONAL_FUNCTIONALITY.md`.

### 3. Architectural decisions

- **`getVisibleVertices(pageNum)`** is the canonical snap-target query — generic from
  day one for easy Phase 1.5 extension.
- **Combine now direction-agnostic** — winding direction irrelevant to eligibility.
- **Module boundary going forward:** `geometry.js` = pure math;
  `canvasRenderer.js` = stateless drawing; `App.jsx` = all state/refs/handlers/JSX.

---

---

## SESSION 4 — Zoom/pan + architecture planning + compass rose + pageId migration

**Branch:** main | **Commits:** de2603b, e75a99d, b56b043, c754c76

### 1. What was built

**Zoom/pan — cursor-anchored wheel zoom + drag pan**

- `canvas-world` div inserted inside `.canvas-stack`, wrapping both canvases
- CSS transform applied to `canvas-world`: translate (pan) + scale (zoom)
- `getCanvasPos()` uses `getBoundingClientRect()` — auto-accounts for CSS
  transforms; zero changes to coordinate mapping in any existing handler
- Mouse wheel: zoom anchored to cursor via
  `newPan = pan + worldPos * (currentZoom - newZoom)`
- Pan: left-drag on empty canvas (all modes); middle-mouse drag (all modes)
- Quick mousedown+up (<3px) does not suppress the following click
- Zoom clamped: 0.1× to 10×
- Zoom and pan reset on page navigation and PDF upload
- Label edit overlay positioned correctly at all zoom/pan states
- Full test checklist passed (anchor accuracy, hit-test accuracy at varied
  zoom/pan, all edit sub-modes, page nav reset, upload reset)

**Compass rose alignment overlay**

- Fixed overlay div (`z-index: 200`) layered above canvas-world — not on canvas
- SVG compass rose (N/S/E/W arms, red N arm with arrowhead, intercardinal arms)
- Drag overlay body to reposition; rotation handle (purple circle on N arm at ~60%
  from center to tip) to rotate
- Arrow key nudge: ±1° per press, ±0.1° with Shift; auto-focuses overlay div on open
- Numeric angle input with its own local string state (no toFixed-on-keystroke bug)
- Confirm stores `compassAngleDeg` + `compassCardinal` (rounded to nearest N/NE/E/SE/S/SW/W/NW)
- Skip stores 0°/N and dismisses
- "Set North" toolbar button re-opens overlay; shows confirmation state once set
- Compass persists across page navigation and zoom/pan reset; clears on PDF upload
- Transparent overlay background — PDF visible through it; controls have subtle semi-opaque backing
- Instruction text above rose: "Move this panel over your plan's compass rose, then drag the handle on the N arm to rotate until it matches."

**Step 4a — pageId migration (structural refactor, zero behavior change)**

- `pageIdMapRef.current[pageNum] = pageId` populated at PDF load (`"page-1"`, `"page-2"`, etc.)
- `getPageId(pageNum)` helper; `currentPageId = getPageId(currentPage)` derived value
- `pageTransformsRef` added as placeholder for Step 4b
- All page-keyed refs migrated: `pageScalesRef`, `pageGridOriginRef` now keyed by pageId string
- All shape fields migrated: `pageNumber` → `pageId`; all filter/create sites updated
- All internal function params renamed from `pageNum` to `pageId` where used as ref keys
- Changes span `App.jsx`, `canvasRenderer.js`, `geometry.js`

### 2. Bugs fixed this session

- **Locked shapes invisible in view mode** — `useEffect` and `confirmShape` were passing
  `currentPage` (number) to `drawLockedShapes` after shapes migrated to string `pageId`.
  Fixed both call sites to use `getPageId(currentPage)`.
- **Compass rotation handle position** — handle was outside the arrowhead tip (felt like
  a target, not a control). Moved to `top: 15px` (~60% along the N arm from center).
- **Compass numeric input controlled-input bug** — `toFixed()` on every keystroke caused
  "180" to produce "1.1". Fixed with separate `compassInputVal` string state; only parsed
  on blur/Enter; arrow keys inside input stop propagation.

### 3. Architecture decisions locked in planning chat

- **pageId as governing key**: all page-keyed state migrates from pageNum to
  pageId in Step 4. pageNum retained only for PDF.js rendering. pageId assigned
  at load time — including uncategorized/skipped pages.
- **Plan Views** is the umbrella category (replaces "Floor Plans"). Sub-labels:
  Ground / L1 / L2 / Foundation / Roof / Crawlspace / Basement / etc.
- **Sidebar structure confirmed**: Plan Views | Elevations | Cross-Sections | Details
- **Compass rose flow**: navigation-first — user browses to whichever page has
  the north arrow, then aligns. Does NOT auto-show on page 1 only.
- **Front face designation**: popup after first Plan View polygon is locked,
  prompting user to click the road-facing wall segment. Built in the ground floor
  tracing step, not in Step 3 or 4.
- **Interstitial space** (bulkheads, floor systems, ceiling surface ownership)
  flagged as future architecture problem — logged in ADDITIONAL_FUNCTIONALITY.md.
- **Duplicate page** deferred — logged in ADDITIONAL_FUNCTIONALITY.md. pageId
  architecture designed to accommodate it cleanly when prioritized.
- **Working area selection dropped from Step 4b scope** — zoom makes it redundant
  for the current workflow; duplicate page handles mixed-page case when prioritized.
- **Step 4 splits into 4a and 4b** — 4a complete; 4b is page categorization UI.

---

## SESSION 5 — Compass rose polish + Step 4a + Step 4b

**Branch:** main

### Completed and committed

- Compass rose numeric input bug fix (controlled-input, local `inputVal` state)
- Compass overlay: transparent background, amber instruction text styling
- Compass rotation handle repositioned to 60% along N arm
- **Step 4a: pageId migration** — all page-keyed refs and shape fields migrated
  from `pageNum` to `pageId`; `pageIdMapRef` and `getPageId` helper added;
  `pageTransformsRef` placeholder added
- Bug fix: locked shapes invisible in view mode (`drawLockedShapes` call sites
  passing `pageNum` instead of `pageId`)
- **Step 4b: page categorization UI** — Site Plan / Floor Plan / Elevation /
  Cross-Section / Detail / Roof Plan categories; simplified floor sub-labels
  (Basement / Crawlspace / Main Floor / 2nd / 3rd / Other); auto-triggers after
  compass; compact summary mid-categorization; recategorize non-destructive;
  zoom fix in categorize mode; post-Done nav cycles categorized pages only;
  re-entry via "+ Categorize more pages" cycles uncategorized pages only;
  "All pages categorized" end state

Working area dropped from scope — zoom makes it redundant; duplicate page
handles mixed-page case when prioritised (logged in `ADDITIONAL_FUNCTIONALITY.md`).

---

## SESSION 6 — Sidebar overlay + planning decisions

**Branch:** main | **Commits:** b314eab, 23d66bc

### What was built

**Step 4c: Sidebar + navigation (commit b314eab)**
- Collapsible sidebar floats as overlay over canvas (position:absolute, z-index:100)
- 240px open / 32px closed, no width transition (avoids frozen mid-animation issue)
- Semi-transparent background rgba(15,23,42,0.20) with backdrop-filter blur(2px)
- Sections rendered in order: Plan Views, Elevations, Roof Plans, Cross-Sections, Details, Site Plans, Unused Pages
- Intra-section ordering: floor plans Basement→3rd Floor then free-text; elevations N/S/E/W
- Active page highlighted; clicking any entry calls goToPage(pageNum)
- Canvas area always fills full window width — sidebar does not push content

**Sidebar light-scheme hover/active fix (commit 23d66bc)**
- Hover: rgba(255,255,255,0.25) background, #111 text
- Active: rgba(29,78,216,0.20) background, #1d4ed8 text, 3px solid #1d4ed8 left border
- Replaced dark-scheme colours that were illegible over transparent sidebar

### Planning decisions made this session

- **Origin point dropped as a user step** — internal coordinate anchor derived automatically from first vertex placed on ground floor; no user action, no UI needed. The coordinate system is self-contained: scale factor from calibration, per-page transforms from ghost alignment, Z from elevation calibration.

- **Cantilever/multiple-reference-points question closed** — the ghost displays the full previous floor polygon; the user aligns on matching corners naturally. Cantilevers do not require multiple pinned reference points. The per-page transform captures the correct spatial relationship for the whole floor.

---

---

## SESSION 7 — Ground floor tracing (Steps 5a, 5a-ii, 5c) + coordinate-model reframing

**Branch:** main | **Commits:** 9266bdc, ef09039, ad50e3b, 2d6021b

### What was built

**Step 5a — getAnchorFloor helper + FLOOR_ORDER (commit 9266bdc)**

Extracted `FLOOR_ORDER` array (`['Basement', 'Crawlspace', 'Main Floor', '2nd Floor',
'3rd Floor']`) as the single source of truth for floor-level ordering. Added
`getAnchorFloor(pages, FLOOR_ORDER)` helper in `geometry.js`: scans all categorized
floor-plan pages, returns the lowest known floor level present per `FLOOR_ORDER`, or
`null` if no floor-plan pages are categorized yet. Used to drive the front-face
designation trigger (Step 5c) and will drive multi-floor Z-stack logic in Phase 1.5.

**Step 5a-ii — Known floor level required in categorization (commit ef09039)**

Floor Plan pages now require a known level (one of the `FLOOR_ORDER` values) before
Confirm is enabled. The old "Other + free text" option in the floor sub-label dropdown
was removed. Free-text demoted to an optional `subLabelNote` field — visible as a
secondary input once a known level is selected, purely for notes (e.g., "split level",
"mezzanine"). This ensures `getAnchorFloor` always has reliable, comparable level data.

**Coordinate-model reframing (commit ad50e3b — docs only, no code change)**

The earlier decision that "the first vertex placed on the ground floor becomes the
internal coordinate anchor" was identified as conceptually confused and reversed. The
new model:
- The coordinate origin (0,0,0) is a **fixed, arbitrary zero** — not a building
  feature. Nothing "is" the origin.
- All geometric relationships are computed **geometry-to-geometry**, never by
  measuring against the origin.
- Floor levels (Z) are a **relative-offset stack**: each floor stores its offset from
  the floor below; absolute Z accumulates upward. Changing a lower floor's height
  shifts every floor above it — physically correct behavior.
- `getAnchorFloor` identifies the **base of the floor stack** — a building fact only,
  not a coordinate anchor.
- **Step 5b (origin capture) was CANCELLED / DISSOLVED** by this reframing. There is
  no origin to capture. Nothing replaces it.

The reframing is documented in CLAUDE.md Design notes and FUNCTIONALITY_SUMMARY.md
Section 1 and 5.

**Step 5c — Front-face designation (commit 2d6021b) — FULLY TESTED**

After the first polygon is locked on the anchor-floor page, the app prompts the user
to click the road-facing exterior wall segment. Stored as:

```
frontFace = { pageId, shapeIndex, segmentIndex, endpointA: {x,y}, endpointB: {x,y} }
```

The segment indices are authoritative; `endpointA/B` are staleness sanity-check
snapshots (stale if the polygon has since been edited without re-picking). Pick-mode
hover-highlights all outer-perimeter segments of locked shapes on the anchor page.
"Skip for now" dismisses without setting `frontFace`. Selected segment visually marked
across all redraws. Normal draw/edit interactions suppressed while pick mode is active.
Trigger is re-checked after every polygon lock and after every categorization change;
never re-prompts once set. Verified: survives all Edit Shapes sub-modes (segment drag,
vertex drag, vertex insertion, vertex deletion, Move, Combine, Split, Delete). Cleared
on PDF upload.

**Purpose of frontFace:** maps the road-facing direction onto the compass cardinal
(N/S/E/W already set by compass rose), enabling Front/Back/Left/Right elevation naming
in the sidebar and downstream elevation-tracing tools.

### New deferred-register entries this session

- **#6 — CAD-export datum:** named control/reference point stored at its computed
  coordinates within the space (e.g., a surveyed corner), used as the datum for CAD
  export. Not an origin — just a known coordinate within the model. Deferred to Phase 2
  or post-Phase 1.5.
- **#7 — Intra-floor Z / split-level:** buildings with split-level or mid-flight floors
  create floors that sit between the canonical FLOOR_ORDER levels. The relative-offset
  Z stack can accommodate this (additional named levels inserted between existing ones)
  but the categorization UI and Z-stack logic do not yet handle it. Deferred to Phase 2.

---

## CURRENT DEFERRED ITEMS

- **Feet+inches carry-over display bug (low priority):** `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** too loose with small snap grids
- **Redundant collinear vertex after complex Combine:** stray short segment, cosmetic
- **Inherited geometry on all pages:** layer management deferred to Phase 2+
- **No persistence:** memory only, lost on reload
- **Working area selection:** dropped from Step 4b scope; zoom makes it redundant; revisit when duplicate page is prioritized
- **CAD-export datum (#6):** named point at computed coordinates for CAD export — not an origin, deferred to post-Phase 1.5
- **Intra-floor Z / split-level (#7):** FLOOR_ORDER does not accommodate mid-flight levels; deferred to Phase 2
- See `ADDITIONAL_FUNCTIONALITY.md` for larger deferred feature ideas

---

## FORWARD BUILD SEQUENCE

1. ~~Zoom/pan~~ — DONE
2. ~~Compass rose alignment~~ — DONE
3. ~~Step 4a: pageId migration~~ — DONE
4. ~~Step 4b: Page categorization UI~~ — DONE
5. ~~Step 4c: Sidebar + navigation~~ — DONE
6. ~~Ground floor tracing~~ — DONE
   - ~~5a: getAnchorFloor + FLOOR_ORDER~~ — DONE (9266bdc)
   - ~~5a-ii: known-level required in categorization~~ — DONE (ef09039)
   - ~~5b: origin capture~~ — CANCELLED / DISSOLVED by coordinate-model reframing
   - ~~5c: front-face designation~~ — DONE & fully tested (2d6021b)
7. **Multi-floor reference & alignment (NEXT)** — fresh planning chat; this is the
   feature that was lost once already and deserves its own room to think.

After multi-floor: roof plan tracing → elevation calibration + tracing → cross-section
reference geometry → windows/doors → Phase 2 threshold (see `FUNCTIONALITY_SUMMARY.md`).

---

## SESSION 8 — Multi-floor sub-step 1: read-only reference ghost rendering

**Branch:** main | **Commit:** 996b5a7

### What was built

**Step 6, Sub-step 1 of 4: Ghost reference rendering (commit 996b5a7)**

Multi-floor feature split into four focused sub-steps:
1. **Read-only reference ghost (THIS SESSION)** — display floor-below geometry
2. **Ghost alignment + per-page transform** — drag to align, lock transform
3. **Confirm-scale lock** — make geometry-to-geometry snap permanent across pages
4. **Cross-page persistence** — save/restore per-page transform and toggle state

Built this session:

- **`getGhostSourcePageId(pages, currentPageId, completedShapes, floorOrder)` helper in geometry.js:**
  Scans downward through `FLOOR_ORDER` to find the nearest-lower categorized Floor Plan page
  with at least one locked shape; returns its `pageId` or `null` if no qualifying floor exists.
  Used by all redraw functions (draw, review, edit, front-face) to determine whether a ghost
  should be rendered.

- **`drawGhostShapes(ctx, completedShapes, ghostPageId)` stateless drawer in canvasRenderer.js:**
  Renders locked shapes from the ghost-source page in muted purple (#a78bfa), 2px dashed line
  at 0.85 opacity, no fill. Drawn as a background layer (below current page's locked shapes and
  in-progress trace) so working geometry always reads on top. Never hit-tested, never editable,
  never snapped to — purely visual reference.

- **`showGhost` toggle state in App.jsx:**
  Boolean state (default `true`), toggleable via "Show floor below ON/OFF" buttons in draw-mode
  and edit-mode toolbars. Button only appears when `getGhostSourcePageId` returns non-null
  (i.e., a ghost source exists). Toggling triggers immediate redraw; persists across zoom/pan
  and page navigation; clears on PDF upload.

- **Ghost integrated into all canvas redraw functions:**
  `redrawDrawCanvas`, `redrawReviewCanvas`, `redrawFrontFaceLayer`, and `drawEditCanvas` (all
  sub-modes). Ghost always drawn first (background), before locked shapes and working geometry.

### Architecture decisions this session

**Per-page alignment transform placement (forward-looking, not yet implemented):**

The per-page transform required for Sub-step 2 (alignment) will be applied to a **new div
nested INSIDE `.canvas-world`** (which is already inside `.canvas-stack` wrapping both canvases).

**Why inside `.canvas-world`:**
- `.canvas-stack` is the untransformed clipping viewport (zoom/pan origin)
- `.canvas-world` already carries the CSS transform for zoom/pan
- Both canvases are already shared children of `.canvas-world`
- New align div nesting inside `.canvas-world` keeps the alignment transform correctly
  nested within the zoom/pan coordinate space
- `getCanvasPos()` uses `getBoundingClientRect()` → auto-compensates for all nested transforms
  (no coordinate mapping changes needed in any existing handler)
- **Structurally guarantees:** both canvases move as one unit under zoom/pan; alignment
  transform applies symmetrically to both canvases; no inconsistency between PDF canvas
  and measure canvas (the bug from the prior lost attempt)

**This supersedes FUNCTIONALITY_SUMMARY.md Section 6's "apply to .canvas-stack" wording.**

### Carried-forward item resolved

**Step 5c (front-face designation) confirmed fully tested** this session: ghost rendering
did not disturb it; front-face selection and visual marking still works correctly in all modes.

### Known deferred items

See `ADDITIONAL_FUNCTIONALITY.md` #8, #9, #10 (added this session) and prior entries.

---

## SESSION 9 — Multi-floor sub-step 2: ghost alignment + per-page transform

**Branch:** main | **Commits:** 73f02f1 (Piece A), c2ed3ba (Piece B), 122b077 (Piece C), 6e97f67 (ghost visibility), b210343 (Piece D1), d5425d0 (Piece D2)

### What was built

Sub-step 2 completed in five pieces (D was split for testability):

- **Piece A (73f02f1):** `getCSSTransform(t)` pure helper in canvasRenderer.js. Builds `translate(tx px, ty px) rotate(angle deg) scale(s)` CSS string; returns `'none'` for null/identity. No wiring yet.
- **Piece B (c2ed3ba):** `.pdf-align-layer` div inserted wrapping ONLY the PDF `<canvas>` inside `.canvas-world`. `measureRef` stays a direct child of `.canvas-world` — ONLY the PDF backdrop will move. Reads `pageTransformsRef` at identity; no visible change.
- **Ghost visibility upgrade (6e97f67):** `drawGhostShapes` reworked — amber (#f59e0b) 3.5px dashed stroke at 0.85 opacity, 10% amber fill, 25% 45° hatch clipped to polygon per shape. Bug fixed mid-session: hatch loop used `minX` where it needed `minY` for Y coordinates; fixed to proper bbox-relative offsets.
- **Piece C (122b077):** `alignMode` state + `alignDragRef` + `alignTick` added. "Align to floor below" button in view/draw/edit toolbars (same ghost-source gate). Body-drag in `alignMode` writes `{tx, ty}` to `pageTransformsRef` at `clientDelta / zoom`; `alignTick` bumps to force React re-read. Entering align mode auto-shows ghost if hidden. Resets on page nav and upload.
- **Piece D1 (b210343):** `drawAlignHandles(ctx, completedShapes, ghostPageId, zoom)` added to canvasRenderer.js. Computes combined bbox of all ghost shapes; draws four amber squares (`HANDLE_PX = 12`, exported constant) at TL/TR/BR/BL corners, constant screen size via `HANDLE_PX / zoom`. Hooked into all 8 ghost-draw sites across `drawEditCanvas`, `redrawDrawCanvas`, `redrawReviewCanvas`, `redrawFrontFaceLayer`. `alignMode`, `showGhost`, `alignTick` added to passive-redraw `useEffect` deps for view-mode and edit-mode paths.
- **Piece D2 (d5425d0):** Handle hit-test in `handleMeasureMouseDown` (grab radius `HANDLE_PX / zoom`). Scale drag stores `{mode:'scale', ax, ay, startTx, startTy, startS, d0}` where anchor is the diagonally-opposite ghost bbox corner and `d0` is the grabbed corner → anchor distance (not cursor → anchor). Scale drag: `newS = startS * (d1/d0)` clamped 0.05–20, `tx1 = ax - (ax - startTx) * (newS/startS)`. Body-drag falls through unchanged (`mode:'translate'`). Resize cursor (`nwse-resize`) on handle hover via `alignOverHandle` state.

### Key concept refined during testing

**Ghost is the fixed reference; PDF moves.** Handles are anchored to the ghost bbox corners — they do NOT move when the PDF is body-dragged. The scale anchor (diagonally-opposite corner) is also a ghost bbox corner, so the anchor point is fixed in the ghost's coordinate space regardless of where the PDF has been translated or scaled.

### Bugs found and fixed during testing

1. **HANDLE_PX written inside a comment block** — appeared to be a `const` declaration but was inside `// ...` text; value was `undefined` at runtime; `fillRect` with NaN dimensions draws nothing silently. Fixed: moved `const HANDLE_PX = 12` to executable code before the function.
2. **Two `drawGhostShapes` call sites missed by `replace_all`** — the 6-space-indented sites (vs. 8-space) weren't matched. One was `drawEditCanvas` default sub-mode; the other was `redrawFrontFaceLayer` — the ONLY redraw path that fires in view mode. Handles never appeared in view mode until this was fixed.
3. **`alignMode`/`showGhost`/`alignTick` missing from passive-redraw `useEffect` deps** — toggling align mode or dragging the PDF in view mode didn't repaint the canvas. Added to both `redrawFrontFaceLayer` useEffect (view mode) and `drawEditCanvas` useEffect (edit mode).
4. **`d0` computed from cursor instead of grabbed bbox corner** — using `Math.hypot(pos.x - ax, pos.y - ay)` meant `d0` depended on where exactly the user clicked within the grab radius, causing a scale jump on first mousemove. Fixed to `Math.hypot(hitCorner.x - hitCorner.ax, hitCorner.y - hitCorner.ay)` — always the full corner-to-anchor diagonal.

### Testing-state-loss reminder

No persistence — all geometry and transforms live in memory. Full in-flight test state (multi-page PDFs with calibration, traced shapes, and alignment transforms) cannot survive a page reload. Tested in one un-reloaded tab throughout the session.

### New deferred entries this session

- **#11 — Sidebar auto-hide:** sidebar should collapse after a page selection or on canvas interaction instead of staying open over the drawing.
- **#12 — Page rotation (90° and arbitrary):** 90° rotation for sideways-scanned sheets; arbitrary angle for skewed scans. The `angle` field is already in the transform struct; interaction is not built. Deferred because stacked residential plans are almost always co-oriented.

---

## SESSION 10 — Multi-floor sub-step 3: confirm-scale lock

**Branch:** main | **Commits:** d49060d, e4cf8b6, 327e84d, d030a34

### What was built

Sub-step 3 completed in four pieces (1a, 1a-fix, 1b, 1b-fix+1c):

- **Piece 1a (d49060d):** Confirm gate + Realign re-entry UI. Added `confirmed` field to
  `pageTransformsRef[pageId]`. "Confirm scale & alignment" button (align mode only,
  `snap-btn` class, no `snap-btn--on`) writes `confirmed: true` and exits align mode.
  Align button reads "Realign" once confirmed; re-entering does NOT reset the transform.
  All three toolbar sites (view/draw/edit) updated. `alignTick` bumped on confirm to
  force toolbar re-read. State/UI only — no scale-borrow, no calibration changes.

- **Piece 1a-fix (e4cf8b6):** The scale-drag branch in the align `mousemove` handler
  was writing `{tx, ty, s, angle}` without spreading prior fields, silently dropping
  `confirmed` on any scale drag during Realign. Fix: read `prevScale = pageTransformsRef
  .current[drag.pageId] || {…}` and spread it before writing new values — matching the
  translate branch. Scale math unchanged.

- **Piece 1b (327e84d):** Ghost scale-borrow unlocks Draw on confirmed pages. Added
  `getEffectiveScale(pageId, _visited)` resolver inside the App component (near
  `getVisibleVertices`): returns own calibration if set; else if `confirmed`, recurses
  to `getEffectiveScale(ghostPageId, visited)` walking down `FLOOR_ORDER`; else `null`.
  Visited-set cycle guard threaded through recursion. Routed all 9 scale-read sites
  through it: `snapToGrid`, `applySnap`, `snapPerp`, `commitLabelEdit`, `pageHasScale`,
  both `pxToDisplayDist` synthetic-map call sites, two `isImperial` snap-increment reads,
  Draw `onClick` unit init. `pageGridOriginRef` untouched — borrowed pages keep the
  default `{0,0}` grid, sharing the ghost's coordinate space. `canvasRenderer.js` not
  touched (synthetic map `{ [id]: getEffectiveScale(id) }` passed to `pxToDisplayDist`).

- **Piece 1b-fix + 1c (d030a34):** Two changes in one commit:
  - **1b-fix:** `getEffectiveScale` originally did `pageScalesRef.current[ghostPageId]
    || null` — a non-recursive lookup. On 3+ floor stacks, a middle floor is itself a
    borrower with no own scale; the lookup returned `null` while that floor's effective
    scale resolved fine via the floor below it. Console-log instrumentation (diagnostic
    only, never committed) revealed the branch: "page-5 BORROW from page-4 = null".
    Fixed by recursing (`return getEffectiveScale(ghostPageId, visited)`) so the walk
    continues until a floor with real calibration is found.
  - **1c:** "Set Scale" / "Re-calibrate" button hidden whenever `getGhostSourcePageId`
    returns non-null. Single render-gate condition change; button className/onClick/label
    unchanged.

### Key conceptual resolution

**The borrow uses `pxPerMeter` only — `s` does not enter the grid.** The align `s`
factor is a CSS transform on the PDF backdrop div (`.pdf-align-layer`). The measurement
canvas (`measureRef`) and all geometry live in a fixed measure space where the ghost's
calibrated `pxPerMeter` applies directly. Geometry-to-geometry snap works because all
floors share this same measure-space grid — the PDF backdrop moves to match, not the
grid. This was verified empirically: wall labels read true on a confirmed upper floor
borrowing from the ground floor's calibration.

### Bug discovery story

The recursion bug (#1b-fix) would not have been caught by static review: it requires
at least three categorized floor-plan pages with locked shapes, a calibrated bottom
floor, a confirmed-but-uncalibrated middle floor, and a confirmed upper floor. Only a
real multi-floor PDF with three stacked floors exposes it. The console-log diagnostic
caught the exact branch (`"page-5 BORROW from page-4 = null"`) in one test.

### In-memory-state-loss reminder

No persistence — all geometry and transforms live in memory. A tab reload loses
everything. In-session testing of the confirm gate requires that the tab stays alive
from ghost rendering through alignment through confirmation — a reloaded tab starts
clean and the gate appears not to work until confirmed in the fresh session. This
masked the gate in early testing until a fresh start proved it.

### New deferred entries this session

- **#13 — Ghost vertices as opt-in snap targets:** deliberately not built in sub-step 3.
  Existing axis snap + shared grid handle alignment; reference-vertex snap is a future
  nicety. See `ADDITIONAL_FUNCTIONALITY.md`.
- **#14 — Scale inheritance within a drawing group:** suppress Set Scale across a
  group's pages once one is calibrated. See `ADDITIONAL_FUNCTIONALITY.md`.

---

## SESSION 11 — Multi-floor sub-step 4: cross-page persistence & per-page toggle

**Branch:** main | **Commits:** c7a45e0 (Piece 1), d42296e (Piece 2), 196b0fa (Piece 3)

### What was built

Sub-step 4 in three commits + a verification piece:

- **Piece 1 (c7a45e0):** Per-page ghost toggle. `showGhost` boolean → `showGhostByPageId`
  map (default-on `?? true`); per-page state persists across nav, clears on upload. Added
  draw-mode passive repaint useEffect so toggles repaint immediately; removed stale
  imperative redrawDrawCanvas from toggle onClick (was reading pre-update state — the
  "doesn't toggle until mouse moves" bug).
- **Piece 2 (d42296e):** Context-aware inline Draw-disabled hint replacing the misleading
  "Set scale first" tooltip. Ghosted pages tell the user to confirm alignment; anchor
  floors keep set-scale. Gate logic unchanged.
- **Piece 3 (196b0fa):** "Resume align" cue. Factored shared isConfirmed/alignStarted
  consts; three-way align label (Align to floor below / Resume align / Realign) unified
  across all three toolbars.
- **Piece 4 (verification, no commit):** Cross-page restore verified clean — PDF transform,
  ghost, handles, and per-page toggle all repaint correctly on navigation round-trip with
  no interaction needed and no flash of unaligned state.

### Planning decision this session — directional decoupling (deferred to sub-step 5)

Mid-session, identified that the bottom-up assumption (ghost/borrow scan downward through
FLOOR_ORDER, lowest floor must be traced first) is an arbitrary constraint for the
*reference* purpose. Designed a replacement: a **primary-reference tree** — one project-level
`primaryReferencePageId` (defaulted to first-calibrated, user-reassignable), per-page stored
`referenceParentPageId` (the in-primary-space page each floor confirmed against, stored at
confirm time), `getEffectiveScale` following the parent pointer (acyclic tree rooted at
primary). Any confirmed floor is a valid reference for the next, so trace order is free
(up/down/skip). **getAnchorFloor and the Z-stack stay bottom-up, explicitly unchanged** —
physical floor stack is a building fact, separate from reference/scale topology. Logged as
ADDITIONAL_FUNCTIONALITY #15 and BUILD_ROADMAP sub-step 5. Also logged #16 (multi-select
reference ghosts by floor label) as the display-side bridge to #8.

### In-memory-state-loss reminder

No persistence — all state in memory, lost on reload. Sub-step 4 testing (per-page toggle
round-trips, transform restore) requires one un-reloaded tab built up from PDF upload through
alignment; a reloaded tab starts clean.

---

## SESSION 12 — Multi-floor sub-step 5: primary-reference model

**Branch:** main | **Commits:** 9ef06b1 (Piece A), b8dd9ce (Piece B), 6f7f629 (Piece C)

### What was built

Sub-step 5 replaces the bottom-up FLOOR_ORDER scan with a user-configurable primary-reference tree. Three pieces:

**Piece A (9ef06b1): Reference-layer data model + label derivation**
- `REFERENCE_KIND_DEFAULT = 'plan'` and `PROJECTION_DEFAULT = 'plan'` constants in geometry.js — exist so the data shape is final now and only extended later, never restructured.
- `kindToLabel(kind)` function: `'plan'` → `'reference floor'`; extensible for future entity types.
- `primaryReferenceIdRef = useRef(null)` in App.jsx — set once on first manual calibration (set-once guard: `if (primaryReferenceIdRef.current === null)`), never overwritten. Project-level scale/coordinate root.
- `pageRefParentRef = useRef({})` in App.jsx — per-page map `{ [pageId]: parentPageId }`, written at confirm time (Piece B).
- All three toolbar sites (view/draw/edit): align button, ghost toggle, and Draw-disabled hint now read label from `kindToLabel(REFERENCE_KIND_DEFAULT)` — never hardcode "floor below." Result: "Align to reference floor", "Show reference floor", "Confirm alignment to the reference floor…"
- Both refs cleared on PDF upload.

**Piece B (b8dd9ce): Logic swap — primary-reference tree replaces bottom-up scan**
- `getGhostSourcePageId` updated to accept optional `pageRefParent` map (5th arg): checks stored parent first, falls back to FLOOR_ORDER downward scan as pre-confirm suggestion. All 15 call sites in App.jsx updated to pass `pageRefParentRef.current`.
- `getEffectiveScale` updated to follow `pageRefParentRef.current[pageId]` directly (not `getGhostSourcePageId`). Cycle guard (`visited` set) now does real work — the tree is user-defined, not structurally acyclic by FLOOR_ORDER.
- All three confirm handlers write `pageRefParentRef.current[pageId] = ghostSrc` at confirm time — storing which reference page this page aligned against.
- `getAnchorFloor` and the Z-stack left entirely unchanged.

**Piece C (6f7f629): Reference override picker**
- `refCandidates` derived at render scope: floor-plan pages (not current) with own calibration OR confirmed+parent. Re-evaluated on `alignTick` bumps.
- When `alignMode && refCandidates.length > 1`: a `<select>` picker appears in all three toolbar sites (view/draw/edit). Changing the picker writes `pageRefParentRef.current[currentPageId]` immediately and bumps `alignTick` — ghost switches to the chosen reference without requiring confirm first.
- Autosuggest (FLOOR_ORDER proximity → stored parent) is already implemented by Piece B's `getGhostSourcePageId` priority logic; Piece C is only the manual override UI.

### Architecture decisions this session

- **`REFERENCE_KIND_DEFAULT` / `PROJECTION_DEFAULT`** are constant-valued today and exist ONLY to lock in the final data shape so it extends (not restructures) when new entity/projection types arrive.
- **`primaryReferenceIdRef` is set-once.** The primary is the coordinate root; it defaults to the first manually-calibrated page and can be reassigned later (not yet built — no user action required or built for reassignment today). All scale borrows eventually chain to it.
- **Cycle guard is now real:** since the tree is user-defined (not structurally enforced by FLOOR_ORDER), the visited-set in `getEffectiveScale` is genuine insurance, not cosmetic.
- **Design rationale for #17 (universal reference-layer model) logged in ADDITIONAL_FUNCTIONALITY.md** this session: `referenceKind`/`projection` constants exist so the reference relationship is final now; projection math and multi-entity referencing are gated on the pixels→real-world XYZ coordinate conversion.

### Piece D — verify in your browser

Test scenario to validate the logic swap (trace out-of-order):
1. Upload 3+ page PDF with Basement, Main Floor, 2nd Floor categorized
2. Calibrate Main Floor first → `primaryReferenceIdRef` set to Main Floor's pageId
3. Go to 2nd Floor → ghost suggests Main Floor (FLOOR_ORDER fallback). Align + confirm → `pageRefParentRef["page-2nd"] = "page-main"`. Draw unlocks on 2nd Floor.
4. Go to Basement → no ghost (nothing below Basement). Set scale normally.
5. Return to 2nd Floor → Draw still unlocked, labels still correct. Navigate away and back — no flash.
6. Add a page for 3rd Floor → ghost suggests 2nd Floor. Enter align mode → `refCandidates` should contain Main Floor + 2nd Floor → override picker appears. Picking Main Floor switches ghost immediately.
7. Confirm against Main Floor → `pageRefParentRef["page-3rd"] = "page-main"`. Scale resolves correctly (3rd → Main, not 3rd → 2nd → Main).
8. Cycle guard: not reachable with correct tree, but verify no crash on 3+ floor round-trips.

Key visual checks: "Align to reference floor" / "Show reference floor ON/OFF" / hint text. No "floor below" anywhere. Picker only visible when alignMode + 2+ candidates.

---

## SESSION 13 — Roof-plan tracing (2D typed geometry)

**Branch:** main | **Commits:** a5c1b48 (Pieces A+B+C), 8288a1d (Pieces D-G)

### What was built

**Step 7: Roof-plan tracing — 2D typed geometry only (no elevation/slope/Z)**

Two commits, seven pieces:

**a5c1b48 — Pieces A+B+C: data model, section picker, parapet width**
- `roofType: 'flat'|'sloped'` and `parapetWidth: number|null` (inches, always imperial)
  stored on each locked shape on a Roof Plan page.
- `lineRoles: {}` map stored on shape for per-segment role assignment.
- After polygon close on a Roof Plan page, flow diverges: instead of immediate
  Confirm/Discard, a flat/sloped picker appears. Flat sections show parapet width input.
  "Confirm Section" locks the shape with type metadata.

**8288a1d — Pieces D-G: connected-graph trace tool + roles + heal + colors**
- `roofGraphRef = { verts, edges }` — connected graph replacing the earlier
  open-polyline approach. Vertices have stable string IDs (`rv-N`); edges reference
  vertex IDs (shared at junctions, not duplicated). Three provenance fields on vertices:
  `perimCorner` (coincident polygon corner), `perimParent` (on polygon edge mid-span),
  `roofEdgeParent` (created by splitting a roof edge).
- **Two-clicks-per-segment chain:** first click must attach to existing geometry (vertex,
  midpoint, or edge); second click on geometry ends chain; on free space auto-continues.
  Escape abandons active chain without exiting mode.
- **Snap priority:** graph vertex → perimeter corner → midpoint (perimeter + roof) →
  perimeter edge → roof edge → axis-snapped free point. Snapping to a roof edge calls
  `splitRoofEdge` to replace the original with two half-edges sharing the new vertex.
- **perimParent auto-split:** snapping to a perimeter edge mid-span creates a graph
  vertex with `perimParent: { shapeIdx, segIdx }`. The polygon itself is NOT modified.
  Future slope inference uses polygon vertices + perimParent metadata to find the two
  eave halves — no structural change needed before the slope step.
- **Vertex dedup:** `Math.round(x*2),Math.round(y*2)` key → same snap = same vertex ID.
- **healAfterEdgeRemoval:** called on both Z-undo and Delete. Checks both endpoints of
  removed edge: 0 remaining edges + non-perimeter → drop vertex; 1 remaining edge +
  roofEdgeParent → re-merge (removed edge's far endpoint + remaining half's far endpoint);
  2 remaining edges + roofEdgeParent → full merge of both halves; 3+ → leave intact.
- **Role assign mode:** perimeter edges → Eave/Rake (on `shape.lineRoles[segIdx]`);
  internal graph edges → Hip/Valley/Ridge (on `edge.role`). Delete button in role mode
  removes an edge and runs heal.
- **Five role colors:** ridge #b91c1c (dark red), hip #fb923c (light orange),
  valley #2563eb (blue), eave #16a34a (green), rake #8b5cf6 (violet). Applied to
  graph edges (dashed) and perimeter segments with assigned roles (solid overlay).
- **Crosshair cursor** in trace mode; grab cursor excluded.
- **Dump graph button** (debug, temporary) in trace toolbar.

### Key architectural decision: roofGraphRef over open polylines

Mid-session, the initial open-polyline approach was scrapped after Ben correctly identified
it as the wrong primitive. A CAD-style connected graph with shared vertex identity is
required for a structurally coherent roof model. The graph model was designed and approved
in that conversation; the open-polyline code was fully removed and replaced.

### Two role vocabularies

Perimeter edges (polygon sides) and internal graph edges have different structural roles:
- **Perimeter:** Eave (horizontal overhang edge), Rake (sloped gable edge)
- **Internal:** Hip (ridge sloping to corner), Valley (two planes meeting inward), Ridge (peak)
These are stored in different places: `shape.lineRoles` for perimeter, `edge.role` for graph.

### Deferred from this step

- Slope rules, Z-derivation, peaked-eave inference — all deferred per #18. When a ridge
  endpoint lands on a perimeter edge, the topology is recorded (perimParent vertex), but the
  elevation consequence (eave rising to meet the ridge) requires the slope/Z model.
  Logged in ADDITIONAL_FUNCTIONALITY.md #18 build-order.
- Roof drainage, eavestrough/RWL, soffit/fascia — all in #18 build-order.
- Primary-reference reassignment UI — still deferred from sub-step 5.

### Browser-verified this session

- perimParent auto-split confirmed by graph dump: ridge endpoints snapping to perimeter edges
  produced `perimParent: {shapeIdx, segIdx}` vertices, referenced by shared ID in ridge edge.
  No duplicate floating vertices. Topology genuinely connected.

---

---

## SESSION 14 — Floor-height Z-stack data structure + entry panel

**Branch:** main | **Commits:** 2942e0e (Piece 1), e780b88 (Piece 2)

### What was built

**Step 8 (Elevation calibration + tracing), Pieces 1-2: datum-layer height capture**

**Piece 1 (2942e0e): floorHeightsRef + accumulateZ + getFloorLevel — no UI**
- `floorHeightsRef = useRef({})` in App.jsx — keyed by FLOOR_ORDER level string
  (e.g. `'Main Floor'`), value `{ floorToCeiling: number|null, floorSystemAbove: number|null }`.
  Values stored in feet. First floor-level-keyed ref in codebase (all others are pageId-keyed).
- `accumulateZ(floorHeights, presentLevels, floorOrder)` — pure function in geometry.js.
  Returns `[{level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove}]` base→top.
  `presentLevels` = FLOOR_ORDER levels with at least one categorized Floor Plan page.
  Nulls treated as 0 for accumulation but preserved in output.
- `getFloorLevel(pageId)` — App.jsx helper. Looks up `pages` state array, returns `subLabel`
  if it is a known FLOOR_ORDER level (via `isKnownFloorLabel`), else null. The only helper
  in the codebase that crosses the ref/state boundary (floor level is in React state, not a ref).
- `floorHeightsTick` state counter bumped on every `floorHeightsRef` write (same pattern as
  `alignTick`) to force React re-render from ref mutation. `void floorHeightsTick` silences
  linter while creating the dependency.
- Temporary console dump added, verified correct (React double-invoke in dev Strict Mode fires
  dump 4× — expected, not a bug), then removed before commit.
- Upload reset added to `handleFileChange`: `floorHeightsRef.current = {}` plus all draft
  state cleared (`fhFtVals`, `fhInVals`, `fhExpandedLevel`, etc.).

**Piece 2 (e780b88): Floor-heights entry panel — browser-verified**
- "Floor Heights" toolbar button (teal `.floor-heights-btn`) toggles `.fh-panel` overlay.
  Only visible when PDF loaded + no active mode (draw/edit/calibrate/categorize).
- Right-side overlay: `position:absolute; right:0; height:100%; width:300px; z-index:100;`
  dark semi-transparent background; no effect on canvas area.
- **Outstanding worklist (amber):** lists any missing `floorToCeiling` or `floorSystemAbove`
  for each present level; green "All heights entered" when complete.
- **Stack zone:** one `.fh-row` per `fhZStack` entry, base to top.
  - Level name header.
  - Ceiling height: two `number` inputs (ft + in), matching calibration dialog convention.
    Per-level `fhFtVals`/`fhInVals` maps hold draft values independently per row.
    Storage formula: `ft + inches/12` feet. Null stored if both fields are blank.
  - Floor-system-above: expanding control with presets (2×10 = 10.625", 2×12 = 12.625",
    11⅞″ I-joist = 13.25", 14″ I-joist = 15.375", 16″ I-joist/truss = 17.375",
    24″ truss = 25.375") + Custom inches input (`step="0.125"`) with `+1⅜″ sheathing`
    checkbox. All preset values are total depths in inches; converted via
    `inchesToFhUnit(inches) = fhDisplayUnit === 'ft' ? inches/12 : inches*0.0254`.
    `fhDisplayUnit` derived from first available `pageScalesRef` displayUnit, defaults `'ft'`.
  - Topmost level (`fhTopLevel`) shows "— (top of stack)" instead of floor-system control.
  - Derived readouts: floorZ and ceilingZ (display only, muted grey, computed from `fhZStack`).
- Input-format fix applied before commit: ceiling height was originally a single field;
  changed to ft+in two-field entry. Custom floor-system field explicitly in inches with `in` label.

### Architecture decisions this session

**3a scope boundary (explicit):** Session 14 elevation step captures topology/offsets only.
No pixels→real-world XYZ coordinate conversion. `floorHeightsRef` stores heights in feet
(display unit). Coordinate-space conversion is deferred to Phase 2.

**Datum vs. element framing (new):** `floorHeightsRef` is the DATUM layer — named reference
elevations shared across the project (one per known floor level). Per-element Z on individual
shapes is the ELEMENT layer — does not exist yet and is deferred to Phase 2. `completedShapesRef`
shapes do NOT have `floorLevel` or `elevationZ` fields (CLAUDE.md previously documented these
as present — that was a phantom; corrected in Session 14 doc refresh). Coplanar elements sharing
a datum are NOT merged; see ADDITIONAL_FUNCTIONALITY.md #19.

**Imperial-only (explicit):** floor-heights panel stores/displays ft/in only. Metric rework
deferred to #20.

### Deferred-register entries added this session

- **#19 — Coplanar-distinctness principle (architectural record):** coincidence ≠ identity;
  datum layer vs. element layer; per-element Z deferred to Phase 2 (#7).
- **#20 — Metric dimension-entry rework:** all inputs currently imperial-only; unified
  rework deferred to dedicated session.

### BUILD_ROADMAP.md addition

Waypoint added (⏸ WAYPOINT — Deep-level program review): triggers at Phase 2 threshold,
when full 3D geometry + volume model exists. Purpose: frank reassessment of program goals
informed by Phase 1 experience; rebuild is an explicitly anticipated possible outcome.

---

## SESSION 15 — Floor-heights panel Piece 3: floor-to-floor back-solve

**Branch:** main | **Commit:** 4e06de0

### What was built

**Step 8 Piece 3: optional floor-to-floor entry that back-solves ceiling height**

The floor-to-floor input lets the user enter an inter-floor measurement and derives
`ceiling = floorToFloor − floorSystemAbove`, storing the result in `floorToCeiling`.
This is a UI-only addition; `accumulateZ` in geometry.js is unchanged.

**Four agreed fork resolutions (designed before build):**

1. **Stickiness via `ceilingSource` (Fork 1):** New field `ceilingSource: 'direct'|'solved'`
   on `floorHeightsRef.current[level]`. When `'solved'`, editing `floorSystemAbove`
   (via preset or custom) re-solves the ceiling to hold floor-to-floor constant — writes
   `{floorSystemAbove: newFsa, floorToCeiling: newFtc}` atomically via `setFloorHeightFields`.
   Reject (keep prior floor-system value) if validation fails.
2. **Last-edited-wins (Fork 2):** Editing the ceiling ft/in fields directly writes
   `ceilingSource: 'direct'` (via `setFloorHeightFields`). Entering floor-to-floor writes
   `'solved'`. One flag, two entry paths; no priority hierarchy.
3. **Disabled-hint + absent-on-top (Fork 3):** Floor-to-floor input is ABSENT entirely
   on the top-of-stack row; shows inline `cat-panel-hint`-style text ("Set floor system
   above first") when `floorSystemAbove` is null; enabled otherwise.
4. **Reject negative AND zero (Fork 4):** `validateCeiling(ftc, fsa)` — the ONE shared
   guard — rejects if `ftc ≤ 0` (zero ceiling invalid) OR `ftc ≤ fsa` (equal also
   rejected, as zero remaining clearance is not valid). Called by BOTH the floor-to-floor
   entry onChange AND the Fork-1 re-solve inside `applyFhPreset`/`applyFhCustom`. On
   failure: sets `fhError({level, msg})`, returns without writing anything.

**Shared-guard design:** `validateCeiling` is defined once in App.jsx render scope and
called from both entry points — no duplicated logic. The Fork-1 path reads the sticky
`f2f = floorToCeiling + floorSystemAbove` from the ref before computing `newFtc`,
so the stuck floor-to-floor is always held correctly even when the user re-picks presets
multiple times.

**Controlled-input loop-guard confirmation:** Ceiling inputs are controlled
(`value={fhFtVals[row.level] ?? ''}`). The floor-to-floor onChange back-syncs the
ceiling display by calling `setFhFtVals`/`setFhInVals` directly — this updates the
displayed values WITHOUT firing the ceiling onChange handler (controlled inputs don't
fire onChange on external setState). Loop guard confirmed before build; no workaround needed.

**`fhF2fFtVals` / `fhF2fInVals` draft maps:** The typed floor-to-floor stays visible
in its own inputs after entry and does NOT recompute when Fork-1 re-solves the ceiling.
The f2f input is sticky; only the ceiling display syncs.

**`fhError` state:** `{level, msg}|null`. Clears on next valid entry and on focus-switch
between levels (onFocus clears if `fhError.level !== current level`).

**`.fh-error` CSS:** added to App.css (red `#f87171`, 0.76rem, `width:100%`).

**Runtime probes run (browser-verified before commit):**
- Back-solve: enter f2f → ceiling inputs update, derived readouts correct, upstack
  accumulated-Z ripple verified on 3-level stack.
- Both-direction source-flag round-trip: `'solved'` → edit ceiling → `'direct'` → change
  floor-system preset → ceiling NOT re-solved (correct). `'solved'` → change floor-system
  preset → ceiling RE-solved (correct).
- Fork-1 rejection: increase floor-system on a `'solved'` level past the f2f value →
  red error shown, floor-system not written, prior value retained.
- Absent/disabled states: top level has no f2f row; level with null floor-system shows hint.

---

---

## SESSION 16 — Elevation-spatial planning; coordinate-conversion pulled forward

**Branch:** main | **Commits:** none (planning only — no code written this session)

### What happened

Planning session for the SPATIAL half of Step 8 (elevation PDF alignment +
reference lines). No code was written. The session resolved the design forks for
the elevation mechanic, then surfaced a larger decision that supersedes it.

### Decision: pull the pixels→real-world coordinate conversion forward

Repeatedly, every Z-aware step (floor heights, elevations, roof slope) has had to
work around geometry being stored in canvas pixels rather than real-world units.
The recurring friction is the deferred pixels→real-world conversion (CLAUDE.md's
standing "post-Phase-1.5 refactor" note; the "gated on pixels→XYZ" language in
ADDITIONAL_FUNCTIONALITY #7/#17/#18/#19).

Decision made this session:
1. Scope the pixels→real-world coordinate conversion NOW, as its own dedicated
   step — the foundation. It touches every stored coordinate, every snap, every
   label, every transform consumer; it gets its own planning chat with its own
   loaded context (same "own room to think" reasoning that protects the multi-floor
   work in BUILD_ROADMAP).
2. Per-element 3D identity (the ELEMENT layer — #7 intra-floor Z, #19 coplanar-
   distinctness) stays SEQUENCED BEHIND the conversion. It depends on the
   conversion existing and must be designed deliberately per #19, not bolted on.
3. The elevation spatial step is PAUSED and will be rebuilt on real units once the
   conversion lands (cleaner that way).

### Step-8 spatial forks — RESOLVED BUT PARKED (do not re-litigate when elevation resumes)

- **Edge-as-ghost:** an elevation's ghost reference is the selected floor-plan EDGE
  (already calibrated) projected as a horizontal line of known real-world length.
  It reuses the existing align machinery (.pdf-align-layer, pageTransformsRef,
  getCSSTransform, body-drag + corner handles); handles anchor to the edge-line
  endpoints rather than a polygon bbox. This collapses old Fork C (no separate
  elevation align entry point needed) and old Fork B (horizontal scale is borrowed
  from the edge).
- **Uniform scale always:** the borrowed horizontal scale applies proportionally to
  BOTH axes — no non-uniform/stretched scaling, ever. There is ONE uniform scale per
  elevation, set by the edge-ghost. Floor/ceiling reference lines are positioned
  WITHIN that scale and read height OFF it; they do NOT establish an independent
  vertical scale.
- **Datum-Z this step / element-Z later (old Fork A):** the elevation floor/ceiling
  lines read/write the DATUM layer (floorHeightsRef) only. The traced elevation
  outline is stored as 2D pixels like every other shape — NO per-vertex Z this step.
  Per-element Z is the ELEMENT layer, sequenced behind the coordinate conversion.
- **Last-edited-wins across surfaces:** the elevation line and the floor-heights
  panel are two editing surfaces for the SAME value in floorHeightsRef. Edit one and
  the other updates to match — same last-edited-wins pattern as Piece 3's
  ceilingSource, now spanning two surfaces instead of two fields.
- **Piece sequence (when elevation resumes):** floor-plan edge-select → align
  horizontal to edge-ghost (uniform) → place floor/ceiling lines (read height off
  the uniform scale) → trace outline as single open polyline. Edge-select comes
  FIRST because the edge IS the align ghost.

---

## SESSION 17 — Coordinate conversion (R2) fully scoped

**Branch:** main | **Commits:** none (planning only — no code written this session)

### What happened

Planning session that scoped the pixels→real-world coordinate conversion pulled
forward in Session 16. No code written. Every design fork is now resolved; the next
session is the build, starting with the consumer inventory (sub-fork 5).

### Target: R2 — single shared real-world XY frame

Of three candidate scopes — R1 (per-page real units, no shared frame), R2 (single
shared real-world XY frame, Z stays datum-layer), R3 (full XYZ, per-vertex Z) — the
target is **R2**. R1 is too shallow (no shared frame ⇒ the next Z-step hurts again).
R3 is the ELEMENT layer (#7, #19) and stays SEQUENCED BEHIND the conversion. R2 is
the foundation that makes R3 cheap to add later.

**R2 is built to R3-readiness as a HARD ACCEPTANCE CRITERION, not a nice-to-have:**
1. **Z-ready vertex shape** — vertices stored in a structure designed to carry an
   optional Z from day one (absent/null now), so R3 adds Z as an extension, not a
   hunt-and-patch retrofit.
2. **No coordinate-coincidence merging (#19)** — R2 must NOT merge or dedupe elements
   on the basis of shared XY. Two coplanar elements at the same XY remain distinct
   (slab-vs-wood-frame case). Per-element identity is preserved even though R2 only
   models XY.

### Standing rule for the whole refactor (R2/R3 boundary discipline)

We are building the FOUNDATION (R2). Anything needing per-vertex Z, per-element
offsets, or assembly identity is R3 — it gets logged and sequenced, never folded in.
When a build piece *feels* like it wants Z, that feeling is the signal we've hit the
R2/R3 seam: STOP and check, do not build through it. (Ben flagged he may need
reminding of this as build depth increases; Claude surfaces it proactively, same as
the scope-drift protocol, tuned to this seam.)

### Five sub-forks — RESOLVED

- **1 (origin/frame) — 1a:** the primary-reference page (`primaryReferenceId`, first
  calibrated) defines the shared frame; its calibrated space converted to real units
  IS the frame. Every other page's geometry is placed into it by walking the
  `pageRefParent` chain and composing the existing `pageTransformsRef` align
  transforms. "Fixed arbitrary origin" coincides operationally with the primary
  page's zero — everything still computed geometry-to-geometry. Reuses the multi-floor
  sub-step-5 machinery as-is; no synthetic-frame layer (1b rejected — buys nothing
  until R3).
- **2 (canonical unit) — meters, stored:** all geometry stored in meters (one
  canonical unit; `pxPerMeter` is the natural pivot). DISPLAY/ENTRY stays imperial
  (ft+in), UNTOUCHED by this refactor. This refactor changes STORAGE only. The unified
  metric/imperial ENTRY rework (#20) stays deferred — NOT part of this work. Boundary:
  storage metric, entry/display imperial.
  *(HISTORICAL RECORD — Session 17 planning. **SUPERSEDED by Path 3 in Session 18:** geometry
  stays stored in PIXELS; meters are a read-time projection. See Session 18 entry.)*
- **3 (conversion source) — via `getEffectiveScale`:** own-calibration pages use their
  `pxPerMeter`; confirmed-ghost/borrowed-scale pages use the borrowed
  `getEffectiveScale` value; uncalibrated pages cannot convert and stay excluded /
  pixel-only. Forced by existing machinery.
- **4 (migration model) — 4a, store meters natively:** geometry is stored in meters
  the moment it's created; pixel↔meter conversion happens ONLY at two well-defined
  seams — input events (mouse=pixels in) and render (canvas=pixels out). Refs hold
  meters, period. Rejected 4b (keep pixels, convert-on-read): 4b formalizes the
  pixel/units split into every consumer forever — the exact friction being removed —
  and does NOT lay the foundation. 4a is more upfront work (every consumer changes
  once, = sub-fork 5) but is the least-bug-prone ARCHITECTURE and is neutral-to-cheaper
  at runtime (convert twice per interaction at seams vs. on every read). Ben accepted
  the upfront-work-for-correctness trade explicitly.
  *(HISTORICAL RECORD — Session 17 planning. **SUPERSEDED by Path 3 in Session 18:** pixels
  stored, meters projected at read time via pxToMeters/metersToPx. 4a creates a
  recalibration trap (frozen conversion ratio); Path 3 avoids it. See Session 18 entry.)*
- **5 (consumer inventory + done-state) — the build itself:** every snap, label,
  hit-test, transform consumer, and the draw/edit/calibration handlers that currently
  assume pixels get converted to read meters. This is the bulk of the work and the
  first build step of the next session. **Done-state (as planned in Session 17, superseded):**
  all geometry in the shared real-world XY frame in meters; every consumer reads meters; pixel
  conversion isolated to the two seams; R3-ready vertex shape in place; #19 identity preserved.
  *(HISTORICAL RECORD — Session 17 planned done-state. **SUPERSEDED:** actual done-state per
  Path 3 = geometry stays in pixels, named seam installed, makeVertex factory in place. See Session 18.)*

## SESSION 18 — R2 coordinate foundation (Path 3 / named seam + vertex factory)

**Branch:** main | **Commits:** 040e371 (Piece 1), 71e01ca (Piece 2)

### What was built

**Pixels→real-world coordinate foundation — Path 3 / 3-minimal (behavior-neutral refactor)**

Two pure refactor commits, zero behavior change. Geometry stays stored in pixels.

**Piece 1 (040e371): Named px↔meter conversion seam**
- `pxToMeters(px, pageScales, pageId)` and `metersToPx(m, pageScales, pageId)` added to
  `canvasRenderer.js` — same `(value, pageScales, pageId)` signature as `pxToDisplayDist`.
- `pxToDisplayDist`'s internal `px / scale.pxPerMeter` now routes through `pxToMeters`.
- `snapToGrid`, `applySnap`, `snapPerp` (all three used `scale.pxPerMeter * snapIncrementRef.current`)
  and `commitLabelEdit` (`meters * scale.pxPerMeter`) now route through `metersToPx`/`pxToMeters`.
- Confirmed: `snapIncrementRef.current` is stored in meters (e.g. `0.1524` = 6 inches). Math
  identical. `pxToMeters` available in App.jsx for R3 call sites that need px→m.

**Piece 2 (71e01ca): makeVertex factory + R3-ready vertex shape**
- `makeVertex(x, y)` exported from `geometry.js`: returns exactly `{ x, y }`. z is ABSENT (not null).
- All stored-polygon-vertex construction routes through it:
  - App.jsx: `snapToGrid` return, `applySnap` return, `getAlignmentSnap` snappedPos, `clampToCanvas`
    return, `insertPt`, `applySegmentMove` (both moved verts — this site not listed in recon but clearly
    stored vertices, added for completeness)
  - geometry.js: `findCollinearOverlap` P_start/P_end; `linePolyIntersect` interior + vertex crossing
    points; all six vertex constructions in `splitPolygon`
- Spreads of makeVertex results (`{ ...makeVertexResult }`) are left as-is — spread copies all own
  enumerable properties, correctly propagating z when R3 adds it. Not routed: `getCanvasPos` (input
  seam, not stored), roofGraphRef nodes (graph topology, not polygon vertices), transient mid-calc
  `{x,y}` literals that never reach completedShapesRef.

### The Path 3 decision (supersedes Session 17's 4a scope)

Session 17 resolved sub-fork 4 as "4a / store meters natively." That was SUPERSEDED after a
code-recon pass confirmed that:

1. **4a creates a recalibration trap:** storing meters freezes the `pxPerMeter` ratio at write time.
   If a page (or its borrow-chain parent) is recalibrated, stored meters are silently orphaned —
   a data-corruption path that does not exist in the pixel-stored model.
2. **Path 3 is strictly less machinery for the same R2 outcome:** geometry sharing a real-world
   frame is achieved operationally through shared calibration scale + ghost alignment, not by
   composing coordinates into a single stored representation. Composing the `pageRefParent` chain
   onto actual geometry coordinates is R3 work, not R2.
3. **R2 acceptance criteria fully met:** (a) R3-ready vertex shape via makeVertex — verified by
   static review (returns `{x,y}`, z absent, spreads propagate correctly); (b) no coordinate-
   coincidence merging (#19 honored, coplanar elements stay distinct).

The Session 17 planning docs described 4a. Those docs now reflect Path 3. Historical note:
Session 17's fork-4 resolution (4a) is superseded — it was the right analysis given the
information available; Path 3 emerged from seeing the actual consumer sites during recon.

### New deferred-register entries this session

- **#21 — Planes/edges as rule-imposing boundaries:** ELEMENT-LAYER requirement; edges are
  boundaries with rules, not just point-pairs. Architectural record, constrains R3/Phase 2 design.
- **#22 — Recalibration-independence invariant:** geometry must stay scale-independent in storage;
  no frozen conversion ratio. Active invariant (not deferred) — Path 3 honors it; future steps must too.

---

## SESSION 19 — Elevation spatial Pieces 1+2: edge-pick + align + own-scale confirm

**Branch:** main | **Commits:** 89b7ba2 (Piece 1), current (Piece 2)

### What was built

**Elevation spatial Piece 1 (89b7ba2): "Set elevation edge" mode**
- Toolbar button on Elevation pages opens pick mode.
- Floor-plan ghost drawn on elevation canvas; user clicks any ghost perimeter segment.
- Stored as `elevationEdgeRef.current[elevPageId] = {sourcePageId, shapeIndex, segmentIndex,
  endpointA, endpointB}` — authoritative-indices pattern (same as frontFace).
- Purple edge highlight via `drawSegmentHighlight(ctx, a, b, 'elev-edge')` variant.
- Selector shown when >1 floor-plan candidates with locked shapes.
- Helpers: `hitTestElevEdgeSegment`, `selectElevEdge`.

**Elevation spatial Piece 2 (current): "Align elevation" mode**
- "Align elevation" button: visible on Elevation pages with stored edge; disabled (with title hint)
  when no edge is set or source has no scale.
- Mode: temporary bounding box padded by `ELEV_EDGE_PAD = 24` world pixels around the two
  edge endpoints, four amber corner handles.
- Body-drag → translate; corner-drag → uniform scale, anchor at diagonally-opposite corner.
  Identical math to floor-reference align: `newS = startS * (d1/d0)`, `tx1 = ax - (ax - startTx) * ratio`.
- Drag uses existing `alignDragRef` / `alignTick` / `alignOverHandle` refs — no new drag state.
- Zoom/pan remain active during align.
- Prompt bar: "Drag to translate · drag a corner to scale · then Confirm."
- "Confirm alignment": computes `elevPixelLen = hypot(B-A)` in shared canvas space;
  `realLenMeters = elevPixelLen / srcPxPerMeter`; `elevPxPerMeter = elevPixelLen / realLenMeters`.
  Stores `pageScalesRef.current[elevPageId] = { pxPerMeter: elevPxPerMeter, displayUnit }`.
  Does NOT set `pageRefParentRef` — elevation is a calibrated peer, not a scale child.
  After correct alignment `elevPxPerMeter = srcPxPerMeter` (canvas coordinate space is shared).
- "Exit" dismisses without writing scale.
- Both modes reset on page navigation and PDF upload.

### Key architectural insight confirmed this session (coordinate-system invariant)

The PDF `{tx,ty,s}` transform in `pageTransformsRef` is VISUAL ONLY: it repositions the
`.pdf-align-layer` backdrop div, not the measurement canvas (`measureRef`) or the canvas-world
coordinate system where geometry is drawn. After correct alignment, ghost and elevation PDF
features are co-registered in the same canvas-world space, so the elevation's `pxPerMeter`
numerically equals the source plan's `pxPerMeter`. This is correct behavior — both pages
share one coordinate space. This invariant is now documented in CLAUDE.md Design notes.

### Architecture decisions

- Elevation stores its OWN `pageScalesRef` entry, NOT via `pageRefParentRef` borrow.
  Rationale: own calibration honors #22 (recalibration-independence): if the source floor
  plan is recalibrated, the elevation's stored scale stays fixed. The value equals srcPxPerMeter
  because the coordinate space is shared — but it is stored independently as a calibrated peer.
- `resolveElevEdge(pageId)` helper: always resolves endpoints live from authoritative
  indices (shapeIndex/segmentIndex) rather than from the endpointA/B snapshots.
- `getElevEdgeBbox(A, B)` helper: pads by 24px on all sides so handles are always
  grabbable even for near-degenerate (very short or axis-aligned) edges.

### New deferred-register entries this session

- **#23 — Isometric multi-reference elevation alignment:** Z-driven display of floor-plan
  references projected isometrically onto elevation view. Deferred pending R3/Phase-2
  coordinate model (#7, #17, #19). See ADDITIONAL_FUNCTIONALITY.md.

### Bug / improvement items logged (not built)

- **Front-face select vanishes until next page:** the edge highlight/interaction may not
  persist correctly across all redraws — needs a focused fix session.
- **Categorize-input button color scheme not documented:** "next logical step" highlighting
  logic exists but the color-state rules are not written down; UI polish candidate.

---

## SESSION 20 — Elevation Piece 3 sub-pieces 1+2: reference lines + drag-to-place

**Branch:** main | **Commits:** 1cb2c0b (sub-piece 1), b597e91 (sub-piece 2)

### What was built

**Sub-piece 1 (1cb2c0b): `drawElevRefLines` — read-only floor/ceiling reference lines**
- `drawElevRefLines(ctx)` helper added before `redrawFrontFaceLayer` in App.jsx.
- Called at end of `redrawFrontFaceLayer` (view mode); gates on confirmed `pxPerMeter` +
  `resolveElevEdge` non-null + `fhZStack.length > 0`. View-only — not yet wired into
  draw/edit redraws (elevation tracing is Piece 4, not yet built).
- Teal (`#0d9488`) solid floor lines; amber (`#d97706`) dashed ceiling lines; labels left edge.
- Anchor Y: `elevBaseYRef.current[pageId] ?? (edgeData.A.y + edgeData.B.y) / 2` (provisional fallback).
- Spacing: `anchorY - (Zfeet - lowestFloorZFeet) × 0.3048 × pxPerMeter`.
- `floorHeightsTick` added to passive-redraw `useEffect` deps.

**Sub-piece 2 (b597e91): `elevBaseYRef` + drag-to-place base line**
- `elevBaseYRef = useRef({})` — per-elevation-page pageId-keyed anchor Y; cleared on PDF upload.
- Mousedown intercept: in view mode (before pan), hit-tests within `8 / zoom` px of base line Y.
  If hit: stores `alignDragRef.current = { mode: 'elevBase', startClientY, startBaseY, pageId }` and
  returns (no pan). Mousemove: `dy = (clientY - startClientY) / zoom`; writes `elevBaseYRef`; calls
  `redrawFrontFaceLayer(null)` directly. Mouseup: clears alignDragRef before the `!editMode return`.
- Pan on empty canvas completely unaffected (hit-test fails → falls through to `startPanDrag`).
- Persists across page-nav (pageId-keyed); cleared on PDF upload.

### Key design decisions confirmed this session

- **Option B for Piece 3 drag:** placement-only — drag moves WHERE the stack sits on the elevation;
  drag does NOT edit floorHeightsRef values. Drag-to-edit individual heights is a separate later sub-piece.
- **Drag = whole-stack shift:** one Y-offset for the entire stack; `accumulateZ` spacing is always
  authoritative. Only the base line is the grab target; other lines are not yet interactive.
- **No new React state:** `elevBaseYRef` is a ref (not state). Repaint driven by direct
  `redrawFrontFaceLayer(null)` call from mousemove — no tick bump needed.
- **`alignDragRef` reuse with `mode: 'elevBase'`:** safe because `elevAlignMode` and `alignMode`
  return early before elevBase code would conflict. Clean separation.

### New deferred-register entries this session

- **#24 — Global drag-release robustness:** drags ending outside the browser window don't release
  on mouseup; fix is window-level listener + pointercancel. App-wide, low-risk polish pass.
- **#25 — Edge-select button labels:** Piece 1 "Set elevation edge" shows only "Exit" after
  picking; should offer "Confirm edge selection" / "Choose again". UI polish.
- **#26 — Categorization exit navigation bug:** exiting categorize mode while on an uncategorized
  page stays on that page; should navigate to last categorized page. Step 4b bug.
- **#27 — Reference-line snap-suggest to known Y positions:** when dragging the base line, snap
  toward known reference Ys (edge-midpoint, peer pages). Same UX as start-vertex snap-suggest.
- **#28 — PDF visual analysis / analysis-first front end (MAJOR VISION):** automated per-page
  analysis on upload → confirm-and-correct overlay. Original product vision; flagged for deep-review
  waypoint as a paradigm-level decision (analysis-first vs. trace-first).

---

## SESSION 22 — Elevation Piece 4 sub-piece 2 (grade line) piece 1: open-polyline grade tool + on-closure prompt

**Branch:** main | **Commit:** 3fae81b

### What was built

**Grade-line draw tool (piece 1 of 3) — commit 3fae81b**

- **`shapeKind: 'grade-line'` discriminator** — new optional field on shapes in `completedShapesRef`. Absent (undefined) = closed wall polygon (all existing shapes, zero migration). Present as `'grade-line'` = open reference polyline.

- **Type-discrimination at 7 code sites:**
  - `drawLockedShapes` (canvasRenderer.js): skips grade-line entries (no `closePath`)
  - `drawGhostShapes` (canvasRenderer.js): skips grade-line entries (grade lines don't show as ghost reference on adjacent floors)
  - `hitTestSegments`: skips grade-line shapes (edit hit-test only targets wall polygons)
  - `hitTestShapeBody` / `pointInPolygon`: skips grade-line shapes (no area hit-test on open line)
  - `getEligibleShapes` (geometry.js): excludes grade-line shapes from Combine eligibility
  - All 5 edit sub-mode forEach loops: skip grade-line shapes in drawShapePoly calls

- **`drawGradeLineShapes(ctx, completedShapes, pageId)`** new export in canvasRenderer.js: draws open polylines in green (#16a34a) dashed (8/4) style with vertex dots; no `closePath`; respects pageId filter. Wired into all 13 render paths (view/draw/review/edit sub-modes/roof/role canvases).

- **On-closure prompt on Elevation pages:** when a wall polygon closes on an Elevation page, `setShowGradeLinePrompt(true)` fires alongside `setReviewShape(shape)`. The polygon enters normal review state. Prompt shows "Trace grade line?" with [Yes — trace grade line] / [No] buttons. Yes sets `gradeLinePending: true`; No clears the prompt. Prompt choice is independent of polygon confirm/discard.

- **`confirmShape` integration:** reads `gradeLinePending` before clearing it. If pending: after polygon is locked, `setGradeLineDrawing(true)` — grade-line trace mode starts automatically. Otherwise: `maybePromptFrontFace()` as normal.

- **Grade-line draw mode:** reuses existing `drawVerticesRef` and all snap/draw conventions (axis snap, distance snap, alignment guides, Z undo). Close-snap ring suppressed (`!gradeLineDrawing && vertices.length >= 3`) so the polyline cannot accidentally close back to its start. Finish via Enter key or "Finish grade line" toolbar button (disabled if `< 2` vertices). Escape/Cancel exits draw mode and clears grade-line state.

- **`commitGradeLine()`:** pushes `{ vertices: [...verts], pageId, status: 'locked', shapeKind: 'grade-line' }` to `completedShapesRef`; clears draw state; redraws via `redrawDrawCanvas(null, [], ...)`.

- **State management:** `showGradeLinePrompt`, `gradeLinePending`, `gradeLineDrawing` — all reset on page-nav, PDF upload, `exitDrawMode()`, and `discardShape()`.

- **Wall polygon unmodified throughout:** the grade line is stored alongside the wall polygon; no intersection, splitting, or tagging of the polygon occurs. Above/below-grade interpretation is R3/deferred.

### Known gaps (pieces 2 and 3)

- **Piece 2:** Enforce termination on polygon vertex/edge (grade line must start/end on wall geometry); add lowest-floor reference line as visual guide.
- **Piece 3:** Grade-line editing (vertex drag, segment drag via Edit Shapes or a dedicated edit mode).
- **UX clarity pass:** "Grade line draw UI needs a clarity pass" logged — toolbar text and prompt flow could be cleaner.
- Grade lines are NOT Z-aware (no per-vertex Z); all vertices stored as 2D pixels via makeVertex factory.

### Dev fixture

Dev fixture (commit 21a967c from Session 21) captures `completedShapesRef` including grade-line shapes with `shapeKind` field. Snapshot + restore via console (`copy(JSON.stringify(window.__snapshotFixture()))` / `await window.__restoreFixture(obj)`). Fixture PDF at `public/devFixtures/test-fixture.pdf` (gitignored). Save/Load buttons still deferred (#31).

### New deferred-register entries this session

- Grade-line UI clarity pass: toolbar text and prompt could be more obvious — log for a UI polish session.

---

## SESSION 21 — Elevation Piece 4 sub-piece 1: tracing + edit on Elevation pages; edit-drag index fix; dev fixture

**Branch:** main | **Commits:** 5266dc5 (Piece 4 sub-piece 1), 1a3a144 (edit-drag bug fix), 21a967c (dev fixture)

### What was built

**1a3a144 — Fix elevation edit hover/drag: filtered-local vs. global shapeIdx**
- Root cause: `drawEditCanvas` default path used `.filter().forEach()` which gives LOCAL `shapeIdx` indices; hit-test functions (`getSegHit`, `getVertHit`) return GLOBAL indices into `completedShapesRef`. The elevation shape at global index 1 was filtered to local index 0 — `previewOverride.shapeIdx === shapeIdx` (1 === 0) always false → no preview, no drag visual.
- Floor-plan pages worked by coincidence: their shape is always `completedShapes[0]`; filtered index 0 = global index 0.
- Fix: `.filter().forEach()` → `.forEach()` with `if (shape.pageId !== currentPageId) return`. All other sub-modes already used the correct pattern.
- Three `!editMode` guards kept in `handleMeasureMouseMove` (lines 1447, 1484, 1531) — protect `elevAlignMode`, `alignMode`, and `elevBase` from intercepting edit-mode canvas interactions.
- All `[DBG-MD]`/`[DBG-MM]`/`[DBG-]` instrumentation removed before commit.

**5266dc5 — Elevation Piece 4 sub-piece 1: closed-polygon tracing + edit on Elevation pages**
- `drawElevRefLines` wired into `redrawDrawCanvas`, `redrawReviewCanvas`, and all five `drawEditCanvas` sub-mode paths (was view-mode only).
- `floorHeightsTick` added to draw/edit passive-repaint deps.
- No category fork: Elevation pages use the standard closed-polygon draw/review/confirm/lock/Edit-Shapes workflow directly.
- Decision: elevation outline = CLOSED polygon (not open polyline). Architecturally correct — an elevation outline is a boundary.
- Browser-verified.

**21a967c — Dev-only capture/restore test fixture**
- `window.__snapshotFixture()` and `window.__restoreFixture(obj)` DEV-guarded in component render body.
- Snapshot: all scenario-defining refs + state; excludes non-serialisable `combineEligibleRef` (Set) and ephemeral mode flags.
- Restore: writes all refs → resets modes → fetches `/devFixtures/test-fixture.pdf` → React state cascade + `renderPage`.
- `public/devFixtures/test-fixture.pdf` added to `.gitignore` — never committed.
- `copy(JSON.stringify(window.__snapshotFixture()))` = record; `await window.__restoreFixture(obj)` = restore.

### Key design decisions

- **Closed polygon for elevation outline.** Open polyline rejected — standard workflow correct.
- **Index fix: `.filter().forEach()` → `.forEach()` + early return** — matches existing sub-mode pattern.
- **Two-commit staging:** fixture block temporarily removed, commit A landed, fixture restored, commit B landed.
- **Fixture is console-only:** Save/Load buttons deferred (#31).

### Session runtime lesson

Elevation edit-drag bug survived TWO static-analysis rounds. Only `[DBG-]` instrumentation revealed the filtered-local vs. global index mismatch. Rule reinforced: **when a bug survives a static read, instrument and run.**

### New deferred-register entries this session

- **#29 — Derived envelope block + confirm-and-annotate elevation model:** Phase 2 architectural target; elevation surfaces derived from floor-plan polygons, not traced freehand. Gated on R3.
- **#30 — Grade / soil line:** geometry-only open polyline; Elevation Piece 4 sub-piece 2.
- **#31 — Dev fixture Piece 2: Save/Load buttons** (console-only today).
- **#32–#40 — Small UX notes:** categorize shortcut, button colour audit, ghost-vertex snap gap, align-handle cursor mirror, sidebar auto-collapse, edge-select copy, isometric ghost preview, reference-line label stacking + unconfirmed indicator, floor-to-floor field auto-grey.

### Piece 3 sub-piece 3 status

Drag-to-edit individual heights — **shelved, not cancelled.** Height editing stays panel-only.

### NEXT (after Session 23/24 — binding model reverted, grade line DONE)

Grade-line piece 2 is **DONE** (Session 24; c7a2092). The binding model was reverted — grade line
finishes anywhere with ≥2 vertices; snap is a position aid only. **Next is Ben's choice:**
- Optional grade-line **Piece 3**: "Redraw grade line" button (delete + restart draw), OR
- Move on to **elevation cross-sections / windows-doors**, OR
- Another increment from the deferred list.

---

## SESSION 23 — Elevation Piece 4 sub-piece 2 piece 2: enforced wall-vertex endpoint binding

**Branch:** main | **Commit:** 2f3f071

### What was built

**Grade-line endpoint binding (A1 strict) — commit 2f3f071**

BOTH grade-line endpoints must snap to and bind an existing wall-polygon vertex. Finish is blocked until both ends are bound; the committed shape carries identity refs to the bound vertices.

**New helper — `getWallVerticesWithId(pageId)`:**
Returns `Array<{x, y, shapeIdx, vertIdx}>` for wall-polygon vertices only (excludes `shapeKind === 'grade-line'`). `shapeIdx` = global index into `completedShapesRef`. `getVisibleVertices` and normal polygon start-snap are UNCHANGED — parallel path active only while `gradeLineDrawing`.

**Snap paths:**
- First vertex: mousemove uses `getWallVerticesWithId` (not `getVisibleVertices`) when `gradeLineDrawing`; `drawStartSnapRef` now carries `{x, y, shapeIdx, vertIdx}`. Existing red-ring render reads `.x/.y` — no change.
- Last vertex: new `gradeEndSnapRef = useRef(null)` stores nearest wall vertex during mousemove; red-ring render added.
- Shift suppresses both (but un-snapped last click sets `end = null` → Finish blocked).

**`gradeBindings = {start, end}` state:** Written on every click — first click records `start` identity; each subsequent click records `end` identity (null if no snap). Z-undo clears `end` (and `start` if back to 0). Added to keydown `useEffect` dep array.

**Finish gate:** `gradeCanFinish = drawVertexCount >= 2 && !!gradeBindings.start && !!gradeBindings.end`. Button `disabled={!gradeCanFinish}`; inline hint "Both ends must land on a building corner"; `commitGradeLine` hard-gates independently.

**Committed shape additions:** `boundStart: {shapeIdx, vertIdx}` and `boundEnd: {shapeIdx, vertIdx}` written by `commitGradeLine`. No other shape type carries these fields.

**Reset sites (all 6):** `exitDrawMode`, `discardShape`, `goToPage`, `handleFileChange`, `commitGradeLine`, dev-fixture restore — all clear `gradeBindings` and `gradeEndSnapRef`.

### Architecture decisions

- A1 strict: both endpoints must bind a wall-polygon vertex. No edge-along binding. Edge-termination <1% deferred (#30).
- Follow-on-edit (sub-step 2c) seams identified in recon but NOT built here — piece 3.
- Lowest-floor reference-line snap deferred to piece 3 (or later).

### Browser-verified

Corner-vertex snaps work on both endpoints; Finish stays greyed until both bound; grade line locks green on commit.

*(Session 23 architecture decisions were superseded in Session 24 — see below.)*

---

## SESSION 24 — Grade-line binding reverted; snap-as-aid model confirmed; docs corrected

**Branch:** main | **Commits:** 344668b (2c floor-line snap), c7a2092 (binding revert + revert of 2b/2d), this doc commit (close-out)

### What was built / decided

**Step 2c — lowest-floor reference-line snap (344668b):**
`getLowestFloorLineY()` helper (same formula as `drawElevRefLines`). `gradeFloorLineSnapRef` tracks hover snap. Red dot indicator on floor line at cursor X. Corner snap takes priority. Shift suppresses. Clicking snaps vertex Y to floor-line Y. No binding recorded (was a prerequisite for 2d, now moot).

**Binding model reverted — finish-anywhere + snap-as-aid (c7a2092, −28 lines net):**
The 2b/2c/2d/2e endpoint-binding model was reverted as the wrong abstraction. Trigger: a real grade line legitimately ended in open space between two building masses — the binding gate blocked a valid drawing. This is not an edge case; it is the normal case for a grade line that continues past the building.

Grade line now finishes with ≥2 vertices ANYWHERE (corner, floor line, or open space). Corner snap (`getWallVerticesWithId` + `gradeEndSnapRef`) and floor-line snap (`getLowestFloorLineY` + `gradeFloorLineSnapRef`) remain as POSITION AIDS only — they affect vertex placement, record nothing. No `boundStart`/`boundEnd` fields. No `gradeBindings` state. Finish gate = `drawVertexCount >= 2` only.

**Above/below-grade meaning — #41 only:** read-time intersection of grade polyline against intact wall polygon. No stored binding needed. This is the sole model, confirmed as correct. Old 2e (follow-on-edit) is moot — nothing bound, nothing to follow.

**Dev fixture Save/Load buttons confirmed LIVE:** Discovered during doc check — buttons have been live since Session 22 (#31 done). CLAUDE.md + ADDITIONAL_FUNCTIONALITY.md corrected.

### Process lesson (carry forward)

A reference line drawn under snap rules should be scoped as ONE build (draw + snap + finish) with meaning derived at READ-TIME — NOT fragmented into binding sub-pieces. The grade-line binding work was over-engineered; the runtime (an open-space end) exposed the wrong abstraction; the revert left the codebase leaner. Carry this default into future reference-geometry sequences: snap = drawing aid, interpretation = read-time.

**The doc close-out for this session was missed at the time of c7a2092 and corrected in a separate doc commit.** The code was correct; only the five docs were stale.

### Architecture decisions

- Grade line = polyline, finish anywhere. Wall polygon never modified. #41 (read-time intersection) is the sole model.
- Piece 3 (Redraw grade line button — delete + restart) built Session 25. Sub-piece 2 fully done.
- 2c floor-line snap stays (useful drawing aid regardless of binding).

---

## SESSION 26 — Windows/doors placement layer: Pieces 1+2 + two fix rounds

**Branch:** main | **Commits:** code commit + doc close-out

### What shipped

**Windows/doors Pieces 1+2 — placement layer (browser-verified):**

**Piece 1 — data spine:**
- `shapeIdCounterRef` (monotonic `useRef(0)`) + `nextShapeId()`: assigns `id: 'sh-N'` to every shape at creation. `confirmShape`, `commitGradeLine`, `confirmRoofShape`, and `confirmOpening` all call `nextShapeId()`. Counter cleared on PDF upload.
- `shapeKind: 'window'|'door'` discriminator added to the existing `'grade-line'` discriminator set. Absent = closed wall polygon (default; no migration of existing shapes). `isOpening(s)` helper in both App.jsx and canvasRenderer.js at all discrimination sites.
- `OPENING_TYPES = ['Tilt-turn', 'Casement', 'Fixed', 'Slider', 'Hinged door']` module-level array. Dropdowns derive from this.
- `dimensionBasisRef`: project-level `'frame'|'rough-opening'|null`; set once via first-use gate; persists across page navigation; cleared on PDF upload.
- `drawOpeningPoly(ctx, verts, style)` in canvasRenderer.js: teal fill/stroke (rgba(6,182,212) / #0891b2); same style interface as `drawShapePoly`. `drawOpeningShapes(ctx, completedShapes, pageId)` iterates locked openings. Both wired into all render paths.
- `drawLockedShapes` and `drawGhostShapes` skip openings (`isOpening(shape)` guard). Openings never shown as ghost reference on adjacent floors.
- `getEligibleShapes` in geometry.js excludes `shapeKind === 'window'` and `'door'` from combine eligibility.
- All five edit sub-mode forEach loops handle openings: wall polygons via `drawShapePoly`, openings via `drawOpeningPoly`. Openings excluded from split hit-test (`hitTestShapeBody` guard).

**Piece 2 — interaction + dialog:**
- "Place opening" toolbar button: visible when `isElevationPage && pageHasScale && !anyActiveMode`.
- Two-click free rectangle: `openingCorner1` set on first click; `makeRectVerts(c1, c2)` builds 4-vertex CW rect on second click. `applySnap` called with `useAngle=false` at both clicks and in rubber-band mousemove — axis-snap off, distance-snap active.
- First-use gate: if `dimensionBasisRef.current` null, sets `openingDraftShape.pendingBasis=true` and shows "Frame Size or Rough Opening?" modal first.
- Opening dialog: Kind radio, Type dropdown, Width/Height ft+in (seeded from pixel distance via `openOpeningDialog`), Label, Confirm/Cancel. `parseFtIn` converts to meters.
- `confirmOpening`: pushes shape to `completedShapesRef`, restores snap, repaints.
- `discardOpening`: clears state, restores snap, calls `redrawFrontFaceLayer(null)` — immediate repaint.

**Fix 1 — free rectangle (no axis-snap):** Original build used `useAngle=true` in placement, forcing 45° diagonals (square-only). Fixed to `useAngle=false` in both click handler and mousemove rubber-band.

**Fix 2 — 1" default snap + save/restore:**
- `saveAndDefaultSnapIncrement()`: saves `priorSnapIncrementRef.current = snapIncrementRef.current`, then sets increment to `ONE_INCH_M = 0.0254m`. Called on "Place opening" entry and on "Edit Shapes" entry when `lockedShapesOnPage.some(s => isOpening(s))`.
- `restoreSnapIncrement()`: restores prior value. Called in `discardOpening`, `confirmOpening`, and `exitEditMode`.

**Fix 3 — discardOpening repaint:** `discardOpening` originally cleared state without repainting; rubber-band rectangle stayed on canvas until something else triggered a repaint. Fixed by adding `redrawFrontFaceLayer(null)` as last action.

**Persistent top-bar snap selector:**
- Removed: inline draw-toolbar selector (`snapDist && pageHasScale && (() => ...)`) and `editSnapIncrementSelect` variable + all 5 usages in edit toolbar.
- Added: single `<select>` in `.toolbar` div, always visible when `currentPage && pdf`, `disabled={!pageHasScale}`. onChange triggers `redrawDrawCanvas` in draw mode or `drawEditCanvas` in edit mode. Exactly one selector project-wide.

### Key decisions (carry forward)

- **Placement-first (Path 2 / dumb-duplicate model):** openings are independent rectangles with metadata. No shared identity, no component instances. This layer is explicitly throwaway — it exists so placement works now; the component model (#44) replaces/migrates it later. No compatibility shim needed.
- **Free rectangle, not axis-constrained:** axis-snap off during placement is intentional. Openings are defined by two user-clicked corners; 45° constraint is wrong for this tool.
- **1" snap default is defaulted, not forced:** the selector is live and overridable. Prior setting restored on exit.
- **`discardOpening` must repaint:** any discard/cancel path that clears `openingDraftShape` must also call a canvas repaint. This is the same discipline as `discardShape` calling `redrawDrawCanvas(null, [], ...)`.
- **Component model deferred (#44):** shared instance identity, edit-all-vs-make-unique, cross-elevation place-from-existing. The dumb-duplicate Pieces 1+2 is intentionally the first layer and will migrate.

### Recon findings (for future sessions)

- `isOpening()` must be checked at SEVEN sites: `drawLockedShapes`, `drawGhostShapes`, `hitTestSegments`, `hitTestShapeBody`, `getEligibleShapes`, all five edit sub-mode forEach loops, and the split hit-test. Any new shape-type discriminator touches these same seven.
- Opening shapes included in vertex/segment drag and move sub-mode automatically once the edit forEach loops call `drawOpeningPoly` for openings and `drawShapePoly` for polygons. No new drag logic.
- The rubber-band preview in `handleMeasureMouseMove` must match the click handler's snap params (`useAngle=false`); mismatching them caused the axis-snap-forced-square bug.

### New deferred-register entries

- **#44 — Window/door component model** (shared instance identity; edit-all/make-unique; cross-elevation picker; dumb-duplicate is throwaway; no Z/no 3D on instances; see ADDITIONAL_FUNCTIONALITY.md)
- **#45 — Window-as-assembly model (MAJOR)** (mullions, sub-sections, frame width, glass areas; performance coefficients are spreadsheet math not in-app; depends on #44; see ADDITIONAL_FUNCTIONALITY.md)
- **#46 — Window-schedule import + place-from-list** (recognize schedule table from PDF; cross-ref #28 and #44; see ADDITIONAL_FUNCTIONALITY.md)
- **#47 — Top-bar snap selector metric fallback on no-scale page** (cosmetic; disabled control; bundle with #20)

---

## SESSION 25 — Elevation Piece 4 sub-piece 2 piece 3: Redraw grade line button + sequence decision

**Commit:** e9c04a6 (code) + doc close-out

**What shipped:**
- **"Redraw grade line" button (e9c04a6):** elevation-page toolbar button, visible only when `isElevationPage && gradeLineOnPage && !anyActiveMode`. `gradeLineOnPage` derived from `lockedShapesOnPage.some(s => s.shapeKind === 'grade-line')`. On click: filters `completedShapesRef` removing ALL grade-line shapes for `currentPageId`, repaints (clearRect + drawLockedShapes + drawGradeLineShapes), then calls `setDrawMode(true)` + `setGradeLineDrawing(true)` — same entry path as `confirmShape` after the on-closure prompt. Wall polygon untouched; `commitGradeLine` + snap-as-aid unchanged; finish-anywhere unchanged. Browser-verified by Ben (elevation page, existing grade line confirmed deleted and redrawn).

**Sequence decision:** windows/doors builds NEXT. Cross-sections deferred — windows/doors intentionally comes first.

**Architecture decisions:**
- Sub-piece 2 (grade line) is fully done: draw + corner-snap aid + floor-line-snap aid + finish-anywhere + Redraw button.
- Cross-sections deferred to after windows/doors (intentional ordering, not doc default).

---

## SESSION 27 — Wireframe composition seams B1+B2: pageVertexToWorld + elevYToWorldZ

**Branch:** main | **Commit:** 9e5bd0d

### What was built

**B1 — `getWorldOriginM()` + `pageVertexToWorld(v, pageId)`:**
- `getWorldOriginM()` — building-fixed XY origin in meters. Re-derived every call, never stored.
  Finds lowest present floor plan, resolves scale via `getEffectiveScale` (borrow-safe), converts
  all anchor-floor wall-polygon vertices to meters, returns `{ x: minX, y: minY, originPageId }`.
- `pageVertexToWorld(v, pageId)` — projects canvas-pixel vertex to world XY in meters; subtracts
  origin. Returns `{ x, y, z: null }`. Both functions resolve scale via `getEffectiveScale` — never
  raw `pageScalesRef.current` (a raw read fails if anchor floor borrows scale from parent).

**B2 — `elevYToWorldZ(y, elevPageId)`:**
Named inverse of `drawElevRefLines` Y→Z formula. Returns world Z in meters.
`anchorY - y` in pixels ÷ `(0.3048 × pxPerMeter)` → Z in feet → × 0.3048 → meters.
Implements same formula as `drawElevRefLines` (principle 7.3).

**`window.__dumpWorld()`:** DEV-guarded console test. Prints world XY for all floor-plan wall
polygons, Z@anchor for elevation pages, MISSING scale warnings.

**`pageRefOffsetRef` REMOVED:** canvas-pixel cross-page offset approach was tried in a first
implementation and removed as wrong. Do not reintroduce. All cross-page composition is in METERS.

### Diagnostic: separate canvas spaces

Proved during session that each PDF page has a SEPARATE canvas coordinate space (canvas resizes
per sheet in `renderPage`; `drawGhostShapes` applies no transform). `{0,0}` canvas-pixel offset
is only accidentally correct when all PDF sheets are the same size. Resolution: compose in meters
— sheet-size dependency dissolves because 1 meter = `pxPerMeter` pixels regardless of sheet size.
Identity assumption: cross-page XY is identity because trace-over-ghost bakes registration at draw time.

### Scale-path bug fixed before commit

First meters implementation passed raw `pageScalesRef.current` to `pxToMeters`. If anchor floor
borrows scale (no own calibration), this returns undefined → NaN origin → all vertices poisoned.
Fix: `getEffectiveScale(lowestPage.pageId)` first, then `{ [lowestPage.pageId]: scale }` as scalesArg.

### `__dumpWorld` verification result

- Basement (page-3): origin (0,0) ✓; vertex meter magnitudes ✓; Z@anchor = 0 on lowest floor ✓
- Main Floor (page-4): MISSING effective scale
- Main Floor miss is a **fixture data gap**: Main Floor has no own scale, no confirmed transform, no
  `pageRefParentRef` entry in the restored fixture (alignment never confirmed for that page). Not a seam bug.

### B4 fixture prereq (before B4 multi-floor verification)

Re-run "Confirm scale & alignment" on Main Floor in the test fixture and re-snapshot. Then
`__dumpWorld` will show composition across ≥2 confirmed floors.

### New doc added

`WIREFRAME_RECON_REPORT.md` created — gap tracker for B1–B4 wireframe composition seams
(§3=B1 resolved, §4=B2 resolved, §5/§6 open).

---

## SESSION 28 — B3: wire roof-plan pages into ghost/borrow path

**Branch:** main | **Commit:** d4e99d8

### What was built

**B3 — `getGhostSourcePageId` gate widened for Roof Plan pages (geometry.js)**
- Gate at line ~291 now admits `category === 'roof-plan'` alongside `'floor-plan'`.
  `subLabel` required only for floor pages (known FLOOR_ORDER level); roof's is optional free text,
  so the `!currentPage.subLabel` guard was relaxed for roof.
- Fallback parent scan: `currentFloorIdx = floorOrder.length` for roof (above all floors);
  existing downward scan loop finds the highest floor with locked shapes. Zero new loop logic.
- Scale borrow via `getEffectiveScale` chain is UNCHANGED — roof resolves identically to floors.
  Confirm-alignment writes `pageRefParentRef[roofPageId] = ghostSrc` as usual.
- No roof-specific offset or transform logic. B1 meters-composition + trace-over-aligned-ghost
  identity assumption applies unchanged to roof.

**`__dumpWorld()` extension (App.jsx)**
- New roof-plan block: iterates `pages.filter(p => p.category === 'roof-plan')`, resolves
  `getEffectiveScale`, prints world XY for locked wall polygons.
- Reports `[confirmed]` vs `[NOT confirmed — borrow not active]` so fixture-gap state is legible.

**Verification result:**
- Before confirm: `[world] roof (page-7): MISSING effective scale — confirm alignment to a floor parent first`
- After confirm: `[world] roof (page-7) pxPerMeter=59.08 [confirmed]`
- Roof had no locked polygons in fixture; borrow-chain plumbing proven end-to-end.

### Architecture decisions

- Roof enters the IDENTICAL path as floors — no new machinery per VISION_SUPPLEMENT §9.1.
- Eave projection / roof Z are deferred to B4, which needs a planning pass first
  (§7 recon found NO project-config store for the floor-system/assembly data B4 reads).

### Carry-forward loose ends for next session

1. **RECON-REPORT DIFF:** `WIREFRAME_RECON_REPORT.md` at e7911fd was reconstructed by Claude Code
   from the codebase after the original was lost to context compaction. Diff it against the
   authoritative original for dropped specifics (CLAUDE.md divergences, openingLabel/label field
   name, widthM/heightM-not-stored findings, exact line numbers).
2. **FIXTURE prereq for B4:** Main Floor (page-4) AND roof (page-7) need confirmed scale/alignment;
   roof needs at least one locked polygon; re-snapshot after both confirmed.
   `__dumpWorld` multi-floor verification is blocked until this is done.
3. **Fixture `_version` field:** first `__restoreFixture` this session threw "invalid or missing
   _version". Check that the fixture JSON has the `_version` key; update fixture if missing.
4. **GitHub connector:** check Project settings for a connector to auto-sync these five docs with
   the repo and kill manual re-upload.
5. **`.claude/settings.local.json` decision:** un-ignore (solo tree, no secrets) vs. keep gitignored
   + standing checklist. Decide before next build session.

### New deferred-register entries

- **#48 — Align/scale drag visual inversion:** remap corner-handle drag so the PDF appears to hold
  still and the ghost polygon appears to grow. Actual mechanism (pageTransformsRef) unchanged.
  ⚠️ NOT purely cosmetic — math mapping changes; needs planning pass to confirm #22 compliance
  before build. See ADDITIONAL_FUNCTIONALITY.md.

---

## CURRENT DEFERRED ITEMS

- **Feet+inches carry-over display bug (low priority):** `2' 12.0"` instead of `3' 0.0"`
- **Parallel alignment guide tolerance:** too loose with small snap grids
- **Redundant collinear vertex after complex Combine:** stray short segment, cosmetic
- **Inherited geometry on all pages:** layer management deferred to Phase 2+
- **No persistence:** memory only, lost on reload
- **Working area selection:** dropped from Step 4b scope; zoom makes it redundant; revisit when duplicate page is prioritized
- **CAD-export datum (#6):** named point at computed coordinates for CAD export — not an origin, deferred to post-Phase 1.5
- **Intra-floor Z / split-level (#7):** FLOOR_ORDER does not accommodate mid-flight levels; deferred to Phase 2
- **Layer-visibility model (#8):** multi-floor ghost is the first instance; full discipline-layer system deferred to Phase 2
- **Scale matching from shared notation (#9):** auto-apply calibrated scale if printed notation matches; deferred
- **Full-screen canvas layout (#10):** UI polish, no core functionality; deferred
- **Sidebar auto-hide (#11):** collapse on canvas interaction; candidate for same UI pass as #10
- **Page rotation (#12):** 90° viewer convenience + arbitrary alignment rotation; `angle` reserved in transform struct
- **Ghost vertices as opt-in snap targets (#13):** deferred from sub-step 3; shared grid handles alignment for now
- **Scale inheritance within drawing group (#14):** suppress Set Scale across a group once one page is calibrated; needs drawing-group concept
- **Primary-reference reassignment UI (#15 — partial):** `primaryReferenceIdRef` set-once today; UI to reassign (relabel root; geometry doesn't move) deferred
- **Multi-select reference ghosts by floor label (#16):** per-floor-label visibility picker for reference overlays; bridge between single ghost and #8 full layer system
- **Universal reference-layer model (#17):** architectural record; sub-step 5 adopts data shape; projection math + multi-entity referencing gated on R3 coordinate composition
- **Roof slope/Z-derivation + peaked-eave inference (#18):** ridge-to-perimeter junction topology built (perimParent vertex); elevation consequence needs slope rules + XYZ model
- **Coplanar-distinctness principle (#19):** architectural record — datum vs. element layer; per-element Z deferred to Phase 2
- **Metric dimension-entry rework (#20):** floor-heights panel imperial-only; unified rework deferred to dedicated session
- **Planes/edges as rule-imposing boundaries (#21):** ELEMENT-LAYER architectural record; constrains R3/Phase 2 design
- **Recalibration-independence invariant (#22):** active invariant — geometry must stay scale-independent in storage; Path 3 honors it
- **Isometric multi-reference elevation (#23):** Z-driven projected display of floor-plan references on elevation view; gated on R3/Phase 2 coordinate model
- **Global drag-release robustness (#24):** drags ending outside browser window don't release; fix = window-level mouseup + pointercancel; app-wide polish pass
- **Edge-select button labels (#25):** "Set elevation edge" mode shows "Exit" only after pick; needs "Confirm" / "Choose again" — UI polish
- **Categorization exit navigation bug (#26):** exiting categorize mode on uncategorized page stays there instead of navigating to last categorized page
- **Reference-line snap-suggest to known Ys (#27):** when dragging base line, snap toward known anchor Ys; near-term candidate post-Piece-4
- **PDF visual analysis / analysis-first front end (#28):** MAJOR VISION — automated page analysis + confirm-and-correct overlay; flagged for deep-review waypoint
- **Derived envelope block (#29):** Phase 2 architectural target — elevation surfaces derived from floor-plan polygons, not traced freehand; gated on R3
- **Grade / soil line (#30):** pieces 1+2+3 DONE (3fae81b + c7a2092 + e9c04a6); sub-piece 2 fully complete; finish-anywhere + snap-as-aid model; Redraw button built; #41 is the sole meaning model
- **Grade-line read-time interpretation (#41):** active architectural principle — wall polygon never split; above/below-grade derived on read by intersecting grade polyline with polygon; R3/Phase 2 build
- **Dev fixture Piece 2 (#31):** DONE — Save/Load buttons live in DEV strip (Session 22; confirmed Session 24)
- **UX notes (#32–#40):** categorize shortcut, button colour audit, ghost-vertex snap gap, align-handle cursor mirror, sidebar auto-collapse, edge-select copy, isometric ghost preview, reference-line label stacking, floor-to-floor field auto-grey
- **Trackpad/wheel zoom speed (#42):** too fast on laptop; trackpad deltas need scaling/clamping — input polish
- **Grade-line draw-UI clarity pass (#43):** toolbar text/prompt flow could be clearer — polish after elevation workflow stable
- **Window/door component model (#44):** shared instance identity, edit-all/make-unique, cross-elevation picker; dumb-duplicate (Pieces 1+2) is throwaway — migrates here; no Z/3D on instances; next windows/doors session
- **Window-as-assembly model (#45, MAJOR):** mullions, sub-sections, frame geometry, glass areas; performance coefficients are spreadsheet math; depends on #44
- **Window-schedule import + place-from-list (#46):** recognize schedule table from PDF; cross-ref #28 and #44
- **Top-bar snap selector metric fallback (#47):** shows cm labels on no-scale page (disabled so cosmetic only); bundle with #20
- **Elevation Piece 3 sub-piece 3 (deferred/shelved):** drag-to-edit individual floor/ceiling heights; height editing stays panel-only
- **Dump graph button (debug):** temporary `console.log` button in trace toolbar — remove before production
- **B6 envelope surfaces (#54):** floor/roof/soffit fill meshes + face culling + transparency — deferred
- **3D opening-line visual verification (#55):** place test opening on elevation page, confirm orange rectangle renders — deferred
- **3D axis nub visibility (#56):** AxesHelper(0.5) too small at fixture scale; cosmetic — deferred
- See `ADDITIONAL_FUNCTIONALITY.md` for all deferred items

---

## SESSION 32 — §9 project-configuration layer, Pieces 1–3 (2026-06-25)

**Branch:** main | **Commits:** 4cca140 (Piece 1), eb82eba (Piece 2), a049854 (Piece 3) — all on origin.

### Recon findings (read-only pass, start of session)

- **projectConfigRef (B4)** is definition-only (3 physical-derivation thresholds: `cantileverRule`, `reconcileThresholdM`, `soffitCombineThresholdM`), read only by `deriveEnumeration` and `deriveWireframe`, never written after init, NOT reset on upload. Fork A separation clean — a new config ref does not collide with it at all.
- **No prior project-level settings surface existed.** `dimensionBasisRef` has a one-shot first-use modal but no standalone settings panel. Config panel is net-new UI.
- **Floor-heights panel** is the house pattern: `useState` toggle + gated toolbar button (`{pdf && !calibMode && !drawMode && !editMode && !categorizeMode && ...}`) + absolute-overlay div rendered inline in component return; fields `.map()`ed from a derived array.

### What was built

**Piece 1 (4cca140) — data model + descriptor schema:**
- `CONFIG_FIELDS`: 10-field module-level descriptor array (1 Outputs[multi], 1 Jurisdiction, 4 Assemblies @ 2 opts each, 4 Equipment lite). `spawns: null` hook reserved for §8.2 worklist build — empty, never read.
- `projectSetupRef = useRef({ values: {}, roleAssignments: {} })` — §9 operator config store. Distinct from B4 `projectConfigRef` (physical-derivation thresholds). Reset on PDF upload; `projectConfigRef` is deliberately NOT reset.
- `getConfigValue` / `setConfigValue` — sole read/write seam for `values`. `__dumpProjectSetup` DEV console dump.

**Piece 2 (eb82eba) — operator panel:**
- `showProjectSetup` / `projectSetupTick` useState pair (floor-heights pattern).
- `setConfigValue` extended to bump `projectSetupTick` after every write.
- Toolbar button gated identically to Floor Heights; placed alongside it.
- `ps-panel` overlay: fields `.map()`ed from `CONFIG_FIELDS` grouped by `.category`; category order derived from array order (no hardcoded list). `multi:false` → `<select>`; `multi:true` → checkbox group.
- Browser-verified: selections persist across close/reopen.

**Piece 3 (a049854) — output→roles derivation + role assignment UI:**
- `OUTPUT_ROLES` map: `f280` → [hvac-designer, energy-advisor]; `h2k` → [energy-advisor]; `permit-set` → [designer, hvac-designer, plumber, electrician].
- `ROLE_LABELS`: 5 role id → label entries; insertion order = display order.
- `getRequiredRoles()`: pure computed function — unions `OUTPUT_ROLES` across selected outputs, deduped by `Set`, ordered by `ROLE_LABELS` insertion order. Never stored.
- `roleAssignments: {}` added to `projectSetupRef` alongside `values`; reset on upload.
- `getRoleAssignment` / `setRoleAssignment` accessors; `setRoleAssignment` bumps `projectSetupTick`.
- "Required Roles" section in ps-panel: live-recomputed each render; text input per role; unassigned roles show "(unassigned — owner responsible)" owner-fallback marker.
- Browser-verified: F280 → HVAC Designer + Energy Advisor; F280 + Permit Set → Designer + HVAC Designer + Energy Advisor (deduped) + Plumber + Electrician; typed assignment persists across close/reopen; clear → fallback marker returns.

### Forks settled (planning pass)

- **A** — separate ref from B4 projectConfigRef (clean separation confirmed).
- **B** — coarse output→roles map now; sub-rules added incrementally later.
- **C** — operator panel now (overlay, floor-heights style); full-page form deferred (#57).
- **D** — 2 assembly options per category (starter set, extensible).
- **E** — equipment selections stored inert; `spawns` hook empty, reserved for §8.2.

### Carry-forward lesson (recurred twice this session)

Code reported persistence/recompute as "confirmed statically" twice (Pieces 2, 3) — reasoning
through the render path instead of browser-verifying. Both times the planning layer pushed back and
Ben browser-verified before close-out. The standing rule holds: static reasoning does not discharge
a browser-verifiable claim. Build prompts should keep saying "browser-verify; static reasoning does
not count."

### Logged this session (ADDITIONAL_FUNCTIONALITY.md)

- **#57** — Project Setup as a dedicated full-page form (full-page form deferred; overlay panel is functional stand-in).

### NEXT SESSION OPENS WITH

Config-driven layer/worklist system (§8.2) planning — the `spawns` hook on `CONFIG_FIELDS` descriptors is the attach point; needs the symbol/icon library + item-requirement table (VISION_SUPPLEMENT §8.1 planning artifacts) before or alongside.

---

## SESSION 31 — B5: 3D envelope wireframe (2026-06-25)

**Branch:** main | **Commits:** 7c44e24 (Pieces 1 + 1a), 622e76d (Piece 2)

### Sequencing decision

B5 (3D render) built before windows/doors Pieces 3+4. Critical-path next = project-configuration layer (§9 step 3). Windows/doors Pieces 3+4 are off critical path and remain available.

### What was built

**B5 Piece 1 + 1a (7c44e24):**
- `deriveWireframe()` pure function added BEFORE the `if (import.meta.env.DEV)` block (not inside — needed by production toolbar button). Returns `{ floorRings, roofRing, soffitLines, openingLines }` in world meters. Closes over refs.
- `ThreeDView.jsx`: `THREE.LineSegments` + `BufferGeometry` + `Float32BufferAttribute` + `OrbitControls`; `toVec(x,y,z)` axis-mapping helper (world X→three.js X, world Y→three.js Z, world Z→three.js Y up); `addLineLoop` builds explicit from/to pairs. Full cleanup on unmount.
- Colors: floor #22d3ee, ceiling #f59e0b, walls #94a3b8, roof #a78bfa. Camera framed to bbox. AxesHelper(0.5).
- "3D View" toolbar button: gated on `!!getWorldOriginM()`. Wireframe computed once on click, passed as stable prop.
- **Piece 1a:** AxesHelper(3) → AxesHelper(0.5). Geometry was correct; bug was the helper's 3m Z-arm overshooting the 2.59m Crawlspace footprint.

**DEBUGGING STORY (carry forward as a trust-the-runtime lesson):**
Two instrumentation passes (logging all ring/vertical/roof geometry) BOTH EXONERATED the computed geometry — every logged segment was correct. Root cause was AxesHelper(3) at world origin, whose Z-arm coincided with the Crawlspace edge and overshot by 0.41m. The bug was in a DRAW PATH, not in the computed data. Lesson: when instrumentation proves computed geometry correct but the screen is wrong, the bug lives in something that draws but doesn't compute (helpers, renderer objects, attribute packing). Widen instrumentation to those paths; don't re-check coordinates.

**B5 Piece 2 (622e76d):**
- `soffitLines`: re-derived (independently from `deriveEnumeration`) using `worldBboxOf` helper + 0.05m threshold from projectConfigRef; 3 segs/soffit: outer eave edge + 2 returns at eaveZm. Color: #c084fc (violet).
- `openingLines`: world XY via edge-midpoint + direction vector in world space; Z via `elevYToWorldZ`; `widthM × heightM` rectangle in wall plane. Color: #fb923c (orange).
- Legend bar extended; `__dumpWireframe` DEV function extended (soffits by side, openings by id).

### Verification

- Piece 1: stray line gone; floor rings, ceiling rings, verticals, roof ring with overhang, notch — all correct.
- Piece 2: 2 soffits (N+W, 0.3048m) verified visually. 0 openings — correct for fixture. Opening path dump/code-verified; **VISUAL verification DEFERRED** (#55) until a test opening is placed.

### Architecture reminders

- `deriveWireframe` is component-scope, NOT DEV-gated. `__dumpWireframe` is DEV-gated. Split is intentional.
- `deriveEnumeration` is DEV-only and is NOT called by `deriveWireframe`. Soffit/opening geometry re-derived independently.
- `pageRefOffsetRef` does NOT exist. All cross-page composition in meters.

### New deferred-register entries

- **#54 — B6 envelope surfaces:** floor/roof/soffit fill with face culling + transparency. Deferred.
- **#55 — 3D opening-line visual verification:** confirm orange rectangles once a test opening is placed.
- **#56 — 3D axis nub visibility:** AxesHelper(0.5) too small at fixture scale; cosmetic polish.

---

## Session 29 — Fixture-PDF bundling + default fixture rebuild (2026-06-25)

### DONE this session

**(a) Fixture-PDF bundling (commit c5deb8d):**
- `__snapshotFixture` is now `async`. After collecting all geometry fields (unchanged), calls
  `pdf.getData()` → raw `Uint8Array` bytes → base64-encode via `btoa` → stored as
  `documents: [{ pdfBase64, fileName }]` (document-keyed array; one entry today).
- `__restoreFixture` checks `obj.documents?.length > 0` first: if present, decodes base64 →
  `Uint8Array` → `pdfjsLib.getDocument({ data: bytes.buffer })` and proceeds as before.
  Does NOT run the `handleFileChange` clear path — refs are written directly, geometry intact.
  Backward-compatible fallback: if `documents` absent (old fixtures), fetches from
  `/devFixtures/test-fixture.pdf` as before.
- SAVE button `onClick` made `async` to `await __snapshotFixture()`. LOAD button unchanged.
- `handleFileChange` normal upload-clears-refs behavior unchanged.

**(b) Default fixture rebuilt from scratch (commit c5deb8d):**
- New `public/devFixtures/fixture-elevation.json` is self-contained — no machine path dependency.
- Page map: page-3 Crawlspace (calibrated, origin), page-5 Main Floor (borrow chain from page-3,
  pxPerMeter=114.83 confirmed), page-7 roof plan (locked polygon with 1ft overhang on two edges,
  confirmed borrow from Main Floor), page-2 elevation (own scale confirmed, live Z, Z@anchor=0.0000).
- NOTE: fixture page map differs from the old page-4=Main Floor reference. The fixture is now its
  own thing keyed to its specific PDF. Do not assume page numbers match any prior session's fixture.
- Verified via `__dumpWorld` round-trip from committed default: Crawlspace + Main Floor compose
  correctly in world XY; Session 27 "Main Floor MISSING scale" is resolved (borrow chain wired).

### Observation to confirm next session
On scale recalibrate, confirm stored vertex pixels do NOT move (only `pxPerMeter` changes) —
recalibration-independence #22 spot-check. Not confirmed this session.

### NEXT SESSION OPENS WITH
B4 config-store planning pass. Three unsettled forks:
1. How much config to stand up now vs. defer (assembly data, wall types, U-values)?
2. Where it lives: new `projectConfigRef` vs. extending `floorHeightsRef`?
3. Output form: console output / panel display / both?

B4 derivation core is NOT promptable until these are settled. The "what the docs already force"
analysis is in this session's planning chat — re-derive from VISION_SUPPLEMENT §3, §6.3, §6.4,
§6.9, §7.3, §5.3 if not carried forward to the next session.

### Logged this session (ADDITIONAL_FUNCTIONALITY.md)
- **#49** — Project-owned PDF persistence (web/multi-machine): principle set; base case built for dev fixture.
- **#50** — Multiple PDFs per project: documents[] array structure already accommodates it.
- **#51** — Elevation reference-edge auto-seat: auto-seat base line on confirm when reference edge set; manual drag fallback remains.

---

## SESSION 30 — B4 derivation core; gitignore fix; #22 recalibration-independence confirmed (2026-06-25)

**Branch:** main | **Commits:** f24fd7e (gitignore fix), 106d847 (B4 code)

### What was built

**`.claude/settings.local.json` gitignore friction resolved permanently (f24fd7e):**
The file was blocked by a global git ignore rule (`**/.claude/settings.local.json` at
`C:\Users\ben\.config\git\ignore` line 1). Rather than modifying the global rule, added a
project-level negation `!.claude/settings.local.json` in `.gitignore`. File is now tracked
in-repo; the standing checklist "recreate-on-clone" step 3 is RETIRED.

**#22 recalibration-independence confirmed (read-only, no source edits):**
Used `await window.__snapshotFixture()` before and after recalibrating a page.
Scale changed (114.834 → 114.961 pxPerMeter); all page-3 vertices were byte-identical.
Invariant holds: geometry is stored in pixels, recalibration only updates `pxPerMeter`.
Note: `__snapshotFixture` is ASYNC — must use `await`, not sync call (returns empty object `{}`
without await; took two debugging passes to discover).

**B4 derivation core — `deriveEnumeration()` + `window.__dumpEnumeration()` (106d847):**
Console-dump-only enumeration of all envelope surfaces. No render, no panel.

**`projectConfigRef`** — new `useRef({})` for project-level physical derivation config only.
NOT the §9 project-configuration layer (no roles/jurisdiction/U-values/assemblies). Three forks settled:
(a) minimal physical-only extensible slice; (b) new `projectConfigRef`, NOT an extension of
`floorHeightsRef`; (c) console dump only for now. Fields:
- `cantileverRule: 'closest-approach'`
- `reconcileThresholdM: 0.05`
- `soffitCombineThresholdM: 0.05`

**`deriveEnumeration()` — six internal steps:**
- Gets world origin via `getWorldOriginM()`.
- Builds local `zStack` from `accumulateZ(floorHeightsRef.current, presentLevels, FLOOR_ORDER)`.
- Helper `getWorldBbox(pageId)` for soffit derivation (min/max world X/Y of all wall-polygon vertices).
- Builds `floorPageMap` (first categorized page per FLOOR_ORDER level with locked shapes).
- **STEP A+B (wall surfaces):** Per floor in zStack, per locked wall-polygon edge: projects vA/vB via
  `pageVertexToWorld`, computes `widthM`, `orientationDeg` (compass bearing via `atan2(dx, -dy)`).
  Pre-projects floor-below polygon vertices to world meters (`belowWorldShapes`).
  Closest-approach reconcile: `distToSegment(mid, wv[bi], wv[(bi+1)%n])` over all below edges → `minDist`;
  `pointInPolygon(mid, wv)` for sign; classify against `reconcileThresholdM`.
  Pushes `{ id, kind:'wall-surface', ..., reconcile, signedDistM }`.
- **STEP C (soffits):** Per confirmed roof page: compares `getWorldBbox(roofPageId)` vs
  `getWorldBbox(wallPage.pageId)` per side (N/S/E/W); projection > `soffitCombineThresholdM` →
  soffit element with `projectionM`, `spanM`, `eaveZm`.
- **STEP D (fenestration):** Per elevation page with confirmed scale + elevation edge: finds openings
  (`isOpening(s)`), calls `elevYToWorldZ(centroidY, ep.pageId)`, pushes window/door elements with `worldZm`.

**`window.__dumpEnumeration()`:** verbose per-element dump with all fields; reconcile summary at bottom.
Wall-surface lines include `signedDist=+/-X.XXXXm (inside/outside floor-below)`.

**Reconcile rule history (important carry-forward):**
Built bbox-compare first → REJECTED at runtime. A notch in the floor polygon doesn't change the
bounding box; edge midpoints get tested against an unchanged bbox and produce
plausible-but-meaningless coincident tags. Replaced with closest-approach (`distToSegment` +
`pointInPolygon`). Lesson: identical labels can come from two rules; only the signed-distance dump
revealed which was real.

**Verified against fixture (4 sub-checks):**
(a) 12 elements total: 4 Crawlspace wall-surfaces + 6 Main Floor wall-surfaces + 2 soffits.
(b) Main Floor notch: seg3 = -0.305m (setback), seg4 = -0.381m (setback); 4 remaining edges coincident.
(c) Soffits on north/west: projectionM = 0.3048m (1ft overhang, as built in fixture).
(d) No fenestration elements (no openings placed on elevation in fixture).

### Known boundary characteristic (logged, not a bug)

Ray-casting `pointInPolygon` returns "outside" for midpoints EXACTLY on the perimeter (distance = 0).
This is harmless because distance ≤ reconcileThresholdM → tagged coincident before sign matters.
Only relevant if the sign at exactly zero distance becomes meaningful — not required today.

### New deferred-register entries

- **#52 — B4 render/panel:** `deriveEnumeration()` is console-only; a rendered envelope summary
  panel or 3D wireframe render is B5. Deferred.
- **#53 — B4 cantilever/setback UI annotation:** hover a wall edge → show reconcile tag + signed
  distance inline. Deferred until panel/render work is active.

---

## FORWARD BUILD SEQUENCE

1. ~~Zoom/pan~~ — DONE
2. ~~Compass rose alignment~~ — DONE
3. ~~Step 4a: pageId migration~~ — DONE
4. ~~Step 4b: Page categorization UI~~ — DONE
5. ~~Step 4c: Sidebar + navigation~~ — DONE
6. ~~Ground floor tracing~~ — DONE
7. ~~Multi-floor reference & alignment~~ — DONE
   - ~~Sub-step 1: ghost rendering~~ — DONE (996b5a7)
   - ~~Sub-step 2: ghost alignment + per-page transform~~ — DONE (73f02f1, c2ed3ba, 122b077, 6e97f67, b210343, d5425d0)
   - ~~Sub-step 3: confirm-scale lock~~ — DONE (d49060d, e4cf8b6, 327e84d, d030a34)
   - ~~Sub-step 4: cross-page persistence/toggle~~ — DONE (c7a45e0, d42296e, 196b0fa)
   - ~~Sub-step 5: directional decoupling / primary-reference model~~ — DONE (9ef06b1, b8dd9ce, 6f7f629)
8. ~~Roof plan tracing~~ — DONE (a5c1b48, 8288a1d)
9. ~~Pixels→real-world coordinate foundation (R2)~~ — DONE (Path 3; 040e371, 71e01ca)
10. **Elevation calibration + tracing (IN PROGRESS)**
    - ~~Piece 1: floorHeightsRef + accumulateZ + getFloorLevel~~ — DONE (2942e0e)
    - ~~Piece 2: Floor-heights entry panel~~ — DONE (e780b88)
    - ~~Piece 3: Floor-to-floor back-solve entry + ceilingSource + validateCeiling~~ — DONE (4e06de0)
    - ~~Elevation spatial Piece 1: "Set elevation edge" mode~~ — DONE (89b7ba2)
    - ~~Elevation spatial Piece 2: "Align elevation" mode — own-scale confirm~~ — DONE (2007265)
    - ~~Elevation spatial Piece 3 sub-piece 1: drawElevRefLines (view mode)~~ — DONE (1cb2c0b)
    - ~~Elevation spatial Piece 3 sub-piece 2: elevBaseYRef + drag-to-place base line~~ — DONE (b597e91)
    - ~~Elevation spatial Piece 4 sub-piece 1: closed-polygon tracing + edit; drawElevRefLines wired into all redraw paths~~ — DONE (5266dc5)
    - Elevation spatial Piece 3 sub-piece 3: drag-to-edit heights — DEFERRED (shelved)
    - ~~Elevation spatial Piece 4 sub-piece 2: grade / soil line (pieces 1+2+3)~~ — DONE (3fae81b, c7a2092, e9c04a6)
    - ~~Elevation spatial Piece 4 sub-piece 3: windows/doors Pieces 1+2 (placement layer)~~ — DONE (Session 26)
    - **Elevation spatial Piece 4: windows/doors Piece 3 (three-layer snap) — NEXT**
    - **Elevation spatial Piece 4: windows/doors Piece 4 (dumb duplicate) — NEXT**
11. **Wireframe composition seams B1+B2 — DONE (Session 27; commit 9e5bd0d)**
    - ~~B1: pageVertexToWorld + getWorldOriginM (world XY in meters)~~ — DONE
    - ~~B2: elevYToWorldZ (world Z in meters)~~ — DONE
    - ~~B3: widen getGhostSourcePageId for Roof Plan pages~~ — DONE (d4e99d8)
    - ~~B4 fixture prereq~~ — DONE (Session 29; c5deb8d): PDF bundled, Crawlspace+Main Floor+roof+elevation
    - ~~B4: derivation core~~ — **DONE (Session 30; commit 106d847)**
      deriveEnumeration() + __dumpEnumeration; projectConfigRef; closest-approach reconcile;
      soffit/eave combine; fenestration Z path. Verified against fixture (12 elements).
    - ~~B5: 3D envelope wireframe~~ — **DONE (Session 31; commits 7c44e24, 622e76d)**
      deriveWireframe() + ThreeDView.jsx; floor/ceiling rings, verticals, roof ring, soffits, openings (lines only).
      Piece 1a: AxesHelper overshoot fix. Opening visual deferred (#55).

**Next: windows/doors Pieces 3+4 remain available (off critical path); next critical-path build = project-configuration layer (VISION_SUPPLEMENT §9 step 3).**

After project-config → windows/doors cleanup → cross-sections (deferred) → Phase 2 threshold.
