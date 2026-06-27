# ASSEMBLIES_RECON_REPORT.md

Read-only recon for the "assemblies onto surfaces" track.
Source read: App.jsx (6764 lines), geometry.js (363), canvasRenderer.js (351), ThreeDView.jsx (289).
No code was modified.

---

## §1 — What does `deriveEnumeration()` capture TODAY, surface by surface?

`deriveEnumeration()` is defined at **App.jsx:4641**. It returns a flat `elements[]` array
and walks four distinct steps.

### STEP A — Wall surfaces (lines 4678–4770)

For every floor-level in `zStack`, for every locked wall polygon on that floor's page,
for every polygon edge (vertex pair `[si]→[si+1]`), one element is pushed at **line 4753**:

```js
elements.push({
  id: `wall-${shape.id}-seg${si}-${row.level.replace(/\s/g, '_')}`,
  kind: 'wall-surface',
  floorLevel: row.level,
  pageId: floorPage.pageId,
  worldA: { x: wA.x, y: wA.y, z: floorZm },
  worldB: { x: wB.x, y: wB.y, z: floorZm },
  widthM,          // edge length in metres (Pythagorean)
  heightM,         // floor-to-ceiling in metres (null if not entered)
  orientationDeg,  // compass bearing of edge direction, 0–360
  floorZm,         // bottom Z of wall in metres
  ceilingZm,       // top Z of wall in metres (null if not entered)
  reconcile,       // 'coincident' | 'setback' | 'cantilever' | null (base floor)
  signedDistM,     // signed perpendicular distance to nearest floor-below edge
})
```

No `grossAreaM2`, `netAreaM2`, or `assemblyId` field exists on this object.

### STEP B — Reconcile metadata (lines 4690–4751)

Not a separate `kind`. Reconcile fields (`reconcile`, `signedDistM`) are computed inline
during STEP A and appended to each `wall-surface` element. No separate element kind is pushed.

### STEP C — Soffit / eave elements (lines 4772–4812)

For each confirmed roof-plan page, the roof bbox is compared to the highest-floor wall bbox.
For each of the four cardinal sides where `projection > soffitCombineThresholdM` (default 0.05m),
one element is pushed at **line 4800**:

```js
elements.push({
  id: `soffit-${rp.pageId}-${side}`,
  kind: 'soffit',
  floorLevel: highestLevel,
  pageId: rp.pageId,
  side,           // 'north' | 'south' | 'east' | 'west'
  projectionM,    // overhang depth in metres
  spanM,          // length along the eave in metres
  eaveZm,         // Z of eave (ceiling of highest floor), metres
})
```

This is a bbox-difference approximation — NOT edge-by-edge. One element per cardinal side,
never per actual roof-polygon edge.

### STEP D — Fenestration (lines 4814–4838)

For every locked opening (`window` or `door`) on every confirmed Elevation page, one element
is pushed at **line 4825**:

```js
elements.push({
  id: `${op.shapeKind}-${op.id}-${ep.pageId}`,
  kind: op.shapeKind,   // 'window' | 'door'
  floorLevel: null,
  pageId: ep.pageId,
  label: op.label ?? null,
  openingType: op.openingType ?? null,
  widthM: op.widthM ?? null,
  heightM: op.heightM ?? null,
  dimBasis: op.dimBasis ?? null,
  worldZm,          // Z centroid derived via elevYToWorldZ()
})
```

### Surface kinds NOT emitted by `deriveEnumeration()`

| Missing surface kind | Geometry to derive it exists? |
|---|---|
| **Floor-over-unheated space** (exposed underside of lowest floor) | **No.** There is no basement-slab or crawlspace-floor polygon. `floorZm` exists for every level but no area polygon is traced for the floor plane itself. |
| **Ceiling / roof-plane as area surface** (not just soffit) | **No.** The roof polygon exists in `completedShapesRef` as a `shapeKind`-absent wall polygon on the roof-plan page, but STEP C derives only four bbox-side soffits from it — not a planar ceiling surface area element. No `kind: 'roof-surface'` is emitted. |
| **Party walls** | **No.** Nothing in the categorisation or polygon model records whether an edge is shared with an adjacent unit. No data exists to derive this. |
| **Rim / band joist areas** | **No.** The `floorSystemAbove` thickness is captured in `floorHeightsRef`, but no polygon outlines the rim-joist band. This area would need to be derived from wall-polygon perimeter × floor-system thickness — neither the perimeter summation nor the multiplication is performed. |
| **Exposed floor-slab / slab-on-grade** | **No.** No geometry or derivation path exists. |
| **Ceiling (interior) as distinct surface from floor above** | Deferred per ADDITIONAL_FUNCTIONALITY.md §4 (Session 4). Geometry exists implicitly (top of wall polygon = bottom of floor system), but no surface element is emitted. |

---

## §2 — How is the project-config assembly list structured today?

### The four assembly entries in `CONFIG_FIELDS` (lines 97–140)

