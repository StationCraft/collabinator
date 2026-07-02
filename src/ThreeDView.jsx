import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Axis mapping: world X → three.js X, world Y (plan depth) → three.js Z, world Z (elevation) → three.js Y (up)
// Colors: floor rings #22d3ee, ceiling rings #f59e0b, vertical wall edges #94a3b8, roof ring #a78bfa

function toVec(x, y, z) {
  return new THREE.Vector3(x, z ?? 0, y)
}

// ── #126 isometric camera helpers ────────────────────────────────────────────
// True-isometric elevation angle: atan(1/√2) ≈ 35.264°. Report: true iso used
// (not the ~28° perspective default) — parallel edges read cleanest at 35.264°.
const ISO_ELEV = Math.atan(1 / Math.SQRT2)
// Ortho frustum half-height as a fraction of the model's max bbox dim. 0.75 →
// vertical extent 1.5·maxDim, comparable margin to the perspective fit.
const ISO_HALF_K = 0.75
// Camera stand-off distance for iso placement (ortho: affects only near/far
// clipping, not scale; kept large enough to sit outside the model).
const ISO_DIST_K = 2.5

// Place camera on the iso ring at a horizontal azimuth + elevation angle around
// `center`, looking back at center. Bearing is (cos az, 0, sin az) in SCENE
// coords: scene-X and scene-Z are the horizontal plane, scene-Y is up. World-Y
// (plan depth) already lives on scene-Z, so an outward PLAN normal's Y-component
// belongs in the sin(az)·z term here — never in the up (scene-Y) term.
function placeOnRing(camera, controls, center, maxDim, azimuth, elev) {
  const dist = maxDim * ISO_DIST_K
  const cosE = Math.cos(elev), sinE = Math.sin(elev)
  camera.position.set(
    center.x + dist * (Math.cos(azimuth) * cosE),
    center.y + dist * sinE,
    center.z + dist * (Math.sin(azimuth) * cosE),
  )
  controls.target.copy(center)
  camera.lookAt(center)
  controls.update()
}

// The snap ring is ANCHORED to a reference edge (State 1) or the Front (State 2):
// 8 azimuth stops 45° apart, all at the TOP elevation (+ISO_ELEV, up=(0,1,0),
// looking down). Stop 0 = the anchor's outward azimuth (FACE-ON — a derived
// orthographic-ish elevation of the anchor face); the 90° stops (2,4,6) are the
// other three faces face-on; the 45° stops (1,3,5,7) are CORNER-ISO views (two
// faces + top, foreshortening-free). One wheel gives both the flat-elevation and
// the 3D-corner reads. Ring azimuth is derived inline from orientAzimuth(anchor) +
// n·45° — no fixed-compass detent set. In State 3 (no anchor) there is no ring at
// all (free orbit). All stops are above the model — no reversed underside views.

// Free starting azimuth that aims the iso square-on to a reference face's OUTWARD
// normal. refAw/refBw are the reference edge's world-metre endpoints; refSign is
// the #29 centroid anchor (interior→negative), so negating perp points outward.
// The outward PLAN normal (world XY) maps to scene as (outx, 0, outy) — the
// critical world-Y → scene-Z mapping. azimuth = atan2(scene-z, scene-x).
function orientAzimuth(orientEdge) {
  const { refAw, refBw, refSign } = orientEdge
  const dx = refBw.x - refAw.x, dy = refBw.y - refAw.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.PI / 4
  const dxn = dx / len, dyn = dy / len
  // left-hand unit normal in world XY (matches segmentGeom.perp)
  const perpx = -dyn, perpy = dxn
  // outward = perp · (−refSign)
  const outx = perpx * -refSign, outy = perpy * -refSign
  // n_scene = (outx, 0, outy) → azimuth from scene-X (outx) and scene-Z (outy)
  return Math.atan2(outy, outx)
}

function addLineLoop(scene, pts3, color) {
  if (pts3.length < 2) return
  const positions = []
  for (let i = 0; i < pts3.length; i++) {
    const a = pts3[i], b = pts3[(i + 1) % pts3.length]
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color })))
}

