import { useState, useRef, useCallback } from 'react'
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
  const canvasRef = useRef(null)

  const renderPage = useCallback(async (pdfDoc, pageNum) => {
    setRenderingPage(true)
    try {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      // Fit to container width (max 1200px), preserve aspect ratio
      const containerWidth = Math.min(window.innerWidth - 48, 1200)
      const viewport = page.getViewport({ scale: 1 })
      const scale = containerWidth / viewport.width
      const scaled = page.getViewport({ scale })

      canvas.width = scaled.width
      canvas.height = scaled.height

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
    renderPage(pdf, pageNum)
  }

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

            <span className="page-hint">Select the floor plan page to begin tracing</span>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className={`canvas-wrapper ${currentPage ? 'visible' : ''}`}>
        <canvas ref={canvasRef} />
      </div>

      {!pdf && !loading && (
        <div className="empty-state">
          <p>Upload a PDF architectural drawing set to begin</p>
        </div>
      )}
    </div>
  )
}

export default App
