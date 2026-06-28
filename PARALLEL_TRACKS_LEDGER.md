# Collabinator — Parallel Tracks Ledger

*Single shared record between the MAIN path (this repo) and the TOOLS track (multiple
standalone repos — see Track B section).*

---

## WRITER RULE (enforced, not optional)

**This ledger has exactly ONE writer: the MAIN-path code session (Claude Code in
`C:\dev\collabinator`).**

The TOOLS-track session NEVER edits this file. It reports status in prose to its own planning
chat; that chat relays the update here. This prevents two code sessions from editing the same
file concurrently and eliminates merge conflicts between the two repos.

---

## TRACK A — MAIN PATH

**Repo:** `C:\dev\collabinator`

**Owns:**
- Everything in the Collabinator app: geometry, `deriveEnumeration` / `deriveWireframe`,
  surfaces, thickness render, `insideFaceAreaM2`, the `getSurfaceAssembly` seam
- Assembly INGEST in Collabinator: `assemblyLibraryRef` + `ingestAssembly`
- The upcoming F280 endpoint and all downstream consumers of thermal data

**Done (assembly/thermal track):**

| Slice | Description | Commit | Date |
|-------|-------------|--------|------|
| Slice 1 | Per-surface assembly assignment — data layer; two-tier manual/library resolver; `surfaceAssemblyRef`; `getSurfaceAssembly`; harness checks (j)+(k) | `6d849f1` | 2026-06-28 |
| Slice 2 | Contract ingest — geometry-scoped fields (`assemblyId`, `label`, `assemblyType`, `totalThicknessM`, `layers[]`); `ingestAssembly`; `__ingestAssembly` DEV hook; silently ignores thermal fields (forward-compat) | `6dab52d` | 2026-06-28 |
| Slice 3 | 3D wall-panel render (`totalThicknessM` → solid panels in ThreeDView; assemblyType-driven growth direction); `insideFaceAreaM2` derived in STEP A; TDZ fix | `8f1dd30` | 2026-06-28 |
| Slice 4 | Thermal-field ingest: `effectiveUValue`, `effectiveRSI`, `controlLayers` stored in `assemblyLibraryRef`; `getSurfaceAssembly` returns all three; `deriveEnumeration` STEP A pushes them onto wall-surface elements; null preservation verified; harness 17/17 → 24/24 PASS | (this session) | 2026-06-28 |

**Deferred / logged:**
- #96 — wall corner reconciliation (solid interpenetration + inside-face area overcount; overcount accepted for initial F280 pass)
- #99 — opening U-value source for F280 (per-opening property / project default / opening assembly record — Ben's call; F280 build gated on this decision)

**Next (Track A):**
- F280 endpoint: consume `insideFaceAreaM2` + `effectiveUValue` → heat-loss calculation.
  Gated on #99 (opening U-value fork).

---

## TRACK B — TOOLS

Track B is **not a single repo** — it is a collection of standalone tool repos, each closed
with its own verified contract. Future side-quests spin up new repos under the same pattern.

### Repo: `C:\dev\assemblylibrary` — Assembly Library

**Authors:** `ASSEMBLY_CONTRACT.md` (sole author; Track A reads only)
**Status:** CLOSED

| Part | Description | Status |
|------|-------------|--------|
| Part 1 | Materials catalogue | SHIPPED |
| Part 2 | Layer + framing builder | SHIPPED |
| Part 3 | U-value engine + thermal fields + framing `materialId` | SHIPPED — contract thermal fields frozen |

---

### Repo: `C:\dev\wewbridge` — WEW Scheduling-Tool Bridge

**Authors:** `WEW_BRIDGE_CONTRACT.md` (sole author; Track A reads only, not yet consuming)
**Status:** CLOSED + verified

