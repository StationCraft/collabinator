import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './App.css'

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

  // Calibration UI state
  const [calibMode, setCalibMode] = useState(false)
  const [calibPoints, setCalibPoints] = useState([]) // [{x,y}] canvas coords
  const [showScaleDialog, setShowScaleDialog] = useState(false)
  const [scaleUnit, setScaleUnit] = useState('imperial')
  const [feetVal, setFeetVal] = useState('')
  const [inchesVal, setInchesVal] = useState('')
  const [metersVal, setMetersVal] = useState('')
  const [scaleError, setScaleError] = useState('')

  const canvasRef = useRef(null)
  const measureRef = useRef(null)
  const pageScalesRef = useRef({}) // pageNum -> { pxPerMeter, displayUnit }

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

      // Keep measure canvas in sync with PDF canvas dimensions
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
    renderPage(pdf, pageNum)
  }

  // ── Calibration helpers ──────────────────────────────────────────────────

  const clearMeasureCanvas = () => {
    const c = measureRef.current
    if (!c) return
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
  }

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
      // Draw line first (underneath dots)
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

      // Draw endpoint dots
      points.forEach((p, i) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'
        ctx.fill()
        ctx.strokeStyle = '#92400e'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Label dot
        ctx.fillStyle = '#92400e'
        ctx.font = 'bold 12px system-ui, sans-serif'
        ctx.fillText(i === 0 ? 'A' : 'B', p.x + 8, p.y - 6)
      })
    }
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

  const handleMeasureClick = (e) => {
    if (!calibMode || showScaleDialog) return

    const pos = getCanvasPos(e)
    setCalibPoints(prev => {
      if (prev.length >= 2) return prev // already have 2 points

      const next = [...prev, pos]
      drawCalibState(next)

      if (next.length === 2) {
        setShowScaleDialog(true)
      }
      return next
    })
  }

  const handleMeasureMouseMove = (e) => {
    if (!calibMode || showScaleDialog || calibPoints.length !== 1) return
    const pos = getCanvasPos(e)
    drawCalibState([calibPoints[0], pos])
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
      if (feet === 0 && inches === 0) {
        setScaleError('Enter a dimension greater than zero.')
        return
      }
      realWorldMeters = (feet * 12 + inches) * 0.0254
    } else {
      realWorldMeters = parseFloat(metersVal) || 0
      if (realWorldMeters <= 0) {
        setScaleError('Enter a dimension greater than zero.')
        return
      }
    }

    if (pixelDist < 5) {
      setScaleError('Reference line is too short. Click two distinct points.')
      return
    }

    const pxPerMeter = pixelDist / realWorldMeters

    pageScalesRef.current[currentPage] = {
      pxPerMeter,
      displayUnit: scaleUnit === 'imperial' ? 'ft' : 'm',
    }

    setShowScaleDialog(false)
    setCalibMode(false)
    setCalibPoints([])
    setScaleError('')
    // Leave the amber line visible as confirmation; clear when navigating away
  }

  // Escape key exits calibration
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') exitCalibMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pageHasScale = currentPage && !!pageScalesRef.current[currentPage]

  // ── Render ───────────────────────────────────────────────────────────────

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
            >
              ‹
            </button>

            <span className="page-indicator">
              {renderingPage ? '…' : currentPage} / {pageCount}
            </span>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= pageCount || renderingPage}
            >
              ›
            </button>
          </div>
        )}

        {currentPage && !calibMode && (
          <button
            className={`calib-btn ${pageHasScale ? 'calib-btn--done' : ''}`}
            onClick={() => {
              setCalibMode(true)
              setCalibPoints([])
              setScaleError('')
              clearMeasureCanvas()
            }}
          >
            {pageHasScale ? 'Scale set ✓  Re-calibrate' : 'Set Scale'}
          </button>
        )}

        {calibMode && (
          <div className="calib-status">
            <span className="calib-instructions">
              {calibPoints.length === 0
                ? 'Click point A on a known dimension'
                : calibPoints.length === 1
                ? 'Click point B to complete the reference line'
                : 'Reference line set — enter real-world length below'}
            </span>
            <button className="calib-cancel" onClick={exitCalibMode}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className={`canvas-wrapper ${currentPage ? 'visible' : ''}`}>
        <div className="canvas-stack">
          <canvas ref={canvasRef} />
          <canvas
            ref={measureRef}
            className={`measure-canvas ${calibMode ? 'measure-canvas--active' : ''}`}
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

      {/* ── Scale dialog ── */}
      {showScaleDialog && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && exitCalibMode()}>
          <div className="modal">
            <h2 className="modal-title">Set Scale</h2>
            <p className="modal-sub">
              Enter the real-world length of the reference line you just drew.
            </p>

            <div className="modal-unit-toggle">
              <label className={scaleUnit === 'imperial' ? 'active' : ''}>
                <input
                  type="radio"
                  name="unit"
                  value="imperial"
                  checked={scaleUnit === 'imperial'}
                  onChange={() => { setScaleUnit('imperial'); setScaleError('') }}
                />
                Imperial (ft + in)
              </label>
              <label className={scaleUnit === 'metric' ? 'active' : ''}>
                <input
                  type="radio"
                  name="unit"
                  value="metric"
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
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={feetVal}
                    onChange={e => { setFeetVal(e.target.value); setScaleError('') }}
                    autoFocus
                  />
                  <span className="input-label">ft</span>
                </div>
                <div className="input-group">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="0"
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
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
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
              <button className="btn-secondary" onClick={exitCalibMode}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleConfirmScale}>
                Confirm Scale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