```js
{
  id: 'assembly-wall',
  category: 'Assemblies',
  label: 'Exterior wall assembly',
  options: [
    { value: '2x6-r22',      label: '2×6 wood frame, R22 batt, drywall + sheathing' },
    { value: '2x6-r22-ext2', label: '2×6 wood frame, R22 batt + 2″ exterior insulation' },
  ],
  multi: false,
  spawns: null,
},
{
  id: 'assembly-foundation',
  category: 'Assemblies',
  label: 'Foundation assembly',
  options: [
    { value: '8in-concrete-frost', label: '8″ concrete + interior frost wall' },
    { value: 'icf',               label: 'ICF (insulated concrete form)' },
  ],
  multi: false,
  spawns: null,
},
{
  id: 'assembly-roof',
  category: 'Assemblies',
  label: 'Roof / attic assembly',
  options: [
    { value: 'vented-attic-r50',       label: 'Vented attic, R50 blown-in insulation' },
    { value: 'unvented-cathedral-r40', label: 'Unvented cathedral, R40 continuous' },
  ],
  multi: false,
  spawns: null,
},
{
  id: 'assembly-floor',
  category: 'Assemblies',
  label: 'Floor system',
  options: [
    { value: 'eng-i-joist',    label: 'Engineered I-joist' },
    { value: 'open-web-truss', label: 'Open-web floor truss' },
  ],
  multi: false,
  spawns: null,
},
```

### What an assembly option currently holds

Each option object is exactly `{ value: string, label: string }`. Confirmed: no `thicknessM`,
no `layers[]`, no `uValue`, no `rValue`, no `controlLayerPosition` — just the two strings.
The `value` strings are opaque ids (e.g. `'2x6-r22-ext2'`). Their physical meaning lives only
in the `label` human string; nothing machine-readable encodes thickness or thermal performance.

### Where assembly values are read today

`getConfigValue('assembly-wall')` etc. are **never called anywhere in the codebase**. Confirmed
via grep: the only lines referencing `'assembly-wall'`, `'assembly-foundation'`, `'assembly-roof'`,
and `'assembly-floor'` are the `CONFIG_FIELDS` array definition itself (lines 98, 109, 120, 131).

The assembly values are written by the Project Setup panel UI (`setConfigValue`) and stored in
`projectSetupRef.current.values`, but **no consumer reads them back**. They do not feed into
`deriveEnumeration()`, `deriveWireframe()`, `deriveWorklist()`, or any render path. They are
live UI state with zero downstream consumers today.

---

## §3 — Where would an assembly-assignment field attach to a surface/wall element?

### Do walls exist as their own entity?

**No.** A "wall surface" does not exist as a stored entity with its own identity. There is no
`wallSurfaces` ref, no `wallSurfaceRef`, no stored `{ id, shapeId, segIdx, assemblyId }` object.

Walls are **edge-derived only**: `deriveEnumeration()` STEP A walks `completedShapesRef` at
call time, iterates polygon vertices, and emits a transient `wall-surface` element per edge.
The elements array is local to the function call. Nothing is stored, nothing persists.

### Most stable identity a wall surface has today

The wall-surface `id` field (line 4754) is:

```js
id: `wall-${shape.id}-seg${si}-${row.level.replace(/\s/g, '_')}`
```

where:
- `shape.id` = stable `'sh-N'` string (written at polygon creation, stored on the shape in
  `completedShapesRef`, persists for the life of the upload session)
- `si` = integer segment index within that polygon's `vertices[]` array
- `row.level` = FLOOR_ORDER string

This id is **deterministic and reproducible** across re-derivations as long as the polygon
vertex array order is unchanged. It is NOT guaranteed stable across vertex insertions, deletions,
or splits — any of those operations re-index `si`, silently reassigning ids to different edges.

The `(shape.id, segmentIndex)` pair is the same identity mechanism already used for `frontFace`
(which stores `shapeIndex + segmentIndex` plus staleness-check coordinate snapshots). That pattern
is the existing precedent for per-edge identity.

### Candidate attach points for per-surface assembly assignment

| Candidate | Storage | Stability | Notes |
|---|---|---|---|
| **Add `assemblyId` to the transient `wall-surface` element** in `deriveEnumeration()` | Recomputed — evaporates on next call | Recomputed fresh | Not a persistent attach point. Panel could show it, but no place to write back. |
| **Store a `surfaceAssemblyRef` map keyed by wall-surface `id`** (e.g. `surfaceAssemblyRef.current['wall-sh-3-seg1-Main_Floor'] = 'assembly-wall'`) | Ref — persists within session | Fragile: breaks silently on vertex insert/delete/split | Same fragility as `frontFace.segmentIndex`. Survivable with stale-check coordinates (same pattern). |
| **Attach `assemblyId` directly to the polygon shape in `completedShapesRef`** (per-shape, not per-edge) | Shape — persists | Stable (keyed by `shape.id`) | Coarser than per-edge — one assembly per polygon, not per segment. Valid for the "all exterior walls same assembly" case. |
| **Add per-segment assembly to the polygon shape as `segmentAssemblies: { [si]: assemblyId }`** | Shape — persists | Same fragility as above (`si` shifts on vertex edit) | Per-edge granularity; same stale-check approach needed as `frontFace`. |

