# Collabinator — Vision Supplement & Architectural Decisions
*A delta document. Sits beside `Collabinator_FullVision_v2_1.docx` (kept as reference) and the five
live build docs. Where this document and the v2.1 vision doc disagree on forward direction, THIS
document governs. Captures the architectural conversation that reframed the build toward the 3D
envelope wireframe and the systems built on it.*

**Created:** Session 27 (planning). **Status:** living — appended as decisions are made.
**Source of authority:** v2.1 vision = original intent & reference; five build docs = implementation
truth; THIS doc = current architectural direction and the reasoning behind it.

---

## 0. Why this document exists

After 26 build sessions the build had drifted into deepening the 2D elevation-annotation layer
(window/door component model, snap polish, dumb duplicate). A vision re-alignment established that
those items are **off the critical path** to what the project is actually for. This document records
the realignment: the target, the data-model decisions, the buy-in map, the governing principles, and
the two named subsystems (the Dependency Propagation Model and the 3D Reconstruction Profile) that
together describe the functional heart of the platform.

It is deliberately written to be **rebuild-grade for forward direction**: a future clean rebuild
can take this document + the v2.1 vision as the design brief.

---

## 1. The target, restated

The milestone driving the current build is the **3D coordinate-grid wireframe of the building
envelope** — floor polygons lifted to their Z elevations, connected vertically into wall planes,
capped by a roof plane, with **soffit / eave projections** derived off the roof perimeter. No
rendered surfaces.

Per the v2.1 vision this is "Stage B": *sufficient to perform envelope penetration detection, drain
slope checks, and full volumetric calculations.* Everything the owner actually wants — envelope
assemblies, mechanical overlays, penetration/conflict lists, compliance outputs — **consumes** this
wireframe and cannot exist before it.

**Stage labels are arbitrary; the dependency order is real.** "Stage B" vs. "the start of the next
stage" is bookkeeping. What is real: **planes before paths** (a path cannot be tested for crossing a
plane that does not yet exist). The reframe (Section 9) is a dependency chain, not a stage definition.

---

## 2. The what / who / value lens (project + section level)

The lens is applied at the level of the **project** and each **project section**, not per feature.
It is the reasoning layer used to resolve design forks: when two answers are defensible, choose the
one that serves the value below.

- **Project.** *What:* a coordinate-accurate digital model of a residential building, built from
  PDFs, that every trade layers their design intent onto. *Who (primary operator):* a member of the
  **builder's team** — the coordinator who benefits most from cross-trade tracking. Single trades
  (mechanical, plumbing, electrical, window supplier) are also operators of their own items.
  *Value:* one shared physical-truth model that replaces reconciling conflicting PDFs.
- **Envelope geometry (the wireframe).** *What:* coordinate-accurate points/lines/planes of the
  shell in 3D. *Who:* every downstream consumer; it is the substrate. *Value:* single source of
  physical truth. **Forks resolve toward accuracy, scale-independence, and not baking in any one
  discipline's assumptions.**
- **Assemblies.** *What:* each plane assigned a layered build-up with thickness and penetration
  rules. *Who:* envelope consultant, trades. *Value:* turns a zero-thickness wireframe into real
  walls with depth and rules. **Forks resolve toward: planes carry identity that can later hold an
  assembly even when null now.**
- **Discipline layers / mechanical.** *What:* trade items as 3D paths overlaid on the model. *Who:*
  the coordinator, trades, builder. *Value:* coordination + automatic conflict / penetration
  detection. **Forks resolve toward: the wireframe must expose its planes as things a 3D path can be
  tested against.**

**Through-line:** the wireframe's job is to be the **accurate, assembly-ready, conflict-testable
substrate.**

---

## 3. Users & roles — ownership/delegation model (supersedes v2.1's fixed role table)

- The **project owner** has full control and builds the project as they see fit.
- The owner **assigns others to roles** (delegation, not a preset cast).
- The **project information page** shows all roles with assignment status. **Unassigned roles fall
  back to the owner's responsibility** — accountability is never dropped.
- **Required roles are derived from the chosen output level.** Roles are not universal; they are
  demanded by the outputs the project produces (e.g. an F280-only project omits plumber/electrician).
  This is the standards-agnostic logic (Section 7) applied to roles: outputs determine which roles
  are required, the same way outputs determine which compliance interpreters run.
