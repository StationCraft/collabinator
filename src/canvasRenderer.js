// ── Stateless canvas drawing primitives ───────────────────────────────────
// All functions take explicit data parameters — no closure over App state.

export function pxToDisplayDist(px, pageScales, pageId) {
  const scale = pageScales[pageId]
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

export function drawLockedShapes(ctx, completedShapes, pageId) {
  completedShapes
    .filter(s => s.pageId === pageId)
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
  } else {
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 4; ctx.globalAlpha = 0.95
  }
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  if (variant !== 'hover') {
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
export function drawGhostShapes(ctx, completedShapes, ghostPageId) {
  completedShapes
    .filter(s => s.pageId === ghostPageId && s.status === 'locked')
    .forEach(shape => {
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
