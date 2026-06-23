import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'
import {
  makeVertex, distToSegment, segmentGeom, projT, applyAxisSnap, parseDisplayDistInput, pointInPolygon,
  findCollinearOverlap, prepareForMerge, mergePolygons, splitPolygon, getEligibleShapes,
  CLOSE_SNAP_RADIUS, ALIGN_TOLERANCE, HIT_SEG_DIST, HIT_VERT_DIST,
  FLOOR_ORDER, getAnchorFloor, getGhostSourcePageId, accumulateZ, isKnownFloorLabel,
  REFERENCE_KIND_DEFAULT, kindToLabel,
} from './geometry.js'
import { pxToDisplayDist, pxToMeters, metersToPx, drawLockedShapes, drawShapePoly, drawAlignGuide, drawSegmentHighlight, drawGhostShapes, drawAlignHandles, getCSSTransform, HANDLE_PX } from './canvasRenderer.js'

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
const categoryLabel = (key) => CATEGORY_OPTIONS.find(o => o.key === key)?.label ?? key

function App() {
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(null)
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

  const [editMode, setEditMode] = useState(false)
  const [editSubMode, setEditSubMode] = useState(null) // 'move'|'combine'|'split'|null
  const [editCursor, setEditCursor] = useState('default')
  const [labelEditState, setLabelEditState] = useState(null)
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

  // ── Floor heights panel (elevation numeric editor, Piece 2) ─────────────────
  const [showFloorHeights, setShowFloorHeights] = useState(false)
  const [floorHeightsTick, setFloorHeightsTick] = useState(0)   // bumped on every floorHeightsRef write; forces re-render
  const [fhExpandedLevel, setFhExpandedLevel] = useState(null)  // level string whose floor-system control is expanded
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
  const [recatPageNum, setRecatPageNum] = useState(null)  // page actively being (re)edited; null = none
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

  // Returns a page's floor-level string (one of FLOOR_ORDER) if it is a known level, else null.
  const getFloorLevel = (pageId) => {
    const page = pages.find(p => p.pageId === pageId)
    return (page && isKnownFloorLabel(page.subLabel)) ? page.subLabel : null
  }

  // ── Page rendering ──────────────────────────────────────────────────────

  const renderPage = useCallback(async (pdfDoc, pageNum) => {
    setRenderingPage(true)
    try {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const containerWidth = Math.min(window.innerWidth - 48, 1200)
      const viewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / viewport.width
      const scaled = page.getViewport({ scale })
      canvas.width = scaled.width
      canvas.height = scaled.height
      if (measureRef.current) {
        measureRef.current.width = scaled.width
        measureRef.current.height = scaled.height
      }
      await page.render({ canvasContext: ctx, viewport: scaled }).promise
      setCurrentPage(pageNum)
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
    setEditMode(false); setEditSubMode(null); setLabelEditState(null)
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
    setPdf(null); setCurrentPage(null); setPageCount(0); setFileName(file.name)
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
    setDrawMode(false); setReviewShape(null)
    setRoofShapeDraft(null); setRoofTypeDraft(null); setParapetWidthDraft('')
    setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null)
    setRoofLineMode(false); setRoofChainStartId(null)
    roofGraphRef.current = { verts: [], edges: [] }; roofVertCounterRef.current = 0; roofEdgeCounterRef.current = 0
    resetEditState()
    completedShapesRef.current = []; pageScalesRef.current = {}; pageGridOriginRef.current = {}
    pageIdMapRef.current = {}; pageTransformsRef.current = {}; floorHeightsRef.current = {}
    drawVerticesRef.current = []; mousePosRef.current = null
    setCompassAngleDeg(null); setCompassCardinal(null)
    setCompassDraftAngle(0); setCompassPos({ x: null, y: null })
    setShowCompassOverlay(false)
    setCategorizeMode(false); setPages([])
    setCatDraftCategory(null); setCatDraftSubLabel(''); setCatDraftNote(''); setRecatPageNum(null); setCatReentry(false)
    setFrontFace(null); setFrontFacePromptOpen(false); ffHoverRef.current = null
    setElevEdgeMode(false); elevEdgeHoverRef.current = null; setElevEdgeSourcePageId(null)
    elevationEdgeRef.current = {}
    setElevAlignMode(false)
    setAlignMode(false); alignDragRef.current = null
    primaryReferenceIdRef.current = null; pageRefParentRef.current = {}
    setShowGhostByPageId({})
    setShowFloorHeights(false); setFhExpandedLevel(null); setFhCustomActive(false); setFhCustomVal(''); setFhCustomSheathing(false)
    setFhFtVals({}); setFhInVals({})
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
      await renderPage(pdfDoc, 1)
    } catch {
      setError('Failed to load PDF. Make sure the file is a valid PDF.')
    } finally {
      setLoading(false)
    }
  }

  const goToPage = (pageNum) => {
    if (!pdf || renderingPage) return
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
    setDrawMode(false); setReviewShape(null)
    setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null)
    setRoofLineMode(false); setRoofChainStartId(null)
    resetEditState()
    setElevAlignMode(false)
    setAlignMode(false); alignDragRef.current = null
    resetZoomPan()
    drawVerticesRef.current = []; mousePosRef.current = null
    renderPage(pdf, pageNum)
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
  }, [calibMode, drawMode, editMode, currentPage, frontFace, frontFacePromptOpen, alignMode, showGhostByPageId, alignTick, elevEdgeMode, elevEdgeSourcePageId, elevAlignMode, floorHeightsTick])

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
      realWorldMeters = (feet * 12 + inches) * 0.0254
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

  const exitDrawMode = () => {
    setDrawMode(false); setReviewShape(null)
    drawVerticesRef.current = []; setDrawVertexCount(0)
    mousePosRef.current = null; drawStartSnapRef.current = null
    snapIncrementRef.current = 0.1524; setSnapIncrement(0.1524)
  }

  // Returns all vertices from currently visible geometry on the given page.
  // Written generically so it extends automatically when reference/ghost geometry is added.
  const getVisibleVertices = (pageId) =>
    completedShapesRef.current
      .filter(s => s.pageId === pageId)
      .flatMap(s => s.vertices)

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
        ctx.save()
        const isDragged = drag && drag.shapeIdx === idx
        const verts = isDragged && drag.previewVerts ? drag.previewVerts : shape.vertices
        const style = isDragged ? 'drag-preview' : (idx === moveHoverIdx ? 'hover' : 'normal')
        drawShapePoly(ctx, verts, style)
        ctx.restore()
      })
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
        ctx.save()
        if (!eligible.has(idx)) ctx.globalAlpha = 0.2
        const style = sel.includes(idx) ? 'selected' : 'normal'
        drawShapePoly(ctx, shape.vertices, style)
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
        ctx.save()
        drawShapePoly(ctx, shape.vertices, idx === hoverIdx ? 'hover' : 'normal')
        ctx.restore()
      })
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
        ctx.save()
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
      return
    }

    // ── Default edit mode (vertex/segment drag, labels) ───────────────────
    // Ghost reference (floor below) — drawn BELOW locked shapes
    if (showGhost) {
      const ghostPageId = getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current)
      if (ghostPageId) { drawGhostShapes(ctx, completedShapesRef.current, ghostPageId); if (alignMode) drawAlignHandles(ctx, completedShapesRef.current, ghostPageId, zoomRef.current) }
    }

    completedShapesRef.current
      .filter(s => s.pageId === currentPageId)
      .forEach((shape, shapeIdx) => {
        const verts = (previewOverride && previewOverride.shapeIdx === shapeIdx)
          ? previewOverride.vertices : shape.vertices
        const N = verts.length
        if (N < 3) return

        ctx.beginPath()
        ctx.moveTo(verts[0].x, verts[0].y)
        for (let i = 1; i < N; i++) ctx.lineTo(verts[i].x, verts[i].y)
        ctx.closePath()
        ctx.fillStyle = 'rgba(59,130,246,0.1)'; ctx.fill()

        for (let segIdx = 0; segIdx < N; segIdx++) {
          const a = verts[segIdx], b = verts[(segIdx + 1) % N]
          const isSegHover = hoverState?.type === 'segment' &&
            hoverState.shapeIdx === shapeIdx && hoverState.segIdx === segIdx

          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = isSegHover ? '#f59e0b' : '#2563eb'
          ctx.lineWidth = isSegHover ? 3 : 1.5
          ctx.lineJoin = 'round'; ctx.stroke()

          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const lenPx = Math.hypot(b.x - a.x, b.y - a.y)
          const label = pxToDisplayDist(lenPx, { [currentPageId]: getEffectiveScale(currentPageId) }, currentPageId)
          if (label) {
            ctx.font = '12px system-ui, sans-serif'
            const tw = ctx.measureText(label).width, pad = 3
            const lx = mx - tw / 2 - pad, ly = my - 15, lw = tw + pad * 2, lh = 18
            ctx.fillStyle = isSegHover ? 'rgba(254,243,199,0.97)' : 'rgba(255,255,255,0.92)'
            ctx.fillRect(lx, ly, lw, lh)
            ctx.fillStyle = isSegHover ? '#92400e' : '#1d4ed8'
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
          ctx.fillStyle = isMergeTarget ? '#dc2626' : (isVertHover ? '#f59e0b' : '#3b82f6')
          ctx.fill()
          ctx.strokeStyle = 'white'; ctx.lineWidth = isMergeTarget ? 2.5 : (isVertHover ? 2 : 1.5); ctx.stroke()
        })
      })
  }

  useEffect(() => {
    if (editMode && currentPage) drawEditCanvas(editHoverRef.current)
  }, [editMode, currentPage, alignMode, showGhostByPageId, alignTick])

  useEffect(() => {
    if (!drawMode || !currentPage) return
    if (roofShapeDraft) {
      redrawReviewCanvas(roofShapeDraft, currentPageId)
    } else {
      redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, snapDist, currentPageId)
    }
  }, [drawMode, currentPage, alignMode, showGhostByPageId, alignTick, snapAngle, snapDist, roofShapeDraft])


  // ── Edit hit tests ───────────────────────────────────────────────────────

  const hitTestLabels = (pos) => {
    const PAD = 4
    for (const lbl of segLabelRectsRef.current) {
      if (pos.x >= lbl.x - PAD && pos.x <= lbl.x + lbl.w + PAD &&
          pos.y >= lbl.y - PAD && pos.y <= lbl.y + lbl.h + PAD) return lbl
    }
    return null
  }

  const hitTestVertices = (pos) => {
    let best = null, bestDist = HIT_VERT_DIST
    completedShapesRef.current.forEach((shape, shapeIdx) => {
      if (shape.pageId !== currentPageId) return
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
    for (let i = shapes.length - 1; i >= 0; i--) {
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

  // ── Edit: label override ─────────────────────────────────────────────────

  const commitLabelEdit = () => {
    if (!labelEditState) return
    const { shapeIdx, segIdx, value } = labelEditState
    const scale = getEffectiveScale(currentPageId)
    if (!scale) { setLabelEditState(null); return }
    const meters = parseDisplayDistInput(value, scale.displayUnit)
    if (!meters || meters <= 0) { setLabelEditState(null); drawEditCanvas(editHoverRef.current); return }
    const shape = completedShapesRef.current[shapeIdx]
    const verts = shape.vertices, N = verts.length
    const a = verts[segIdx], b = verts[(segIdx + 1) % N]
    const geom = segmentGeom(a, b)
    if (!geom) { setLabelEditState(null); return }
    const newLenPx = metersToPx(meters, { [currentPageId]: scale }, currentPageId)
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2
    const half = newLenPx / 2
    const newA = clampToCanvas({ x: midX - geom.dir.x * half, y: midY - geom.dir.y * half })
    const newB = clampToCanvas({ x: midX + geom.dir.x * half, y: midY + geom.dir.y * half })
    pushUndo()
    const newVerts = verts.map(v => ({ ...v }))
    newVerts[segIdx] = newA; newVerts[(segIdx + 1) % N] = newB
    const newShapes = [...completedShapesRef.current]
    newShapes[shapeIdx] = { ...shape, vertices: newVerts }
    completedShapesRef.current = newShapes
    setLabelEditState(null)
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
      if (idx !== null) {
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
    // Front-face pick mode: suppress all normal mousedown (pan/draw/edit) behavior.
    if (frontFacePromptOpen) return
    // Elevation edge pick mode: suppress normal mousedown.
    if (elevEdgeMode) return
    // Elevation align mode: hit-test edge-bbox handles; else body-translate.
    if (elevAlignMode) {
      if (e.button !== 0) return
      const pageId = getPageId(currentPage)
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
      const pageId = getPageId(currentPage)
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

    // No tool active: left drag pans
    if (!editMode && !drawMode && !calibMode) { startPanDrag(e); return }

    // Draw/calib: mousedown has no tool action, left drag pans
    if (drawMode || calibMode) { startPanDrag(e); return }

    // Edit mode below
    if (labelEditState) return
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
    const labelHit = hitTestLabels(pos)
    if (labelHit) {
      dragStateRef.current = { type: 'labelClick', labelHit, startPos: pos, moved: false }; return
    }
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
    // Elevation align mode: end drag.
    if (elevAlignMode) { alignDragRef.current = null; return }
    // Align mode: end drag.
    if (alignMode) { alignDragRef.current = null; return }
    // Pan cleanup: if pan is active, window listener handles it; just bail
    if (panDragRef.current?.active) return
    // Pending pan (never activated = it's a click): clear ref, fall through to tool handlers
    if (panDragRef.current) panDragRef.current = null

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

    if (ds.type === 'labelClick' && !ds.moved) {
      const lbl = ds.labelHit
      setLabelEditState({
        shapeIdx: lbl.shapeIdx, segIdx: lbl.segIdx, value: lbl.label,
        canvasX: lbl.mx,  // canvas pixel coords — canvas-world layout space
        canvasY: lbl.my,
      })
    } else if (ds.type === 'vertexDrag' && ds.isDragging) {
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
          pushUndo()
          completedShapesRef.current = completedShapesRef.current.filter((_, i) => i !== idx)
          deleteHoverIdxRef.current = null
          setEditCursor('default')
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
      if (verts.length >= 3) {
        const first = verts[0]
        const dx = rawPos.x - first.x, dy = rawPos.y - first.y
        if (Math.sqrt(dx * dx + dy * dy) <= CLOSE_SNAP_RADIUS) {
          const shape = { vertices: verts, pageId: currentPageId }
          if (pages.find(p => p.pageId === currentPageId)?.category === 'roof-plan') {
            setRoofShapeDraft(shape); drawVerticesRef.current = []; setDrawVertexCount(0)
            redrawReviewCanvas(shape, currentPageId); return
          }
          setReviewShape(shape); drawVerticesRef.current = []; setDrawVertexCount(0)
          redrawReviewCanvas(shape, currentPageId); return
        }
      }
      const useAngleNow = snapAngle && !e.shiftKey
      let finalPos
      if (verts.length === 0) {
        finalPos = (!e.shiftKey && drawStartSnapRef.current)
          ? { ...drawStartSnapRef.current }
          : snapToGrid(rawPos, currentPageId)
        drawStartSnapRef.current = null
      } else {
        const { pos } = computeFinalSnapPos(rawPos, verts, useAngleNow, snapDist, currentPageId)
        finalPos = pos
      }
      const next = [...verts, finalPos]
      drawVerticesRef.current = next; setDrawVertexCount(next.length)
      redrawDrawCanvas(rawPos, next, useAngleNow, snapDist, currentPageId)
    }
  }

  const handleMeasureMouseMove = (e) => {
    // Elevation align mode: hover cursor + drag — same transform math as alignMode.
    if (elevAlignMode) {
      if (!alignDragRef.current) {
        const pos = getCanvasPos(e)
        const edgeData = resolveElevEdge(getPageId(currentPage))
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
          const pos = getCanvasPos(e)
          const d1 = Math.hypot(pos.x - drag.ax, pos.y - drag.ay)
          const rawS = drag.startS * (d1 / drag.d0)
          const newS = Math.max(0.05, Math.min(20, rawS))
          const ratio = newS / drag.startS
          const tx1 = drag.ax - (drag.ax - drag.startTx) * ratio
          const ty1 = drag.ay - (drag.ay - drag.startTy) * ratio
          const prev = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prev, tx: tx1, ty: ty1, s: newS, angle: 0 }
        } else {
          const dx = (e.clientX - drag.startClientX) / zoomRef.current
          const dy = (e.clientY - drag.startClientY) / zoomRef.current
          const prev = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prev, tx: drag.startTx + dx, ty: drag.startTy + dy }
        }
        setAlignTick(t => t + 1)
      }
      return
    }
    // Align mode: update pdf-align-layer transform during drag.
    if (alignMode) {
      // Hover hit-test for handle cursor (only when not actively dragging).
      if (!alignDragRef.current) {
        const pos = getCanvasPos(e)
        const pageId = getPageId(currentPage)
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
          const pos = getCanvasPos(e)
          const d1 = Math.hypot(pos.x - drag.ax, pos.y - drag.ay)
          const rawS = drag.startS * (d1 / drag.d0)
          const newS = Math.max(0.05, Math.min(20, rawS))
          const ratio = newS / drag.startS
          const tx1 = drag.ax - (drag.ax - drag.startTx) * ratio
          const ty1 = drag.ay - (drag.ay - drag.startTy) * ratio
          const prevScale = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prevScale, tx: tx1, ty: ty1, s: newS, angle: 0 }
        } else {
          // mode: 'translate'
          const dx = (e.clientX - drag.startClientX) / zoomRef.current
          const dy = (e.clientY - drag.startClientY) / zoomRef.current
          const prev = pageTransformsRef.current[drag.pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
          pageTransformsRef.current[drag.pageId] = { ...prev, tx: drag.startTx + dx, ty: drag.startTy + dy }
        }
        setAlignTick(t => t + 1)
      }
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

    if (calibMode && !showScaleDialog && calibPoints.length === 1) {
      drawCalibState([calibPoints[0], applySnap(pos, calibPoints[0], true, false, currentPageId)])
    } else if (drawMode && !reviewShape && !roofShapeDraft) {
      mousePosRef.current = pos
      // Pre-first-vertex: detect snap target on visible geometry (Shift suppresses)
      if (drawVerticesRef.current.length === 0) {
        if (!e.shiftKey) {
          const visVerts = getVisibleVertices(currentPageId)
          let best = null, bestDist = HIT_VERT_DIST
          for (const v of visVerts) {
            const d = Math.hypot(pos.x - v.x, pos.y - v.y)
            if (d < bestDist) { bestDist = d; best = v }
          }
          drawStartSnapRef.current = best
        } else {
          drawStartSnapRef.current = null
        }
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

    // Start-vertex snap highlight: pre-first-vertex window only
    if (vertices.length === 0 && mousePos && drawStartSnapRef.current) {
      const sv = drawStartSnapRef.current
      ctx.beginPath(); ctx.arc(sv.x, sv.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#dc2626'; ctx.fill()
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke()
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
      const nearClose = vertices.length >= 3 && (() => {
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
  }

  const confirmShape = () => {
    if (!reviewShape) return
    completedShapesRef.current = [
      ...completedShapesRef.current,
      { vertices: reviewShape.vertices, pageId: currentPageId, status: 'locked' },
    ]
    setReviewShape(null); drawVerticesRef.current = []; setDrawVertexCount(0)
    const c = measureRef.current
    if (c) {
      c.getContext('2d').clearRect(0, 0, c.width, c.height)
      drawLockedShapes(c.getContext('2d'), completedShapesRef.current, getPageId(currentPage))
    }
    maybePromptFrontFace()
  }

  const discardShape = () => {
    setReviewShape(null); setRoofShapeDraft(null); setRoofTypeDraft(null); setParapetWidthDraft('')
    setDrawMode(false)
    drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
  }

  const confirmRoofShape = () => {
    if (!roofShapeDraft || !roofTypeDraft) return
    const parapet = roofTypeDraft === 'flat' ? (parseFloat(parapetWidthDraft) || 0) : null
    completedShapesRef.current = [
      ...completedShapesRef.current,
      {
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
      c.getContext('2d').clearRect(0, 0, c.width, c.height)
      drawLockedShapes(c.getContext('2d'), completedShapesRef.current, getPageId(currentPage))
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

    const anchorY = (edgeData.A.y + edgeData.B.y) / 2
    const { pxPerMeter } = elevScale
    const zoom = zoomRef.current
    const canvasW = c.width
    // Anchor: lowest present level's floorZ sits at anchorY (provisional).
    const lowestFloorZ = fhZStack[0].floorZ ?? 0

    ctx.save()
    ctx.font = `${11 / zoom}px sans-serif`
    ctx.textBaseline = 'bottom'
    for (const row of fhZStack) {
      if (row.floorZ != null) {
        const y = anchorY - (row.floorZ - lowestFloorZ) * 0.3048 * pxPerMeter
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y)
        ctx.strokeStyle = '#0d9488'; ctx.lineWidth = 1.5 / zoom
        ctx.globalAlpha = 0.85; ctx.setLineDash([]); ctx.stroke()
        ctx.fillStyle = '#0d9488'; ctx.globalAlpha = 1
        ctx.fillText(row.level, 6 / zoom, y - 2 / zoom)
      }
      if (row.ceilingZ != null) {
        const y = anchorY - (row.ceilingZ - lowestFloorZ) * 0.3048 * pxPerMeter
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
        if (calibMode) exitCalibMode()
        else if (reviewShape || roofShapeDraft) discardShape()
        else if (roofLineMode) {
          if (roofChainStartId) { setRoofChainStartId(null); drawRoofGraphCanvas(null, null) }
          else setRoofLineMode(false)
        }
        else if (roofRoleMode) { setRoofRoleMode(false); setRoofRoleHover(null); setRoofRoleSelected(null) }
        else if (drawMode) exitDrawMode()
        else if (editMode) {
          if (labelEditState) { setLabelEditState(null); drawEditCanvas(editHoverRef.current) }
          else if (editSubModeRef.current === 'move' && moveDragRef.current) {
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
  }, [calibMode, drawMode, reviewShape, roofShapeDraft, roofRoleMode, roofLineMode, roofChainStartId, snapAngle, snapDist, currentPage, editMode, labelEditState])

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
  // derived from recatPageNum + the page's category at render time — not from a
  // separate flag — so an already-categorized page always shows its summary
  // immediately on navigation, mid-categorization.
  useEffect(() => {
    if (!categorizeMode || !currentPage) return
    loadDraftFromEntry(pages.find(p => p.pageNum === currentPage))
  }, [categorizeMode, currentPage, pages])

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
  const advanceToNextUncategorized = (pagesList) => {
    const total = pageCount
    for (let step = 1; step <= total; step++) {
      const pn = ((currentPage - 1 + step) % total) + 1
      const entry = pagesList.find(p => p.pageNum === pn)
      if ((!entry || !entry.category) && pn !== currentPage) { goToPage(pn); return }
    }
  }

  const confirmCatPage = () => {
    if (!catDraftCategory || catConfirmDisabled) return
    const subLabel = resolveSubLabel()
    // subLabelNote is a floor-plan-only extra descriptor; never carries level meaning.
    const subLabelNote = catDraftCategory === 'floor-plan' ? (catDraftNote.trim() || null) : null
    const newPages = pages.map(p =>
      p.pageNum === currentPage ? { ...p, category: catDraftCategory, subLabel, subLabelNote } : p
    )
    setPages(newPages)
    setRecatPageNum(null)
    // If the front-face prompt opens, stay on the anchor page so the user can
    // pick the edge; otherwise advance to the next uncategorized page as usual.
    if (!maybePromptFrontFace(newPages)) advanceToNextUncategorized(newPages)
  }

  const skipCatPage = () => {
    const newPages = pages.map(p =>
      p.pageNum === currentPage ? { ...p, category: null, subLabel: null, subLabelNote: null } : p
    )
    setPages(newPages)
    setRecatPageNum(null)
    advanceToNextUncategorized(newPages)
  }

  const startRecategorize = () => {
    loadDraftFromEntry(pages.find(p => p.pageNum === currentPage))
    setRecatPageNum(currentPage)
  }

  // Re-enter categorization to work through what remains: cycle uncategorized
  // pages only, jumping straight to the first one.
  const enterCategorizeReentry = () => {
    setCatReentry(true)
    setCategorizeMode(true)
    const first = pages.find(p => !p.category)
    if (first && first.pageNum !== currentPage) goToPage(first.pageNum)
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

  const currentPageId = getPageId(currentPage)
  const showGhost = showGhostByPageId[currentPageId] ?? true
  const currentPageEntry = pages.find(p => p.pageNum === currentPage) || null
  const categorizedCount = pages.filter(p => p.category).length


  // ── Sidebar sections ───────────────────────────────────────────────────────
  // category is stored as a key ('floor-plan', 'elevation', …), not a label.
  const sidebarSections = (() => {
    const byCat = (key) => pages.filter(p => p.category === key)
    const orderBy = (entries, order, getKey) =>
      [...entries].sort((a, b) => {
        const ia = order.indexOf(getKey(a)), ib = order.indexOf(getKey(b))
        const ra = ia === -1 ? order.length : ia, rb = ib === -1 ? order.length : ib
        return ra - rb || a.pageNum - b.pageNum
      })

    const floor = orderBy(byCat('floor-plan'),
      FLOOR_ORDER,
      p => p.subLabel
    ).map(p => ({ pageNum: p.pageNum, label: p.subLabel || 'Floor Plan' }))

    const elevation = orderBy(byCat('elevation'),
      ['North', 'South', 'East', 'West'],
      p => p.subLabel
    ).map(p => ({ pageNum: p.pageNum, label: p.subLabel ? `${p.subLabel} Elevation` : 'Elevation' }))

    const simple = (key, fallback) =>
      byCat(key).map(p => ({ pageNum: p.pageNum, label: p.subLabel || fallback }))

    const unused = pages.filter(p => !p.category)
      .map(p => ({ pageNum: p.pageNum, label: `Page ${p.pageNum}` }))

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
  const inchesToFhUnit = (inches) => fhDisplayUnit === 'ft' ? inches / 12 : inches * 0.0254
  const SHEATHING_INCHES = 1.375
  const setFloorHeight = (level, field, value) => {
    const cur = floorHeightsRef.current[level] || { floorToCeiling: null, floorSystemAbove: null }
    floorHeightsRef.current[level] = { ...cur, [field]: value }
    setFloorHeightsTick(t => t + 1)
  }
  const setFloorHeightFields = (level, fieldsObj) => {
    const cur = floorHeightsRef.current[level] || { floorToCeiling: null, floorSystemAbove: null }
    floorHeightsRef.current[level] = { ...cur, ...fieldsObj }
    setFloorHeightsTick(t => t + 1)
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

  // Page-arrow navigation. While categorizing, arrows cycle every page. After
  // Done (not categorizing), arrows step through categorized pages only,
  // skipping uncategorized ones. Falls back to sequential nav if nothing is
  // categorized yet so the user is never stranded.
  const categorizedPageNums = pages.filter(p => p.category).map(p => p.pageNum).sort((a, b) => a - b)
  const uncategorizedPageNums = pages.filter(p => !p.category).map(p => p.pageNum).sort((a, b) => a - b)
  // Which subset the arrows cycle through. Re-entry mode → uncategorized only;
  // post-Done (not categorizing, some categorized) → categorized only;
  // otherwise (initial/auto categorization) → null = sequential, all pages.
  const navSet =
    categorizeMode && catReentry ? uncategorizedPageNums
    : !categorizeMode && categorizedPageNums.length > 0 ? categorizedPageNums
    : null
  const prevNavDisabled = renderingPage || (navSet
    ? !navSet.some(pn => pn < currentPage)
    : currentPage <= 1)
  const nextNavDisabled = renderingPage || (navSet
    ? !navSet.some(pn => pn > currentPage)
    : currentPage >= pageCount)
  const handlePageNav = (dir) => {
    if (!navSet) { goToPage(currentPage + dir); return }
    const target = dir > 0
      ? navSet.find(pn => pn > currentPage)
      : [...navSet].reverse().find(pn => pn < currentPage)
    if (target != null) goToPage(target)
  }
  const pageHasScale = currentPageId && !!getEffectiveScale(currentPageId)
  const ghostSrc = currentPageId ? getGhostSourcePageId(pages, currentPageId, completedShapesRef.current, FLOOR_ORDER, pageRefParentRef.current) : null
  const isConfirmed = !!(pageTransformsRef.current[currentPageId]?.confirmed)
  const alignStarted = (() => { const t = pageTransformsRef.current[currentPageId]; return !!(t && (t.tx || t.ty || t.s !== 1)) })()
  const refLayerLabel = kindToLabel(REFERENCE_KIND_DEFAULT)
  const drawDisabledHint = (() => {
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

  // Snap increment selector for Edit Shapes mode — reads/writes the same ref+state as Draw mode.
  // Changing it in edit mode takes effect on the next vertex drag/insert/move snap.
  const editSnapIncrementSelect = snapDist && pageHasScale ? (() => {
    const isImperial = getEffectiveScale(currentPageId)?.displayUnit === 'ft'
    return (
      <select className="snap-increment-select" value={snapIncrement}
        onChange={e => { const v = parseFloat(e.target.value); snapIncrementRef.current = v; setSnapIncrement(v) }}
      >
        {isImperial
          ? <><option value={0.0254}>1″</option><option value={0.0762}>3″</option>
              <option value={0.1524}>6″</option><option value={0.3048}>12″</option></>
          : <><option value={0.025}>2.5 cm</option><option value={0.075}>7.5 cm</option>
              <option value={0.15}>15 cm</option><option value={0.30}>30 cm</option></>}
      </select>
    )
  })() : null

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

        {pdf && !calibMode && !drawMode && !editMode && !categorizeMode && (
          <button
            className={`compass-north-btn ${compassAngleDeg !== null ? 'compass-north-btn--done' : ''}`}
            onClick={openCompassOverlay}
          >
            {compassAngleDeg !== null
              ? `North set ✓  (${compassCardinal}${compassAngleDeg !== 0 ? ` ${compassAngleDeg.toFixed(1)}°` : ''})`
              : 'Set North'}
          </button>
        )}

{pdf && currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && (
          <button className="categorize-btn" onClick={() => { setCatReentry(false); setCategorizeMode(true) }}>
            Categorize Pages
          </button>
        )}

        {pdf && !calibMode && !drawMode && !editMode && !categorizeMode && (
          <button
            className={`floor-heights-btn ${showFloorHeights ? 'floor-heights-btn--open' : ''}`}
            onClick={() => setShowFloorHeights(h => !h)}
          >
            {showFloorHeights ? 'Floor Heights ✕' : 'Floor Heights'}
          </button>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !categorizeMode &&
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

        {currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && (
          <>
            <button
              className="draw-btn"
              disabled={!pageHasScale}
              onClick={() => {
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

        {currentPage && !calibMode && !drawMode && !editMode && !categorizeMode && (() => {
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
                  const pageId = getPageId(currentPage)
                  const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
                  pageTransformsRef.current[pageId] = { ...cur, confirmed: true }
                  if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc
                  setAlignMode(false)
                  setAlignTick(t => t + 1)
                }}>Confirm scale & alignment</button>
              )}
            </>
          )
        })()}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !categorizeMode && lockedShapesOnPage.length > 0 && (
          <button className="edit-btn" onClick={() => { clearMeasureCanvas(); setEditMode(true) }}>
            Edit Shapes
          </button>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && hasSlopedOnPage && (
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

        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !elevEdgeMode && !elevAlignMode && isElevationPage && (
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
        {currentPage && !calibMode && !drawMode && !editMode && !roofRoleMode && !roofLineMode && !categorizeMode && !elevEdgeMode && !elevAlignMode && isElevationPage && (() => {
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
                {snapDist && pageHasScale && (() => {
                  const isImperial = getEffectiveScale(currentPageId)?.displayUnit === 'ft'
                  return (
                    <select className="snap-increment-select" value={snapIncrement}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        snapIncrementRef.current = v; setSnapIncrement(v)
                        redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, true, currentPageId)
                      }}
                    >
                      {isImperial
                        ? <><option value={0.0254}>1″</option><option value={0.0762}>3″</option>
                            <option value={0.1524}>6″</option><option value={0.3048}>12″</option></>
                        : <><option value={0.025}>2.5 cm</option><option value={0.075}>7.5 cm</option>
                            <option value={0.15}>15 cm</option><option value={0.30}>30 cm</option></>}
                    </select>
                  )
                })()}
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
                          const pageId = getPageId(currentPage)
                          const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
                          pageTransformsRef.current[pageId] = { ...cur, confirmed: true }
                          if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc
                          setAlignMode(false)
                          setAlignTick(t => t + 1)
                        }}>Confirm scale & alignment</button>
                      )}
                    </>
                  ) : null
                })()}
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
                <span className="review-status">Shape closed — confirm or discard</span>
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
                          const pageId = getPageId(currentPage)
                          const cur = pageTransformsRef.current[pageId] || { tx: 0, ty: 0, s: 1, angle: 0 }
                          pageTransformsRef.current[pageId] = { ...cur, confirmed: true }
                          if (ghostSrc) pageRefParentRef.current[pageId] = ghostSrc
                          setAlignMode(false)
                          setAlignTick(t => t + 1)
                        }}>Confirm scale & alignment</button>
                      )}
                    </>
                  ) : null
                })()}
                <span className="edit-status">Drag corner · side · click label to edit · hold segment to insert vertex</span>
                {editSnapIncrementSelect}
                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitEditMode}>Done</button>
              </>
            )}

            {editSubMode === 'move' && (
              <>
                <span className="submode-status submode-status--move">Move Shape</span>
                <span className="edit-status">Click and drag a shape · Esc to cancel</span>
                {editSnapIncrementSelect}
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
                {editSnapIncrementSelect}
                {editUndoCount > 0 && <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>}
                {editRedoCount > 0 && <button className="calib-cancel" onClick={handleEditRedo}>Redo</button>}
                <button className="calib-cancel" onClick={exitSubMode}>Back</button>
              </>
            )}

            {editSubMode === 'delete' && (
              <>
                <span className="submode-status submode-status--delete">Delete Shape</span>
                <span className="edit-status">Click a shape to delete it permanently</span>
                {editSnapIncrementSelect}
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
                {editSnapIncrementSelect}
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
            <span className="cat-panel-progress">{categorizedCount} of {pageCount} labelled</span>
            <span className="cat-panel-hint">Page navigation stays active — jump to any page.</span>
            <button className="btn-primary btn-sm" onClick={() => { setCategorizeMode(false); setCatReentry(false) }}>Done</button>
          </div>

          <div className="cat-panel-body">
            {catReentry && uncategorizedPageNums.length === 0 ? (
              <span className="cat-all-done">All pages are categorized. Click Done to finish.</span>
            ) : (
            <>
            <span className="cat-page-label">Page {currentPage}</span>

            {currentPageEntry?.category && recatPageNum !== currentPage ? (
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
                      key={entry.pageNum}
                      className={`sidebar-entry ${entry.pageNum === currentPage ? 'sidebar-entry--active' : ''}`}
                      onClick={() => goToPage(entry.pageNum)}
                      title={entry.label}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>

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

      <div className={`canvas-wrapper ${currentPage ? 'visible' : ''}`}>
        <div
          className="canvas-stack"
          ref={canvasWrapperRef}
          style={{ cursor: isPanning ? 'grabbing' : (!drawMode && !calibMode && !editMode && !roofLineMode && currentPage ? 'grab' : undefined) }}
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
                // alignTick read here forces React to re-evaluate after each drag write
                transform: alignTick >= 0 ? getCSSTransform(pageTransformsRef.current[getPageId(currentPage)]) : 'none',
                transformOrigin: '0 0',
              }}
            >
              <canvas ref={canvasRef} />
            </div>
            <canvas
              ref={measureRef}
              className="measure-canvas"
              style={{ cursor: (alignMode || elevAlignMode) ? (alignDragRef.current ? 'grabbing' : alignOverHandle ? 'nwse-resize' : 'grab') : isPanning ? 'grabbing' : editMode ? editCursor : (drawMode || calibMode || roofLineMode) ? 'crosshair' : undefined }}
              onMouseDown={handleMeasureMouseDown}
              onMouseUp={handleMeasureMouseUp}
              onClick={handleMeasureClick}
              onMouseMove={handleMeasureMouseMove}
            />
            {editMode && labelEditState && (
              <div
                className="label-edit-overlay"
                style={{
                  left: labelEditState.canvasX,
                  top: labelEditState.canvasY,
                  transform: `translate(-50%, -100%) scale(${1 / viewTransform.zoom})`,
                  transformOrigin: '50% 100%',
                  marginTop: '-4px',
                }}
              >
                <input
                  type="text" className="label-edit-input"
                  value={labelEditState.value} autoFocus
                  onChange={e => setLabelEditState(prev => ({ ...prev, value: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitLabelEdit() }
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setLabelEditState(null); drawEditCanvas(editHoverRef.current)
                    }
                  }}
                  onBlur={() => { setLabelEditState(null); drawEditCanvas(editHoverRef.current) }}
                />
              </div>
            )}
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
    </div>
  )
}

export default App