export default function ThreeDView({ wireframe, orientEdge = null, onClose }) {
  const mountRef = useRef(null)
  const [showSolids, setShowSolids] = useState(true)
  // #126: default into iso when opened from a page with an aligned reference face.
  const [isoMode, setIsoMode] = useState(!!orientEdge)
  // Stable refs so the solid-toggle effect can find the meshes without re-running the scene setup.
  const solidMeshesRef = useRef([])
  // #126: camera/controls/scene/renderer hoisted into refs so the iso toggle can
  // swap the camera WITHOUT rebuilding the scene graph. The render loop reads
  // cameraRef/controlsRef every frame, so a swap takes effect with no scene touch.
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const frameRef = useRef({ center: new THREE.Vector3(), maxDim: 10 })  // {center, maxDim}
  const cornerIdxRef = useRef(0)  // anchored-ring index 0..7 (0 = anchor face-on, ±45° steps); State 1/2 only

  // Build/swap the active camera + its OrbitControls for the given mode, reusing
  // the stored framing (center/maxDim). Perspective-off restores the exact
  // default diagonal (byte-identical to the original view). Iso-on builds an
  // ortho camera and aims it at the reference face (if any) or corner 0.
  const applyCameraMode = (iso) => {
    const renderer = rendererRef.current, el = mountRef.current
    if (!renderer || !el) return
    const { center, maxDim } = frameRef.current
    if (controlsRef.current) controlsRef.current.dispose()
    const aspect = (el.clientWidth || 1) / (el.clientHeight || 1)
    let cam
    if (iso) {
      const halfH = maxDim * ISO_HALF_K
      cam = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.01, 10000)
    } else {
      cam = new THREE.PerspectiveCamera(45, aspect, 0.01, 10000)
    }
    cameraRef.current = cam
    const controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls
    controls.target.copy(center)
    if (iso) {
      if (orientEdge) {
        // State 1/2: anchored ring. Entry = corner 0 at the anchor's outward azimuth.
        cornerIdxRef.current = 0
        placeOnRing(cam, controls, center, maxDim, orientAzimuth(orientEdge), ISO_ELEV)
      } else {
        // State 3: no anchor → ortho FREE-ORBIT. Default iso-ish framing angle;
        // no anchored ring, no snap detents (◄/► hidden). Not a synthesized corner 0.
        placeOnRing(cam, controls, center, maxDim, Math.PI / 4, ISO_ELEV)
      }
    } else {
      cam.position.set(center.x + maxDim * 1.5, center.y + maxDim * 0.8, center.z + maxDim * 1.5)
      cam.lookAt(center)
      controls.update()
    }
  }

  // Snap-rotate the ANCHORED ring (State 1/2 only). The ring's origin is the
  // anchor's outward azimuth (reference edge or Front); stop 0 = anchor face-on,
  // ◄/► step the index ±1 mod 8 → ±45° around the model relative to the anchor —
  // alternating face-on and corner-iso stops. Deterministic: pressing ► from the
  // same entry always lands on the same stop (fixed ring origin, not "last view on
  // screen"). No-op in State 3 (no anchor).
  const stepCorner = (delta) => {
    if (!isoMode || !orientEdge) return
    const cam = cameraRef.current, controls = controlsRef.current
    if (!cam || !controls) return
    cornerIdxRef.current = ((cornerIdxRef.current + delta) % 8 + 8) % 8
    const { center, maxDim } = frameRef.current
    const azimuth = orientAzimuth(orientEdge) + cornerIdxRef.current * (Math.PI / 4)
    placeOnRing(cam, controls, center, maxDim, azimuth, ISO_ELEV)
  }

  // ── Main scene effect: runs only when wireframe changes.
  // Builds scene, adds ALL meshes (including solid meshes), sets up camera once.
  // Solid meshes are stored in solidMeshesRef so the toggle effect can flip .visible
  // without touching the camera or controls.
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    solidMeshesRef.current = []   // reset on each wireframe rebuild

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)
    sceneRef.current = scene

    const w = el.clientWidth, h = el.clientHeight
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)
    rendererRef.current = renderer

    scene.add(new THREE.AxesHelper(0.5))

    const { floorRings, roofRing, soffitLines = [], openingLines = [], runLines = [], solids = [] } = wireframe

    // Track bounds to frame camera
    const box = new THREE.Box3()
    const expandBox = (v3) => box.expandByPoint(v3)

    for (const ring of floorRings) {
      const fZ = ring.floorZ ?? 0
      const cZ = ring.ceilingZ ?? fZ

      const floorPts = ring.verts.map(v => { const p = toVec(v.x, v.y, fZ); expandBox(p); return p })
      addLineLoop(scene, floorPts, 0x22d3ee)   // floor ring: teal

      if (ring.ceilingZ != null) {
        const ceilPts = ring.verts.map(v => { const p = toVec(v.x, v.y, cZ); expandBox(p); return p })
        addLineLoop(scene, ceilPts, 0xf59e0b)  // ceiling ring: amber
      }

      // Vertical wall edges
      const positions = []
      for (const v of ring.verts) {
        const bot = toVec(v.x, v.y, fZ)
        const top = toVec(v.x, v.y, cZ)
        positions.push(bot.x, bot.y, bot.z, top.x, top.y, top.z)
      }
      const vGeo = new THREE.BufferGeometry()
      vGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      scene.add(new THREE.LineSegments(vGeo, new THREE.LineBasicMaterial({ color: 0x94a3b8 })))
    }

    // Interior thermal-boundary face WIREFRAME (magenta #ec4899). The inner offset ring
    // of exterior + foundation walls: per-segment inner floor edge, inner ceiling edge,
    // and two inner verticals, read from the wall-panel solids' precomputed inner corners
    // (iax/iay/ibx/iby — inward direction via the pointInPolygon test, orientation-
    // independent). ALWAYS visible, like the exterior wireframe; the filled wall-panel
    // solid stays behind its own showSolids toggle. Purely additive. A wall with no
    // resolved assembly thickness contributes no wall-panel solid → no interior face.
    const interiorPositions = []
    for (const solid of solids) {
      if (solid.kind !== 'wall-panel') continue
      const fZ = solid.floorZ ?? 0, cZ = solid.ceilingZ ?? fZ
      const iBA = toVec(solid.iax, solid.iay, fZ)
      const iBB = toVec(solid.ibx, solid.iby, fZ)
      const iTA = toVec(solid.iax, solid.iay, cZ)
      const iTB = toVec(solid.ibx, solid.iby, cZ)
      ;[iBA, iBB, iTA, iTB].forEach(expandBox)
      interiorPositions.push(iBA.x, iBA.y, iBA.z, iBB.x, iBB.y, iBB.z)  // inner floor edge
      interiorPositions.push(iTA.x, iTA.y, iTA.z, iTB.x, iTB.y, iTB.z)  // inner ceiling edge
      interiorPositions.push(iBA.x, iBA.y, iBA.z, iTA.x, iTA.y, iTA.z)  // inner vertical A
      interiorPositions.push(iBB.x, iBB.y, iBB.z, iTB.x, iTB.y, iTB.z)  // inner vertical B
    }
    if (interiorPositions.length) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(interiorPositions, 3))
      scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xec4899 })))
    }

    if (roofRing) {
      const boxCenter = new THREE.Vector3()
      if (!box.isEmpty()) box.getCenter(boxCenter)
      const roofZ = roofRing.z ?? boxCenter.y
      const roofPts = roofRing.verts.map(v => { const p = toVec(v.x, v.y, roofZ); expandBox(p); return p })
      addLineLoop(scene, roofPts, 0xa78bfa)    // roof ring: purple
    }

    // Soffit lines: #c084fc (light violet, distinct from roof ring purple)
    if (soffitLines.length) {
      const positions = []
      for (const seg of soffitLines) {
        const a = toVec(seg.from.x, seg.from.y, seg.from.z); expandBox(a)
        const b = toVec(seg.to.x,   seg.to.y,   seg.to.z);   expandBox(b)
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc084fc })))
    }

    // Opening lines: #fb923c (orange, distinct from amber ceiling rings)
    if (openingLines.length) {
      const positions = []
      for (const seg of openingLines) {
        const a = toVec(seg.from.x, seg.from.y, seg.from.z); expandBox(a)
        const b = toVec(seg.to.x,   seg.to.y,   seg.to.z);   expandBox(b)
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xfb923c })))
    }

    // Run lines: grey for uncharacterized, amber for lineset
    if (runLines.length) {
      const groups = {}
      for (const seg of runLines) {
        const key = seg.category ?? '__uncharacterized'
        if (!groups[key]) groups[key] = []
        groups[key].push(seg)
      }
      for (const [cat, segs] of Object.entries(groups)) {
        const color = cat === '__uncharacterized' ? 0x9ca3af : cat === 'lineset' ? 0xf59e0b : 0x6b7280
        const positions = []
        for (const seg of segs) {
          const a = toVec(seg.from.x, seg.from.y, seg.from.z ?? 0); expandBox(a)
          const b = toVec(seg.to.x,   seg.to.y,   seg.to.z ?? 0);   expandBox(b)
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color })))
      }
    }

    // §8.3 Build 2: Solid meshes. All solid meshes are added here (visible = showSolids initial value)
    // and stored in solidMeshesRef. The toggle effect flips .visible without touching the camera.
    if (solids.length) {
      const yAxis = new THREE.Vector3(0, 1, 0)
      for (const solid of solids) {
        const mat = new THREE.MeshBasicMaterial({
          color: solid.color,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        })

        let mesh = null

        if (solid.kind === 'cylinder' || solid.kind === 'box-swept') {
          const from3 = toVec(solid.from.x, solid.from.y, solid.from.z ?? 0)
          const to3   = toVec(solid.to.x,   solid.to.y,   solid.to.z ?? 0)
          const dir = new THREE.Vector3().subVectors(to3, from3)
          const length = dir.length()

          if (length < 0.001) { mat.dispose(); continue }
          const mid = new THREE.Vector3().addVectors(from3, to3).multiplyScalar(0.5)
          dir.normalize()

          let geo
          if (solid.kind === 'cylinder') {
            geo = new THREE.CylinderGeometry(solid.radiusM, solid.radiusM, length, 8)
          } else {
            geo = new THREE.BoxGeometry(solid.widthM, length, solid.heightM)
          }
          mesh = new THREE.Mesh(geo, mat)
          mesh.position.copy(mid)
          // Rotate from default Y-axis to the from→to direction
          const q = new THREE.Quaternion().setFromUnitVectors(yAxis, dir)
          mesh.quaternion.copy(q)
          expandBox(mid)

        } else if (solid.kind === 'block') {
          const ctr = toVec(solid.center.x, solid.center.y, solid.center.z ?? 0)
          // BoxGeometry: wM (world X) × hM (world Z → THREE Y) × dM (world Y → THREE Z)
          const geo = new THREE.BoxGeometry(solid.wM, solid.hM, solid.dM)
          mesh = new THREE.Mesh(geo, mat)
          mesh.position.copy(ctr)
          expandBox(ctr)

        } else if (solid.kind === 'wall-panel') {
          // 8 corners of the wall panel: outer face A/B + inner face A/B, each at floor and ceiling.
          // Axis mapping: world (x,y,z) → THREE (x, z, y) via toVec.
          const fZ = solid.floorZ ?? 0, cZ = solid.ceilingZ ?? fZ
          const oBA = toVec(solid.ax,  solid.ay,  fZ)
          const oBB = toVec(solid.bx,  solid.by,  fZ)
          const oTA = toVec(solid.ax,  solid.ay,  cZ)
          const oTB = toVec(solid.bx,  solid.by,  cZ)
          const iBA = toVec(solid.iax, solid.iay, fZ)
          const iBB = toVec(solid.ibx, solid.iby, fZ)
          const iTA = toVec(solid.iax, solid.iay, cZ)
          const iTB = toVec(solid.ibx, solid.iby, cZ)
          const p = (v) => [v.x, v.y, v.z]
          // 6 faces × 2 triangles each = 12 triangles × 9 floats = 108 floats
          const positions = new Float32Array([
            ...p(oBA), ...p(oBB), ...p(oTA),   ...p(oBB), ...p(oTB), ...p(oTA),  // outer face
            ...p(iBA), ...p(iTA), ...p(iBB),   ...p(iBB), ...p(iTA), ...p(iTB),  // inner face (reversed winding)
            ...p(oTA), ...p(oTB), ...p(iTA),   ...p(oTB), ...p(iTB), ...p(iTA),  // top cap
            ...p(oBA), ...p(iBA), ...p(oBB),   ...p(oBB), ...p(iBA), ...p(iBB),  // bottom cap
            ...p(oBA), ...p(oTA), ...p(iBA),   ...p(iBA), ...p(oTA), ...p(iTA),  // left cap (A side)
            ...p(oBB), ...p(iBB), ...p(oTB),   ...p(iBB), ...p(iTB), ...p(oTB),  // right cap (B side)
          ])
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
          mesh = new THREE.Mesh(geo, mat)
          ;[oBA, oBB, oTA, oTB, iBA, iBB, iTA, iTB].forEach(expandBox)

        } else {
          mat.dispose()
        }

        if (mesh) {
          mesh.visible = showSolids
          scene.add(mesh)
          solidMeshesRef.current.push(mesh)
        }
      }
    }

    // Compute framing (center/maxDim) for the wireframe, then build the camera for
    // the CURRENT mode. (isoMode read here for the initial build — same pattern as
    // showSolids at mesh.visible below; the [isoMode] toggle effect handles changes.)
    if (!box.isEmpty()) {
      const center = new THREE.Vector3()
      box.getCenter(center)
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z, 1)
      frameRef.current = { center, maxDim }
    } else {
      frameRef.current = { center: new THREE.Vector3(), maxDim: 10 }
    }
    applyCameraMode(isoMode)

    const onResize = () => {
      if (!el) return
      const cam = cameraRef.current
      if (!cam) return
      const aspect = el.clientWidth / el.clientHeight
      if (cam.isOrthographicCamera) {
        const halfH = frameRef.current.maxDim * ISO_HALF_K
        cam.left = -halfH * aspect; cam.right = halfH * aspect
        cam.top = halfH; cam.bottom = -halfH
      } else {
        cam.aspect = aspect
      }
      cam.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let rafId
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      if (controlsRef.current) controlsRef.current.update()
      if (cameraRef.current) renderer.render(scene, cameraRef.current)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      if (controlsRef.current) controlsRef.current.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) obj.material.dispose()
      })
    }
  }, [wireframe])  // ← wireframe only; showSolids + isoMode handled by the effects below

  // ── Solids toggle effect: only flips .visible on existing solid meshes.
  // Camera, controls, and all other scene objects are completely untouched.
  useEffect(() => {
    for (const mesh of solidMeshesRef.current) {
      mesh.visible = showSolids
    }
  }, [showSolids])

  // ── Iso toggle effect (#126): swaps the camera (perspective ↔ ortho) WITHOUT
  // rebuilding the scene graph. Skips the mount run — the main effect already
  // built the initial camera for isoMode's starting value; this only reacts to
  // later toggles.
  const isoDidMount = useRef(false)
  useEffect(() => {
    if (!isoDidMount.current) { isoDidMount.current = true; return }
    if (!isoMode) cornerIdxRef.current = 0  // reset detent when leaving iso
    applyCameraMode(isoMode)
  }, [isoMode])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', background: '#1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>3D Wireframe</span>
        <span style={{ color: '#22d3ee', fontSize: '0.75rem' }}>■ floor</span>
        <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>■ ceiling</span>
        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>■ walls</span>
        <span style={{ color: '#a78bfa', fontSize: '0.75rem' }}>■ roof</span>
        <span style={{ color: '#c084fc', fontSize: '0.75rem' }}>■ soffit</span>
        <span style={{ color: '#fb923c', fontSize: '0.75rem' }}>■ openings</span>
        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>■ run</span>
        <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>■ lineset</span>
        <span style={{ color: '#8b5cf6', fontSize: '0.75rem' }}>■ equipment</span>
        <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>■ wall depth</span>
        <span style={{ color: '#ec4899', fontSize: '0.75rem' }}>■ interior face</span>
        <button
          onClick={() => setShowSolids(s => !s)}
          style={{
            background: showSolids ? '#334155' : '#1e293b',
            border: '1px solid #475569',
            color: '#e2e8f0',
            padding: '2px 10px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          {showSolids ? 'Solids ✓' : 'Solids'}
        </button>
        <button
          onClick={() => setIsoMode(m => !m)}
          style={{
            background: isoMode ? '#334155' : '#1e293b',
            border: '1px solid #475569',
            color: '#e2e8f0',
            padding: '2px 10px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          {isoMode ? 'Iso ✓' : 'Iso'}
        </button>
        {isoMode && orientEdge && (
          <>
            <button
              onClick={() => stepCorner(-1)}
              title="Rotate 90° around model (toward the anchor's left)"
              style={{ background: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ◄
            </button>
            <button
              onClick={() => stepCorner(1)}
              title="Rotate 90° around model (toward the anchor's right)"
              style={{ background: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ►
            </button>
          </>
        )}
        <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: 8 }}>
          {isoMode
            ? (orientEdge ? 'iso: ◄ ► rotate around model · drag to orbit · scroll to zoom' : 'iso free-orbit · drag to rotate · scroll to zoom')
            : 'drag to rotate · scroll to zoom · right-drag to pan'}
        </span>
        <button
          onClick={onClose}
          style={{ marginLeft: 'auto', background: '#475569', border: 'none', color: '#e2e8f0', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Close ✕
        </button>
      </div>
      <div ref={mountRef} style={{ flex: 1 }} />
    </div>
  )
}
