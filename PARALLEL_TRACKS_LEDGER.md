# Collabinator — Parallel Tracks Ledger

*Single shared record between the MAIN path (this repo) and the TOOLS / ASSEMBLY-BUILDER
track (repo: `C:\dev\assemblylibrary`).*

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

**Deferred / logged:**
- #96 — wall corner reconciliation (solid interpenetration + inside-face area overcount; overcount accepted for initial F280 pass)

**Next (Track A):**
- Thermal-field ingest slice: wire `effectiveUValue` / `effectiveRSI` / `airFilms` from the
  now-frozen contract into `ingestAssembly` and `getSurfaceAssembly`
- F280 endpoint: consume `insideFaceAreaM2` + thermal fields → heat-loss calculation

---

## TRACK B — TOOLS / ASSEMBLY BUILDER

**Repo:** `C:\dev\assemblylibrary`

**Owns:**
- The standalone assembly-library tool and any further standalone tools spun from that track
- `ASSEMBLY_CONTRACT.md` as **sole author** — Track A only reads it, never writes it

**Done:**

| Part | Description | Status |
|------|-------------|--------|
| Part 1 | Materials catalogue | SHIPPED |
| Part 2 | Layer + framing builder | SHIPPED |
| Part 3 | U-value engine + thermal fields + framing `materialId` | SHIPPED — contract thermal fields frozen |

**In progress:**
- Window ingestion from spreadsheet (new standalone tool) — Track B builds this standalone;
  no main-repo edits result from it now. Future integration into Collabinator window import
  is gated (#46) and is a FUTURE concern.

**Next (Track B):**
- Continue window ingestion tool (standalone)

---

## THE CONTRACT — `ASSEMBLY_CONTRACT.md`

**Authored in:** `C:\dev\assemblylibrary` (Track B is the sole writer)
**Consumed by:** `C:\dev\collabinator` (Track A reads only)

### Current frozen shape (as of Part 3 ship)

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

**Thermal fields — FROZEN as of Part 3; NOT YET ingested by Track A (next main build):**
```
effectiveUValue     number | null
effectiveRSI        number | null
airFilms            object | null
controlLayers       array | null
framing:
  materialId        string | null
  (additional framing fields per Part 3 contract)
```

If Track B changes the contract shape, Track B's planning chat must relay the diff here
**before** Track A wires against it.

---

## CONFLICT-AVOIDANCE RULES

1. **Separate repos.** The two tracks write to separate repos. No file in one repo is
   edited by the other track's session.

2. **`ASSEMBLY_CONTRACT.md` has one author: Track B.** Track A reads it only. If Track B
   changes it, Track B's planning chat must relay the change to this ledger before Track A
   wires against the new shape.

3. **This ledger has one writer: Track A's code session.** Track B reports status in prose;
   the planning chat relays it here.

4. **Window ingestion tool (Track B) is standalone for now.** It may later feed Collabinator
   window import (#46). That integration is FUTURE and gated — Track B builds the tool
   without touching the main repo.

5. **Contract changes require relay before ingest.** Track A's `ingestAssembly` silently
   ignores unknown fields (forward-compatible), but structural changes (field renames, type
   changes, schema restructuring) must be communicated via the planning relay before Track A
   updates its ingest seam.

---

*Last updated: 2026-06-28 (Session 47 — ledger created)*
