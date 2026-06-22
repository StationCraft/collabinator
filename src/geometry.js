// ── Pure geometry helpers and polygon algorithms ───────────────────────────

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 0.001) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function segmentGeom(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return null
  return { dir: { x: dx / len, y: dy / len }, perp: { x: -dy / len, y: dx / len }, len }
}

export function projT(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 0.001) return 0
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
}

export function applyAxisSnap(pos, origin) {
  const dx = pos.x - origin.x, dy = pos.y - origin.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.001) return pos
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return { x: origin.x + dist * Math.cos(snapped), y: origin.y + dist * Math.sin(snapped) }
}

export function parseDisplayDistInput(str, displayUnit) {
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

export function pointInPolygon(pt, verts) {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y, xj = verts[j].x, yj = verts[j].y
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

export const COLLINEAR_TOL = 0.5  // max perpendicular distance to be considered on the same line (px)
export const OVERLAP_MIN   = 1.0  // minimum overlap length to be considered a shared edge (px)
export const ENDPOINT_TOL  = 0.5  // coincidence tolerance for existing edge endpoints (px)

// Returns overlap info if vertsA and vertsB share a collinear edge segment
// (anti-parallel OR parallel — both winding combinations are handled), or null.
export function findCollinearOverlap(vertsA, vertsB) {
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

      const lenB = Math.hypot(b2.x - b1.x, b2.y - b1.y)
      if (lenB < 0.001) continue

      // Determine winding relationship: anti-parallel (dot < 0) or parallel (dot > 0).
      // Both are valid shared-wall configurations depending on how the user traced the shapes.
      const dot = (b2.x - b1.x) * dirX + (b2.y - b1.y) * dirY
      const dir = dot < 0 ? 'reversed' : 'same'

      // Project b1 and b2 onto A's line, then compute the overlap interval robustly
      // for both winding cases using min/max instead of assuming t_b1 > t_b2.
      const t_b1 = (b1.x - a1.x) * dirX + (b1.y - a1.y) * dirY
      const t_b2 = (b2.x - a1.x) * dirX + (b2.y - a1.y) * dirY
      const t_ov_start = Math.max(0, Math.min(t_b1, t_b2))
      const t_ov_end   = Math.min(lenA, Math.max(t_b1, t_b2))
      if (t_ov_end - t_ov_start < OVERLAP_MIN) continue

      return {
        segA: i, segB: j, dir, dirX, dirY, a1, a2, lenA, b1, b2, lenB,
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
export function prepareForMerge(verts, segIdx, P_first, P_second) {
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

export function mergePolygons(vertsA, vertsB, segA, segB, dir) {
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

export function linePolyIntersect(p1, p2, verts) {
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

export function splitPolygon(verts, cutP1, cutP2) {
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

export function getEligibleShapes(shapes, pageId) {
  const pageIdxs = shapes.map((s, i) => ({ s, i })).filter(({ s }) => s.pageId === pageId).map(({ i }) => i)
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

// ── Plan View (floor plan) ordering ─────────────────────────────────────────
// Canonical low-to-high order of known floor sub-labels. Single source of truth:
// both the sidebar ordering and getAnchorFloor() read from this. Free-text /
// "Other" sub-labels are NOT in this list and sort after all known labels.
export const FLOOR_ORDER = ['Basement', 'Crawlspace', 'Main Floor', '2nd Floor', '3rd Floor']

// True when subLabel is one of the canonical known floor labels.
export function isKnownFloorLabel(subLabel) {
  return FLOOR_ORDER.indexOf(subLabel) !== -1
}

// Identifies the anchor floor = the lowest-elevation Plan View with a known
// sub-label. Read-only; does not mutate pages.
//   pages: Array<{ pageId, pageNum, category, subLabel }>
// Returns { determinable, anchorPageId }.
//  - Only category === 'floor-plan' (Plan View) pages are considered.
//  - Only pages whose subLabel is a known floor label participate; free-text
//    Plan Views are ignored for this determination.
//  - If one or more known-label Plan Views exist, the lowest per FLOOR_ORDER is
//    the anchor (determinable true). Ties broken by pageNum.
//  - If none qualify, determinable is false and anchorPageId is null — no
//    guessing or fallback to page order.
export function getAnchorFloor(pages) {
  const known = (pages || []).filter(
    p => p.category === 'floor-plan' && isKnownFloorLabel(p.subLabel)
  )
  if (known.length === 0) return { determinable: false, anchorPageId: null }
  const anchor = known.reduce((lowest, p) => {
    const ri = FLOOR_ORDER.indexOf(p.subLabel), rl = FLOOR_ORDER.indexOf(lowest.subLabel)
    if (ri !== rl) return ri < rl ? p : lowest
    return p.pageNum < lowest.pageNum ? p : lowest
  })
  return { determinable: true, anchorPageId: anchor.pageId }
}

// Returns the pageId to show as a ghost on the current page (the reference source).
// Priority: stored referenceParentId (from pageRefParent map, written at confirm time)
// → FLOOR_ORDER downward scan as default suggestion (pre-confirm or no stored parent).
// Returns null if current page is not a categorized Floor Plan with a known floor level,
// or if no qualifying reference with locked shapes is found.
//   pages: Array<{ pageId, pageNum, category, subLabel, ... }>
//   currentPageId: the page currently being viewed
//   completedShapes: Array<{ pageId, vertices, ... }> (ref.current value)
//   floorOrder: FLOOR_ORDER array for canonical ordering
//   pageRefParent: optional map { [pageId]: parentPageId } written at confirm time
export function getGhostSourcePageId(pages, currentPageId, completedShapes, floorOrder, pageRefParent) {
  const currentPage = pages.find(p => p.pageId === currentPageId)
  if (!currentPage || currentPage.category !== 'floor-plan' || !currentPage.subLabel) return null

  // If a confirmed parent is stored, use it directly (primary-reference tree).
  const storedParent = pageRefParent && pageRefParent[currentPageId]
  if (storedParent) {
    const hasLocked = completedShapes.some(s => s.pageId === storedParent && s.status === 'locked')
    if (hasLocked) return storedParent
  }

  const currentFloorIdx = floorOrder.indexOf(currentPage.subLabel)
  if (currentFloorIdx === -1) return null // not a known floor label

  // Fallback: scan downward through FLOOR_ORDER to suggest the nearest lower floor.
  for (let i = currentFloorIdx - 1; i >= 0; i--) {
    const floorLabel = floorOrder[i]
    const lowerPage = pages.find(
      p => p.category === 'floor-plan' && p.subLabel === floorLabel
    )
    if (!lowerPage) continue
    const hasLocked = completedShapes.some(s => s.pageId === lowerPage.pageId && s.status === 'locked')
    if (hasLocked) return lowerPage.pageId
  }

  return null
}

// ── Floor-height Z-stack accumulator ────────────────────────────────────────
// Pure function. No refs, no React, no side effects.
// floorHeights: { [floorLevel]: { floorToCeiling: number|null, floorSystemAbove: number|null } }
// presentLevels: string[] — which floor levels are actually in the project (any order)
// Returns ordered array base→top:
//   { level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove }
// null values are preserved in output; accumulation treats null as 0.
export function accumulateZ(floorHeights, presentLevels, floorOrder) {
  const ordered = floorOrder.filter(l => presentLevels.includes(l))
  const result = []
  let z = 0
  for (let i = 0; i < ordered.length; i++) {
    const level = ordered[i]
    const entry = floorHeights[level] || {}
    const floorToCeiling = entry.floorToCeiling ?? null
    const floorSystemAbove = entry.floorSystemAbove ?? null
    const ftcVal = floorToCeiling ?? 0
    const fsaVal = floorSystemAbove ?? 0
    const floorZ = z
    const ceilingZ = floorZ + ftcVal
    result.push({ level, floorZ, ceilingZ, floorToCeiling, floorSystemAbove })
    if (i < ordered.length - 1) z = ceilingZ + fsaVal
  }
  return result
}

export const CLOSE_SNAP_RADIUS = 16
export const ALIGN_TOLERANCE = 10
export const HIT_SEG_DIST = 8
export const HIT_VERT_DIST = 9

// ── Reference-layer model (Step 6, sub-step 5) ──────────────────────────────
// Constant today; extended (not restructured) as new entity/projection types arrive.
export const REFERENCE_KIND_DEFAULT = 'plan'
export const PROJECTION_DEFAULT = 'plan'

export function kindToLabel(kind) {
  if (kind === 'plan') return 'reference floor'
  return 'reference drawing'
}