Summary: **no persist-capable attach point exists today** — the transient enumeration object is
the only thing carrying wall-surface identity. Adding persistence requires either a new ref keyed
by the string id (fragile to vertex reindex but usable with stale-check snapshots), or a
per-shape field in `completedShapesRef` (coarser but stable).

---

## §4 — What net-area derivation exists?

**Gross wall area and net area do not exist anywhere in the codebase.**

Confirmed by grep across all four source files: no `grossArea`, `netArea`, `wallArea`,
`surfaceArea`, or `areaM2` symbol appears in App.jsx, geometry.js, canvasRenderer.js, or
ThreeDView.jsx.

Each `wall-surface` element carries `widthM` (edge length) and `heightM` (floor-to-ceiling),
from which gross area could be computed as `widthM × heightM`. That multiplication is never
performed — neither inside `deriveEnumeration()` nor in any panel or render path.

The `soffit` element carries `projectionM × spanM`, from which soffit area could be computed.
That multiplication is also never performed.

Window and door elements carry `widthM × heightM`. Never multiplied.

**Net area** (gross wall minus openings on that wall face) is not computed. The association
between a window/door element and the wall-surface element it penetrates does not exist: windows
and doors are enumerated from Elevation pages by `op.id` and elevation-page `pageId`; wall
surfaces are enumerated from Floor Plan pages by `shape.id` and `segIdx`. No join key connects
a fenestration element to the wall-surface it sits in. The bearing-angle on `wall-surface`
(`orientationDeg`) could be matched to elevation orientation (`subLabel`), but that
correspondence is not performed or stored anywhere.

**Area is not a named queryable property through any function (§7.3 not satisfied for area).**
There is no `getWallArea()`, `getNetArea()`, or equivalent. Area math would currently have to
be done inline at the call site.

---

## §5 — Any existing seam for total-thickness / control-layer position?

### `projectConfigRef` (lines 464–472)

```js
const projectConfigRef = useRef({
  cantileverRule: 'closest-approach',
  reconcileThresholdM: 0.05,
  soffitCombineThresholdM: 0.05,
})
```

No thickness, no layer-stack, no control-layer-position field. This ref holds B4
physical-derivation thresholds only.

### `CONFIG_FIELDS` assembly options

As established in §2: `{ value, label }` only. No thickness data.

### Enumeration element objects

No `thicknessM`, `controlLayerPosition`, `rValue`, or `uValue` field on any emitted element.

### `SEGMENT_PROFILES` / `POINT_PROFILES` (lines 250–260)

These hold HVAC-run sweep profiles (diameterM, widthM, heightM for duct extrusion) and equipment
block dimensions. No wall-assembly thickness data.

### `floorHeightsRef`

```js
floorHeightsRef.current[floorLevel] = {
  floorToCeiling: number | null,
  floorSystemAbove: number | null,
  ceilingSource: 'direct' | 'solved'
}
```

`floorSystemAbove` is the closest thing to a structural-depth field in the codebase — it records
the total floor-system thickness above a given level in feet. However:
- It is keyed by floor LEVEL (e.g. `'Main Floor'`), not by surface or assembly.
- It represents the structural-floor thickness (joist + sheathing), not wall assembly thickness.
- It is used only for Z-stack height accumulation in `accumulateZ()`.
- It has no `controlLayerPosition` subdivision.

**Conclusion:** No seam for wall assembly total-thickness or control-layer position exists anywhere
in the codebase. The cleanest candidate attach point, without a tear-out, would be extending the
`CONFIG_FIELDS` option objects from `{ value, label }` to `{ value, label, thicknessM, controlLayerM }`
— this would be a pure addition at the data-declaration site (line 98 et seq.) and all CONFIG_FIELDS
consumers iterate `.options` without destructuring beyond `value` and `label`, so the extra fields
would be ignored until a consumer reads them. Alternatively, a parallel `ASSEMBLY_SPECS` map from
`value → { thicknessM, controlLayerM }` could be added at module level — separate from CONFIG_FIELDS,
consumed only by derivation paths that need physical data.

---

## Closing — first-slice candidate list

- **Add `grossAreaM2` to `wall-surface` elements** — compute `widthM × heightM` inside
  `deriveEnumeration()` STEP A where both values are already in scope; zero new data dependencies.

- **Extend CONFIG_FIELDS assembly options with `thicknessM` + `controlLayerM`** — data-only
  addition to the module-level constant; no consumer change; establishes the physical-data seam.

- **Store a `surfaceAssemblyRef` map** keyed by wall-surface `id` (with stale-check endpoint
  snapshots following the `frontFace` pattern) — the minimal persist layer for per-surface
  assignment without introducing a new stored entity.

- **Add `assemblyId` as a read-through field on `wall-surface` elements** in `deriveEnumeration()`
  STEP A — reads from a `surfaceAssemblyRef` (or falls back to the project-level `assembly-wall`
  config value), making the assignment visible in the Envelope panel and `__dumpEnumeration()`
  with no UI required yet.
