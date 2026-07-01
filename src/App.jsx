import { useState, useRef, useCallback, useEffect } from 'react'
import ThreeDView from './ThreeDView.jsx'
import * as pdfjsLib from 'pdfjs-dist'
import F280_WEATHER from './data/f280-weather.json'
import './App.css'
import {
  makeVertex, distToSegment, segmentGeom, projT, applyAxisSnap, pointInPolygon,
  findCollinearOverlap, prepareForMerge, mergePolygons, splitPolygon, getEligibleShapes,
  CLOSE_SNAP_RADIUS, ALIGN_TOLERANCE, HIT_SEG_DIST, HIT_VERT_DIST,
  FLOOR_ORDER, getAnchorFloor, getGhostSourcePageId, accumulateZ, isKnownFloorLabel,
  REFERENCE_KIND_DEFAULT, kindToLabel,
} from './geometry.js'
import { drawLockedShapes, drawGradeLineShapes, drawRunPaths, drawShapePoly, drawOpeningPoly, drawOpeningShapes, drawEquipmentItemShapes, drawAlignGuide, drawSegmentHighlight, drawGhostShapes, drawAlignHandles, drawRegionOutlines, HANDLE_PX } from './canvasRenderer.js'
import { pxToDisplayDist, pxToMeters, metersToPx, metersToInches, inchesToMeters, feetToMeters, feetInchesToMeters, elevYToZFeet, zFeetToElevY, getCSSTransform, similarityFromHandleDrag, screenDeltaToWorld } from './coords.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function CompassRoseSVG() {
  // 120×120 viewBox, center at (60,60). N arm points up (negative Y).
  return (
    <svg className="compass-rose-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      {/* Cardinal arms */}
      <line x1="60" y1="60" x2="60" y2="10"  stroke="#e53e3e" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="60" x2="60" y2="110" stroke="#555"    strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="60" x2="10"  y2="60" stroke="#555"    strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="60" x2="110" y2="60" stroke="#555"    strokeWidth="2" strokeLinecap="round" />
      {/* Intercardinal arms */}
      <line x1="60" y1="60" x2="24"  y2="24"  stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="60" x2="96"  y2="24"  stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="60" x2="96"  y2="96"  stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="60" y1="60" x2="24"  y2="96"  stroke="#999" strokeWidth="1.5" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx="60" cy="60" r="4" fill="#333" />
      {/* Arrowhead on N arm */}
      <polygon points="60,6 55,18 65,18" fill="#e53e3e" />
      {/* Cardinal labels */}
      <text x="60" y="8"   textAnchor="middle" dominantBaseline="auto"   fontSize="11" fontWeight="700" fill="#e53e3e">N</text>
      <text x="60" y="118" textAnchor="middle" dominantBaseline="auto"   fontSize="10" fontWeight="600" fill="#555">S</text>
      <text x="8"  y="64"  textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="600" fill="#555">W</text>
      <text x="112" y="64" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="600" fill="#555">E</text>
    </svg>
  )
}

// ── Page categorization metadata ────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { key: 'site-plan',     label: 'Site Plan' },
  { key: 'floor-plan',    label: 'Floor Plan' },
  { key: 'elevation',     label: 'Elevation' },
  { key: 'cross-section', label: 'Cross-Section' },
  { key: 'detail',        label: 'Detail' },
  { key: 'roof-plan',     label: 'Roof Plan' },
]
// Known floor levels — the ONLY way to identify a floor plan's level. Free text
// is never a level (see subLabelNote). Mirrors FLOOR_ORDER from geometry.js.
const FLOOR_SUBLABELS = ['Basement', 'Crawlspace', 'Main Floor', '2nd Floor', '3rd Floor']
// Categories whose sub-label is a simple optional free-text input
const FREETEXT_SUBLABEL_CATEGORIES = ['site-plan', 'cross-section', 'detail', 'roof-plan']
const ELEVATION_DIRS = ['North', 'South', 'East', 'West']
// Editable opening type list — change/add entries here; UI dropdowns derive from this.
const OPENING_TYPES = ['Tilt-turn', 'Casement', 'Fixed', 'Slider', 'Hinged door']
const categoryLabel = (key) => CATEGORY_OPTIONS.find(o => o.key === key)?.label ?? key

// ── §9 Project-configuration layer — descriptor schema ──────────────────────
// CONFIG_FIELDS is the single source of truth for the project-setup panel.
// Each descriptor is data-only; adding a new field = adding a descriptor here.
// `spawns` is a reserved hook for the §8.2 worklist build; always null this piece.
const CONFIG_FIELDS = [
  // ── Outputs ──────────────────────────────────────────────────────────────
  {
    id: 'outputs',
    category: 'Outputs',
    label: 'Required outputs',
    options: [
      { value: 'f280',       label: 'F280 Heat Loss/Gain' },
      { value: 'h2k',        label: 'HOT2000 / Energy packet' },
      { value: 'permit-set', label: 'Full permit set' },
    ],
    multi: true,
    spawns: null,
  },
  // ── Jurisdiction ─────────────────────────────────────────────────────────
  {
    id: 'jurisdiction',
    category: 'Jurisdiction',
    label: 'Building code',
    options: [
      { value: 'nbc',   label: 'National Building Code' },
      { value: 'obc',   label: 'Ontario Building Code' },
      { value: 'other', label: 'Other / TBD' },
    ],
    multi: false,
    spawns: null,
  },
  // ── Climate ──────────────────────────────────────────────────────────────
  {
    id: 'location-station',
    category: 'Climate',
    label: 'Location (climate station)',
    // value is "station|||region" composite — unique across provinces (e.g. Richmond appears in BC and ON)
    options: F280_WEATHER.map(e => ({ value: `${e.station}|||${e.region}`, label: `${e.station}, ${e.region}` })),
    multi: false,
    spawns: null,
  },
  {
    id: 'toh-override',
    category: 'Climate',
    label: 'Override heating design temp (°C)',
    kind: 'number',
    multi: false,
    spawns: null,
  },
  // ── Assemblies ───────────────────────────────────────────────────────────
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
      { value: 'vented-attic-r50',    label: 'Vented attic, R50 blown-in insulation' },
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
  // ── Equipment ────────────────────────────────────────────────────────────
  {
    id: 'water-heating',
    category: 'Equipment',
    label: 'Water heating',
    options: [
      { value: 'tank-gas',     label: 'Tank (gas)' },
      { value: 'tankless-gas', label: 'Tankless (gas)' },
    ],
    multi: false,
    spawns: null,
  },
  {
    id: 'space-heating',
    category: 'Equipment',
    label: 'Space heating',
    options: [
      { value: 'furnace-gas',      label: 'Gas furnace' },
      { value: 'heat-pump-ducted', label: 'Ducted heat pump' },
    ],
    multi: false,
    spawns: (v) => v === 'heat-pump-ducted'
      ? [{ type: 'air-handler', count: 1 }, { type: 'outdoor-unit', count: 1 }]
      : [],
  },
  {
    id: 'cooling',
    category: 'Equipment',
    label: 'Cooling',
    options: [
      { value: 'heat-pump-ducted', label: 'Ducted heat pump (heating + cooling)' },
      { value: 'central-ac',       label: 'Central A/C' },
      { value: 'none',             label: 'None' },
    ],
    multi: false,
    spawns: null,
  },
  {
    id: 'ventilation',
    category: 'Equipment',
    label: 'Ventilation',
    options: [
      { value: 'hrv', label: 'HRV (heat recovery ventilator)' },
      { value: 'erv', label: 'ERV (energy recovery ventilator)' },
    ],
    multi: false,
    spawns: (v) => (v === 'hrv' || v === 'erv') ? [{ type: 'hrv-unit', count: 1 }] : [],
  },
  {
    id: 'bath-fans',
    category: 'Equipment',
    label: 'Bath fans',
    kind: 'count',
    multi: false,
    spawns: (n) => Number(n) > 0 ? [{ type: 'bath-fan', count: Number(n) }] : [],
  },
]

// ── §8.2 Item-type obligation table ─────────────────────────────────────────
// Each entry: { type, label, obligations: [{id, label, kind, blocked, trades, note?, options?}] }
// kind is open-set: 'placement' | 'run' | 'property' (extend by adding entries here).
// trades: string[] — role ids from ROLE_LABELS. For run-kind obligations the category-level
// trade in RUN_PAIR_MAP is authoritative when the obligation id appears in satisfies[]; the
// trades here are the fallback for run categories not yet in the pair map (#68).
// "envelope" obligations have no role in ROLE_LABELS today — trades:[] (D3 fork; #78 to add role).
const ITEM_TYPES = [
  {
    type: 'air-handler',
    label: 'Air Handler',
    obligations: [
      { id: 'lineset-endpoint', label: 'Lineset endpoint',            kind: 'run',      blocked: true,  trades: ['hvac-designer'],                    note: 'requires coordination' },
      { id: 'condensate-drain', label: 'Condensate drain (plumber)',  kind: 'run',      blocked: true,  trades: ['plumber'],                           note: 'requires coordination' },
      { id: 'power',            label: 'Power (electrician)',         kind: 'run',      blocked: true,  trades: ['electrician'],                       note: 'requires coordination' },
    ],
  },
  {
    type: 'outdoor-unit',
    label: 'Outdoor Unit',
    obligations: [
      { id: 'lineset-to-handler', label: 'Lineset to air handler',   kind: 'run',      blocked: true,  trades: ['hvac-designer'],                    note: 'requires coordination' },
      { id: 'power',              label: 'Power (electrician)',       kind: 'run',      blocked: true,  trades: ['electrician'],                       note: 'requires coordination' },
      { id: 'mount-type',         label: 'Mount type',               kind: 'property', blocked: false, trades: ['hvac-designer', 'designer'],
        options: [{ value: 'ground', label: 'Ground' }, { value: 'wall', label: 'Wall' }] },
    ],
  },
  {
    type: 'bath-fan',
    label: 'Bath Fan',
    obligations: [
      { id: 'power',            label: 'Power (electrician)',         kind: 'run',      blocked: true,  trades: ['electrician'],                       note: 'requires coordination' },
      { id: 'vent-to-exterior', label: 'Vent to exterior (envelope)', kind: 'run',      blocked: true,  trades: [],                                   note: 'requires coordination' },
    ],
  },
  {
    type: 'hrv-unit',
    label: 'HRV/ERV Unit',
    obligations: [
      { id: 'supply-exhaust-duct', label: 'Supply/exhaust ducting',       kind: 'run',  blocked: true,  trades: ['hvac-designer', 'energy-advisor'],  note: 'requires coordination' },
      { id: 'exterior-vent',       label: 'Exterior vents ×2 (envelope)', kind: 'run',  blocked: true,  trades: [],                                   note: 'requires coordination' },
      { id: 'power',               label: 'Power (electrician)',           kind: 'run',  blocked: true,  trades: ['electrician'],                       note: 'requires coordination' },
      { id: 'condensate-drain',    label: 'Condensate drain (plumber)',    kind: 'run',  blocked: true,  trades: ['plumber'],                           note: 'requires coordination' },
    ],
  },
]

// ── §8.3 Build 2: Profile table ─────────────────────────────────────────────
// BASE-CASE CONSTANTS. v1 placeholder dimensions. A later config-driven size layer
// replaces these reads at this seam (principle 5.2); do not hardcode these numbers
// anywhere else.
const SEGMENT_PROFILES = {
  lineset: { sweep: 'extrude-circle', diameterM: 0.025 },
  duct:    { sweep: 'extrude-rect',   widthM: 0.150, heightM: 0.150 },
}
const SEGMENT_PROFILE_FALLBACK = { sweep: 'extrude-circle', diameterM: 0.025, fallback: true }
const POINT_PROFILES = {
  'air-handler':  { sweep: 'placed-block', wM: 0.600, dM: 0.600, hM: 0.900 },
  'outdoor-unit': { sweep: 'placed-block', wM: 0.900, dM: 0.900, hM: 0.750 },
  'bath-fan':     { sweep: 'placed-block', wM: 0.250, dM: 0.250, hM: 0.200 },
  'hrv-unit':     { sweep: 'placed-block', wM: 0.700, dM: 0.500, hM: 0.400 },
}

// ── §8.2 step 4: Run-path pair→category map ─────────────────────────────────
// Keyed on the unordered pair of the two endpoint item-types. The category is
// assigned to the run when both ends connect. satisfies[] names the obligation ids
// on each endpoint item that this run satisfies (read from ITEM_TYPES above).
// Adding a new run type = one new row here; no engine change (principle 5.3).
const RUN_PAIR_MAP = [
  {
    pair: ['air-handler', 'outdoor-unit'],
    category: 'lineset',
    trade: 'hvac-designer',
    satisfies: [
      { itemType: 'air-handler',  obligationId: 'lineset-endpoint' },
      { itemType: 'outdoor-unit', obligationId: 'lineset-to-handler' },
    ],
  },
]

// Resolve the pair→category map entry for an unordered pair of item-types.
// Returns the matching entry or null if the pair is not in the map.
function resolveRunPairEntry(typeA, typeB) {
  return RUN_PAIR_MAP.find(e => {
    const [p0, p1] = e.pair
    return (typeA === p0 && typeB === p1) || (typeA === p1 && typeB === p0)
  }) ?? null
}

// ── §3 Output→roles derivation map (coarse starter set; add entries to extend) ──
const OUTPUT_ROLES = {
  'f280':       ['hvac-designer', 'energy-advisor'],
  'h2k':        ['energy-advisor'],
  'permit-set': ['designer', 'hvac-designer', 'plumber', 'electrician'],
}
// Insertion order determines display order in the roles section.
const ROLE_LABELS = {
  'designer':      'Designer',
  'hvac-designer': 'HVAC Designer',
  'energy-advisor':'Energy Advisor',
  'plumber':       'Plumber',
  'electrician':   'Electrician',
}

// ── Cross-field config resolver (#58 b/c seam — forward-proofs #74) ────────────
// Pure function: takes raw projectSetupRef.current.values, returns a resolved copy
// where cross-field implications have been applied. Both deriveWorklist and the
// Project Setup panel render call this before reading config values.
//
// RULE SET — hand-authored; replace contents only when #74 builds a data-driven layer.
// Rule format: { id, when(raw): bool, apply(raw): partialValues }
const CONFIG_CROSS_FIELD_RULES = [
  {
    // When space-heating is a ducted heat pump and the user hasn't explicitly set cooling,
    // prefill cooling to match. Never clobbers a user-set (non-null) cooling value.
    id: 'heat-pump-ducted-implies-cooling',
    when: (raw) => raw['space-heating'] === 'heat-pump-ducted' && (raw['cooling'] == null),
    apply: () => ({ cooling: 'heat-pump-ducted' }),
  },
  {
    // Resolve 'toh' (outdoor heating design temp, °C) from location station or manual override.
    // Override wins over register lookup. 'toh' is derived — never stored as raw intent.
    id: 'resolve-toh',
    when: () => true,
    apply: (raw) => {
      const override = raw['toh-override']
      if (override !== null && override !== undefined && override !== '') {
        const n = Number(override)
        if (!isNaN(n)) return { toh: n }
      }
      const stationVal = raw['location-station']
      if (stationVal) {
        const [stationName, region] = stationVal.split('|||')
        const entry = F280_WEATHER.find(e => e.station === stationName && e.region === region)
        if (entry) return { toh: entry.dhdbt }
      }
      return { toh: null }
    },
  },
]

function resolveEffectiveConfig(rawValues) {
  const resolved = { ...rawValues }
  for (const rule of CONFIG_CROSS_FIELD_RULES) {
    if (rule.when(resolved)) Object.assign(resolved, rule.apply(resolved))
  }
  return resolved
}

// Engine-internal RSI_W resolver (F280 Cl. 5.2.1 / 6.2.2). Never stored on the record — derived on demand.
// uw is in W/m²·K (metric); RSI_W = 1/uw in m²·°C/W.
function getRsiW(uw) { return uw != null && uw > 0 ? 1 / uw : null }

// F280 indoor heating design temperature (°C). Hardcoded pending a project config field.
// TODO: add 'ti-heating' to CONFIG_FIELDS (Category: Climate) so users can override per project.
const F280_TI_HEATING = 22

// deriveF280Heating — pure, derive-on-demand, stores nothing.
// Computes above-grade conductive heat loss (U·A·ΔT) by surface kind.
// Extensible spine: below-grade, slab, solar gain are additive result rows in future builds.
function deriveF280Heating(enumeration, resolvedConfig) {
  const tohC = resolvedConfig.toh ?? null
  if (tohC === null) return { status: 'no-climate', total: null }

  const tiC = F280_TI_HEATING
  const deltaT = tiC - tohC

  const bySurfaceKind = {
    'wall-surface':      { areaM2: 0, uaSum: 0, lossW: 0, count: 0, unresolvedCount: 0 },
    'flat-roof-surface': { areaM2: 0, uaSum: 0, lossW: 0, count: 0, unresolvedCount: 0 },
    'window':            { areaM2: 0, uaSum: 0, lossW: 0, count: 0, unresolvedCount: 0 },
    'door':              { areaM2: 0, uaSum: 0, lossW: 0, count: 0, unresolvedCount: 0 },
  }

  for (const el of enumeration) {
    const bucket = bySurfaceKind[el.kind]
    if (!bucket) continue  // soffit — not yet modeled; listed in notModeled below

    let area = null
    let u = null

    if (el.kind === 'wall-surface') {
      area = el.netAreaM2
      u = el.effectiveUValue
    } else if (el.kind === 'flat-roof-surface') {
      area = el.insideFaceAreaM2
      u = el.effectiveUValue
    } else if (el.kind === 'window' || el.kind === 'door') {
      area = el.widthM != null && el.heightM != null ? el.widthM * el.heightM : null
      u = el.uw
    }

    if (area == null) continue
    bucket.count++
    bucket.areaM2 += area

    if (u == null) {
      bucket.unresolvedCount++
      // Surface contributes area but NOT loss — partial coverage surfaced via unresolvedCount.
      continue
    }
    bucket.uaSum += u * area
    bucket.lossW += u * area * deltaT
  }

  for (const b of Object.values(bySurfaceKind)) {
    b.uAvg = b.areaM2 > 0 ? b.uaSum / b.areaM2 : null
  }

  const conductiveAboveGradeW = Object.values(bySurfaceKind).reduce((s, b) => s + b.lossW, 0)

  return {
    status: 'ok',
    tiC,
    tohC,
    deltaT,
    bySurfaceKind,
    conductiveAboveGradeW,
    total: conductiveAboveGradeW,  // == conductiveAboveGradeW this build; extended by future rows
    notModeled: ['below-grade-wall', 'slab-on-grade', 'floor-over-unheated', 'solar-gain'],
  }
}

const SIDEBAR_TABS = [
  { id: 'project-setup', label: 'Project Setup' },
  { id: 'worklist',      label: 'Worklist' },
  { id: 'openings',      label: 'Openings' },
  { id: 'floor-heights', label: 'Floor Heights' },
  { id: 'envelope',      label: 'Envelope' },
  { id: 'f280',          label: 'F280' },
]

function App() {
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(null)
  const [currentPageId, setCurrentPageId] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [renderingPage, setRenderingPage] = useState(false)

  const [calibMode, setCalibMode] = useState(false)
  const [calibPoints, setCalibPoints] = useState([])
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [scaleUnit, setScaleUnit] = useState('imperial')
  const [feetVal, setFeetVal] = useState('')
  const [inchesVal, setInchesVal] = useState('')
  const [metersVal, setMetersVal] = useState('')
  const [scaleError, setScaleError] = useState('')

  const [drawMode, setDrawMode] = useState(false)
  const [snapAngle, setSnapAngle] = useState(true)
  const [snapDist, setSnapDist] = useState(true)
  const [snapIncrement, setSnapIncrement] = useState(0.1524)
  const [drawVertexCount, setDrawVertexCount] = useState(0)
  const [reviewShape, setReviewShape] = useState(null)
  // ── Roof-plan tracing (Step 7) ───────────────────────────────────────────────
  const [roofShapeDraft, setRoofShapeDraft] = useState(null)  // {vertices, pageId} closed on roof page, pending type pick
  const [roofTypeDraft, setRoofTypeDraft] = useState(null)    // 'flat' | 'sloped'
  const [parapetWidthDraft, setParapetWidthDraft] = useState('')

  // ── Grade-line tracing (Elevation Piece 4 sub-piece 2) ──────────────────────
  const [showGradeLinePrompt, setShowGradeLinePrompt] = useState(false)  // "Trace grade line?" Q shown during polygon review
  const [gradeLinePending, setGradeLinePending] = useState(false)         // user answered Yes; start grade-line mode after polygon confirm
  const [gradeLineDrawing, setGradeLineDrawing] = useState(false)         // actively tracing the grade line
  const [runDrawing, setRunDrawing] = useState(false)                     // actively tracing a run path
  // Bound wall-vertex identities for first + last grade-line endpoint (piece 2, A1 strict).

  // ── Opening placement (windows/doors, Pieces 1+2) ────────────────────────────
  const [placingOpeningMode, setPlacingOpeningMode] = useState(false)
  // ── Equipment item placement (§8.2 Part B) ────────────────────────────────────
  const [placingEquipmentItem, setPlacingEquipmentItem] = useState(false)
  const [placingItemType, setPlacingItemType] = useState(null)
  const [placingInstanceKey, setPlacingInstanceKey] = useState(null)
  const [openingCorner1, setOpeningCorner1] = useState(null)           // first-click canvas pos
  const [openingDraftShape, setOpeningDraftShape] = useState(null)     // {vertices, corner1} pending dialog
  const [openingDraftKind, setOpeningDraftKind] = useState('window')   // 'window' | 'door'
  const [openingDraftType, setOpeningDraftType] = useState(OPENING_TYPES[0])
  const [openingDraftLabel, setOpeningDraftLabel] = useState('')
  const [openingDraftFt, setOpeningDraftFt] = useState('')             // width ft
  const [openingDraftIn, setOpeningDraftIn] = useState('')             // width in
  const [openingDraftHFt, setOpeningDraftHFt] = useState('')           // height ft
  const [openingDraftHIn, setOpeningDraftHIn] = useState('')           // height in
  const [showDimBasisDialog, setShowDimBasisDialog] = useState(false)  // first-use gate
  // ── Place-from-entry (holding area → single-click placement) ─────────────────
  const [placingFromEntry, setPlacingFromEntry] = useState(false)
  const [pendingEntryToPlace, setPendingEntryToPlace] = useState(null)

  const [editMode, setEditMode] = useState(false)
  const [editSubMode, setEditSubMode] = useState(null) // 'move'|'combine'|'split'|null
  const [editCursor, setEditCursor] = useState('default')

  const [editUndoCount, setEditUndoCount] = useState(0)
  const [editRedoCount, setEditRedoCount] = useState(0)
  const [combineSelection, setCombineSelection] = useState([])
  const [combineError, setCombineError] = useState('')
  const [splitSelected, setSplitSelected] = useState(null)
  const [splitCut, setSplitCut] = useState([])

  // ── Roof role assignment + graph line tracing (Step 7, Pieces D+) ──────────
  const [roofRoleMode, setRoofRoleMode] = useState(false)
  // hover/selected: 'segment' → {type,shapeIdx,segIdx} | 'edge' → {type,edgeId}
  const [roofRoleHover, setRoofRoleHover] = useState(null)
  const [roofRoleSelected, setRoofRoleSelected] = useState(null)
  // Connected-graph internal line tracing
  const [roofLineMode, setRoofLineMode] = useState(false)
  const [roofChainStartId, setRoofChainStartId] = useState(null) // vertId of active chain start
  const [roofDefaultRole, setRoofDefaultRole] = useState('ridge')

  // ── Sidebar (Step 4c) ───────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── 3D wireframe view ─────────────────────────────────────────────────────
  const [show3DView, setShow3DView] = useState(false)
  const [wireframeData, setWireframeData] = useState(null)

  // ── Consolidated side-panel container (#69) ──────────────────────────────────
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeTabId, setActiveTabId] = useState('project-setup')
  const [sidebarWidth, setSidebarWidth] = useState(300)
  const sidebarWidthRef = useRef(300)
  // Derived flags — existing panel conditionals read these unchanged
  const showProjectSetup = showSidebar && activeTabId === 'project-setup'
  const showFloorHeights = showSidebar && activeTabId === 'floor-heights'
  const showWorklist     = showSidebar && activeTabId === 'worklist'
  const showEnumeration  = showSidebar && activeTabId === 'envelope'
  const showOpenings     = showSidebar && activeTabId === 'openings'
  const showF280         = showSidebar && activeTabId === 'f280'
  // Legacy setters: all call sites pass false → close the sidebar
  const setShowProjectSetup = () => setShowSidebar(false)
  const setShowFloorHeights = () => setShowSidebar(false)
  const setShowWorklist     = () => setShowSidebar(false)
  const setShowEnumeration  = () => setShowSidebar(false)
  // ── Project setup panel (§9 config layer, Piece 2) ──────────────────────────
  const [projectSetupTick, setProjectSetupTick] = useState(0)
  const [psCountDrafts, setPsCountDrafts] = useState({})
  // ── §8.2 Worklist / Envelope panels ─────────────────────────────────────────
  const [worklistTick, setWorklistTick] = useState(0)
  const [enumerationTick, setEnumerationTick] = useState(0)
  const [pendingOpeningsTick, setPendingOpeningsTick] = useState(0)
  // ── Floor heights panel (elevation numeric editor, Piece 2) ─────────────────
  const [floorHeightsTick, setFloorHeightsTick] = useState(0)
  const [fhExpandedLevel, setFhExpandedLevel] = useState(null)
  const [fhCustomActive, setFhCustomActive] = useState(false)   // true when Custom input is shown within expanded level
  const [fhCustomVal, setFhCustomVal] = useState('')            // raw string from custom field in INCHES
  const [fhCustomSheathing, setFhCustomSheathing] = useState(false) // "add sheathing+drywall" checkbox
  // Per-level ft + in drafts for ceiling height entry (imperial convention: matches calibration dialog).
  // Maps keyed by floor-level string so each row keeps its own draft independently.
  const [fhFtVals, setFhFtVals] = useState({})   // { [level]: string }
  const [fhInVals, setFhInVals] = useState({})   // { [level]: string }
  const [fhF2fFtVals, setFhF2fFtVals] = useState({})  // floor-to-floor draft ft { [level]: string }
  const [fhF2fInVals, setFhF2fInVals] = useState({})  // floor-to-floor draft in { [level]: string }
  const [fhError, setFhError] = useState(null)         // { level, msg } | null

  // ── Multi-floor ghost reference (Step 6) ─────────────────────────────────────
  const [showGhostByPageId, setShowGhostByPageId] = useState({})

  // ── Reference-layer model (Step 6, sub-step 5) ──────────────────────────────
  const primaryReferenceIdRef = useRef(null)   // pageId of first manually-calibrated page; set once, never overwritten
  const pageRefParentRef = useRef({})          // pageId -> sourcePageId; written at confirm time (Piece B)

  const shapeIdCounterRef = useRef(0)          // monotonic id for stable shape identity
  const psCounterRef = useRef(0)               // point-slot id counter (ps-N)
  const ssCounterRef = useRef(0)               // span-slot id counter (ss-N)
  const dimensionBasisRef = useRef(null)       // 'frame' | 'rough-opening' | null (project-level, set once per upload)
  const priorSnapIncrementRef = useRef(null)   // saved increment before opening-placement / opening-edit default
  const pendingOpeningsRef = useRef([])        // normalized opening entries awaiting placement (holding area)
  // B4: project-level physical derivation config (§5.3 — base case of extensible model; no UI yet)
  const projectConfigRef = useRef({
    // Reconcile rule for stacked floors: 'closest-approach' measures per-edge signed perpendicular
    // distance to the nearest floor-below edge in world meters, with pointInPolygon for sign.
    cantileverRule: 'closest-approach',
    // Threshold (meters) to classify coincident vs cantilever/setback.
    reconcileThresholdM: 0.05,
    // Minimum overhang (meters) to report as a soffit element.
    soffitCombineThresholdM: 0.05,
  })
  // §9 project-configuration layer; operator-edited project setup.
  // Distinct from projectConfigRef (B4 physical-derivation thresholds).
  const projectSetupRef = useRef({ values: {}, roleAssignments: {} })

  // §9 accessors — single read/write path to projectSetupRef.values.
  // Returns RAW stored value — what the user actually chose. Callers that need the
  // engine-resolved value (cross-field rules applied) call resolveEffectiveConfig
  // themselves. Two honest, separately-inspectable truths.
  const getConfigValue = (fieldId) => {
    const field = CONFIG_FIELDS.find(f => f.id === fieldId)
    const stored = projectSetupRef.current.values[fieldId]
    if (stored !== undefined) return stored
    if (field?.kind === 'count') return 0
    return field?.multi ? [] : null
  }
  const setConfigValue = (fieldId, value) => {
    projectSetupRef.current.values[fieldId] = value
    setProjectSetupTick(t => t + 1)
    setWorklistTick(t => t + 1)
  }

  // §9 required-roles derivation — computed view, never stored.
  // Unions OUTPUT_ROLES across all selected outputs; display order = ROLE_LABELS insertion order.
  const getRequiredRoles = () => {
    const selected = getConfigValue('outputs')
    if (!Array.isArray(selected) || selected.length === 0) return []
    const seen = new Set()
    for (const out of selected) {
      for (const role of (OUTPUT_ROLES[out] ?? [])) seen.add(role)
    }
    return Object.keys(ROLE_LABELS).filter(r => seen.has(r))
  }

  // §9 role assignment accessors — sole read/write path to roleAssignments.
  const getRoleAssignment = (roleId) => projectSetupRef.current.roleAssignments[roleId] ?? ''
  const setRoleAssignment = (roleId, name) => {
    if (name) {
      projectSetupRef.current.roleAssignments[roleId] = name
    } else {
      delete projectSetupRef.current.roleAssignments[roleId]
    }
    setProjectSetupTick(t => t + 1)
  }

  // ── Crop-carving (#5 UI) ─────────────────────────────────────────────────────
  const [carveMode, setCarveMode] = useState(false)
  const [carveTick, setCarveTick] = useState(0)  // bumped on each drag-move to trigger canvas repaint
  // #115 — forced categorize-on-carve. Non-null while a just-carved region awaits its required
  // category. Shape: { pageId, sourcePageId, pNum, k, rect:{rx,ry,rw,rh} } (rect in source
  // canvas-world coords, drawn as a ghost behind the modal). Blocks new carving until resolved.
  const [carvePending, setCarvePending] = useState(null)
  // #115 — editable region name in the carvePending modal. Pre-filled on modal open with
  // `${sourceName}: Region NN`; written to the region's subLabel on confirm (the standing-outline
  // chip reads subLabel). Cleared → null subLabel (chip falls back to the category label).
  const [carveRegionName, setCarveRegionName] = useState('')

  // ── PDF alignment (Step 6, sub-step 2) ──────────────────────────────────────
  const [alignMode, setAlignMode] = useState(false)
  const alignDragRef = useRef(null)  // { startClientX, startClientY, startTx, startTy, pageId }
  const [alignTick, setAlignTick] = useState(0)  // bump to re-read pageTransformsRef after writes
  const [alignOverHandle, setAlignOverHandle] = useState(false)  // true when cursor hovers a scale handle

  // ── Compass rose ──────────────────────────────────────────────────────────
  const [showCompassOverlay, setShowCompassOverlay] = useState(false)
  const [compassAngleDeg, setCompassAngleDeg] = useState(null)   // null = not yet set
  const [compassCardinal, setCompassCardinal] = useState(null)
  const [compassDraftAngle, setCompassDraftAngle] = useState(0)  // working angle while overlay is open
  const [compassInputVal, setCompassInputVal] = useState('0')    // raw string for the angle text input
  const compassInputFocusedRef = useRef(false)
  const [compassPos, setCompassPos] = useState({ x: null, y: null }) // null = centered on first open
  const compassDragRef = useRef(null)   // { startClientX, startClientY, startPosX, startPosY }
  const compassRotDragRef = useRef(null) // { startClientX, startClientY, startAngle }
  const compassOverlayRef = useRef(null)

  // ── Page categorization (Step 4b) ───────────────────────────────────────────
  const [categorizeMode, setCategorizeMode] = useState(false)
  const [pages, setPages] = useState([])  // [{pageId, pageNum, category, subLabel, subLabelNote}]
  const [catDraftCategory, setCatDraftCategory] = useState(null)
  const [catDraftSubLabel, setCatDraftSubLabel] = useState('')
  const [catDraftNote, setCatDraftNote] = useState('')  // floor-plan optional extra descriptor (no level meaning)
  const [recatPageId, setRecatPageId] = useState(null)    // pageId actively being (re)edited; null = none
  const [catReentry, setCatReentry] = useState(false)     // true = entered via "+ Categorize more pages" (cycle uncategorized only)

  // ── Front-face designation (Step 5c) ────────────────────────────────────────
  // frontFace: project-level, one per building. Reference (indices) is
  // authoritative so it survives shape edits; endpoints are a staleness check.
  // { pageId, shapeIndex, segmentIndex, endpoints: [{x,y},{x,y}] }
  const [frontFace, setFrontFace] = useState(null)
  const [frontFacePromptOpen, setFrontFacePromptOpen] = useState(false)  // popup + canvas pick mode
  const ffHoverRef = useRef(null)  // {shapeIdx, segIdx} hovered during pick

  // ── Elevation edge pick (Step 8, Piece 1) ────────────────────────────────────
  const [elevEdgeMode, setElevEdgeMode] = useState(false)
  const [elevEdgeSourcePageId, setElevEdgeSourcePageId] = useState(null)
  const elevEdgeHoverRef = useRef(null)
  const elevationEdgeRef = useRef({})  // pageId -> {sourcePageId, shapeIndex, segmentIndex, endpointA, endpointB}
  const elevBaseYRef = useRef({})      // pageId -> anchorY (canvas px) after user drags base line into place
  const surfaceAssemblyRef = useRef({}) // wallId -> { tier:'manual'|'library', effectiveUValue, thicknessM, assemblyId, snapshotA, snapshotB }
  const assemblyLibraryRef = useRef({}) // assemblyId -> geometry-scoped contract record { assemblyId, label, assemblyType, totalThicknessM, layers[] }

  // ── Elevation align (Step 8, Piece 2) ────────────────────────────────────────
  // Reuses alignDragRef / alignTick / alignOverHandle for drag machinery.
  const [elevAlignMode, setElevAlignMode] = useState(false)

  const canvasRef = useRef(null)
  const measureRef = useRef(null)
  const pageScalesRef = useRef({})
  const drawVerticesRef = useRef([])
  const mousePosRef = useRef(null)
  const roofGraphRef = useRef({ verts: [], edges: [] }) // connected graph: {verts:[{id,x,y,...}], edges:[{id,aId,bId,role}]}
  const roofVertCounterRef = useRef(0)
  const roofEdgeCounterRef = useRef(0)
  const completedShapesRef = useRef([])
  const snapIncrementRef = useRef(0.1524)
  const pageGridOriginRef = useRef({})
  const pageIdMapRef = useRef({})       // pageIdMapRef.current[pageNum] = pageId
  const pageTransformsRef = useRef({})  // pageTransformsRef.current[pageId] = {...} (Step 4b)
  // Fork B (#5 region-pages): pageCropsRef.current[pageId] = { x, y, w, h } in scaled-sheet pixels.
  // Hot-read store for renderPage (useCallback []; stale-closure-safe via ref). pages[i].crop is the
  // serialized mirror. Absent crop ⇒ renderPage falls back to full-sheet (today's behavior). The crop
  // offset is consumed at rasterization only — never written into stored geometry (recalibration-independence #22).
  const pageCropsRef = useRef({})
  const regionCounterRef = useRef({})   // regionCounterRef.current[pageNum] = K; next region on that sheet is page-N-rK
  const carveDragRef = useRef(null)     // { x1, y1, x2, y2 } while user drags a carve rect; null otherwise
  const floorHeightsRef = useRef({})    // floorHeightsRef.current[floorLevel] = { floorToCeiling, floorSystemAbove }

  // Default edit mode refs
  const editHoverRef = useRef(null)
  const dragStateRef = useRef(null)
  const segLabelRectsRef = useRef([])
  const editUndoStackRef = useRef([])
  const editRedoStackRef = useRef([])

  // Sub-mode refs (always in sync with state)
  const editSubModeRef = useRef(null)
  const moveHoverIdxRef = useRef(null)
  const moveDragRef = useRef(null)
  const combineEligibleRef = useRef(new Set())
  const combineSelectRef = useRef([])
  const splitHoverIdxRef = useRef(null)
  const splitSelectedRef = useRef(null)
  const splitCutRef = useRef([])
  const splitMouseRef = useRef(null)
  const deleteHoverIdxRef = useRef(null)
  const holdTimerRef = useRef(null)
  const drawStartSnapRef = useRef(null)
  const gradeEndSnapRef = useRef(null)       // wall-vertex snap for the last grade-line vertex
  const gradeFloorLineSnapRef = useRef(null) // lowest-floor reference-line snap {x,y} (2c)
  const runItemSnapRef = useRef(null)        // live equipment-item snap during run-path draw (visual only)

  // ── Backdrop resolution tier (#10c) ─────────────────────────────────────
  // NORMAL=1× (default), ENHANCE=2×, ULTRA=4×. Ref holds the live value;
  // backdropTick forces renderPage to re-run after a tier change.
  const BACKDROP_TIERS = ['normal', 'enhance', 'ultra']
  const BACKDROP_MULTIPLIERS = { normal: 1, enhance: 2, ultra: 4 }
  const backdropTierRef = useRef('normal')
  const [backdropTier, setBackdropTier] = useState('normal') // for button render only

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 10
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const panDragRef = useRef(null)   // { startClientX, startClientY, startPanX, startPanY, active }
  const panDidDragRef = useRef(false)
  const canvasWrapperRef = useRef(null)  // the canvas-stack div (clipping viewport)
  const canvasWorldRef = useRef(null)    // the canvas-world div (receives transform)
  const [viewTransform, setViewTransform] = useState({ zoom: 1, panX: 0, panY: 0 })
  const [isPanning, setIsPanning] = useState(false)

  // ── Page ID mapping ──────────────────────────────────────────────────────

  const getPageId = (pageNum) =>
    pageNum != null ? (pageIdMapRef.current[pageNum] ?? `page-${pageNum}`) : null

  // Decode a pageId back to its source PDF sheet number. Every pageId encodes its sheet:
  // 'page-8' → 8, 'page-8-r2' → 8. This is the AUTHORITATIVE pageId→pageNum direction —
  // renderPage derives the sheet to rasterize from the pageId, so logical-page identity is
  // never re-guessed from a (lossy) sheet number. Returns null for a malformed id.
  const pageNumFromId = (pageId) => {
    const m = /^page-(\d+)/.exec(pageId || '')
    return m ? parseInt(m[1], 10) : null
  }

  // Region index within a sheet: 'page-8' → 0 (the full sheet), 'page-8-r2' → 2.
  // Used to order logical pages (sheet, then carve order) for arrow navigation.
  const regionIndexOf = (pageId) => {
    const m = /-r(\d+)$/.exec(pageId || '')
    return m ? parseInt(m[1], 10) : 0
  }

  // Returns a page's floor-level string (one of FLOOR_ORDER) if it is a known level, else null.
  const getFloorLevel = (pageId) => {
    const page = pages.find(p => p.pageId === pageId)
    return (page && isKnownFloorLabel(page.subLabel)) ? page.subLabel : null
  }

  // ── Page rendering ──────────────────────────────────────────────────────

  // resizeMeasure: true on every real page-change (clears measureRef so the
  // geometry repaint useEffect can paint fresh). false on same-page enhance
  // re-renders — measureRef is already the correct size and must NOT be touched
  // (assigning canvas.width clears it; no state change means no repaint fires).
  const renderPage = useCallback(async (pdfDoc, pageId, { resizeMeasure = true } = {}) => {
    setRenderingPage(true)
    try {
      // pageId is the authoritative logical-page identity supplied by the caller.
      // The PDF sheet to rasterize is DERIVED from it — there is no sheet-number
      // fallback that could silently collapse a region onto its source sheet.
      const pageNum = pageNumFromId(pageId)
      const page = await pdfDoc.getPage(pageNum)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const containerWidth = Math.min(window.innerWidth - 48, 1200)
      const viewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / viewport.width  // crop branch only (raster resolution)

      // Backdrop resolution tier: rasterize at multiplier × logical size,
      // but pin the CSS display size to the logical dimensions so the backdrop
      // stays pixel-aligned with measureRef. measureRef stays at logical size —
      // the geometry coordinate space is completely unchanged.
      const mult = BACKDROP_MULTIPLIERS[backdropTierRef.current] ?? 1
      const crop = pageCropsRef.current[pageId] || null

      if (crop) {
        // Fork B (#5) region-page: crop-local coordinate frame. measureRef is sized to the
        // crop box (its (0,0) becomes the crop's top-left), so geometry stored against it is
        // crop-local by construction — no offset is ever added to a stored vertex. The PDF
        // backdrop is rasterized with a viewport offset (-crop.x, -crop.y) so the crop's
        // top-left maps to canvas pixel (0,0); the crop-sized canvas bounds clip the rest
        // (viewport translate + clip). The crop offset is consumed HERE only — it is never
        // written to pageTransformsRef, never folded into getEffectiveScale, never stored on
        // a vertex. The user-driven align transform (pdf-align-layer) composes on top unchanged.
        canvas.width  = Math.round(crop.w * mult)
        canvas.height = Math.round(crop.h * mult)
        // On initial navigation (resizeMeasure:true) bake a display scale into the CSS
        // dimensions so the region always fills the available viewport HEIGHT at uniform scale.
        // Width may overflow the viewport — horizontal scroll (overflow-x:auto on the container)
        // lets the user reach the full width. One consistent rule: height fills, width scrolls.
        // getCanvasPos compensates via c.width/rect.width, so coordinates are unaffected.
        // Enhance re-renders (resizeMeasure:false) keep the existing CSS size unchanged.
        if (resizeMeasure) {
          const availH = Math.max(200, window.innerHeight - 200)
          const displayScale = availH / crop.h
          canvas.style.width  = `${crop.w * displayScale}px`
          canvas.style.height = `${crop.h * displayScale}px`
        }
        if (resizeMeasure && measureRef.current) {
          measureRef.current.width = crop.w
          measureRef.current.height = crop.h
        }
        const cropVp = page.getViewport({ scale: scale * mult, offsetX: -crop.x * mult, offsetY: -crop.y * mult })
        await page.render({ canvasContext: ctx, viewport: cropVp }).promise
      } else {
        // Full-sheet (#117 C-rederive): PIN the coordinate frame to the page's authored footprint
        // (fallback 1200 — the clamp ceiling, proven correct for pre-#117 fixtures) instead of the
        // live-window containerWidth. measureRef, getCanvasPos (c.width), clampToCanvas, every draw
        // path (ghost/shapes/openings/outline/ref-lines/align-handles), and pan all read off
        // measureRef's size, so this single pin lands them ALL at a WINDOW-INDEPENDENT frame —
        // geometry authored at one width registers at any load width, no per-consumer ratio. The
        // window governs only the viewport (initial fit-zoom below), never the frame. Same model as
        // the crop branch above (measureRef sized to crop.w, window-independent).
        const footprint = pageTransformsRef.current[pageId]?.authorScaled ?? 1200
        const pinScale = footprint / viewport.width
        const pinScaled = page.getViewport({ scale: pinScale })
        const hiDpi = page.getViewport({ scale: pinScale * mult })
        canvas.width = hiDpi.width
        canvas.height = hiDpi.height
        canvas.style.width  = `${pinScaled.width}px`
        canvas.style.height = `${pinScaled.height}px`
        if (resizeMeasure && measureRef.current) {
          measureRef.current.width = pinScaled.width
          measureRef.current.height = pinScaled.height
        }
        await page.render({ canvasContext: ctx, viewport: hiDpi }).promise
        // Fit-zoom: the sheet now renders at ~footprint px regardless of window, so scale the
        // VIEWPORT so the whole sheet is visible on load without overflow. Capped at 1 (never zoom
        // past 1:1 on wide windows — matches prior on-load visual width). Viewport-only: it must
        // NOT feed back into the frame. Skipped on enhance re-renders (resizeMeasure:false).
        if (resizeMeasure) {
          const fitZoom = Math.min(1, (window.innerWidth - 48) / footprint)
          zoomRef.current = fitZoom
          setViewTransform(prev => ({ ...prev, zoom: fitZoom }))
        }
      }
      setCurrentPage(pageNum)
      setCurrentPageId(pageId)
    } catch {
      setError('Failed to render page.')
    } finally {
      setRenderingPage(false)
    }
  }, [])

  const startPanDrag = (e) => {
    panDragRef.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startPanX: panRef.current.x, startPanY: panRef.current.y,
      active: false,
    }
  }

  const resetZoomPan = () => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    panDragRef.current = null
    panDidDragRef.current = false
    setViewTransform({ zoom: 1, panX: 0, panY: 0 })
    setIsPanning(false)
  }

  const resetEditState = () => {
    setEditMode(false); setEditSubMode(null)
    setEditCursor('default'); setEditUndoCount(0); setEditRedoCount(0)
    setCombineSelection([]); setSplitSelected(null); setSplitCut([])
    editHoverRef.current = null; dragStateRef.current = null; editUndoStackRef.current = []; editRedoStackRef.current = []
    editSubModeRef.current = null; moveHoverIdxRef.current = null; moveDragRef.current = null
    combineEligibleRef.current = new Set(); combineSelectRef.current = []
    splitHoverIdxRef.current = null; splitSelectedRef.current = null
    splitCutRef.current = []; splitMouseRef.current = null
    deleteHoverIdxRef.current = null
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setLoading(true)
    setPdf(null); setCurrentPage(null); setCurrentPageId(null); setPageCount(0); setFileName(file.name)
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
    setDrawMode(false); setReviewShape(null)
    setShowGradeLinePrompt(false); setGradeLinePending(false); setGradeLineDrawing(false)
    setRunDrawing(false); runItemSnapRef.current = null
    gradeEndSnapRef.current = null; gradeFloorLineSnapRef.current = null
    setPlacingOpeningMode(false); setOpeningCorner1(null); setOpeningDraftShape(null)
    setOpeningDraftKind('window'); setOpeningDraftType(OPENING_TYPES[0]); setOpeningDraftLabel('')
    setOpeningDraftFt(''); setOpeningDraftIn(''); setOpeningDraftHFt(''); setOpeningDraftHIn('')
    setShowDimBasisDialog(false); dimensionBasisRef.current = null; shapeIdCounterRef.current = 0; psCounterRef.current = 0; ssCounterRef.current = 0; priorSnapIncrementRef.current = null
    setPlacingEquipmentItem(false); setPlacingItemType(null); setPlacingInstanceKey(null)
    setPlacingFromEntry(false); setPendingEntryToPlace(null); pendingOpeningsRef.current = []
    projectSetupRef.current = { values: {}, roleAssignments: {} }
    setRoofShapeDraft(null); setRoofTypeDraft(null); setParapetWidthDraft('')
    setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null)
    setRoofLineMode(false); setRoofChainStartId(null)
    roofGraphRef.current = { verts: [], edges: [] }; roofVertCounterRef.current = 0; roofEdgeCounterRef.current = 0
    resetEditState()
    completedShapesRef.current = []; pageScalesRef.current = {}; pageGridOriginRef.current = {}
    pageIdMapRef.current = {}; pageTransformsRef.current = {}; pageCropsRef.current = {}; regionCounterRef.current = {}; floorHeightsRef.current = {}
    setCarveMode(false); carveDragRef.current = null; setCarvePending(null); setCarveRegionName('')
    drawVerticesRef.current = []; mousePosRef.current = null
    setCompassAngleDeg(null); setCompassCardinal(null)
    setCompassDraftAngle(0); setCompassPos({ x: null, y: null })
    setShowCompassOverlay(false)
    setCategorizeMode(false); setPages([])
    setCatDraftCategory(null); setCatDraftSubLabel(''); setCatDraftNote(''); setRecatPageId(null); setCatReentry(false)
    setFrontFace(null); setFrontFacePromptOpen(false); ffHoverRef.current = null
    setElevEdgeMode(false); elevEdgeHoverRef.current = null; setElevEdgeSourcePageId(null)
    elevationEdgeRef.current = {}
    elevBaseYRef.current = {}
    surfaceAssemblyRef.current = {}
    assemblyLibraryRef.current = {}
    setElevAlignMode(false)
    setAlignMode(false); alignDragRef.current = null
    primaryReferenceIdRef.current = null; pageRefParentRef.current = {}
    setShowGhostByPageId({})
    setShowFloorHeights(false); setFhExpandedLevel(null); setFhCustomActive(false); setFhCustomVal(''); setFhCustomSheathing(false)
    setFhFtVals({}); setFhInVals({})
    backdropTierRef.current = 'normal'; setBackdropTier('normal')
    resetZoomPan()
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const newPages = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        pageIdMapRef.current[i] = `page-${i}`
        newPages.push({ pageId: `page-${i}`, pageNum: i, category: null, subLabel: null, subLabelNote: null })
      }
      setPages(newPages)
      setPdf(pdfDoc); setPageCount(pdfDoc.numPages)
      await renderPage(pdfDoc, getPageId(1))
    } catch {
      setError('Failed to load PDF. Make sure the file is a valid PDF.')
    } finally {
      setLoading(false)
    }
  }

  // Navigate to any logical page (root sheet OR region-page) by its stable pageId.
  // This is the SINGLE navigation entry point. renderPage derives the PDF sheet to
  // rasterize from the pageId, so the rendered crop/identity is correct for root
  // sheets and region-pages alike — there is no sheet-number path that could
  // collapse a region onto its source sheet.
  const goToPageId = (pageId) => {
    if (!pdf || renderingPage) return
    if (!pages.some(p => p.pageId === pageId)) return
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
    setDrawMode(false); setReviewShape(null)
    setShowGradeLinePrompt(false); setGradeLinePending(false); setGradeLineDrawing(false)
    setRunDrawing(false); runItemSnapRef.current = null
    gradeEndSnapRef.current = null; gradeFloorLineSnapRef.current = null
    setPlacingOpeningMode(false); setOpeningCorner1(null); setOpeningDraftShape(null)
    setPlacingEquipmentItem(false); setPlacingItemType(null); setPlacingInstanceKey(null)
    setPlacingFromEntry(false); setPendingEntryToPlace(null)
    setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null)
    setRoofLineMode(false); setRoofChainStartId(null)
    resetEditState()
    setElevAlignMode(false)
    setAlignMode(false); alignDragRef.current = null
    setCarveMode(false); carveDragRef.current = null; setCarvePending(null); setCarveRegionName('')
    backdropTierRef.current = 'normal'; setBackdropTier('normal')
    resetZoomPan()
    drawVerticesRef.current = []; mousePosRef.current = null
    renderPage(pdf, pageId)
  }

  // ── Canvas utilities ────────────────────────────────────────────────────

  const clearMeasureCanvas = () => {
    const c = measureRef.current
    if (!c) return
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
  }

  const getCanvasPos = (e) => {
    const c = measureRef.current
    const rect = c.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    }
  }

  const clampToCanvas = (v) => {
    const c = measureRef.current
    if (!c) return v
    return makeVertex(Math.max(0, Math.min(c.width, v.x)), Math.max(0, Math.min(c.height, v.y)))
  }

  const clampT = (origA, origB, tRaw, perpDir) => {
    const c = measureRef.current
    if (!c) return tRaw
    const W = c.width, H = c.height
    let tMin = -Infinity, tMax = Infinity
    for (const pt of [origA, origB]) {
      if (Math.abs(perpDir.x) > 0.001) {
        const t1 = (0 - pt.x) / perpDir.x, t2 = (W - pt.x) / perpDir.x
        tMin = Math.max(tMin, Math.min(t1, t2)); tMax = Math.min(tMax, Math.max(t1, t2))
      }
      if (Math.abs(perpDir.y) > 0.001) {
        const t1 = (0 - pt.y) / perpDir.y, t2 = (H - pt.y) / perpDir.y
        tMin = Math.max(tMin, Math.min(t1, t2)); tMax = Math.min(tMax, Math.max(t1, t2))
      }
    }
    return Math.max(tMin, Math.min(tMax, tRaw))
  }

  const snapToGrid = (pos, pageId) => {
    if (!snapDist) return pos
    const scale = getEffectiveScale(pageId)
    if (!scale) return pos
    const snapPx = metersToPx(snapIncrementRef.current, { [pageId]: scale }, pageId)
    if (!snapPx || snapPx <= 0) return pos
    const origin = pageGridOriginRef.current[pageId] || { x: 0, y: 0 }
    return makeVertex(
      origin.x + Math.round((pos.x - origin.x) / snapPx) * snapPx,
      origin.y + Math.round((pos.y - origin.y) / snapPx) * snapPx,
    )
  }

  // ── Draw locked shapes (base layer) ─────────────────────────────────────

  useEffect(() => {
    if (calibMode || drawMode || editMode) return
    const c = measureRef.current
    if (!c || !currentPage) return
    redrawFrontFaceLayer(null)
  }, [calibMode, drawMode, editMode, currentPage, currentPageId, frontFace, frontFacePromptOpen, alignMode, showGhostByPageId, alignTick, elevEdgeMode, elevEdgeSourcePageId, elevAlignMode, floorHeightsTick, carveMode, carveTick, carvePending])

  // ── Calibration ──────────────────────────────────────────────────────────

  const exitCalibMode = () => {
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
  }

  const drawCalibState = (points) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    if (points.length >= 1) {
      if (points.length === 2) {
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y)
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.setLineDash([6, 3])
        ctx.stroke(); ctx.setLineDash([])
      }
      points.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'; ctx.fill()
        ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.5; ctx.stroke()
        ctx.fillStyle = '#92400e'; ctx.font = 'bold 12px system-ui, sans-serif'
        ctx.fillText(i === 0 ? 'A' : 'B', p.x + 8, p.y - 6)
      })
    }
  }

  const handleConfirmScale = () => {
    const [p1, p2] = calibPoints
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    const pixelDist = Math.sqrt(dx * dx + dy * dy)
    let realWorldMeters = 0
    if (scaleUnit === 'imperial') {
      const feet = parseFloat(feetVal) || 0, inches = parseFloat(inchesVal) || 0
      if (feet === 0 && inches === 0) { setScaleError('Enter a dimension greater than zero.'); return }
      realWorldMeters = feetInchesToMeters(feet, inches)
    } else {
      realWorldMeters = parseFloat(metersVal) || 0
      if (realWorldMeters <= 0) { setScaleError('Enter a dimension greater than zero.'); return }
    }
    if (pixelDist < 5) { setScaleError('Reference line is too short.'); return }
    pageScalesRef.current[currentPageId] = {
      pxPerMeter: pixelDist / realWorldMeters,
      displayUnit: scaleUnit === 'imperial' ? 'ft' : 'm',
    }
    if (primaryReferenceIdRef.current === null) primaryReferenceIdRef.current = currentPageId
    delete pageGridOriginRef.current[currentPageId]
    setShowScaleDialog(false); setCalibMode(false); setCalibPoints([]); setScaleError('')
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  const nextShapeId = () => `sh-${shapeIdCounterRef.current++}`
  const nextPsId    = () => `ps-${psCounterRef.current++}`
  const nextSsId    = () => `ss-${ssCounterRef.current++}`
  const isOpening = (s) => s.shapeKind === 'window' || s.shapeKind === 'door'
  const isEquipmentItem = (s) => s.shapeKind === 'equipment-item'
  const isRun = (s) => s.shapeKind === 'run'

  const ONE_INCH_M = inchesToMeters(1)
  const saveAndDefaultSnapIncrement = () => {
    priorSnapIncrementRef.current = snapIncrementRef.current
    snapIncrementRef.current = ONE_INCH_M
    setSnapIncrement(ONE_INCH_M)
  }
  const restoreSnapIncrement = () => {
    if (priorSnapIncrementRef.current !== null) {
      snapIncrementRef.current = priorSnapIncrementRef.current
      setSnapIncrement(priorSnapIncrementRef.current)
      priorSnapIncrementRef.current = null
    }
  }

  const exitDrawMode = () => {
    setDrawMode(false); setReviewShape(null)
    setShowGradeLinePrompt(false); setGradeLinePending(false); setGradeLineDrawing(false)
    setRunDrawing(false); runItemSnapRef.current = null
    drawVerticesRef.current = []; setDrawVertexCount(0)
    mousePosRef.current = null; drawStartSnapRef.current = null; gradeEndSnapRef.current = null; gradeFloorLineSnapRef.current = null
    snapIncrementRef.current = 0.1524; setSnapIncrement(0.1524)
  }

  // Returns all vertices from currently visible geometry on the given page.
  // Written generically so it extends automatically when reference/ghost geometry is added.
  const getVisibleVertices = (pageId) =>
    completedShapesRef.current
      .filter(s => s.pageId === pageId)
      .flatMap(s => s.vertices)

  // Returns wall-polygon vertices with global identity for grade-line endpoint binding.
  // Excludes grade-line shapes so a grade end cannot bind to another grade line.
  const getWallVerticesWithId = (pageId) =>
    completedShapesRef.current.flatMap((s, shapeIdx) =>
      s.pageId === pageId && !s.shapeKind
        ? s.vertices.map((v, vertIdx) => ({ x: v.x, y: v.y, shapeIdx, vertIdx }))
        : []
    )

  // ── Run-path helpers (§8.2 step 4) ──────────────────────────────────────────

  // Find the equipment item (if any) within EQUIP_HIT_RADIUS of pos on the current page.
  // Used during run draw mousemove for the live visual snap indicator.
  const findEquipSnapTarget = (pos) => {
    const EQUIP_HIT_RADIUS = 14
    const shapes = completedShapesRef.current
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]
      if (!isEquipmentItem(s) || s.pageId !== currentPageId) continue
      const v = s.vertices[0]
      if (v && Math.hypot(pos.x - v.x, pos.y - v.y) <= EQUIP_HIT_RADIUS) return s
    }
    return null
  }

  // Given a new (uncommitted) run and the current shapes array, characterize the run if its
  // endpoint items are in the pair→category map, writing satisfaction into both endpoint items.
  // Returns { run: finalRun, updatedShapes } — immutable, no mutation of inputs.
  const buildCharacterizedRun = (run, currentShapes) => {
    const EQUIP_HIT_RADIUS = 14
    const slots = run.pointSlots
    if (!slots || slots.length < 2) return { run, updatedShapes: currentShapes }
    const findItemAtSlot = (slot) => {
      for (let i = currentShapes.length - 1; i >= 0; i--) {
        const s = currentShapes[i]
        if (!isEquipmentItem(s) || s.pageId !== run.pageId) continue
        const iv = s.vertices[0]
        if (iv && Math.hypot(slot.x - iv.x, slot.y - iv.y) <= EQUIP_HIT_RADIUS) return s
      }
      return null
    }
    const startItem = findItemAtSlot(slots[0])
    const endItem   = findItemAtSlot(slots[slots.length - 1])
    const startId = startItem ? startItem.id : null
    const endId   = endItem   ? endItem.id   : null
    const entry = (startItem && endItem)
      ? resolveRunPairEntry(startItem.itemType, endItem.itemType)
      : null
    // Write itemRef into endpoint point-slots; write category into every span-slot
    const newPointSlots = slots.map((ps, i) => {
      if (i === 0 && startId) return { ...ps, itemRef: startId }
      if (i === slots.length - 1 && endId) return { ...ps, itemRef: endId }
      return ps
    })
    const newSpanSlots = run.spanSlots.map(ss => ({ ...ss, category: entry ? entry.category : null }))
    const finalRun = { ...run, pointSlots: newPointSlots, spanSlots: newSpanSlots }
    if (!entry) return { run: finalRun, updatedShapes: currentShapes }
    // Write satisfaction into both endpoint items
    const updatedShapes = currentShapes.map(s => {
      if (!isEquipmentItem(s)) return s
      if (s.id !== startId && s.id !== endId) return s
      let newObState = null
      for (const { itemType, obligationId } of entry.satisfies) {
        if (s.itemType === itemType) {
          if (!newObState) newObState = { ...(s.obligationState || {}) }
          newObState[obligationId] = finalRun.id
        }
      }
      return newObState ? { ...s, obligationState: newObState } : s
    })
    return { run: finalRun, updatedShapes }
  }

  // Reverse the satisfaction a characterized run wrote to its endpoint items.
  // Accepts the shapes array to mutate-immutably. Returns updated shapes.
  const clearRunSatisfaction = (run, currentShapes) => {
    const category = run.spanSlots?.[0]?.category ?? null
    if (!category) return currentShapes
    const entry = RUN_PAIR_MAP.find(e => e.category === category)
    if (!entry) return currentShapes
    const start = run.pointSlots?.[0]?.itemRef ?? null
    const end   = run.pointSlots?.[run.pointSlots.length - 1]?.itemRef ?? null
    return currentShapes.map(s => {
      if (!isEquipmentItem(s)) return s
      if (s.id !== start && s.id !== end) return s
      let newObState = null
      for (const { itemType, obligationId } of entry.satisfies) {
        if (s.itemType === itemType && (s.obligationState || {})[obligationId] === run.id) {
          if (!newObState) newObState = { ...(s.obligationState || {}) }
          newObState[obligationId] = null
        }
      }
      return newObState ? { ...s, obligationState: newObState } : s
    })
  }

  // Returns the canvas-pixel Y of the lowest-floor reference line for the current elevation page,
  // or null if the gate (edge + scale + fhZStack) is not met. Same formula as drawElevRefLines.
  const getLowestFloorLineY = () => {
    if (!pageScalesRef.current[currentPageId]?.pxPerMeter) return null
    const edgeData = resolveElevEdge(currentPageId)
    if (!edgeData) return null
    if (!fhZStack.length) return null
    return elevBaseYRef.current[currentPageId] ?? (edgeData.A.y + edgeData.B.y) / 2
  }

  // Returns the effective scale entry { pxPerMeter, displayUnit } for a page:
  // its own calibration if set; else, if confirmed, follows pageRefParentRef chain to
  // the primary (the root of the reference tree, which has own calibration).
  const getEffectiveScale = (pageId, _visited) => {
    const own = pageScalesRef.current[pageId]
    if (own) return own
    const t = pageTransformsRef.current[pageId]
    if (!t || !t.confirmed) return null
    const parentId = pageRefParentRef.current[pageId]  // written at confirm time
    if (!parentId) return null
    const visited = _visited || new Set()
    if (visited.has(parentId)) return null  // cycle guard — now real work (user-defined tree)
    visited.add(pageId)
    return getEffectiveScale(parentId, visited)
  }

  // Derives the building-fixed world origin in METERS: min-x/min-y corner of the lowest
  // present floor's wall polygons, each vertex converted through its own page's pxToMeters.
  // Re-derived on every call — never stored, stable under recalibration (#22).
  // Returns { x, y, originPageId } in meters, or null if gate not met.
  const getWorldOriginM = () => {
    const presentLevels = pages
      .filter(p => p.category === 'floor-plan' && isKnownFloorLabel(p.subLabel))
      .map(p => p.subLabel)
    if (!presentLevels.length) return null
    const zStack = accumulateZ(floorHeightsRef.current, presentLevels, FLOOR_ORDER)
    if (!zStack.length) return null
    const lowestLevel = zStack[0].level
    const lowestPage = pages.find(p => p.category === 'floor-plan' && p.subLabel === lowestLevel)
    if (!lowestPage) return null
    const scale = getEffectiveScale(lowestPage.pageId)
    if (!scale) return null
    const shapes = completedShapesRef.current.filter(
      s => s.pageId === lowestPage.pageId && s.status === 'locked' && !s.shapeKind
    )
    if (!shapes.length) return null
    let minX = Infinity, minY = Infinity
    const scalesArg = { [lowestPage.pageId]: scale }
    for (const s of shapes) for (const v of s.vertices) {
      const mx = pxToMeters(v.x, scalesArg, lowestPage.pageId)
      const my = pxToMeters(v.y, scalesArg, lowestPage.pageId)
      if (mx != null && mx < minX) minX = mx
      if (my != null && my < minY) minY = my
    }
    if (!isFinite(minX) || !isFinite(minY)) return null
    return { x: minX, y: minY, originPageId: lowestPage.pageId }
  }

  // Projects a canvas-space vertex on pageId into building-fixed world XY in METERS.
  // Each page converts its own vertices via its own pxToMeters (through effective scale),
  // then subtracts the meters-expressed building origin. Cross-page alignment is identity
  // because the user traces on top of the aligned ghost — translation/rotation are baked
  // into the traced coordinates at trace time. If a future workflow places geometry
  // out-of-register (not traced over the ghost), an explicit offset would re-enter here.
  // Z is null here; use elevYToWorldZ for elevation pages.
  // Returns { x, y, z: null } in meters, or null if scale/origin gate not met.
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

  const applySnap = (rawPos, lastVertex, useAngle, useDist, pageId) => {
    if (!lastVertex) return rawPos
    let x = rawPos.x, y = rawPos.y
    if (useAngle) {
      const dx = x - lastVertex.x, dy = y - lastVertex.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0) {
        const angle = Math.atan2(dy, dx)
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
        x = lastVertex.x + dist * Math.cos(snapped)
        y = lastVertex.y + dist * Math.sin(snapped)
      }
    }
    if (useDist) {
      const scale = getEffectiveScale(pageId)
      if (scale) {
        const snapPx = metersToPx(snapIncrementRef.current, { [pageId]: scale }, pageId)
        if (snapPx && snapPx > 0) {
          const origin = pageGridOriginRef.current[pageId] || { x: 0, y: 0 }
          x = origin.x + Math.round((x - origin.x) / snapPx) * snapPx
          y = origin.y + Math.round((y - origin.y) / snapPx) * snapPx
        }
      }
    }
    return makeVertex(x, y)
  }

  const getAlignmentSnap = (mousePos, vertices) => {
    let x = mousePos.x, y = mousePos.y
    const guides = []
    let bestH = null, bestV = null
    for (const v of vertices) {
      const dy = Math.abs(mousePos.y - v.y), dx = Math.abs(mousePos.x - v.x)
      if (dy <= ALIGN_TOLERANCE && (!bestH || dy < bestH.dy)) bestH = { vertex: v, dy }
      if (dx <= ALIGN_TOLERANCE && (!bestV || dx < bestV.dx)) bestV = { vertex: v, dx }
    }
    if (bestH) { y = bestH.vertex.y; guides.push({ axis: 'h', vertex: bestH.vertex }) }
    if (bestV) { x = bestV.vertex.x; guides.push({ axis: 'v', vertex: bestV.vertex }) }
    return { snappedPos: makeVertex(x, y), guides }
  }

  const computeFinalSnapPos = (rawPos, vertices, useAngle, useDist, pageId) => {
    const last = vertices.length > 0 ? vertices[vertices.length - 1] : null
    const { snappedPos: alignSnapped, guides } = getAlignmentSnap(rawPos, vertices)
    if (guides.length > 0) return { pos: applySnap(alignSnapped, last, false, useDist, pageId), guides }
    return { pos: applySnap(rawPos, last, useAngle, useDist, pageId), guides }
  }

  // ── Edit canvas drawing ──────────────────────────────────────────────────

  const drawEditCanvas = (hoverState = null, previewOverride = null) => {
    const c = measureRef.current
    if (!c || !currentPage) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    segLabelRectsRef.current = []

    const subMode = editSubModeRef.current

    // ── Move sub-mode ─────────────────────────────────────────────────────
    if (subMode === 'move') {
      // Ghost reference (floor below) — drawn BELOW locked shapes
      if (showGhost) {
        const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
        if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
      }

      const moveHoverIdx = moveHoverIdxRef.current
      const drag = moveDragRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageId !== currentPageId) return
        if (shape.shapeKind === 'grade-line') return
        if (isEquipmentItem(shape)) return
        if (isRun(shape)) return
        ctx.save()
        const isDragged = drag && drag.shapeIdx === idx
        const verts = isDragged && drag.previewVerts ? drag.previewVerts : shape.vertices
        const style = isDragged ? 'drag-preview' : (idx === moveHoverIdx ? 'hover' : 'normal')
        if (isOpening(shape)) drawOpeningPoly(ctx, verts, style)
        else drawShapePoly(ctx, verts, style)
        ctx.restore()
      })
      drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
      drawRunPaths(ctx, completedShapesRef.current, currentPageId)
      // Equipment items in move mode: apply drag preview to the moved item
      const eqMoveShapes = completedShapesRef.current.map((s, idx) => {
        if (!isEquipmentItem(s)) return s
        if (drag && drag.shapeIdx === idx && drag.previewVerts) return { ...s, vertices: drag.previewVerts }
        return s
      })
      drawEquipmentItemShapes(ctx, eqMoveShapes, currentPageId, zoomRef.current)
      drawElevRefLines(ctx)
      return
    }

    // ── Combine sub-mode ──────────────────────────────────────────────────
    if (subMode === 'combine') {
      // Ghost reference (floor below) — drawn BELOW locked shapes
      if (showGhost) {
        const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
        if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
      }

      const eligible = combineEligibleRef.current
      const sel = combineSelectRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageId !== currentPageId) return
        if (shape.shapeKind === 'grade-line') return
        if (isRun(shape)) return
        if (isEquipmentItem(shape)) return
        ctx.save()
        if (isOpening(shape)) { ctx.globalAlpha = 0.3 } // openings not eligible; dim them
        else if (!eligible.has(idx)) ctx.globalAlpha = 0.2
        const style = sel.includes(idx) ? 'selected' : 'normal'
        if (isOpening(shape)) drawOpeningPoly(ctx, shape.vertices, 'normal')
        else drawShapePoly(ctx, shape.vertices, style)
        ctx.restore()
      })
      // Highlight shared overlap segment if 2 shapes selected
      if (sel.length === 2) {
        const shapes = completedShapesRef.current
        const ov = findCollinearOverlap(shapes[sel[0]].vertices, shapes[sel[1]].vertices)
        if (ov) {
          ctx.beginPath(); ctx.moveTo(ov.P_start.x, ov.P_start.y); ctx.lineTo(ov.P_end.x, ov.P_end.y)
          ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 4; ctx.stroke()
        }
      }
      drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
      drawRunPaths(ctx, completedShapesRef.current, currentPageId)
      drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
      drawElevRefLines(ctx)
      return
    }

    // ── Delete sub-mode ───────────────────────────────────────────────────
    if (subMode === 'delete') {
      // Ghost reference (floor below) — drawn BELOW locked shapes
      if (showGhost) {
        const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
        if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
      }

      const hoverIdx = deleteHoverIdxRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageId !== currentPageId) return
        if (shape.shapeKind === 'grade-line') return
        if (isRun(shape)) return
        if (isEquipmentItem(shape)) return
        ctx.save()
        const style = idx === hoverIdx ? 'hover' : 'normal'
        if (isOpening(shape)) drawOpeningPoly(ctx, shape.vertices, style)
        else drawShapePoly(ctx, shape.vertices, style)
        ctx.restore()
      })
      drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
      drawRunPaths(ctx, completedShapesRef.current, currentPageId)
      drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
      // Hover ring for hovered equipment item in delete mode
      if (hoverIdx !== null) {
        const hs = completedShapesRef.current[hoverIdx]
        if (hs && isEquipmentItem(hs) && hs.pageId === currentPageId) {
          const v = hs.vertices[0]
          if (v) {
            const r = 18 / zoomRef.current
            ctx.save()
            ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, Math.PI * 2)
            ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3 / zoomRef.current; ctx.globalAlpha = 0.9
            ctx.stroke()
            ctx.restore()
          }
        }
      }
      drawElevRefLines(ctx)
      return
    }

    // ── Split sub-mode ────────────────────────────────────────────────────
    if (subMode === 'split') {
      // Ghost reference (floor below) — drawn BELOW locked shapes
      if (showGhost) {
        const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
        if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
      }

      const selIdx = splitSelectedRef.current
      const hoverIdx = splitHoverIdxRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageId !== currentPageId) return
        if (shape.shapeKind === 'grade-line') return
        if (isRun(shape)) return
        if (isEquipmentItem(shape)) return
        ctx.save()
        if (isOpening(shape)) { ctx.globalAlpha = 0.3; drawOpeningPoly(ctx, shape.vertices, 'normal'); ctx.restore(); return }
        if (selIdx !== null && idx !== selIdx) ctx.globalAlpha = 0.2
        const style = idx === selIdx ? 'normal' : (selIdx === null && idx === hoverIdx ? 'hover' : 'normal')
        drawShapePoly(ctx, shape.vertices, style)
        ctx.restore()
      })
      // Draw cut line / rubber band
      const cut = splitCutRef.current
      const mouse = splitMouseRef.current
      if (cut.length >= 1) {
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
        ctx.beginPath(); ctx.moveTo(cut[0].x, cut[0].y)
        if (cut.length >= 2) ctx.lineTo(cut[1].x, cut[1].y)
        else if (mouse) ctx.lineTo(mouse.x, mouse.y)
        ctx.stroke(); ctx.setLineDash([])
        cut.forEach(p => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#dc2626'; ctx.fill()
        })
      }
      drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
      drawRunPaths(ctx, completedShapesRef.current, currentPageId)
      drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
      drawElevRefLines(ctx)
      return
    }

    // ── Default edit mode (vertex/segment drag, labels) ───────────────────
    // Ghost reference (floor below) — drawn BELOW locked shapes
    if (showGhost) {
      const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
      if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
    }

    completedShapesRef.current
      .forEach((shape, shapeIdx) => {
        if (shape.pageId !== currentPageId) return
        if (shape.shapeKind === 'grade-line') return
        if (isRun(shape)) return
        if (isEquipmentItem(shape)) return
        const verts = (previewOverride && previewOverride.shapeIdx === shapeIdx)
          ? previewOverride.vertices : shape.vertices
        const N = verts.length
        if (N < 3) return

        const opening = isOpening(shape)
        const basePolyFill = opening ? 'rgba(6,182,212,0.12)' : 'rgba(59,130,246,0.1)'
        const baseSegStroke = opening ? '#0891b2' : '#2563eb'
        const baseLabelBg = opening ? 'rgba(207,250,254,0.92)' : 'rgba(255,255,255,0.92)'
        const baseLabelFg = opening ? '#164e63' : '#1d4ed8'
        const baseVertFill = opening ? '#06b6d4' : '#3b82f6'

        ctx.beginPath()
        ctx.moveTo(verts[0].x, verts[0].y)
        for (let i = 1; i < N; i++) ctx.lineTo(verts[i].x, verts[i].y)
        ctx.closePath()
        ctx.fillStyle = basePolyFill; ctx.fill()

        for (let segIdx = 0; segIdx < N; segIdx++) {
          const a = verts[segIdx], b = verts[(segIdx + 1) % N]
          const isSegHover = hoverState?.type === 'segment' &&
            hoverState.shapeIdx === shapeIdx && hoverState.segIdx === segIdx

          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = isSegHover ? '#f59e0b' : baseSegStroke
          ctx.lineWidth = isSegHover ? 3 : 1.5
          ctx.lineJoin = 'round'; ctx.stroke()

          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const lenPx = Math.hypot(b.x - a.x, b.y - a.y)
          const label = pxToDisplayDist(lenPx, { [currentPageId]: getEffectiveScale(currentPageId) }, currentPageId)
          if (label) {
            ctx.font = '12px system-ui, sans-serif'
            const tw = ctx.measureText(label).width, pad = 3
            const lx = mx - tw / 2 - pad, ly = my - 15, lw = tw + pad * 2, lh = 18
            ctx.fillStyle = isSegHover ? 'rgba(254,243,199,0.97)' : baseLabelBg
            ctx.fillRect(lx, ly, lw, lh)
            ctx.fillStyle = isSegHover ? '#92400e' : baseLabelFg
            ctx.fillText(label, mx - tw / 2, my - 1)
            segLabelRectsRef.current.push({ shapeIdx, segIdx, x: lx, y: ly, w: lw, h: lh, mx, my, label })
          }
        }

        verts.forEach((v, i) => {
          const isVertHover = hoverState?.type === 'vertex' &&
            hoverState.shapeIdx === shapeIdx && hoverState.vertIdx === i
          const ds = dragStateRef.current
          const isMergeTarget = ds?.type === 'vertexDrag' && ds.shapeIdx === shapeIdx &&
            ds.mergeTarget === i && i !== ds.vertIdx
          ctx.beginPath()
          ctx.arc(v.x, v.y, isMergeTarget ? 9 : (isVertHover ? 7 : 5), 0, Math.PI * 2)
          ctx.fillStyle = isMergeTarget ? '#dc2626' : (isVertHover ? '#f59e0b' : baseVertFill)
          ctx.fill()
          ctx.strokeStyle = 'white'; ctx.lineWidth = isMergeTarget ? 2.5 : (isVertHover ? 2 : 1.5); ctx.stroke()
        })
      })

    drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
    drawRunPaths(ctx, completedShapesRef.current, currentPageId)
    drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
    drawElevRefLines(ctx)
  }

  useEffect(() => {
    if (editMode && currentPage) drawEditCanvas(editHoverRef.current)
  }, [editMode, currentPage, currentPageId, alignMode, showGhostByPageId, alignTick, floorHeightsTick])

  useEffect(() => {
    if (!drawMode || !currentPage) return
    if (roofShapeDraft) {
      redrawReviewCanvas(roofShapeDraft, currentPageId)
    } else {
      redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, snapDist, currentPageId)
    }
  }, [drawMode, currentPage, currentPageId, alignMode, showGhostByPageId, alignTick, snapAngle, snapDist, roofShapeDraft, floorHeightsTick])


  // ── Edit hit tests ───────────────────────────────────────────────────────

  const hitTestVertices = (pos) => {
    let best = null, bestDist = HIT_VERT_DIST
    completedShapesRef.current.forEach((shape, shapeIdx) => {
      if (shape.pageId !== currentPageId) return
      if (isEquipmentItem(shape)) return
      if (isRun(shape)) return
      shape.vertices.forEach((v, vertIdx) => {
        const d = Math.hypot(pos.x - v.x, pos.y - v.y)
        if (d < bestDist) { bestDist = d; best = { shapeIdx, vertIdx } }
      })
    })
    return best
  }

  const hitTestSegments = (pos) => {
    let best = null, bestDist = HIT_SEG_DIST
    completedShapesRef.current.forEach((shape, shapeIdx) => {
      if (shape.pageId !== currentPageId) return
      if (shape.shapeKind === 'grade-line') return
      if (isEquipmentItem(shape)) return
      if (isRun(shape)) return
      const verts = shape.vertices
      for (let segIdx = 0; segIdx < verts.length; segIdx++) {
        const d = distToSegment(pos, verts[segIdx], verts[(segIdx + 1) % verts.length])
        if (d < bestDist) { bestDist = d; best = { shapeIdx, segIdx } }
      }
    })
    return best
  }

  const hitTestShapeBody = (pos) => {
    const shapes = completedShapesRef.current
    const EQUIP_HIT_RADIUS = 14
    // Equipment items: proximity to single vertex (checked first, top-to-bottom in z-order)
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (!isEquipmentItem(shapes[i])) continue
      if (shapes[i].pageId !== currentPageId) continue
      const v = shapes[i].vertices[0]
      if (v && Math.hypot(pos.x - v.x, pos.y - v.y) <= EQUIP_HIT_RADIUS) return i
    }
    // Runs: segment proximity (open polylines have no body to hit-test via pointInPolygon)
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (!isRun(shapes[i])) continue
      if (shapes[i].pageId !== currentPageId) continue
      const slots = shapes[i].pointSlots
      if (!slots) continue
      for (let j = 0; j < slots.length - 1; j++) {
        if (distToSegment(pos, slots[j], slots[j + 1]) <= HIT_SEG_DIST) return i
      }
    }
    // Polygons and openings: pointInPolygon
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapes[i].shapeKind === 'grade-line') continue
      if (isEquipmentItem(shapes[i])) continue
      if (isRun(shapes[i])) continue
      if (shapes[i].pageId === currentPageId && pointInPolygon(pos, shapes[i].vertices)) return i
    }
    return null
  }

  // ── Edit: undo ───────────────────────────────────────────────────────────

  const snapshotShapes = () =>
    completedShapesRef.current.map(s => ({ ...s, vertices: s.vertices.map(v => ({ ...v })) }))

  const pushUndo = () => {
    editUndoStackRef.current.push(snapshotShapes())
    setEditUndoCount(c => c + 1)
    // Any new edit clears the redo stack
    editRedoStackRef.current = []
    setEditRedoCount(0)
  }

  const handleEditUndo = () => {
    const prev = editUndoStackRef.current.pop()
    if (!prev) return
    // Save current state to redo stack before reverting
    editRedoStackRef.current.push(snapshotShapes())
    setEditRedoCount(c => c + 1)
    completedShapesRef.current = prev
    setEditUndoCount(c => c - 1)
    if (editSubModeRef.current === 'combine') {
      combineEligibleRef.current = getEligibleShapes(completedShapesRef.current, currentPageId)
      combineSelectRef.current = []; setCombineSelection([])
    }
    drawEditCanvas(editHoverRef.current)
  }

  const handleEditRedo = () => {
    const next = editRedoStackRef.current.pop()
    if (!next) return
    // Save current state to undo stack before re-applying
    editUndoStackRef.current.push(snapshotShapes())
    setEditUndoCount(c => c + 1)
    completedShapesRef.current = next
    setEditRedoCount(c => c - 1)
    if (editSubModeRef.current === 'combine') {
      combineEligibleRef.current = getEligibleShapes(completedShapesRef.current, currentPageId)
      combineSelectRef.current = []; setCombineSelection([])
    }
    drawEditCanvas(editHoverRef.current)
  }

  // ── Sub-mode lifecycle ───────────────────────────────────────────────────

  const exitSubMode = () => {
    editSubModeRef.current = null; setEditSubMode(null)
    moveHoverIdxRef.current = null; moveDragRef.current = null
    combineEligibleRef.current = new Set(); combineSelectRef.current = []; setCombineSelection([])
    splitHoverIdxRef.current = null; splitSelectedRef.current = null
    splitCutRef.current = []; splitMouseRef.current = null
    setSplitSelected(null); setSplitCut([])
    deleteHoverIdxRef.current = null
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    setEditCursor('default')
    drawEditCanvas(editHoverRef.current)
  }

  const enterDeleteMode = () => {
    editSubModeRef.current = 'delete'; setEditSubMode('delete')
    deleteHoverIdxRef.current = null
    setEditCursor('default'); drawEditCanvas()
  }

  const enterMoveMode = () => {
    editSubModeRef.current = 'move'; setEditSubMode('move')
    setEditCursor('default'); drawEditCanvas()
  }

  const enterCombineMode = () => {
    const eligible = getEligibleShapes(completedShapesRef.current, currentPageId)
    combineEligibleRef.current = eligible
    combineSelectRef.current = []; setCombineSelection([])
    editSubModeRef.current = 'combine'; setEditSubMode('combine')
    setEditCursor('default'); drawEditCanvas()
  }

  const enterSplitMode = () => {
    editSubModeRef.current = 'split'; setEditSubMode('split')
    splitSelectedRef.current = null; splitCutRef.current = []; splitMouseRef.current = null
    setSplitSelected(null); setSplitCut([])
    setEditCursor('default'); drawEditCanvas()
  }

  // ── Combine operations ───────────────────────────────────────────────────

  const handleCombineClick = (pos) => {
    const shapes = completedShapesRef.current
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]
      if (s.pageId !== currentPageId) continue
      if (!combineEligibleRef.current.has(i)) continue
      if (!pointInPolygon(pos, s.vertices)) continue
      const sel = combineSelectRef.current
      const newSel = sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i]
      combineSelectRef.current = newSel; setCombineSelection([...newSel]); setCombineError('')
      drawEditCanvas(); return
    }
  }

  const applyMerge = () => {
    const [idxA, idxB] = combineSelectRef.current
    const shapes = completedShapesRef.current
    const ov = findCollinearOverlap(shapes[idxA].vertices, shapes[idxB].vertices)
    if (!ov) {
      setCombineError('No collinear overlapping edge — shapes must share a common edge segment to combine.')
      return
    }
    setCombineError('')
    // Insert overlap boundary vertices into each shape as needed, then splice the shared portion out.
    // Point order for B depends on winding: anti-parallel (reversed) = P_end first;
    // parallel (same) = P_start first, because B's edge walks in the same direction as A's.
    const { newVerts: vertsA, newSegIdx: segA } = prepareForMerge(
      shapes[idxA].vertices, ov.segA, ov.P_start, ov.P_end
    )
    const { newVerts: vertsB, newSegIdx: segB } = ov.dir === 'reversed'
      ? prepareForMerge(shapes[idxB].vertices, ov.segB, ov.P_end, ov.P_start)
      : prepareForMerge(shapes[idxB].vertices, ov.segB, ov.P_start, ov.P_end)
    pushUndo()
    const merged = mergePolygons(vertsA, vertsB, segA, segB, ov.dir)
    const newShapes = shapes
      .map((s, i) => i === idxA ? { ...s, vertices: merged } : s)
      .filter((_, i) => i !== idxB)
    completedShapesRef.current = newShapes
    combineEligibleRef.current = getEligibleShapes(completedShapesRef.current, currentPageId)
    combineSelectRef.current = []; setCombineSelection([])
    drawEditCanvas()
  }

  // ── Split operations ─────────────────────────────────────────────────────

  const handleSplitClick = (pos, shiftKey = false) => {
    const selIdx = splitSelectedRef.current
    if (selIdx === null) {
      const idx = hitTestShapeBody(pos)
      if (idx !== null && !isOpening(completedShapesRef.current[idx])) {
        splitSelectedRef.current = idx; setSplitSelected(idx)
        setEditCursor('crosshair'); drawEditCanvas()
      }
      return
    }
    const cut = splitCutRef.current
    if (cut.length < 2) {
      let snapped = snapToGrid(pos, currentPageId)
      // Axis snap second cut point relative to first (unless Shift held)
      if (cut.length === 1 && !shiftKey) {
        snapped = snapToGrid(applyAxisSnap(pos, cut[0]), currentPageId)
      }
      const newCut = [...cut, snapped]
      splitCutRef.current = newCut; setSplitCut([...newCut])
      drawEditCanvas()
    }
  }

  const applySplit = () => {
    const shapeIdx = splitSelectedRef.current
    const cut = splitCutRef.current
    if (shapeIdx === null || cut.length < 2) return
    const shape = completedShapesRef.current[shapeIdx]
    const result = splitPolygon(shape.vertices, cut[0], cut[1])
    if (!result) return
    pushUndo()
    const [polyA, polyB] = result
    const newShapes = [
      ...completedShapesRef.current.slice(0, shapeIdx),
      { ...shape, vertices: polyA },
      { ...shape, vertices: polyB },
      ...completedShapesRef.current.slice(shapeIdx + 1),
    ]
    completedShapesRef.current = newShapes
    splitSelectedRef.current = null; splitCutRef.current = []; splitMouseRef.current = null
    setSplitSelected(null); setSplitCut([])
    drawEditCanvas()
  }

  // ── Exit edit mode ───────────────────────────────────────────────────────

  const exitEditMode = () => {
    restoreSnapIncrement()
    resetEditState()
  }

  // ── Segment move helpers ─────────────────────────────────────────────────

  const applySegmentMove = (vertices, segIdx, tPx, perpDir) => {
    const N = vertices.length
    const newVerts = vertices.map(v => ({ ...v }))
    const iA = segIdx, iB = (segIdx + 1) % N
    newVerts[iA] = makeVertex(vertices[iA].x + tPx * perpDir.x, vertices[iA].y + tPx * perpDir.y)
    newVerts[iB] = makeVertex(vertices[iB].x + tPx * perpDir.x, vertices[iB].y + tPx * perpDir.y)
    return newVerts
  }

  const snapPerp = (tRaw) => {
    if (!snapDist) return tRaw
    const scale = getEffectiveScale(currentPageId)
    if (!scale) return tRaw
    const snapPx = metersToPx(snapIncrementRef.current, { [currentPageId]: scale }, currentPageId)
    return (snapPx && snapPx > 0) ? Math.round(tRaw / snapPx) * snapPx : tRaw
  }

  // ── Canvas mouse handlers ─────────────────────────────────────────────────

  const handleMeasureMouseDown = (e) => {
    // Carve mode: start a drag rectangle to define a new region-page.
    if (carveMode) {
      if (e.button !== 0) return
      // #115 — forced categorize modal open: block starting a new carve until it is resolved.
      if (carvePending) return
      const pos = getCanvasPos(e)
      carveDragRef.current = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y }
      e.preventDefault()
      return
    }
    // Front-face pick mode: suppress all normal mousedown (pan/draw/edit) behavior.
    if (frontFacePromptOpen) { return }
    // Elevation edge pick mode: suppress normal mousedown.
    if (elevEdgeMode) { return }
    // Elevation align mode: hit-test edge-bbox handles; else body-translate.
    if (elevAlignMode) {
      if (e.button !== 0) return
      const pageId = currentPageId
      const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
      const pos = getCanvasPos(e)
      const edgeData = resolveElevEdge(pageId)
      const grabR = HANDLE_PX / zoomRef.current
      let hitCorner = null
      if (edgeData) {
        const { bx1, bx2, by1, by2 } = getElevEdgeBbox(edgeData.A, edgeData.B)
        const corners = [
          { x: bx1, y: by1, ax: bx2, ay: by2 },
          { x: bx2, y: by1, ax: bx1, ay: by2 },
          { x: bx2, y: by2, ax: bx1, ay: by1 },
          { x: bx1, y: by2, ax: bx2, ay: by1 },
        ]
        for (const c of corners) {
          if (Math.hypot(pos.x - c.x, pos.y - c.y) <= grabR) { hitCorner = c; break }
        }
      }
      if (hitCorner) {
        const d0 = Math.hypot(hitCorner.x - hitCorner.ax, hitCorner.y - hitCorner.ay)
        if (d0 > 0) {
          alignDragRef.current = {
            mode: 'scale', pageId,
            ax: hitCorner.ax, ay: hitCorner.ay,
            startTx: cur.tx, startTy: cur.ty, startS: cur.s ?? 1,
            d0,
          }
          return
        }
      }
      // No handle hit — body-translate drag.
      alignDragRef.current = {
        mode: 'translate',
        startClientX: e.clientX, startClientY: e.clientY,
        startTx: cur.tx, startTy: cur.ty, pageId,
      }
      return
    }
    // Align mode: hit-test handles for scale-drag; else body-translate.
    if (alignMode) {
      if (e.button !== 0) return
      const pageId = currentPageId
      const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
      const pos = getCanvasPos(e)
      // Compute ghost bbox corners for hit-test.
      const ghostPageId = getGhostSourcePageId(pages, pageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
      const grabR = HANDLE_PX / zoomRef.current
      let hitCorner = null
      if (ghostPageId) {
        const ghostShapes = completedShapesRef.current.filter(s => s.pageId === ghostPageId && s.status === 'locked')
        if (ghostShapes.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const sh of ghostShapes) for (const v of sh.vertices) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
          }
          const corners = [
            { x: minX, y: minY, ax: maxX, ay: maxY },  // TL → anchor BR
            { x: maxX, y: minY, ax: minX, ay: maxY },  // TR → anchor BL
            { x: maxX, y: maxY, ax: minX, ay: minY },  // BR → anchor TL
            { x: minX, y: maxY, ax: maxX, ay: minY },  // BL → anchor TR
          ]
          for (const c of corners) {
            if (Math.hypot(pos.x - c.x, pos.y - c.y) <= grabR) { hitCorner = c; break }
          }
        }
      }
      if (hitCorner) {
        const d0 = Math.hypot(hitCorner.x - hitCorner.ax, hitCorner.y - hitCorner.ay)
        if (d0 > 0) {
          alignDragRef.current = {
            mode: 'scale', pageId,
            ax: hitCorner.ax, ay: hitCorner.ay,
            startTx: cur.tx, startTy: cur.ty, startS: cur.s ?? 1,
            d0,
          }
          return
        }
      }
      // No handle hit — body-translate drag.
      alignDragRef.current = {
        mode: 'translate',
        startClientX: e.clientX, startClientY: e.clientY,
        startTx: cur.tx, startTy: cur.ty, pageId,
      }
      return
    }
    // Middle mouse: always start pan drag
    if (e.button === 1) { startPanDrag(e); e.preventDefault(); return }

    if (e.button !== 0) return

    // No tool active: check for elevation base-line grab before falling through to pan.
    if (!editMode && !drawMode && !calibMode) {
      const elevScale = pageScalesRef.current[currentPageId]
      const edgeData = resolveElevEdge(currentPageId)
      if (elevScale?.pxPerMeter && edgeData && fhZStack.length > 0) {
        const pos = getCanvasPos(e)
        const baseLineY = elevBaseYRef.current[currentPageId] ?? (edgeData.A.y + edgeData.B.y) / 2
        if (Math.abs(pos.y - baseLineY) <= 8 / zoomRef.current) {
          alignDragRef.current = { mode: 'elevBase', startClientY: e.clientY, startBaseY: baseLineY, pageId: currentPageId }
          return
        }
      }
      startPanDrag(e); return
    }

    // Draw/calib: mousedown has no tool action, left drag pans
    if (drawMode || calibMode) { startPanDrag(e); return }

    // Edit mode below
    const subMode = editSubModeRef.current
    if (subMode === 'combine' || subMode === 'split' || subMode === 'delete') return // handled by onClick
    if (subMode === 'move') {
      const pos = getCanvasPos(e)
      const idx = hitTestShapeBody(pos)
      if (idx !== null) {
        moveDragRef.current = {
          shapeIdx: idx, startPos: pos,
          origVerts: completedShapesRef.current[idx].vertices.map(v => ({ ...v })),
          previewVerts: null, isDragging: false,
        }
        setEditCursor('grabbing')
      } else {
        startPanDrag(e)  // empty space in move mode: pan
      }
      return
    }
    // Default: vertex/segment drag
    const pos = getCanvasPos(e)
    const vertHit = hitTestVertices(pos)
    if (vertHit) {
      dragStateRef.current = {
        type: 'vertexDrag', shapeIdx: vertHit.shapeIdx, vertIdx: vertHit.vertIdx,
        startPos: pos,
        origVerts: completedShapesRef.current[vertHit.shapeIdx].vertices.map(v => ({ ...v })),
        isDragging: false, previewVerts: null,
      }
      setEditCursor('grabbing'); return
    }
    const segHit = hitTestSegments(pos)
    if (segHit) {
      const verts = completedShapesRef.current[segHit.shapeIdx].vertices
      const a = verts[segHit.segIdx], b = verts[(segHit.segIdx + 1) % verts.length]
      const geom = segmentGeom(a, b)
      if (!geom) return
      const capturedPos = { ...pos }
      const holdTimer = setTimeout(() => {
        if (!dragStateRef.current || dragStateRef.current.type !== 'segPending') return
        const t = projT(capturedPos, a, b)
        const insertPt = makeVertex(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y))
        const newVerts = [...verts.map(v => ({ ...v }))]
        newVerts.splice(segHit.segIdx + 1, 0, { ...insertPt })
        dragStateRef.current = {
          type: 'vertexDrag', shapeIdx: segHit.shapeIdx, vertIdx: segHit.segIdx + 1,
          startPos: capturedPos, origVerts: newVerts,
          isDragging: false, previewVerts: null, mergeTarget: null,
        }
        holdTimerRef.current = null
        setEditCursor('crosshair')
        drawEditCanvas(
          { type: 'vertex', shapeIdx: segHit.shapeIdx, vertIdx: segHit.segIdx + 1 },
          { shapeIdx: segHit.shapeIdx, vertices: newVerts }
        )
      }, 550)
      holdTimerRef.current = holdTimer
      dragStateRef.current = {
        type: 'segPending', shapeIdx: segHit.shapeIdx, segIdx: segHit.segIdx,
        startPos: pos, origVerts: verts.map(v => ({ ...v })),
        origA: { ...a }, origB: { ...b }, perpDir: geom.perp,
        isDragging: false, previewVerts: null, holdTimer,
      }
      setEditCursor('grabbing')
      return
    }
    // No hit in default edit mode: pan
    startPanDrag(e)
  }

  const handleMeasureMouseUp = (e) => {
    // Carve mode: commit the rectangle as a new region-page (if large enough).
    if (carveMode) {
      const drag = carveDragRef.current
      carveDragRef.current = null
      if (drag) {
        const rx = Math.min(drag.x1, drag.x2), ry = Math.min(drag.y1, drag.y2)
        const rw = Math.abs(drag.x2 - drag.x1), rh = Math.abs(drag.y2 - drag.y1)
        if (rw >= 20 && rh >= 20 && currentPage && pdf) {
          const pNum = currentPage
          const sourcePageId = currentPageId   // the page being carved FROM
          regionCounterRef.current[pNum] = (regionCounterRef.current[pNum] ?? 0) + 1
          const k = regionCounterRef.current[pNum]
          const newPageId = `page-${pNum}-r${k}`
          // ── Change 1 — crop ∘ T⁻¹ (Build 2) ────────────────────────────────
          // The carve box (rx,ry,rw,rh) is captured in the source page's UNTRANSFORMED
          // canvas-world frame (getCanvasPos, unchanged). Fold the source's align transform
          // back out so the STORED crop is a raw-sheet rectangle matching what the user
          // visually boxed over the aligned backdrop. T = translate(tx,ty)·scale(s) is a
          // uniform similarity (angle ≡ 0), so T⁻¹(p) = (p − t)/s. Read defensively: an
          // un-aligned source has no transform ⇒ identity (tx=ty=0, s=1) ⇒ crop stored
          // unchanged (today's full-sheet behavior, byte-for-byte). The fold is consumed
          // HERE only — never frozen into a stored vertex; the region's geometry stays
          // crop-local (raw-sheet px) by construction.
          const srcT = pageTransformsRef.current[sourcePageId]
          const tS  = (srcT && srcT.s) ? srcT.s : 1
          const tTx = srcT?.tx ?? 0
          const tTy = srcT?.ty ?? 0
          const crop = {
            x: (rx - tTx) / tS,
            y: (ry - tTy) / tS,
            w: rw / tS,
            h: rh / tS,
          }
          pageCropsRef.current[newPageId] = crop
          // ── Change 3 — scale propagation onto the region's OWN pageId (Build 2) ──
          // The region's stored geometry is crop-local in RAW-SHEET px — change 1 rescaled
          // the frame by 1/s — while the source's scale is canvas-world px/m. Divide by the
          // SAME s so the propagated scale lives in the region's raw-sheet frame (else walls
          // measured in an aligned-source region come out by factor s wrong — silent #22).
          // Un-aligned source (s=1) ⇒ carries directly. Lands on the region's own pageId;
          // NO pageRefParentRef write, NO borrow chain. Uncalibrated source ⇒ leave uncalibrated.
          const srcScale = getEffectiveScale(sourcePageId)
          if (srcScale && srcScale.pxPerMeter) {
            pageScalesRef.current[newPageId] = { ...srcScale, pxPerMeter: srcScale.pxPerMeter / tS }
          }
          // Push to pages; stay on the source sheet (no navigation — Item 3).
          // pageCropsRef is already set; the new page appears in the sidebar immediately.
          setPages(prev => [...prev, { pageId: newPageId, pageNum: pNum, crop, category: null, subLabel: null, subLabelNote: null }])
          // #115 — forced categorize-on-carve: stay on the source sheet, stay in carve mode, and
          // open a non-dismissable modal targeted at the new region's pageId. The region ghost
          // (rect in source canvas-world coords) is repainted behind the modal by the passive
          // view-mode redraw (carvePending is a dep). CANCEL discards the region + all companion
          // state (cancelCarveCategory); category is user-set per region — never inherited.
          setCatDraftCategory(null); setCatDraftSubLabel(''); setCatDraftNote('')
          // Pre-fill the region name: `${sourceName}: Region NN`. sourceName follows the existing
          // display scheme (subLabel → category label → "Page N"); NN = k, this region's actual
          // sequence number (regionCounter was incremented BEFORE k was read, so k is correct and
          // matches the -rK pageId suffix and the sidebar "Region K"). Per-source-sheet counter.
          const srcEntry = pages.find(p => p.pageId === sourcePageId)
          const sourceName = srcEntry?.subLabel
            || (srcEntry?.category ? categoryLabel(srcEntry.category) : null)
            || `Page ${pNum}`
          setCarveRegionName(`${sourceName}: Region ${String(k).padStart(2, '0')}`)
          setCarvePending({ pageId: newPageId, sourcePageId, pNum, k, rect: { rx, ry, rw, rh } })
          redrawFrontFaceLayer(null)
        } else {
          // Too small — just clear the overlay
          redrawFrontFaceLayer(null)
        }
      }
      return
    }
    // Elevation align mode: end drag.
    if (elevAlignMode) { alignDragRef.current = null; return }
    // Align mode: end drag.
    if (alignMode) { alignDragRef.current = null; return }
    // Pan cleanup: if pan is active, window listener handles it; just bail
    if (panDragRef.current?.active) return
    // Pending pan (never activated = it's a click): clear ref, fall through to tool handlers
    if (panDragRef.current) panDragRef.current = null

    // Elevation base-line drag end: clear drag ref, stack position already stored in ref.
    if (alignDragRef.current?.mode === 'elevBase') { alignDragRef.current = null; return }

    if (!editMode) return
    const subMode = editSubModeRef.current

    // Clear any pending hold timer
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }

    if (subMode === 'move') {
      const drag = moveDragRef.current
      if (drag && drag.isDragging && drag.previewVerts) {
        pushUndo()
        const newShapes = completedShapesRef.current.map((s, i) =>
          i === drag.shapeIdx ? { ...s, vertices: drag.previewVerts } : s
        )
        completedShapesRef.current = newShapes
      }
      moveDragRef.current = null
      setEditCursor(moveHoverIdxRef.current !== null ? 'move' : 'default')
      drawEditCanvas(); return
    }

    const ds = dragStateRef.current
    if (!ds) return

    // segPending that never became a drag (quick click) → treat as no-op
    if (ds.type === 'segPending') {
      dragStateRef.current = null
      setEditCursor(editHoverRef.current ? 'pointer' : 'default')
      return
    }

    if (ds.type === 'vertexDrag' && ds.isDragging) {
      if (ds.mergeTarget !== null && ds.mergeTarget !== undefined) {
        // Vertex deletion via drag-onto-adjacent
        if (ds.origVerts.length > 3) {
          pushUndo()
          const newVerts = ds.origVerts.filter((_, i) => i !== ds.vertIdx)
          completedShapesRef.current = completedShapesRef.current.map((s, i) =>
            i === ds.shapeIdx ? { ...s, vertices: newVerts } : s
          )
        }
      } else if (ds.previewVerts) {
        pushUndo()
        completedShapesRef.current = completedShapesRef.current.map((s, i) =>
          i === ds.shapeIdx ? { ...s, vertices: ds.previewVerts } : s
        )
      }
      drawEditCanvas(editHoverRef.current)
    } else if (ds.type === 'segDrag' && ds.isDragging && ds.previewVerts) {
      pushUndo()
      const newShapes = completedShapesRef.current.map((s, i) =>
        i === ds.shapeIdx ? { ...s, vertices: ds.previewVerts } : s
      )
      completedShapesRef.current = newShapes
      drawEditCanvas(editHoverRef.current)
    }

    dragStateRef.current = null
    setEditCursor(editHoverRef.current ? 'pointer' : 'default')
  }

  const handleMeasureClick = (e) => {
    // Align mode: drag is the gesture; suppress clicks.
    if (alignMode) return
    // Place-from-entry: single click places a pre-sized opening from the holding area
    if (placingFromEntry && pendingEntryToPlace) {
      if (panDidDragRef.current) { panDidDragRef.current = false; return }
      const pos = getCanvasPos(e)
      placeOpeningFromEntry(pendingEntryToPlace, pos)
      return
    }
    // Equipment item placement: single click places the item
    if (placingEquipmentItem) {
      if (panDidDragRef.current) { panDidDragRef.current = false; return }
      const pos = getCanvasPos(e)
      const snapped = applySnap(pos, pos, false, snapDist, currentPageId)
      completedShapesRef.current = [
        ...completedShapesRef.current,
        {
          id: nextShapeId(),
          shapeKind: 'equipment-item',
          itemType: placingItemType,
          instanceKey: placingInstanceKey,
          pageId: currentPageId,
          status: 'locked',
          vertices: [makeVertex(snapped.x, snapped.y)],
          obligationState: {},
        },
      ]
      setPlacingEquipmentItem(false)
      setPlacingItemType(null)
      setPlacingInstanceKey(null)
      setWorklistTick(t => t + 1)
      redrawFrontFaceLayer(null)
      return
    }
    // Opening placement: two-click rectangle (corner1 → corner2 → dialog)
    if (placingOpeningMode && !openingDraftShape) {
      if (panDidDragRef.current) { panDidDragRef.current = false; return }
      const pos = getCanvasPos(e)
      const snapped = applySnap(pos, openingCorner1 || pos, false, snapDist, currentPageId)
      if (!openingCorner1) {
        setOpeningCorner1(snapped)
      } else {
        const verts = makeRectVerts(openingCorner1, snapped)
        if (dimensionBasisRef.current) {
          openOpeningDialog(verts, openingCorner1)
        } else {
          setOpeningDraftShape({ vertices: verts, corner1: openingCorner1, pendingBasis: true })
          setShowDimBasisDialog(true)
        }
      }
      return
    }
    // Roof graph trace mode: two-clicks-per-segment chain
    if (roofLineMode) {
      if (panDidDragRef.current) { panDidDragRef.current = false; return }
      const rawPos = getCanvasPos(e)
      let axisPos = rawPos
      if (roofChainStartId) {
        const startV = roofGraphRef.current.verts.find(v => v.id === roofChainStartId)
        if (startV && snapAngle && !e.shiftKey) {
          const { pos } = computeFinalSnapPos(rawPos, [startV], true, snapDist, currentPageId)
          axisPos = pos
        }
      }
      const snap = findRoofSnapTarget(axisPos)
      const clickPos = snap ? { x: snap.x, y: snap.y } : axisPos
      if (!roofChainStartId) {
        if (!snap) return  // must start from existing geometry
        const vertId = resolveSnapToVertId(snap)
        setRoofChainStartId(vertId)
        drawRoofGraphCanvas(null, null)
      } else {
        const startV = roofGraphRef.current.verts.find(v => v.id === roofChainStartId)
        if (!startV) return
        if (Math.hypot(clickPos.x - startV.x, clickPos.y - startV.y) < 2) return
        const endIsGeometry = !!snap
        const endVertId = snap ? resolveSnapToVertId(snap) : registerVertex(clickPos.x, clickPos.y)
        roofGraphRef.current.edges.push({
          id: `re-${roofEdgeCounterRef.current++}`, aId: roofChainStartId, bId: endVertId, role: roofDefaultRole,
        })
        setRoofChainStartId(endIsGeometry ? null : endVertId)
        drawRoofGraphCanvas(null, null)
      }
      return
    }
    // Roof role mode: click selects a perimeter segment or graph edge
    if (roofRoleMode) {
      const pos = getCanvasPos(e)
      let best = null, bestDist = HIT_SEG_DIST
      completedShapesRef.current.forEach((shape, shapeIdx) => {
        if (shape.pageId !== currentPageId || shape.roofType !== 'sloped') return
        shape.vertices.forEach((_, segIdx) => {
          const verts = shape.vertices
          const d = distToSegment(pos, verts[segIdx], verts[(segIdx + 1) % verts.length])
          if (d < bestDist) { bestDist = d; best = { type: 'segment', shapeIdx, segIdx } }
        })
      })
      roofGraphRef.current.edges.forEach(edge => {
        const a = roofGraphRef.current.verts.find(v => v.id === edge.aId)
        const b = roofGraphRef.current.verts.find(v => v.id === edge.bId)
        if (!a || !b) return
        const d = distToSegment(pos, a, b)
        if (d < bestDist) { bestDist = d; best = { type: 'edge', edgeId: edge.id } }
      })
      setRoofRoleSelected(best)
      drawRoofRoleCanvas(roofRoleHover, best)
      return
    }
    // Front-face pick mode: a click on a perimeter segment selects the front face.
    if (frontFacePromptOpen) {
      const hit = hitTestFrontFaceSegment(getCanvasPos(e))
      if (hit) selectFrontFace(hit.shapeIdx, hit.segIdx)
      return
    }
    // Elevation align mode: clicks handled by mousedown/up; suppress click handler.
    if (elevAlignMode) return
    // Elevation edge pick mode: a click on a ghost perimeter segment stores it.
    if (elevEdgeMode && elevEdgeSourcePageId) {
      const hit = hitTestElevEdgeSegment(getCanvasPos(e), elevEdgeSourcePageId)
      if (hit) selectElevEdge(elevEdgeSourcePageId, hit.shapeIdx, hit.segIdx)
      return
    }
    // Suppress click that followed a pan drag
    if (panDidDragRef.current) { panDidDragRef.current = false; return }
    if (editMode) {
      const subMode = editSubModeRef.current
      if (subMode === 'combine') { handleCombineClick(getCanvasPos(e)); return }
      if (subMode === 'split') { handleSplitClick(getCanvasPos(e), e.shiftKey); return }
      if (subMode === 'delete') {
        const pos = getCanvasPos(e)
        const idx = hitTestShapeBody(pos)
        if (idx !== null) {
          const target = completedShapesRef.current[idx]
          const wasEquipment = isEquipmentItem(target)
          const wasRun = isRun(target)
          pushUndo()
          let shapes = completedShapesRef.current
          if (wasRun && target.spanSlots?.[0]?.category) {
            // Reverse satisfaction on both endpoint items before removing the run
            shapes = clearRunSatisfaction(target, shapes)
          }
          if (wasEquipment) {
            // Reverse characterization of any runs on this page that connected to this item
            const deletedId = target.id
            const isEndpoint = (s) =>
              s.pointSlots?.[0]?.itemRef === deletedId ||
              s.pointSlots?.[s.pointSlots.length - 1]?.itemRef === deletedId
            // First: clear obligation satisfaction on surviving endpoint items for characterized runs
            const runsAffected = completedShapesRef.current.filter(s =>
              isRun(s) && s.pageId === currentPageId && s.spanSlots?.[0]?.category && isEndpoint(s)
            )
            for (const r of runsAffected) {
              shapes = clearRunSatisfaction(r, shapes)
            }
            // Then: null itemRef on the deleted-item endpoint and clear all span categories
            shapes = shapes.map(s => {
              if (!isRun(s) || s.pageId !== currentPageId) return s
              if (!isEndpoint(s)) return s
              const newPointSlots = s.pointSlots.map((ps, i) =>
                (i === 0 || i === s.pointSlots.length - 1) && ps.itemRef === deletedId
                  ? { ...ps, itemRef: null }
                  : ps
              )
              const newSpanSlots = s.spanSlots.map(ss => ss.category ? { ...ss, category: null } : ss)
              return { ...s, pointSlots: newPointSlots, spanSlots: newSpanSlots }
            })
          }
          completedShapesRef.current = shapes.filter((_, i) => i !== idx)
          deleteHoverIdxRef.current = null
          setEditCursor('default')
          if (wasEquipment || wasRun) setWorklistTick(t => t + 1)
          setEnumerationTick(t => t + 1)
          drawEditCanvas()
        }
        return
      }
      return
    }
    if (calibMode && !showScaleDialog) {
      const pos = getCanvasPos(e)
      setCalibPoints(prev => {
        if (prev.length >= 2) return prev
        const snapped = prev.length === 1 ? applySnap(pos, prev[0], true, false, currentPageId) : pos
        const next = [...prev, snapped]
        drawCalibState(next)
        if (next.length === 2) setShowScaleDialog(true)
        return next
      })
    } else if (drawMode && !reviewShape) {
      const rawPos = getCanvasPos(e)
      const verts = drawVerticesRef.current
      if (verts.length >= 3 && !gradeLineDrawing && !runDrawing) {
        const first = verts[0]
        const dx = rawPos.x - first.x, dy = rawPos.y - first.y
        if (Math.sqrt(dx * dx + dy * dy) <= CLOSE_SNAP_RADIUS) {
          const shape = { vertices: verts, pageId: currentPageId }
          if (pages.find(p => p.pageId === currentPageId)?.category === 'roof-plan') {
            setRoofShapeDraft(shape); drawVerticesRef.current = []; setDrawVertexCount(0)
            redrawReviewCanvas(shape, currentPageId); return
          }
          setReviewShape(shape); drawVerticesRef.current = []; setDrawVertexCount(0)
          if (pages.find(p => p.pageId === currentPageId)?.category === 'elevation') {
            setShowGradeLinePrompt(true)
          }
          redrawReviewCanvas(shape, currentPageId); return
        }
      }
      const useAngleNow = snapAngle && !e.shiftKey
      let finalPos
      if (verts.length === 0) {
        const snapHit = !e.shiftKey && drawStartSnapRef.current
        const runItemSnap0 = !snapHit && runDrawing && !e.shiftKey && runItemSnapRef.current
        const floorLineSnap0 = !snapHit && !runItemSnap0 && gradeLineDrawing && gradeFloorLineSnapRef.current
        finalPos = snapHit
          ? { x: snapHit.x, y: snapHit.y }
          : runItemSnap0
            ? { x: runItemSnap0.vertices[0].x, y: runItemSnap0.vertices[0].y }
            : floorLineSnap0
              ? { x: floorLineSnap0.x, y: floorLineSnap0.y }
              : snapToGrid(rawPos, currentPageId)
        drawStartSnapRef.current = null
        runItemSnapRef.current = null
        gradeFloorLineSnapRef.current = null
      } else {
        // Run-path: snap to equipment item position if close, else normal grid snap.
        if (runDrawing) {
          const itemSnap = !e.shiftKey && runItemSnapRef.current
          finalPos = itemSnap ? { x: itemSnap.vertices[0].x, y: itemSnap.vertices[0].y } : (function(){ const { pos } = computeFinalSnapPos(rawPos, verts, useAngleNow, snapDist, currentPageId); return pos }())
          runItemSnapRef.current = null
        } else
        // Grade-line: snap to wall corner or floor line affects vertex POSITION only (no binding).
        if (gradeLineDrawing) {
          const endSnap = !e.shiftKey && gradeEndSnapRef.current
          if (endSnap) {
            finalPos = { x: endSnap.x, y: endSnap.y }
            gradeFloorLineSnapRef.current = null
          } else if (!e.shiftKey && gradeFloorLineSnapRef.current) {
            const fls = gradeFloorLineSnapRef.current
            finalPos = { x: fls.x, y: fls.y }
            gradeFloorLineSnapRef.current = null
          } else {
            gradeFloorLineSnapRef.current = null
            const { pos } = computeFinalSnapPos(rawPos, verts, useAngleNow, snapDist, currentPageId)
            finalPos = pos
          }
        } else {
          const { pos } = computeFinalSnapPos(rawPos, verts, useAngleNow, snapDist, currentPageId)
          finalPos = pos
        }
      }
      const next = [...verts, finalPos]
      drawVerticesRef.current = next; setDrawVertexCount(next.length)
      redrawDrawCanvas(rawPos, next, useAngleNow, snapDist, currentPageId)
    }
  }

  const handleMeasureMouseMove = (e) => {
    // Carve mode: update live drag rectangle.
    if (carveMode) {
      if (carveDragRef.current) {
        const pos = getCanvasPos(e)
        carveDragRef.current.x2 = pos.x
        carveDragRef.current.y2 = pos.y
        setCarveTick(t => t + 1)
      }
      return
    }
    // Elevation align mode: hover cursor + drag — same transform math as alignMode.
    // Guard: editMode takes priority so segment/vertex drag always works in Edit Shapes.
    if (elevAlignMode && !editMode) {
      if (!alignDragRef.current) {
        const pos = getCanvasPos(e)
        const edgeData = resolveElevEdge(currentPageId)
        let overHandle = false
        if (edgeData) {
          const grabR = HANDLE_PX / zoomRef.current
          const { bx1, bx2, by1, by2 } = getElevEdgeBbox(edgeData.A, edgeData.B)
          const corners = [{ x: bx1, y: by1 }, { x: bx2, y: by1 }, { x: bx2, y: by2 }, { x: bx1, y: by2 }]
          overHandle = corners.some(c => Math.hypot(pos.x - c.x, pos.y - c.y) <= grabR)
        }
        if (overHandle !== alignOverHandle) setAlignOverHandle(overHandle)
      }
      const drag = alignDragRef.current
      if (drag) {
        if (drag.mode === 'scale') {
          const { tx, ty, s } = similarityFromHandleDrag(drag, getCanvasPos(e), 0.05, 20)
          const prev = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prev, tx, ty, s, angle: 0 }
        } else {
          const d = screenDeltaToWorld({ x: e.clientX - drag.startClientX, y: e.clientY - drag.startClientY }, zoomRef.current)
          const prev = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prev, tx: drag.startTx + d.x, ty: drag.startTy + d.y }
        }
        setAlignTick(t => t + 1)
      }
      return
    }
    // Align mode: update pdf-align-layer transform during drag.
    // Guard: editMode takes priority so segment/vertex drag always works in Edit Shapes.
    if (alignMode && !editMode) {
      // Hover hit-test for handle cursor (only when not actively dragging).
      if (!alignDragRef.current) {
        const pos = getCanvasPos(e)
        const pageId = currentPageId
        const ghostPageId = getGhostSourcePageId(pages, pageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
        let overHandle = false
        if (ghostPageId) {
          const grabR = HANDLE_PX / zoomRef.current
          const ghostShapes = completedShapesRef.current.filter(s => s.pageId === ghostPageId && s.status === 'locked')
          if (ghostShapes.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            for (const sh of ghostShapes) for (const v of sh.vertices) {
              if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
              if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
            }
            const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
            overHandle = corners.some(c => Math.hypot(pos.x - c.x, pos.y - c.y) <= grabR)
          }
        }
        if (overHandle !== alignOverHandle) setAlignOverHandle(overHandle)
      }
      const drag = alignDragRef.current
      if (drag) {
        if (drag.mode === 'scale') {
          const { tx, ty, s } = similarityFromHandleDrag(drag, getCanvasPos(e), 0.05, 20)
          const prevScale = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prevScale, tx, ty, s, angle: 0 }
        } else {
          // mode: 'translate'
          const d = screenDeltaToWorld({ x: e.clientX - drag.startClientX, y: e.clientY - drag.startClientY }, zoomRef.current)
          const prev = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prev, tx: drag.startTx + d.x, ty: drag.startTy + d.y }
        }
        setAlignTick(t => t + 1)
      }
      return
    }
    // Elevation base-line drag: vertical-only, whole stack rides along.
    // Guard: editMode takes priority; also prevents stale ref from blocking edit interactions.
    if (alignDragRef.current?.mode === 'elevBase' && !editMode) {
      const drag = alignDragRef.current
      const dy = (e.clientY - drag.startClientY) / zoomRef.current
      elevBaseYRef.current[drag.pageId] = drag.startBaseY + dy
      redrawFrontFaceLayer(null)
      return
    }
    // Front-face pick mode: hover-highlight the candidate perimeter segment.
    if (frontFacePromptOpen) {
      const hit = hitTestFrontFaceSegment(getCanvasPos(e))
      const prev = ffHoverRef.current
      const changed = (!hit !== !prev) ||
        (hit && prev && (hit.shapeIdx !== prev.shapeIdx || hit.segIdx !== prev.segIdx))
      if (changed) { ffHoverRef.current = hit; redrawFrontFaceLayer(hit) }
      setEditCursor(hit ? 'pointer' : 'default')
      return
    }
    // Elevation edge pick mode: hover-highlight ghost perimeter segment.
    if (elevEdgeMode && elevEdgeSourcePageId) {
      const hit = hitTestElevEdgeSegment(getCanvasPos(e), elevEdgeSourcePageId)
      const prev = elevEdgeHoverRef.current
      const changed = (!hit !== !prev) ||
        (hit && prev && (hit.shapeIdx !== prev.shapeIdx || hit.segIdx !== prev.segIdx))
      if (changed) { elevEdgeHoverRef.current = hit; redrawFrontFaceLayer(null) }
      setEditCursor(hit ? 'pointer' : 'default')
      return
    }
    // While pan drag is active, window listener updates pan — skip all tool interactions
    if (panDragRef.current?.active) return
    const pos = getCanvasPos(e)

    if (editMode) {
      const subMode = editSubModeRef.current

      if (subMode === 'move') {
        const drag = moveDragRef.current
        if (drag) {
          const dx = pos.x - drag.startPos.x, dy = pos.y - drag.startPos.y
          if (Math.hypot(dx, dy) > 3) {
            drag.isDragging = true
            drag.previewVerts = drag.origVerts.map(v =>
              clampToCanvas(snapToGrid({ x: v.x + dx, y: v.y + dy }, currentPageId))
            )
            drawEditCanvas()
          }
          return
        }
        const idx = hitTestShapeBody(pos)
        if (idx !== moveHoverIdxRef.current) {
          moveHoverIdxRef.current = idx
          setEditCursor(idx !== null ? 'move' : 'default')
          drawEditCanvas()
        }
        return
      }

      if (subMode === 'combine') {
        const eligible = combineEligibleRef.current
        let found = null
        for (let i = completedShapesRef.current.length - 1; i >= 0; i--) {
          const s = completedShapesRef.current[i]
          if (s.pageId === currentPageId && eligible.has(i) && pointInPolygon(pos, s.vertices)) {
            found = i; break
          }
        }
        setEditCursor(found !== null ? 'pointer' : 'default')
        return
      }

      if (subMode === 'delete') {
        const idx = hitTestShapeBody(pos)
        if (idx !== deleteHoverIdxRef.current) {
          deleteHoverIdxRef.current = idx
          setEditCursor(idx !== null ? 'pointer' : 'default')
          drawEditCanvas()
        }
        return
      }

      if (subMode === 'split') {
        const selIdx = splitSelectedRef.current
        if (selIdx === null) {
          const idx = hitTestShapeBody(pos)
          if (idx !== splitHoverIdxRef.current) {
            splitHoverIdxRef.current = idx
            setEditCursor(idx !== null ? 'pointer' : 'default')
            drawEditCanvas()
          }
        } else if (splitCutRef.current.length === 1) {
          // Axis-snap rubber band (unless Shift held)
          let previewMouse = pos
          if (!e.shiftKey) previewMouse = applyAxisSnap(pos, splitCutRef.current[0])
          splitMouseRef.current = previewMouse
          drawEditCanvas()
        }
        return
      }

      // Default: vertex/segment hover + drag
      const ds = dragStateRef.current
      if (ds) {
        const dx = pos.x - ds.startPos.x, dy = pos.y - ds.startPos.y
        if (Math.hypot(dx, dy) > 3) ds.moved = true

        if (ds.type === 'segPending' && ds.moved) {
          // Moved before hold timer fired — cancel hold, promote to segment drag
          clearTimeout(ds.holdTimer)
          holdTimerRef.current = null
          ds.type = 'segDrag'
          // Fall through to segDrag branch below
        }

        if (ds.type === 'vertexDrag' && ds.moved) {
          ds.isDragging = true
          // Snap origV to grid so axis-snap rays align with grid intersections.
          // For normal vertices origV is already on-grid (no-op). For inserted
          // vertices origV is an interpolated off-grid point — snapping it first
          // ensures 45° rays land precisely on grid points.
          const origV = snapToGrid(ds.origVerts[ds.vertIdx], currentPageId)
          // Axis snap relative to (grid-aligned) original vertex position (unless Shift held)
          let snapTarget = pos
          if (!e.shiftKey) snapTarget = applyAxisSnap(pos, origV)
          const snapped = clampToCanvas(snapToGrid(snapTarget, currentPageId))
          // Merge detection: check adjacent vertices (only if polygon has >3 verts)
          const N = ds.origVerts.length
          if (N > 3) {
            const prevIdx = (ds.vertIdx - 1 + N) % N
            const nextIdx = (ds.vertIdx + 1) % N
            const MERGE_DIST = 14
            const toPrev = Math.hypot(snapped.x - ds.origVerts[prevIdx].x, snapped.y - ds.origVerts[prevIdx].y)
            const toNext = Math.hypot(snapped.x - ds.origVerts[nextIdx].x, snapped.y - ds.origVerts[nextIdx].y)
            ds.mergeTarget = toPrev < MERGE_DIST ? prevIdx : toNext < MERGE_DIST ? nextIdx : null
          } else {
            ds.mergeTarget = null
          }
          ds.previewVerts = ds.origVerts.map((v, i) => i === ds.vertIdx ? snapped : { ...v })
          drawEditCanvas(
            { type: 'vertex', shapeIdx: ds.shapeIdx, vertIdx: ds.vertIdx },
            { shapeIdx: ds.shapeIdx, vertices: ds.previewVerts }
          )
        } else if (ds.type === 'segDrag' && ds.moved) {
          ds.isDragging = true
          if (e.shiftKey) {
            // Shift: free-direction move of both segment endpoints, each grid-snapped
            const newA = clampToCanvas(snapToGrid({ x: ds.origA.x + dx, y: ds.origA.y + dy }, currentPageId))
            const newB = clampToCanvas(snapToGrid({ x: ds.origB.x + dx, y: ds.origB.y + dy }, currentPageId))
            const N = ds.origVerts.length
            ds.previewVerts = ds.origVerts.map((v, i) => {
              if (i === ds.segIdx) return newA
              if (i === (ds.segIdx + 1) % N) return newB
              return { ...v }
            })
          } else {
            const tRaw = dx * ds.perpDir.x + dy * ds.perpDir.y
            const tClamped = clampT(ds.origA, ds.origB, snapPerp(tRaw), ds.perpDir)
            ds.previewVerts = applySegmentMove(ds.origVerts, ds.segIdx, tClamped, ds.perpDir)
          }
          drawEditCanvas(
            { type: 'segment', shapeIdx: ds.shapeIdx, segIdx: ds.segIdx },
            { shapeIdx: ds.shapeIdx, vertices: ds.previewVerts }
          )
        }
        return
      }

      const vertHit = hitTestVertices(pos)
      const segHit = !vertHit ? hitTestSegments(pos) : null
      const newHover = vertHit
        ? { type: 'vertex', shapeIdx: vertHit.shapeIdx, vertIdx: vertHit.vertIdx }
        : segHit ? { type: 'segment', shapeIdx: segHit.shapeIdx, segIdx: segHit.segIdx } : null

      const prev = editHoverRef.current
      const changed = (!newHover && prev) || (newHover && !prev) ||
        (newHover && prev && (
          newHover.type !== prev.type || newHover.shapeIdx !== prev.shapeIdx ||
          (newHover.type === 'segment' ? newHover.segIdx !== prev.segIdx : newHover.vertIdx !== prev.vertIdx)
        ))
      if (changed) {
        editHoverRef.current = newHover
        setEditCursor(newHover ? 'pointer' : 'default')
        drawEditCanvas(newHover)
      }
      return
    }

    if (placingOpeningMode && openingCorner1 && !openingDraftShape) {
      // Rubber-band rectangle preview while placing second corner
      const c = measureRef.current
      if (c) {
        const ctx = c.getContext('2d')
        ctx.clearRect(0, 0, c.width, c.height)
        drawLockedShapes(ctx, completedShapesRef.current, currentPageId)
        drawOpeningShapes(ctx, completedShapesRef.current, currentPageId)
        drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
        drawRunPaths(ctx, completedShapesRef.current, currentPageId)
        drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
        drawElevRefLines(ctx)
        const snapped = applySnap(pos, openingCorner1, false, snapDist, currentPageId)
        const verts = makeRectVerts(openingCorner1, snapped)
        drawOpeningPoly(ctx, verts, 'drag-preview')
        // Corner 1 dot
        ctx.beginPath(); ctx.arc(openingCorner1.x, openingCorner1.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#0891b2'; ctx.fill()
      }
    } else if (calibMode && !showScaleDialog && calibPoints.length === 1) {
      drawCalibState([calibPoints[0], applySnap(pos, calibPoints[0], true, false, currentPageId)])
    } else if (drawMode && !reviewShape && !roofShapeDraft) {
      mousePosRef.current = pos
      // Pre-first-vertex: detect snap target on visible geometry (Shift suppresses).
      // During grade-line drawing: use wall-only snap (with identity) on both
      // first vertex AND every subsequent vertex (the last placed will be end-bound).
      if (drawVerticesRef.current.length === 0) {
        if (!e.shiftKey && !runDrawing) {
          const candidates = gradeLineDrawing
            ? getWallVerticesWithId(currentPageId)
            : getVisibleVertices(currentPageId)
          let best = null, bestDist = HIT_VERT_DIST
          for (const v of candidates) {
            const d = Math.hypot(pos.x - v.x, pos.y - v.y)
            if (d < bestDist) { bestDist = d; best = v }
          }
          drawStartSnapRef.current = best
        } else {
          drawStartSnapRef.current = null
        }
      }
      // Run-path: track equipment-item snap on every move for the live purple ring.
      if (runDrawing) {
        runItemSnapRef.current = findEquipSnapTarget(pos) || null
      }
      // Grade-line: also track wall snap for subsequent (end) vertices.
      if (gradeLineDrawing && drawVerticesRef.current.length >= 1) {
        if (!e.shiftKey) {
          const wallVerts = getWallVerticesWithId(currentPageId)
          let best = null, bestDist = HIT_VERT_DIST
          for (const v of wallVerts) {
            const d = Math.hypot(pos.x - v.x, pos.y - v.y)
            if (d < bestDist) { bestDist = d; best = v }
          }
          gradeEndSnapRef.current = best
        } else {
          gradeEndSnapRef.current = null
        }
      }
      // Grade-line: floor-line snap (lower priority than corner snap; Shift suppresses).
      if (gradeLineDrawing && !e.shiftKey) {
        const cornerActive = drawVerticesRef.current.length === 0
          ? drawStartSnapRef.current !== null
          : gradeEndSnapRef.current !== null
        if (!cornerActive) {
          const lineY = getLowestFloorLineY()
          if (lineY !== null && Math.abs(pos.y - lineY) <= HIT_VERT_DIST) {
            gradeFloorLineSnapRef.current = { x: pos.x, y: lineY }
          } else {
            gradeFloorLineSnapRef.current = null
          }
        } else {
          gradeFloorLineSnapRef.current = null
        }
      } else if (gradeLineDrawing) {
        gradeFloorLineSnapRef.current = null
      }
      redrawDrawCanvas(pos, drawVerticesRef.current, snapAngle && !e.shiftKey, snapDist, currentPageId)
    } else if (roofLineMode) {
      let axisPos = pos
      if (roofChainStartId) {
        const startV = roofGraphRef.current.verts.find(v => v.id === roofChainStartId)
        if (startV && snapAngle && !e.shiftKey) {
          const { pos: snapped } = computeFinalSnapPos(pos, [startV], true, snapDist, currentPageId)
          axisPos = snapped
        }
      }
      const snap = findRoofSnapTarget(axisPos)
      const displayPos = snap ? { x: snap.x, y: snap.y } : axisPos
      drawRoofGraphCanvas(displayPos, snap?.type || null)
    } else if (roofRoleMode) {
      const pos = getCanvasPos(e)
      let best = null, bestDist = HIT_SEG_DIST
      completedShapesRef.current.forEach((shape, shapeIdx) => {
        if (shape.pageId !== currentPageId || shape.roofType !== 'sloped') return
        shape.vertices.forEach((_, segIdx) => {
          const verts = shape.vertices
          const d = distToSegment(pos, verts[segIdx], verts[(segIdx + 1) % verts.length])
          if (d < bestDist) { bestDist = d; best = { type: 'segment', shapeIdx, segIdx } }
        })
      })
      roofGraphRef.current.edges.forEach(edge => {
        const a = roofGraphRef.current.verts.find(v => v.id === edge.aId)
        const b = roofGraphRef.current.verts.find(v => v.id === edge.bId)
        if (!a || !b) return
        const d = distToSegment(pos, a, b)
        if (d < bestDist) { bestDist = d; best = { type: 'edge', edgeId: edge.id } }
      })
      const prev = roofRoleHover
      const changed = JSON.stringify(best) !== JSON.stringify(prev)
      if (changed) {
        setRoofRoleHover(best)
        drawRoofRoleCanvas(best, roofRoleSelected)
      }
    }
  }

  // ── Draw mode canvas render ──────────────────────────────────────────────

  const redrawDrawCanvas = (mousePos, vertices, useAngle, useDist, pageId) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)

    // Ghost reference (floor below) — drawn BELOW locked shapes so working geometry stays on top
    if (showGhost) {
      const ghostPageId = getGhostSourcePageId(pages, pageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
      if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
    }

    drawLockedShapes(ctx, completedShapesRef.current, pageId)
    drawOpeningShapes(ctx, completedShapesRef.current, pageId)
    drawGradeLineShapes(ctx, completedShapesRef.current, pageId)
    drawRunPaths(ctx, completedShapesRef.current, pageId)
    drawEquipmentItemShapes(ctx, completedShapesRef.current, pageId, zoomRef.current)

    // Start-vertex snap highlight: pre-first-vertex window only
    if (vertices.length === 0 && mousePos && drawStartSnapRef.current) {
      const sv = drawStartSnapRef.current
      ctx.beginPath(); ctx.arc(sv.x, sv.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#dc2626'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke()
    }
    // Grade-line end-vertex snap highlight: active after first vertex is placed.
    if (gradeLineDrawing && vertices.length >= 1 && mousePos && gradeEndSnapRef.current) {
      const sv = gradeEndSnapRef.current
      ctx.beginPath(); ctx.arc(sv.x, sv.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#dc2626'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke()
    }
    // Grade-line floor-line snap indicator (lower priority than corner; shown when no corner in range).
    if (gradeLineDrawing && mousePos && gradeFloorLineSnapRef.current) {
      const sv = gradeFloorLineSnapRef.current
      ctx.beginPath(); ctx.arc(sv.x, sv.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#dc2626'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke()
    }
    // Run-path: purple ring on live equipment-item snap target.
    if (runDrawing && mousePos && runItemSnapRef.current) {
      const sv = runItemSnapRef.current.vertices[0]
      if (sv) {
        ctx.beginPath(); ctx.arc(sv.x, sv.y, 14, 0, Math.PI * 2)
        ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2.5; ctx.stroke()
      }
    }

    if (vertices.length >= 2) {
      ctx.beginPath(); ctx.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y)
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke()
    }

    vertices.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(v.x, v.y, i === 0 ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#1d4ed8' : '#3b82f6'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
    })

    if (vertices.length >= 1 && mousePos) {
      const last = vertices[vertices.length - 1], first = vertices[0]
      const nearClose = !gradeLineDrawing && vertices.length >= 3 && (() => {
        const dx = mousePos.x - first.x, dy = mousePos.y - first.y
        return Math.sqrt(dx * dx + dy * dy) <= CLOSE_SNAP_RADIUS
      })()

      if (nearClose) {
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(first.x, first.y)
        ctx.strokeStyle = 'rgba(22,163,74,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
        ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(first.x, first.y, 10, 0, Math.PI * 2)
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2.5; ctx.stroke()
      } else {
        const { pos: snapped, guides } = computeFinalSnapPos(mousePos, vertices, useAngle, useDist, pageId)
        guides.forEach(g => drawAlignGuide(ctx, g, c.width, c.height))
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(snapped.x, snapped.y)
        ctx.strokeStyle = guides.length > 0 ? 'rgba(245,158,11,0.8)' : 'rgba(59,130,246,0.65)'
        ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(snapped.x, snapped.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = guides.length > 0 ? '#f59e0b' : '#3b82f6'; ctx.fill()
        const ddx = snapped.x - last.x, ddy = snapped.y - last.y
        const label = pxToDisplayDist(Math.sqrt(ddx * ddx + ddy * ddy), { [pageId]: getEffectiveScale(pageId) }, pageId)
        if (label) {
          const mx = (last.x + snapped.x) / 2, my = (last.y + snapped.y) / 2
          ctx.font = '12px system-ui, sans-serif'
          const tw = ctx.measureText(label).width, pad = 3
          ctx.fillStyle = 'rgba(255,255,255,0.88)'
          ctx.fillRect(mx - tw / 2 - pad, my - 15, tw + pad * 2, 18)
          ctx.fillStyle = guides.length > 0 ? '#92400e' : '#1d4ed8'
          ctx.fillText(label, mx - tw / 2, my - 1)
        }
      }
    }

    drawElevRefLines(ctx)
  }

  const redrawReviewCanvas = (shape, pageId) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)

    // Ghost reference (floor below) — drawn BELOW locked shapes
    if (showGhost) {
      const ghostPageId = getGhostSourcePageId(pages, pageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
      if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
    }

    drawLockedShapes(ctx, completedShapesRef.current, pageId)
    drawOpeningShapes(ctx, completedShapesRef.current, pageId)
    drawGradeLineShapes(ctx, completedShapesRef.current, pageId)
    drawRunPaths(ctx, completedShapesRef.current, pageId)
    drawEquipmentItemShapes(ctx, completedShapesRef.current, pageId, zoomRef.current)
    const verts = shape.vertices
    ctx.beginPath(); ctx.moveTo(verts[0].x, verts[0].y)
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
    ctx.closePath()
    ctx.fillStyle = 'rgba(34,197,94,0.18)'; ctx.fill()
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke()
    verts.forEach(v => {
      ctx.beginPath(); ctx.arc(v.x, v.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#16a34a'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke()
    })

    drawElevRefLines(ctx)
  }

  const confirmShape = () => {
    if (!reviewShape) return
    completedShapesRef.current = [
      ...completedShapesRef.current,
      { id: nextShapeId(), vertices: reviewShape.vertices, pageId: currentPageId, status: 'locked' },
    ]
    setEnumerationTick(t => t + 1)
    const pendingGrade = gradeLinePending
    setReviewShape(null); drawVerticesRef.current = []; setDrawVertexCount(0)
    setShowGradeLinePrompt(false); setGradeLinePending(false)
    const c = measureRef.current
    if (c) {
      const ctx2 = c.getContext('2d')
      ctx2.clearRect(0, 0, c.width, c.height)
      drawLockedShapes(ctx2, completedShapesRef.current, currentPageId)
      drawOpeningShapes(ctx2, completedShapesRef.current, currentPageId)
      drawGradeLineShapes(ctx2, completedShapesRef.current, currentPageId)
      drawRunPaths(ctx2, completedShapesRef.current, currentPageId)
      drawEquipmentItemShapes(ctx2, completedShapesRef.current, currentPageId, zoomRef.current)
    }
    if (pendingGrade) {
      setGradeLineDrawing(true)
    } else {
      maybePromptFrontFace()
    }
  }

  const discardShape = () => {
    setReviewShape(null); setRoofShapeDraft(null); setRoofTypeDraft(null); setParapetWidthDraft('')
    setShowGradeLinePrompt(false); setGradeLinePending(false); setGradeLineDrawing(false)
    setDrawMode(false)
    drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
    gradeEndSnapRef.current = null; gradeFloorLineSnapRef.current = null
  }

  const commitGradeLine = () => {
    const verts = drawVerticesRef.current
    if (verts.length < 2) return
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

  // Commit the in-progress run path. Characterizes automatically by proximity to endpoint items.
  const commitRun = () => {
    const verts = drawVerticesRef.current
    if (verts.length < 2) return
    const pointSlots = verts.map(v => ({ id: nextPsId(), x: v.x, y: v.y, itemRef: null }))
    const spanSlots  = verts.slice(0, -1).map(() => ({ id: nextSsId(), category: null }))
    const draftRun = {
      id: nextShapeId(),
      shapeKind: 'run',
      vertices: verts.map(v => makeVertex(v.x, v.y)),   // raw geometry; mirrors pointSlots[i].{x,y}
      pointSlots,
      spanSlots,
      pageId: currentPageId,
      status: 'locked',
    }
    const { run: finalRun, updatedShapes } = buildCharacterizedRun(draftRun, completedShapesRef.current)
    completedShapesRef.current = [...updatedShapes, finalRun]
    drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
    runItemSnapRef.current = null
    setRunDrawing(false)
    setWorklistTick(t => t + 1)
    redrawDrawCanvas(null, [], snapAngle, snapDist, currentPageId)
  }

  // ── Opening placement helpers ─────────────────────────────────────────────

  // Build 4-vertex clockwise rectangle from two diagonal corners.
  const makeRectVerts = (c1, c2) => [
    makeVertex(c1.x, c1.y),
    makeVertex(c2.x, c1.y),
    makeVertex(c2.x, c2.y),
    makeVertex(c1.x, c2.y),
  ]

  // Parse ft + in string pair into meters.
  const parseFtIn = (ftStr, inStr) => {
    const ft = parseFloat(ftStr) || 0
    const inches = parseFloat(inStr) || 0
    return feetInchesToMeters(ft, inches)
  }

  // When opening dialog is opened, seed the width/height draft fields from pixel distances.
  const openOpeningDialog = (vertices, corner1) => {
    const scale = getEffectiveScale(currentPageId)
    if (scale) {
      const wPx = Math.abs(vertices[1].x - vertices[0].x)
      const hPx = Math.abs(vertices[2].y - vertices[1].y)
      const scalesArg = { [currentPageId]: scale }
      const wM = pxToMeters(wPx, scalesArg, currentPageId)
      const hM = pxToMeters(hPx, scalesArg, currentPageId)
      const wIn = metersToInches(wM)
      const hIn = metersToInches(hM)
      const wFt = Math.floor(wIn / 12), wInPart = wIn % 12
      const hFt = Math.floor(hIn / 12), hInPart = hIn % 12
      setOpeningDraftFt(String(wFt))
      setOpeningDraftIn(wInPart.toFixed(1))
      setOpeningDraftHFt(String(hFt))
      setOpeningDraftHIn(hInPart.toFixed(1))
    }
    setOpeningDraftShape({ vertices, corner1 })
  }

  const confirmOpening = () => {
    if (!openingDraftShape) return
    const scale = getEffectiveScale(currentPageId)
    let vertices = openingDraftShape.vertices
    let storedWidthM = null, storedHeightM = null
    if (scale) {
      const wM = parseFtIn(openingDraftFt, openingDraftIn)
      const hM = parseFtIn(openingDraftHFt, openingDraftHIn)
      if (wM > 0 && hM > 0) {
        storedWidthM = wM
        storedHeightM = hM
        const scalesArg = { [currentPageId]: scale }
        const wPx = metersToPx(wM, scalesArg, currentPageId)
        const hPx = metersToPx(hM, scalesArg, currentPageId)
        const c1 = openingDraftShape.corner1
        vertices = makeRectVerts(c1, { x: c1.x + wPx, y: c1.y + hPx })
      }
    }
    completedShapesRef.current = [
      ...completedShapesRef.current,
      {
        id: nextShapeId(),
        vertices,
        pageId: currentPageId,
        status: 'locked',
        shapeKind: openingDraftKind,
        openingType: openingDraftType,
        label: openingDraftLabel,
        widthM: storedWidthM,
        heightM: storedHeightM,
        dimBasis: dimensionBasisRef.current,
        uw: null,
        shgc: openingDraftKind === 'door' ? 0 : null,
      },
    ]
    setOpeningDraftShape(null)
    setOpeningCorner1(null)
    setPlacingOpeningMode(false)
    restoreSnapIncrement()
    redrawFrontFaceLayer(null)
  }

  const discardOpening = () => {
    setOpeningDraftShape(null)
    setOpeningCorner1(null)
    setPlacingOpeningMode(false)
    restoreSnapIncrement()
    redrawFrontFaceLayer(null)
  }

  // ── Holding-area helpers (#46 Stage Two) ───────────────────────────────────

  // Normalise and load entries into the holding area. Caller passes WEW-bridge
  // shaped entries (or any source-agnostic normalized shape); `remaining` is
  // initialised here from `quantity`.
  const loadPendingOpenings = (entries) => {
    pendingOpeningsRef.current = entries.map(e => ({ ...e, remaining: e.quantity ?? 1 }))
    setPendingOpeningsTick(t => t + 1)
  }

  // Place one entry from the holding area at a canvas-pixel position.
  // Mirrors confirmOpening() exactly: same fields, same shape, always sets widthM/heightM.
  const placeOpeningFromEntry = (entry, pos) => {
    if (!entry) return
    const scale = getEffectiveScale(currentPageId)
    if (!scale) return
    const basis = dimensionBasisRef.current ?? 'frame'
    if (!dimensionBasisRef.current) dimensionBasisRef.current = basis
    const wM = basis === 'frame' ? entry.frameWidthM : entry.roughWidthM
    const hM = basis === 'frame' ? entry.frameHeightM : entry.roughHeightM
    if (!wM || !hM) return
    const scalesArg = { [currentPageId]: scale }
    const wPx = metersToPx(wM, scalesArg, currentPageId)
    const hPx = metersToPx(hM, scalesArg, currentPageId)
    const c1 = { x: pos.x - wPx / 2, y: pos.y - hPx / 2 }
    const c2 = { x: pos.x + wPx / 2, y: pos.y + hPx / 2 }
    const vertices = makeRectVerts(c1, c2)
    const kind = entry.openingKind === 'door' || entry.openingKind === 'patio' ? 'door' : 'window'
    completedShapesRef.current = [
      ...completedShapesRef.current,
      {
        id: nextShapeId(),
        vertices,
        pageId: currentPageId,
        status: 'locked',
        shapeKind: kind,
        openingType: entry.operationType ?? '',
        label: entry.mark ?? '',
        widthM: wM,
        heightM: hM,
        dimBasis: basis,
        uw: entry.performance?.uw ?? null,
        shgc: kind === 'door' ? 0 : (entry.performance?.shgc ?? null),
      },
    ]
    // Decrement remaining; remove entry when exhausted
    entry.remaining = (entry.remaining ?? 1) - 1
    if (entry.remaining <= 0) {
      pendingOpeningsRef.current = pendingOpeningsRef.current.filter(e => e.id !== entry.id)
    }
    setPendingOpeningsTick(t => t + 1)
    setEnumerationTick(t => t + 1)
    setPlacingFromEntry(false)
    setPendingEntryToPlace(null)
    restoreSnapIncrement()
    redrawFrontFaceLayer(null)
  }

  const confirmRoofShape = () => {
    if (!roofShapeDraft || !roofTypeDraft) return
    const parapet = roofTypeDraft === 'flat' ? (parseFloat(parapetWidthDraft) || 0) : null
    completedShapesRef.current = [
      ...completedShapesRef.current,
      {
        id: nextShapeId(),
        vertices: roofShapeDraft.vertices,
        pageId: currentPageId,
        status: 'locked',
        roofType: roofTypeDraft,
        parapetWidth: parapet,
        lineRoles: {},
      },
    ]
    setRoofShapeDraft(null); setRoofTypeDraft(null); setParapetWidthDraft('')
    drawVerticesRef.current = []; setDrawVertexCount(0)
    const c = measureRef.current
    if (c) {
      const ctx2 = c.getContext('2d')
      ctx2.clearRect(0, 0, c.width, c.height)
      drawLockedShapes(ctx2, completedShapesRef.current, currentPageId)
      drawOpeningShapes(ctx2, completedShapesRef.current, currentPageId)
      drawGradeLineShapes(ctx2, completedShapesRef.current, currentPageId)
      drawRunPaths(ctx2, completedShapesRef.current, currentPageId)
      drawEquipmentItemShapes(ctx2, completedShapesRef.current, currentPageId, zoomRef.current)
    }
  }

  // ── Roof graph helpers ────────────────────────────────────────────────────
  // Five distinct role colors — ridge dark-red, hip light-orange, valley blue, eave green, rake violet
  const ROOF_EDGE_COLORS = { ridge: '#b91c1c', hip: '#fb923c', valley: '#2563eb', eave: '#16a34a', rake: '#8b5cf6' }
  const MIDPOINT_SNAP_PX = 12

  const quantKey = (x, y) => `${Math.round(x * 2)},${Math.round(y * 2)}`

  const getVertKeyMap = () => {
    const map = new Map()
    roofGraphRef.current.verts.forEach(v => map.set(quantKey(v.x, v.y), v.id))
    return map
  }

  const registerVertex = (x, y, provenance = {}) => {
    const km = getVertKeyMap()
    const key = quantKey(x, y)
    if (km.has(key)) return km.get(key)
    const id = `rv-${roofVertCounterRef.current++}`
    roofGraphRef.current.verts.push({ id, x, y, ...provenance })
    return id
  }

  const splitRoofEdge = (edgeId, newVertId) => {
    const graph = roofGraphRef.current
    const idx = graph.edges.findIndex(e => e.id === edgeId)
    if (idx === -1) return
    const old = graph.edges[idx]
    const e1 = { id: `re-${roofEdgeCounterRef.current++}`, aId: old.aId, bId: newVertId, role: old.role }
    const e2 = { id: `re-${roofEdgeCounterRef.current++}`, aId: newVertId, bId: old.bId, role: old.role }
    graph.edges.splice(idx, 1, e1, e2)
  }

  // After removing an edge, check both its endpoints and heal any split vertex that is now
  // down to exactly 0 or 1 other connection (roofEdgeParent verts only — perimCorner/perimParent
  // are polygon-owned and never removed by the graph).
  const healAfterEdgeRemoval = (removedEdge) => {
    const graph = roofGraphRef.current
    for (const vertId of [removedEdge.aId, removedEdge.bId]) {
      const vert = graph.verts.find(v => v.id === vertId)
      if (!vert) continue
      const connected = graph.edges.filter(e => e.aId === vertId || e.bId === vertId)
      if (connected.length === 0) {
        // Fully orphaned — remove if non-perimeter
        if (!vert.perimCorner && !vert.perimParent) graph.verts = graph.verts.filter(v => v.id !== vertId)
      } else if (vert.roofEdgeParent) {
        if (connected.length === 1) {
          // One half-edge remains; the other (removedEdge) spanned to the other side — re-merge
          const halfEdge = connected[0]
          const otherEndOfRemoved = removedEdge.aId === vertId ? removedEdge.bId : removedEdge.aId
          const otherEndOfHalf = halfEdge.aId === vertId ? halfEdge.bId : halfEdge.aId
          graph.edges = graph.edges.filter(e => e.id !== halfEdge.id)
          graph.verts = graph.verts.filter(v => v.id !== vertId)
          graph.edges.push({ id: `re-${roofEdgeCounterRef.current++}`, aId: otherEndOfRemoved, bId: otherEndOfHalf, role: halfEdge.role })
        } else if (connected.length === 2) {
          // Both halves remain (undo of a chain edge that landed on a split vertex) — full merge
          const [e1, e2] = connected
          const aId = e1.aId === vertId ? e1.bId : e1.aId
          const bId = e2.aId === vertId ? e2.bId : e2.aId
          graph.edges = graph.edges.filter(e => e.id !== e1.id && e.id !== e2.id)
          graph.verts = graph.verts.filter(v => v.id !== vertId)
          graph.edges.push({ id: `re-${roofEdgeCounterRef.current++}`, aId, bId, role: e1.role })
        }
        // 3+ connections: complex junction formed after split — leave intact
      }
    }
  }

  const resolveSnapToVertId = (snap) => {
    if (!snap) return null
    if (snap.type === 'vertex') {
      return snap.vertId != null ? snap.vertId : registerVertex(snap.x, snap.y, snap.provenance || {})
    }
    const prov = snap.edgeType === 'perimeter'
      ? { perimParent: { shapeIdx: snap.shapeIdx, segIdx: snap.segIdx } }
      : { roofEdgeParent: { edgeId: snap.edgeId } }
    const id = registerVertex(snap.x, snap.y, prov)
    if (snap.edgeType === 'roof' && snap.edgeId) splitRoofEdge(snap.edgeId, id)
    return id
  }

  const findRoofSnapTarget = (pos) => {
    const pageShapes = completedShapesRef.current.filter(s => s.pageId === currentPageId && s.status === 'locked')
    const graph = roofGraphRef.current
    let best = null, bestDist = Infinity

    // 1. Existing graph vertices
    for (const v of graph.verts) {
      const d = Math.hypot(pos.x - v.x, pos.y - v.y)
      if (d < HIT_VERT_DIST && d < bestDist) { bestDist = d; best = { type: 'vertex', x: v.x, y: v.y, vertId: v.id } }
    }
    // 2. Perimeter corner vertices
    for (const shape of pageShapes) {
      const shapeIdx = completedShapesRef.current.indexOf(shape)
      for (let i = 0; i < shape.vertices.length; i++) {
        const v = shape.vertices[i]
        const d = Math.hypot(pos.x - v.x, pos.y - v.y)
        if (d < HIT_VERT_DIST && d < bestDist) {
          bestDist = d
          best = { type: 'vertex', x: v.x, y: v.y, vertId: null, provenance: { perimCorner: { shapeIdx, vertIdx: i } } }
        }
      }
    }
    if (best) return best

    // 3. Midpoints — perimeter edges
    for (const shape of pageShapes) {
      const shapeIdx = completedShapesRef.current.indexOf(shape)
      for (let i = 0; i < shape.vertices.length; i++) {
        const a = shape.vertices[i], b = shape.vertices[(i + 1) % shape.vertices.length]
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const d = Math.hypot(pos.x - mx, pos.y - my)
        if (d < MIDPOINT_SNAP_PX && d < bestDist) {
          bestDist = d; best = { type: 'midpoint', x: mx, y: my, edgeType: 'perimeter', shapeIdx, segIdx: i }
        }
      }
    }
    // 4. Midpoints — roof edges
    for (const edge of graph.edges) {
      const a = graph.verts.find(v => v.id === edge.aId), b = graph.verts.find(v => v.id === edge.bId)
      if (!a || !b) continue
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const d = Math.hypot(pos.x - mx, pos.y - my)
      if (d < MIDPOINT_SNAP_PX && d < bestDist) {
        bestDist = d; best = { type: 'midpoint', x: mx, y: my, edgeType: 'roof', edgeId: edge.id }
      }
    }
    if (best) return best

    // 5. Perimeter edges
    for (const shape of pageShapes) {
      const shapeIdx = completedShapesRef.current.indexOf(shape)
      for (let i = 0; i < shape.vertices.length; i++) {
        const a = shape.vertices[i], b = shape.vertices[(i + 1) % shape.vertices.length]
        const d = distToSegment(pos, a, b)
        if (d < HIT_SEG_DIST && d < bestDist) {
          bestDist = d
          const t = projT(pos, a, b)
          best = { type: 'edge', x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), edgeType: 'perimeter', shapeIdx, segIdx: i, t }
        }
      }
    }
    // 6. Roof edges
    for (const edge of graph.edges) {
      const a = graph.verts.find(v => v.id === edge.aId), b = graph.verts.find(v => v.id === edge.bId)
      if (!a || !b) continue
      const d = distToSegment(pos, a, b)
      if (d < HIT_SEG_DIST && d < bestDist) {
        bestDist = d
        const t = projT(pos, a, b)
        best = { type: 'edge', x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), edgeType: 'roof', edgeId: edge.id, t }
      }
    }
    return best
  }

  const drawPerimRoles = (ctx) => {
    completedShapesRef.current.forEach(shape => {
      if (shape.pageId !== currentPageId || shape.status !== 'locked') return
      const roles = shape.lineRoles || {}
      const verts = shape.vertices
      for (let i = 0; i < verts.length; i++) {
        const role = roles[i]; if (!role) continue
        const a = verts[i], b = verts[(i + 1) % verts.length]
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = ROOF_EDGE_COLORS[role] || '#6b7280'
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash([]); ctx.stroke()
      }
    })
  }

  const drawRoofGraphCanvas = (snapPos, snapType) => {
    const c = measureRef.current; if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, completedShapesRef.current, currentPageId)
    drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
    drawRunPaths(ctx, completedShapesRef.current, currentPageId)
    drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
    drawPerimRoles(ctx)
    const graph = roofGraphRef.current
    graph.edges.forEach(edge => {
      const a = graph.verts.find(v => v.id === edge.aId), b = graph.verts.find(v => v.id === edge.bId)
      if (!a || !b) return
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = ROOF_EDGE_COLORS[edge.role] || '#6b7280'
      ctx.lineWidth = 2.5; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([])
    })
    graph.verts.forEach(v => {
      ctx.beginPath(); ctx.arc(v.x, v.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke()
    })
    if (roofChainStartId && snapPos) {
      const startV = graph.verts.find(v => v.id === roofChainStartId)
      if (startV) {
        ctx.beginPath(); ctx.moveTo(startV.x, startV.y); ctx.lineTo(snapPos.x, snapPos.y)
        ctx.strokeStyle = 'rgba(37,99,235,0.6)'; ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([])
      }
    }
    if (snapPos) {
      if (snapType === 'vertex') {
        ctx.beginPath(); ctx.arc(snapPos.x, snapPos.y, 8, 0, Math.PI * 2)
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2; ctx.stroke()
      } else if (snapType === 'midpoint') {
        ctx.beginPath(); ctx.arc(snapPos.x, snapPos.y, 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(22,163,74,0.25)'; ctx.fill()
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.5; ctx.stroke()
      } else if (snapType === 'edge') {
        ctx.beginPath(); ctx.arc(snapPos.x, snapPos.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(37,99,235,0.25)'; ctx.fill()
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5; ctx.stroke()
      }
    }
  }

  const drawRoofRoleCanvas = (hover, selected) => {
    const c = measureRef.current; if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, completedShapesRef.current, currentPageId)
    drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
    drawRunPaths(ctx, completedShapesRef.current, currentPageId)
    drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
    drawPerimRoles(ctx)
    const graph = roofGraphRef.current
    graph.edges.forEach(edge => {
      const a = graph.verts.find(v => v.id === edge.aId), b = graph.verts.find(v => v.id === edge.bId)
      if (!a || !b) return
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = ROOF_EDGE_COLORS[edge.role] || '#6b7280'
      ctx.lineWidth = 2.5; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([])
    })
    const highlightSeg = (shapeIdx, segIdx, color, lw) => {
      const verts = completedShapesRef.current[shapeIdx]?.vertices; if (!verts) return
      const a = verts[segIdx], b = verts[(segIdx + 1) % verts.length]
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.setLineDash([]); ctx.stroke()
    }
    const highlightEdge = (edgeId, color, lw) => {
      const edge = graph.edges.find(e => e.id === edgeId); if (!edge) return
      const a = graph.verts.find(v => v.id === edge.aId), b = graph.verts.find(v => v.id === edge.bId)
      if (!a || !b) return
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.setLineDash([]); ctx.stroke()
    }
    const sameHit = (a, b) => a && b && a.type === b.type &&
      (a.type === 'segment' ? a.shapeIdx === b.shapeIdx && a.segIdx === b.segIdx : a.edgeId === b.edgeId)
    if (hover && !sameHit(hover, selected)) {
      if (hover.type === 'segment') highlightSeg(hover.shapeIdx, hover.segIdx, 'rgba(245,158,11,0.7)', 5)
      else highlightEdge(hover.edgeId, 'rgba(245,158,11,0.7)', 5)
    }
    if (selected) {
      if (selected.type === 'segment') highlightSeg(selected.shapeIdx, selected.segIdx, '#f59e0b', 6)
      else highlightEdge(selected.edgeId, '#f59e0b', 6)
    }
  }

  // ── Front-face designation (Step 5c) ────────────────────────────────────────

  // Derived trigger: prompt only when no front face is set yet, the anchor floor
  // is determinable, and that anchor page has at least one locked polygon.
  // Re-checked after a lock and after a categorization (which can move the anchor).
  // Returns true if it opened the prompt (caller may then suppress navigation so
  // the anchor page stays in view for picking).
  const maybePromptFrontFace = (pagesOverride = null) => {
    if (frontFace) return false
    const { determinable, anchorPageId } = getAnchorFloor(pagesOverride || pages)
    if (!determinable) return false
    const hasLocked = completedShapesRef.current.some(
      s => s.pageId === anchorPageId && s.status === 'locked'
    )
    if (hasLocked) { setFrontFacePromptOpen(true); return true }
    return false
  }

  // Resolve the stored front-face reference to live segment endpoints, following
  // any shape edits. Returns null if the reference is now stale (shape deleted or
  // vertex count shrank past the segment).
  const resolveFrontFaceSegment = (ff = frontFace) => {
    if (!ff) return null
    const shape = completedShapesRef.current[ff.shapeIndex]
    if (!shape || shape.pageId !== ff.pageId) return null
    const verts = shape.vertices
    if (ff.segmentIndex >= verts.length) return null
    return { a: verts[ff.segmentIndex], b: verts[(ff.segmentIndex + 1) % verts.length] }
  }

  // Outer-perimeter segments of locked shapes on the current page (which, when
  // the prompt fires, is the anchor page). Returns {shapeIdx, segIdx} or null.
  const hitTestFrontFaceSegment = (pos) => {
    let best = null, bestDist = HIT_SEG_DIST
    completedShapesRef.current.forEach((shape, shapeIdx) => {
      if (shape.pageId !== currentPageId || shape.status !== 'locked') return
      const verts = shape.vertices
      for (let segIdx = 0; segIdx < verts.length; segIdx++) {
        const d = distToSegment(pos, verts[segIdx], verts[(segIdx + 1) % verts.length])
        if (d < bestDist) { bestDist = d; best = { shapeIdx, segIdx } }
      }
    })
    return best
  }

  // Hit-test ghost perimeter segments for elevation edge pick.
  // Scans shapes from sourcePageId (a floor plan page), not the current page.
  const hitTestElevEdgeSegment = (pos, sourcePageId) => {
    let best = null, bestDist = HIT_SEG_DIST
    completedShapesRef.current.forEach((shape, shapeIdx) => {
      if (shape.pageId !== sourcePageId || shape.status !== 'locked') return
      const verts = shape.vertices
      for (let segIdx = 0; segIdx < verts.length; segIdx++) {
        const d = distToSegment(pos, verts[segIdx], verts[(segIdx + 1) % verts.length])
        if (d < bestDist) { bestDist = d; best = { shapeIdx, segIdx } }
      }
    })
    return best
  }

  // Resolve live edge endpoints from authoritative stored indices.
  // Returns {A, B, sourcePageId} or null if stale/missing.
  const resolveElevEdge = (pageId) => {
    const stored = elevationEdgeRef.current[pageId]
    if (!stored) return null
    const srcShape = completedShapesRef.current[stored.shapeIndex]
    if (!srcShape || stored.segmentIndex >= srcShape.vertices.length) return null
    const A = srcShape.vertices[stored.segmentIndex]
    const B = srcShape.vertices[(stored.segmentIndex + 1) % srcShape.vertices.length]
    return { A, B, sourcePageId: stored.sourcePageId }
  }

  // Returns a padded bbox around the two edge endpoints so handles always have area.
  const ELEV_EDGE_PAD = 24  // world pixels
  const getElevEdgeBbox = (A, B) => ({
    bx1: Math.min(A.x, B.x) - ELEV_EDGE_PAD,
    bx2: Math.max(A.x, B.x) + ELEV_EDGE_PAD,
    by1: Math.min(A.y, B.y) - ELEV_EDGE_PAD,
    by2: Math.max(A.y, B.y) + ELEV_EDGE_PAD,
  })

  const confirmElevAlign = () => {
    const elevPageId = currentPageId
    const edgeData = resolveElevEdge(elevPageId)
    if (!edgeData) return
    const srcScale = getEffectiveScale(edgeData.sourcePageId)
    if (!srcScale) return
    // Elevation-space pixel length of the edge (same canvas coordinate system as the ghost).
    const elevPixelLen = Math.hypot(edgeData.B.x - edgeData.A.x, edgeData.B.y - edgeData.A.y)
    if (elevPixelLen < 1) return  // degenerate edge — shouldn't happen
    // Real-world length of the edge in meters, derived from the source floor-plan calibration.
    const realLenMeters = elevPixelLen / srcScale.pxPerMeter
    // Elevation's own independent pxPerMeter — not borrowed, not a child of the source.
    const elevPxPerMeter = elevPixelLen / realLenMeters
    pageScalesRef.current[elevPageId] = { pxPerMeter: elevPxPerMeter, displayUnit: srcScale.displayUnit }
    // #117 (C-rederive): record the author-frame footprint — renderPage pins this page's render
    // frame to it (fallback 1200) so it registers at any load width. Additive; tx/ty/s untouched.
    const prevT = pageTransformsRef.current[elevPageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
    pageTransformsRef.current[elevPageId] = { ...prevT, authorScaled: prevT.authorScaled ?? 1200 }
    setElevAlignMode(false)
    alignDragRef.current = null
    setAlignTick(t => t + 1)
  }

  const selectElevEdge = (sourcePageId, shapeIdx, segIdx) => {
    const shape = completedShapesRef.current[shapeIdx]
    if (!shape) return
    const a = shape.vertices[segIdx]
    const b = shape.vertices[(segIdx + 1) % shape.vertices.length]
    elevationEdgeRef.current[currentPageId] = {
      sourcePageId,
      shapeIndex: shapeIdx,
      segmentIndex: segIdx,
      endpointA: { x: a.x, y: a.y },
      endpointB: { x: b.x, y: b.y },
    }
    elevEdgeHoverRef.current = null
    redrawFrontFaceLayer(null)
  }

  // Inverse of the drawElevRefLines Y→Z mapping: given a canvas-pixel Y on an elevation
  // page, returns the world Z in METERS (uniform with world XY from pageVertexToWorld).
  // Shares the SINGLE Y↔Z(feet) core with drawElevRefLines (coords.elevYToZFeet /
  // zFeetToElevY) — Z is computed in feet (matching floorHeightsRef storage) then
  // routed to metres via feetToMeters. Tier-2 wrapper: reads the live scale ref, then
  // calls the primitive (recalibration-safe, #22).
  // Returns null if the gate (confirmed pxPerMeter + elevationEdge + fhZStack) is not met.
  const elevYToWorldZ = (y, elevPageId) => {
    const elevScale = pageScalesRef.current[elevPageId]
    if (!elevScale?.pxPerMeter) return null
    const edgeData = resolveElevEdge(elevPageId)
    if (!edgeData) return null
    if (!fhZStack.length) return null
    const anchorY = elevBaseYRef.current[elevPageId] ?? (edgeData.A.y + edgeData.B.y) / 2
    const lowestFloorZ = fhZStack[0].floorZ ?? 0  // feet
    return feetToMeters(elevYToZFeet(y, anchorY, lowestFloorZ, elevScale.pxPerMeter))
  }

  // Draws horizontal floor/ceiling reference lines on aligned Elevation pages.
  // Reads from closure: currentPageId, pageScalesRef, resolveElevEdge, fhZStack, zoomRef, measureRef.
  const drawElevRefLines = (ctx) => {
    const elevScale = pageScalesRef.current[currentPageId]
    if (!elevScale?.pxPerMeter) return
    const edgeData = resolveElevEdge(currentPageId)
    if (!edgeData) return
    if (!fhZStack.length) return
    const c = measureRef.current
    if (!c) return

    const anchorY = elevBaseYRef.current[currentPageId] ?? (edgeData.A.y + edgeData.B.y) / 2
    const { pxPerMeter } = elevScale
    const zoom = zoomRef.current
    const canvasW = c.width
    const lowestFloorZ = fhZStack[0].floorZ ?? 0

    ctx.save()
    ctx.font = `${11 / zoom}px sans-serif`
    ctx.textBaseline = 'bottom'
    for (const row of fhZStack) {
      if (row.floorZ != null) {
        // Shared Y↔Z(feet) core with elevYToWorldZ (coords.zFeetToElevY).
        const y = zFeetToElevY(row.floorZ, anchorY, lowestFloorZ, pxPerMeter)
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y)
        ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 1.5 / zoom
        ctx.globalAlpha = 0.85; ctx.setLineDash([]); ctx.stroke()
        ctx.fillStyle = '#0d9488'; ctx.globalAlpha = 1
        ctx.fillText(row.level, 6 / zoom, y - 2 / zoom)
      }
      if (row.ceilingZ != null) {
        const y = zFeetToElevY(row.ceilingZ, anchorY, lowestFloorZ, pxPerMeter)
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y)
        ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1 / zoom
        ctx.globalAlpha = 0.7; ctx.setLineDash([6 / zoom, 4 / zoom]); ctx.stroke()
        ctx.fillStyle = '#d97706'; ctx.globalAlpha = 0.9
        ctx.fillText(row.level + ' ceiling', 6 / zoom, y - 2 / zoom)
      }
    }
    ctx.setLineDash([]); ctx.restore()
  }

  // Redraw the base measure layer plus the confirmed front face plus the pick
  // hover highlight. Used by the base-layer effect and the pick-mode handlers.
  const redrawFrontFaceLayer = (hoverSeg = ffHoverRef.current) => {
    const c = measureRef.current
    if (!c || !currentPage) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)

    // Ghost reference (floor below) — drawn BELOW locked shapes
    if (showGhost) {
      const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
      if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
    }

    drawLockedShapes(ctx, completedShapesRef.current, currentPageId)
    drawOpeningShapes(ctx, completedShapesRef.current, currentPageId)
    drawGradeLineShapes(ctx, completedShapesRef.current, currentPageId)
    drawRunPaths(ctx, completedShapesRef.current, currentPageId)
    drawEquipmentItemShapes(ctx, completedShapesRef.current, currentPageId, zoomRef.current)
    const seg = resolveFrontFaceSegment()
    if (seg && frontFace && frontFace.pageId === currentPageId) {
      drawSegmentHighlight(ctx, seg.a, seg.b, 'front')
    }
    if (frontFacePromptOpen && hoverSeg) {
      const shape = completedShapesRef.current[hoverSeg.shapeIdx]
      if (shape) {
        const a = shape.vertices[hoverSeg.segIdx]
        const b = shape.vertices[(hoverSeg.segIdx + 1) % shape.vertices.length]
        drawSegmentHighlight(ctx, a, b, 'hover')
      }
    }

    // Elevation edge pick mode: ghost of source floor plan + selected/hover marks.
    // Outside pick mode: just show the stored edge mark if present.
    const storedElevEdge = elevationEdgeRef.current[currentPageId]
    if (elevEdgeMode && elevEdgeSourcePageId) {
      drawGhostShapes(ctx, completedShapesRef.current, elevEdgeSourcePageId)
      // Draw already-selected edge (from the active source page)
      if (storedElevEdge && storedElevEdge.sourcePageId === elevEdgeSourcePageId) {
        const srcShape = completedShapesRef.current[storedElevEdge.shapeIndex]
        if (srcShape && storedElevEdge.segmentIndex < srcShape.vertices.length) {
          const ea = srcShape.vertices[storedElevEdge.segmentIndex]
          const eb = srcShape.vertices[(storedElevEdge.segmentIndex + 1) % srcShape.vertices.length]
          drawSegmentHighlight(ctx, ea, eb, 'elev-edge')
        }
      }
      // Draw hover highlight
      const ehov = elevEdgeHoverRef.current
      if (ehov) {
        const srcShape = completedShapesRef.current[ehov.shapeIdx]
        if (srcShape) {
          const ha = srcShape.vertices[ehov.segIdx]
          const hb = srcShape.vertices[(ehov.segIdx + 1) % srcShape.vertices.length]
          drawSegmentHighlight(ctx, ha, hb, 'hover')
        }
      }
    } else if (storedElevEdge) {
      // Outside pick mode — keep the stored edge marked
      const srcShape = completedShapesRef.current[storedElevEdge.shapeIndex]
      if (srcShape && storedElevEdge.segmentIndex < srcShape.vertices.length) {
        const ea = srcShape.vertices[storedElevEdge.segmentIndex]
        const eb = srcShape.vertices[(storedElevEdge.segmentIndex + 1) % srcShape.vertices.length]
        drawSegmentHighlight(ctx, ea, eb, 'elev-edge')
      }
    }

    // Elevation align mode: ghost + bbox outline + corner handles.
    if (elevAlignMode) {
      const edgeData = resolveElevEdge(currentPageId)
      if (edgeData) {
        drawGhostShapes(ctx, completedShapesRef.current, edgeData.sourcePageId)
        drawSegmentHighlight(ctx, edgeData.A, edgeData.B, 'elev-edge')
        const { bx1, bx2, by1, by2 } = getElevEdgeBbox(edgeData.A, edgeData.B)
        ctx.save()
        ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1 / zoomRef.current
        ctx.globalAlpha = 0.6
        ctx.setLineDash([4 / zoomRef.current, 3 / zoomRef.current])
        ctx.strokeRect(bx1, by1, bx2 - bx1, by2 - by1)
        ctx.setLineDash([]); ctx.restore()
        const zoom = zoomRef.current
        const half = (HANDLE_PX / 2) / zoom
        const corners = [{ x: bx1, y: by1 }, { x: bx2, y: by1 }, { x: bx2, y: by2 }, { x: bx1, y: by2 }]
        ctx.save()
        for (const { x, y } of corners) {
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9
          ctx.fillRect(x - half - 1 / zoom, y - half - 1 / zoom, HANDLE_PX / zoom + 2 / zoom, HANDLE_PX / zoom + 2 / zoom)
          ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 1
          ctx.fillRect(x - half, y - half, HANDLE_PX / zoom, HANDLE_PX / zoom)
        }
        ctx.restore()
      }
    }

    // Elevation floor/ceiling reference lines (read-only; only when confirmed scale exists).
    drawElevRefLines(ctx)

    // #110 / #115 follow-on — standing outlines for CONFIRMED regions on their source sheet.
    // Read-only. Only when viewing the ROOT sheet (regionIndexOf === 0), never a region viewing
    // itself (its crop-local frame would mis-place the rects). Each region's stored crop is
    // raw-sheet px; map forward through THIS sheet's align transform T = translate(t)·scale(s) —
    // the exact inverse of the carve-commit T⁻¹ fold — so each outline lands where it was boxed.
    // A cancelled region is already gone from `pages`, so it never draws; the still-pending region
    // has category == null (excluded here) and shows its own teal modal ghost below.
    if (regionIndexOf(currentPageId) === 0) {
      const tr = pageTransformsRef.current[currentPageId]
      const ts = (tr && tr.s) ? tr.s : 1
      const ttx = tr?.tx ?? 0, tty = tr?.ty ?? 0
      const regionRects = pages
        .filter(p => p.pageNum === currentPage && p.category != null)
        .map(p => {
          const crop = pageCropsRef.current[p.pageId] || p.crop
          if (!crop) return null
          return {
            x: crop.x * ts + ttx,
            y: crop.y * ts + tty,
            w: crop.w * ts,
            h: crop.h * ts,
            // Prefer the display name; fall back to the semantic subLabel (level/direction),
            // then the category label. subLabel still drives geometry independently.
            label: p.regionName || p.subLabel || categoryLabel(p.category),
          }
        })
        .filter(Boolean)
      drawRegionOutlines(ctx, regionRects, zoomRef.current)
    }

    // Carve mode: live amber dashed rectangle overlay during drag.
    if (carveMode && carveDragRef.current) {
      const { x1, y1, x2, y2 } = carveDragRef.current
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2)
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1)
      const lw = 2 / zoomRef.current
      ctx.save()
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = lw
      ctx.setLineDash([6 / zoomRef.current, 4 / zoomRef.current])
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.fillStyle = 'rgba(245,158,11,0.08)'
      ctx.fillRect(rx, ry, rw, rh)
      ctx.restore()
    }

    // #115 — pending carved region awaiting its forced category: draw its outline as a teal
    // ghost on the source sheet behind the modal. rect is in this sheet's canvas-world coords.
    if (carvePending && carvePending.sourcePageId === currentPageId && carvePending.rect) {
      const { rx, ry, rw, rh } = carvePending.rect
      ctx.save()
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 2 / zoomRef.current
      ctx.setLineDash([8 / zoomRef.current, 4 / zoomRef.current])
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.fillStyle = 'rgba(6,182,212,0.10)'
      ctx.fillRect(rx, ry, rw, rh)
      ctx.restore()
    }
  }

  const selectFrontFace = (shapeIdx, segIdx) => {
    const shape = completedShapesRef.current[shapeIdx]
    if (!shape) return
    const a = shape.vertices[segIdx]
    const b = shape.vertices[(segIdx + 1) % shape.vertices.length]
    setFrontFace({
      pageId: shape.pageId,
      shapeIndex: shapeIdx,
      segmentIndex: segIdx,
      endpoints: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
    })
    setFrontFacePromptOpen(false)
    ffHoverRef.current = null
  }

  const skipFrontFace = () => {
    // Dismiss without setting — condition stays true so it can reappear later.
    setFrontFacePromptOpen(false); ffHoverRef.current = null
    redrawFrontFaceLayer(null)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // #115 — forced categorize modal: Esc maps to CANCEL (discard region), never a silent
        // close that would strand an uncategorized region. Checked before the carve-mode exit.
        if (carvePending) { cancelCarveCategory(); return }
        if (carveMode) { setCarveMode(false); carveDragRef.current = null; return }
        if (calibMode) exitCalibMode()
        else if (placingFromEntry) {
          setPlacingFromEntry(false); setPendingEntryToPlace(null); restoreSnapIncrement()
        }
        else if (placingEquipmentItem) {
          setPlacingEquipmentItem(false); setPlacingItemType(null); setPlacingInstanceKey(null)
          redrawFrontFaceLayer(null)
        }
        else if (reviewShape || roofShapeDraft) discardShape()
        else if (roofLineMode) {
          if (roofChainStartId) { setRoofChainStartId(null); drawRoofGraphCanvas(null, null) }
          else setRoofLineMode(false)
        }
        else if (roofRoleMode) { setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null) }
        else if (drawMode) exitDrawMode()
        else if (editMode) {
          if (editSubModeRef.current === 'move' && moveDragRef.current) {
            moveDragRef.current = null; drawEditCanvas()
          } else if (editSubModeRef.current === 'split') {
            if (splitCutRef.current.length > 0) {
              splitCutRef.current = []; splitMouseRef.current = null
              setSplitCut([]); drawEditCanvas()
            } else if (splitSelectedRef.current !== null) {
              splitSelectedRef.current = null; setSplitSelected(null)
              setEditCursor('default'); drawEditCanvas()
            } else exitSubMode()
          } else if (editSubModeRef.current === 'combine') {
            if (combineSelectRef.current.length > 0) {
              combineSelectRef.current = []; setCombineSelection([]); drawEditCanvas()
            } else exitSubMode()
          } else if (editSubModeRef.current) {
            exitSubMode()
          } else exitEditMode()
        }
      }
      if (runDrawing && e.key === 'Enter') {
        if (drawVerticesRef.current.length >= 2) commitRun(); return
      }
      if (gradeLineDrawing && e.key === 'Enter') {
        commitGradeLine(); return
      }
      if (drawMode && !reviewShape && (e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        const verts = drawVerticesRef.current
        if (verts.length === 0) return
        const next = verts.slice(0, -1)
        drawVerticesRef.current = next; setDrawVertexCount(next.length)
        redrawDrawCanvas(mousePosRef.current, next, snapAngle, snapDist, currentPageId)
      }
      if (roofLineMode && roofChainStartId && (e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        const graph = roofGraphRef.current
        let lastEdgeIdx = -1
        for (let i = graph.edges.length - 1; i >= 0; i--) {
          if (graph.edges[i].bId === roofChainStartId) { lastEdgeIdx = i; break }
        }
        if (lastEdgeIdx === -1) {
          setRoofChainStartId(null)
        } else {
          const removed = graph.edges.splice(lastEdgeIdx, 1)[0]
          healAfterEdgeRemoval(removed)
          setRoofChainStartId(removed.aId)
        }
        drawRoofGraphCanvas(null, null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calibMode, drawMode, reviewShape, roofShapeDraft, roofRoleMode, roofLineMode, roofChainStartId, snapAngle, snapDist, currentPage, editMode, gradeLineDrawing, placingEquipmentItem, placingFromEntry, carveMode, carvePending])

  // ── Wheel zoom (non-passive so preventDefault works) ─────────────────────

  useEffect(() => {
    const el = canvasWrapperRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor))
      if (newZoom === zoomRef.current) return
      const c = measureRef.current
      if (!c) return
      const rect = c.getBoundingClientRect()
      // Canvas pixel under cursor stays fixed: worldX = (clientX - rect.left) / zoom
      const worldX = (e.clientX - rect.left) / zoomRef.current
      const worldY = (e.clientY - rect.top) / zoomRef.current
      // New pan so worldX stays under cursor after zoom
      const newPanX = panRef.current.x + worldX * (zoomRef.current - newZoom)
      const newPanY = panRef.current.y + worldY * (zoomRef.current - newZoom)
      zoomRef.current = newZoom
      panRef.current = { x: newPanX, y: newPanY }
      setViewTransform({ zoom: newZoom, panX: newPanX, panY: newPanY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // Re-bind when the page renders or the app mode changes: the canvas-stack
    // node can be re-created by reconciliation (e.g. when the categorization
    // panel mounts/unmounts as a sibling), which would otherwise strand the
    // once-attached listener on a detached node and silently break wheel zoom.
  }, [currentPage, categorizeMode, calibMode, drawMode, editMode])

  // ── Window-level pan drag (handles mouse leaving canvas during drag) ──────

  useEffect(() => {
    const onMove = (e) => {
      const drag = panDragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startClientX
      const dy = e.clientY - drag.startClientY
      if (!drag.active && Math.hypot(dx, dy) > 3) {
        drag.active = true
        setIsPanning(true)
        // Cancel any pending edit hold timer or drag state
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
        dragStateRef.current = null
      }
      if (drag.active) {
        panRef.current = { x: drag.startPanX + dx, y: drag.startPanY + dy }
        setViewTransform(prev => ({ ...prev, panX: panRef.current.x, panY: panRef.current.y }))
      }
    }
    const onUp = () => {
      const drag = panDragRef.current
      if (!drag) return
      if (drag.active) { panDidDragRef.current = true; setIsPanning(false) }
      panDragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Compass rose helpers ──────────────────────────────────────────────────

  const CARDINALS = ['N','NE','E','SE','S','SW','W','NW']
  function angleToCardinal(deg) {
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8
    return CARDINALS[idx]
  }

  // Auto-focus overlay div when opened so arrow keys work immediately
  useEffect(() => {
    if (showCompassOverlay && compassOverlayRef.current) {
      compassOverlayRef.current.focus()
    }
  }, [showCompassOverlay])

  // Sync input string when angle changes externally (drag, arrow keys) — not while user is typing
  useEffect(() => {
    if (!compassInputFocusedRef.current) {
      setCompassInputVal(compassDraftAngle.toFixed(1))
    }
  }, [compassDraftAngle])

  function openCompassOverlay() {
    const angle = compassAngleDeg ?? 0
    setCompassDraftAngle(angle)
    setCompassInputVal(angle.toFixed(1))
    // Default position: center of viewport
    if (compassPos.x === null) {
      setCompassPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    }
    setShowCompassOverlay(true)
  }

  function confirmCompass() {
    setCompassAngleDeg(compassDraftAngle)
    setCompassCardinal(angleToCardinal(compassDraftAngle))
    setShowCompassOverlay(false)
    setCatReentry(false)
    setCategorizeMode(true)
  }

  function skipCompass() {
    setCompassAngleDeg(0)
    setCompassCardinal('N')
    setShowCompassOverlay(false)
    setCatReentry(false)
    setCategorizeMode(true)
  }

  // ── Page categorization handlers (Step 4b) ─────────────────────────────────

  const loadDraftFromEntry = (entry) => {
    if (entry && entry.category) {
      setCatDraftCategory(entry.category)
      setCatDraftSubLabel(entry.subLabel || '')
      setCatDraftNote(entry.subLabelNote || '')
    } else {
      setCatDraftCategory(null); setCatDraftSubLabel(''); setCatDraftNote('')
    }
  }

  // Load the current page's stored entry into the draft when entering the mode
  // or navigating pages. Whether the editor or the compact summary shows is
  // derived from recatPageId + the page's category at render time — not from a
  // separate flag — so an already-categorized page always shows its summary
  // immediately on navigation, mid-categorization.
  useEffect(() => {
    if (!categorizeMode || !currentPageId) return
    loadDraftFromEntry(pages.find(p => p.pageId === currentPageId))
  }, [categorizeMode, currentPageId, pages])

  const selectCatCategory = (key) => {
    setCatDraftCategory(key); setCatDraftSubLabel(''); setCatDraftNote('')
  }

  const resolveSubLabel = () => {
    if (!catDraftCategory) return null
    const v = (catDraftSubLabel || '').trim()
    return v || null
  }

  // Floor Plan requires a known level before it can be confirmed.
  const catConfirmDisabled = catDraftCategory === 'floor-plan' && !catDraftSubLabel

  // Advance to the next page lacking a category (wraps; never re-navigates to self).
  // Skips source sheets (they are carve-surface-only, not categorizable).
  const advanceToNextUncategorized = (pagesList) => {
    const srcSheets = new Set(
      pagesList.filter(p => p.crop != null).map(p => pageIdMapRef.current[p.pageNum]).filter(Boolean)
    )
    const currIdx = pagesList.findIndex(p => p.pageId === currentPageId)
    for (let step = 1; step < pagesList.length; step++) {
      const idx = (currIdx + step) % pagesList.length
      const p = pagesList[idx]
      if (srcSheets.has(p.pageId)) continue
      if (!p.category) { goToPageId(p.pageId); return }
    }
  }

  // Single category-write path (Fork-D, keyed by pageId). Used by confirmCatPage (currentPageId)
  // and by the forced categorize-on-carve modal (the new region's pageId) — no parallel write.
  // `extra` merges additional per-page fields (e.g. regionName); omitted by the normal panel so
  // it never clobbers a region's display name on recategorize.
  const writePageCategory = (targetPageId, category, subLabel, subLabelNote, extra = {}) => {
    const newPages = pages.map(p =>
      p.pageId === targetPageId ? { ...p, category, subLabel, subLabelNote, ...extra } : p
    )
    setPages(newPages)
    return newPages
  }

  const confirmCatPage = () => {
    if (!catDraftCategory || catConfirmDisabled) return
    const subLabel = resolveSubLabel()
    // subLabelNote is a floor-plan-only extra descriptor; never carries level meaning.
    const subLabelNote = catDraftCategory === 'floor-plan' ? (catDraftNote.trim() || null) : null
    const newPages = writePageCategory(currentPageId, catDraftCategory, subLabel, subLabelNote)
    setRecatPageId(null)
    // If the front-face prompt opens, stay on the anchor page so the user can
    // pick the edge; otherwise advance to the next uncategorized page as usual.
    if (!maybePromptFrontFace(newPages)) advanceToNextUncategorized(newPages)
  }

  const skipCatPage = () => {
    const newPages = pages.map(p =>
      p.pageId === currentPageId ? { ...p, category: null, subLabel: null, subLabelNote: null } : p
    )
    setPages(newPages)
    setRecatPageId(null)
    advanceToNextUncategorized(newPages)
  }

  const startRecategorize = () => {
    loadDraftFromEntry(pages.find(p => p.pageId === currentPageId))
    setRecatPageId(currentPageId)
  }

  // #115 — forced categorize-on-carve modal: CONFIRM writes the chosen category to the new
  // region via the shared write path (keyed to the region's pageId), then closes. We stay on
  // the source sheet and remain in carve mode, ready to box the next region.
  const confirmCarveCategory = () => {
    if (!carvePending) return
    if (!catDraftCategory) return
    // Two coexisting fields: subLabel keeps its SEMANTIC value (floor level / N-S-E-W direction)
    // from the pickers — it drives the Z-stack and elevation-direction logic. regionName is the
    // separate DISPLAY name shown on the standing-outline chip. Both written through the shared
    // path, keyed to the region's pageId. Gate is category-only; neither field blocks confirm.
    const subLabel = resolveSubLabel()
    const subLabelNote = catDraftCategory === 'floor-plan' ? (catDraftNote.trim() || null) : null
    const regionName = carveRegionName.trim() || null
    writePageCategory(carvePending.pageId, catDraftCategory, subLabel, subLabelNote, { regionName })
    setCarvePending(null); setCarveRegionName('')
    setCatDraftCategory(null); setCatDraftSubLabel(''); setCatDraftNote('')
    // No imperative redraw: setCarvePending(null) re-fires the view-mode passive redraw with the
    // updated `pages`, so the pending teal ghost is replaced by the green standing outline in a
    // single repaint (no stale-state double-draw / flicker).
  }

  // CANCEL discards the just-carved region ENTIRELY — remove its pages entry and every companion
  // ref the carve commit wrote for this pageId (crop, borrowed scale, region-counter increment).
  // State returns to as-if-no-carve, leaving no orphan. Stay on source sheet, stay in carve mode.
  const cancelCarveCategory = () => {
    if (!carvePending) return
    const { pageId, pNum, k } = carvePending
    setPages(prev => prev.filter(p => p.pageId !== pageId))
    delete pageCropsRef.current[pageId]
    delete pageScalesRef.current[pageId]
    // Reverse the region-counter increment iff it is still at k. The forced modal blocks any
    // intervening carve, so this holds; the guard keeps the next carve's id collision-free either way.
    if (regionCounterRef.current[pNum] === k) regionCounterRef.current[pNum] = k - 1
    setCarvePending(null); setCarveRegionName('')
    setCatDraftCategory(null); setCatDraftSubLabel(''); setCatDraftNote('')
    // No imperative redraw: setCarvePending(null) re-fires the passive redraw with the discarded
    // region already removed from `pages`, so no standing outline is added for it.
  }

  // Re-enter categorization to work through what remains: cycle uncategorized
  // pages only, jumping straight to the first one. Skips source sheets.
  const enterCategorizeReentry = () => {
    setCatReentry(true)
    setCategorizeMode(true)
    const first = pages.find(p => !p.category && !sheetsWithRegions.has(p.pageId))
    if (first && first.pageId !== currentPageId) goToPageId(first.pageId)
  }

  // Pointer handlers for dragging the compass overlay body
  function onCompassBodyPointerDown(e) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    compassDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPosX: compassPos.x,
      startPosY: compassPos.y,
    }
    e.stopPropagation()
  }

  function onCompassBodyPointerMove(e) {
    if (!compassDragRef.current) return
    const dx = e.clientX - compassDragRef.current.startClientX
    const dy = e.clientY - compassDragRef.current.startClientY
    setCompassPos({
      x: compassDragRef.current.startPosX + dx,
      y: compassDragRef.current.startPosY + dy,
    })
    e.stopPropagation()
  }

  function onCompassBodyPointerUp(e) {
    compassDragRef.current = null
    e.stopPropagation()
  }

  // Pointer handlers for the rotation handle
  function onRotHandlePointerDown(e) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    compassRotDragRef.current = {
      centerX: compassPos.x,
      centerY: compassPos.y,
      startAngle: compassDraftAngle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      // angle from center to pointer at drag start (for delta computation)
      startPtrAngle: Math.atan2(e.clientY - compassPos.y, e.clientX - compassPos.x) * 180 / Math.PI,
    }
    e.stopPropagation()
    e.preventDefault()
  }

  function onRotHandlePointerMove(e) {
    if (!compassRotDragRef.current) return
    const { centerX, centerY, startPtrAngle, startAngle } = compassRotDragRef.current
    const currentPtrAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI
    const delta = currentPtrAngle - startPtrAngle
    // The rotation handle is at the top of the rose; dragging it clockwise increases angleDeg
    setCompassDraftAngle(((startAngle + delta) % 360 + 360) % 360)
    e.stopPropagation()
  }

  function onRotHandlePointerUp(e) {
    compassRotDragRef.current = null
    e.stopPropagation()
  }

  // Arrow key handler — attached to the overlay div
  function onCompassKeyDown(e) {
    if (!showCompassOverlay) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation()
      const step = e.shiftKey ? 0.1 : 1
      setCompassDraftAngle(prev => ((prev - step) % 360 + 360) % 360)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation()
      const step = e.shiftKey ? 0.1 : 1
      setCompassDraftAngle(prev => ((prev + step) % 360 + 360) % 360)
    } else if (e.key === 'Enter') {
      e.preventDefault(); confirmCompass()
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); setShowCompassOverlay(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const showGhost = showGhostByPageId[currentPageId] ?? true
  const currentPageEntry = pages.find(p => p.pageId === currentPageId) || null

  // Source sheets: root pages (no crop) that have at least one region-page (crop != null) carved from them.
  // These are "carve-surface-only" — not categorizable, not drawable.
  const sheetsWithRegions = new Set(
    pages.filter(p => p.crop != null)
         .map(p => pageIdMapRef.current[p.pageNum])
         .filter(Boolean)
  )
  const currentPageIsSourceSheet = sheetsWithRegions.has(currentPageId)

  // Exclude source sheets from the categorizable count (they can't be categorized).
  const categorizedCount = pages.filter(p => p.category && !sheetsWithRegions.has(p.pageId)).length


  // ── Sidebar sections ───────────────────────────────────────────────────────
  // category is stored as a key ('floor-plan', 'elevation', …), not a label.
  // All entries now carry pageId so the sidebar can navigate via goToPageId (handles
  // both root sheets and region-pages uniformly). isSourceSheet drives the "(full sheet)" chip.
  const sidebarSections = (() => {
    const byCat = (key) => pages.filter(p => p.category === key)
    const orderBy = (entries, order, getKey) =>
      [...entries].sort((a, b) => {
        const ia = order.indexOf(getKey(a)), ib = order.indexOf(getKey(b))
        const ra = ia === -1 ? order.length : ia, rb = ib === -1 ? order.length : ib
        return ra - rb || a.pageNum - b.pageNum
      })

    const toEntry = (p, label) => ({
      pageId: p.pageId,
      pageNum: p.pageNum,
      label,
      isSourceSheet: sheetsWithRegions.has(p.pageId),
    })

    const floor = orderBy(byCat('floor-plan'), FLOOR_ORDER, p => p.subLabel)
      .map(p => toEntry(p, p.subLabel || 'Floor Plan'))

    const elevation = orderBy(byCat('elevation'), ['North', 'South', 'East', 'West'], p => p.subLabel)
      .map(p => toEntry(p, p.subLabel ? `${p.subLabel} Elevation` : 'Elevation'))

    const simple = (key, fallback) =>
      byCat(key).map(p => toEntry(p, p.subLabel || fallback))

    const unused = pages.filter(p => !p.category).map(p => {
      // Region-pages: label shows which region number of which source sheet.
      const regionMatch = p.pageId.match(/-r(\d+)$/)
      const label = regionMatch ? `Region ${regionMatch[1]} of p.${p.pageNum}` : `Page ${p.pageNum}`
      return toEntry(p, label)
    })

    return [
      { title: 'Plan Views',     entries: floor },
      { title: 'Elevations',     entries: elevation },
      { title: 'Roof Plans',     entries: simple('roof-plan', 'Roof Plan') },
      { title: 'Cross-Sections', entries: simple('cross-section', 'Cross-Section') },
      { title: 'Details',        entries: simple('detail', 'Detail') },
      { title: 'Site Plans',     entries: simple('site-plan', 'Site Plan') },
      { title: 'Unused Pages',   entries: unused },
    ].filter(s => s.entries.length > 0)
  })()

  // ── Floor heights panel derived values ──────────────────────────────────────
  // floorHeightsTick read here ensures re-render when ref is written.
  void floorHeightsTick
  const fhDisplayUnit = Object.values(pageScalesRef.current)[0]?.displayUnit ?? 'ft'
  // Known FLOOR_ORDER levels that have at least one categorized floor-plan page — ordered base→top.
  const presentFloorLevels = FLOOR_ORDER.filter(level =>
    pages.some(p => p.category === 'floor-plan' && p.subLabel === level)
  )
  const fhZStack = accumulateZ(floorHeightsRef.current, presentFloorLevels, FLOOR_ORDER)
  const fhTopLevel = presentFloorLevels.length > 0 ? presentFloorLevels[presentFloorLevels.length - 1] : null
  // ── §8.2 Worklist derivation ─────────────────────────────────────────────────
  // worklistTick read here ensures re-render when spawning config fields are written.
  void worklistTick
  const deriveWorklist = () => {
    // Index already-placed equipment items by instanceKey (first placed wins)
    const placedByKey = {}
    for (const s of completedShapesRef.current) {
      if (isEquipmentItem(s) && s.status === 'locked' && !placedByKey[s.instanceKey]) {
        placedByKey[s.instanceKey] = s
      }
    }

    // Collect raw spawn requests from all fields, then dedup by type.
    // Dedup rule: two fields requesting the same item type means one shared physical unit —
    // take the MAX count requested (not additive). Shared appliances appear once in the worklist.
    const resolvedCfg = resolveEffectiveConfig(projectSetupRef.current.values)
    const maxCountByType = {}
    for (const field of CONFIG_FIELDS) {
      if (!field.spawns) continue
      const val = resolvedCfg[field.id] ?? getConfigValue(field.id)  // resolved view for spawn logic
      const spawnList = field.spawns(val)
      for (const { type, count } of spawnList) {
        maxCountByType[type] = Math.max(maxCountByType[type] ?? 0, count)
      }
    }

    const toPlace = []
    const obligations = []
    for (const [type, count] of Object.entries(maxCountByType)) {
      const itemDef = ITEM_TYPES.find(it => it.type === type)
      const label = itemDef?.label ?? type
      for (let i = 1; i <= count; i++) {
        const instanceKey = `${type}#${i}`
        const placed = placedByKey[instanceKey]
        if (placed) {
          if (itemDef) {
            for (const ob of itemDef.obligations) {
              // Resolve ownerRoles: for run obligations, category-level trade from RUN_PAIR_MAP
              // takes priority (authoritative); fall back to obligation-level trades for run
              // categories not yet in the pair map. Property obligations use trades directly.
              let ownerRoles
              if (ob.kind === 'run') {
                const mapEntry = RUN_PAIR_MAP.find(e => e.satisfies.some(s => s.obligationId === ob.id))
                ownerRoles = mapEntry?.trade ? [mapEntry.trade] : (ob.trades ?? [])
              } else {
                ownerRoles = ob.trades ?? []
              }
              obligations.push({
                placedId: placed.id,
                instanceKey,
                itemLabel: label,
                ...ob,
                ownerRoles,
                satisfiedValue: (placed.obligationState || {})[ob.id] ?? null,
              })
            }
          }
        } else {
          toPlace.push({ type, label, instanceKey })
        }
      }
    }
    return { toPlace, obligations }
  }

  const fhOutstanding = presentFloorLevels.flatMap(level => {
    const entry = floorHeightsRef.current[level] || {}
    const items = []
    if (entry.floorToCeiling == null) items.push({ key: `${level}-ftc`, label: `${level} — ceiling height` })
    if (level !== fhTopLevel && entry.floorSystemAbove == null) items.push({ key: `${level}-fsa`, label: `${level} — floor system` })
    return items
  })
  const FLOOR_SYSTEM_PRESETS = [
    { label: '2×10',              inches: 10.625 },
    { label: '2×12',              inches: 12.625 },
    { label: '11⅞″ I-joist',     inches: 13.25  },
    { label: '14″ I-joist',       inches: 15.375 },
    { label: '16″ I-joist/truss', inches: 17.375 },
    { label: '24″ truss',         inches: 25.375 },
  ]
  const inchesToFhUnit = (inches) => fhDisplayUnit === 'ft' ? inches / 12 : inchesToMeters(inches)
  const SHEATHING_INCHES = 1.375
  const setFloorHeight = (level, field, value) => {
    const cur = floorHeightsRef.current[level] || { floorToCeiling: null, floorSystemAbove: null }
    floorHeightsRef.current[level] = { ...cur, [field]: value }
    setFloorHeightsTick(t => t + 1)
    setEnumerationTick(t => t + 1)
  }
  const setFloorHeightFields = (level, fieldsObj) => {
    const cur = floorHeightsRef.current[level] || { floorToCeiling: null, floorSystemAbove: null }
    floorHeightsRef.current[level] = { ...cur, ...fieldsObj }
    setFloorHeightsTick(t => t + 1)
    setEnumerationTick(t => t + 1)
  }
  const validateCeiling = (ftc, fsa) => {
    if (ftc == null || ftc <= 0) return 'Ceiling height must be greater than 0.'
    if (fsa != null && ftc <= fsa) return `Ceiling (${ftc.toFixed(2)} ft) must exceed floor system (${fsa.toFixed(2)} ft).`
    return null
  }
  const applyFhPreset = (level, inches) => {
    const newFsa = inchesToFhUnit(inches)
    const entry = floorHeightsRef.current[level] || {}
    if (entry.ceilingSource === 'solved') {
      const f2f = (entry.floorToCeiling ?? 0) + (entry.floorSystemAbove ?? 0)
      const newFtc = f2f - newFsa
      const err = validateCeiling(newFtc, newFsa)
      if (err) { setFhError({ level, msg: err }); return }
      setFhError(null)
      setFloorHeightFields(level, { floorSystemAbove: newFsa, floorToCeiling: newFtc })
    } else {
      setFloorHeightFields(level, { floorSystemAbove: newFsa })
    }
    setFhExpandedLevel(null); setFhCustomActive(false); setFhCustomVal(''); setFhCustomSheathing(false)
  }
  const applyFhCustom = (level) => {
    const rawInches = parseFloat(fhCustomVal)
    if (isNaN(rawInches)) return
    const totalInches = fhCustomSheathing ? rawInches + SHEATHING_INCHES : rawInches
    const newFsa = inchesToFhUnit(totalInches)
    const entry = floorHeightsRef.current[level] || {}
    if (entry.ceilingSource === 'solved') {
      const f2f = (entry.floorToCeiling ?? 0) + (entry.floorSystemAbove ?? 0)
      const newFtc = f2f - newFsa
      const err = validateCeiling(newFtc, newFsa)
      if (err) { setFhError({ level, msg: err }); return }
      setFhError(null)
      setFloorHeightFields(level, { floorSystemAbove: newFsa, floorToCeiling: newFtc })
    } else {
      setFloorHeightFields(level, { floorSystemAbove: newFsa })
    }
    setFhExpandedLevel(null); setFhCustomActive(false); setFhCustomVal(''); setFhCustomSheathing(false)
  }
  const openFhExpand = (level) => {
    if (fhExpandedLevel === level) { setFhExpandedLevel(null); setFhCustomActive(false); setFhCustomVal(''); setFhCustomSheathing(false) }
    else { setFhExpandedLevel(level); setFhCustomActive(false); setFhCustomVal(''); setFhCustomSheathing(false) }
  }

  // Page-arrow navigation — operates on LOGICAL pages (by pageId), so each carved region
  // is a distinct stop just like a full sheet. Re-entry → cycle uncategorized; post-Done
  // (some categorized) → cycle categorized; initial categorization (nothing categorized yet)
  // → step through every logical page. Source sheets (which carry regions) are always
  // excluded — you navigate to the regions, not the carve surface. Ordered by sheet number,
  // then by carve order (region index) within a sheet.
  const orderLogical = (arr) =>
    [...arr].sort((a, b) => (a.pageNum - b.pageNum) || (regionIndexOf(a.pageId) - regionIndexOf(b.pageId)))
  const categorizedLogical   = orderLogical(pages.filter(p => p.category && !sheetsWithRegions.has(p.pageId)))
  const uncategorizedLogical = orderLogical(pages.filter(p => !p.category && !sheetsWithRegions.has(p.pageId)))
  const allLogical           = orderLogical(pages.filter(p => !sheetsWithRegions.has(p.pageId)))
  const navPages =
    categorizeMode && catReentry ? uncategorizedLogical
    : !categorizeMode && categorizedLogical.length > 0 ? categorizedLogical
    : allLogical
  // Monotonic order key over (sheet, region). region index < 1000 by any sane use, so the
  // ×1000 keeps the sheet number dominant. Works even when the current page is NOT in
  // navPages (e.g. sitting on a source sheet): next/prev are still found by key comparison.
  const navOrderKey = (pageNum, pageId) => pageNum * 1000 + regionIndexOf(pageId)
  const curNavKey = currentPageId != null ? navOrderKey(currentPage, currentPageId) : -1
  const prevNavDisabled = renderingPage || !navPages.some(p => navOrderKey(p.pageNum, p.pageId) < curNavKey)
  const nextNavDisabled = renderingPage || !navPages.some(p => navOrderKey(p.pageNum, p.pageId) > curNavKey)
  const handlePageNav = (dir) => {
    if (!navPages.length) return
    const target = dir > 0
      ? navPages.find(p => navOrderKey(p.pageNum, p.pageId) > curNavKey)
      : [...navPages].reverse().find(p => navOrderKey(p.pageNum, p.pageId) < curNavKey)
    if (target) goToPageId(target.pageId)
  }
  const pageHasScale = currentPageId && !!getEffectiveScale(currentPageId)
  const ghostSrc = currentPageId ? getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current) : null
  const isConfirmed = !!(pageTransformsRef.current[currentPageId]?.confirmed)
  const alignStarted = (() => { const t = pageTransformsRef.current[currentPageId]; return !!(t && (t.tx || t.ty || t.s !== 1)) })()
  const refLayerLabel = kindToLabel(REFERENCE_KIND_DEFAULT)
  const drawDisabledHint = (() => {
    if (currentPageIsSourceSheet) return 'This page has carved regions — navigate to a region to draw.'
    if (pageHasScale) return null
    if (ghostSrc) return alignStarted
      ? 'Confirm scale & alignment to enable drawing.'
      : `Confirm alignment to the ${refLayerLabel} to enable drawing.`
    return 'Set scale to enable drawing.'
  })()
  // Pages that can serve as reference for alignment: own calibration OR confirmed+parent.
  // Used for the reference override picker (Piece C). Reads refs; re-evaluated on alignTick.
  const refCandidates = ghostSrc ? pages.filter(p =>
    p.pageId !== currentPageId &&
    p.category === 'floor-plan' &&
    (pageScalesRef.current[p.pageId] ||
     (pageTransformsRef.current[p.pageId]?.confirmed && pageRefParentRef.current[p.pageId] != null))
  ) : []

  const lockedShapesOnPage = currentPage
    ? completedShapesRef.current.filter(s => s.pageId === currentPageId)
    : []

  // ── Elevation edge mode (Step 8, Piece 1) ────────────────────────────────────
  const currentPageCategory = pages.find(p => p.pageId === currentPageId)?.category
  const isElevationPage = currentPageCategory === 'elevation'
  const isPlanOrRoofPage = currentPageCategory === 'floor-plan' || currentPageCategory === 'roof-plan'
  // Floor plan pages with at least one locked shape, ordered by FLOOR_ORDER then pageNum.
  const elevEdgeFloorCandidates = pages
    .filter(p => p.category === 'floor-plan' &&
      completedShapesRef.current.some(s => s.pageId === p.pageId && s.status === 'locked'))
    .sort((a, b) => {
      const ai = FLOOR_ORDER.indexOf(a.subLabel), bi = FLOOR_ORDER.indexOf(b.subLabel)
      const aRank = ai === -1 ? 999 : ai, bRank = bi === -1 ? 999 : bi
      if (aRank !== bRank) return aRank - bRank
      return a.pageNum - b.pageNum
    })

  const hasSlopedOnPage = lockedShapesOnPage.some(s => s.roofType === 'sloped')
  const gradeLineOnPage = lockedShapesOnPage.some(s => s.shapeKind === 'grade-line')

  const hasCombinableShapes = editMode
    ? getEligibleShapes(completedShapesRef.current, currentPageId).size >= 2
    : false

  const canApplyCombine = combineSelection.length === 2 && (() => {
    const [a, b] = combineSelection
    const shapes = completedShapesRef.current
    return !!(shapes[a] && shapes[b] && findCollinearOverlap(shapes[a].vertices, shapes[b].vertices))
  })()

  const splitResult = splitSelected !== null && splitCut.length === 2
    ? splitPolygon(completedShapesRef.current[splitSelected]?.vertices || [], splitCut[0], splitCut[1])
    : null
  const canApplySplit = !!splitResult


  // ── B5: deriveWireframe() ─────────────────────────────────────────────────
  // Returns plain data for the 3D wireframe view. Pure derivation, no rendering.
  // floorRings: one entry per locked wall polygon per floor level.
  // roofRing: first locked wall polygon on any confirmed roof page, or null.
  // All Z values in METERS. XY in building-fixed world meters (pageVertexToWorld space).
  // Roof Z assumption: ceilingZ of the highest floor level (slope Z deferred, #18).
  const deriveWireframe = () => {
    const origin = getWorldOriginM()
    if (!origin) return { floorRings: [], roofRing: null, soffitLines: [], openingLines: [], runLines: [], solids: [] }

    const presentLevels = FLOOR_ORDER.filter(level =>
      pages.some(p => p.category === 'floor-plan' && p.subLabel === level)
    )
    const zStack = accumulateZ(floorHeightsRef.current, presentLevels, FLOOR_ORDER)

    const floorPageMap = {}
    for (const fp of pages.filter(p => p.category === 'floor-plan' && isKnownFloorLabel(p.subLabel))) {
      if (!floorPageMap[fp.subLabel]) floorPageMap[fp.subLabel] = fp
    }

    const floorRings = []
    const solids = []
    for (const row of zStack) {
      const floorPage = floorPageMap[row.level]
      if (!floorPage) continue
      if (!getEffectiveScale(floorPage.pageId)) continue

      const wallShapes = completedShapesRef.current.filter(
        s => s.pageId === floorPage.pageId && s.status === 'locked' && !s.shapeKind
      )
      for (const shape of wallShapes) {
        const verts = []
        let ok = true
        for (const v of shape.vertices) {
          const w = pageVertexToWorld(v, floorPage.pageId)
          if (!w) { ok = false; break }
          verts.push({ x: w.x, y: w.y })
        }
        if (ok && verts.length >= 3) {
          const ringFloorZ    = feetToMeters(row.floorZ ?? 0)
          const ringCeilingZ  = row.ceilingZ != null ? feetToMeters(row.ceilingZ) : null
          floorRings.push({ level: row.level, shapeId: shape.id, floorZ: ringFloorZ, ceilingZ: ringCeilingZ, verts })

          // Wall panel solids: library-tier surfaces with resolved totalThicknessM gain 3D depth.
          // assemblyType 'wall' → grows INWARD (polygon traced at structural outside).
          // Other types → grows OUTWARD. Manual/unset → no panel (zero-thickness plane unchanged).
          if (ringCeilingZ != null) {
            for (let si = 0; si < verts.length; si++) {
              const wA = verts[si], wB = verts[(si + 1) % verts.length]
              const wallId = `wall-${shape.id}-seg${si}-${row.level.replace(/\s/g, '_')}`
              const sa = getSurfaceAssembly(wallId)
              if (sa.source !== 'library' || !sa.thicknessM || !sa.assemblyType) continue
              const dx = wB.x - wA.x, dy = wB.y - wA.y
              const edgeLen = Math.hypot(dx, dy)
              if (edgeLen < 0.001) continue
              // Left-hand perpendicular of A→B direction; test which side is polygon interior
              const px1 = -dy / edgeLen, py1 = dx / edgeLen
              const midX = (wA.x + wB.x) / 2, midY = (wA.y + wB.y) / 2
              const isPerp1Interior = pointInPolygon({ x: midX + px1 * 0.01, y: midY + py1 * 0.01 }, verts)
              // sign: +1 when perp1 is interior, −1 when perp2 is interior
              const sign     = isPerp1Interior ? 1 : -1
              // growDir: +1 = interior (walls), −1 = exterior (floor/roof/foundation)
              const growDir  = sa.assemblyType === 'wall' ? 1 : -1
              const gx = sign * growDir * px1
              const gy = sign * growDir * py1
              const t = sa.thicknessM
              solids.push({
                kind: 'wall-panel',
                ax: wA.x,         ay: wA.y,
                bx: wB.x,         by: wB.y,
                iax: wA.x + gx * t, iay: wA.y + gy * t,
                ibx: wB.x + gx * t, iby: wB.y + gy * t,
                floorZ: ringFloorZ, ceilingZ: ringCeilingZ,
                color: 0x4ade80,  // green: wall assembly depth
              })
            }
          }
        }
      }
    }

    // Roof ring: first confirmed roof page with a locked wall polygon
    let roofRing = null
    const topRow = zStack.length > 0 ? zStack[zStack.length - 1] : null
    const roofZFallback = topRow?.ceilingZ != null ? feetToMeters(topRow.ceilingZ) : null
    for (const rp of pages.filter(p => p.category === 'roof-plan')) {
      if (!pageTransformsRef.current[rp.pageId]?.confirmed) continue
      if (!getEffectiveScale(rp.pageId)) continue
      const roofShapes = completedShapesRef.current.filter(
        s => s.pageId === rp.pageId && s.status === 'locked' && !s.shapeKind
      )
      for (const shape of roofShapes) {
        const verts = []
        let ok = true
        for (const v of shape.vertices) {
          const w = pageVertexToWorld(v, rp.pageId)
          if (!w) { ok = false; break }
          verts.push({ x: w.x, y: w.y })
        }
        if (ok && verts.length >= 3) {
          roofRing = { z: roofZFallback, verts }
          break
        }
      }
      if (roofRing) break
    }

    // ── Soffit lines ────────────────────────────────────────────────────────
    // Re-derives wall/roof bboxes using the same source data as B4 deriveEnumeration STEP C.
    // soffitLines: flat array of { side, from:{x,y,z}, to:{x,y,z} } in world meters.
    // Each active soffit produces 3 segments: outer eave + 2 returns to wall edge.
    const worldBboxOf = (pageId) => {
      const shapes = completedShapesRef.current.filter(
        s => s.pageId === pageId && s.status === 'locked' && !s.shapeKind
      )
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const s of shapes) for (const v of s.vertices) {
        const w = pageVertexToWorld(v, pageId)
        if (!w) continue
        if (w.x < minX) minX = w.x; if (w.x > maxX) maxX = w.x
        if (w.y < minY) minY = w.y; if (w.y > maxY) maxY = w.y
      }
      return isFinite(minX) ? { minX, maxX, minY, maxY } : null
    }

    const soffitLines = []
    const soffitThr = projectConfigRef.current.soffitCombineThresholdM ?? 0.05
    const eaveZm = topRow?.ceilingZ != null ? feetToMeters(topRow.ceilingZ) : null
    const highestLevel = presentLevels.length > 0 ? presentLevels[presentLevels.length - 1] : null
    const wallPageForSoffit = highestLevel ? floorPageMap[highestLevel] : null

    if (eaveZm != null && wallPageForSoffit) {
      const wallBbox = worldBboxOf(wallPageForSoffit.pageId)
      for (const rp of pages.filter(p => p.category === 'roof-plan')) {
        if (!pageTransformsRef.current[rp.pageId]?.confirmed) continue
        const roofBbox = worldBboxOf(rp.pageId)
        if (!roofBbox || !wallBbox) continue

        const Z = eaveZm
        const candidates = [
          { side: 'north', proj: wallBbox.minY - roofBbox.minY,
            outerA: { x: roofBbox.minX, y: roofBbox.minY, z: Z }, outerB: { x: roofBbox.maxX, y: roofBbox.minY, z: Z },
            retLA:  { x: roofBbox.minX, y: roofBbox.minY, z: Z }, retLB:  { x: roofBbox.minX, y: wallBbox.minY, z: Z },
            retRA:  { x: roofBbox.maxX, y: roofBbox.minY, z: Z }, retRB:  { x: roofBbox.maxX, y: wallBbox.minY, z: Z } },
          { side: 'south', proj: roofBbox.maxY - wallBbox.maxY,
            outerA: { x: roofBbox.minX, y: roofBbox.maxY, z: Z }, outerB: { x: roofBbox.maxX, y: roofBbox.maxY, z: Z },
            retLA:  { x: roofBbox.minX, y: roofBbox.maxY, z: Z }, retLB:  { x: roofBbox.minX, y: wallBbox.maxY, z: Z },
            retRA:  { x: roofBbox.maxX, y: roofBbox.maxY, z: Z }, retRB:  { x: roofBbox.maxX, y: wallBbox.maxY, z: Z } },
          { side: 'west',  proj: wallBbox.minX - roofBbox.minX,
            outerA: { x: roofBbox.minX, y: roofBbox.minY, z: Z }, outerB: { x: roofBbox.minX, y: roofBbox.maxY, z: Z },
            retLA:  { x: roofBbox.minX, y: roofBbox.minY, z: Z }, retLB:  { x: wallBbox.minX, y: roofBbox.minY, z: Z },
            retRA:  { x: roofBbox.minX, y: roofBbox.maxY, z: Z }, retRB:  { x: wallBbox.minX, y: roofBbox.maxY, z: Z } },
          { side: 'east',  proj: roofBbox.maxX - wallBbox.maxX,
            outerA: { x: roofBbox.maxX, y: roofBbox.minY, z: Z }, outerB: { x: roofBbox.maxX, y: roofBbox.maxY, z: Z },
            retLA:  { x: roofBbox.maxX, y: roofBbox.minY, z: Z }, retLB:  { x: wallBbox.maxX, y: roofBbox.minY, z: Z },
            retRA:  { x: roofBbox.maxX, y: roofBbox.maxY, z: Z }, retRB:  { x: wallBbox.maxX, y: roofBbox.maxY, z: Z } },
        ]
        for (const { side, proj, outerA, outerB, retLA, retLB, retRA, retRB } of candidates) {
          if (proj > soffitThr) {
            soffitLines.push({ side, from: outerA, to: outerB })
            soffitLines.push({ side, from: retLA,  to: retLB  })
            soffitLines.push({ side, from: retRA,  to: retRB  })
          }
        }
      }
    }

    // ── Opening lines ────────────────────────────────────────────────────────
    // For each opening (window/door) on an elevation page with confirmed scale + edge:
    // compute its world XY from the canvas X position relative to the elevation edge midpoint,
    // world Z from elevYToWorldZ, then build a 4-segment rectangle in the wall plane.
    // openingLines: flat array of { id, from:{x,y,z}, to:{x,y,z} } in world meters.
    const openingLines = []
    for (const ep of pages.filter(p => p.category === 'elevation')) {
      const elevScale = pageScalesRef.current[ep.pageId]
      if (!elevScale?.pxPerMeter) continue
      const edgeData = resolveElevEdge(ep.pageId)
      if (!edgeData) continue

      const wA = pageVertexToWorld(edgeData.A, edgeData.sourcePageId)
      const wB = pageVertexToWorld(edgeData.B, edgeData.sourcePageId)
      if (!wA || !wB) continue

      const edgeDx = wB.x - wA.x, edgeDy = wB.y - wA.y
      const edgeLen = Math.hypot(edgeDx, edgeDy)
      if (edgeLen < 0.001) continue
      const dirX = edgeDx / edgeLen, dirY = edgeDy / edgeLen
      const wMidX = (wA.x + wB.x) / 2, wMidY = (wA.y + wB.y) / 2
      const midPxX = (edgeData.A.x + edgeData.B.x) / 2
      const midPxY = (edgeData.A.y + edgeData.B.y) / 2

      const openings = completedShapesRef.current.filter(
        s => s.pageId === ep.pageId && s.status === 'locked' && isOpening(s)
      )
      for (const op of openings) {
        if (!op.widthM || !op.heightM) continue
        const centX = op.vertices.reduce((sum, v) => sum + v.x, 0) / op.vertices.length
        const centY = op.vertices.reduce((sum, v) => sum + v.y, 0) / op.vertices.length
        const edx = edgeData.B.x - edgeData.A.x
        const edy = edgeData.B.y - edgeData.A.y
        const edgeLenPx = Math.hypot(edx, edy)
        const projPx = edgeLenPx > 0 ? ((centX - midPxX) * edx + (centY - midPxY) * edy) / edgeLenPx : 0
        const hOffsetM = pxToMeters(projPx, { [ep.pageId]: elevScale }, ep.pageId)
        const worldZm = elevYToWorldZ(centY, ep.pageId)
        if (worldZm == null) continue

        const cx = wMidX + dirX * hOffsetM, cy = wMidY + dirY * hOffsetM
        const hw = op.widthM / 2, hh = op.heightM / 2
        const TL = { x: cx - dirX*hw, y: cy - dirY*hw, z: worldZm + hh }
        const TR = { x: cx + dirX*hw, y: cy + dirY*hw, z: worldZm + hh }
        const BR = { x: cx + dirX*hw, y: cy + dirY*hw, z: worldZm - hh }
        const BL = { x: cx - dirX*hw, y: cy - dirY*hw, z: worldZm - hh }
        openingLines.push(
          { id: op.id, from: TL, to: TR },
          { id: op.id, from: TR, to: BR },
          { id: op.id, from: BR, to: BL },
          { id: op.id, from: BL, to: TL },
        )
      }
    }

    // ── Run lines ────────────────────────────────────────────────────────────
    // One segment per consecutive vertex pair per run. Z is scalar from the page's
    // floor level (or roofZFallback for roof-plan pages); no per-vertex Z.
    // Both characterized and uncharacterized runs appear.
    const runLines = []
    for (const run of completedShapesRef.current) {
      if (run.shapeKind !== 'run' || run.status !== 'locked') continue
      const slots = run.pointSlots
      if (!slots || slots.length < 2) continue
      const page = pages.find(p => p.pageId === run.pageId)
      if (!page) continue
      // Resolve scalar Z for the run's page
      let runZ = null
      if (page.category === 'floor-plan' && page.subLabel) {
        const row = zStack.find(r => r.level === page.subLabel)
        if (row?.floorZ != null) runZ = feetToMeters(row.floorZ)
      } else if (page.category === 'roof-plan') {
        runZ = roofZFallback
      }
      for (let i = 0; i < slots.length - 1; i++) {
        const wA = pageVertexToWorld(slots[i], run.pageId)
        const wB = pageVertexToWorld(slots[i + 1], run.pageId)
        if (!wA || !wB) continue
        runLines.push({
          id: run.id,
          category: run.spanSlots[i]?.category ?? null,
          from: { x: wA.x, y: wA.y, z: runZ },
          to:   { x: wB.x, y: wB.y, z: runZ },
        })
      }
    }

    // ── §8.3 Build 2: Derive solids (segment tubes + equipment blocks) ─────────
    // Pure parameter objects; no three.js geometry constructed here.
    const solidColorForCat = (cat) => {
      if (!cat) return 0x9ca3af
      if (cat === 'lineset') return 0xf59e0b
      return 0x6b7280
    }
    // Segment solids: one cylinder/box-swept per spanSlot per run.
    // Reuses the same page/Z resolution as runLines above.
    for (const run of completedShapesRef.current) {
      if (run.shapeKind !== 'run' || run.status !== 'locked') continue
      const slots = run.pointSlots
      if (!slots || slots.length < 2) continue
      const page = pages.find(p => p.pageId === run.pageId)
      if (!page) continue
      let runZ = null
      if (page.category === 'floor-plan' && page.subLabel) {
        const row = zStack.find(r => r.level === page.subLabel)
        if (row?.floorZ != null) runZ = feetToMeters(row.floorZ)
      } else if (page.category === 'roof-plan') {
        runZ = roofZFallback
      }
      for (let i = 0; i < slots.length - 1; i++) {
        const wA = pageVertexToWorld(slots[i], run.pageId)
        const wB = pageVertexToWorld(slots[i + 1], run.pageId)
        if (!wA || !wB) continue
        const spanCat = run.spanSlots[i]?.category ?? null
        const profile = SEGMENT_PROFILES[spanCat] ?? SEGMENT_PROFILE_FALLBACK
        const color = solidColorForCat(spanCat)
        const from = { x: wA.x, y: wA.y, z: runZ }
        const to   = { x: wB.x, y: wB.y, z: runZ }
        if (profile.sweep === 'extrude-circle') {
          solids.push({ id: `${run.id}-seg${i}`, kind: 'cylinder', from, to, radiusM: profile.diameterM / 2, color })
        } else if (profile.sweep === 'extrude-rect') {
          solids.push({ id: `${run.id}-seg${i}`, kind: 'box-swept', from, to, widthM: profile.widthM, heightM: profile.heightM, color })
        }
      }
    }

    // Point solids: one block per placed equipment item on derivable pages.
    for (const shape of completedShapesRef.current) {
      if (shape.shapeKind !== 'equipment-item' || shape.status !== 'locked') continue
      if (!shape.vertices || shape.vertices.length < 1) continue
      const page = pages.find(p => p.pageId === shape.pageId)
      if (!page) continue
      // Identical scalar-Z resolution to runLines / segment solids above.
      let equipZ = null
      if (page.category === 'floor-plan' && page.subLabel) {
        const row = zStack.find(r => r.level === page.subLabel)
        if (row?.floorZ != null) equipZ = feetToMeters(row.floorZ)
      } else if (page.category === 'roof-plan') {
        equipZ = roofZFallback
      }
      if (equipZ === null) continue
      const profile = POINT_PROFILES[shape.itemType]
      if (!profile) continue
      const wV = pageVertexToWorld(shape.vertices[0], shape.pageId)
      if (!wV) continue
      // center.z = floor Z + half-height so the block sits ON the level, not through it
      const centerZ = equipZ + profile.hM / 2
      solids.push({
        id: `${shape.id}-block`,
        kind: 'block',
        center: { x: wV.x, y: wV.y, z: centerZ },
        wM: profile.wM,
        dM: profile.dM,
        hM: profile.hM,
        color: 0x8b5cf6,
      })
    }

    return { floorRings, roofRing, soffitLines, openingLines, runLines, solids }
  }

  // ── Dev fixture: snapshot / restore (DEV only) ───────────────────────────
  if (import.meta.env.DEV) {
    window.__snapshotFixture = async () => {
      // Serialize the loaded PDF bytes into the fixture so restore is self-contained.
      let documents = []
      if (pdf) {
        try {
          const bytes = await pdf.getData()
          const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
          documents = [{ pdfBase64: btoa(binary), fileName }]
        } catch (err) {
          console.warn('[fixture] Could not serialize PDF bytes:', err)
        }
      }
      return {
        _version: 1,
        documents,
        // React state (scenario-defining only; ephemeral mode flags excluded)
        currentPage,
        currentPageId,
        pageCount,
        fileName,
        pages,
        compassAngleDeg,
        compassCardinal,
        compassPos,
        frontFace,
        snapIncrement,
        showGhostByPageId,
        // Refs
        completedShapes: completedShapesRef.current,
        pageScales:      pageScalesRef.current,
        pageGridOrigin:  pageGridOriginRef.current,
        pageIdMap:       pageIdMapRef.current,
        pageTransforms:  pageTransformsRef.current,
        pageCrops:       pageCropsRef.current,
        floorHeights:    floorHeightsRef.current,
        elevationEdge:   elevationEdgeRef.current,
        elevBaseY:       elevBaseYRef.current,
        pageRefParent:   pageRefParentRef.current,
        primaryReferenceId: primaryReferenceIdRef.current,
        roofGraph:       roofGraphRef.current,
        roofVertCounter: roofVertCounterRef.current,
        roofEdgeCounter: roofEdgeCounterRef.current,
        surfaceAssembly: surfaceAssemblyRef.current,
      }
    }

    window.__restoreFixture = async (obj) => {
      if (!obj || obj._version !== 1) { console.error('[fixture] invalid or missing _version field'); return }

      // 1. Restore all refs immediately (before any async work)
      // Drop any run shapes from pre-Build-1 fixtures that lack pointSlots (old shape).
      const rawShapes = obj.completedShapes ?? []
      completedShapesRef.current = rawShapes.filter(s => s.shapeKind !== 'run' || Array.isArray(s.pointSlots))
      pageScalesRef.current        = obj.pageScales        ?? {}
      pageGridOriginRef.current    = obj.pageGridOrigin    ?? {}
      pageIdMapRef.current         = obj.pageIdMap         ?? {}
      pageTransformsRef.current    = obj.pageTransforms    ?? {}
      // Fork B: restore crop hot-store. Prefer obj.pageCrops; else derive from pages[i].crop.
      pageCropsRef.current = obj.pageCrops ?? {}
      if (!obj.pageCrops) (obj.pages ?? []).forEach(p => { if (p.crop) pageCropsRef.current[p.pageId] = p.crop })
      // Defect-2 self-heal: regionCounterRef is not snapshotted. Rebuild it from the highest
      // region index already present on each sheet so the NEXT carve picks max+1 and cannot
      // collide with an existing region id (page-N-rK), even if the counter was lost.
      regionCounterRef.current = {}
      ;(obj.pages ?? []).forEach(p => {
        const m = /^page-(\d+)-r(\d+)$/.exec(p.pageId)
        if (m) {
          const n = parseInt(m[1], 10), k = parseInt(m[2], 10)
          regionCounterRef.current[n] = Math.max(regionCounterRef.current[n] ?? 0, k)
        }
      })
      floorHeightsRef.current      = obj.floorHeights      ?? {}
      elevationEdgeRef.current     = obj.elevationEdge     ?? {}
      elevBaseYRef.current         = obj.elevBaseY         ?? {}
      pageRefParentRef.current     = obj.pageRefParent     ?? {}
      primaryReferenceIdRef.current = obj.primaryReferenceId ?? null
      roofGraphRef.current         = obj.roofGraph         ?? { verts: [], edges: [] }
      roofVertCounterRef.current   = obj.roofVertCounter   ?? 0
      roofEdgeCounterRef.current   = obj.roofEdgeCounter   ?? 0
      surfaceAssemblyRef.current   = obj.surfaceAssembly   ?? {}
      snapIncrementRef.current     = obj.snapIncrement     ?? 0.1524

      // 2. Load PDF — from bundled base64 bytes if present, else legacy file fetch
      let pdfDoc
      if (obj.documents?.length > 0) {
        try {
          const binary = atob(obj.documents[0].pdfBase64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          pdfDoc = await pdfjsLib.getDocument({ data: bytes.buffer }).promise
        } catch (err) {
          console.error('[fixture] Failed to decode bundled PDF bytes:', err)
          return
        }
      } else {
        try {
          const resp = await fetch('/devFixtures/test-fixture.pdf')
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const buffer = await resp.arrayBuffer()
          pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise
        } catch (err) {
          console.error('[fixture] No bundled PDF in fixture and /devFixtures/test-fixture.pdf unavailable:', err)
          return
        }
      }

      // 3. Restore React state (triggers re-render cascade)
      //    Reset ephemeral modes first, then write scenario state
      setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
      setDrawMode(false); setReviewShape(null)
      gradeEndSnapRef.current = null; gradeFloorLineSnapRef.current = null
      setRoofShapeDraft(null); setRoofTypeDraft(null); setParapetWidthDraft('')
      setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null)
      setRoofLineMode(false); setRoofChainStartId(null)
      resetEditState()
      setAlignMode(false); alignDragRef.current = null
      setElevAlignMode(false); setElevEdgeMode(false); setElevEdgeSourcePageId(null)
      elevEdgeHoverRef.current = null; ffHoverRef.current = null
      setFrontFacePromptOpen(false)
      setCategorizeMode(false); setRecatPageId(null); setCatReentry(false)
      setShowFloorHeights(false)
      setCarveMode(false); carveDragRef.current = null; setCarvePending(null); setCarveRegionName('')
      resetZoomPan()

      // Scenario state
      setPages(obj.pages        ?? [])
      setCompassAngleDeg(obj.compassAngleDeg ?? null)
      setCompassCardinal(obj.compassCardinal ?? null)
      setCompassPos(obj.compassPos ?? { x: null, y: null })
      setFrontFace(obj.frontFace ?? null)
      setSnapIncrement(obj.snapIncrement ?? 0.1524)
      setShowGhostByPageId(obj.showGhostByPageId ?? {})
      setFileName(obj.fileName ?? 'test-fixture.pdf')
      setPageCount(obj.pageCount ?? pdfDoc.numPages)
      setPdf(pdfDoc)

      // 4. Render the target page (async — must be after setPdf so canvasRef is ready).
      // currentPageId is the authoritative target (correct for region pages); fall back to
      // decoding the sheet number for pre-region snapshots that stored only currentPage.
      backdropTierRef.current = 'normal'; setBackdropTier('normal')
      const targetPageId = obj.currentPageId ?? getPageId(obj.currentPage ?? 1)
      await renderPage(pdfDoc, targetPageId)

      // 5. Bump ticks to force dependent repaints (alignTick drives pdf-align-layer, floorHeightsTick drives ref lines)
      setAlignTick(t => t + 1)
      setFloorHeightsTick(t => t + 1)
      setEnumerationTick(t => t + 1)

      console.log('[fixture] restore complete → page', targetPageId, '| shapes:', completedShapesRef.current.length, '| scales:', Object.keys(pageScalesRef.current))
    }

    // __dumpWorld(): DEV console verification for B1+B2 seams (meters throughout).
    // Prints world XY (m) for every floor-plan page's wall polygon vertices;
    // world Z (m) from elevYToWorldZ sampled at the anchor Y of each elevation page;
    // which page is the world origin; any page missing an effective scale.
    // Recon "separate canvas spaces" resolved: composition is in meters via each page's
    // own pxToMeters — sheet size differences do not affect world coordinates.
    window.__dumpWorld = () => {
      const origin = getWorldOriginM()
      if (!origin) { console.warn('[world] gate not met — no lowest-floor locked polygons with scale'); return }
      console.log(`[world] origin=${origin.originPageId} @ (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)}) m (expect 0,0 for origin page vertices)`)

      // Floor-plan pages: wall polygon vertices as world XY in meters
      const floorPages = pages.filter(p => p.category === 'floor-plan' && isKnownFloorLabel(p.subLabel))
      for (const fp of floorPages) {
        const shapes = completedShapesRef.current.filter(s => s.pageId === fp.pageId && s.status === 'locked' && !s.shapeKind)
        const scale = getEffectiveScale(fp.pageId)
        if (!scale) { console.warn(`[world] ${fp.subLabel} (${fp.pageId}): MISSING effective scale`); continue }
        console.log(`[world] ${fp.subLabel} (${fp.pageId}) pxPerMeter=${scale.pxPerMeter.toFixed(2)}${fp.pageId === origin.originPageId ? ' <- ORIGIN' : ''}`)
        if (!shapes.length) { console.log('  (no locked wall shapes)'); continue }
        shapes.forEach((s, si) => {
          const pts = s.vertices.map(v => {
            const w = pageVertexToWorld(v, fp.pageId)
            return w ? `(${w.x.toFixed(3)},${w.y.toFixed(3)})` : 'null'
          })
          console.log(`  shape[${si}]:`, pts.join(' '))
        })
      }

      // Elevation pages: sample Z at anchorY — must equal lowestFloorZ in meters
      const elevPages = pages.filter(p => p.category === 'elevation')
      const expectedAnchorZm = (fhZStack[0]?.floorZ ?? 0) * 0.3048
      for (const ep of elevPages) {
        const scale = pageScalesRef.current[ep.pageId]
        if (!scale?.pxPerMeter) { console.warn(`[world] elev ${ep.subLabel ?? ep.pageId}: no scale`); continue }
        const edgeData = resolveElevEdge(ep.pageId)
        if (!edgeData) { console.log(`[world] elev ${ep.subLabel ?? ep.pageId}: no elevation edge`); continue }
        const anchorY = elevBaseYRef.current[ep.pageId] ?? (edgeData.A.y + edgeData.B.y) / 2
        const zm = elevYToWorldZ(anchorY, ep.pageId)
        console.log(`[world] elev ${ep.subLabel ?? ep.pageId} (${ep.pageId}): Z@anchor=${zm?.toFixed(4) ?? 'null'} m (expect ${expectedAnchorZm.toFixed(4)} m)`)
      }

      // Roof-plan pages: wall polygon vertices as world XY in meters (same path as floor pages)
      const roofPages = pages.filter(p => p.category === 'roof-plan')
      for (const rp of roofPages) {
        const shapes = completedShapesRef.current.filter(s => s.pageId === rp.pageId && s.status === 'locked' && !s.shapeKind)
        const scale = getEffectiveScale(rp.pageId)
        if (!scale) { console.warn(`[world] roof (${rp.pageId}): MISSING effective scale — confirm alignment to a floor parent first`); continue }
        const confirmed = pageTransformsRef.current[rp.pageId]?.confirmed
        console.log(`[world] roof (${rp.pageId}) pxPerMeter=${scale.pxPerMeter.toFixed(2)}${confirmed ? ' [confirmed]' : ' [NOT confirmed — borrow not active]'}`)
        if (!shapes.length) { console.log('  (no locked roof wall shapes)'); continue }
        shapes.forEach((s, si) => {
          const pts = s.vertices.map(v => {
            const w = pageVertexToWorld(v, rp.pageId)
            return w ? `(${w.x.toFixed(3)},${w.y.toFixed(3)})` : 'null'
          })
          console.log(`  shape[${si}]:`, pts.join(' '))
        })
      }

      if (!floorPages.length && !elevPages.length && !roofPages.length) console.warn('[world] no categorized floor-plan, elevation, or roof-plan pages found')
    }

    // __setCrop(pageId, crop): DEV writer for the Fork B region-crop frame. Writes the hot
    // store (pageCropsRef) and the serialized mirror (pages[i].crop), then re-renders if the
    // affected page is current. Pass null to clear. crop = { x, y, w, h } in scaled-sheet pixels.
    window.__setCrop = (pageId, crop) => {
      if (crop) pageCropsRef.current[pageId] = crop
      else delete pageCropsRef.current[pageId]
      setPages(prev => prev.map(p => p.pageId === pageId ? { ...p, crop: crop || null } : p))
      if (currentPageId === pageId && pdf) renderPage(pdf, currentPageId)
      console.log(`[crop] ${pageId} →`, crop)
    }

    // __verifyCrop(): Fork B verification. Proves (1) renderPage establishes the crop-local frame
    // (measureRef + backdrop sized to the crop box), and (2) the crop offset is PASSIVE — imposing a
    // crop never moves the building's traced world coordinates (the placed-point world-coordinate
    // assertion). If the crop offset ever leaked into stored vertices or into pageVertexToWorld, the
    // world-coords-invariant checks below would fail.
    window.__verifyCrop = async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms))
      const origin = getWorldOriginM()
      if (!origin) { console.warn('[verifyCrop] gate not met — no calibrated lowest-floor geometry. Restore a multi-floor fixture first.'); return }
      const opid = origin.originPageId
      const opage = pages.find(p => p.pageId === opid)
      if (!opage) { console.warn('[verifyCrop] origin page not in pages array'); return }
      const mult = BACKDROP_MULTIPLIERS[backdropTierRef.current] ?? 1

      // Baseline world coords of the origin page's locked wall-shape vertices (no crop).
      const worldOf = () => completedShapesRef.current
        .filter(s => s.pageId === opid && s.status === 'locked' && !s.shapeKind)
        .map(s => s.vertices.map(v => { const w = pageVertexToWorld(v, opid); return w ? `${w.x.toFixed(6)},${w.y.toFixed(6)}` : 'null' }).join(' '))
        .join(' | ')
      const baseline = worldOf()

      let pass = 0, fail = 0
      const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`[verifyCrop] ${ok ? 'pass' : 'FAIL'} (${name})${detail ? '  ' + detail : ''}`) }

      const renderCrop = async (crop) => {
        pageCropsRef.current[opid] = crop
        await renderPage(pdf, opid)
        await sleep(150)
      }
      const clearCrop = async () => {
        delete pageCropsRef.current[opid]
        await renderPage(pdf, opid)
        await sleep(150)
      }
      const dimsOk = (crop, label) => {
        const m = measureRef.current, c = canvasRef.current
        check(`${label}: measureRef = crop box`, m.width === crop.w && m.height === crop.h, `got ${m.width}×${m.height} expect ${crop.w}×${crop.h}`)
        check(`${label}: backdrop bitmap = crop × mult`, c.width === Math.round(crop.w * mult) && c.height === Math.round(crop.h * mult), `got ${c.width}×${c.height} mult=${mult}`)
        // Auto-fit legitimately scales CSS dimensions beyond the raw crop box, so we
        // check UNIFORM scale (scaleX ≈ scaleY) rather than absolute pixels.
        // This directly tests the no-distortion guarantee; a non-uniform stretch fails it.
        const cssW = parseFloat(c.style.width), cssH = parseFloat(c.style.height)
        const sX = cssW / crop.w, sY = cssH / crop.h
        check(`${label}: backdrop CSS uniform scale (no distortion)`, Math.abs(sX - sY) < 0.001, `got ${c.style.width}×${c.style.height}  scaleX=${sX.toFixed(4)} scaleY=${sY.toFixed(4)}`)
        // RENDERED-BOX aspect must equal the BITMAP aspect. The inline-style check above only
        // proves the style is internally uniform; it does NOT prove the browser HONORED that
        // style. A max-width clamp (the wide-region squish) reduces the USED width below the
        // inline width while leaving height intact, so the rendered box aspect diverges from
        // the bitmap aspect even though the inline style stayed uniform. Aspect ratio is
        // invariant under the uniform zoom/align transforms in the stack, so this is
        // transform-robust (comparing absolute widths would not be). This is the check that
        // measures the on-screen layer the inline-style check misses.
        const rect = c.getBoundingClientRect()
        const renderedAspect = rect.width / rect.height
        const bitmapAspect = c.width / c.height
        check(`${label}: rendered box aspect = bitmap aspect (no clamp/squish)`,
          Math.abs(renderedAspect - bitmapAspect) / bitmapAspect < 0.02,
          `rendered ${rect.width.toFixed(0)}×${rect.height.toFixed(0)} (a=${renderedAspect.toFixed(3)}) vs bitmap ${c.width}×${c.height} (a=${bitmapAspect.toFixed(3)})`)
      }

      const cropA = { x: 120, y: 90, w: 520, h: 380 }
      const cropB = { x: 300, y: 200, w: 440, h: 300 }
      // Deliberately wide/short crop (aspect ≈ 6.4): displayScale bakes an inline width far
      // exceeding the container, so a max-width:100% clamp WOULD squish it. This is the case
      // that gives the rendered-aspect check teeth — cropA/cropB are narrow enough that their
      // inline width fits the container and would not trip the clamp.
      const cropWide = { x: 30, y: 40, w: 960, h: 150 }

      await renderCrop(cropA)
      dimsOk(cropA, 'cropA')
      check('cropA: world coords invariant (placed-point)', worldOf() === baseline, worldOf() === baseline ? '' : 'world coords MOVED under crop')

      await renderCrop(cropB)
      dimsOk(cropB, 'cropB')
      check('cropB: world coords invariant (crop-origin independent)', worldOf() === baseline, worldOf() === baseline ? '' : 'world coords depend on crop origin')

      await renderCrop(cropWide)
      dimsOk(cropWide, 'cropWide')
      check('cropWide: world coords invariant', worldOf() === baseline, worldOf() === baseline ? '' : 'world coords depend on crop')

      await clearCrop()
      const m = measureRef.current
      check('cleared: measureRef back to full sheet (≠ crop)', m.width !== cropA.w && m.width !== cropB.w, `width=${m.width}`)
      check('cleared: world coords invariant', worldOf() === baseline, '')

      // Restore serialized mirror to clean (no crop) state.
      setPages(prev => prev.map(p => p.pageId === opid ? { ...p, crop: null } : p))
      console.log(`[verifyCrop] ${fail === 0 ? '✓ ALL ' + pass + ' checks PASSED' : pass + '/' + (pass + fail) + ' passed, ' + fail + ' FAILED'} (origin page ${opid})`)
    }

    // __dumpRegions(): print all region-pages grouped by source sheet, with crop bounds and
    // shape counts. Used to verify the two-regions-with-geometry partition check: shapes on
    // region r1 must not appear on r2 (each shape carries its own pageId).
    window.__dumpRegions = () => {
      const regionPages = pages.filter(p => p.crop != null)
      if (!regionPages.length) { console.log('[regions] no region-pages exist'); return }
      // Group by source sheet (pageNum)
      const bySheet = {}
      for (const p of regionPages) {
        if (!bySheet[p.pageNum]) bySheet[p.pageNum] = []
        bySheet[p.pageNum].push(p)
      }
      for (const [pNum, regions] of Object.entries(bySheet)) {
        const srcId = pageIdMapRef.current[Number(pNum)]
        const srcShapes = completedShapesRef.current.filter(s => s.pageId === srcId && s.status === 'locked')
        console.log(`[regions] sheet p.${pNum} (source=${srcId}) — ${srcShapes.length} shape(s) on source sheet`)
        for (const r of regions) {
          const rShapes = completedShapesRef.current.filter(s => s.pageId === r.pageId && s.status === 'locked')
          const cat = r.category ? `${r.category}${r.subLabel ? '/' + r.subLabel : ''}` : 'uncategorized'
          // Build-2 verification aid: a region carved from an aligned/scaled source must carry its
          // OWN propagated scale (source pxPerMeter ÷ s) on its OWN pageId, with NO refParent.
          const own = pageScalesRef.current[r.pageId]
          const ownStr = own?.pxPerMeter ? `ownScale=${own.pxPerMeter.toFixed(2)}px/m` : 'uncalibrated'
          const parentStr = pageRefParentRef.current[r.pageId] ? ` refParent=${pageRefParentRef.current[r.pageId]}` : ' refParent=none'
          const cx = r.crop.x.toFixed(1), cy = r.crop.y.toFixed(1), cw = r.crop.w.toFixed(1), ch = r.crop.h.toFixed(1)
          console.log(`  ${r.pageId}  crop=(${cx},${cy} ${cw}×${ch})  ${ownStr}${parentStr}  [${cat}]  ${rShapes.length} shape(s)`)
          // Partition check: none of these shapes should appear on other regions from the same sheet
          const otherRegionIds = regions.filter(q => q.pageId !== r.pageId).map(q => q.pageId)
          for (const s of rShapes) {
            if (otherRegionIds.some(id => id === s.pageId)) {
              console.warn(`  *** PARTITION VIOLATION: shape ${s.id} pageId=${s.pageId} appears in multiple regions`)
            }
          }
        }
      }
      // Overall partition summary
      const allRegionIds = regionPages.map(p => p.pageId)
      const allShapes = completedShapesRef.current.filter(s => allRegionIds.includes(s.pageId) && s.status === 'locked')
      const ids = allShapes.map(s => s.id)
      const unique = new Set(ids)
      console.log(`[regions] partition: ${allShapes.length} shapes across ${regionPages.length} regions — all IDs unique: ${ids.length === unique.size}`)
    }

    // __dumpRuns(): slot-structure + vertices invariant verification for §8.3 Build 1.
    window.__dumpRuns = () => {
      const runs = completedShapesRef.current.filter(r => r.shapeKind === 'run' && r.status === 'locked')
      if (!runs.length) { console.log('[runs] none placed'); return }
      for (const run of runs) {
        const cat = run.spanSlots?.[0]?.category ?? '(uncharacterized)'
        const vertCount = run.vertices?.length ?? 'MISSING'
        const slotCount = run.pointSlots?.length ?? 'MISSING'
        const lenMatch = vertCount === slotCount ? 'MATCH' : `MISMATCH (vertices=${vertCount} slots=${slotCount})`
        const posAgree = (typeof vertCount === 'number' && typeof slotCount === 'number' && vertCount === slotCount)
          ? run.vertices.every((v, i) => v.x === run.pointSlots[i].x && v.y === run.pointSlots[i].y)
          : false
        console.log(`[runs] ${run.id}  category=${cat}  page=${run.pageId}`)
        console.log(`       vertCount=${vertCount}  slotCount=${slotCount}  ${lenMatch}  positions-agree=${posAgree}`)
        run.pointSlots.forEach((ps, i) => {
          const ref = ps.itemRef ? ` → ${ps.itemRef}` : ''
          console.log(`  [${i}] ${ps.id}  (${ps.x.toFixed(1)}, ${ps.y.toFixed(1)})${ref}`)
          if (i < run.spanSlots.length) {
            const ss = run.spanSlots[i]
            console.log(`       ${ss.id}  category=${ss.category ?? '—'}`)
          }
        })
      }
    }

    // __dumpSolids(): inspect solids derived by deriveWireframe for §8.3 Build 2.
    window.__dumpSolids = () => {
      const wf = deriveWireframe()
      const { solids = [] } = wf
      if (!solids.length) { console.log('[solids] none derived'); return }
      for (const s of solids) {
        if (s.kind === 'cylinder' || s.kind === 'box-swept') {
          const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y
          const len = Math.sqrt(dx * dx + dy * dy).toFixed(4)
          const extra = s.kind === 'cylinder' ? `radiusM=${s.radiusM}` : `widthM=${s.widthM} heightM=${s.heightM}`
          console.log(`[solids] ${s.id}  kind=${s.kind}  ${extra}  length=${len}m  category-color=${s.color.toString(16)}`)
        } else if (s.kind === 'block') {
          console.log(`[solids] ${s.id}  kind=block  wM=${s.wM} dM=${s.dM} hM=${s.hM}  center=(${s.center.x.toFixed(3)}, ${s.center.y.toFixed(3)}, ${s.center.z.toFixed(3)})m`)
        }
      }
    }

  }

  // ── Assembly library ingest ────────────────────────────────────────────────
  // Accepts a contract-shaped record; stores geometry-scoped + thermal fields.
  // Silently ignores tool-side fields: framing block, airFilms (baked into effectiveRSI).
  // controlLayers: null is a KEPT, MEANINGFUL value ("does not manage this function").
  const ingestAssembly = (record) => {
    if (!record || !record.assemblyId) { console.warn('[assembly] ingestAssembly: record missing assemblyId'); return }
    assemblyLibraryRef.current[record.assemblyId] = {
      assemblyId:      record.assemblyId,
      label:           record.label ?? null,
      assemblyType:    record.assemblyType ?? null,
      totalThicknessM: record.totalThicknessM ?? null,
      effectiveUValue: record.effectiveUValue ?? null,
      effectiveRSI:    record.effectiveRSI    ?? null,
      // Each controlLayers key may be a layerId string OR null (null = assembly does not
      // manage that function — preserve exactly, do not coerce). ?? null covers undefined keys.
      controlLayers: record.controlLayers
        ? {
            water:   record.controlLayers.water   ?? null,
            air:     record.controlLayers.air     ?? null,
            thermal: record.controlLayers.thermal ?? null,
            vapour:  record.controlLayers.vapour  ?? null,
          }
        : null,
      layers: Array.isArray(record.layers)
        ? record.layers.map(l => ({
            layerId:     l.layerId   ?? null,
            materialId:  l.materialId ?? null,
            thicknessM:  l.thicknessM ?? null,
            pathRole:    l.pathRole  ?? null,
          }))
        : [],
    }
  }

  // ── Assembly resolver — reads surfaceAssemblyRef per wall-surface ────────
  // Returns { effectiveUValue, effectiveRSI, controlLayers, thicknessM, layers, source, assemblyType }
  // source: 'unset' | 'manual' | 'library' | 'library-unresolved'
  const getSurfaceAssembly = (surfaceId) => {
    const ref = surfaceAssemblyRef.current[surfaceId]
    if (!ref) return { effectiveUValue: null, effectiveRSI: null, controlLayers: null, thicknessM: null, layers: null, source: 'unset', assemblyType: null }
    if (ref.tier === 'manual') return { effectiveUValue: ref.effectiveUValue ?? null, effectiveRSI: null, controlLayers: null, thicknessM: ref.thicknessM ?? null, layers: null, source: 'manual', assemblyType: null }
    if (ref.tier === 'library') {
      const rec = ref.assemblyId ? assemblyLibraryRef.current[ref.assemblyId] : null
      if (rec) return { effectiveUValue: rec.effectiveUValue ?? null, effectiveRSI: rec.effectiveRSI ?? null, controlLayers: rec.controlLayers ?? null, thicknessM: rec.totalThicknessM ?? null, layers: rec.layers, source: 'library', assemblyType: rec.assemblyType ?? null }
      return { effectiveUValue: null, effectiveRSI: null, controlLayers: null, thicknessM: null, layers: null, source: 'library-unresolved', assemblyType: null }
    }
    return { effectiveUValue: null, effectiveRSI: null, controlLayers: null, thicknessM: null, layers: null, source: 'unset', assemblyType: null }
  }

  // ── B4: deriveEnumeration() ──────────────────────────────────────────────
  // Returns an array of envelope elements (wall-surface, soffit, window, door).
  // Every derived quantity is a named property on the element — never a transient in render code (§7.3).
  // Reads refs at call time; never stores meters (recalibration-safe, #22).
  // Defined outside the DEV block so it is callable from render-time JSX (#52 panel).
  const deriveEnumeration = () => {
      const elements = []
      const origin = getWorldOriginM()
      if (!origin) return elements

      // Local fhZStack (same source as component-derived fhZStack)
      const presentLevels = FLOOR_ORDER.filter(level =>
        pages.some(p => p.category === 'floor-plan' && p.subLabel === level)
      )
      const zStack = accumulateZ(floorHeightsRef.current, presentLevels, FLOOR_ORDER)

      // Helper: world-space bbox of all locked wall polygons on a page
      const getWorldBbox = (pageId) => {
        const shapes = completedShapesRef.current.filter(
          s => s.pageId === pageId && s.status === 'locked' && !s.shapeKind
        )
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const s of shapes) {
          for (const v of s.vertices) {
            const w = pageVertexToWorld(v, pageId)
            if (!w) continue
            if (w.x < minX) minX = w.x; if (w.x > maxX) maxX = w.x
            if (w.y < minY) minY = w.y; if (w.y > maxY) maxY = w.y
          }
        }
        return isFinite(minX) ? { minX, maxX, minY, maxY } : null
      }

      // Floor-page lookup (first page per FLOOR_ORDER level)
      const floorPageMap = {}
      for (const fp of pages.filter(p => p.category === 'floor-plan' && isKnownFloorLabel(p.subLabel))) {
        if (!floorPageMap[fp.subLabel]) floorPageMap[fp.subLabel] = fp
      }

      const cfg = projectConfigRef.current
      const thr = cfg.soffitCombineThresholdM ?? 0.05

      // ── Opening association map — built before STEP A ─────────────────────────
      // Each elevation page has one reference edge (elevationEdgeRef). All openings
      // on that page are associated with the specific wall surface identified by the
      // triple (refShape.id, segmentIndex, floorLevel). This is the only unambiguous
      // per-segment join the current data model supports.
      //
      // LIMITATION: all openings on a multi-story elevation are attributed to the
      // single reference-edge wall surface on the reference-edge floor level. Openings
      // visible in the elevation but belonging to other floor levels cannot be mapped
      // to separate wall surfaces without multi-level elevation geometry (deferred).
      const openingsByWallId = {}
      for (const ep of pages.filter(p => p.category === 'elevation')) {
        const stored = elevationEdgeRef.current[ep.pageId]
        if (!stored) continue
        const refShape = completedShapesRef.current[stored.shapeIndex]
        if (!refShape) continue
        const srcPage = pages.find(p => p.pageId === stored.sourcePageId)
        if (!srcPage || !isKnownFloorLabel(srcPage.subLabel)) continue
        const refLevel = srcPage.subLabel
        const wallId = `wall-${refShape.id}-seg${stored.segmentIndex}-${refLevel.replace(/\s/g, '_')}`
        const elevOpenings = completedShapesRef.current.filter(
          s => s.pageId === ep.pageId && s.status === 'locked' && isOpening(s) &&
               s.widthM != null && s.heightM != null
        )
        if (elevOpenings.length === 0) continue
        if (!openingsByWallId[wallId]) openingsByWallId[wallId] = []
        openingsByWallId[wallId].push(...elevOpenings)
      }

      // ── STEP A: Wall surfaces — each polygon edge lifted to floor Z ──────────
      for (let li = 0; li < zStack.length; li++) {
        const row = zStack[li]
        const floorPage = floorPageMap[row.level]
        if (!floorPage) continue
        const scale = getEffectiveScale(floorPage.pageId)
        if (!scale) continue

        const floorZm   = feetToMeters(row.floorZ ?? 0)
        const ceilingZm = row.ceilingZ  != null ? feetToMeters(row.ceilingZ) : null
        const heightM   = row.floorToCeiling != null ? feetToMeters(row.floorToCeiling) : null

        // STEP B: reconcile vs floor below (closest-approach rule)
        // Pre-project all floor-below polygon vertices to world meters once per level pair.
        const belowRow  = li > 0 ? zStack[li - 1] : null
        const belowPage = belowRow ? floorPageMap[belowRow.level] : null
        // belowWorldShapes: array of world-meter vertex arrays, one per locked wall polygon on the below floor
        const belowWorldShapes = belowPage
          ? completedShapesRef.current
              .filter(s => s.pageId === belowPage.pageId && s.status === 'locked' && !s.shapeKind)
              .map(s => s.vertices.map(v => pageVertexToWorld(v, belowPage.pageId)).filter(Boolean))
              .filter(wv => wv.length >= 3)
          : []

        const reconcileThreshold = cfg.reconcileThresholdM ?? 0.05

        const wallShapes = completedShapesRef.current.filter(
          s => s.pageId === floorPage.pageId && s.status === 'locked' && !s.shapeKind
        )
        for (const shape of wallShapes) {
          for (let si = 0; si < shape.vertices.length; si++) {
            const vA = shape.vertices[si]
            const vB = shape.vertices[(si + 1) % shape.vertices.length]
            const wA = pageVertexToWorld(vA, floorPage.pageId)
            const wB = pageVertexToWorld(vB, floorPage.pageId)
            if (!wA || !wB) continue

            const dx = wB.x - wA.x
            const dy = wB.y - wA.y
            const widthM = Math.sqrt(dx * dx + dy * dy)

            // Compass bearing of edge direction: atan2(dx, -dy) where canvas +Y = south
            const bearingRad = Math.atan2(dx, -dy)
            const orientationDeg = ((bearingRad * 180 / Math.PI) + 360) % 360

            // Reconcile: closest-approach signed perpendicular distance to floor-below polygon edges.
            // Unsigned minimum distance via distToSegment; sign from pointInPolygon on midpoint.
            // Works in world meters — same coordinate space as pageVertexToWorld output.
            let reconcile = null
            let signedDistM = null
            if (belowWorldShapes.length > 0) {
              const mx = (wA.x + wB.x) / 2
              const my = (wA.y + wB.y) / 2
              const mid = { x: mx, y: my }

              // Minimum unsigned distance from midpoint to any edge of any floor-below polygon
              let minDist = Infinity
              for (const wv of belowWorldShapes) {
                for (let bi = 0; bi < wv.length; bi++) {
                  const d = distToSegment(mid, wv[bi], wv[(bi + 1) % wv.length])
                  if (d < minDist) minDist = d
                }
              }

              // Sign: inside any floor-below polygon = setback (negative), outside = cantilever (positive)
              const insideBelow = belowWorldShapes.some(wv => pointInPolygon(mid, wv))
              signedDistM = insideBelow ? -minDist : minDist

              if (minDist <= reconcileThreshold) {
                reconcile = 'coincident'
              } else {
                reconcile = insideBelow ? 'setback' : 'cantilever'
              }
            }

            const wallId = `wall-${shape.id}-seg${si}-${row.level.replace(/\s/g, '_')}`
            const assocOpenings = openingsByWallId[wallId] ?? []
            const openingAreaM2 = assocOpenings.reduce((sum, op) => sum + op.widthM * op.heightM, 0)
            const grossAreaM2 = heightM != null ? widthM * heightM : null
            const netAreaM2 = grossAreaM2 != null ? Math.max(0, grossAreaM2 - openingAreaM2) : null
            const openingOverflow = grossAreaM2 != null && openingAreaM2 > grossAreaM2 ? true : undefined
            const sa = getSurfaceAssembly(wallId)

            elements.push({
              id: wallId,
              kind: 'wall-surface',
              floorLevel: row.level,
              pageId: floorPage.pageId,
              worldA: { x: wA.x, y: wA.y, z: floorZm },
              worldB: { x: wB.x, y: wB.y, z: floorZm },
              widthM,
              heightM,
              orientationDeg,
              floorZm,
              ceilingZm,
              reconcile,
              signedDistM,
              grossAreaM2,
              netAreaM2,
              openingAreaM2,
              associatedOpeningIds: assocOpenings.map(op => op.id),
              openingOverflow,
              effectiveUValue: sa.effectiveUValue,
              effectiveRSI:    sa.effectiveRSI,
              controlLayers:   sa.controlLayers,
              thicknessM: sa.thicknessM,
              assemblySource: sa.source,
              // F280 inside-face: for wall surfaces the traced polygon is the structural OUTSIDE;
              // the inside face is offset inward by thicknessM. For a rectangular flat wall the
              // inside and outside face have identical area (parallel planes, same width × height).
              // insideFaceAreaM2 = netAreaM2 today; corner-adjustment refinement is Phase 2.
              insideFaceAreaM2: netAreaM2,
            })
          }
        }
      }

      // ── STEP A.5: Flat-roof ceiling surface ─────────────────────────────────
      // One element per confirmed roof-plan page; footprint area from world-meter shoelace.
      // Sloped/pitched roof Z-derivation deferred (#18).
      const topRow = zStack.length > 0 ? zStack[zStack.length - 1] : null
      const roofCeilingZm = topRow?.ceilingZ != null ? feetToMeters(topRow.ceilingZ) : null
      for (const rp of pages.filter(p => p.category === 'roof-plan')) {
        if (!pageTransformsRef.current[rp.pageId]?.confirmed) continue
        const flatShapes = completedShapesRef.current.filter(
          s => s.pageId === rp.pageId && s.status === 'locked' && !s.shapeKind && s.roofType === 'flat'
        )
        if (!flatShapes.length) continue
        let totalAreaM2 = 0
        for (const shape of flatShapes) {
          const wv = shape.vertices.map(v => pageVertexToWorld(v, rp.pageId)).filter(Boolean)
          if (wv.length < 3) continue
          let a = 0
          for (let i = 0; i < wv.length; i++) {
            const p = wv[i], q = wv[(i + 1) % wv.length]
            a += p.x * q.y - q.x * p.y
          }
          totalAreaM2 += Math.abs(a) / 2
        }
        if (totalAreaM2 === 0) continue
        const surfaceId = `flat-roof-${rp.pageId}`
        const sa = getSurfaceAssembly(surfaceId)
        elements.push({
          id: surfaceId,
          kind: 'flat-roof-surface',
          pageId: rp.pageId,
          grossAreaM2: totalAreaM2,
          netAreaM2: totalAreaM2,    // no openings in roof ceiling today
          openingAreaM2: 0,
          insideFaceAreaM2: totalAreaM2,  // horizontal ceiling: interior face = traced footprint
          roofCeilingZm,
          effectiveUValue: sa.effectiveUValue,
          effectiveRSI:    sa.effectiveRSI,
          controlLayers:   sa.controlLayers,
          thicknessM:      sa.thicknessM,
          assemblySource:  sa.source,
        })
      }

      // ── STEP C: Soffit/eave — roof bbox vs wall-below bbox ──────────────────
      // Roof polygon larger than wall below on a side → overhang → soffit element.
      // Coincident-but-distinct surfaces are not merged (#19).
      const roofPagesArr = pages.filter(p => p.category === 'roof-plan')
      for (const rp of roofPagesArr) {
        if (!pageTransformsRef.current[rp.pageId]?.confirmed) continue
        const roofBbox = getWorldBbox(rp.pageId)
        if (!roofBbox) continue

        const highestLevel = presentLevels.length > 0 ? presentLevels[presentLevels.length - 1] : null
        const wallPage = highestLevel ? floorPageMap[highestLevel] : null
        if (!wallPage) continue
        const wallBbox = getWorldBbox(wallPage.pageId)
        if (!wallBbox) continue

        // Z of roof eave = ceiling of highest floor (top of stack)
        const topRow = zStack[zStack.length - 1]
        const eaveZm = topRow?.ceilingZ != null ? feetToMeters(topRow.ceilingZ) : null

        // Per side: positive projection = roof extends beyond wall
        const sides = [
          { side: 'north', projection: wallBbox.minY - roofBbox.minY, spanM: roofBbox.maxX - roofBbox.minX },
          { side: 'south', projection: roofBbox.maxY - wallBbox.maxY, spanM: roofBbox.maxX - roofBbox.minX },
          { side: 'west',  projection: wallBbox.minX - roofBbox.minX, spanM: roofBbox.maxY - roofBbox.minY },
          { side: 'east',  projection: roofBbox.maxX - wallBbox.maxX, spanM: roofBbox.maxY - roofBbox.minY },
        ]
        for (const { side, projection, spanM } of sides) {
          if (projection > thr) {
            elements.push({
              id: `soffit-${rp.pageId}-${side}`,
              kind: 'soffit',
              floorLevel: highestLevel,
              pageId: rp.pageId,
              side,
              projectionM: projection,
              spanM,
              eaveZm,
              // Soffit is horizontal; the traced surface IS the interior face — no offset.
              insideFaceAreaM2: projection * spanM,
            })
          }
        }
      }

      // ── STEP D: Fenestration — openings on elevation pages get world Z ───────
      for (const ep of pages.filter(p => p.category === 'elevation')) {
        if (!pageScalesRef.current[ep.pageId]?.pxPerMeter) continue
        if (!resolveElevEdge(ep.pageId)) continue

        const openings = completedShapesRef.current.filter(
          s => s.pageId === ep.pageId && s.status === 'locked' && isOpening(s)
        )
        for (const op of openings) {
          const centroidY = op.vertices.reduce((sum, v) => sum + v.y, 0) / op.vertices.length
          const worldZm = elevYToWorldZ(centroidY, ep.pageId)
          elements.push({
            id: `${op.shapeKind}-${op.id}-${ep.pageId}`,
            kind: op.shapeKind,
            floorLevel: null,
            pageId: ep.pageId,
            label: op.label ?? null,
            openingType: op.openingType ?? null,
            widthM: op.widthM ?? null,
            heightM: op.heightM ?? null,
            dimBasis: op.dimBasis ?? null,
            uw: op.uw ?? null,
            shgc: op.shgc ?? null,
            worldZm,
          })
        }
      }

      return elements
  }

  if (import.meta.env.DEV) {
    // __dumpEnumeration(): B4 console verification — enumerate all envelope elements with size + orientation.
    // Verbose: every element printed individually with full geometry + reconcile tag.
    // Extends __dumpWorld pattern (§7.1, §7.3). DEV-only; tree-shaken in production.
    window.__dumpEnumeration = () => {
      const elements = deriveEnumeration()
      if (!elements.length) { console.warn('[enum] empty — check fixture loaded and floors/roof confirmed'); return }

      // ── Polygon edge counts for reconcile audit ──────────────────────────────
      console.log('[enum] --- polygon edge counts ---')
      const seenPages = new Set()
      for (const el of elements) {
        if (el.kind !== 'wall-surface' || seenPages.has(el.pageId + el.floorLevel)) continue
        seenPages.add(el.pageId + el.floorLevel)
        const count = elements.filter(e => e.kind === 'wall-surface' && e.pageId === el.pageId && e.floorLevel === el.floorLevel).length
        console.log(`  ${el.floorLevel} (${el.pageId}): ${count} edges`)
      }
      const roofPage = pages.find(p => p.category === 'roof-plan')
      if (roofPage) {
        const roofShapes = completedShapesRef.current.filter(s => s.pageId === roofPage.pageId && s.status === 'locked' && !s.shapeKind)
        const edgeCount = roofShapes.reduce((n, s) => n + s.vertices.length, 0)
        console.log(`  roof (${roofPage.pageId}): ${edgeCount} polygon edges (not wall-surfaces — soffit derived from bbox)`)
      }
      console.log(`[enum] ${elements.length} total elements`)
      console.log('[enum] --- per-element detail ---')

      // ── Per-element verbose lines ────────────────────────────────────────────
      let prevKind = null
      for (const el of elements) {
        if (el.kind !== prevKind) {
          console.log(`[enum] === ${el.kind.toUpperCase()} ===`)
          prevKind = el.kind
        }
        if (el.kind === 'wall-surface') {
          const wStr = el.widthM   != null ? el.widthM.toFixed(4) + 'm'  : 'w=null'
          const hStr = el.heightM  != null ? el.heightM.toFixed(4) + 'm' : 'h=null (floor heights not entered)'
          const fStr = el.floorZm  != null ? el.floorZm.toFixed(4) + 'm'  : 'null'
          const cStr = el.ceilingZm != null ? el.ceilingZm.toFixed(4) + 'm' : 'null'
          const oStr = el.orientationDeg != null ? el.orientationDeg.toFixed(1) + '°' : 'null'
          const rStr = el.reconcile ?? 'null (base floor — no floor below)'
          const dStr = el.signedDistM != null
            ? `${el.signedDistM >= 0 ? '+' : ''}${el.signedDistM.toFixed(4)}m (${el.signedDistM < 0 ? 'inside' : 'outside'} floor-below)`
            : 'n/a'
          const gStr = el.grossAreaM2 != null ? el.grossAreaM2.toFixed(4) + 'm²' : 'null (no floor height)'
          const nStr = el.netAreaM2   != null ? el.netAreaM2.toFixed(4)   + 'm²' : 'null'
          const oaStr = el.openingAreaM2.toFixed(4) + 'm²' + (el.associatedOpeningIds.length ? ` (${el.associatedOpeningIds.length} opening${el.associatedOpeningIds.length > 1 ? 's' : ''})` : '')
          // Partition assertion: gross == net + openingArea within epsilon
          const partitionOk = el.grossAreaM2 == null
            ? null  // can't check without gross
            : Math.abs(el.grossAreaM2 - (el.netAreaM2 ?? 0) - el.openingAreaM2) < 0.0001
          const partStr = partitionOk == null ? 'N/A (no gross)' : (partitionOk ? 'PASS' : 'FAIL')
          const uvStr = el.effectiveUValue != null ? el.effectiveUValue.toFixed(4) + ' W/m²K' : 'null'
          const thStr = el.thicknessM    != null ? el.thicknessM.toFixed(4)    + ' m'      : 'null'
          const ifStr = el.insideFaceAreaM2 != null ? el.insideFaceAreaM2.toFixed(4) + 'm²' : 'null (no floor height)'
          console.log(
            `  ${el.id}\n` +
            `    page:${el.pageId}  floor:${el.floorLevel}\n` +
            `    width=${wStr}  height=${hStr}\n` +
            `    gross=${gStr}  net=${nStr}  openings=${oaStr}\n` +
            `    partition gross==net+openings: ${partStr}${el.openingOverflow ? '  ⚠ openingOverflow' : ''}\n` +
            `    floorZ=${fStr}  ceilingZ=${cStr}  bearing=${oStr}\n` +
            `    signedDist=${dStr}\n` +
            `    reconcile: ${rStr}\n` +
            `    assembly: ${el.assemblySource}  U=${uvStr}  thickness=${thStr}\n` +
            `    insideFaceArea=${ifStr}`
          )
        } else if (el.kind === 'soffit') {
          const pStr = el.projectionM.toFixed(4) + 'm'
          const sStr = el.spanM != null ? el.spanM.toFixed(4) + 'm' : 'null'
          const zStr = el.eaveZm != null ? el.eaveZm.toFixed(4) + 'm' : 'null (no ceiling Z for top floor)'
          console.log(
            `  ${el.id}\n` +
            `    page:${el.pageId}  floor:${el.floorLevel}  side:${el.side}\n` +
            `    projection=${pStr}  span=${sStr}  eaveZ=${zStr}`
          )
        } else if (el.kind === 'flat-roof-surface') {
          const aStr = el.grossAreaM2 != null ? el.grossAreaM2.toFixed(4) + 'm²' : 'null'
          const zStr = el.roofCeilingZm != null ? el.roofCeilingZm.toFixed(4) + 'm' : 'null (no floor heights)'
          const uvStr = el.effectiveUValue != null ? el.effectiveUValue.toFixed(4) + ' W/m²K' : 'null'
          const thStr = el.thicknessM    != null ? el.thicknessM.toFixed(4)    + ' m'      : 'null'
          console.log(
            `  ${el.id}\n` +
            `    page:${el.pageId}\n` +
            `    footprintArea=${aStr}  roofCeilingZ=${zStr}\n` +
            `    assembly: ${el.assemblySource}  U=${uvStr}  thickness=${thStr}`
          )
        } else if (el.kind === 'window' || el.kind === 'door') {
          const wStr = el.widthM  != null ? el.widthM.toFixed(4) + 'm'  : 'null'
          const hStr = el.heightM != null ? el.heightM.toFixed(4) + 'm' : 'null'
          const zStr = el.worldZm != null ? el.worldZm.toFixed(4) + 'm' : 'null'
          console.log(
            `  ${el.id}\n` +
            `    page:${el.pageId}  label:"${el.label ?? ''}"  type:${el.openingType ?? 'null'}\n` +
            `    width=${wStr}  height=${hStr}  dimBasis:${el.dimBasis ?? 'null'}\n` +
            `    worldZ=${zStr}`
          )
        } else {
          console.log(`  ${el.id}`, el)
        }
      }

      // ── Reconcile summary for quick audit ────────────────────────────────────
      console.log('[enum] --- reconcile summary (wall-surfaces only) ---')
      const wallEls = elements.filter(e => e.kind === 'wall-surface')
      const reconcileCounts = {}
      for (const el of wallEls) {
        const key = `${el.floorLevel}:${el.reconcile ?? 'base'}`
        reconcileCounts[key] = (reconcileCounts[key] ?? 0) + 1
      }
      for (const [key, count] of Object.entries(reconcileCounts)) {
        console.log(`  ${key}: ${count} edge(s)`)
      }
      const allCoincident = wallEls.filter(e => e.reconcile).every(e => e.reconcile === 'coincident')
      if (allCoincident && wallEls.some(e => e.reconcile)) {
        console.warn('[enum] FINDING: all reconciled edges are "coincident" — bbox-compare may not be detecting the intentional Main Floor offset. bbox-compare only catches midpoints outside the below-floor bbox; a shifted-but-still-overlapping polygon may produce all-coincident results. Consider a per-edge closest-approach rule.')
      }

      // ── Area + partition summary ─────────────────────────────────────────────
      console.log('[enum] --- area + partition summary (wall-surfaces only) ---')
      let partFail = 0, partPass = 0, partNa = 0
      for (const el of wallEls) {
        if (el.grossAreaM2 == null) { partNa++; continue }
        const ok = Math.abs(el.grossAreaM2 - (el.netAreaM2 ?? 0) - el.openingAreaM2) < 0.0001
        if (ok) partPass++; else { partFail++; console.error(`  FAIL: ${el.id}  gross=${el.grossAreaM2.toFixed(4)} net=${el.netAreaM2?.toFixed(4)} openings=${el.openingAreaM2.toFixed(4)}`) }
      }
      console.log(`  partition check: ${partPass} PASS  ${partFail} FAIL  ${partNa} N/A (no floor height)`)
      const totalGross = wallEls.reduce((s, e) => s + (e.grossAreaM2 ?? 0), 0)
      const totalNet   = wallEls.reduce((s, e) => s + (e.netAreaM2   ?? 0), 0)
      const totalOA    = wallEls.reduce((s, e) => s + (e.openingAreaM2 ?? 0), 0)
      const withGross  = wallEls.filter(e => e.grossAreaM2 != null).length
      const overflow   = wallEls.filter(e => e.openingOverflow).length
      console.log(`  gross total=${totalGross.toFixed(4)}m² (${withGross}/${wallEls.length} surfaces have height)`)
      console.log(`  net total=${totalNet.toFixed(4)}m²  opening total=${totalOA.toFixed(4)}m²`)
      if (overflow) console.warn(`  ⚠ ${overflow} surface(s) have openingOverflow (openings exceed gross area — bad data)`)
    }

      window.__verifyFixture = async () => {
        const EPS = 0.0001
        let passed = 0, failed = 0
        const fmtNum = (v) => typeof v === 'number' ? v.toFixed(4) : v
        const fail = (label, expected, actual) => {
          console.error(`[verify] FAIL  ${label}: expected=${fmtNum(expected)} actual=${fmtNum(actual)}`)
          failed++
        }
        const pass = (label) => { console.log(`[verify] pass  ${label}`); passed++ }
        const check = (label, expected, actual) => {
          typeof expected === 'number' && Math.abs(actual - expected) < EPS ? pass(label) : fail(label, expected, actual)
        }
        // checkEq: exact equality (===) for string/null fields where EPS doesn't apply.
        const checkEq = (label, expected, actual) => {
          actual === expected ? pass(label) : fail(label, expected, actual)
        }

        // Inject the fixture's library assembly record.
        // assemblyLibraryRef is session-level only (not in fixture JSON), so __verifyFixture
        // self-injects the record that the fixture's library-tier surface (wall-sh-1-seg0-Main_Floor)
        // references. Layer thicknesses sum to totalThicknessM: 0.013+0.001+0.140+0.011+0.089 = 0.254m.
        // Thermal fields (added Slice 3): controlLayers.thermal intentionally null to verify
        // null is preserved through ingest → getSurfaceAssembly → element field.
        ingestAssembly({
          assemblyId: 'asm-fix-1',
          label: 'Test 2×6 Wall Assembly',
          assemblyType: 'wall',
          totalThicknessM: 0.254,
          effectiveUValue: 0.28,
          effectiveRSI:    3.5714,
          controlLayers: { water: 'l5', air: 'l4', thermal: null, vapour: 'l2' },
          layers: [
            { layerId: 'l1', materialId: 'gypsum',            thicknessM: 0.013, pathRole: 'continuous' },
            { layerId: 'l2', materialId: 'vapour-barrier',    thicknessM: 0.001, pathRole: 'continuous' },
            { layerId: 'l3', materialId: 'batt-insulation',   thicknessM: 0.140, pathRole: 'framed'     },
            { layerId: 'l4', materialId: 'osb',               thicknessM: 0.011, pathRole: 'continuous' },
            { layerId: 'l5', materialId: 'exterior-cladding', thicknessM: 0.089, pathRole: 'continuous' },
          ],
        })

        let golden
        try {
          const resp = await fetch('/devFixtures/fixture-elevation.expected.json')
          golden = await resp.json()
        } catch (e) {
          console.error('[verify] Could not load golden sidecar:', e.message)
          return
        }

        const elements = deriveEnumeration()
        const wallEls   = elements.filter(e => e.kind === 'wall-surface')
        const soffitEls = elements.filter(e => e.kind === 'soffit')
        const windowEls = elements.filter(e => e.kind === 'window')
        const doorEls   = elements.filter(e => e.kind === 'door')

        const totalGross = wallEls.reduce((s, e) => s + (e.grossAreaM2 ?? 0), 0)
        const totalNet   = wallEls.reduce((s, e) => s + (e.netAreaM2   ?? 0), 0)
        const totalOpen  = wallEls.reduce((s, e) => s + (e.openingAreaM2 ?? 0), 0)

        check('(a) wallSurfaceCount',  golden.wallSurfaceCount,  wallEls.length)
        check('(b) grossTotalM2',      golden.grossTotalM2,      totalGross)
        check('(c) netTotalM2',        golden.netTotalM2,        totalNet)
        check('(d) openingTotalM2',    golden.openingTotalM2,    totalOpen)
        check('(e) soffitCount',       golden.soffitCount,       soffitEls.length)
        check('(f) windowCount',       golden.windowCount,       windowEls.length)
        check('(g) doorCount',         golden.doorCount,         doorEls.length)

        const sub = wallEls.find(e => e.id === golden.subtractionSurface.id)
        if (!sub) {
          fail('(h) subtractionSurface exists', golden.subtractionSurface.id, 'NOT FOUND')
        } else {
          pass('(h) subtractionSurface exists')
          check('(i.gross) subtractionSurface.grossM2',   golden.subtractionSurface.grossM2,   sub.grossAreaM2)
          check('(i.net)   subtractionSurface.netM2',     golden.subtractionSurface.netM2,     sub.netAreaM2)
          check('(i.open)  subtractionSurface.openingM2', golden.subtractionSurface.openingM2, sub.openingAreaM2)
        }

        // Assembly checks — resolver must return expected values for the pre-set surface
        if (golden.assemblyCheck) {
          const asmSurface = wallEls.find(e => e.id === golden.assemblyCheck.surfaceId)
          if (!asmSurface) {
            fail('(j) assemblyCheck surface exists', golden.assemblyCheck.surfaceId, 'NOT FOUND')
          } else {
            pass('(j) assemblyCheck surface exists')
            check('(j.uv) assembly effectiveUValue', golden.assemblyCheck.effectiveUValue, asmSurface.effectiveUValue)
            check('(k)    assembly thicknessM',      golden.assemblyCheck.thicknessM,      asmSurface.thicknessM)
          }
        }

        // Inside-face area checks — one per surfaceId keyed in golden.insideFaceCheck
        if (golden.insideFaceCheck) {
          for (const [surfaceId, expectedArea] of Object.entries(golden.insideFaceCheck)) {
            const el = wallEls.find(e => e.id === surfaceId)
            if (!el) {
              fail(`(l) insideFaceCheck exists: ${surfaceId}`, surfaceId, 'NOT FOUND')
            } else {
              check(`(l) insideFaceAreaM2 ${surfaceId}`, expectedArea, el.insideFaceAreaM2)
            }
          }
        }

        // Thermal checks — library-tier surface (wall-sh-1-seg0-Main_Floor → asm-fix-1).
        // Verifies effectiveUValue, effectiveRSI, and controlLayers (including null thermal key)
        // survive ingest → assemblyLibraryRef → getSurfaceAssembly → element fields.
        if (golden.thermalCheck) {
          const thEl = wallEls.find(e => e.id === golden.thermalCheck.surfaceId)
          if (!thEl) {
            fail('(m) thermalCheck surface exists', golden.thermalCheck.surfaceId, 'NOT FOUND')
          } else {
            pass('(m) thermalCheck surface exists')
            check('(m.uv)  library effectiveUValue',    golden.thermalCheck.effectiveUValue, thEl.effectiveUValue)
            check('(m.rsi) library effectiveRSI',       golden.thermalCheck.effectiveRSI,    thEl.effectiveRSI)
            const cl = thEl.controlLayers
            checkEq('(m.cl.water)   controlLayers.water',   golden.thermalCheck.controlLayers.water,   cl?.water)
            checkEq('(m.cl.air)     controlLayers.air',     golden.thermalCheck.controlLayers.air,     cl?.air)
            checkEq('(m.cl.thermal) controlLayers.thermal', golden.thermalCheck.controlLayers.thermal, cl?.thermal)
            checkEq('(m.cl.vapour)  controlLayers.vapour',  golden.thermalCheck.controlLayers.vapour,  cl?.vapour)
          }
        }

        // Flat-roof surface check
        if (golden.flatRoofSurface) {
          const rfEls = elements.filter(e => e.kind === 'flat-roof-surface')
          const rfEl = rfEls.find(e => e.id === golden.flatRoofSurface.id)
          if (!rfEl) {
            fail('(s) flatRoofSurface exists', golden.flatRoofSurface.id, 'NOT FOUND')
          } else {
            pass('(s) flatRoofSurface exists')
            check('(s.area) flatRoofSurface.grossAreaM2', golden.flatRoofSurface.grossAreaM2, rfEl.grossAreaM2)
          }
        }

        let partFail = 0
        for (const e of wallEls) {
          if (e.grossAreaM2 == null) continue
          const diff = Math.abs(e.grossAreaM2 - (e.netAreaM2 ?? 0) - (e.openingAreaM2 ?? 0))
          if (diff >= EPS) { console.error(`[verify] FAIL  partition ${e.id}: diff=${diff.toFixed(6)}`); partFail++ }
        }
        partFail === 0 ? pass('(partition) gross==net+openings for all wall surfaces') : (console.error(`[verify] FAIL  partition: ${partFail} surface(s) failed`), failed++)

        console.log('[verify] closure check: SKIPPED (gated on roof-plane + floor-over-unheated surface kinds — #87)')

        // ── Placement checks (n)–(q): seed holding area, place one window + one door ──
        // These run AFTER the fixture-state checks above so placement additions don't
        // affect area totals. Test shapes are cleaned up at the end.
        const testW = {
          id: 'test-wew-w99', mark: 'W99', openingKind: 'window', operationType: 'Fixed',
          frameWidthM: 0.9, frameHeightM: 1.2, roughWidthM: 0.94, roughHeightM: 1.24,
          quantity: 2, location: 'Test', performance: { uw: 1.4, shgc: 0.32 },
        }
        const testD = {
          id: 'test-wew-d99', mark: 'D99', openingKind: 'door', operationType: 'Single Inswing',
          frameWidthM: 0.91, frameHeightM: 2.1, roughWidthM: 0.95, roughHeightM: 2.14,
          quantity: 1, location: 'Test', performance: { uw: 1.8, shgc: null },
        }
        loadPendingOpenings([testW, testD])
        const beforeCount = completedShapesRef.current.length
        if (!dimensionBasisRef.current) dimensionBasisRef.current = 'frame'
        const wEntry = pendingOpeningsRef.current.find(e => e.id === 'test-wew-w99')
        const dEntry = pendingOpeningsRef.current.find(e => e.id === 'test-wew-d99')
        placeOpeningFromEntry(wEntry, { x: 400, y: 400 })
        // re-fetch dEntry since placeOpeningFromEntry may have mutated the array reference
        const dEntry2 = pendingOpeningsRef.current.find(e => e.id === 'test-wew-d99')
        placeOpeningFromEntry(dEntry2 ?? dEntry, { x: 600, y: 400 })

        const newShapes = completedShapesRef.current.slice(beforeCount)
        const placedW = newShapes.find(s => s.shapeKind === 'window' && s.label === 'W99')
        const placedD = newShapes.find(s => s.shapeKind === 'door'   && s.label === 'D99')

        // (n) both appear in completedShapesRef as locked
        placedW ? pass('(n.w) placed window in completedShapesRef') : fail('(n.w) placed window in completedShapesRef', 'found', 'NOT FOUND')
        placedD ? pass('(n.d) placed door   in completedShapesRef') : fail('(n.d) placed door   in completedShapesRef', 'found', 'NOT FOUND')
        // (o) both carry non-null widthM AND heightM
        if (placedW) {
          placedW.widthM  != null ? pass('(o.w) window.widthM non-null')  : fail('(o.w) window.widthM non-null',  'non-null', null)
          placedW.heightM != null ? pass('(o.w) window.heightM non-null') : fail('(o.w) window.heightM non-null', 'non-null', null)
        }
        if (placedD) {
          placedD.widthM  != null ? pass('(o.d) door.widthM non-null')    : fail('(o.d) door.widthM non-null',    'non-null', null)
          placedD.heightM != null ? pass('(o.d) door.heightM non-null')   : fail('(o.d) door.heightM non-null',   'non-null', null)
        }
        // (p) deriveEnumeration counts them (window and door counts increase by at least 1 each)
        const elAfter = deriveEnumeration()
        const wAfterCount = elAfter.filter(e => e.kind === 'window').length
        const dAfterCount = elAfter.filter(e => e.kind === 'door').length
        wAfterCount >= golden.windowCount + 1
          ? pass(`(p.w) deriveEnumeration includes placed window (${wAfterCount} total)`)
          : fail(`(p.w) deriveEnumeration includes placed window`, `≥${golden.windowCount + 1}`, wAfterCount)
        dAfterCount >= golden.doorCount + 1
          ? pass(`(p.d) deriveEnumeration includes placed door (${dAfterCount} total)`)
          : fail(`(p.d) deriveEnumeration includes placed door`, `≥${golden.doorCount + 1}`, dAfterCount)
        // (q) placement decremented remaining; door entry removed (qty was 1)
        const wAfterEntry = pendingOpeningsRef.current.find(e => e.id === 'test-wew-w99')
        const dAfterEntry = pendingOpeningsRef.current.find(e => e.id === 'test-wew-d99')
        wAfterEntry?.remaining === 1
          ? pass('(q.w) window entry remaining decremented to 1')
          : fail('(q.w) window entry remaining', 1, wAfterEntry?.remaining ?? 'entry removed')
        !dAfterEntry
          ? pass('(q.d) door entry removed after quantity exhausted')
          : fail('(q.d) door entry still present', 'removed', 'still present')

        // (r) opening thermal fields — uw/shgc stored, rsiW NOT stored, bridge values verbatim
        if (placedW) {
          checkEq('(r.w.uw)   placed window uw from bridge',   1.4,  placedW.uw)
          checkEq('(r.w.shgc) placed window shgc from bridge', 0.32, placedW.shgc)
          checkEq('(r.w.rsiW) rsiW not stored on record', undefined, placedW.rsiW)
          const rsiWDerived = getRsiW(placedW.uw)
          Math.abs(rsiWDerived - 1 / 1.4) < 1e-9
            ? pass('(r.w.derived) getRsiW(1.4) ≈ 0.7143')
            : fail('(r.w.derived) getRsiW(1.4)', (1 / 1.4).toFixed(6), rsiWDerived)
        }
        if (placedD) {
          checkEq('(r.d.uw)   placed door uw from bridge',        1.8, placedD.uw)
          checkEq('(r.d.shgc) placed door shgc === 0 (opaque)',    0,  placedD.shgc)
          checkEq('(r.d.rsiW) rsiW not stored on record', undefined, placedD.rsiW)
          const rsiWNull = getRsiW(null)
          rsiWNull === null
            ? pass('(r.d.derived) getRsiW(null) === null')
            : fail('(r.d.derived) getRsiW(null)', null, rsiWNull)
        }

        // Clean up test shapes so fixture state is not polluted for further use
        completedShapesRef.current = completedShapesRef.current.slice(0, beforeCount)
        pendingOpeningsRef.current = pendingOpeningsRef.current.filter(
          e => e.id !== 'test-wew-w99' && e.id !== 'test-wew-d99'
        )
        setPendingOpeningsTick(t => t + 1)
        setEnumerationTick(t => t + 1)

        failed === 0
          ? console.log(`[verify] ✓ ALL ${passed + failed} checks PASSED`)
          : console.error(`[verify] ${failed}/${passed + failed} checks FAILED`)
      }

      window.__dumpWireframe = () => {
        const wf = deriveWireframe()
        console.log('[wf] floorRings:', wf.floorRings.length, 'roofRing:', wf.roofRing ? `z=${wf.roofRing.z?.toFixed(3)}m verts=${wf.roofRing.verts.length}` : 'null',
          '| soffitLines:', wf.soffitLines.length, '| openingLines:', wf.openingLines.length)
        for (const r of wf.floorRings) {
          const fStr = r.floorZ != null ? r.floorZ.toFixed(3) + 'm' : 'null'
          const cStr = r.ceilingZ != null ? r.ceilingZ.toFixed(3) + 'm' : 'null (heights not entered)'
          console.log(`  [${r.level}] shapeId=${r.shapeId}  floorZ=${fStr}  ceilingZ=${cStr}  verts=${r.verts.length}`)
          for (let i = 0; i < r.verts.length; i++) {
            const v = r.verts[i]
            console.log(`    v${i}: x=${v.x.toFixed(4)}m  y=${v.y.toFixed(4)}m`)
          }
        }
        if (wf.roofRing) {
          console.log(`  [roof] z=${wf.roofRing.z?.toFixed(3) ?? 'null'}m  verts=${wf.roofRing.verts.length}`)
          for (let i = 0; i < wf.roofRing.verts.length; i++) {
            const v = wf.roofRing.verts[i]
            console.log(`    v${i}: x=${v.x.toFixed(4)}m  y=${v.y.toFixed(4)}m`)
          }
        }
        if (wf.soffitLines.length) {
          console.log('[wf] --- soffit lines ---')
          const bySide = {}
          for (const seg of wf.soffitLines) { (bySide[seg.side] = bySide[seg.side] || []).push(seg) }
          for (const [side, segs] of Object.entries(bySide)) {
            console.log(`  [soffit ${side}] ${segs.length} segments:`)
            for (const s of segs)
              console.log(`    (${s.from.x.toFixed(3)},${s.from.y.toFixed(3)},${s.from.z.toFixed(3)}) → (${s.to.x.toFixed(3)},${s.to.y.toFixed(3)},${s.to.z.toFixed(3)})`)
          }
        } else {
          console.log('[wf] soffitLines: 0 (no confirmed roof or no projection > threshold)')
        }
        if (wf.openingLines.length) {
          console.log('[wf] --- opening lines ---')
          const byId = {}
          for (const seg of wf.openingLines) { (byId[seg.id] = byId[seg.id] || []).push(seg) }
          for (const [id, segs] of Object.entries(byId))
            console.log(`  opening ${id}: ${segs.length} segments`)
        } else {
          console.log('[wf] openingLines: 0 (no openings on elevation pages — correct for default fixture)')
        }
        return wf
      }

    // __dumpProjectSetup(): §9 console verification — schema + current selection state.
    // Prints every CONFIG_FIELDS descriptor and its stored value side-by-side.
    window.__dumpProjectSetup = () => {
      console.log('[setup] CONFIG_FIELDS schema + current values:')
      let lastCat = null
      for (const field of CONFIG_FIELDS) {
        if (field.category !== lastCat) {
          console.log(`[setup] ── ${field.category} ──`)
          lastCat = field.category
        }
        const val = getConfigValue(field.id)
        const valStr = Array.isArray(val) ? (val.length ? val.join(', ') : '(none)') : (val ?? 'null')
        console.log(`  [${field.id}]  label="${field.label}"  options=${field.options.length}  multi=${field.multi}  value=${valStr}`)
      }
      console.log('[setup] raw values:', JSON.stringify(projectSetupRef.current.values))
    }

    window.__dumpWorklist = () => {
      const result = deriveWorklist()
      console.log(`[worklist] toPlace (${result.toPlace.length} items):`)
      for (const item of result.toPlace) {
        const def = ITEM_TYPES.find(it => it.type === item.type)
        const obligs = def ? def.obligations.map(o => `${o.id}(${o.kind},blocked=${o.blocked})`).join(', ') : 'unknown type'
        console.log(`  ${item.instanceKey}  label="${item.label}"  obligations: ${obligs}`)
      }
      if (result.toPlace.length === 0) console.log('  (empty — no spawning fields selected, or all placed)')
      // Placed items with world XY
      const placed = completedShapesRef.current.filter(s => isEquipmentItem(s) && s.status === 'locked')
      console.log(`[worklist] placed items (${placed.length}):`)
      for (const s of placed) {
        const v = s.vertices[0]
        const world = v ? pageVertexToWorld(v, s.pageId) : null
        const worldStr = world ? `world=(${world.x.toFixed(3)}, ${world.y.toFixed(3)})` : 'world=N/A'
        const obligs = Object.entries(s.obligationState || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'
        console.log(`  ${s.id}  ${s.instanceKey}  page=${s.pageId}  ${worldStr}  obligations: ${obligs}`)
      }
      console.log(`[worklist] obligations (${result.obligations.length}):`)
      for (const ob of result.obligations) {
        const sat = ob.satisfiedValue ? `✓ ${ob.satisfiedValue}` : (ob.blocked ? '🔒 blocked' : '— not set')
        const owners = ob.ownerRoles.length ? ob.ownerRoles.map(r => ROLE_LABELS[r] ?? r).join(', ') : '(unassigned)'
        console.log(`  ${ob.instanceKey} / ${ob.id}  [${ob.kind}]  ${sat}  ownerRoles=[${ob.ownerRoles.join(',')}] → ${owners}`)
      }
    }

    // __ingestAssembly(record): DEV injection path for contract-shaped assembly records.
    // Mirrors __dumpRuns/__dumpSolids pattern — tree-shakes from production.
    // Usage: window.__ingestAssembly({ assemblyId:'asm-1', label:'2x6 R22', assemblyType:'wall',
    //   totalThicknessM:0.3, layers:[{layerId:'l-1',materialId:'spf',thicknessM:0.14,pathRole:'framed'}] })
    // Then point a surface at it: surfaceAssemblyRef.current['wall-sh-1-seg2-Main_Floor'] =
    //   { tier:'library', assemblyId:'asm-1' }
    window.__ingestAssembly = (record) => {
      ingestAssembly(record)
      const stored = assemblyLibraryRef.current[record?.assemblyId]
      if (stored) {
        console.log(`[asm] ingested assemblyId="${stored.assemblyId}"  label="${stored.label}"  type=${stored.assemblyType}  totalThicknessM=${stored.totalThicknessM}  U=${stored.effectiveUValue ?? '—'}  RSI=${stored.effectiveRSI ?? '—'}  layers=${stored.layers.length}`)
        if (stored.controlLayers) {
          const cl = stored.controlLayers
          const fmtCl = (v) => v === null ? 'null' : (v ?? '—')
          console.log(`  controlLayers  water=${fmtCl(cl.water)}  air=${fmtCl(cl.air)}  thermal=${fmtCl(cl.thermal)}  vapour=${fmtCl(cl.vapour)}`)
        }
        for (const l of stored.layers)
          console.log(`  layer  layerId=${l.layerId}  materialId=${l.materialId}  thicknessM=${l.thicknessM}  pathRole=${l.pathRole}`)
      } else {
        console.warn('[asm] __ingestAssembly: ingest failed (see above)')
      }
    }

    // __loadPendingOpenings(entries): DEV injection path for normalized opening entries.
    // Usage: window.__loadPendingOpenings([{ id:'wew-w1', mark:'W1', openingKind:'window',
    //   operationType:'Fixed', frameWidthM:0.9, frameHeightM:1.2,
    //   roughWidthM:0.94, roughHeightM:1.24, quantity:2, location:'Living room' }])
    window.__loadPendingOpenings = (entries) => {
      loadPendingOpenings(entries)
      console.log(`[openings] loaded ${entries.length} entries; total pending: ${pendingOpeningsRef.current.length}`)
      for (const e of pendingOpeningsRef.current) {
        console.log(`  ${e.id}: ${e.mark} (${e.openingKind}) ×${e.remaining}  ${e.operationType ?? ''}  frame ${e.frameWidthM}×${e.frameHeightM}m`)
      }
    }

    // __verifyToh(): DEV check for Climate slice — weather register + resolver sanity.
    // Checks: (1) register loaded, (2) Vernon exact match, (3) Victoria disambiguation,
    // (4) location-station → resolved toh, (5) override wins, (6) neither → null.
    window.__verifyToh = () => {
      let pass = 0; let fail = 0
      const check = (label, actual, expected) => {
        const ok = actual === expected
        console.log(`[toh] ${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ', expected ' + JSON.stringify(expected)}`)
        ok ? pass++ : fail++
      }

      // (1) Register loaded and count > 650 (679 entries after skipping blank rows)
      const count = F280_WEATHER.length
      const c1 = count > 650
      console.log(`[toh] ${c1 ? 'PASS' : 'FAIL'} (1) register count > 650: got ${count}`)
      c1 ? pass++ : fail++

      // (2) Vernon exact match → dhdbt = -20
      const vernonEntry = F280_WEATHER.find(e => e.station === 'Vernon')
      check('(2) Vernon dhdbt', vernonEntry?.dhdbt, -20)

      // (3) Victoria disambiguation — 'Victoria' and 'Victoria Gonzales Height' are distinct
      const victoria     = F280_WEATHER.find(e => e.station === 'Victoria')
      const victoriaGH   = F280_WEATHER.find(e => e.station === 'Victoria Gonzales Height')
      const c3 = victoria !== undefined && victoriaGH !== undefined && victoria !== victoriaGH
      console.log(`[toh] ${c3 ? 'PASS' : 'FAIL'} (3) Victoria disambiguation: Victoria dhdbt=${victoria?.dhdbt}, Gonzales Height dhdbt=${victoriaGH?.dhdbt}`)
      c3 ? pass++ : fail++

      // Save original values and restore after tests
      const origVals = { ...projectSetupRef.current.values }

      // (4) location-station = 'Vernon|||BC', no override → resolved toh = -20
      projectSetupRef.current.values['location-station'] = 'Vernon|||BC'
      projectSetupRef.current.values['toh-override'] = null
      const r4 = resolveEffectiveConfig(projectSetupRef.current.values)
      check('(4) Vernon station → toh', r4.toh, -20)

      // (5) toh-override = -25 → resolved toh = -25 (override wins)
      projectSetupRef.current.values['toh-override'] = -25
      const r5 = resolveEffectiveConfig(projectSetupRef.current.values)
      check('(5) override -25 wins', r5.toh, -25)

      // (6) neither set → resolved toh = null
      projectSetupRef.current.values['location-station'] = null
      projectSetupRef.current.values['toh-override'] = null
      const r6 = resolveEffectiveConfig(projectSetupRef.current.values)
      check('(6) neither set → null', r6.toh, null)

      // Restore
      projectSetupRef.current.values = { ...origVals }

      const total = pass + fail
      if (fail === 0) console.log(`[toh] ✓ ALL ${total} checks PASSED`)
      else console.warn(`[toh] ${fail}/${total} checks FAILED`)
    }

    // __dumpF280(): print deriveF280Heating result to console. DEV-only; tree-shaken from prod.
    window.__dumpF280 = () => {
      const enumeration = deriveEnumeration()
      const resolved = resolveEffectiveConfig(projectSetupRef.current.values)
      const result = deriveF280Heating(enumeration, resolved)
      if (result.status === 'no-climate') {
        console.warn('[f280] no-climate — set location-station or toh-override in Project Setup')
        return
      }
      console.log(`[f280] ΔT = ${result.tiC}°C (Ti) − ${result.tohC}°C (Toh) = ${result.deltaT}°C`)
      for (const [kind, b] of Object.entries(result.bySurfaceKind)) {
        if (b.count === 0) { console.log(`[f280]   ${kind}: (none)`); continue }
        const unres = b.unresolvedCount > 0 ? ` [${b.unresolvedCount} unresolved U]` : ''
        console.log(`[f280]   ${kind}: ${b.count} surfaces, area=${b.areaM2.toFixed(2)} m², U_avg=${b.uAvg != null ? b.uAvg.toFixed(3) : '—'} W/m²K, loss=${b.lossW.toFixed(1)} W${unres}`)
      }
      console.log(`[f280] Above-grade conductive total: ${result.conductiveAboveGradeW.toFixed(1)} W (${(result.conductiveAboveGradeW / 1000).toFixed(2)} kW)`)
      console.log(`[f280] Not modeled: ${result.notModeled.join(', ')}`)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <h1>Collabinator</h1>
        {fileName && <span className="filename">{fileName}</span>}
      </header>

      <div className="toolbar">
        <label className="upload-btn">
          {loading ? 'Loading…' : 'Upload PDF'}
          <input type="file" accept=".pdf,application/pdf" onChange={handleFileChange} disabled={loading} />
        </label>

        {pageCount > 0 && (
          <div className="page-controls">
            <button onClick={() => handlePageNav(-1)} disabled={prevNavDisabled}>‹</button>
            <span className="page-indicator">{renderingPage ? '…' : currentPage} / {pageCount}</span>
            <button onClick={() => handlePageNav(1)} disabled={nextNavDisabled}>›</button>
            {!categorizeMode && (
              <button className="cat-more-link" onClick={enterCategorizeReentry}>
                + Categorize more pages
              </button>
            )}
          </div>
        )}

        {currentPage && pdf && !calibMode && !drawMode && !editMode && !categorizeMode && (() => {
          const atUltra  = backdropTier === 'ultra'
          const atNormal = backdropTier === 'normal'
          const enhanceLabel = backdropTier === 'normal' ? 'Enhance' : 'No seriously, enhance'
          const changeBackdropTier = (tier) => {
            backdropTierRef.current = tier
            setBackdropTier(tier)
            renderPage(pdf, currentPageId, { resizeMeasure: false })
          }
          return (
            <>
              <button
                className={`calib-btn${backdropTier !== 'normal' ? ' calib-btn--done' : ''}`}
                onClick={() => { if (!atUltra) changeBackdropTier(backdropTier === 'normal' ? 'enhance' : 'ultra') }}
                disabled={atUltra}
                title={atUltra ? 'Already at maximum resolution' : enhanceLabel}
              >
                {enhanceLabel}
              </button>
              <button
                className="calib-btn"
                onClick={() => changeBackdropTier('normal')}
                disabled={atNormal}
                title={atNormal ? 'Already at normal resolution' : 'Reset to normal resolution'}
              >
                De-enhance
              </button>
            </>
          )
        })()}

        {pdf && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && (
          <button
            className={`compass-north-btn ${compassAngleDeg !== null ? 'compass-north-btn--done' : ''}`}
            onClick={openCompassOverlay}
          >
            {compassAngleDeg !== null
              ? `North set ✓  (${compassCardinal}${compassAngleDeg !== 0 ? ` ${compassAngleDeg.toFixed(1)}°` : ''})`
              : 'Set North'}
          </button>
        )}

{pdf && currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && (
          <button className="categorize-btn" onClick={() => { setCatReentry(false); setCategorizeMode(true) }}>
            Categorize Pages
          </button>
        )}

        {pdf && currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && (
          <button
            className="carve-btn"
            onClick={() => setCarveMode(true)}
            title="Drag a rectangle on the sheet to create an independent region-page"
          >
            Add region
          </button>
        )}

        {carveMode && (
          <button
            className="carve-exit-btn"
            onClick={() => { setCarveMode(false); carveDragRef.current = null; redrawFrontFaceLayer(null) }}
          >
            Exit carve ✕
          </button>
        )}

        {pdf && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && (
          <button
            className={`floor-heights-btn${showSidebar ? ' floor-heights-btn--open' : ''}`}
            onClick={() => setShowSidebar(h => !h)}
          >
            {showSidebar ? 'Panels ✕' : 'Panels'}
          </button>
        )}

        {pdf && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && !!getWorldOriginM() && (
          <button
            className="three-d-btn"
            onClick={() => { setWireframeData(deriveWireframe()); setShow3DView(true) }}
          >
            3D View
          </button>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && !currentPageIsSourceSheet &&
         !getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current) && (
          <button
            className={`calib-btn ${pageHasScale ? 'calib-btn--done' : ''}`}
            onClick={() => { setCalibMode(true); setCalibPoints([]); setScaleError(''); clearMeasureCanvas() }}
          >
            {pageHasScale ? 'Scale set ✓  Re-calibrate' : 'Set Scale'}
          </button>
        )}

        {calibMode && (
          <div className="calib-status">
            <span className="calib-instructions">
              {calibPoints.length === 0 ? 'Click point A on a known dimension'
                : calibPoints.length === 1 ? 'Click point B to complete the reference line'
                : 'Reference line set — enter real-world length below'}
            </span>
            <button className="calib-cancel" onClick={exitCalibMode}>Exit</button>
          </div>
        )}

        {currentPage && pdf && (() => {
          const isImperial = getEffectiveScale(currentPageId)?.displayUnit === 'ft'
          return (
            <select
              className="snap-increment-select"
              value={snapIncrement}
              disabled={!pageHasScale}
              title={!pageHasScale ? 'Set scale to enable snap grid' : 'Snap grid increment'}
              onChange={e => {
                const v = parseFloat(e.target.value)
                snapIncrementRef.current = v; setSnapIncrement(v)
                if (drawMode) redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, true, currentPageId)
                else if (editMode) drawEditCanvas(editHoverRef.current)
              }}
            >
              {isImperial
                // NOTE: these option values are canonical snap-grid DATA constants (the stored
                // snap increment in metres), matched BY VALUE against snapIncrement state whose
                // defaults/resets use the same literals project-wide. They are NOT dialog
                // conversion math — routing through inchesToMeters(N) shifts them ~1 ULP
                // (0.0254*6 = 0.15239999999999998 ≠ 0.1524) and breaks <select> option matching.
                // Intentional coord-seam exception (see coords.js header).
                ? <><option value={0.0254}>1″</option><option value={0.0762}>3″</option>
                    <option value={0.1524}>6″</option><option value={0.3048}>12″</option></>
                : <><option value={0.025}>2.5 cm</option><option value={0.075}>7.5 cm</option>
                    <option value={0.15}>15 cm</option><option value={0.30}>30 cm</option></>}
            </select>
          )
        })()}

        {currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && (
          <>
            <button
              className="draw-btn"
              disabled={!pageHasScale || currentPageIsSourceSheet}
              onClick={() => {
                if (currentPageIsSourceSheet) return
                const unit = getEffectiveScale(currentPageId)?.displayUnit
                snapIncrementRef.current = unit === 'm' ? 0.15 : 0.1524
                setSnapIncrement(unit === 'm' ? 0.15 : 0.1524)
                clearMeasureCanvas(); setDrawMode(true)
              }}
            >
              Draw
            </button>
            {drawDisabledHint && <span className="cat-panel-hint">{drawDisabledHint}</span>}
          </>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && !carveMode && (() => {
          const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
          if (!ghostPageId) return null
          return (
            <>
              <button
                className={`snap-btn ${alignMode ? 'snap-btn--on' : ''}`}
                onClick={() => {
                  if (!alignMode) { setShowGhostByPageId(m => ({ ...m, [currentPageId]: true })); setAlignMode(true) }
                  else setAlignMode(false)
                }}
              >{alignMode ? 'Exit align' : isConfirmed ? 'Realign' : alignStarted ? 'Resume align' : `Align to ${refLayerLabel}`}</button>
              {alignMode && refCandidates.length > 1 && (
                <select className="snap-increment-select"
                  value={ghostSrc || ''}
                  onChange={e => {
                    const v = e.target.value
                    if (v) { pageRefParentRef.current[currentPageId] = v; setAlignTick(t => t + 1) }
                  }}
                >
                  <option value="">— reference —</option>
                  {refCandidates.map(p => (
                    <option key={p.pageId} value={p.pageId}>{p.subLabel || `Page ${p.pageNum}`}</option>
                  ))}
                </select>
              )}
              {alignMode && (
                <button className="snap-btn" onClick={() => {
                  const pageId = currentPageId
                  const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
                  // #117 (C-rederive): record the author-frame footprint; renderPage pins the render
                  // frame to it (fallback 1200) so it registers at any load width.
                  pageTransformsRef.current[pageId] = { ...cur, confirmed: true, authorScaled: cur.authorScaled ?? 1200 }
                  if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc
                  setAlignMode(false)
                  setAlignTick(t => t + 1)
                }}>Confirm scale & alignment</button>
              )}
            </>
          )
        })()}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !categorizeMode && !carveMode && !currentPageIsSourceSheet && lockedShapesOnPage.length > 0 && (
          <button className="edit-btn" onClick={() => {
            clearMeasureCanvas()
            if (lockedShapesOnPage.some(s => isOpening(s))) saveAndDefaultSnapIncrement()
            setEditMode(true)
          }}>
            Edit Shapes
          </button>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !carveMode && hasSlopedOnPage && (
          <>
            <button className="edit-btn" onClick={() => {
              clearMeasureCanvas()
              setRoofRoleMode(true); setRoofRoleHover(null); setRoofRoleSelected(null)
              drawRoofRoleCanvas(null, null)
            }}>
              Assign line roles
            </button>
            <button className="edit-btn" onClick={() => {
              clearMeasureCanvas()
              setRoofChainStartId(null)
              setRoofLineMode(true)
              drawRoofGraphCanvas(null, null)
            }}>
              Trace line
            </button>
          </>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !carveMode && !elevEdgeMode && !elevAlignMode && isElevationPage && (
          <button
            className="snap-btn"
            onClick={() => {
              const defaultSrc = elevEdgeFloorCandidates.length > 0 ? elevEdgeFloorCandidates[0].pageId : null
              setElevEdgeSourcePageId(defaultSrc)
              setElevEdgeMode(true)
            }}
          >
            Set elevation edge
          </button>
        )}
        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !carveMode && !elevEdgeMode && !elevAlignMode && isElevationPage && (() => {
          const edgeData = resolveElevEdge(currentPageId)
          const srcScale = edgeData ? getEffectiveScale(edgeData.sourcePageId) : null
          return (
            <button
              className="snap-btn"
              disabled={!edgeData || !srcScale}
              title={!edgeData ? 'Set an elevation edge first' : !srcScale ? 'Floor-plan page has no scale' : ''}
              onClick={() => setElevAlignMode(true)}
            >
              Align elevation
            </button>
          )
        })()}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !carveMode && !elevEdgeMode && !elevAlignMode && isElevationPage && !placingOpeningMode && (
          <button
            className="snap-btn"
            title={!pageHasScale ? 'Set scale before placing openings' : ''}
            disabled={!pageHasScale}
            onClick={() => {
              setOpeningCorner1(null)
              setOpeningDraftShape(null)
              saveAndDefaultSnapIncrement()
              setPlacingOpeningMode(true)
            }}
          >
            Place opening
          </button>
        )}
        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !elevEdgeMode && !elevAlignMode && isElevationPage && placingOpeningMode && !openingDraftShape && (
          <>
            <span className="review-status" style={{ color: '#0891b2' }}>
              {openingCorner1 ? 'Click second corner to set size' : 'Click first corner of opening'}
            </span>
            <button className="btn-secondary" onClick={() => { restoreSnapIncrement(); setPlacingOpeningMode(false); setOpeningCorner1(null); redrawFrontFaceLayer(null) }}>
              Cancel
            </button>
          </>
        )}
        {placingFromEntry && pendingEntryToPlace && (
          <>
            <span className="review-status" style={{ color: '#0891b2' }}>
              Click to place {pendingEntryToPlace.mark} ({pendingEntryToPlace.openingKind}
              {pendingEntryToPlace.location ? ` — ${pendingEntryToPlace.location}` : ''})
            </span>
            <button className="btn-secondary" onClick={() => { setPlacingFromEntry(false); setPendingEntryToPlace(null); restoreSnapIncrement() }}>
              Cancel
            </button>
          </>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !carveMode && !elevEdgeMode && !elevAlignMode && isElevationPage && gradeLineOnPage && !placingOpeningMode && (
          <button
            className="snap-btn"
            onClick={() => {
              completedShapesRef.current = completedShapesRef.current.filter(
                s => !(s.pageId === currentPageId && s.shapeKind === 'grade-line')
              )
              const c = measureRef.current
              if (c) {
                const ctx2 = c.getContext('2d')
                ctx2.clearRect(0, 0, c.width, c.height)
                drawLockedShapes(ctx2, completedShapesRef.current, currentPageId)
                drawOpeningShapes(ctx2, completedShapesRef.current, currentPageId)
                drawGradeLineShapes(ctx2, completedShapesRef.current, currentPageId)
                drawRunPaths(ctx2, completedShapesRef.current, currentPageId)
                drawEquipmentItemShapes(ctx2, completedShapesRef.current, currentPageId, zoomRef.current)
              }
              drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
              setDrawMode(true)
              setGradeLineDrawing(true)
            }}
          >
            Redraw grade line
          </button>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !carveMode && !elevEdgeMode && !elevAlignMode && isPlanOrRoofPage && !placingOpeningMode && pageHasScale && (
          <button
            className="snap-btn"
            onClick={() => {
              drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
              setDrawMode(true)
              setRunDrawing(true)
            }}
          >
            Draw run
          </button>
        )}

        {roofLineMode && (
          <div className="draw-toolbar">
            <span className="review-status">
              {roofChainStartId ? 'Click to end segment · Esc abandons chain' : 'Click existing geometry to start · Esc to exit'}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              New edge:&nbsp;
              <select value={roofDefaultRole} onChange={e => setRoofDefaultRole(e.target.value)}
                style={{ fontSize: 12, padding: '1px 4px' }}>
                <option value="hip">Hip</option>
                <option value="valley">Valley</option>
                <option value="ridge">Ridge</option>
              </select>
            </label>
            <button className="btn-secondary"
              disabled={!roofChainStartId}
              onClick={() => {
                const graph = roofGraphRef.current
                let lastEdgeIdx = -1
                for (let i = graph.edges.length - 1; i >= 0; i--) {
                  if (graph.edges[i].bId === roofChainStartId) { lastEdgeIdx = i; break }
                }
                if (lastEdgeIdx === -1) {
                  setRoofChainStartId(null)
                } else {
                  const removed = graph.edges.splice(lastEdgeIdx, 1)[0]
                  healAfterEdgeRemoval(removed)
                  setRoofChainStartId(removed.aId)
                }
                drawRoofGraphCanvas(null, null)
              }}
            >Undo</button>
            <button className="calib-cancel" onClick={() => { setRoofLineMode(false); setRoofChainStartId(null) }}>Done</button>
            <button className="btn-secondary" onClick={() => {
              console.log('roofGraph:', JSON.stringify(roofGraphRef.current, null, 2))
            }}>Dump graph</button>
          </div>
        )}

        {roofRoleMode && (
          <div className="draw-toolbar">
            {roofRoleSelected ? (() => {
              const isEdge = roofRoleSelected.type === 'edge'
              const options = isEdge ? ['Hip', 'Valley', 'Ridge'] : ['Eave', 'Rake']
              const currentRole = isEdge
                ? (roofGraphRef.current.edges.find(e => e.id === roofRoleSelected.edgeId)?.role || 'ridge')
                : (completedShapesRef.current[roofRoleSelected.shapeIdx]?.lineRoles?.[roofRoleSelected.segIdx] || 'eave')
              return (
                <>
                  <span className="review-status">{isEdge ? 'Internal line role:' : 'Perimeter segment role:'}</span>
                  {options.map(role => (
                    <button key={role}
                      className={`snap-btn ${currentRole === role.toLowerCase() ? 'snap-btn--on' : ''}`}
                      onClick={() => {
                        if (isEdge) {
                          const edge = roofGraphRef.current.edges.find(e => e.id === roofRoleSelected.edgeId)
                          if (edge) edge.role = role.toLowerCase()
                        } else {
                          const shape = completedShapesRef.current[roofRoleSelected.shapeIdx]
                          if (shape) shape.lineRoles = { ...shape.lineRoles, [roofRoleSelected.segIdx]: role.toLowerCase() }
                        }
                        setRoofRoleSelected(null)
                        drawRoofRoleCanvas(roofRoleHover, null)
                      }}
                    >{role}</button>
                  ))}
                  {isEdge && (
                    <button className="submode-btn submode-btn--danger" onClick={() => {
                      const graph = roofGraphRef.current
                      const eid = roofRoleSelected.edgeId
                      const removedEdge = graph.edges.find(e => e.id === eid)
                      if (removedEdge) {
                        graph.edges = graph.edges.filter(e => e.id !== eid)
                        healAfterEdgeRemoval(removedEdge)
                      }
                      setRoofRoleSelected(null)
                      drawRoofRoleCanvas(roofRoleHover, null)
                    }}>Delete</button>
                  )}
                  <button className="btn-secondary" onClick={() => { setRoofRoleSelected(null); drawRoofRoleCanvas(roofRoleHover, null) }}>
                    Cancel
                  </button>
                </>
              )
            })() : (
              <>
                <span className="review-status">Click a perimeter edge (Eave/Rake) or internal line (Hip/Valley/Ridge)</span>
                <button className="calib-cancel" onClick={() => { setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null) }}>
                  Done
                </button>
              </>
            )}
          </div>
        )}

        {drawMode && (
          <div className="draw-toolbar">
            {!reviewShape && !roofShapeDraft ? (
              <>
                <button
                  className={`snap-btn ${snapAngle ? 'snap-btn--on' : ''}`}
                  onClick={() => {
                    const next = !snapAngle; setSnapAngle(next)
                    redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, next, snapDist, currentPageId)
                  }}
                >Axis Snap {snapAngle ? 'ON' : 'OFF'}</button>
                <button
                  className={`snap-btn ${snapDist ? 'snap-btn--on' : ''} ${!pageHasScale ? 'snap-btn--unavail' : ''}`}
                  onClick={() => {
                    if (!pageHasScale) return
                    const next = !snapDist; setSnapDist(next)
                    redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, next, currentPageId)
                  }}
                >Dist Snap {snapDist ? 'ON' : 'OFF'}</button>
                {(() => {
                  const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
                  return ghostPageId ? (
                    <>
                      <button
                        className={`snap-btn ${showGhost ? 'snap-btn--on' : ''}`}
                        onClick={() => {
                          setShowGhostByPageId(m => ({ ...m, [currentPageId]: !(m[currentPageId] ?? true) }))
                        }}
                      >Show {refLayerLabel} {showGhost ? 'ON' : 'OFF'}</button>
                      <button
                        className={`snap-btn ${alignMode ? 'snap-btn--on' : ''}`}
                        onClick={() => {
                          if (!alignMode) { setShowGhostByPageId(m => ({ ...m, [currentPageId]: true })); setAlignMode(true) }
                          else setAlignMode(false)
                        }}
                      >{alignMode ? 'Exit align' : isConfirmed ? 'Realign' : alignStarted ? 'Resume align' : `Align to ${refLayerLabel}`}</button>
                      {alignMode && refCandidates.length > 1 && (
                        <select className="snap-increment-select"
                          value={ghostSrc || ''}
                          onChange={e => {
                            const v = e.target.value
                            if (v) { pageRefParentRef.current[currentPageId] = v; setAlignTick(t => t + 1) }
                          }}
                        >
                          <option value="">— reference —</option>
                          {refCandidates.map(p => (
                            <option key={p.pageId} value={p.pageId}>{p.subLabel || `Page ${p.pageNum}`}</option>
                          ))}
                        </select>
                      )}
                      {alignMode && (
                        <button className="snap-btn" onClick={() => {
                          const pageId = currentPageId
                          const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
                          // #117 (C-rederive): record the author-frame footprint (renderPage pins to it).
                          pageTransformsRef.current[pageId] = { ...cur, confirmed: true, authorScaled: cur.authorScaled ?? 1200 }
                          if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc
                          setAlignMode(false)
                          setAlignTick(t => t + 1)
                        }}>Confirm scale & alignment</button>
                      )}
                    </>
                  ) : null
                })()}
                {runDrawing ? (
                  <>
                    <span className="review-status">Run path — click to trace · Z to undo · Enter or Finish when done</span>
                    <button className="btn-primary" onClick={commitRun} disabled={drawVertexCount < 2}>Finish run</button>
                    <button className="calib-cancel" onClick={exitDrawMode}>Cancel</button>
                  </>
                ) : gradeLineDrawing ? (() => {
                  return (
                    <>
                      <span className="review-status">Grade line — click to trace · Z to undo · Enter or Finish when done</span>
                      <button className="btn-primary" onClick={commitGradeLine} disabled={drawVertexCount < 2}>Finish grade line</button>
                      <button className="calib-cancel" onClick={exitDrawMode}>Cancel</button>
                    </>
                  )
                })() : (
                  <>
                    <span className="draw-status">
                      {drawVertexCount === 0 ? 'Click to start tracing'
                        : drawVertexCount < 3 ? 'Click to continue · Z to undo · Esc to cancel'
                        : 'Continue · click start point to close · Z to undo · Esc to cancel'}
                    </span>
                    {lockedShapesOnPage.length > 0 && (
                      <button className="edit-btn edit-btn--small" onClick={() => {
                        drawVerticesRef.current = []; setDrawVertexCount(0)
                        mousePosRef.current = null; setReviewShape(null)
                        snapIncrementRef.current = 0.1524; setSnapIncrement(0.1524)
                        setDrawMode(false); setEditMode(true)
                      }}>Edit Shapes</button>
                    )}
                    <button className="calib-cancel" onClick={exitDrawMode}>Done</button>
                  </>
                )}
              </>
            ) : roofShapeDraft ? (
              <>
                <span className="review-status">Roof section — choose type</span>
                <button
                  className={`snap-btn ${roofTypeDraft === 'flat' ? 'snap-btn--on' : ''}`}
                  onClick={() => setRoofTypeDraft('flat')}
                >Flat</button>
                <button
                  className={`snap-btn ${roofTypeDraft === 'sloped' ? 'snap-btn--on' : ''}`}
                  onClick={() => setRoofTypeDraft('sloped')}
                >Sloped</button>
                {roofTypeDraft === 'flat' && (
                  <label className="roof-parapet-label">
                    Parapet width:&nbsp;
                    <input
                      className="calib-input"
                      type="number" min="0" step="any"
                      style={{ width: 56 }}
                      value={parapetWidthDraft}
                      onChange={e => setParapetWidthDraft(e.target.value)}
                      placeholder="0"
                    />
                    &nbsp;in
                  </label>
                )}
                <button className="btn-primary" onClick={confirmRoofShape} disabled={!roofTypeDraft}>Confirm Section</button>
                <button className="btn-secondary" onClick={discardShape}>Discard</button>
              </>
            ) : (
              <>
                {showGradeLinePrompt ? (
                  <>
                    <span className="review-status">Trace grade line?</span>
                    <button className="btn-primary" onClick={() => { setGradeLinePending(true); setShowGradeLinePrompt(false) }}>Yes — trace grade line</button>
                    <button className="btn-secondary" onClick={() => setShowGradeLinePrompt(false)}>No</button>
                  </>
                ) : (
                  <span className="review-status">Shape closed — confirm or discard</span>
                )}
                <button className="btn-primary" onClick={confirmShape}>Confirm Shape</button>
                <button className="btn-secondary" onClick={discardShape}>Discard</button>
              </>
            )}
          </div>
        )}

        {editMode && (
          <div className="draw-toolbar">
            {editSubMode === null && (
              <>
                <button className="submode-btn" onClick={enterMoveMode} title="Click and drag shapes to reposition">
                  Move Shape
                </button>
                <button className="submode-btn" onClick={enterCombineMode}
                  disabled={!hasCombinableShapes}
                  title={hasCombinableShapes ? 'Merge two shapes that share an edge' : 'No adjacent shapes to combine'}>
                  Combine Shapes
                </button>
                <button className="submode-btn" onClick={enterSplitMode} title="Draw a cut line to split a shape in two">
                  Split Shape
                </button>
                <button className="submode-btn submode-btn--danger" onClick={enterDeleteMode} title="Click a shape to delete it">
                  Delete Shape
                </button>
                {(() => {
                  const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
                  return ghostPageId ? (
                    <>
                      <button
                        className={`snap-btn ${showGhost ? 'snap-btn--on' : ''}`}
                        onClick={() => {
                          setShowGhostByPageId(m => ({ ...m, [currentPageId]: !(m[currentPageId] ?? true) }))
                          drawEditCanvas(editHoverRef.current)
                        }}
                      >Show {refLayerLabel} {showGhost ? 'ON' : 'OFF'}</button>
                      <button
                        className={`snap-btn ${alignMode ? 'snap-btn--on' : ''}`}
                        onClick={() => {
                          if (!alignMode) { setShowGhostByPageId(m => ({ ...m, [currentPageId]: true })); setAlignMode(true) }
                          else setAlignMode(false)
                        }}
                      >{alignMode ? 'Exit align' : isConfirmed ? 'Realign' : alignStarted ? 'Resume align' : `Align to ${refLayerLabel}`}</button>
                      {alignMode && refCandidates.length > 1 && (
                        <select className="snap-increment-select"
                          value={ghostSrc || ''}
                          onChange={e => {
                            const v = e.target.value
                            if (v) { pageRefParentRef.current[currentPageId] = v; setAlignTick(t => t + 1) }
                          }}
                        >
                          <option value="">— reference —</option>
                          {refCandidates.map(p => (
                            <option key={p.pageId} value={p.pageId}>{p.subLabel || `Page ${p.pageNum}`}</option>
                          ))}
                        </select>
                      )}
                      {alignMode && (
                        <button className="snap-btn" onClick={() => {
                          const pageId = currentPageId
                          const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
                          // #117 (C-rederive): record the author-frame footprint (renderPage pins to it).
                          pageTransformsRef.current[pageId] = { ...cur, confirmed: true, authorScaled: cur.authorScaled ?? 1200 }
                          if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc
                          setAlignMode(false)
                          setAlignTick(t => t + 1)
                        }}>Confirm scale & alignment</button>
                      )}
                    </>
                  ) : null
                })()}
                <span className="edit-status">Drag corner · side · hold segment to insert vertex</span>

                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitEditMode}>Done</button>
              </>
            )}

            {editSubMode === 'move' && (
              <>
                <span className="submode-status submode-status--move">Move Shape</span>
                <span className="edit-status">Click and drag a shape · Esc to cancel</span>

                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitSubMode}>Back</button>
              </>
            )}

            {editSubMode === 'combine' && (
              <>
                <span className="submode-status submode-status--combine">Combine Shapes</span>
                <span className="edit-status">
                  {combineError ? combineError
                    : combineSelection.length === 0 ? 'Click a highlighted shape to select it'
                    : combineSelection.length === 1 ? 'Click another adjacent shape'
                    : canApplyCombine ? 'Exact shared edge found — ready to combine'
                    : 'Selected shapes don\'t share an exact edge'}
                </span>
                {canApplyCombine && (
                  <button className="btn-primary btn-sm" onClick={applyMerge}>Apply Combine</button>
                )}

                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitSubMode}>Back</button>
              </>
            )}

            {editSubMode === 'delete' && (
              <>
                <span className="submode-status submode-status--delete">Delete Shape</span>
                <span className="edit-status">Click a shape to delete it permanently</span>

                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitSubMode}>Back</button>
              </>
            )}

            {editSubMode === 'split' && (
              <>
                <span className="submode-status submode-status--split">Split Shape</span>
                <span className="edit-status">
                  {splitSelected === null ? 'Click a shape to select it'
                    : splitCut.length === 0 ? 'Click to place first cut point'
                    : splitCut.length === 1 ? 'Click to complete cut line'
                    : canApplySplit ? 'Cut line valid — ready to split'
                    : 'Cut line doesn\'t cross the shape — reset and try again'}
                </span>
                {canApplySplit && (
                  <button className="btn-primary btn-sm" onClick={applySplit}>Apply Split</button>
                )}
                {splitCut.length > 0 && (
                  <button className="calib-cancel" onClick={() => {
                    splitCutRef.current = []; splitMouseRef.current = null
                    setSplitCut([]); drawEditCanvas()
                  }}>Reset Cut</button>
                )}

                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitSubMode}>Back</button>
              </>
            )}
          </div>
        )}
      </div>

      {categorizeMode && currentPage && (
        <div className="categorize-panel">
          <div className="cat-panel-head">
            <span className="cat-panel-title">Categorize Pages</span>
            <span className="cat-panel-progress">{categorizedCount} of {pages.filter(p => !sheetsWithRegions.has(p.pageId)).length} labelled</span>
            <span className="cat-panel-hint">Page navigation stays active — jump to any page.</span>
            <button className="btn-primary btn-sm" onClick={() => { setCategorizeMode(false); setCatReentry(false) }}>Done</button>
          </div>

          <div className="cat-panel-body">
            {catReentry && uncategorizedLogical.length === 0 ? (
              <span className="cat-all-done">All pages are categorized. Click Done to finish.</span>
            ) : currentPageIsSourceSheet ? (
              <span className="cat-panel-hint" style={{ display: 'block', padding: '8px 0' }}>
                This page has carved regions — navigate to a region to categorize.
              </span>
            ) : (
            <>
            <span className="cat-page-label">Page {currentPage}</span>

            {currentPageEntry?.category && recatPageId !== currentPageId ? (
              <div className="cat-summary">
                <span className="cat-summary-text">
                  {categoryLabel(currentPageEntry.category)}
                  {currentPageEntry.subLabel ? ` — ${currentPageEntry.subLabel}` : ''}
                  {currentPageEntry.subLabelNote ? ` (${currentPageEntry.subLabelNote})` : ''}
                </span>
                <button className="cat-recat-btn" onClick={startRecategorize}>Recategorize</button>
              </div>
            ) : (
              <>
                <div className="cat-category-row">
                  {CATEGORY_OPTIONS.map(opt => (
                    <button key={opt.key}
                      className={`cat-cat-btn ${catDraftCategory === opt.key ? 'cat-cat-btn--active' : ''}`}
                      onClick={() => selectCatCategory(opt.key)}>
                      {opt.label}
                    </button>
                  ))}
                  <button className="cat-cat-btn cat-cat-btn--skip" onClick={skipCatPage}>
                    Skip this page
                  </button>
                </div>

                {catDraftCategory && (
                  <div className="cat-sublabel-row">
                    {catDraftCategory === 'floor-plan' && (
                      <>
                        <select className="cat-sublabel-select" value={catDraftSubLabel}
                          onChange={e => setCatDraftSubLabel(e.target.value)}>
                          <option value="">— level (required) —</option>
                          {FLOOR_SUBLABELS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input className="cat-sublabel-input" type="text" placeholder="Note (optional)"
                          value={catDraftNote} onChange={e => setCatDraftNote(e.target.value)} />
                      </>
                    )}

                    {catDraftCategory === 'elevation' && (
                      <select className="cat-sublabel-select" value={catDraftSubLabel}
                        onChange={e => setCatDraftSubLabel(e.target.value)}>
                        <option value="">— direction —</option>
                        {ELEVATION_DIRS.map(d => <option key={d} value={d}>{d} elevation</option>)}
                      </select>
                    )}

                    {FREETEXT_SUBLABEL_CATEGORIES.includes(catDraftCategory) && (
                      <input className="cat-sublabel-input" type="text" placeholder="Sub-label (optional)"
                        value={catDraftSubLabel} onChange={e => setCatDraftSubLabel(e.target.value)} />
                    )}

                    <button className="btn-primary btn-sm" onClick={confirmCatPage} disabled={catConfirmDisabled}>Confirm this page</button>
                  </div>
                )}
              </>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {frontFacePromptOpen && (
        <div className="frontface-prompt">
          <span className="frontface-prompt-text">
            Click the road-facing exterior wall of your building to set the front face.
          </span>
          <button className="calib-cancel" onClick={skipFrontFace}>Skip for now</button>
        </div>
      )}

      {elevEdgeMode && (
        <div className="frontface-prompt">
          {elevEdgeFloorCandidates.length === 0 ? (
            <span className="cat-panel-hint">No floor plan with locked shapes to reference.</span>
          ) : (
            <>
              <span className="frontface-prompt-text">
                Click an edge on the floor plan ghost to set the elevation reference edge.
              </span>
              {elevEdgeFloorCandidates.length > 1 && (
                <select
                  className="snap-increment-select"
                  value={elevEdgeSourcePageId || ''}
                  onChange={e => {
                    elevEdgeHoverRef.current = null
                    setElevEdgeSourcePageId(e.target.value || null)
                  }}
                >
                  {elevEdgeFloorCandidates.map(p => (
                    <option key={p.pageId} value={p.pageId}>{p.subLabel || `Page ${p.pageNum}`}</option>
                  ))}
                </select>
              )}
            </>
          )}
          <button className="calib-cancel" onClick={() => {
            setElevEdgeMode(false); elevEdgeHoverRef.current = null; setEditCursor('default')
            redrawFrontFaceLayer(null)
          }}>Exit</button>
        </div>
      )}

      {elevAlignMode && (
        <div className="frontface-prompt">
          <span className="frontface-prompt-text">
            Drag to translate · drag a corner to scale · then Confirm.
          </span>
          <button
            className="btn-primary btn-sm"
            onClick={confirmElevAlign}
          >
            Confirm alignment
          </button>
          <button className="calib-cancel" onClick={() => {
            setElevAlignMode(false); alignDragRef.current = null
            setEditCursor('default'); redrawFrontFaceLayer(null)
          }}>Exit</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="canvas-area">
        <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : 'sidebar--closed'}`}>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
          {sidebarOpen && (
            <div className="sidebar-content">
              {pdf && sidebarSections.map(section => (
                <div key={section.title} className="sidebar-section">
                  <div className="sidebar-section-title">{section.title}</div>
                  {section.entries.map(entry => (
                    <button
                      key={entry.pageId}
                      className={`sidebar-entry ${entry.pageId === currentPageId ? 'sidebar-entry--active' : ''}`}
                      onClick={() => goToPageId(entry.pageId)}
                      title={entry.label}
                    >
                      {entry.label}
                      {entry.isSourceSheet && <span className="sidebar-full-sheet-chip">(full sheet)</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

        {showSidebar && pdf && !calibMode && !drawMode && !editMode && !categorizeMode && (() => {
          const isWide = sidebarWidth >= 520
          return (
            <div className="side-panel-container" style={{ width: sidebarWidth }}>
              {/* Drag-to-resize handle on left edge */}
              <div
                className="side-panel-resize-handle"
                onMouseDown={e => {
                  e.preventDefault()
                  const startX = e.clientX; const startW = sidebarWidthRef.current
                  const onMove = ev => {
                    const newW = Math.min(Math.max(300, startW - (ev.clientX - startX)), window.innerWidth * 0.8)
                    sidebarWidthRef.current = newW; setSidebarWidth(newW)
                  }
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
              />
              {/* Tab bar — narrow: vertical stacked bars; wide (≥520px): horizontal row */}
              <div className={`side-panel-tab-bar${isWide ? ' side-panel-tab-bar--wide' : ''}`}>
                {SIDEBAR_TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={`side-panel-tab${activeTabId === tab.id ? ' side-panel-tab--active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                  >{tab.label}</button>
                ))}
              </div>
              {/* Content area — only the active panel renders */}
              <div className="side-panel-content">

                {showProjectSetup && pdf && (() => {
          // Derive category order from CONFIG_FIELDS array order (no hardcoded category list).
          const categories = []
          const byCategory = {}
          for (const field of CONFIG_FIELDS) {
            if (!byCategory[field.category]) {
              categories.push(field.category)
              byCategory[field.category] = []
            }
            byCategory[field.category].push(field)
          }
          void projectSetupTick  // ensure re-render on tick bump
          // Resolved config for display: cross-field rules applied (e.g. auto-fill).
          // getConfigValue (raw) is still used by onChange/onBlur writes — they store user intent.
          const resolvedPanelCfg = resolveEffectiveConfig(projectSetupRef.current.values)
          return (
            <div className="fh-panel ps-panel">
              <div className="fh-panel-head">
                <span className="fh-panel-title">Project Setup</span>
                <button className="fh-close-btn" onClick={() => setShowProjectSetup(false)}>✕</button>
              </div>
              {categories.map(cat => (
                <div key={cat} className="fh-zone">
                  <div className="fh-zone-label">{cat}</div>
                  {byCategory[cat].map(field => {
                    const current = resolvedPanelCfg[field.id] ?? getConfigValue(field.id)
                    return (
                      <div key={field.id} className="fh-row ps-field-row">
                        <div className="fh-field-label ps-field-label">{field.label}</div>
                        {field.kind === 'number' ? (
                          <input
                            type="number"
                            step="0.5"
                            placeholder="— auto from station —"
                            className="ps-select ps-count-input"
                            value={psCountDrafts[field.id] ?? (current != null ? String(current) : '')}
                            onChange={e => {
                              const raw = e.target.value
                              setPsCountDrafts(prev => ({ ...prev, [field.id]: raw }))
                              const n = parseFloat(raw)
                              setConfigValue(field.id, raw === '' || isNaN(n) ? null : n)
                            }}
                            onBlur={e => {
                              const raw = e.target.value
                              const n = parseFloat(raw)
                              const stored = raw === '' || isNaN(n) ? null : n
                              setPsCountDrafts(prev => ({ ...prev, [field.id]: stored != null ? String(stored) : '' }))
                              setConfigValue(field.id, stored)
                            }}
                          />
                        ) : field.kind === 'count' ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="ps-select ps-count-input"
                            value={psCountDrafts[field.id] ?? (current === 0 ? '' : String(current))}
                            onChange={e => {
                              const raw = e.target.value
                              setPsCountDrafts(prev => ({ ...prev, [field.id]: raw }))
                              setConfigValue(field.id, Math.max(0, parseInt(raw) || 0))
                            }}
                            onBlur={e => {
                              const n = Math.max(0, parseInt(e.target.value) || 0)
                              setPsCountDrafts(prev => ({ ...prev, [field.id]: n === 0 ? '' : String(n) }))
                            }}
                          />
                        ) : field.multi ? (
                          <div className="ps-checkbox-group">
                            {field.options.map(opt => {
                              const checked = Array.isArray(current) && current.includes(opt.value)
                              return (
                                <label key={opt.value} className="ps-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const arr = Array.isArray(current) ? [...current] : []
                                      const next = checked ? arr.filter(v => v !== opt.value) : [...arr, opt.value]
                                      setConfigValue(field.id, next)
                                    }}
                                  />
                                  {opt.label}
                                </label>
                              )
                            })}
                          </div>
                        ) : (
                          <select
                            className="ps-select"
                            value={current ?? ''}
                            onChange={e => setConfigValue(field.id, e.target.value || null)}
                          >
                            <option value="">— Select —</option>
                            {field.options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* ── Required Roles (computed view, §3) ── */}
              {(() => {
                const requiredRoles = getRequiredRoles()
                return (
                  <div className="fh-zone">
                    <div className="fh-zone-label">Required Roles</div>
                    {requiredRoles.length === 0 ? (
                      <div className="fh-empty">Select required outputs to see roles.</div>
                    ) : (
                      requiredRoles.map(roleId => {
                        const assignment = getRoleAssignment(roleId)
                        return (
                          <div key={roleId} className="fh-row ps-field-row">
                            <div className="fh-field-label ps-field-label">{ROLE_LABELS[roleId]}</div>
                            <input
                              type="text"
                              className="ps-role-input"
                              placeholder="Assign to…"
                              value={assignment}
                              onChange={e => setRoleAssignment(roleId, e.target.value)}
                            />
                            {!assignment && (
                              <div className="ps-role-fallback">(unassigned — owner responsible)</div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {showFloorHeights && pdf && (
          <div className="fh-panel">
            <div className="fh-panel-head">
              <span className="fh-panel-title">Floor Heights</span>
              <button className="fh-close-btn" onClick={() => setShowFloorHeights(false)}>✕</button>
            </div>

            {presentFloorLevels.length === 0 ? (
              <div className="fh-empty">Categorize floor plan pages first to enter floor heights.</div>
            ) : (
              <>
                {/* ── Outstanding zone ── */}
                <div className="fh-zone">
                  <div className="fh-zone-label">Outstanding</div>
                  {fhOutstanding.length === 0 ? (
                    <div className="fh-all-done">All heights entered ✓</div>
                  ) : (
                    <ul className="fh-outstanding-list">
                      {fhOutstanding.map(item => (
                        <li key={item.key} className="fh-outstanding-item">{item.label}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ── Stack zone ── */}
                <div className="fh-zone">
                  <div className="fh-zone-label">Stack — base → top</div>
                  {fhZStack.map((row, idx) => {
                    const isTop = idx === fhZStack.length - 1
                    const entry = floorHeightsRef.current[row.level] || {}
                    const isExpanded = fhExpandedLevel === row.level
                    const floorToFloor = (!isTop && row.floorToCeiling != null && row.floorSystemAbove != null)
                      ? row.floorToCeiling + row.floorSystemAbove : null
                    const precision = fhDisplayUnit === 'm' ? 3 : 2

                    return (
                      <div key={row.level} className="fh-row">
                        <div className="fh-row-level">{row.level}</div>

                        {/* Ceiling height input — ft + in, matching calibration dialog convention */}
                        <div className="fh-field-row">
                          <span className="fh-field-label">Ceiling height</span>
                          <div className="fh-input-group">
                            <input
                              type="number"
                              className="fh-input fh-input--sm"
                              step="1"
                              min="0"
                              placeholder="0"
                              value={fhFtVals[row.level] ?? ''}
                              onFocus={() => { if (fhError && fhError.level !== row.level) setFhError(null) }}
                              onChange={e => {
                                const ftStr = e.target.value
                                setFhFtVals(prev => ({ ...prev, [row.level]: ftStr }))
                                const ft = parseFloat(ftStr) || 0
                                const inches = parseFloat(fhInVals[row.level]) || 0
                                const val = ft + inches / 12
                                const isEmpty = ft === 0 && inches === 0 && ftStr === '' && (fhInVals[row.level] ?? '') === ''
                                setFloorHeightFields(row.level, { floorToCeiling: isEmpty ? null : val, ceilingSource: 'direct' })
                              }}
                            />
                            <span className="fh-unit">ft</span>
                            <input
                              type="number"
                              className="fh-input fh-input--sm"
                              step="0.5"
                              min="0"
                              placeholder="0"
                              value={fhInVals[row.level] ?? ''}
                              onFocus={() => { if (fhError && fhError.level !== row.level) setFhError(null) }}
                              onChange={e => {
                                const inStr = e.target.value
                                setFhInVals(prev => ({ ...prev, [row.level]: inStr }))
                                const ft = parseFloat(fhFtVals[row.level]) || 0
                                const inches = parseFloat(inStr) || 0
                                const val = ft + inches / 12
                                const isEmpty = ft === 0 && inches === 0 && (fhFtVals[row.level] ?? '') === '' && inStr === ''
                                setFloorHeightFields(row.level, { floorToCeiling: isEmpty ? null : val, ceilingSource: 'direct' })
                              }}
                            />
                            <span className="fh-unit">in</span>
                          </div>
                        </div>

                        {/* Floor system above */}
                        {isTop ? (
                          <div className="fh-top-marker">Floor system: — (top of stack)</div>
                        ) : (
                          <div className="fh-expand-control">
                            <div className="fh-expand-summary" onClick={() => openFhExpand(row.level)}>
                              <span className="fh-field-label">Floor system above</span>
                              <span className="fh-expand-value">
                                {entry.floorSystemAbove != null
                                  ? `${entry.floorSystemAbove.toFixed(precision)} ${fhDisplayUnit}`
                                  : 'not set'}
                              </span>
                              <span className="fh-expand-caret">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                            {isExpanded && (
                              <div className="fh-expand-body">
                                <div className="fh-presets">
                                  {FLOOR_SYSTEM_PRESETS.map(p => (
                                    <button key={p.label} className="fh-preset-btn"
                                      onClick={() => applyFhPreset(row.level, p.inches)}
                                    >
                                      {p.label}
                                    </button>
                                  ))}
                                  <button
                                    className={`fh-preset-btn ${fhCustomActive ? 'fh-preset-btn--active' : ''}`}
                                    onClick={() => setFhCustomActive(a => !a)}
                                  >
                                    Custom
                                  </button>
                                </div>
                                {fhCustomActive && (
                                  <div className="fh-custom-form">
                                    <div className="fh-input-group">
                                      <input
                                        type="number"
                                        className="fh-input"
                                        step="0.125"
                                        min="0"
                                        placeholder="depth"
                                        value={fhCustomVal}
                                        onChange={e => setFhCustomVal(e.target.value)}
                                        autoFocus
                                      />
                                      <span className="fh-unit">in</span>
                                    </div>
                                    <label className="fh-sheathing-label">
                                      <input
                                        type="checkbox"
                                        checked={fhCustomSheathing}
                                        onChange={e => setFhCustomSheathing(e.target.checked)}
                                      />
                                      add sheathing &amp; drywall (1⅜″)
                                    </label>
                                    <button
                                      className="fh-apply-btn"
                                      disabled={fhCustomVal === '' || isNaN(parseFloat(fhCustomVal))}
                                      onClick={() => applyFhCustom(row.level)}
                                    >
                                      Apply
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Floor-to-floor entry (absent on top-of-stack) */}
                        {!isTop && (
                          <div className="fh-field-row">
                            <span className="fh-field-label">Floor to floor</span>
                            {entry.floorSystemAbove == null ? (
                              <span className="cat-panel-hint">Set floor system above first</span>
                            ) : (
                              <div className="fh-input-group">
                                <input
                                  type="number"
                                  className="fh-input fh-input--sm"
                                  step="1"
                                  min="0"
                                  placeholder="0"
                                  value={fhF2fFtVals[row.level] ?? ''}
                                  onFocus={() => { if (fhError && fhError.level !== row.level) setFhError(null) }}
                                  onChange={e => {
                                    const ftStr = e.target.value
                                    setFhF2fFtVals(prev => ({ ...prev, [row.level]: ftStr }))
                                    const ft = parseFloat(ftStr) || 0
                                    const inches = parseFloat(fhF2fInVals[row.level]) || 0
                                    const f2f = ft + inches / 12
                                    const fsa = entry.floorSystemAbove
                                    const ftc = f2f - fsa
                                    const err = validateCeiling(ftc, fsa)
                                    if (err) { setFhError({ level: row.level, msg: err }); return }
                                    setFhError(null)
                                    setFloorHeightFields(row.level, { floorToCeiling: ftc, ceilingSource: 'solved' })
                                    const ceilFt = Math.floor(ftc)
                                    const ceilIn = (ftc - ceilFt) * 12
                                    setFhFtVals(prev => ({ ...prev, [row.level]: String(ceilFt) }))
                                    setFhInVals(prev => ({ ...prev, [row.level]: ceilIn.toFixed(1) }))
                                  }}
                                />
                                <span className="fh-unit">ft</span>
                                <input
                                  type="number"
                                  className="fh-input fh-input--sm"
                                  step="0.5"
                                  min="0"
                                  placeholder="0"
                                  value={fhF2fInVals[row.level] ?? ''}
                                  onFocus={() => { if (fhError && fhError.level !== row.level) setFhError(null) }}
                                  onChange={e => {
                                    const inStr = e.target.value
                                    setFhF2fInVals(prev => ({ ...prev, [row.level]: inStr }))
                                    const ft = parseFloat(fhF2fFtVals[row.level]) || 0
                                    const inches = parseFloat(inStr) || 0
                                    const f2f = ft + inches / 12
                                    const fsa = entry.floorSystemAbove
                                    const ftc = f2f - fsa
                                    const err = validateCeiling(ftc, fsa)
                                    if (err) { setFhError({ level: row.level, msg: err }); return }
                                    setFhError(null)
                                    setFloorHeightFields(row.level, { floorToCeiling: ftc, ceilingSource: 'solved' })
                                    const ceilFt = Math.floor(ftc)
                                    const ceilIn = (ftc - ceilFt) * 12
                                    setFhFtVals(prev => ({ ...prev, [row.level]: String(ceilFt) }))
                                    setFhInVals(prev => ({ ...prev, [row.level]: ceilIn.toFixed(1) }))
                                  }}
                                />
                                <span className="fh-unit">in</span>
                              </div>
                            )}
                            {fhError && fhError.level === row.level && (
                              <div className="fh-error">{fhError.msg}</div>
                            )}
                          </div>
                        )}

                        {/* Derived readouts */}
                        <div className="fh-derived">
                          <span>Floor plane: {row.floorZ.toFixed(precision)} {fhDisplayUnit}</span>
                          {row.floorToCeiling != null && (
                            <span>Ceiling: {row.ceilingZ.toFixed(precision)} {fhDisplayUnit}</span>
                          )}
                          {floorToFloor != null && (
                            <span>Floor-to-floor: {floorToFloor.toFixed(precision)} {fhDisplayUnit}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {showWorklist && pdf && (() => {
          void worklistTick
          const { toPlace, obligations } = deriveWorklist()
          // Derive placed-item groups from obligations (preserving instanceKey order)
          const placedGroupKeys = []
          const placedGroupMap = {}
          for (const ob of obligations) {
            if (!placedGroupMap[ob.instanceKey]) {
              placedGroupKeys.push(ob.instanceKey)
              placedGroupMap[ob.instanceKey] = { instanceKey: ob.instanceKey, itemLabel: ob.itemLabel, placedId: ob.placedId, obs: [] }
            }
            placedGroupMap[ob.instanceKey].obs.push(ob)
          }
          const canPlace = isPlanOrRoofPage && getEffectiveScale(currentPageId) && !calibMode && !drawMode && !editMode && !categorizeMode && !placingOpeningMode
          return (
            <div className="fh-panel wl-panel">
              <div className="fh-panel-head">
                <span className="fh-panel-title">Worklist</span>
                <button className="fh-close-btn" onClick={() => setShowWorklist(false)}>✕</button>
              </div>

              {/* ── Items to place ── */}
              <div className="fh-zone">
                <div className="fh-zone-label">Items to Place</div>
                {toPlace.length === 0 ? (
                  <div className="fh-empty wl-all-done">All items placed ✓</div>
                ) : (
                  <ul className="fh-outstanding-list wl-toplace-list">
                    {toPlace.map(item => (
                      <li key={item.instanceKey} className="fh-outstanding-item wl-toplace-item">
                        <span className="wl-item-label">{item.label}</span>
                        <button
                          className="snap-btn wl-place-btn"
                          disabled={!canPlace}
                          title={!isPlanOrRoofPage ? 'Navigate to a floor-plan or roof-plan page to place' : !getEffectiveScale(currentPageId) ? 'Set scale on this page first' : ''}
                          onClick={() => {
                            setShowWorklist(false)
                            setPlacingItemType(item.type)
                            setPlacingInstanceKey(item.instanceKey)
                            setPlacingEquipmentItem(true)
                          }}
                        >
                          Place
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Placed item obligations ── */}
              {placedGroupKeys.length > 0 && (
                <div className="fh-zone">
                  <div className="fh-zone-label">Placed Items</div>
                  {placedGroupKeys.map(key => {
                    const g = placedGroupMap[key]
                    return (
                      <div key={key} className="wl-oblig-group">
                        <div className="wl-oblig-group-label">{g.itemLabel} <span style={{ opacity: 0.55, fontWeight: 400 }}>({g.instanceKey})</span></div>
                        {g.obs.map(ob => {
                          const ownerLine = ob.ownerRoles.length > 0
                            ? `${ob.ownerRoles.length === 1 ? 'Owner' : 'Owners'}: ${ob.ownerRoles.map(r => ROLE_LABELS[r] ?? r).join(', ')}`
                            : null
                          return (
                          <div key={ob.id} className={`wl-oblig-row${ob.blocked && !ob.satisfiedValue ? ' wl-oblig-row--blocked' : ''}`}>
                            {ob.kind === 'run' && ob.satisfiedValue !== null ? (
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className="wl-oblig-label">{ob.label}</span>
                                  <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.78rem' }}>✓ Connected</span>
                                </div>
                                {ownerLine
                                  ? <div className="wl-oblig-owner">{ownerLine}</div>
                                  : <div className="wl-oblig-owner wl-oblig-owner--none">Owner: unassigned</div>}
                              </div>
                            ) : ob.blocked ? (
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className="wl-lock">🔒</span>
                                  <span className="wl-oblig-label">{ob.label}</span>
                                  <span className="wl-oblig-note">{ob.note}</span>
                                </div>
                                {ownerLine
                                  ? <div className="wl-oblig-owner">{ownerLine}</div>
                                  : <div className="wl-oblig-owner wl-oblig-owner--none">Owner: unassigned</div>}
                              </div>
                            ) : ob.kind === 'property' && ob.options ? (
                              <div style={{ flex: 1 }}>
                                <div className="wl-oblig-label">{ob.label}</div>
                                <select
                                  className="ps-select wl-prop-select"
                                  style={{ opacity: 1 }}
                                  value={ob.satisfiedValue ?? ''}
                                  onChange={e => {
                                    const val = e.target.value || null
                                    completedShapesRef.current = completedShapesRef.current.map(s =>
                                      s.id === g.placedId
                                        ? { ...s, obligationState: { ...(s.obligationState || {}), [ob.id]: val } }
                                        : s
                                    )
                                    setWorklistTick(t => t + 1)
                                  }}
                                >
                                  <option value="">— Select —</option>
                                  {ob.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                {ownerLine
                                  ? <div className="wl-oblig-owner">{ownerLine}</div>
                                  : <div className="wl-oblig-owner wl-oblig-owner--none">Owner: unassigned</div>}
                              </div>
                            ) : null}
                          </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {showOpenings && pdf && (() => {
          void pendingOpeningsTick
          const entries = pendingOpeningsRef.current
          const canPlaceOpening = isElevationPage && pageHasScale && !calibMode && !drawMode && !editMode && !categorizeMode && !placingOpeningMode && !placingFromEntry
          return (
            <div className="fh-panel wl-panel">
              <div className="fh-panel-head">
                <span className="fh-panel-title">Openings to Place</span>
                <button className="fh-close-btn" onClick={() => setShowSidebar(false)}>✕</button>
              </div>
              <div className="fh-zone">
                {entries.length === 0 ? (
                  <div className="fh-empty wl-all-done">No openings pending ✓</div>
                ) : (
                  <ul className="fh-outstanding-list wl-toplace-list">
                    {entries.map(entry => (
                      <li key={entry.id} className="fh-outstanding-item wl-toplace-item">
                        <div style={{ flex: 1 }}>
                          <span className="wl-item-label">
                            {entry.mark} — {entry.openingKind}
                            {entry.remaining > 1 ? ` ×${entry.remaining}` : ''}
                          </span>
                          {entry.operationType && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>{entry.operationType}</div>
                          )}
                          {entry.location && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.55 }}>{entry.location}</div>
                          )}
                        </div>
                        <button
                          className="snap-btn wl-place-btn"
                          disabled={!canPlaceOpening}
                          title={
                            !isElevationPage ? 'Navigate to an elevation page to place' :
                            !pageHasScale    ? 'Set scale on this page first' : ''
                          }
                          onClick={() => {
                            saveAndDefaultSnapIncrement()
                            setPendingEntryToPlace(entry)
                            setPlacingFromEntry(true)
                            setShowSidebar(false)
                          }}
                        >
                          Place
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })()}

        {showEnumeration && pdf && (() => {
          void enumerationTick
          const elements = deriveEnumeration()
          const byKind = {}
          for (const el of elements) {
            if (!byKind[el.kind]) byKind[el.kind] = []
            byKind[el.kind].push(el)
          }
          const KIND_ORDER = ['wall-surface', 'flat-roof-surface', 'soffit', 'window', 'door']
          const KIND_LABELS = { 'wall-surface': 'Wall Surfaces', 'flat-roof-surface': 'Flat Roof Surface', soffit: 'Soffits', window: 'Windows', door: 'Doors' }
          const fmtM = v => v != null ? v.toFixed(3) + ' m' : '—'
          const fmtDeg = v => v != null ? v.toFixed(1) + '°' : '—'
          return (
            <div className="fh-panel enum-panel">
              <div className="fh-panel-head">
                <span className="fh-panel-title">Envelope</span>
                <button className="fh-close-btn" onClick={() => setShowEnumeration(false)}>✕</button>
              </div>

              {elements.length === 0 ? (
                <div className="fh-empty">No envelope elements derived yet. Categorize pages, set floor heights, and lock geometry first.</div>
              ) : (
                KIND_ORDER.filter(k => byKind[k]?.length).map(kind => (
                  <div key={kind} className="fh-zone">
                    <div className="fh-zone-label">{KIND_LABELS[kind]} ({byKind[kind].length})</div>
                    {byKind[kind].map(el => (
                      <div key={el.id} className="enum-row">
                        {kind === 'wall-surface' && (<>
                          <div className="enum-row-title">{el.floorLevel} · {fmtDeg(el.orientationDeg)} bearing</div>
                          <div className="enum-row-detail">w {fmtM(el.widthM)} · h {fmtM(el.heightM)}</div>
                          <div className="enum-row-detail">floorZ {fmtM(el.floorZm)} · ceilZ {fmtM(el.ceilingZm)}</div>
                          {el.grossAreaM2 != null ? (
                            <div className="enum-row-detail">
                              gross {el.grossAreaM2.toFixed(3)} m²
                              {el.openingAreaM2 > 0
                                ? ` · net ${el.netAreaM2?.toFixed(3)} m² (−${el.openingAreaM2.toFixed(3)} openings)`
                                : ' · net = gross'}
                              {el.openingOverflow && ' ⚠ overflow'}
                            </div>
                          ) : (
                            <div className="enum-row-detail" style={{opacity:0.5}}>area — (set floor height)</div>
                          )}
                          {el.reconcile && <div className="enum-row-tag enum-tag-reconcile" data-tag={el.reconcile}>{el.reconcile}{el.signedDistM != null ? ` ${el.signedDistM >= 0 ? '+' : ''}${el.signedDistM.toFixed(3)}m` : ''}</div>}
                          {/* Assembly row */}
                          {el.assemblySource === 'library-unresolved' ? (
                            <div className="enum-row-detail enum-assembly-status">Library (data pending)</div>
                          ) : el.assemblySource === 'manual' ? (
                            <div className="enum-row-detail enum-assembly-status">
                              Manual · U={el.effectiveUValue != null ? el.effectiveUValue.toFixed(3) + ' W/m²K' : '—'} · t={el.thicknessM != null ? (el.thicknessM * 1000).toFixed(0) + ' mm' : '—'}
                            </div>
                          ) : (
                            <div className="enum-row-detail" style={{opacity:0.5}}>(no assembly — enter below)</div>
                          )}
                          <div className="enum-assembly-inputs">
                            <label className="enum-assembly-label">U-value W/m²K</label>
                            <input
                              type="number"
                              key={`${el.id}-uv-${el.assemblySource}-${el.effectiveUValue}`}
                              className="enum-assembly-input"
                              defaultValue={el.effectiveUValue ?? ''}
                              step="0.001" min="0"
                              placeholder="e.g. 0.250"
                              onBlur={e => {
                                const v = parseFloat(e.target.value)
                                if (!isNaN(v) && v > 0) {
                                  surfaceAssemblyRef.current[el.id] = {
                                    ...(surfaceAssemblyRef.current[el.id] ?? {}),
                                    tier: 'manual', assemblyId: null,
                                    effectiveUValue: v,
                                    snapshotA: el.worldA, snapshotB: el.worldB,
                                  }
                                  setEnumerationTick(t => t + 1)
                                }
                              }}
                            />
                            <label className="enum-assembly-label">Thickness m</label>
                            <input
                              type="number"
                              key={`${el.id}-th-${el.assemblySource}-${el.thicknessM}`}
                              className="enum-assembly-input"
                              defaultValue={el.thicknessM ?? ''}
                              step="0.001" min="0"
                              placeholder="e.g. 0.300"
                              onBlur={e => {
                                const v = parseFloat(e.target.value)
                                if (!isNaN(v) && v > 0) {
                                  surfaceAssemblyRef.current[el.id] = {
                                    ...(surfaceAssemblyRef.current[el.id] ?? {}),
                                    tier: 'manual', assemblyId: null,
                                    thicknessM: v,
                                    snapshotA: el.worldA, snapshotB: el.worldB,
                                  }
                                  setEnumerationTick(t => t + 1)
                                }
                              }}
                            />
                          </div>
                        </>)}
                        {kind === 'flat-roof-surface' && (<>
                          <div className="enum-row-title">Flat roof footprint</div>
                          <div className="enum-row-detail">area {el.grossAreaM2 != null ? el.grossAreaM2.toFixed(3) + ' m²' : '—'}</div>
                          <div className="enum-row-detail">ceilingZ {fmtM(el.roofCeilingZm)}</div>
                          {el.assemblySource === 'manual' ? (
                            <div className="enum-row-detail enum-assembly-status">
                              Manual · U={el.effectiveUValue != null ? el.effectiveUValue.toFixed(3) + ' W/m²K' : '—'} · t={el.thicknessM != null ? (el.thicknessM * 1000).toFixed(0) + ' mm' : '—'}
                            </div>
                          ) : (
                            <div className="enum-row-detail" style={{opacity:0.5}}>(no assembly — unset)</div>
                          )}
                        </>)}
                        {kind === 'soffit' && (<>
                          <div className="enum-row-title">{el.side} overhang</div>
                          <div className="enum-row-detail">projection {fmtM(el.projectionM)} · span {fmtM(el.spanM)}</div>
                          <div className="enum-row-detail">eaveZ {fmtM(el.eaveZm)}</div>
                        </>)}
                        {(kind === 'window' || kind === 'door') && (<>
                          <div className="enum-row-title">{el.label || '(unlabelled)'} · {el.openingType || '—'}</div>
                          <div className="enum-row-detail">w {fmtM(el.widthM)} · h {fmtM(el.heightM)}</div>
                          <div className="enum-row-detail">worldZ {fmtM(el.worldZm)} · {el.dimBasis || '—'}</div>
                        </>)}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )
        })()}

              {showF280 && pdf && (() => {
                void enumerationTick
                void projectSetupTick
                const enumeration = deriveEnumeration()
                const resolved = resolveEffectiveConfig(projectSetupRef.current.values)
                const result = deriveF280Heating(enumeration, resolved)
                const KIND_LABELS = {
                  'wall-surface': 'Walls',
                  'flat-roof-surface': 'Flat Roof',
                  'window': 'Windows',
                  'door': 'Doors',
                }
                const fmtW = v => v != null ? v.toFixed(0) + ' W' : '—'
                const fmtU = v => v != null ? v.toFixed(3) : '—'
                const fmtM2 = v => v != null ? v.toFixed(2) + ' m²' : '—'
                return (
                  <div className="fh-panel">
                    <div className="fh-panel-head">
                      <span className="fh-panel-title">F280 Heat Loss</span>
                    </div>

                    {result.status === 'no-climate' ? (
                      <div className="fh-zone">
                        <div className="enum-empty">Set location in Project Setup → Climate to compute heat loss</div>
                      </div>
                    ) : (<>
                      <div className="fh-zone">
                        <div className="fh-zone-label">Design Conditions</div>
                        <div className="fh-row">
                          <span className="fh-label">Ti (indoor)</span>
                          <span className="fh-val">{result.tiC} °C</span>
                        </div>
                        <div className="fh-row">
                          <span className="fh-label">Toh (outdoor)</span>
                          <span className="fh-val">{result.tohC} °C</span>
                        </div>
                        <div className="fh-row">
                          <span className="fh-label">ΔT</span>
                          <span className="fh-val">{result.deltaT} °C</span>
                        </div>
                      </div>

                      <div className="fh-zone">
                        <div className="fh-zone-label">Above-Grade Conductive Surfaces</div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
                          <thead>
                            <tr style={{ opacity: 0.6 }}>
                              <th style={{ textAlign:'left', paddingBottom:4 }}>Kind</th>
                              <th style={{ textAlign:'right', paddingBottom:4 }}>Area</th>
                              <th style={{ textAlign:'right', paddingBottom:4 }}>Ū (W/m²K)</th>
                              <th style={{ textAlign:'right', paddingBottom:4 }}>Loss</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(result.bySurfaceKind).map(([kind, b]) => (
                              <tr key={kind} style={{ borderTop:'1px solid rgba(255,255,255,0.08)' }}>
                                <td style={{ paddingTop:4, paddingBottom:4 }}>
                                  {KIND_LABELS[kind] ?? kind}
                                  {b.unresolvedCount > 0 && (
                                    <span style={{ color:'#f59e0b', marginLeft:4, fontSize:'0.72rem' }}>
                                      {b.unresolvedCount} no U
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign:'right' }}>{b.count > 0 ? fmtM2(b.areaM2) : '—'}</td>
                                <td style={{ textAlign:'right' }}>{b.count > 0 ? fmtU(b.uAvg) : '—'}</td>
                                <td style={{ textAlign:'right' }}>{b.count > 0 ? fmtW(b.lossW) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="fh-zone">
                        <div className="fh-row" style={{ fontWeight: 600 }}>
                          <span className="fh-label">Above-grade conductive</span>
                          <span className="fh-val" style={{ color:'#60a5fa' }}>
                            {(result.conductiveAboveGradeW / 1000).toFixed(2)} kW
                          </span>
                        </div>
                      </div>

                      <div className="fh-zone">
                        <div className="fh-zone-label" style={{ opacity: 0.5 }}>Not yet modeled</div>
                        {result.notModeled.map(item => (
                          <div key={item} style={{ fontSize:'0.76rem', opacity:0.4, padding:'2px 0' }}>— {item.replace(/-/g, ' ')}</div>
                        ))}
                      </div>
                    </>)}
                  </div>
                )
              })()}

              </div>{/* /side-panel-content */}
            </div>
          )
        })()}

      <div className={`canvas-wrapper ${currentPage ? 'visible' : ''}`}>
        <div
          className="canvas-stack"
          ref={canvasWrapperRef}
          style={{ cursor: isPanning ? 'grabbing' : (!drawMode && !calibMode && !editMode && !roofLineMode && !placingOpeningMode && !placingEquipmentItem && currentPage ? 'grab' : undefined) }}
        >
          <div
            ref={canvasWorldRef}
            className="canvas-world"
            style={{
              transform: `translate(${viewTransform.panX}px,${viewTransform.panY}px) scale(${viewTransform.zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <div
              className="pdf-align-layer"
              style={{
                // alignTick read here forces React to re-evaluate after each drag write.
                // #117 (C-rederive): backdrop uses the RAW stored {tx,ty,s}. The frame is pinned in
                // renderPage (window-independent footprint), so backdrop and overlay never split —
                // no read-time ratio compensation.
                transform: alignTick >= 0 ? getCSSTransform(pageTransformsRef.current[currentPageId]) : 'none',
                transformOrigin: '0 0',
              }}
            >
              <canvas ref={canvasRef} />
            </div>
            <canvas
              ref={measureRef}
              className="measure-canvas"
              style={{ cursor: carveMode ? 'crosshair' : (alignMode || elevAlignMode) ? (alignDragRef.current ? 'grabbing' : alignOverHandle ? 'nwse-resize' : 'grab') : isPanning ? 'grabbing' : editMode ? editCursor : (drawMode || calibMode || roofLineMode || placingOpeningMode || placingEquipmentItem || placingFromEntry) ? 'crosshair' : undefined }}
              onMouseDown={handleMeasureMouseDown}
              onMouseUp={handleMeasureMouseUp}
              onClick={handleMeasureClick}
              onMouseMove={handleMeasureMouseMove}
            />
          </div>
        </div>
      </div>

      {!pdf && !loading && (
        <div className="empty-state">
          <p>Upload a PDF architectural drawing set to begin</p>
        </div>
      )}
      </div>

      {showCompassOverlay && compassPos.x !== null && (
        <div
          ref={compassOverlayRef}
          className="compass-overlay"
          style={{ left: compassPos.x, top: compassPos.y }}
          tabIndex={0}
          onKeyDown={onCompassKeyDown}
          onPointerDown={onCompassBodyPointerDown}
          onPointerMove={e => { onCompassBodyPointerMove(e); onRotHandlePointerMove(e) }}
          onPointerUp={e => { onCompassBodyPointerUp(e); onRotHandlePointerUp(e) }}
        >
          <p className="compass-instruction">
            Move this panel over your plan's compass rose, then drag the handle on the N arm to rotate until it matches.
          </p>
          {/* SVG compass rose — rotated by compassDraftAngle */}
          <div
            className="compass-rose-wrap"
            style={{ transform: `rotate(${compassDraftAngle}deg)` }}
          >
            <CompassRoseSVG />
            {/* Rotation handle — a circle above the N tip; capture pointer here so move/up route correctly */}
            <div
              className="compass-rot-handle"
              onPointerDown={e => { e.stopPropagation(); onRotHandlePointerDown(e) }}
              onPointerMove={e => { e.stopPropagation(); onRotHandlePointerMove(e) }}
              onPointerUp={e => { e.stopPropagation(); onRotHandlePointerUp(e) }}
              title="Drag to rotate"
            />
          </div>
          {/* Controls panel — not rotated */}
          <div className="compass-controls" onPointerDown={e => e.stopPropagation()}>
            <div className="compass-angle-row">
              <span className="compass-angle-label">
                {compassDraftAngle.toFixed(1)}° ({angleToCardinal(compassDraftAngle)})
              </span>
              <input
                className="compass-angle-input"
                type="number"
                min={0} max={359.9} step={0.1}
                value={compassInputVal}
                onChange={e => setCompassInputVal(e.target.value)}
                onFocus={() => { compassInputFocusedRef.current = true }}
                onBlur={() => {
                  compassInputFocusedRef.current = false
                  const v = parseFloat(compassInputVal)
                  if (!isNaN(v)) {
                    const clamped = ((v % 360) + 360) % 360
                    setCompassDraftAngle(clamped)
                    setCompassInputVal(clamped.toFixed(1))
                  } else {
                    setCompassInputVal(compassDraftAngle.toFixed(1))
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = parseFloat(compassInputVal)
                    if (!isNaN(v)) {
                      const clamped = ((v % 360) + 360) % 360
                      setCompassDraftAngle(clamped)
                      setCompassInputVal(clamped.toFixed(1))
                    }
                    e.currentTarget.blur()
                  }
                  // Stop arrow keys from bubbling to the overlay's nudge handler while typing
                  e.stopPropagation()
                }}
              />
            </div>
            <p className="compass-hint">Drag rose to move · drag handle to rotate · ← → to nudge 1° · Shift+← → for 0.1°</p>
            <div className="compass-btn-row">
              <button className="btn-primary btn-sm" onClick={confirmCompass}>Confirm North Alignment</button>
              <button className="calib-cancel" onClick={skipCompass}>Skip (use default)</button>
            </div>
          </div>
        </div>
      )}

      {showScaleDialog && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && exitCalibMode()}>
          <div className="modal">
            <h2 className="modal-title">Set Scale</h2>
            <p className="modal-sub">Enter the real-world length of the reference line you just drew.</p>
            <div className="modal-unit-toggle">
              <label className={scaleUnit === 'imperial' ? 'active' : ''}>
                <input type="radio" name="unit" value="imperial" checked={scaleUnit === 'imperial'}
                  onChange={() => { setScaleUnit('imperial'); setScaleError('') }} />
                Imperial (ft + in)
              </label>
              <label className={scaleUnit === 'metric' ? 'active' : ''}>
                <input type="radio" name="unit" value="metric" checked={scaleUnit === 'metric'}
                  onChange={() => { setScaleUnit('metric'); setScaleError('') }} />
                Metric (m)
              </label>
            </div>
            {scaleUnit === 'imperial' ? (
              <div className="modal-inputs">
                <div className="input-group">
                  <input type="number" min="0" step="1" placeholder="0" value={feetVal}
                    onChange={e => { setFeetVal(e.target.value); setScaleError('') }} autoFocus />
                  <span className="input-label">ft</span>
                </div>
                <div className="input-group">
                  <input type="number" min="0" step="0.5" placeholder="0" value={inchesVal}
                    onChange={e => { setInchesVal(e.target.value); setScaleError('') }} />
                  <span className="input-label">in</span>
                </div>
              </div>
            ) : (
              <div className="modal-inputs">
                <div className="input-group">
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={metersVal}
                    onChange={e => { setMetersVal(e.target.value); setScaleError('') }} autoFocus />
                  <span className="input-label">m</span>
                </div>
              </div>
            )}
            {scaleError && <p className="modal-error">{scaleError}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={exitCalibMode}>Back</button>
              <button className="btn-primary" onClick={handleConfirmScale}>Confirm Scale</button>
            </div>
          </div>
        </div>
      )}

      {/* #115 — forced categorize-on-carve modal. Non-dismissable: no backdrop-click close, no
          Esc-to-nothing (Esc maps to Cancel/discard). Two explicit actions only. */}
      {carvePending && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="modal-title">Categorize Region</h2>
            <p className="modal-sub">
              This carved region must be categorized before you continue. Pick its view type —
              a single sheet can hold mixed views, so each region is set on its own.
            </p>
            <div className="cat-category-row">
              {CATEGORY_OPTIONS.map(opt => (
                <button key={opt.key}
                  className={`cat-cat-btn ${catDraftCategory === opt.key ? 'cat-cat-btn--active' : ''}`}
                  onClick={() => selectCatCategory(opt.key)}>
                  {opt.label}
                </button>
              ))}
            </div>
            {catDraftCategory && (
              <div className="cat-sublabel-row">
                {catDraftCategory === 'floor-plan' && (
                  <>
                    <select className="cat-sublabel-select" value={catDraftSubLabel}
                      onChange={e => setCatDraftSubLabel(e.target.value)}>
                      <option value="">— level —</option>
                      {FLOOR_SUBLABELS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input className="cat-sublabel-input" type="text" placeholder="Note (optional)"
                      value={catDraftNote} onChange={e => setCatDraftNote(e.target.value)} />
                  </>
                )}
                {catDraftCategory === 'elevation' && (
                  <select className="cat-sublabel-select" value={catDraftSubLabel}
                    onChange={e => setCatDraftSubLabel(e.target.value)}>
                    <option value="">— direction —</option>
                    {ELEVATION_DIRS.map(d => <option key={d} value={d}>{d} elevation</option>)}
                  </select>
                )}
                {FREETEXT_SUBLABEL_CATEGORIES.includes(catDraftCategory) && (
                  <input className="cat-sublabel-input" type="text" placeholder="Sub-label (optional)"
                    value={catDraftSubLabel} onChange={e => setCatDraftSubLabel(e.target.value)} />
                )}
              </div>
            )}
            <div className="cat-sublabel-row">
              <label className="cat-sublabel-label" htmlFor="carve-region-name">Region name</label>
              <input id="carve-region-name" className="cat-sublabel-input" type="text"
                placeholder="Region name"
                value={carveRegionName} onChange={e => setCarveRegionName(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelCarveCategory}>Cancel (discard region)</button>
              <button className="btn-primary" onClick={confirmCarveCategory}
                disabled={!catDraftCategory}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showDimBasisDialog && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="modal-title">Dimension Basis</h2>
            <p className="modal-sub">Are the window/door dimensions measured to the frame or to the rough opening?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => {
                dimensionBasisRef.current = 'rough-opening'
                setShowDimBasisDialog(false)
                if (openingDraftShape?.pendingBasis) {
                  const { vertices, corner1 } = openingDraftShape
                  setOpeningDraftShape(null)
                  openOpeningDialog(vertices, corner1)
                }
              }}>Rough Opening (RO)</button>
              <button className="btn-primary" onClick={() => {
                dimensionBasisRef.current = 'frame'
                setShowDimBasisDialog(false)
                if (openingDraftShape?.pendingBasis) {
                  const { vertices, corner1 } = openingDraftShape
                  setOpeningDraftShape(null)
                  openOpeningDialog(vertices, corner1)
                }
              }}>Frame Size</button>
            </div>
          </div>
        </div>
      )}

      {openingDraftShape && !openingDraftShape.pendingBasis && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="modal-title">Opening Details</h2>
            <div className="fh-field-row" style={{ marginBottom: 10 }}>
              <span className="fh-field-label">Kind</span>
              <label style={{ marginRight: 12 }}>
                <input type="radio" name="opKind" value="window"
                  checked={openingDraftKind === 'window'}
                  onChange={() => setOpeningDraftKind('window')} /> Window
              </label>
              <label>
                <input type="radio" name="opKind" value="door"
                  checked={openingDraftKind === 'door'}
                  onChange={() => setOpeningDraftKind('door')} /> Door
              </label>
            </div>
            <div className="fh-field-row" style={{ marginBottom: 10 }}>
              <span className="fh-field-label">Type</span>
              <select className="snap-increment-select"
                value={openingDraftType}
                onChange={e => setOpeningDraftType(e.target.value)}
              >
                {OPENING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fh-field-row" style={{ marginBottom: 10 }}>
              <span className="fh-field-label">Width ({dimensionBasisRef.current})</span>
              <div className="fh-input-group">
                <input type="number" className="fh-input fh-input--sm" placeholder="0" min="0" step="1"
                  value={openingDraftFt}
                  onChange={e => setOpeningDraftFt(e.target.value)} />
                <span className="fh-unit">ft</span>
                <input type="number" className="fh-input fh-input--sm" placeholder="0" min="0" step="0.5"
                  value={openingDraftIn}
                  onChange={e => setOpeningDraftIn(e.target.value)} />
                <span className="fh-unit">in</span>
              </div>
            </div>
            <div className="fh-field-row" style={{ marginBottom: 10 }}>
              <span className="fh-field-label">Height ({dimensionBasisRef.current})</span>
              <div className="fh-input-group">
                <input type="number" className="fh-input fh-input--sm" placeholder="0" min="0" step="1"
                  value={openingDraftHFt}
                  onChange={e => setOpeningDraftHFt(e.target.value)} />
                <span className="fh-unit">ft</span>
                <input type="number" className="fh-input fh-input--sm" placeholder="0" min="0" step="0.5"
                  value={openingDraftHIn}
                  onChange={e => setOpeningDraftHIn(e.target.value)} />
                <span className="fh-unit">in</span>
              </div>
            </div>
            <div className="fh-field-row" style={{ marginBottom: 16 }}>
              <span className="fh-field-label">Label</span>
              <input type="text" className="fh-input" placeholder="optional"
                value={openingDraftLabel}
                onChange={e => setOpeningDraftLabel(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={discardOpening}>Cancel</button>
              <button className="btn-primary" onClick={confirmOpening}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="dev-fixture-strip">
          <span className="dev-fixture-label">DEV</span>
          <button className="dev-fixture-btn" onClick={async () => {
            try {
              const resp = await fetch('/devFixtures/fixture-elevation.json')
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
              const obj = await resp.json()
              await window.__restoreFixture(obj)
            } catch (err) {
              console.error('[fixture] LOAD failed:', err)
              alert('LOAD FIXTURE failed — see console')
            }
          }}>LOAD FIXTURE</button>
          <button className="dev-fixture-btn" onClick={() => {
            window.__loadPendingOpenings([
              { id:'wew-w1', mark:'W1', openingKind:'window', operationType:'Fixed',
                frameWidthM:0.9, frameHeightM:1.2, roughWidthM:0.94, roughHeightM:1.24,
                quantity:2, location:'Living room', performance:{ uw:1.4, shgc:0.32 } },
              { id:'wew-w2', mark:'W2', openingKind:'window', operationType:'Casement',
                frameWidthM:0.6, frameHeightM:0.9, roughWidthM:0.64, roughHeightM:0.94,
                quantity:1, location:'Bedroom', performance:{ uw:1.4, shgc:0.32 } },
              { id:'wew-d1', mark:'D1', openingKind:'door', operationType:'Single Inswing',
                frameWidthM:0.91, frameHeightM:2.1, roughWidthM:0.95, roughHeightM:2.14,
                quantity:1, location:'Front', performance:{ uw:1.8, shgc:null } },
            ])
          }}>SEED OPENINGS</button>
          <button className="dev-fixture-btn" onClick={async () => {
            const snap = await window.__snapshotFixture()
            const pageLabel = snap.pages?.find(p => p.pageId === `page-${snap.currentPage}`)?.category ?? 'unknown'
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const filename = `fixture-${pageLabel}-${ts}.json`
            const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = filename; a.click()
            URL.revokeObjectURL(url)
          }}>SAVE FIXTURE</button>
        </div>
      )}

      {show3DView && wireframeData && (
        <ThreeDView wireframe={wireframeData} onClose={() => setShow3DView(false)} />
      )}
    </div>
  )
}

export default App