| Part | Description | Commit | Status |
|------|-------------|--------|--------|
| Reader | Format adapter: WEW schedule → structured window/door entries | `0b760b5` | SHIPPED |
| Contract | `WEW_BRIDGE_CONTRACT.md` — integration surface for #46 window-placement | `a222567` | FROZEN |

The WEW Bridge output (structured window/door entries) is the integration surface the
window-placement track (#46 easy half) will consume. That integration is **FUTURE and gated**
— no main-repo edits result from it now.

---

### Active Build

**No active build.** Tools chat is parked until the next side-quest starts.

---

## THE CONTRACTS

Track A reads both contracts. Track A writes neither.

---

### Contract 1 — `ASSEMBLY_CONTRACT.md`

**Authored in:** `C:\dev\assemblylibrary` (sole author)
**Consumed by:** `C:\dev\collabinator` (Track A reads only)
**State:** FROZEN as of Part 3 ship

**Geometry fields — INGESTED by Track A (Slice 2):**
```
assemblyId          string
label               string | null
assemblyType        string | null   ('wall' | 'roof' | 'floor' | 'foundation')
totalThicknessM     number | null
layers[]:
  layerId           string | null
  materialId        string | null
  thicknessM        number | null
  pathRole          string | null   ('continuous' | 'framed')
```

**Thermal fields — FROZEN as of Part 3; INGESTED by Track A (Slice 4):**
```
effectiveUValue     number | null   ← INGESTED (Slice 4)
effectiveRSI        number | null   ← INGESTED (Slice 4)
controlLayers       object | null   ← INGESTED (Slice 4; null values preserved exactly)
  water             layerId | null
  air               layerId | null
  thermal           layerId | null
  vapour            layerId | null
```

**Silently ignored (tool-side, not consumed by Track A):**
```
airFilms            object | null   — baked into effectiveRSI/effectiveUValue; not ingested
framing             object | null   — tool-side framing rule set; not a Collabinator concern
```

---

### Contract 2 — `WEW_BRIDGE_CONTRACT.md`

**Authored in:** `C:\dev\wewbridge` (sole author; commit `a222567`)
**Consumed by:** `C:\dev\collabinator` — NOT YET (gated to #46 window-placement work; future)
**State:** FROZEN

Track A does not currently read or ingest WEW Bridge output. When #46 wire-in is scoped,
Track A will read `WEW_BRIDGE_CONTRACT.md` from the wewbridge repo and wire against it.

---

**If any Track B repo changes a contract shape**, that repo's planning chat must relay the diff
to this ledger **before** Track A wires against the new shape.

---

## CONFLICT-AVOIDANCE RULES

1. **Each side-quest tool lives in its own repo.** Track B currently has `assemblylibrary`
   and `wewbridge`; future tools get new repos. No file in one repo is edited by another
   track's session.

2. **One author per contract, per repo.**
   - `ASSEMBLY_CONTRACT.md` is authored only in `assemblylibrary`.
   - `WEW_BRIDGE_CONTRACT.md` is authored only in `wewbridge`.
   - Track A (main) reads both contracts and writes neither.

3. **This ledger has one writer: Track A's main code session.** Track B sessions never write
   it. They report status in prose to their planning chat; the planning chat relays corrections
   here.

4. **Contract changes require relay before ingest.** If any Track B repo changes a contract
   shape (field renames, type changes, schema restructuring), that repo's planning chat must
   relay the diff to this ledger before Track A wires against the new shape. Track A's
   `ingestAssembly` silently ignores unknown fields (forward-compatible), but structural
   changes are not silent and must be coordinated.

5. **Tool integrations with the main repo are FUTURE and gated.** Track B builds tools
   standalone; no main-repo edits result from tools-track work until an explicit integration
   is scoped (e.g. #46 for WEW Bridge output). The gate is always a deliberate main-track
   decision, not a side effect of a tools-track build.

---

*Last updated: 2026-06-28 (Session 49 — Track A Slice 4: thermal-field ingest DONE; opening U-value fork #99 logged; F280 gated)*
