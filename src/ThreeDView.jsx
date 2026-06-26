import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Axis mapping: world X → three.js X, world Y (plan depth) → three.js Z, world Z (elevation) → three.js Y (up)
// Colors: floor rings #22d3ee, ceiling rings #f59e0b, vertical wall edges #94a3b8, roof ring #a78bfa

function toVec(x, y, z) {
  return new THREE.Vector3(x, z ?? 0, y)
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

export default function ThreeDView({ wireframe, onClose }) {
  const mountRef = useRef(null)
  const [showSolids, setShowSolids] = useState(true)
  // Stable refs so the solid-toggle effect can find the meshes without re-running the scene setup.
  const solidMeshesRef = useRef([])

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

    const w = el.clientWidth, h = el.clientHeight
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

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

          if (import.meta.env.DEV) {
            console.log(`[solids] ${solid.id}  kind=${solid.kind}  radiusM=${solid.radiusM ?? 'n/a'}  length=${length.toFixed(4)}m`)
          }

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

    // Frame camera to fit the wireframe (runs once per wireframe change, never on toggle)
    if (!box.isEmpty()) {
      const center = new THREE.Vector3()
      box.getCenter(center)
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z, 1)
      controls.target.copy(center)
      camera.position.set(center.x + maxDim * 1.5, center.y + maxDim * 0.8, center.z + maxDim * 1.5)
      camera.lookAt(center)
      controls.update()
    } else {
      camera.position.set(10, 5, 10)
      camera.lookAt(0, 0, 0)
    }

    const onResize = () => {
      if (!el) return
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let rafId
    const animate = () => {
      rafId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) obj.material.dispose()
      })
    }
  }, [wireframe])  // ← wireframe only; showSolids handled by the effect below

  // ── Solids toggle effect: only flips .visible on existing solid meshes.
  // Camera, controls, and all other scene objects are completely untouched.
  useEffect(() => {
    for (const mesh of solidMeshesRef.current) {
      mesh.visible = showSolids
    }
  }, [showSolids])

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
        <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: 8 }}>drag to rotate · scroll to zoom · right-drag to pan</span>
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