- The **On-Demand Qualified Designer** is simply one more assignable role, relevant when the
  project's outputs or owner call for it — not a fixed fixture.

*Implication:* a **project-configuration layer** is implied that does not exist in the current build
(single-project, in-memory). It accumulates responsibilities across this document: **output targets,
required roles + assignments, assembly set, jurisdiction, and equipment/system selections.** It is
clearly one real subsystem, upstream of nearly everything in later phases.

---

## 4. The buy-in map (sequencing driver #2)

The build is sequenced by **two axes**, not one: (1) technical dependency, and (2) **buy-in value** —
delivering a felt pain-relief to a specific stakeholder as early as possible, because buy-in drives
adoption. The golden items score high on **both**.

**The one pain shared by everyone — conflict mitigation.** The cascade: plumber drops a drain line →
HVAC conflict → new bulkhead → framer callback → budget increase → unhappy designer → unhappy client
→ headache for all. The shared win is catching the conflict **in the model before it is built**.
This is the platform's center of gravity. The v2.1 "envelope penetration detection" is one instance
of the general thing: **inter-trade spatial conflict detection.**

**Builder-specific pains:**
- **Quote normalization** — bids come back at wildly different planning levels; the builder defines
  the plan themselves so quotes are against a fixed spec. (Procurement/control win.)
- **Variable tracking + comms reduction** — everything in one place; fewer calls and emails.

**Per-stakeholder early wins (buy-in targets):**
- **Energy advisor** — a packet that feeds **all H2K fields**.
- **Electrician** — a schematic of everything to wire; eases uncertainty and takeoffs.
- **HVAC** — a full ventilation plan + F280 with equipment-sizing parameters, as an *output of the
  input*, before they touch anything.
- **Plumber** — builder sign-off on drain-stack routing; can specify to the framer ahead of time.
- **Framer** — plans showing backing, walls thickened for runs, and sequencing instructions to cut
  callbacks.

**Buy-in framing principle:** *each trade receives upstream decisions already made, as model outputs,
rather than being asked to make them.* The felt relief is "the decisions arrive pre-made and
spatially coordinated," not "a place to draw."

**Structural finding:** nearly every buy-in win is an **output**, and nearly every output reads from
the same two things — the **envelope wireframe** and **assemblies with thickness/positioning** (and,
for conflict, **3D paths tested against them**). The wireframe is the common denominator under every
buy-in win. This validates wireframe-first sequencing.

---

## 5. Governing architectural principles (the spine)

Four principles recurred throughout and govern the architecture. **They are one meta-principle with
four faces.** Apply them to resolve "how do we store/build this?" forks.

### 5.1 — The meta-principle: store the minimal authoritative source, derive the rich form through a named seam
Never store the rich/derived form; store the smallest authoritative input and compute the rest
through a single named function. This appeared four times:
1. **Pixels → meters.** Geometry stored in pixels; meters projected at read-time via
   `pxToMeters`/`metersToPx`. (Already built — Path 3 / R2.)
2. **Intact geometry → read-time meaning.** Store geometry intact; derive zoning/classification by
   intersection at read-time. **Never fragment geometry to encode meaning.** (Grade line #41 → grade
   contact → assembly zones, Section 6.)
3. **3D extent → 2D projection.** Store true 3D extent per element; the 2D plan view is a *solved
   projection*, never stored. (Section 6.5.)
4. **Spine + profile → 3D solid.** Store a minimal centerline/point + a type profile; reconstruct the
   3D solid on demand. (The 3D Reconstruction Profile, Section 8.)

### 5.2 — Deliberate structured input is authoritative; the drawing confirms
When a value can come from either a deliberate structured entry or from reading a scaled drawing, the
**structured entry wins**; the drawing is the confirmation/correction surface. Resolves every "where
does this number come from?" question. (Origin: Z comes from the floor-heights panel, not from where
a line lands on an elevation.)

### 5.3 — Bias toward customizability over constraint (the extensibility guardrail)
Every first-build simplification must be the **base case of an extensible model, never the model
itself.** Test for any first-build decision: *"does this make the rich version a layer-on, or a
tear-out?"* If tear-out, redesign now. Item properties are **open/extensible structures** (e.g. an
item carries a `profile` object, not a fixed set of baked fields). This is the design-review
criterion held against every Code-task design before a prompt is written.

