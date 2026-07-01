// ── Coordinate seam (Tier 1 — pure primitives) ────────────────────────────
// The single home for all px↔meter, ft/in↔meter, screen↔canvas, and
// similarity/transform math. App.jsx does NO raw coordinate arithmetic inline;
// its six ref-bound resolvers (getEffectiveScale, getWorldOriginM,
// pageVertexToWorld, elevYToWorldZ, getCanvasPos, clampToCanvas) are thin
// wrappers that read live refs and call the primitives here.
//
// INVARIANT: raw scale.pxPerMeter reads, the constants 0.3048 / 0.0254, and
// T⁻¹ (inverse-similarity) math live ONLY in this file and those six wrappers.
//
// Storage stays in canvas-world pixels; meters are a read-time projection
// (Path 3 / #22 — no frozen conversion ratio is ever stored).

// ── Fundamental unit constants ─────────────────────────────────────────────
export const METERS_PER_FOOT = 0.3048
export const METERS_PER_INCH = 0.0254

// ── px ↔ meters (through a page's calibration scale) ───────────────────────
// pageScales is a { [pageId]: { pxPerMeter, displayUnit } } map; the caller
// passes the live ref value (or a synthetic single-entry map). Returns null
// when the page has no usable scale — callers already guard on null.
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

// Formats a pixel distance as a human-readable measurement in the page's
// display unit ('ft' → feet+inches, else metres). Returns null for a
// non-positive length or unscaled page.
export function pxToDisplayDist(px, pageScales, pageId) {
  const scale = pageScales[pageId]
  if (!scale || px <= 0) return null
  const meters = pxToMeters(px, pageScales, pageId)
  if (scale.displayUnit === 'ft') {
    const totalInches = metersToInches(meters)
    const feet = Math.floor(totalInches / 12)
    const inches = totalInches % 12
    return `${feet}' ${inches.toFixed(1)}"`
  }
  return `${meters.toFixed(3)} m`
}

// ── feet / inches ↔ meters ─────────────────────────────────────────────────
export function feetToMeters(ft)     { return ft * METERS_PER_FOOT }
export function metersToFeet(m)      { return m / METERS_PER_FOOT }
export function inchesToMeters(inch) { return inch * METERS_PER_INCH }
export function metersToInches(m)    { return m / METERS_PER_INCH }
// Combined feet + inches → meters (the calibration/opening dialog convention).
export function feetInchesToMeters(ft, inch) {
  return (ft * 12 + inch) * METERS_PER_INCH
}

// ── screen ↔ canvas-world ──────────────────────────────────────────────────
// Maps a client (screen) point to canvas-world pixels using the element's
// bounding rect and the canvas backing-store size {w,h}. This is the core of
// getCanvasPos (which supplies rect + measureRef.width/height from live refs).
export function screenToCanvas(clientXY, rect, size) {
  return {
    x: (clientXY.x - rect.left) * (size.w / rect.width),
    y: (clientXY.y - rect.top) * (size.h / rect.height),
  }
}

// Clamps a point into the [0,w]×[0,h] box (canvas bounds). Returns a plain
// {x,y}; callers that need makeVertex wrap the result.
export function clampToBox(v, w, h) {
  return {
    x: Math.max(0, Math.min(w, v.x)),
    y: Math.max(0, Math.min(h, v.y)),
  }
}

// ── pan / zoom (view transform) ────────────────────────────────────────────
// A screen-space delta expressed in world units (divide by zoom). Used by the
// align-drag translate and elevation base-line drag, which move geometry-space
// content and therefore compensate for zoom. NOTE: the pan-move handler adds a
// RAW screen delta to pan (pan lives in the outer, pre-scale CSS frame) and so
// deliberately does NOT route through here.
export function screenDeltaToWorld(dxy, zoom) {
  return { x: dxy.x / zoom, y: dxy.y / zoom }
}

// Anchored zoom: given the world point currently under the cursor, returns the
// new pan that keeps that point fixed as zoom changes from oldZoom → newZoom.
// worldPt = screenDeltaToWorld({x: clientX-rect.left, y: clientY-rect.top}, oldZoom).
export function zoomAnchorPan(pan, worldPt, oldZoom, newZoom) {
  return {
    x: pan.x + worldPt.x * (oldZoom - newZoom),
    y: pan.y + worldPt.y * (oldZoom - newZoom),
  }
}

