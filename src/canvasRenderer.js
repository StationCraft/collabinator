// ── Stateless canvas drawing primitives ───────────────────────────────────
// All functions take explicit data parameters — no closure over App state.

export function pxToMeters(px, pageScales, pageId) {
  const scale = pageScales[pageId]
  if (!scale || !scale.pxPerMeter) return null
  return px / scale.pxPerMeter
}

export function metersToPx(m, pageScales, pageId) {
  const scale = pageScales[pageId]
  if (!scale || !scale.pxPerMeter) return null
  return m * scale.pxPerMeter
}

export function pxToDisplayDist(px, pageScales, pageId) {
  const scale = pageScales[pageId]
  if (!scale || px <= 0) return null
  const meters = pxToMeters(px, pageScales, pageId)
  if (scale.displayUnit === 'ft') {
    const totalInches = meters / 0.0254
    const feet = Math.floor(totalInches / 12)
    const inches = totalInches % 12
    return `${feet}' ${inches.toFixed(1)}"`
  }
  return `${meters.toFixed(3)} m`
}

export function drawLockedShapes(ctx, completedShapes, pageId) {
  completedShapes
    .filter(s => s.pageId === pageId)
    .forEach(shape => {
      if (shape.shapeKind === 'grade-line') return
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

export function drawShapePoly(ctx, verts, style) {
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

// Highlight a single segment (a→b). variant: 'front' = confirmed front face,
// 'hover' = candidate segment during front-face pick mode.
export function drawSegmentHighlight(ctx, a, b, variant) {
  ctx.save()
  if (variant === 'hover') {
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5; ctx.globalAlpha = 0.85
  } else if (variant === 'elev-edge') {
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 4; ctx.globalAlpha = 0.95
  } else {
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 4; ctx.globalAlpha = 0.95
  }
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  if (variant !== 'hover' && variant !== 'elev-edge') {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    ctx.globalAlpha = 1
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.fillStyle = '#dc2626'
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3
    ctx.strokeText('FRONT', mx + 6, my - 6)
    ctx.fillText('FRONT', mx + 6, my - 6)
  }
  ctx.restore()
}

export function drawAlignGuide(ctx, guide, cw, ch) {
  ctx.save()
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1; ctx.globalAlpha = 0.75; ctx.setLineDash([5, 5])
  ctx.beginPath()
  if (guide.axis === 'h') { ctx.moveTo(0, guide.vertex.y); ctx.lineTo(cw, guide.vertex.y) }
  else { ctx.moveTo(guide.vertex.x, 0); ctx.lineTo(guide.vertex.x, ch) }
  ctx.stroke(); ctx.restore()
}

// Draw locked shapes from a ghost source page (floor below) as read-only reference.
// Visual style: amber dashed outline + flat 10% fill + 45° hatch at 25% opacity.
// Ghost is drawn BELOW working geometry, so current-page traces read on top.
// Draw stored grade-line shapes (open polylines) on the given page as green dashed reference lines.
export function drawGradeLineShapes(ctx, completedShapes, pageId) {
  completedShapes
    .filter(s => s.pageId === pageId && s.shapeKind === 'grade-line' && s.status === 'locked')
    .forEach(shape => {
      const verts = shape.vertices
      if (verts.length < 2) return
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(verts[0].x, verts[0].y)
      for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.85
      ctx.stroke()
      ctx.setLineDash([])
      verts.forEach(v => {
        ctx.beginPath(); ctx.arc(v.x, v.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#16a34a'; ctx.globalAlpha = 0.85; ctx.fill()
      })
      ctx.restore()
    })
}

export function drawGhostShapes(ctx, completedShapes, ghostPageId) {
  completedShapes
    .filter(s => s.pageId === ghostPageId && s.status === 'locked')
    .forEach(shape => {
      if (shape.shapeKind === 'grade-line') return
      const verts = shape.vertices
      if (verts.length < 3) return

      // Build the polygon path once — reused for clip, fill, and stroke.
      const buildPath = () => {
        ctx.beginPath()
        ctx.moveTo(verts[0].x, verts[0].y)
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y)
        ctx.closePath()
      }

      // Bounding box for hatch coverage.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const v of verts) {
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
      }

      // ── Clipped interior: flat fill + 45° hatch ─────────────────────────
      ctx.save()
      buildPath()
      ctx.clip()

      // Flat background fill at 10% opacity.
      buildPath()
      ctx.fillStyle = '#f59e0b'
      ctx.globalAlpha = 0.10
      ctx.fill()

      // 45° diagonal hatch at 25% opacity, spaced 10px.
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1
      ctx.setLineDash([])
      const w = maxX - minX, h = maxY - minY
      ctx.beginPath()
      // 45° lines (slope -1): x + y = const. Sweep the constant across the bbox.
      for (let d = 0; d <= w + h; d += 10) {
        ctx.moveTo(minX, minY + d)
        ctx.lineTo(minX + d, minY)
      }
      ctx.stroke()

      ctx.restore()  // removes clip, resets transform; does NOT reset globalAlpha/styles

      // ── Dashed outline on top ────────────────────────────────────────────
      buildPath()
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 3.5
      ctx.globalAlpha = 0.85
      ctx.setLineDash([4, 3])
      ctx.stroke()

      // Clean up.
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    })
}

// Draw scale handles at the four corners of the combined bounding box of all
// ghost polygons. Handles are fixed to the ghost (floor-below reference) and
// do NOT move when the PDF body is dragged (Piece C). Size is constant on screen:
// drawn at HANDLE_PX / zoom so they appear ~12px regardless of zoom level.
// No drag behavior — purely visual targets (drag is Piece D2).
export const HANDLE_PX = 12
export function drawAlignHandles(ctx, completedShapes, ghostPageId, zoom) {
  const shapes = completedShapes.filter(s => s.pageId === ghostPageId && s.status === 'locked')
  if (shapes.length === 0) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const shape of shapes) {
    for (const v of shape.vertices) {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y
    }
  }
  const half = (HANDLE_PX / 2) / zoom
  const corners = [
    { x: minX, y: minY },  // TL
    { x: maxX, y: minY },  // TR
    { x: maxX, y: maxY },  // BR
    { x: minX, y: maxY },  // BL
  ]
  ctx.save()
  for (const { x, y } of corners) {
    // White border
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.9
    ctx.fillRect(x - half - 1 / zoom, y - half - 1 / zoom, HANDLE_PX / zoom + 2 / zoom, HANDLE_PX / zoom + 2 / zoom)
    // Amber fill
    ctx.fillStyle = '#f59e0b'
    ctx.globalAlpha = 1
    ctx.fillRect(x - half, y - half, HANDLE_PX / zoom, HANDLE_PX / zoom)
  }
  ctx.restore()
}

// Build a CSS transform string for a per-page PDF alignment transform.
// t = { tx, ty, s, angle } where tx,ty are canvas pixels, s is a unitless
// scale multiplier, angle is degrees. Order: translate -> rotate -> scale.
// Pair with transformOrigin: '0 0' on the element (matches zoom/pan convention).
// Returns 'none' for a null/identity transform so it can be assigned directly.
export function getCSSTransform(t) {
  if (!t) return 'none'
  const { tx = 0, ty = 0, s = 1, angle = 0 } = t
  if (tx === 0 && ty === 0 && s === 1 && angle === 0) return 'none'
  return `translate(${tx}px, ${ty}px) rotate(${angle}deg) scale(${s})`
}
