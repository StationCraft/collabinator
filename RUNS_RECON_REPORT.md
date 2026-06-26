# RUNS_RECON_REPORT — Session 34

Read-only recon for §8.2 step 4 (Runs as 3D paths).  
Files read: `src/App.jsx`, `src/canvasRenderer.js`, `src/geometry.js`  
Date: 2026-06-25

---

## §1 — ITEM_TYPES run-obligation structure

**Full ITEM_TYPES table** (`App.jsx` lines 202–240):

```js
const ITEM_TYPES = [
  {
    type: 'air-handler',
    label: 'Air Handler',
    obligations: [
      { id: 'lineset-endpoint', label: 'Lineset endpoint',            kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'condensate-drain', label: 'Condensate drain (plumber)',  kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'power',            label: 'Power (electrician)',         kind: 'run',      blocked: true,  note: 'requires coordination' },
    ],
  },
  {
    type: 'outdoor-unit',
    label: 'Outdoor Unit',
    obligations: [
      { id: 'lineset-to-handler', label: 'Lineset to air handler',   kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'power',              label: 'Power (electrician)',       kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'mount-type',         label: 'Mount type',               kind: 'property', blocked: false,
        options: [{ value: 'ground', label: 'Ground' }, { value: 'wall', label: 'Wall' }] },
    ],
  },
  {
    type: 'bath-fan',
    label: 'Bath Fan',
    obligations: [
      { id: 'power',            label: 'Power (electrician)',         kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'vent-to-exterior', label: 'Vent to exterior (envelope)', kind: 'run',      blocked: true,  note: 'requires coordination' },
    ],
  },
  {
    type: 'hrv-unit',
    label: 'HRV/ERV Unit',
    obligations: [
      { id: 'supply-exhaust-duct', label: 'Supply/exhaust ducting',      kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'exterior-vent',       label: 'Exterior vents ×2 (envelope)', kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'power',               label: 'Power (electrician)',          kind: 'run',      blocked: true,  note: 'requires coordination' },
      { id: 'condensate-drain',    label: 'Condensate drain (plumber)',   kind: 'run',      blocked: true,  note: 'requires coordination' },
    ],
  },
]
```

**Counterpart encoding:** Every run-kind obligation object has exactly these fields: `{ id, label, kind, blocked, note }`. There is NO `counterpart`, `targetType`, `pairsWith`, or any other structured reference to another item type. The `outdoor-unit`'s `lineset-to-handler` encodes its mate in the human-readable `label` string only ("Lineset to air handler") — not in any machine-readable field. The `air-handler`'s symmetric obligation is `lineset-endpoint` — a bare label with no mention of outdoor-unit in any field.

**Obligation ID formation:** Each `id` is a static string literal defined in the table (e.g. `'lineset-endpoint'`, `'power'`, `'vent-to-exterior'`). It is NOT namespaced per instance. `deriveWorklist` uses `ob.id` verbatim as the key into `placed.obligationState[ob.id]`. Two different placed instances of the same item type (e.g. two `bath-fan` items) would each carry the same obligation ids in their respective `obligationState` maps — the ids are stable per obligation within a type, not per item-instance.

**VERDICT LINE: Run obligations DO NOT already encode their counterpart item-type.** The `label` string contains human-readable hints but no machine-readable pair→category mapping exists in the current data. Endpoint-pair → run-category cannot be derived from existing obligation data alone.

---

## §2 — deriveWorklist + obligationState satisfaction

**`deriveWorklist()` assembly** (`App.jsx` lines 3579–3618):

