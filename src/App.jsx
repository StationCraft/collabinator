import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function segmentsFromVertices(vertices) {
  const segs = []
  for (let i = 0; i + 1 < vertices.length; i++) {
    segs.push({ a: vertices[i], b: vertices[i + 1] })
  }
  return segs
}

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

const CLOSE_SNAP_RADIUS = 16
const ALIGN_TOLERANCE = 10
const HIT_SEG_DIST = 8

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
  const [editCursor, setEditCursor] = useState('default')
  const [labelEditState, setLabelEditState] = useState(null)
  const [editUndoCount, setEditUndoCount] = useState(0)

  const canvasRef = useRef(null)
  const measureRef = useRef(null)
  const pageScalesRef = useRef({})
  const drawVerticesRef = useRef([])
  const mousePosRef = useRef(null)
  const completedShapesRef = useRef([])
  const snapIncrementRef = useRef(0.1524)
  const pageGridOriginRef = useRef({})   // pageNum → {x,y} — absolute snap grid origin per page

  const editHoverRef = useRef(null)
  const dragStateRef = useRef(null)
  const segLabelRectsRef = useRef([])
  const editUndoStackRef = useRef([])

  // ── Page rendering ─────────────────────────────────────────────────────────

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
    } catch (err) {
      setError('Failed to render page.')
    } finally {
      setRenderingPage(false)
    }
  }, [])

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setLoading(true)
    setPdf(null)
    setCurrentPage(null)
    setPageCount(0)
    setFileName(file.name)
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
    setDrawMode(false); setReviewShape(null)
    setEditMode(false); setLabelEditState(null); setEditUndoCount(0)
    drawVerticesRef.current = []; mousePosRef.current = null
    editHoverRef.current = null; dragStateRef.current = null; editUndoStackRef.current = []
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      setPdf(pdfDoc)
      setPageCount(pdfDoc.numPages)
      await renderPage(pdfDoc, 1)
    } catch (err) {
      setError('Failed to load PDF. Make sure the file is a valid PDF.')
    } finally {
      setLoading(false)
    }
  }

  const goToPage = (pageNum) => {
    if (!pdf || renderingPage) return
    setCalibMode(false); setCalibPoints([]); setShowScaleDialog(false); setScaleError('')
    setDrawMode(false); setReviewShape(null)
    setEditMode(false); setLabelEditState(null); setEditUndoCount(0)
    drawVerticesRef.current = []; mousePosRef.current = null
    editHoverRef.current = null; dragStateRef.current = null; editUndoStackRef.current = []
    renderPage(pdf, pageNum)
  }

  // ── Shared canvas utilities ────────────────────────────────────────────────

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

  // Clamp perpendicular drag offset so both origA and origB stay within canvas
  const clampT = (origA, origB, tRaw, perpDir) => {
    const c = measureRef.current
    if (!c) return tRaw
    const W = c.width, H = c.height
    let tMin = -Infinity, tMax = Infinity
    for (const pt of [origA, origB]) {
      if (Math.abs(perpDir.x) > 0.001) {
        const t1 = (0 - pt.x) / perpDir.x
        const t2 = (W - pt.x) / perpDir.x
        tMin = Math.max(tMin, Math.min(t1, t2))
        tMax = Math.min(tMax, Math.max(t1, t2))
      }
      if (Math.abs(perpDir.y) > 0.001) {
        const t1 = (0 - pt.y) / perpDir.y
        const t2 = (H - pt.y) / perpDir.y
        tMin = Math.max(tMin, Math.min(t1, t2))
        tMax = Math.min(tMax, Math.max(t1, t2))
      }
    }
    return Math.max(tMin, Math.min(tMax, tRaw))
  }

  // ── Draw locked shapes (always-visible base layer) ─────────────────────────

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
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1.5
        ctx.lineJoin = 'round'
        ctx.stroke()
      })
  }

  // Redraw locked shapes into the measure canvas (used when returning to idle state)
  const redrawIdleCanvas = (pageNum) => {
    const c = measureRef.current
    if (!c || !pageNum) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, pageNum)
  }

  // ── Idle-state redraw: whenever all modes are off, show locked shapes ───────
  useEffect(() => {
    if (calibMode || drawMode || editMode) return
    redrawIdleCanvas(currentPage)
  }, [calibMode, drawMode, editMode, currentPage])

  // ── Calibration ────────────────────────────────────────────────────────────

  const exitCalibMode = () => {
    setCalibMode(false)
    setCalibPoints([])
    setShowScaleDialog(false)
    setScaleError('')
    // idle useEffect will redraw locked shapes
  }

  const drawCalibState = (points) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    if (points.length >= 1) {
      if (points.length === 2) {
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        ctx.lineTo(points[1].x, points[1].y)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 3])
        ctx.stroke()
        ctx.setLineDash([])
      }
      points.forEach((p, i) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'
        ctx.fill()
        ctx.strokeStyle = '#92400e'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = '#92400e'
        ctx.font = 'bold 12px system-ui, sans-serif'
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
      const feet = parseFloat(feetVal) || 0
      const inches = parseFloat(inchesVal) || 0
      if (feet === 0 && inches === 0) { setScaleError('Enter a dimension greater than zero.'); return }
      realWorldMeters = (feet * 12 + inches) * 0.0254
    } else {
      realWorldMeters = parseFloat(metersVal) || 0
      if (realWorldMeters <= 0) { setScaleError('Enter a dimension greater than zero.'); return }
    }
    if (pixelDist < 5) { setScaleError('Reference line is too short. Click two distinct points.'); return }
    pageScalesRef.current[currentPage] = {
      pxPerMeter: pixelDist / realWorldMeters,
      displayUnit: scaleUnit === 'imperial' ? 'ft' : 'm',
    }
    // Reset grid origin so it re-aligns to new scale
    delete pageGridOriginRef.current[currentPage]
    setShowScaleDialog(false)
    setCalibMode(false)
    setCalibPoints([])
    setScaleError('')
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  const exitDrawMode = () => {
    setDrawMode(false)
    setReviewShape(null)
    drawVerticesRef.current = []
    setDrawVertexCount(0)
    mousePosRef.current = null
    snapIncrementRef.current = 0.1524
    setSnapIncrement(0.1524)
    // idle useEffect redraws locked shapes
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

  // Absolute Cartesian grid snap: all shapes on a page share the same grid origin
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
      const dy = Math.abs(mousePos.y - v.y)
      const dx = Math.abs(mousePos.x - v.x)
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
    if (guides.length > 0) {
      return { pos: applySnap(alignSnapped, last, false, useDist, pageNum), guides }
    }
    return { pos: applySnap(rawPos, last, useAngle, useDist, pageNum), guides }
  }

  const drawAlignGuide = (ctx, guide, cw, ch) => {
    ctx.save()
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.75
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    if (guide.axis === 'h') { ctx.moveTo(0, guide.vertex.y); ctx.lineTo(cw, guide.vertex.y) }
    else { ctx.moveTo(guide.vertex.x, 0); ctx.lineTo(guide.vertex.x, ch) }
    ctx.stroke()
    ctx.restore()
  }

  // ── Edit mode canvas ───────────────────────────────────────────────────────

  const drawEditCanvas = (hoverSeg, previewOverride = null) => {
    const c = measureRef.current
    if (!c || !currentPage) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    segLabelRectsRef.current = []

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
        ctx.fillStyle = 'rgba(59,130,246,0.1)'
        ctx.fill()

        for (let segIdx = 0; segIdx < N; segIdx++) {
          const a = verts[segIdx]
          const b = verts[(segIdx + 1) % N]
          const isHover = hoverSeg?.shapeIdx === shapeIdx && hoverSeg?.segIdx === segIdx

          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.strokeStyle = isHover ? '#f59e0b' : '#2563eb'
          ctx.lineWidth = isHover ? 3 : 1.5
          ctx.lineJoin = 'round'
          ctx.stroke()

          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const lenPx = Math.hypot(b.x - a.x, b.y - a.y)
          const label = pxToDisplayDist(lenPx, currentPage)
          if (label) {
            ctx.font = '12px system-ui, sans-serif'
            const tw = ctx.measureText(label).width
            const pad = 3
            const lx = mx - tw / 2 - pad, ly = my - 15, lw = tw + pad * 2, lh = 18
            ctx.fillStyle = isHover ? 'rgba(254,243,199,0.97)' : 'rgba(255,255,255,0.92)'
            ctx.fillRect(lx, ly, lw, lh)
            ctx.fillStyle = isHover ? '#92400e' : '#1d4ed8'
            ctx.fillText(label, mx - tw / 2, my - 1)
            segLabelRectsRef.current.push({ shapeIdx, segIdx, x: lx, y: ly, w: lw, h: lh, mx, my, label })
          }
        }

        verts.forEach(v => {
          ctx.beginPath()
          ctx.arc(v.x, v.y, 3, 0, Math.PI * 2)
          ctx.fillStyle = '#3b82f6'
          ctx.fill()
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 1
          ctx.stroke()
        })
      })
  }

  useEffect(() => {
    if (editMode && currentPage) drawEditCanvas(editHoverRef.current)
  }, [editMode, currentPage])

  // ── Edit mode hit tests ────────────────────────────────────────────────────

  const hitTestLabels = (pos) => {
    const PAD = 4
    for (const lbl of segLabelRectsRef.current) {
      if (pos.x >= lbl.x - PAD && pos.x <= lbl.x + lbl.w + PAD &&
          pos.y >= lbl.y - PAD && pos.y <= lbl.y + lbl.h + PAD) return lbl
    }
    return null
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

  // ── Edit mode: segment move ────────────────────────────────────────────────

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

  // ── Edit mode: undo ────────────────────────────────────────────────────────

  const pushUndo = () => {
    editUndoStackRef.current.push(
      completedShapesRef.current.map(s => ({ ...s, vertices: s.vertices.map(v => ({ ...v })) }))
    )
    setEditUndoCount(c => c + 1)
  }

  const handleEditUndo = () => {
    const prev = editUndoStackRef.current.pop()
    if (!prev) return
    completedShapesRef.current = prev
    setEditUndoCount(c => c - 1)
    drawEditCanvas(editHoverRef.current)
  }

  // ── Edit mode: label override ──────────────────────────────────────────────

  // Extends symmetrically from the segment midpoint — both endpoints move equally.
  // This is neutral w.r.t. drawing direction and avoids the "extends in draw order" surprise.
  const commitLabelEdit = () => {
    if (!labelEditState) return
    const { shapeIdx, segIdx, value } = labelEditState
    const scale = pageScalesRef.current[currentPage]
    if (!scale) { setLabelEditState(null); return }
    const meters = parseDisplayDistInput(value, scale.displayUnit)
    if (!meters || meters <= 0) { setLabelEditState(null); drawEditCanvas(editHoverRef.current); return }

    const shape = completedShapesRef.current[shapeIdx]
    const verts = shape.vertices
    const N = verts.length
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
    newVerts[segIdx] = newA
    newVerts[(segIdx + 1) % N] = newB
    const newShapes = [...completedShapesRef.current]
    newShapes[shapeIdx] = { ...shape, vertices: newVerts }
    completedShapesRef.current = newShapes

    setLabelEditState(null)
    drawEditCanvas(editHoverRef.current)
  }

  // ── Edit mode lifecycle ────────────────────────────────────────────────────

  const exitEditMode = () => {
    setEditMode(false)
    setLabelEditState(null)
    setEditCursor('default')
    setEditUndoCount(0)
    editHoverRef.current = null
    dragStateRef.current = null
    editUndoStackRef.current = []
    // idle useEffect redraws locked shapes
  }

  // ── Drawing canvas render ──────────────────────────────────────────────────

  const redrawDrawCanvas = (mousePos, vertices, useAngle, useDist, pageNum) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    drawLockedShapes(ctx, pageNum)

    if (vertices.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    vertices.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(v.x, v.y, i === 0 ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#1d4ed8' : '#3b82f6'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    if (vertices.length >= 1 && mousePos) {
      const last = vertices[vertices.length - 1]
      const first = vertices[0]
      const nearClose = vertices.length >= 3 && (() => {
        const dx = mousePos.x - first.x, dy = mousePos.y - first.y
        return Math.sqrt(dx * dx + dy * dy) <= CLOSE_SNAP_RADIUS
      })()

      if (nearClose) {
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(first.x, first.y)
        ctx.strokeStyle = 'rgba(22,163,74,0.75)'
        ctx.lineWidth = 2
        ctx.setLineDash([5, 4])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(first.x, first.y, 10, 0, Math.PI * 2)
        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 2.5
        ctx.stroke()
      } else {
        const { pos: snapped, guides } = computeFinalSnapPos(mousePos, vertices, useAngle, useDist, pageNum)
        guides.forEach(g => drawAlignGuide(ctx, g, c.width, c.height))
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(snapped.x, snapped.y)
        ctx.strokeStyle = guides.length > 0 ? 'rgba(245,158,11,0.8)' : 'rgba(59,130,246,0.65)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.arc(snapped.x, snapped.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = guides.length > 0 ? '#f59e0b' : '#3b82f6'
        ctx.fill()

        const ddx = snapped.x - last.x, ddy = snapped.y - last.y
        const label = pxToDisplayDist(Math.sqrt(ddx * ddx + ddy * ddy), pageNum)
        if (label) {
          const mx = (last.x + snapped.x) / 2, my = (last.y + snapped.y) / 2
          ctx.font = '12px system-ui, sans-serif'
          const tw = ctx.measureText(label).width
          const pad = 3
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
    ctx.beginPath()
    ctx.moveTo(verts[0].x, verts[0].y)
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
    ctx.closePath()
    ctx.fillStyle = 'rgba(34,197,94,0.18)'
    ctx.fill()
    ctx.strokeStyle = '#16a34a'
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.stroke()
    verts.forEach(v => {
      ctx.beginPath()
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#16a34a'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })
  }

  const confirmShape = () => {
    if (!reviewShape) return
    completedShapesRef.current = [
      ...completedShapesRef.current,
      { vertices: reviewShape.vertices, pageNumber: currentPage, status: 'locked' },
    ]
    setReviewShape(null)
    drawVerticesRef.current = []
    setDrawVertexCount(0)
    const c = measureRef.current
    if (c) {
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, c.width, c.height)
      drawLockedShapes(ctx, currentPage)
    }
  }

  const discardShape = () => {
    setReviewShape(null)
    setDrawMode(false)
    drawVerticesRef.current = []
    setDrawVertexCount(0)
    mousePosRef.current = null
    // idle useEffect redraws
  }

  // ── Canvas event handlers ──────────────────────────────────────────────────

  const handleMeasureMouseDown = (e) => {
    if (!editMode || labelEditState) return
    const pos = getCanvasPos(e)
    const labelHit = hitTestLabels(pos)
    if (labelHit) {
      dragStateRef.current = { type: 'labelClick', labelHit, startPos: pos, moved: false }
      return
    }
    const segHit = hitTestSegments(pos)
    if (segHit) {
      const shape = completedShapesRef.current[segHit.shapeIdx]
      const verts = shape.vertices
      const a = verts[segHit.segIdx], b = verts[(segHit.segIdx + 1) % verts.length]
      const geom = segmentGeom(a, b)
      if (!geom) return
      dragStateRef.current = {
        type: 'segDrag',
        shapeIdx: segHit.shapeIdx,
        segIdx: segHit.segIdx,
        startPos: pos,
        origVerts: verts.map(v => ({ ...v })),
        origA: { ...a }, origB: { ...b },
        perpDir: geom.perp,
        isDragging: false,
        previewVerts: null,
      }
      setEditCursor('grabbing')
    }
  }

  const handleMeasureMouseUp = (e) => {
    if (!editMode) return
    const ds = dragStateRef.current
    if (!ds) return

    if (ds.type === 'labelClick' && !ds.moved) {
      const lbl = ds.labelHit
      const c = measureRef.current
      const rect = c.getBoundingClientRect()
      setLabelEditState({
        shapeIdx: lbl.shapeIdx,
        segIdx: lbl.segIdx,
        value: lbl.label,
        cssX: (lbl.mx / c.width) * rect.width,
        cssY: (lbl.my / c.height) * rect.height,
      })
    } else if (ds.type === 'segDrag' && ds.isDragging && ds.previewVerts) {
      pushUndo()
      const newShapes = [...completedShapesRef.current]
      newShapes[ds.shapeIdx] = { ...newShapes[ds.shapeIdx], vertices: ds.previewVerts }
      completedShapesRef.current = newShapes
      drawEditCanvas(editHoverRef.current)
    }

    dragStateRef.current = null
    setEditCursor(editHoverRef.current ? 'pointer' : 'default')
  }

  const handleMeasureClick = (e) => {
    if (editMode) return

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
          setReviewShape(shape)
          drawVerticesRef.current = []
          setDrawVertexCount(0)
          redrawReviewCanvas(shape, currentPage)
          return
        }
      }

      const { pos: snapped } = computeFinalSnapPos(rawPos, verts, snapAngle, snapDist, currentPage)
      const next = [...verts, snapped]

      // First vertex on this page establishes the absolute snap grid origin
      if (next.length === 1 && !pageGridOriginRef.current[currentPage]) {
        pageGridOriginRef.current[currentPage] = snapped
      }

      drawVerticesRef.current = next
      setDrawVertexCount(next.length)
      redrawDrawCanvas(rawPos, next, snapAngle, snapDist, currentPage)
    }
  }

  const handleMeasureMouseMove = (e) => {
    if (editMode) {
      const pos = getCanvasPos(e)
      const ds = dragStateRef.current

      if (ds) {
        const dx = pos.x - ds.startPos.x, dy = pos.y - ds.startPos.y
        if (Math.sqrt(dx * dx + dy * dy) > 3) ds.moved = true

        if (ds.type === 'segDrag' && ds.moved) {
          ds.isDragging = true
          const tRaw = dx * ds.perpDir.x + dy * ds.perpDir.y
          const tClamped = clampT(ds.origA, ds.origB, snapPerp(tRaw), ds.perpDir)
          const previewVerts = applySegmentMove(ds.origVerts, ds.segIdx, tClamped, ds.perpDir)
          ds.previewVerts = previewVerts
          drawEditCanvas(
            { shapeIdx: ds.shapeIdx, segIdx: ds.segIdx },
            { shapeIdx: ds.shapeIdx, vertices: previewVerts }
          )
        }
        return
      }

      const hit = hitTestSegments(pos)
      const prev = editHoverRef.current
      const changed = (!hit && prev) || (hit && !prev) ||
        (hit && prev && (hit.shapeIdx !== prev.shapeIdx || hit.segIdx !== prev.segIdx))
      if (changed) {
        editHoverRef.current = hit
        setEditCursor(hit ? 'pointer' : 'default')
        drawEditCanvas(hit)
      }
      return
    }

    if (calibMode && !showScaleDialog && calibPoints.length === 1) {
      const pos = getCanvasPos(e)
      drawCalibState([calibPoints[0], applySnap(pos, calibPoints[0], true, false, currentPage)])
    } else if (drawMode && !reviewShape) {
      const pos = getCanvasPos(e)
      mousePosRef.current = pos
      redrawDrawCanvas(pos, drawVerticesRef.current, snapAngle, snapDist, currentPage)
    }
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (calibMode) exitCalibMode()
        else if (reviewShape) discardShape()
        else if (drawMode) exitDrawMode()
        else if (editMode) {
          if (labelEditState) { setLabelEditState(null); drawEditCanvas(editHoverRef.current) }
          else exitEditMode()
        }
      }
      if (drawMode && !reviewShape && (e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        const verts = drawVerticesRef.current
        if (verts.length === 0) return
        const next = verts.slice(0, -1)
        drawVerticesRef.current = next
        setDrawVertexCount(next.length)
        redrawDrawCanvas(mousePosRef.current, next, snapAngle, snapDist, currentPage)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calibMode, drawMode, reviewShape, snapAngle, snapDist, currentPage, editMode, labelEditState])

  // ── Derived ────────────────────────────────────────────────────────────────

  const pageHasScale = currentPage && !!pageScalesRef.current[currentPage]
  const lockedShapesOnPage = currentPage
    ? completedShapesRef.current.filter(s => s.pageNumber === currentPage)
    : []

  // ── Render ─────────────────────────────────────────────────────────────────

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
            <button className="calib-cancel" onClick={exitCalibMode}>Cancel</button>
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
              clearMeasureCanvas()
              setDrawMode(true)
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
                  title="Snap to 45° axis angles"
                >Axis Snap {snapAngle ? 'ON' : 'OFF'}</button>
                <button
                  className={`snap-btn ${snapDist ? 'snap-btn--on' : ''} ${!pageHasScale ? 'snap-btn--unavail' : ''}`}
                  onClick={() => {
                    if (!pageHasScale) return
                    const next = !snapDist; setSnapDist(next)
                    redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, next, currentPage)
                  }}
                  title={pageHasScale ? 'Snap to distance increments' : 'Set scale first to enable distance snap'}
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
                      title="Distance snap increment"
                    >
                      {isImperial ? (
                        <><option value={0.0254}>1″</option><option value={0.0762}>3″</option>
                          <option value={0.1524}>6″</option><option value={0.3048}>12″</option></>
                      ) : (
                        <><option value={0.025}>2.5 cm</option><option value={0.075}>7.5 cm</option>
                          <option value={0.15}>15 cm</option><option value={0.30}>30 cm</option></>
                      )}
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
                    setDrawMode(false)
                    setEditMode(true)
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
            <span className="edit-status">
              Hover a segment · drag to move · click label to set length · Esc to exit
            </span>
            {editUndoCount > 0 && (
              <button className="calib-cancel" onClick={handleEditUndo}>Undo</button>
            )}
            <button className="calib-cancel" onClick={exitEditMode}>Done</button>
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
          {editMode && labelEditState && (() => {
            return (
              <div className="label-edit-overlay"
                style={{ left: labelEditState.cssX, top: labelEditState.cssY }}>
                <input
                  type="text"
                  className="label-edit-input"
                  value={labelEditState.value}
                  autoFocus
                  onChange={e => setLabelEditState(prev => ({ ...prev, value: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitLabelEdit() }
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setLabelEditState(null)
                      drawEditCanvas(editHoverRef.current)
                    }
                  }}
                  onBlur={() => { setLabelEditState(null); drawEditCanvas(editHoverRef.current) }}
                />
              </div>
            )
          })()}
        </div>
      </div>

      {!pdf && !loading && (
        <div className="empty-state">
          <p>Upload a PDF architectural drawing set to begin</p>
        </div>
      )}

      {showScaleDialog && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && exitCalibMode()}>
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
              <button className="btn-secondary" onClick={exitCalibMode}>Cancel</button>
              <button className="btn-primary" onClick={handleConfirmScale}>Confirm Scale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