### 5.4 — The plan view is a projection engine, not a 2D drawing
Every element (envelope and discipline-layer alike) stores true 3D extent. The 2D view is computed.
This unlocks, from one engine: the plan view, stacked layer projections, and cross-sections.
(See Section 6.5.)

---

## 6. Core data model decisions (deltas from v2.1 §4)

### 6.1 — Coordinate system: arbitrary zero (supersedes slab-benchmark)
There is **no meaningful real-world benchmark.** Zero is a fixed arbitrary point; floors are a
**relative-offset Z stack** (each floor stores its offset from the one below). Only floor-to-floor
relationships are real. v2.1's "top of foundation slab = Z=0" is **superseded.** This matches the
built model and the recalibration-independence invariant (#22): geometry stays scale-independent in
storage, so recalibrating any page corrupts nothing downstream.

### 6.2 — Wall = per-segment element offset from a datum edge (NOT the edge itself)
A floor-polygon edge is a **reference/datum line.** The **wall is a separate entity** that references
that edge but has its own identity per segment, because the wall has layers and its interior plane
sits at a real offset *from* the edge (e.g. interior plane on the sheathing of the floor frame). This
is the datum-layer vs. element-layer split (#19) extended to walls.

**Forward constraint (logged):** the wall-to-floor junction must stay **configurable**, not
hardcoded. The floor frame may need to hang *inside* the wall's interior plane; walls may be settable
as **balloon frame** (continuous past the floor, framing landing on a ledger inside them). The
element model must allow the wall to own the vertical run and the floor to attach inside it.

### 6.3 — Z source: the floor-heights panel; elevations confirm
**Z originates from the floor-heights panel** (deliberate structured numeric entry — floor-to-ceiling
+ floor-system depth, accumulating up the stack). Elevations are the **visual confirmation /
correction surface**, not the primary Z source. (Direct application of principle 5.2. The built
elevation reference lines already derive from `accumulateZ(floorHeights)` — panel already feeds the
elevation, not the reverse.)

### 6.4 — Assemblies: parametric, tiered delivery; spatially real in target, simplified at first
- Assemblies have **definable parameters**, selectable at tiers: fully-ready named assemblies →
  parameter groups (e.g. 2×6 @ 16" vs 24" o.c.; insulation type fiberglass/cellulose/mineral
  wool/other) → eventual full **assembly builder**. Build order: **assembly *list* first, assembly
  *builder* later.** Parameters are read by output interpreters (energy, structural).
- **Every layer is positioned in 3D in the target model.** **Stage-1 simplification:** total
  thickness + control-layer attachment positions (not full per-layer spatial extent). Known expiry:
  the moment a mechanical path needs to test *which specific layer* it crosses, per-layer spatial
  positioning becomes required. Build through a seam (principle 5.3); do not architect the simple
  version as a tear-out.
- **Assembly zones are derived along an intact wall, never a geometry split** (principle 5.1.2).
  One continuous wall element carries multiple assembly assignments over sub-ranges. Canonical cases:
  stepped foundation with framed pony wall above (concrete zone + framed zone on one wall line); one
  wall with different finish over part of its run. Precedent: grade-line read-time intersection (#41).

### 6.5 — Everything is 3D; 2D is a projection with per-layer variable Z-windows
A discipline layer is **3D geometry**; the plan view is a **solved 2D projection** of it. The
projection is governed by a **per-layer, variable Z-window** (show this layer's geometry between
Z=a and Z=b). Projections from multiple layers, each with independent Z-windows, **stack** into a
composite coordination view.

*Canonical example:* standing on the first-floor plan, show **2nd- and 3rd-floor plumbing projected
down** (to coordinate stacks/drops) while **hiding first-floor plumbing** — the plumbing layer's
Z-window excludes the current floor and includes the floors above.

**Constraint on the wireframe build:** every element stores true per-element Z extent; plan views
are computed through a **named projection seam**; the Z-window/stacking UI is later-phase but the
model must support it from the wireframe up. **Cross-sections come nearly free** if the projection
seam is **plane-parameterized** (horizontal-at-Z for plan; vertical-at-cut-line for section) — one
design awareness, no work now.

### 6.6 — Floor system: a structurally-populatable block (new ambition)
The floor system is currently a **3D block** (depth between ceiling-below and floor-above, captured
by the floor-heights panel). Ambition: it becomes **structurally populated** — joists and beams as
actual geometry inside it, either generated from a structural layout or **traced over a supplier's
engineered layout**. This is mission-relevant to conflict mitigation and routing (a run parallel to
joists is fine; crossing them is a problem; beams are hard obstructions). The floor system is **"just
another layer of geometry"** — a container that holds positioned child structural members that 3D
paths are tested against like envelope planes. *How* to generate/trace is deferred; *that the block
must contain positioned members* is logged now. Pairs with 6.2's balloon-frame/floor-hang note.

### 6.7 — Soffit / window-shading: a multi-output hub (justifies base-level inclusion)
Soffit is real 3D geometry, but Stage 1 needs only **overhang projection** and **height above
fenestration** (the shading geometry over each window). This single derived geometry feeds **four**
consumers: (1) window-shading for the energy model, (2) the **window schedule**, (3) **exposure info
for window suppliers**, (4) **F280 generation**. High technical leverage + a stakeholder win per
output = a golden item, on the wireframe critical path. Full soffit assembly build-up defers.

### 6.8 — Assembly-assignment workflow
- **Project setup establishes the assembly set** (manually configured at project start, or automated
  later via #28). Traced sections **default** to those assemblies; the user **reassigns** sections.
  Reinforces the project-configuration layer (Section 3).
- Workflow stays **trace-first, assign-after** (matches the built polygon-trace model).
- Automated assembly/PDF recognition (#28) is **future or parallel** — a candidate for an independent
  background Code session (it does not touch the live geometry spine).

### 6.9 — Standards-agnostic, model-wide
The model stores **physical reality only**; standards (F280, HOT2000, Manual J, ASHRAE, code) are
**output interpreters** that read it. Now applies model-wide — to **roles** (Section 3) and outputs,
not just compliance. Adding a standard = writing an interpreter, never restructuring the model.

---

## 7. Outputs (deltas from v2.1 §7) — outputs back-propagate requirements

Outputs declare their required inputs; the cheapest high-value output sets the minimum first model.

### 7.1 — First output: the enumerated geometry list (per-item size + orientation)
The first output is a **building geometry list — every element listed individually with size and
orientation.** The window schedule, wall takeoff, and air-barrier length are all **filtered/
aggregated views over this one list.** So once the wireframe exists, the first thing it must do is
**enumerate itself** — a clean, verifiable early win.

### 7.2 — F280: build native generation; validation is a separate gate
The target is **native generation** (F280, etc.). Native-generation *validation* (HRAI/HVACDC) is a
separate downstream gate that does **not block building the generator** — it gates *compliance-
submission use*, not the working calc. Meanwhile **clean structured input packets** for TECA, HRAI,
WrightSoft, HOT2000 are easy, well-defined early outputs. Sequence: clean-inputs early; native
generation built toward, usable as a working calc before certification. (Sharper than v2.1, which
framed native generation as purely long-term.)

### 7.3 — Export principle: derived parameters are first-class element properties
Export the **derived parameters** (areas, volumes, lengths, projections, orientation), not raw
coordinate data. The real implication is a **code rule, not an export choice:** every meaningful
quantity the model derives is a **named, queryable value attached to the element it describes**,
computed through **one named function** — never a transient value trapped inside rendering/calc code.
The label reads it, the export reads it, the F280 packet reads it — one source of truth. Cheap if
designed in from the wireframe; expensive to retrofit (two-computations-disagree bug class). Same
discipline as the px/meters seam. (Raw coordinates stay internal; the DXF/coordinate exporter is a
later, separate concern — Section 8.)

---

## 8. Named subsystems

### 8.1 — The Dependency Propagation Model (DPM)  *(register #49)*
**The functional heart of the platform.** ("Dependency Propagation Model" is a coined term for this
project — not an established industry term; nearest cousins are dependency graphs, constraint
propagation, requirement traceability, but none means this. Free to define and use in descriptions.)

- Every **item type carries properties + requirements** that pull automatically.
- **Placement spawns dependent obligations** — frequently **cross-layer and cross-trade.**
- Each obligation is satisfied by a placement or a run, which may **spawn further obligations.**
- Obligations are **tracked** (worklist pattern — the floor-heights "outstanding items" list is the
  precedent) and **owned** (role model, Section 3).
- **Runs are freehand 3D paths; interactions occur along the path** (a fitting, an envelope crossing,
  an endpoint) — the line continues from each interaction.

**Canonical case — central ducted heat pump** (logged verbatim as the specimen):
- Select on the info sheet → spawns **air handler** + **outdoor unit** to place.
- Place **outdoor unit** → spawns linesets (to air handler), power (electrician), mount type
  (ground/wall property), and routing obligations for **both HVAC and electrician.**
- Place **air handler** → spawns lineset endpoint, possible backup heater, **condensate drain
  (plumber — cross-layer)**, power; if a humidifier is selected → water line + power.
- Bath ventilation: bath fans → each needs power routing/note + **vent to exterior (envelope
  interaction)**; if in an upper ceiling → **another envelope interaction.**

**Unifying insight:** conflict-mitigation and *every per-trade buy-in output* are **emergent
properties of this one engine.** The electrician's "everything to wire" = the set of power
obligations across all placements. The plumber's routing = condensate + stack obligations. The energy
advisor's envelope-interaction list = the set of envelope-crossing obligations. One mechanism
generates every buy-in output.

**Components:** the config-driven layer/worklist system (#48), the 3D-path system (v2.1 §4.4), the
worklist pattern (floor-heights precedent), envelope-interaction detection, the role/ownership model,
and the 3D Reconstruction Profile (8.3).

**Planning artifacts to generate later:** (a) a **symbol/icon library** tagged to item types
(standard ASHRAE / residential mechanical-electrical-plumbing conventions); (b) an
**item-requirement table** — each item type → the obligations it spawns.

### 8.2 — Config-driven discipline-layer item system  *(register #48)*
A discipline layer is **not freehand-only.** It is driven by project-config decisions that **generate
a to-place worklist:**
1. The **project information sheet** holds the decisions — energy sources at site, heating/cooling
   method, equipment selection, in-floor heat y/n, bath fans, hood fans, HRV/ERV, etc. (the
   project-configuration layer, Section 3).
2. Selections **generate placeable items** (icons/symbols per equipment/device).
3. The user is **prompted to place them**; each sits on a **To-Place list** and is **removed when
   placed** — exactly the floor-elevations worklist pattern.
4. **Runs (ducts/drains/circuits)** are drawn between placed items as 3D paths.
Large, largely self-contained build (adds items onto the model; does not restructure geometry) — a
strong **independent / overnight-batch** candidate, built *on* the wireframe.

### 8.3 — The 3D Reconstruction Profile  *(register #50)*
Every item stores a **minimal spine** + a **type-supplied profile** that derives the true 3D solid on
demand (never stored) — principle 5.1.4.
- **Spine (now):** centerline (**path-spine** — pipe, duct, wire) or point (**point-spine** —
  equipment). Universal centerline-for-everything for now; richer spine types (differential splines,
  region-spines for in-floor heat / radiant zones, per-item-class rules) are acknowledged and
  **deferred — too big for now** (the 12×24→10×16 duct transition encodes real install decisions:
  concentric vs. offset, which side holds — not just shape).
- **Profile (first build):** bounding-solid — cylinder by diameter (pipe/wire), **constant-profile
  prism** (duct: one size per segment; a size change = a new segment), block dims + height
  (equipment). Sufficient for **conflict-clearance checks** (centerline + diameter → outer surface)
  and a crude 3D render.
- **Extensible (principle 5.3):** profile structures are **open** — the rich model (differential
  splines, duct transitions/takeoffs/reducers, region-spines) **layers on without replacing** the
  base. Ductwork rides the same model as pipe initially; its hard parts defer with the spine
  taxonomy (same deferred problem).
- **Centerline matters for conflict mitigation:** clearance is checked against the item's derived
  outer surface, not the drawn line.
- **DXF / interchange export** is downstream and **deferred**, but is *enabled* by this property
  existing from the start. Decision made now: **what minimal data each item stores** (spine + a type
  that maps to a profile); the exporter itself is built later.
- Pairs with the DPM: obligations route along spines, interactions occur along them, **envelope
  crossings are spine-vs-plane intersections.**

---

## 9. The reframe — dependency chain (replaces the stage-labelled roadmap for forward direction)

**Off the critical path (deferred, logged, not cancelled):** windows/doors Piece 3 (three-layer
snap), Piece 4 (dumb duplicate), the component model (#44), window-as-assembly (#45), schedule import
(#46). These refine inputs to a model that does not yet exist.

**Near-term chain (hard dependency order):**

1. **Wireframe envelope (3D).** Roof-plan aligned to the floor stack via the existing
   ghost/confirm-borrow mechanic (roof polygon larger than the wall polygon below = the eave
   projection — settled, same mechanic, no new machinery). Floor polygons lifted to panel-sourced Z;
   walls as per-segment elements off datum edges; roof plane; **soffit/eave projection** derived.
   Standalone, **browser-verifiable** milestone — the owner wants to *see* the envelope before
   building the machine that runs on it.
2. **The wireframe enumerates itself** — the geometry list output (per-item size + orientation;
   7.1). First real, verifiable output; the substrate for downstream schedules/takeoffs.
3. **THEN the systems built on the wireframe** (planned deeper, strong batch candidates): the
   project-configuration layer (Section 3) → config-driven layer/worklist system (#48) → symbol
   library + item-requirement table (to generate) → the DPM (#49) with 3D Reconstruction Profile
   (#50) → runs as 3D paths → conflict / envelope-interaction detection.

**Near-term operator goal** ("mechanical overlays in days") resolves to: the layers exist, lines can
be drawn, and equipment symbols can be placed from selections — **without** conflict-checking yet.
But it is **downstream of the wireframe by hard dependency**, and the owner confirmed: *see the
wireframe envelope first.* So the first build aims at **(1) wireframe + (2) self-enumeration**; the
DPM/layer system (3) is the large independent build that follows.

**Two sequencing axes (Section 4):** technical dependency + buy-in value. Hunt for golden items
scoring on both (soffit/shading is the exemplar — on the wireframe path *and* a standalone energy-
advisor/window-supplier/F280 win).

---

## 10. Open / to-do (carried forward from this conversation)

- **Q20 final scope confirmation:** first build = wireframe + self-enumeration (recommended), with
  the DPM/layer system as the following large independent build. (Owner leaning confirmed: "see the
  wireframe envelope first.")
- **Generate:** the mechanical/electrical/plumbing **symbol library** (item type → icon).
- **Generate:** the **item-requirement table** (item type → spawned obligations) for the DPM.
- **Deeper planning** of #48/#49/#50 before the large batch build.
- **Spine-type taxonomy & duct detail** (differential splines, transitions, region-spines) — deferred,
  to be opened when item detail matters.
- **Per-layer assembly spatial positioning** — opens when a path must test which specific layer it
  crosses.
- **Floor-system structural population** (joists/beams; generate vs. trace-from-supplier) — deferred.

---

*Append future architectural decisions below this line.*

---

## 11. The viewport-as-unit model (Session 67, 2026-06-30)

**Decision:** A carved region and an un-carved full sheet are both **viewports** — first-class
classified geometry units. They are not different things; they differ only in extent. A carved
elevation IS an elevation; it requires a direction sub-label (N/S/E/W) exactly as a full-sheet
elevation does, because the same downstream consumers (Z-stack, elevation-edge reference, opening
placement, enumeration) need the same semantic metadata regardless of whether the viewport is a
crop of a full sheet or the full sheet itself. An un-carved page is the degenerate single full-page
viewport.

**Why this matters:** it closes the category-inheritance question definitively. A carved region
CANNOT inherit its source sheet's category silently, because: (a) a single sheet can contain
multiple view types (a detail sheet might hold both a section and a floor-plan fragment — each
carved region is a different category); and (b) silent inheritance would corrupt the Z-stack, the
ghosting chain, and the enumeration, all of which key on semantic category + sub-label. The correct
behavior — **enforced by the forced-categorize-on-carve modal (#115 fix, commit 2521bbd)** — is
that every newly carved region must be explicitly classified before it is admitted to navigation.

**Two-field model (also settled Session 67):**
- `subLabel` — semantic meaning only: the floor level for floor-plan viewports (feeds FLOOR_ORDER /
  Z-stack / ghost chain); the compass direction for elevation viewports (feeds elevation-edge
  association and sidebar grouping). Required for confirm; never overloaded as a display name.
- `regionName` — display name only: user-editable free text, pre-filled with a formula
  (`${sourceName}: Region 01`) at carve time. Drives the sidebar chip and the outline label drawn
  on the source sheet. Never read by Z-stack, ghosting, enumeration, or any geometric consumer.

**Governing principle:** the two fields are INDEPENDENT. A `subLabel` change on recategorize
NEVER clobbers `regionName`; a `regionName` edit NEVER changes `subLabel`. `writePageCategory`
enforces this via the `extra={}` parameter — recategorize paths pass no extra, carve-confirm paths
pass `{ regionName }` only.
