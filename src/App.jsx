import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// Derive [{a, b}] segments from a vertex array for any code that needs them
function segmentsFromVertices(vertices) {
  const segs = []
  for (let i = 0; i + 1 < vertices.length; i++) {
    segs.push({ a: vertices[i], b: vertices[i + 1] })
  }
  return segs
}

function App() {
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [renderingPage, setRenderingPage] = useState(false)

  // Calibration UI state
  const [calibMode, setCalibMode] = useState(false)
  const [calibPoints, setCalibPoints] = useState([])
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [scaleUnit, setScaleUnit] = useState('imperial')
  const [feetVal, setFeetVal] = useState('')
  const [inchesVal, setInchesVal] = useState('')
  const [metersVal, setMetersVal] = useState('')
  const [scaleError, setScaleError] = useState('')

  // Drawing state
  const [drawMode, setDrawMode] = useState(false)
  const [snapAngle, setSnapAngle] = useState(true)   // axis/45° snap — on by default
  const [snapDist, setSnapDist] = useState(false)    // distance-increment snap
  const [drawVertexCount, setDrawVertexCount] = useState(0) // mirrors drawVerticesRef.length for reactive UI

  const canvasRef = useRef(null)
  const measureRef = useRef(null)
  const pageScalesRef = useRef({})       // pageNum -> { pxPerMeter, displayUnit }
  const drawVerticesRef = useRef([])     // [{x,y}] in-progress trace
  const mousePosRef = useRef(null)       // last canvas mouse position

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
    exitCalibMode()
    exitDrawMode()
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
    exitCalibMode()
    exitDrawMode()
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
    const scaleX = c.width / rect.width
    const scaleY = c.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  // ── Calibration ────────────────────────────────────────────────────────────

  const exitCalibMode = () => {
    setCalibMode(false)
    setCalibPoints([])
    setShowScaleDialog(false)
    setScaleError('')
    clearMeasureCanvas()
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
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
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

    setShowScaleDialog(false)
    setCalibMode(false)
    setCalibPoints([])
    setScaleError('')
    // Amber line stays visible as confirmation; cleared on next mode or page change
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  const exitDrawMode = () => {
    setDrawMode(false)
    drawVerticesRef.current = []
    setDrawVertexCount(0)
    mousePosRef.current = null
    clearMeasureCanvas()
  }

  // Convert a pixel distance to a display string using this page's scale
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

  // Apply angle snap then distance snap to a raw canvas position
  const applySnap = (rawPos, lastVertex, useAngle, useDist, pageNum) => {
    if (!lastVertex) return rawPos

    let x = rawPos.x
    let y = rawPos.y

    // Step 1 — constrain direction to nearest 45°
    if (useAngle) {
      const dx = x - lastVertex.x
      const dy = y - lastVertex.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0) {
        const angle = Math.atan2(dy, dx)
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
        x = lastVertex.x + dist * Math.cos(snapped)
        y = lastVertex.y + dist * Math.sin(snapped)
      }
    }

    // Step 2 — constrain length along the (possibly snapped) direction
    if (useDist) {
      const scale = pageScalesRef.current[pageNum]
      if (scale) {
        const snapPx = scale.pxPerMeter * 0.1524 // 6-inch / ~15cm grid
        const dx = x - lastVertex.x
        const dy = y - lastVertex.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0 && snapPx > 0) {
          const snappedDist = Math.round(dist / snapPx) * snapPx
          x = lastVertex.x + (dx / dist) * snappedDist
          y = lastVertex.y + (dy / dist) * snappedDist
        }
      }
    }

    return { x, y }
  }

  // Full canvas redraw for draw mode — called on every mousemove and after mutations
  const redrawDrawCanvas = (mousePos, vertices, useAngle, useDist, pageNum) => {
    const c = measureRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)

    // Placed segments (solid blue)
    if (vertices.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // Vertex dots
    vertices.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(v.x, v.y, i === 0 ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#1d4ed8' : '#3b82f6'
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    // Rubber-band line + snapped cursor dot + distance label
    if (vertices.length >= 1 && mousePos) {
      const last = vertices[vertices.length - 1]
      const snapped = applySnap(mousePos, last, useAngle, useDist, pageNum)

      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(snapped.x, snapped.y)
      ctx.strokeStyle = 'rgba(59,130,246,0.65)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])

      ctx.beginPath()
      ctx.arc(snapped.x, snapped.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#3b82f6'
      ctx.fill()

      const ddx = snapped.x - last.x
      const ddy = snapped.y - last.y
      const label = pxToDisplayDist(Math.sqrt(ddx * ddx + ddy * ddy), pageNum)
      if (label) {
        const mx = (last.x + snapped.x) / 2
        const my = (last.y + snapped.y) / 2
        ctx.font = '12px system-ui, sans-serif'
        const tw = ctx.measureText(label).width
        const pad = 3
        ctx.fillStyle = 'rgba(255,255,255,0.88)'
        ctx.fillRect(mx - tw / 2 - pad, my - 15, tw + pad * 2, 18)
        ctx.fillStyle = '#1d4ed8'
        ctx.fillText(label, mx - tw / 2, my - 1)
      }
    }
  }

  // ── Canvas event handlers ──────────────────────────────────────────────────

  const handleMeasureClick = (e) => {
    if (calibMode && !showScaleDialog) {
      const pos = getCanvasPos(e)
      setCalibPoints(prev => {
        if (prev.length >= 2) return prev
        const next = [...prev, pos]
        drawCalibState(next)
        if (next.length === 2) setShowScaleDialog(true)
        return next
      })
    } else if (drawMode) {
      const rawPos = getCanvasPos(e)
      const verts = drawVerticesRef.current
      const last = verts.length > 0 ? verts[verts.length - 1] : null
      const snapped = applySnap(rawPos, last, snapAngle, snapDist, currentPage)
      const next = [...verts, snapped]
      drawVerticesRef.current = next
      setDrawVertexCount(next.length)
      redrawDrawCanvas(rawPos, next, snapAngle, snapDist, currentPage)
    }
  }

  const handleMeasureMouseMove = (e) => {
    if (calibMode && !showScaleDialog && calibPoints.length === 1) {
      const pos = getCanvasPos(e)
      drawCalibState([calibPoints[0], pos])
    } else if (drawMode) {
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
        else if (drawMode) exitDrawMode()
      }
      if (drawMode && (e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
        // Undo last vertex
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
  }, [calibMode, drawMode, snapAngle, snapDist, currentPage]) // re-register when relevant state changes

  // ── Derived ────────────────────────────────────────────────────────────────

  const pageHasScale = currentPage && !!pageScalesRef.current[currentPage]

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
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>

        {pageCount > 0 && (
          <div className="page-controls">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1 || renderingPage}
            >‹</button>
            <span className="page-indicator">
              {renderingPage ? '…' : currentPage} / {pageCount}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= pageCount || renderingPage}
            >›</button>
          </div>
        )}

        {/* Set Scale button — hidden while calibrating or drawing */}
        {currentPage && !calibMode && !drawMode && (
          <button
            className={`calib-btn ${pageHasScale ? 'calib-btn--done' : ''}`}
            onClick={() => {
              exitDrawMode()
              setCalibMode(true)
              setCalibPoints([])
              setScaleError('')
              clearMeasureCanvas()
            }}
          >
            {pageHasScale ? 'Scale set ✓  Re-calibrate' : 'Set Scale'}
          </button>
        )}

        {/* Calibration status bar */}
        {calibMode && (
          <div className="calib-status">
            <span className="calib-instructions">
              {calibPoints.length === 0
                ? 'Click point A on a known dimension'
                : calibPoints.length === 1
                ? 'Click point B to complete the reference line'
                : 'Reference line set — enter real-world length below'}
            </span>
            <button className="calib-cancel" onClick={exitCalibMode}>Cancel</button>
          </div>
        )}

        {/* Draw button — hidden while calibrating */}
        {currentPage && !calibMode && !drawMode && (
          <button
            className="draw-btn"
            onClick={() => {
              clearMeasureCanvas()
              setDrawMode(true)
            }}
          >
            Draw
          </button>
        )}

        {/* Drawing mode toolbar */}
        {drawMode && (
          <div className="draw-toolbar">
            <button
              className={`snap-btn ${snapAngle ? 'snap-btn--on' : ''}`}
              onClick={() => {
                const next = !snapAngle
                setSnapAngle(next)
                redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, next, snapDist, currentPage)
              }}
              title="Snap to 45° axis angles"
            >
              Axis Snap {snapAngle ? 'ON' : 'OFF'}
            </button>
            <button
              className={`snap-btn ${snapDist ? 'snap-btn--on' : ''} ${!pageHasScale ? 'snap-btn--unavail' : ''}`}
              onClick={() => {
                if (!pageHasScale) return
                const next = !snapDist
                setSnapDist(next)
                redrawDrawCanvas(mousePosRef.current, drawVerticesRef.current, snapAngle, next, currentPage)
              }}
              title={pageHasScale ? 'Snap to 6″ distance increments' : 'Set scale first to enable distance snap'}
            >
              Dist Snap {snapDist ? 'ON' : 'OFF'}
            </button>
            <span className="draw-status">
              {drawVertexCount === 0
                ? 'Click to start tracing'
                : 'Click to continue · Z to undo · Esc to cancel'}
            </span>
            <button className="calib-cancel" onClick={exitDrawMode}>Stop</button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className={`canvas-wrapper ${currentPage ? 'visible' : ''}`}>
        <div className="canvas-stack">
          <canvas ref={canvasRef} />
          <canvas
            ref={measureRef}
            className={`measure-canvas ${(calibMode || drawMode) ? 'measure-canvas--active' : ''}`}
            onClick={handleMeasureClick}
            onMouseMove={handleMeasureMouseMove}
          />
        </div>
      </div>

      {!pdf && !loading && (
        <div className="empty-state">
          <p>Upload a PDF architectural drawing set to begin</p>
        </div>
      )}

      {/* Scale dialog */}
      {showScaleDialog && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && exitCalibMode()}
        >
          <div className="modal">
            <h2 className="modal-title">Set Scale</h2>
            <p className="modal-sub">
              Enter the real-world length of the reference line you just drew.
            </p>

            <div className="modal-unit-toggle">
              <label className={scaleUnit === 'imperial' ? 'active' : ''}>
                <input
                  type="radio" name="unit" value="imperial"
                  checked={scaleUnit === 'imperial'}
                  onChange={() => { setScaleUnit('imperial'); setScaleError('') }}
                />
                Imperial (ft + in)
              </label>
              <label className={scaleUnit === 'metric' ? 'active' : ''}>
                <input
                  type="radio" name="unit" value="metric"
                  checked={scaleUnit === 'metric'}
                  onChange={() => { setScaleUnit('metric'); setScaleError('') }}
                />
                Metric (m)
              </label>
            </div>

            {scaleUnit === 'imperial' ? (
              <div className="modal-inputs">
                <div className="input-group">
                  <input
                    type="number" min="0" step="1" placeholder="0"
                    value={feetVal}
                    onChange={e => { setFeetVal(e.target.value); setScaleError('') }}
                    autoFocus
                  />
                  <span className="input-label">ft</span>
                </div>
                <div className="input-group">
                  <input
                    type="number" min="0" step="0.5" placeholder="0"
                    value={inchesVal}
                    onChange={e => { setInchesVal(e.target.value); setScaleError('') }}
                  />
                  <span className="input-label">in</span>
                </div>
              </div>
            ) : (
              <div className="modal-inputs">
                <div className="input-group">
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={metersVal}
                    onChange={e => { setMetersVal(e.target.value); setScaleError('') }}
                    autoFocus
                  />
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