// ── similarity transforms (translate + uniform scale; angle ≡ 0) ───────────
// Inverse similarity applied to a POINT: T⁻¹(p) = (p − t)/s, for
// T = translate(tx,ty)·scale(s). Defaults make a missing/identity transform a
// no-op. Used by the carve-commit crop-∘-T⁻¹ fold.
export function invSimilarityPoint(p, t) {
  const s  = (t && t.s) ? t.s : 1
  const tx = (t && t.tx != null) ? t.tx : 0
  const ty = (t && t.ty != null) ? t.ty : 0
  return { x: (p.x - tx) / s, y: (p.y - ty) / s }
}

// A crop carved from a source rendered at similarity scale s lives in a frame
// 1/s the source's pixel size, so its px/m must divide by the same s to measure
// true. Returns a new scale object (or null if the source scale is unusable).
export function propagateScaleToCropFrame(scale, s) {
  if (!scale || !scale.pxPerMeter) return null
  const div = s || 1
  return { ...scale, pxPerMeter: scale.pxPerMeter / div }
}

// Scale-handle drag → new similarity transform {tx, ty, s}. The anchor
// (drag.ax, drag.ay) is the fixed diagonally-opposite corner; drag.d0 is the
// grabbed-corner→anchor distance at grab time; drag.startS/startTx/startTy the
// transform at grab time. Uniform scale about the anchor; s clamped to [minS,maxS].
export function similarityFromHandleDrag(drag, pos, minS = 0.05, maxS = 20) {
  const d1 = Math.hypot(pos.x - drag.ax, pos.y - drag.ay)
  const rawS = drag.startS * (d1 / drag.d0)
  const s = Math.max(minS, Math.min(maxS, rawS))
  const ratio = s / drag.startS
  const tx = drag.ax - (drag.ax - drag.startTx) * ratio
  const ty = drag.ay - (drag.ay - drag.startTy) * ratio
  return { tx, ty, s }
}

// ── elevation Y (canvas px) ↔ Z (feet) core formula ────────────────────────
// The single source of truth for the elevation vertical mapping. Both the
// drawing pass (drawElevRefLines: Z feet → y) and the read-back
// (elevYToWorldZ: y → Z feet → metres) share these. pxPerMeter is the
// elevation page's own scale; feet is the storage unit of floorHeightsRef;
// the 0.3048 folds feet into the metre-based pixel scale.
export function elevYToZFeet(y, anchorY, lowestFloorZFeet, pxPerMeter) {
  return lowestFloorZFeet + (anchorY - y) / (METERS_PER_FOOT * pxPerMeter)
}
export function zFeetToElevY(zFeet, anchorY, lowestFloorZFeet, pxPerMeter) {
  return anchorY - (zFeet - lowestFloorZFeet) * METERS_PER_FOOT * pxPerMeter
}

// ── CSS transform string builder ───────────────────────────────────────────
// Shared by getCSSTransform (per-page PDF align layer) and the JSX canvas-world
// pan/zoom string. Order: translate → rotate → scale; pair with
// transformOrigin '0 0'. Always returns a full string (never 'none') so the
// canvas-world element keeps establishing a containing block/stacking context
// at identity, exactly as the old inline string did.
export function buildViewTransformCSS(t) {
  const { tx = 0, ty = 0, s = 1, angle = 0 } = t || {}
  return `translate(${tx}px, ${ty}px) rotate(${angle}deg) scale(${s})`
}

// Build a CSS transform string for a per-page PDF alignment transform.
// t = { tx, ty, s, angle } where tx,ty are canvas pixels, s is a unitless
// scale multiplier, angle is degrees. Returns 'none' for a null/identity
// transform so it can be assigned directly (the align layer relies on this).
export function getCSSTransform(t) {
  if (!t) return 'none'
  const { tx = 0, ty = 0, s = 1, angle = 0 } = t
  if (tx === 0 && ty === 0 && s === 1 && angle === 0) return 'none'
  return buildViewTransformCSS({ tx, ty, s, angle })
}

// Build the canvas-world pan/zoom CSS transform string. This is a DISTINCT
// 2-term similarity shape from getCSSTransform's align string: no rotate term,
// no space after the comma, and no identity 'none' shortcut (the canvas-world
// element always carries a full transform, even at identity). Stage 6 confirmed
// the two CSS sites do NOT share a byte-identical shape, so they use separate
// builders rather than being forced into one shape. Byte-identical to the prior
// inline JSX template literal at the .canvas-world site.
export function buildPanZoomTransformCSS(panX, panY, zoom) {
  return `translate(${panX}px,${panY}px) scale(${zoom})`
}
