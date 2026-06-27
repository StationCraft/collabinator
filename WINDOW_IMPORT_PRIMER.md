# Window-Schedule Import — Exploration Primer (spun off Session 40)
Dedicated planning chat for ADDITIONAL_FUNCTIONALITY #46 (supersedes #85). NOT a build session —
exploration + first-slice scoping. Two-layer workflow: that chat plans/produces prompts, Code executes.

## What this feature is
Import a window/door schedule and place units directly onto elevations from a list — click an entry,
drop a PRE-SIZED opening (position from click; size/type/label/performance pre-filled) instead of
drawing each. UI home: a new "Additional" placement category beside the worklist to-place items,
mirroring that UX. Rides the Session-26 openings model (shapeKind 'window'|'door', OPENING_TYPES,
dimensionBasisRef, confirmOpening, drawOpeningPoly).

## Two-stage shape (the key framing)
1. RECOGNITION/INGESTION — PDF window package -> structured rows. The HARD, manufacturer-variable
   part = #28 (PDF visual recognition), possibly OCR. Window package PDFs vary: clean tables,
   graphical schedules with callouts, scans.
2. PLACEMENT — structured rows -> "Additional" queue -> pre-sized one-click drop on elevation.
   The EASY part; rides existing openings model.
The placement half can be built against a STRUCTURED input (schedule spreadsheet / WEW payload)
BEFORE recognition exists. THAT IS THE FIRST SLICE — decouples easy from hard.

## Forks to settle in that chat
- Controlled-vocabulary fork: supplier system/type names will NOT match the fixed OPENING_TYPES
  five. Import must MAP supplier types onto the five OR TEACH new types. Unsettled.
- Performance attributes (Uw, SHGC, U-value, R-value, glass Ug/g) are tracked attributes feeding
  the F280/H2K energy model. They live in the #45 window-as-assembly attribute set — computed
  downstream as spreadsheet columns, NOT in-app calc. Where they attach on a placed opening = open.
- One-click-drop-presized is a DIFFERENT placement interaction than the current draw-rectangle-
  then-size. Existing openings get geometry from user clicks + size as metadata; a "scaled item"
  has size known BEFORE placement, click sets only position. Confirm this is the intended UX.
- Quantity: package says e.g. 4x W1 -> four placeable instances or one placed four times.

## Reference material in Project
- WEW_Integration_Interface_Reference.docx — interface spec for a live WEW window system:
  API contract (/api/quote, QuoteSubmission payload: Client/Project/Windows/EntranceDoors/
  PatioDoors), controlled vocabularies (window/door/patio systems, glass options w/ Ug/g,
  hardware), verified schedule column map (A-Q inputs; R+ formula-driven, do NOT write),
  INTAKE cell map, performance outputs (computed Uw/SHGC/R/RO + H2K rollup = cleanest read
  surface). AUTHORITATIVE over the older System Integration Summary where they disagree.
- WEW_Scheduling_Tool.xlsx — the live scheduling workbook.
- Multiple window-package PDFs — examples for the recognition problem (manufacturer-variable).

## Dependencies (register)
#28 (PDF recognition — the ingestion stage), #44 (component model — an imported entry ~ a
component definition; import likely populates the library), #45 (window-as-assembly +
performance attributes), #83 (spreadsheet interop, app<->sheet). Full feature needs #28/#44/#45;
the first-slice placement build needs only a stable structured-input contract + the openings model.

## How Ben works (read before producing anything)
- Ben does NOT read code and reads every word — keep responses short, lead with the decision/question.
- Ben does NOT hand-edit docs — Code owns all doc writes/commits. Planning chat produces Code prompts.
- Consequential forks (anything Ben sees/interacts with, genuine two-answer forks): stop and ask, one
  at a time, plain end-result language. Mechanical choices: decide and report in one line.
- Ben tends to introduce scope mid-stream — flag scope drift proactively, offer to log in
  ADDITIONAL_FUNCTIONALITY rather than work it in.
- Recon before build. Browser verification before every commit. Build prompts self-contained,
  single copy block.

## First move in that chat
Recon the reference material (WEW docx + xlsx + the package PDFs) read-only against the openings
model, to pin down the placeable-entry attribute set and the structured-input contract for the
first slice. Do NOT scope a build before that recon.
