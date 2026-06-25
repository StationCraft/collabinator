# Collabinator — Wireframe Export Recon Report

*Tracks progress toward a 3D wireframe export: what coordinate composition gaps exist,
which have been resolved, and what remains. Updated at close-out of each relevant session.*

---

## §1 — Purpose

Phase 2 requires a 3D wireframe: vertices in building-fixed world XYZ coordinates, edges,
faces, and Z from the elevation stack. This document tracks the composition gaps between
"stored canvas pixels" and "world meters" so they get closed systematically.

---

## §2 — Gaps inventory

| # | Gap | Status |
|---|-----|--------|
| 1 | XY composition: canvas-pixel vertices → building-fixed world XY in meters | **RESOLVED — B1 (9e5bd0d)** |
| 2 | Scale seam: named conversion helpers (`pxToMeters` / `metersToPx`) | RESOLVED — R2/Path 3 (040e371, 71e01ca) |
| 3 | Vertex factory: R3-ready shape via `makeVertex` | RESOLVED — R2 (71e01ca) |
| 4 | Z composition: elevation canvas Y → world Z in meters | **RESOLVED — B2 (9e5bd0d)** |
| 5 | B3: roof pages enter ghost/borrow path (same mechanic, settled arch.) | **OPEN — NEXT** |
| 6 | B4: multi-floor stacking verification across ≥2 confirmed floors | **OPEN — needs fixture prereq** |

---

## §3 — B1: XY composition (RESOLVED — commit 9e5bd0d, Session 27)

### Root cause (closed)

The first attempt used `pageRefOffsetRef` storing `{dxPx:0, dyPx:0}` canvas-pixel offsets
and `getWorldOriginPx()` in canvas pixels. This assumed a shared canvas coordinate space.

**Diagnostic (Session 27) proved this is wrong.** `drawGhostShapes` in canvasRenderer.js
draws stored vertices with NO coordinate transform (raw pixel coordinates from the stored
shape, no offset applied). Each PDF page navigates → `renderPage` resizes `measureRef` to
that sheet's dimensions (`scale = containerWidth / viewport.width`). Stored vertex
coordinates are raw canvas pixels at that sheet's scale — NOT comparable across pages
unless all sheets happen to be the same size. `{0,0}` offset was silently correct only
for same-size sheets, wrong for mixed-size PDFs.

### Resolution

Compose in **METERS** via each page's own `getEffectiveScale` + `pxToMeters`. Sheet-size
dependency dissolves because 1 meter is always `pxPerMeter` pixels regardless of sheet
size. `pageRefOffsetRef` was tried and **REMOVED entirely** — do not reintroduce a
canvas-pixel offset approach.

**Identity assumption:** cross-page X/Y alignment is treated as identity because the
user traces geometry on top of the aligned ghost, baking registration into the traced
coordinates at trace time. No stored per-page offset is needed. This assumption holds
while the trace-over-ghost workflow is the sole entry path. A comment in `pageVertexToWorld`
marks exactly where an explicit offset would re-enter if the workflow changes.

### Seams added (App.jsx)

- **`getWorldOriginM()`** — building-fixed XY origin in meters, re-derived every call
  (never stored). Uses `getEffectiveScale(lowestPage.pageId)` (borrow-safe), converts
  all anchor-floor vertices to meters via `pxToMeters({ [pageId]: scale }, pageId)`,
  returns `{ x: minX, y: minY, originPageId }`. Returns null if no calibrated anchor floor.

- **`pageVertexToWorld(v, pageId)`** — projects a canvas-pixel vertex into building-fixed
  world XY in meters. Returns `{ x, y, z: null }` (z absent pending R3). Uses
  `getEffectiveScale` for scale resolution; subtracts `getWorldOriginM()` bbox origin.
  Both `getWorldOriginM` and `pageVertexToWorld` use identical `getEffectiveScale`-first
  patterns — no raw `pageScalesRef.current` reads.

### Scale-path fix (Session 27)

First meters implementation passed raw `pageScalesRef.current` to `pxToMeters` for the
anchor-floor vertices. Bug: if the anchor floor borrows its scale (no own calibration),
`pageScalesRef.current[lowestPage.pageId]` is undefined → `pxToMeters` returns null →
NaN origin → all vertices poisoned. Fix: resolve via `getEffectiveScale(lowestPage.pageId)`
first, then pass `{ [lowestPage.pageId]: scale }` as the scalesArg.

---

## §4 — B2: Z composition (RESOLVED — commit 9e5bd0d, Session 27)

**`elevYToWorldZ(y, elevPageId)`** — named inverse of `drawElevRefLines` Y→Z formula.
Accepts a canvas Y on an elevation page, returns world Z in meters. Formula:

```
anchorY = elevBaseYRef[elevPageId] ?? edge-midpoint Y
lowestFloorZ = fhZStack[0].floorZ ?? 0   // feet
zFeet = lowestFloorZ + (anchorY - y) / (0.3048 × pxPerMeter)
return zFeet × 0.3048                    // meters
```

Returns null if: no own `pxPerMeter` for elevPageId, no resolved elevation edge,
or `fhZStack` is empty. Both `drawElevRefLines` (draw) and `elevYToWorldZ` (export)
implement the same Y↔Z formula — principle 7.3 (one function per derived quantity).

---

## §5 — DEV verification tool (`__dumpWorld`)

`window.__dumpWorld()` — DEV-guarded console test added to App.jsx. Prints:
- World origin (page + meter XY)
- World XY for all wall-polygon vertices on all floor-plan pages
- Z@anchor for all confirmed elevation pages
- MISSING scale warnings per page

**Session 27 verification result:**
- Origin at Basement (page-3): ✓ (0,0)
- Basement vertices: ✓ sane meter magnitudes
- Z@anchor on elevation page: ✓ = 0 (lowest floor Z)
- Main Floor (page-4): MISSING effective scale

The Main Floor miss is a **fixture data gap**, not a seam bug. `__snapshotFixture()`
confirmed: Main Floor has no own scale, no confirmed transform, and no `pageRefParentRef`
entry — alignment was never confirmed for that page in the saved fixture. The seam
itself is correct; the fixture needs to be re-snapshotted with Main Floor alignment
confirmed before B4 multi-floor stacking can be verified.

---

## §6 — Open gaps

### B3 — Roof pages enter ghost/borrow path (NEXT)

`getGhostSourcePageId` currently only returns floor-plan pages. Roof Plan pages should
be able to ghost/borrow from the floor plan below them using the same mechanic. The
architecture is settled; this is a gate-condition change in `getGhostSourcePageId`.

### B4 — Multi-floor stacking verification

**Fixture prereq first:** re-run "Confirm scale & alignment" on Main Floor in the test
fixture and re-snapshot so `__dumpWorld` can verify world XY composition across ≥2
confirmed floors. Then verify B1 chain is correct for a 2+ floor stack.

---

## §7 — What does NOT exist (carry-forward architecture rules)

- `pageRefOffsetRef` does NOT exist. It was tried (canvas-pixel offset) and removed. Do not reintroduce.
- No raw `pageScalesRef.current` reads in composition code — always use `getEffectiveScale`.
- Cross-page XY composition is in METERS (not canvas pixels). Sheet-size dependency is eliminated.
- `pageVertexToWorld` returns `{x, y, z: null}` — z stays null until R3 adds it via `makeVertex`.
