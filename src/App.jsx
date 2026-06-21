import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// ── Module-level geometry helpers ──────────────────────────────────────────

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 0.001) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function segmentGeom(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return null
  return { dir: { x: dx / len, y: dy / len }, perp: { x: -dy / len, y: dx / len }, len }
}

function projT(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 0.001) return 0
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
}

function applyAxisSnap(pos, origin) {
  const dx = pos.x - origin.x, dy = pos.y - origin.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.001) return pos
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return { x: origin.x + dist * Math.cos(snapped), y: origin.y + dist * Math.sin(snapped) }
}

function parseDisplayDistInput(str, displayUnit) {
  const s = str.trim()
  if (displayUnit === 'ft') {
    const m1 = s.match(/^(\d+(?:\.\d+)?)'\s*([\d.]+)"?$/)
    if (m1) return (parseFloat(m1[1]) * 12 + parseFloat(m1[2])) * 0.0254
    const m2 = s.match(/^(\d+(?:\.\d+)?)'$/)
    if (m2) return parseFloat(m2[1]) * 12 * 0.0254
    const m3 = s.match(/^(\d+(?:\.\d+)?)"$/)
    if (m3) return parseFloat(m3[1]) * 0.0254
    const m4 = s.match(/^(\d+(?:\.\d+)?)$/)
    if (m4) return parseFloat(m4[1]) * 0.0254
    return null
  }
  const m = s.match(/^([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

function pointInPolygon(pt, verts) {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y, xj = verts[j].x, yj = verts[j].y
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

const COLLINEAR_TOL = 0.5  // max perpendicular distance to be considered on the same line (px)
const OVERLAP_MIN   = 1.0  // minimum overlap length to be considered a shared edge (px)
const ENDPOINT_TOL  = 0.5  // coincidence tolerance for existing edge endpoints (px)

// Returns overlap info if vertsA and vertsB share a collinear anti-parallel edge segment,
// or null if no combinable overlap exists.
function findCollinearOverlap(vertsA, vertsB) {
  const NA = vertsA.length, NB = vertsB.length
  for (let i = 0; i < NA; i++) {
    const a1 = vertsA[i], a2 = vertsA[(i + 1) % NA]
    const dax = a2.x - a1.x, day = a2.y - a1.y
    const lenA = Math.hypot(dax, day)
    if (lenA < 0.001) continue
    const dirX = dax / lenA, dirY = day / lenA
    const perpX = -dirY, perpY = dirX

    for (let j = 0; j < NB; j++) {
      const b1 = vertsB[j], b2 = vertsB[(j + 1) % NB]

      // Both B endpoints must lie on the infinite line through a1→a2
      if (Math.abs((b1.x - a1.x) * perpX + (b1.y - a1.y) * perpY) > COLLINEAR_TOL) continue
      if (Math.abs((b2.x - a1.x) * perpX + (b2.y - a1.y) * perpY) > COLLINEAR_TOL) continue

      // B must traverse this line in the opposite direction (anti-parallel)
      const lenB = Math.hypot(b2.x - b1.x, b2.y - b1.y)
      if (lenB < 0.001) continue
      if ((b2.x - b1.x) * dirX + (b2.y - b1.y) * dirY >= 0) continue

      // Project b1 and b2 onto A's line; anti-parallel guarantees t_b1 > t_b2
      const t_b1 = (b1.x - a1.x) * dirX + (b1.y - a1.y) * dirY
      const t_b2 = (b2.x - a1.x) * dirX + (b2.y - a1.y) * dirY

      // Overlap of A's range [0, lenA] with B's range [t_b2, t_b1]
      const t_ov_start = Math.max(0, t_b2)
      const t_ov_end   = Math.min(lenA, t_b1)
      if (t_ov_end - t_ov_start < OVERLAP_MIN) continue

      return {
        segA: i, segB: j, dirX, dirY, a1, a2, lenA, b1, b2, lenB,
        t_b1, t_b2, t_ov_start, t_ov_end,
        P_start: { x: a1.x + t_ov_start * dirX, y: a1.y + t_ov_start * dirY },
        P_end:   { x: a1.x + t_ov_end   * dirX, y: a1.y + t_ov_end   * dirY },
      }
    }
  }
  return null
}

// Insert P_first (if not already coincident with edge start) and P_second
// (if not coincident with edge end) into verts at segIdx.
// Returns {newVerts, newSegIdx} where newSegIdx is the index of P_first.
function prepareForMerge(verts, segIdx, P_first, P_second) {
  const N = verts.length
  const edgeStart = verts[segIdx], edgeEnd = verts[(segIdx + 1) % N]
  const insertP1 = Math.hypot(P_first.x  - edgeStart.x, P_first.y  - edgeStart.y) >= ENDPOINT_TOL
  const insertP2 = Math.hypot(P_second.x - edgeEnd.x,   P_second.y - edgeEnd.y)   >= ENDPOINT_TOL
  const result = [...verts]
  let offset = 0
  if (insertP1) { result.splice(segIdx + 1, 0, { ...P_first });  offset++ }
  if (insertP2) { result.splice(segIdx + 1 + offset, 0, { ...P_second }) }
  return { newVerts: result, newSegIdx: segIdx + (insertP1 ? 1 : 0) }
}

function mergePolygons(vertsA, vertsB, segA, segB, dir) {
  const NA = vertsA.length
  let bVerts = vertsB, effSegB = segB
  if (dir === 'same') {
    bVerts = [...vertsB].reverse()
    effSegB = vertsB.length - 1 - ((segB + 1) % vertsB.length)
  }
  const NB = bVerts.length
  const result = []
  for (let i = 0; i < NA; i++) result.push({ ...vertsA[(segA + 1 + i) % NA] })
  for (let i = 0; i < NB - 2; i++) result.push({ ...bVerts[(effSegB + 2 + i) % NB] })
  return result
}

function linePolyIntersect(p1, p2, verts) {
  // Robust version that correctly handles cut lines that are collinear with, pass
  // through, or graze existing polygon edges/vertices.
  const N = verts.length
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const lineLen2 = dx * dx + dy * dy
  if (lineLen2 < 0.001) return []

  const lineMag = Math.sqrt(lineLen2)
  const perpX = -dy / lineMag, perpY = dx / lineMag
  const ON_TOL = 0.5 // px: vertex counts as "on the cut line" within this distance

  // Signed perpendicular distance of each vertex from the infinite cut line
  const perp = verts.map(v => (v.x - p1.x) * perpX + (v.y - p1.y) * perpY)

  const results = []

  // Pass 1 — standard interior edge crossings: both endpoints off the line, opposite sides
  for (let i = 0; i < N; i++) {
    const pA = perp[i], pB = perp[(i + 1) % N]
    if (Math.abs(pA) <= ON_TOL || Math.abs(pB) <= ON_TOL) continue // vertex case, handled below
    if (pA * pB > 0) continue // same side
    const a = verts[i], b = verts[(i + 1) % N]
    const d2x = b.x - a.x, d2y = b.y - a.y
    const cross = dx * d2y - dy * d2x
    if (Math.abs(cross) < 0.001) continue
    const ex = a.x - p1.x, ey = a.y - p1.y
    const u = (ex * dy - ey * dx) / cross
    if (u <= 0 || u >= 1) continue
    const px = a.x + u * d2x, py = a.y + u * d2y
    results.push({
      edgeIdx: i, edgeT: u,
      lineT: ((px - p1.x) * dx + (py - p1.y) * dy) / lineLen2,
      point: { x: px, y: py }
    })
  }

  // Pass 2 — vertex crossings: a polygon vertex lies on (or very near) the cut line.
  // The polygon genuinely crosses the line at a vertex when the nearest non-collinear
  // vertices on either side of it are on opposite sides of the cut line.
  // For collinear runs (consecutive on-line vertices), only the FIRST vertex of each
  // run is emitted (the one entered from an off-line edge), avoiding duplicate points.
  for (let i = 0; i < N; i++) {
    if (Math.abs(perp[i]) > ON_TOL) continue
    // Skip if the previous vertex is also on the line (we're in the interior of a run)
    if (Math.abs(perp[(i - 1 + N) % N]) <= ON_TOL) continue
    // Walk forward/backward to find the nearest off-line vertices
    let prevP = null, nextP = null
    for (let k = 1; k < N; k++) {
      if (prevP === null && Math.abs(perp[(i - k + N) % N]) > ON_TOL) prevP = perp[(i - k + N) % N]
      if (nextP === null && Math.abs(perp[(i + k) % N]) > ON_TOL) nextP = perp[(i + k) % N]
      if (prevP !== null && nextP !== null) break
    }
    if (prevP === null || nextP === null) continue // all vertices on line (degenerate)
    if (prevP * nextP >= 0) continue // same side — tangent graze, not a crossing
    results.push({
      edgeIdx: i, edgeT: 0,
      lineT: ((verts[i].x - p1.x) * dx + (verts[i].y - p1.y) * dy) / lineLen2,
      point: { ...verts[i] }
    })
  }

  return results.sort((a, b) => a.lineT - b.lineT)
}

function splitPolygon(verts, cutP1, cutP2) {
  const hits = linePolyIntersect(cutP1, cutP2, verts)
  if (hits.length < 2) return null
  const h0 = hits[0], h1 = hits[hits.length - 1]
  const i0 = h0.edgeIdx, i1 = h1.edgeIdx
  const p0 = h0.point, p1 = h1.point
  const N = verts.length

  const polyA = [{ ...p0 }]
  let cur = (i0 + 1) % N, stop1 = (i1 + 1) % N, guard = N + 2
  while (cur !== stop1 && guard-- > 0) { polyA.push({ ...verts[cur] }); cur = (cur + 1) % N }
  polyA.push({ ...p1 })

  const polyB = [{ ...p1 }]
  cur = (i1 + 1) % N; let stop2 = (i0 + 1) % N; guard = N + 2
  while (cur !== stop2 && guard-- > 0) { polyB.push({ ...verts[cur] }); cur = (cur + 1) % N }
  polyB.push({ ...p0 })

  if (polyA.length < 3 || polyB.length < 3) return null
  return [polyA, polyB]
}

function getEligibleShapes(shapes, pageNum) {
  const pageIdxs = shapes.map((s, i) => ({ s, i })).filter(({ s }) => s.pageNumber === pageNum).map(({ i }) => i)
  const eligible = new Set()
  for (let a = 0; a < pageIdxs.length; a++) {
    for (let b = a + 1; b < pageIdxs.length; b++) {
      if (findCollinearOverlap(shapes[pageIdxs[a]].vertices, shapes[pageIdxs[b]].vertices)) {
        eligible.add(pageIdxs[a]); eligible.add(pageIdxs[b])
      }
    }
  }
  return eligible
}

const CLOSE_SNAP_RADIUS = 16
const ALIGN_TOLERANCE = 10
const HIT_SEG_DIST = 8
const HIT_VERT_DIST = 9

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

  const canvasRef = useRef(null)
  const measureRef = useRef(null)
  const pageScalesRef = useRef({})
  const drawVerticesRef = useRef([])
  const mousePosRef = useRef(null)
  const completedShapesRef = useRef([])
  const snapIncrementRef = useRef(0.1524)
  const pageGridOriginRef = useRef({})

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
    resetEditState()
    completedShapesRef.current = []; pageScalesRef.current = {}; pageGridOriginRef.current = {}
    drawVerticesRef.current = []; mousePosRef.current = null
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
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
    resetEditState()
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
    return { x: Math.max(0, Math.min(c.width, v.x)), y: Math.max(0, Math.min(c.height, v.y)) }
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

  const snapToGrid = (pos, pageNum) => {
    if (!snapDist) return pos
    const scale = pageScalesRef.current[pageNum]
    if (!scale) return pos
    const snapPx = scale.pxPerMeter * snapIncrementRef.current
    if (snapPx <= 0) return pos
    const origin = pageGridOriginRef.current[pageNum] || { x: 0, y: 0 }
    return {
      x: origin.x + Math.round((pos.x - origin.x) / snapPx) * snapPx,
      y: origin.y + Math.round((pos.y - origin.y) / snapPx) * snapPx,
    }
  }

  // ── Draw locked shapes (base layer) ─────────────────────────────────────

  const drawLockedShapes = (ctx, pageNum) => {
    completedShapesRef.current
      .filter(s => s.pageNumber === pageNum)
      .forEach(shape => {
        const verts = shape.vertices
        if (verts.length < 3) return
        ctx.beginPath()
        ctx.moveTo(verts[0].x, verts[0].y)
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
        ctx.closePath()
        ctx.fillStyle = 'rgba(59,130,246,0.1)'
        ctx.fill()
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
        ctx.stroke()
      })
  }

  useEffect(() => {
    if (calibMode || drawMode || editMode) return
    const c = measureRef.current
    if (!c || !currentPage) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, currentPage)
  }, [calibMode, drawMode, editMode, currentPage])

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
    pageScalesRef.current[currentPage] = {
      pxPerMeter: pixelDist / realWorldMeters,
      displayUnit: scaleUnit === 'imperial' ? 'ft' : 'm',
    }
    delete pageGridOriginRef.current[currentPage]
    setShowScaleDialog(false); setCalibMode(false); setCalibPoints([]); setScaleError('')
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  const exitDrawMode = () => {
    setDrawMode(false); setReviewShape(null)
    drawVerticesRef.current = []; setDrawVertexCount(0)
    mousePosRef.current = null
    snapIncrementRef.current = 0.1524; setSnapIncrement(0.1524)
  }

  const pxToDisplayDist = (px, pageNum) => {
    const scale = pageScalesRef.current[pageNum]
    if (!scale || px <= 0) return null
    const meters = px / scale.pxPerMeter
    if (scale.displayUnit === 'ft') {
      const totalInches = meters / 0.0254
      const feet = Math.floor(totalInches / 12)
      const inches = totalInches % 12
      return `${feet}' ${inches.toFixed(1)}"`
    }
    return `${meters.toFixed(3)} m`
  }

  const applySnap = (rawPos, lastVertex, useAngle, useDist, pageNum) => {
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
      const scale = pageScalesRef.current[pageNum]
      if (scale) {
        const snapPx = scale.pxPerMeter * snapIncrementRef.current
        if (snapPx > 0) {
          const origin = pageGridOriginRef.current[pageNum] || { x: 0, y: 0 }
          x = origin.x + Math.round((x - origin.x) / snapPx) * snapPx
          y = origin.y + Math.round((y - origin.y) / snapPx) * snapPx
        }
      }
    }
    return { x, y }
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
    return { snappedPos: { x, y }, guides }
  }

  const computeFinalSnapPos = (rawPos, vertices, useAngle, useDist, pageNum) => {
    const last = vertices.length > 0 ? vertices[vertices.length - 1] : null
    const { snappedPos: alignSnapped, guides } = getAlignmentSnap(rawPos, vertices)
    if (guides.length > 0) return { pos: applySnap(alignSnapped, last, false, useDist, pageNum), guides }
    return { pos: applySnap(rawPos, last, useAngle, useDist, pageNum), guides }
  }

  const drawAlignGuide = (ctx, guide, cw, ch) => {
    ctx.save()
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1; ctx.globalAlpha = 0.75; ctx.setLineDash([5, 5])
    ctx.beginPath()
    if (guide.axis === 'h') { ctx.moveTo(0, guide.vertex.y); ctx.lineTo(cw, guide.vertex.y) }
    else { ctx.moveTo(guide.vertex.x, 0); ctx.lineTo(guide.vertex.x, ch) }
    ctx.stroke(); ctx.restore()
  }

  // ── Edit canvas drawing ──────────────────────────────────────────────────

  const drawShapePoly = (ctx, verts, style) => {
    const N = verts.length
    if (N < 3) return
    ctx.beginPath()
    ctx.moveTo(verts[0].x, verts[0].y)
    for (let i = 1; i < N; i++) ctx.lineTo(verts[i].x, verts[i].y)
    ctx.closePath()
    if (style === 'hover') {
      ctx.fillStyle = 'rgba(245,158,11,0.18)'; ctx.fill()
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5
    } else if (style === 'selected') {
      ctx.fillStyle = 'rgba(22,163,74,0.18)'; ctx.fill()
      ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2.5
    } else if (style === 'drag-preview') {
      ctx.fillStyle = 'rgba(245,158,11,0.12)'; ctx.fill()
      ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
    } else {
      ctx.fillStyle = 'rgba(59,130,246,0.1)'; ctx.fill()
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5
    }
    ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([])
  }

  const drawEditCanvas = (hoverState = null, previewOverride = null) => {
    const c = measureRef.current
    if (!c || !currentPage) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    segLabelRectsRef.current = []

    const subMode = editSubModeRef.current

    // ── Move sub-mode ─────────────────────────────────────────────────────
    if (subMode === 'move') {
      const moveHoverIdx = moveHoverIdxRef.current
      const drag = moveDragRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageNumber !== currentPage) return
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
      const eligible = combineEligibleRef.current
      const sel = combineSelectRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageNumber !== currentPage) return
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
      const hoverIdx = deleteHoverIdxRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageNumber !== currentPage) return
        ctx.save()
        drawShapePoly(ctx, shape.vertices, idx === hoverIdx ? 'hover' : 'normal')
        ctx.restore()
      })
      return
    }

    // ── Split sub-mode ────────────────────────────────────────────────────
    if (subMode === 'split') {
      const selIdx = splitSelectedRef.current
      const hoverIdx = splitHoverIdxRef.current
      completedShapesRef.current.forEach((shape, idx) => {
        if (shape.pageNumber !== currentPage) return
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
    completedShapesRef.current
      .filter(s => s.pageNumber === currentPage)
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
          const label = pxToDisplayDist(lenPx, currentPage)
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
  }, [editMode, currentPage])

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
      if (shape.pageNumber !== currentPage) return
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
      if (shape.pageNumber !== currentPage) return
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
      if (shapes[i].pageNumber === currentPage && pointInPolygon(pos, shapes[i].vertices)) return i
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
      combineEligibleRef.current = getEligibleShapes(completedShapesRef.current, currentPage)
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
      combineEligibleRef.current = getEligibleShapes(completedShapesRef.current, currentPage)
      combineSelectRef.current = []; setCombineSelection([])
    }
    drawEditCanvas(editHoverRef.current)
  }

  // ── Edit: label override ─────────────────────────────────────────────────

  const commitLabelEdit = () => {
    if (!labelEditState) return
    const { shapeIdx, segIdx, value } = labelEditState
    const scale = pageScalesRef.current[currentPage]
    if (!scale) { setLabelEditState(null); return }
    const meters = parseDisplayDistInput(value, scale.displayUnit)
    if (!meters || meters <= 0) { setLabelEditState(null); drawEditCanvas(editHoverRef.current); return }
    const shape = completedShapesRef.current[shapeIdx]
    const verts = shape.vertices, N = verts.length
    const a = verts[segIdx], b = verts[(segIdx + 1) % N]
    const geom = segmentGeom(a, b)
    if (!geom) { setLabelEditState(null); return }
    const newLenPx = meters * scale.pxPerMeter
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
    const eligible = getEligibleShapes(completedShapesRef.current, currentPage)
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
      if (s.pageNumber !== currentPage) continue
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
    // Insert overlap boundary vertices into each shape as needed, then splice the shared portion out
    const { newVerts: vertsA, newSegIdx: segA } = prepareForMerge(
      shapes[idxA].vertices, ov.segA, ov.P_start, ov.P_end
    )
    const { newVerts: vertsB, newSegIdx: segB } = prepareForMerge(
      shapes[idxB].vertices, ov.segB, ov.P_end, ov.P_start
    )
    pushUndo()
    const merged = mergePolygons(vertsA, vertsB, segA, segB, 'reversed')
    const newShapes = shapes
      .map((s, i) => i === idxA ? { ...s, vertices: merged } : s)
      .filter((_, i) => i !== idxB)
    completedShapesRef.current = newShapes
    combineEligibleRef.current = getEligibleShapes(completedShapesRef.current, currentPage)
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
      let snapped = snapToGrid(pos, currentPage)
      // Axis snap second cut point relative to first (unless Shift held)
      if (cut.length === 1 && !shiftKey) {
        snapped = snapToGrid(applyAxisSnap(pos, cut[0]), currentPage)
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
    newVerts[iA] = { x: vertices[iA].x + tPx * perpDir.x, y: vertices[iA].y + tPx * perpDir.y }
    newVerts[iB] = { x: vertices[iB].x + tPx * perpDir.x, y: vertices[iB].y + tPx * perpDir.y }
    return newVerts
  }

  const snapPerp = (tRaw) => {
    if (!snapDist) return tRaw
    const scale = pageScalesRef.current[currentPage]
    if (!scale) return tRaw
    const snapPx = scale.pxPerMeter * snapIncrementRef.current
    return snapPx > 0 ? Math.round(tRaw / snapPx) * snapPx : tRaw
  }

  // ── Canvas mouse handlers ─────────────────────────────────────────────────

  const handleMeasureMouseDown = (e) => {
    if (!editMode || labelEditState) return
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
      // Hold timer: if mouse stays still for 350ms, arm vertex insertion instead of segment drag
      const capturedPos = { ...pos }
      const holdTimer = setTimeout(() => { // 550ms hold to arm vertex insertion
        if (!dragStateRef.current || dragStateRef.current.type !== 'segPending') return
        const t = projT(capturedPos, a, b)
        const insertPt = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
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
    }
  }

  const handleMeasureMouseUp = (e) => {
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
      const c = measureRef.current
      const rect = c.getBoundingClientRect()
      setLabelEditState({
        shapeIdx: lbl.shapeIdx, segIdx: lbl.segIdx, value: lbl.label,
        cssX: (lbl.mx / c.width) * rect.width,
        cssY: (lbl.my / c.height) * rect.height,
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
        const snapped = prev.length === 1 ? applySnap(pos, prev[0], true, false, currentPage) : pos
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
          const shape = { vertices: verts, pageNumber: currentPage }
          setReviewShape(shape); drawVerticesRef.current = []; setDrawVertexCount(0)
          redrawReviewCanvas(shape, currentPage); return
        }
      }
      const useAngleNow = snapAngle && !e.shiftKey
      let finalPos
      if (verts.length === 0) {
        finalPos = snapToGrid(rawPos, currentPage)
      } else {
        const { pos } = computeFinalSnapPos(rawPos, verts, useAngleNow, snapDist, currentPage)
        finalPos = pos
      }
      const next = [...verts, finalPos]
      drawVerticesRef.current = next; setDrawVertexCount(next.length)
      redrawDrawCanvas(rawPos, next, useAngleNow, snapDist, currentPage)
    }
  }

  const handleMeasureMouseMove = (e) => {
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
              clampToCanvas(snapToGrid({ x: v.x + dx, y: v.y + dy }, currentPage))
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
          if (s.pageNumber === currentPage && eligible.has(i) && pointInPolygon(pos, s.vertices)) {
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
          const origV = snapToGrid(ds.origVerts[ds.vertIdx], currentPage)
          // Axis snap relative to (grid-aligned) original vertex position (unless Shift held)
          let snapTarget = pos
          if (!e.shiftKey) snapTarget = applyAxisSnap(pos, origV)
          const snapped = clampToCanvas(snapToGrid(snapTarget, currentPage))
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
            const newA = clampToCanvas(snapToGrid({ x: ds.origA.x + dx, y: ds.origA.y + dy }, currentPage))
            const newB = clampToCanvas(snapToGrid({ x: ds.origB.x + dx, y: ds.origB.y + dy }, currentPage))
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
      drawCalibState([calibPoints[0], applySnap(pos, calibPoints[0], true, false, currentPage)])
    } else if (drawMode && !reviewShape) {
      mousePosRef.current = pos
      redrawDrawCanvas(pos, drawVerticesRef.current, snapAngle && !e.shiftKey, snapDist, currentPage)
    }
  }

  // ── Draw mode canvas render ──────────────────────────────────────────────

  const redrawDrawCanvas = (mousePos, vertices, useAngle, useDist, pageNum) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, pageNum)

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
        const { pos: snapped, guides } = computeFinalSnapPos(mousePos, vertices, useAngle, useDist, pageNum)
        guides.forEach(g => drawAlignGuide(ctx, g, c.width, c.height))
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(snapped.x, snapped.y)
        ctx.strokeStyle = guides.length > 0 ? 'rgba(245,158,11,0.8)' : 'rgba(59,130,246,0.65)'
        ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(snapped.x, snapped.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = guides.length > 0 ? '#f59e0b' : '#3b82f6'; ctx.fill()
        const ddx = snapped.x - last.x, ddy = snapped.y - last.y
        const label = pxToDisplayDist(Math.sqrt(ddx * ddx + ddy * ddy), pageNum)
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

  const redrawReviewCanvas = (shape, pageNum) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, pageNum)
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
      { vertices: reviewShape.vertices, pageNumber: currentPage, status: 'locked' },
    ]
    setReviewShape(null); drawVerticesRef.current = []; setDrawVertexCount(0)
    const c = measureRef.current
    if (c) {
      c.getContext('2d').clearRect(0, 0, c.width, c.height)
      drawLockedShapes(c.getContext('2d'), currentPage)
    }
  }

  const discardShape = () => {
    setReviewShape(null); setDrawMode(false)
    drawVerticesRef.current = []; setDrawVertexCount(0); mousePosRef.current = null
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (calibMode) exitCalibMode()
        else if (reviewShape) discardShape()
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
        redrawDrawCanvas(mousePosRef.current, next, snapAngle, snapDist, currentPage)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calibMode, drawMode, reviewShape, snapAngle, snapDist, currentPage, editMode, labelEditState])

  // ── Derived ───────────────────────────────────────────────────────────────

  const pageHasScale = currentPage && !!pageScalesRef.current[currentPage]
  const lockedShapesOnPage = currentPage
    ? completedShapesRef.current.filter(s => s.pageNumber === currentPage)
    : []

  const hasCombinableShapes = editMode
    ? getEligibleShapes(completedShapesRef.current, currentPage).size >= 2
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
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1 || renderingPage}>‹</button>
            <span className="page-indicator">{renderingPage ? '…' : currentPage} / {pageCount}</span>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount || renderingPage}>›</button>
          </div>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && (
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

        {currentPage && !calibMode && !drawMode && !editMode && (
          <button
            className="draw-btn"
            disabled={!pageHasScale}
            title={!pageHasScale ? 'Set scale first to enable drawing' : undefined}
            onClick={() => {
              const unit = pageScalesRef.current[currentPage]?.displayUnit
              snapIncrementRef.current = unit === 'm' ? 0.15 : 0.1524
              setSnapIncrement(unit === 'm' ? 0.15 : 0.1524)
              clearMeasureCanvas(); setDrawMode(true)
            }}
          >
            Draw
          </button>
        )}

        {currentPage && !calibMode && !drawMode && !editMode && lockedShapesOnPage.length > 0 && (
          <button className="edit-btn" onClick={() => { clearMeasureCanvas(); setEditMode(true) }}>
            Edit Shapes
          </button>
        )}

        {drawMode && (
          <div className="draw-toolbar">
            {!reviewShape ? (
              <>
                <button
                  className={`snap-btn ${snapAngle ? 'snap-btn--on' : ''}`}
                  onClick={() => {
                    const next = !snapAngle; setSnapAngle(next)
                    redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, next, snapDist, currentPage)
                  }}
                >Axis Snap {snapAngle ? 'ON' : 'OFF'}</button>
                <button
                  className={`snap-btn ${snapDist ? 'snap-btn--on' : ''} ${!pageHasScale ? 'snap-btn--unavail' : ''}`}
                  onClick={() => {
                    if (!pageHasScale) return
                    const next = !snapDist; setSnapDist(next)
                    redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, next, currentPage)
                  }}
                >Dist Snap {snapDist ? 'ON' : 'OFF'}</button>
                {snapDist && pageHasScale && (() => {
                  const isImperial = pageScalesRef.current[currentPage]?.displayUnit === 'ft'
                  return (
                    <select className="snap-increment-select" value={snapIncrement}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        snapIncrementRef.current = v; setSnapIncrement(v)
                        redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, true, currentPage)
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
                <span className="edit-status">Drag corner · side · click label to edit · hold segment to insert vertex</span>
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

      {error && <p className="error">{error}</p>}

      <div className={`canvas-wrapper ${currentPage ? 'visible' : ''}`}>
        <div className="canvas-stack">
          <canvas ref={canvasRef} />
          <canvas
            ref={measureRef}
            className={`measure-canvas ${(calibMode || drawMode || editMode) ? 'measure-canvas--active' : ''}`}
            style={editMode ? { cursor: editCursor } : undefined}
            onMouseDown={handleMeasureMouseDown}
            onMouseUp={handleMeasureMouseUp}
            onClick={handleMeasureClick}
            onMouseMove={handleMeasureMouseMove}
          />
          {editMode && labelEditState && (
            <div className="label-edit-overlay"
              style={{ left: labelEditState.cssX, top: labelEditState.cssY }}>
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

      {!pdf && !loading && (
        <div className="empty-state">
          <p>Upload a PDF architectural drawing set to begin</p>
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
