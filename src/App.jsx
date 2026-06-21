import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'
import {
  distToSegment, segmentGeom, projT, applyAxisSnap, parseDisplayDistInput, pointInPolygon,
  findCollinearOverlap, prepareForMerge, mergePolygons, splitPolygon, getEligibleShapes,
  CLOSE_SNAP_RADIUS, ALIGN_TOLERANCE, HIT_SEG_DIST, HIT_VERT_DIST,
} from './geometry.js'
import { pxToDisplayDist, drawLockedShapes, drawShapePoly, drawAlignGuide } from './canvasRenderer.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

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
  const drawStartSnapRef = useRef(null)

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

  useEffect(() => {
    if (calibMode || drawMode || editMode) return
    const c = measureRef.current
    if (!c || !currentPage) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, completedShapesRef.current, currentPage)
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
    mousePosRef.current = null; drawStartSnapRef.current = null
    snapIncrementRef.current = 0.1524; setSnapIncrement(0.1524)
  }

  // Returns all vertices from currently visible geometry on the given page.
  // Written generically so it extends automatically when reference/ghost geometry is added.
  const getVisibleVertices = (pageNum) =>
    completedShapesRef.current
      .filter(s => s.pageNumber === pageNum)
      .flatMap(s => s.vertices)

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
          const label = pxToDisplayDist(lenPx, pageScalesRef.current, currentPage)
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
        finalPos = (!e.shiftKey && drawStartSnapRef.current)
          ? { ...drawStartSnapRef.current }
          : snapToGrid(rawPos, currentPage)
        drawStartSnapRef.current = null
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
      // Pre-first-vertex: detect snap target on visible geometry (Shift suppresses)
      if (drawVerticesRef.current.length === 0) {
        if (!e.shiftKey) {
          const visVerts = getVisibleVertices(currentPage)
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
      redrawDrawCanvas(pos, drawVerticesRef.current, snapAngle && !e.shiftKey, snapDist, currentPage)
    }
  }

  // ── Draw mode canvas render ──────────────────────────────────────────────

  const redrawDrawCanvas = (mousePos, vertices, useAngle, useDist, pageNum) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, completedShapesRef.current, pageNum)

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
        const { pos: snapped, guides } = computeFinalSnapPos(mousePos, vertices, useAngle, useDist, pageNum)
        guides.forEach(g => drawAlignGuide(ctx, g, c.width, c.height))
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(snapped.x, snapped.y)
        ctx.strokeStyle = guides.length > 0 ? 'rgba(245,158,11,0.8)' : 'rgba(59,130,246,0.65)'
        ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(snapped.x, snapped.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = guides.length > 0 ? '#f59e0b' : '#3b82f6'; ctx.fill()
        const ddx = snapped.x - last.x, ddy = snapped.y - last.y
        const label = pxToDisplayDist(Math.sqrt(ddx * ddx + ddy * ddy), pageScalesRef.current, pageNum)
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
    drawLockedShapes(ctx, completedShapesRef.current, pageNum)
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
      drawLockedShapes(c.getContext('2d'), completedShapesRef.current, currentPage)
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

  // Snap increment selector for Edit Shapes mode — reads/writes the same ref+state as Draw mode.
  // Changing it in edit mode takes effect on the next vertex drag/insert/move snap.
  const editSnapIncrementSelect = snapDist && pageHasScale ? (() => {
    const isImperial = pageScalesRef.current[currentPage]?.displayUnit === 'ft'
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