```js
const deriveWorklist = () => {
  // Index already-placed equipment items by instanceKey (first placed wins)
  const placedByKey = {}
  for (const s of completedShapesRef.current) {
    if (isEquipmentItem(s) && s.status === 'locked' && !placedByKey[s.instanceKey]) {
      placedByKey[s.instanceKey] = s
    }
  }
  const toPlace = []
  const obligations = []
  for (const field of CONFIG_FIELDS) {
    if (!field.spawns) continue
    const val = getConfigValue(field.id)
    const spawnList = field.spawns(val)
    for (const { type, count } of spawnList) {
      const itemDef = ITEM_TYPES.find(it => it.type === type)
      const label = itemDef?.label ?? type
      for (let i = 1; i <= count; i++) {
        const instanceKey = `${type}#${i}`
        const placed = placedByKey[instanceKey]
        if (placed) {
          if (itemDef) {
            for (const ob of itemDef.obligations) {
              obligations.push({
                placedId: placed.id,
                instanceKey,
                itemLabel: label,
                ...ob,
                satisfiedValue: (placed.obligationState || {})[ob.id] ?? null,
              })
            }
          }
        } else {
          toPlace.push({ type, label, instanceKey })
        }
      }
    }
  }
  return { toPlace, obligations }
}
```

**PROPERTY obligation read site** (line 3607 inside `deriveWorklist`):
```js
satisfiedValue: (placed.obligationState || {})[ob.id] ?? null,
```
The `satisfiedValue` is read from the shape's `obligationState` map keyed by the static obligation `id` string.

**PROPERTY obligation write site** (`App.jsx` lines 5803–5810, inside the worklist panel `<select>` onChange):
```js
completedShapesRef.current = completedShapesRef.current.map(s =>
  s.id === g.placedId
    ? { ...s, obligationState: { ...(s.obligationState || {}), [ob.id]: val } }
    : s
)
setWorklistTick(t => t + 1)
```
The entire `completedShapesRef.current` array is replaced with a mapped copy; the matching shape gets a spread-updated `obligationState`. `worklistTick` is bumped to force re-render.

**DERIVED vs stored:** Satisfaction is STORED-AND-MUTATED on the shape object in `completedShapesRef` (the write above). `deriveWorklist` is a pure function that RECOMPUTES `satisfiedValue` on every call by reading from the shape's current `obligationState` map — no separate satisfaction state exists. A run-satisfaction check would follow the identical pattern: write to `obligationState[ob.id]` on the placed shape, bump `worklistTick`, read back via `deriveWorklist()`.

---

## §3 — Shape model + persistence for partial/uncharacterized shapes

**`shapeKind:'equipment-item'` stored object** (`App.jsx` lines 1766–1775):
```js
{
  id: nextShapeId(),
  shapeKind: 'equipment-item',
  itemType: placingItemType,
  instanceKey: placingInstanceKey,
  pageId: currentPageId,
  status: 'locked',
  vertices: [makeVertex(snapped.x, snapped.y)],
  obligationState: {},
}
```
Single vertex. Placed and locked atomically on one click. No intermediate state in `completedShapesRef`.

**`shapeKind:'grade-line'` stored object** (`App.jsx` lines 2504–2513):
```js
{
  id: nextShapeId(),
  vertices: [...verts],
  pageId: currentPageId,
  status: 'locked',
  shapeKind: 'grade-line',
}
```
Open polyline. Written once at commit (≥2 vertices). No roofType, parapetWidth, lineRoles, obligationState, or any extra fields.

**Precedent for persisted incomplete/uncharacterized shapes:** NONE. Every shape type is written to `completedShapesRef.current` only when fully committed:
- Wall polygons: written in `confirmShape` (after review state, never during trace)
- Grade lines: written in `commitGradeLine` (after ≥2 vertices and Finish button)
- Equipment items: written on single placement click (locked immediately)
- Openings: written in `confirmOpening` (after dialog)
- Roof shapes: written in `confirmRoofShape` (after type picker)

The opening dialog has a `openingDraftShape` transient React state that holds the rect between clicks and dialog confirm — but that is `useState`, not in `completedShapesRef`. The roof type-picker uses `roofShapeDraft` similarly. Neither is a persisted incomplete shape.

**A run sitting drawn-but-not-yet-connected has no model precedent.** All incomplete draw state (vertices in progress, draft rects, rubber-band positions) lives in `drawVerticesRef` (a ref, not `completedShapesRef`) plus a handful of `useState` flags. There is no path by which an unfinished polyline enters `completedShapesRef`.

---

## §4 — Open-polyline draw stack (grade-line precedent)

**Entry points for grade-line draw mode:**

1. After polygon confirm on an Elevation page (if user answered Yes to "Trace grade line?"):
   - `confirmShape` (line 2474–2490): `const pendingGrade = gradeLinePending` → clears review state → then at line 2487: `if (pendingGrade) { setGradeLineDrawing(true) }`
2. "Redraw grade line" toolbar button (line 4821): directly calls `setDrawMode(true); setGradeLineDrawing(true)` after clearing prior grade-line shapes and resetting draw refs.

In both cases, the underlying draw machinery is `drawMode=true` + `gradeLineDrawing=true`.

**`commitGradeLine`** (`App.jsx` lines 2501–2518):
```js
const commitGradeLine = () => {
  const verts = drawVerticesRef.current
  if (verts.length < 2) return          // gate: min 2 vertices
  completedShapesRef.current = [
    ...completedShapesRef.current,
    {
      id: nextShapeId(),
      vertices: [...verts],
      pageId: currentPageId,
      status: 'locked',
      shapeKind: 'grade-line',
    },
  ]
  drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
  setGradeLineDrawing(false)
  gradeEndSnapRef.current = null; gradeFloorLineSnapRef.current = null
  redrawDrawCanvas(null, [], snapAngle, snapDist, currentPageId)
}
```
Triggered by Enter key (line 3215) or "Finish grade line" button (line 4991, disabled when `drawVertexCount < 2`). Finish-anywhere: no endpoint-binding gate; shape may terminate at any canvas position.

**Snap-as-aid behavior (position only, nothing recorded):**

- `gradeEndSnapRef.current` — corner snap. Populated in `handleMeasureMouseMove` (see line 2261–2275 area) by scanning `getWallVerticesWithId(pageId)` within proximity. When active, the vertex is placed exactly on the corner but NO binding metadata is stored.
- `gradeFloorLineSnapRef.current` — floor-line snap. Populated by `getLowestFloorLineY()`. Snaps vertex Y to the lowest floor reference line; nothing recorded. Corner snap takes priority.
- Both refs render a red dot in `redrawDrawCanvas` (lines 2372–2385) but write nothing to the committed shape.

**Close-snap suppressed:** The standard `nearClose` check (line 2401) is wrapped in `!gradeLineDrawing && vertices.length >= 3` — explicitly suppressed during grade-line tracing. No closure ring shown.

**State resets on page navigation / PDF upload / exit:**
- `gradeLineDrawing`, `gradeLinePending`, `showGradeLinePrompt` → all `false`
- `gradeEndSnapRef.current`, `gradeFloorLineSnapRef.current` → `null`
- `drawVerticesRef.current` → `[]`
- `drawVertexCount` → `0`
- `mousePosRef.current` → `null`

---

## §5 — Placed-item read + snap-to-items

**Equipment item hit-test** (`App.jsx` lines 1233–1241, function `hitTestShapeBody`):
```js
const EQUIP_HIT_RADIUS = 14
// Equipment items: proximity to single vertex (checked first, top-to-bottom in z-order)
for (let i = shapes.length - 1; i >= 0; i--) {
  if (!isEquipmentItem(shapes[i])) continue
  if (shapes[i].pageId !== currentPageId) continue
  const v = shapes[i].vertices[0]
  if (v && Math.hypot(pos.x - v.x, pos.y - v.y) <= EQUIP_HIT_RADIUS) return i
}
```
`EQUIP_HIT_RADIUS = 14` (canvas pixels, NOT zoom-compensated — the hitbox shrinks in world space as zoom increases). Returns the global index into `completedShapesRef.current`.

**pageVertexToWorld as the only pixel→world seam** (`App.jsx` lines 884–893):
```js
const pageVertexToWorld = (v, pageId) => {
  const scale = getEffectiveScale(pageId)
  if (!scale) return null
  const origin = getWorldOriginM()
  if (!origin) return null
  const mx = pxToMeters(v.x, { [pageId]: scale }, pageId)
  const my = pxToMeters(v.y, { [pageId]: scale }, pageId)
  if (mx == null || my == null) return null
  return { x: mx - origin.x, y: my - origin.y, z: null }
}
```
`pageVertexToWorld` is the only seam. Applied to an equipment item's `vertices[0]`, it returns `{ x, y, z: null }`. **Z is null — no Z is derivable for an equipment item today.** Confirmed: `z: null` is hardcoded in the return; `elevYToWorldZ` exists but applies only to elevation pages. The worklist dump (line 4524) confirms: `const world = v ? pageVertexToWorld(v, s.pageId) : null`.

**Existing snap-to-placed-items affordance:** NONE. The draw-mode snap system (`computeFinalSnapPos` / `applySnap` / `getAlignmentSnap`) targets polygon vertices, page-grid intersections, and axis-alignment guides. It does not scan equipment item center points. `gradeEndSnapRef` scans `getWallVerticesWithId` (polygon corners only). `hitTestShapeBody`'s 14px proximity check exists for edit/delete/move hit-testing only — it is not called from any draw-mode mousemove handler. Snap-to-items would be new wiring built on top of `hitTestShapeBody` (or a parallel scan of equipment items in the draw mousemove path).

---

## §6 — Render-path inventory (wiring tax)

All 14 `drawEquipmentItemShapes` call sites, by function and line. A new `shapeKind:'run'` would wire into each identically.

| # | Function / context | Line | Grade-line wired? | Equipment-item wired? |
|---|---|---|---|---|
| 1 | `drawEditCanvas` — **move** sub-mode | 983 | ✓ (976) | ✓ |
| 2 | `drawEditCanvas` — **combine** sub-mode | 1020 | ✓ (1019) | ✓ |
| 3 | `drawEditCanvas` — **delete** sub-mode | 1045 | ✓ (1044) | ✓ |
| 4 | `drawEditCanvas` — **split** sub-mode | 1101 | ✓ (1100) | ✓ |
| 5 | `drawEditCanvas` — **default** sub-mode | 1176 | ✓ (1175) | ✓ |
| 6 | Inline rubber-band: opening corner-1 placed, mousemove | 2243 | ✓ (2242) | ✓ |
| 7 | `redrawDrawCanvas` | 2363 | ✓ (2362) | ✓ |
| 8 | `redrawReviewCanvas` | 2452 | ✓ (2451) | ✓ |
| 9 | Inline: `confirmShape` post-confirm repaint | 2484 | ✓ (2483) | ✓ |
| 10 | Inline: roof-type-picker cancel / discard repaint | 2624 | ✓ (2623) | ✓ |
| 11 | `drawRoofTraceCanvas` | 2804 | ✓ (2803) | ✓ |
| 12 | `drawRoofRoleCanvas` | 2849 | ✓ (2848) | ✓ |
| 13 | `redrawFrontFaceLayer` | 3076 | ✓ (3075) | ✓ |
| 14 | Inline: "Redraw grade line" button repaint before re-entering draw | 4818 | ✓ (4817) | ✓ |

**Total: 14 render call sites.** Grade-line and equipment-item are both wired into all 14. Session 33's count of 14 is confirmed.

Named render functions (6): `drawEditCanvas` (covers 5 sub-modes internally), `redrawDrawCanvas`, `redrawReviewCanvas`, `drawRoofTraceCanvas`, `drawRoofRoleCanvas`, `redrawFrontFaceLayer`.  
Inline repaint sites (4): opening rubber-band mousemove (#6), confirmShape (#9), roof-type-picker discard (#10), redraw-grade-line button (#14).

Note: `drawEditCanvas` skip-guards for grade-line and equipment-item (`if (shape.shapeKind === 'grade-line') return` / `if (isEquipmentItem(shape)) return`) appear in all 5 sub-modes BEFORE the `forEach` loop that draws polygons/openings. Both calls that follow (`drawGradeLineShapes` / `drawEquipmentItemShapes`) are appended AFTER the loop at the bottom of each sub-mode block. A run drawer would follow the same pattern.
