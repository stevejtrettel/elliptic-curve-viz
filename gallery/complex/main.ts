/**
 * complex — the conductor-11 curve over ℂ: the characteristic-zero archetype of
 * the p-series (p23, p101, p107), shown as the complex torus itself. E = ℂ/Λ
 * with Λ = ℤ + τℤ, τ = ½ + 2.42i (fixed), drawn in an affine patch of CP² via
 * z ↦ [℘(z):℘′(z):1] → R³ (surface builder in @/geometry/weierstrass-surface).
 *
 * On top of the paper surface: the line-at-infinity cutoff loop, the real locus
 * E(ℝ) (red), its −1 twist (purple), and the hierarchical lattice grid. Worn in
 * the shared "p-torus" gallery style: a near-black back wall, no floor, orbit to
 * rotate the camera plus a savable rigid object pose (Rotate X/Y/Z), and an
 * adjustable wall distance. Save writes gallery/complex/piece.json; the piece
 * boots back into the saved state.
 */
import * as THREE from 'three'

import { Complex } from '@/math/core'
import {
  glass,
  colored,
  metal,
  matte,
  buildSurface,
  buildHierGrid,
  buildGridCorners,
  makeProjection,
  type Vec3,
  type Run,
} from '@/geometry'
import {
  App,
  ControlPanel,
  type ExportControlsHandle,
  STUDIOS,
  addExportControls,
  addStudioControls,
  bright,
  colored as coloredStudio,
  dark,
} from '@/studio'
import { enablePlacement } from '@/author/place'

// τ is FIXED — this piece is one specific complex torus (the conductor-11 curve).
const TAU = new Complex(0.5, 2.42)
const WALL_BG = 0x0d0d0d // near-black back wall — the shared "p-torus" vibe (as p23)
const GRID_FACTOR = 2

const app = new App()
// content lives inside `holder` so the object can be rigidly re-posed (Rotate
// X/Y/Z, saved) independently of the OrbitControls camera.
const holder = new THREE.Group()
const content = new THREE.Group()
holder.add(content)
app.stage.add(holder)

// shared materials (kept across rebuilds; only geometries are disposed). Colors
// live in state.mats (saved) and are pushed in by applyMaterials(); these are
// just the initial recipes. Glass stays FrontSide (path-tracer requirement).
const surfaceMat = glass(0xc9eaff) // the curve surface — transmissive glass
// copper cutoff ring: metalness < 1 so the copper albedo always shows (it faces
// out into the dark, where a pure metal would render black — see metal() docs)
const boundaryMat = colored(0x2f6690) // the line-at-infinity cutoff — plain blue
const realMat = colored(0xff4d5e) // the real locus E(ℝ) — bright
const twistMat = colored(0x2ed573) // the −1 twist's real points — bright green
const gridMat = metal(0x5a5d63, 0.45) // the lattice grid — dark pewter metal

// ── state: cp2 geometry params (minus τ) + object pose + back wall ────────────
const state = {
  // complex-curve surface
  N: 130,
  sP: 1.0, // ℘ scale
  sDP: 0.12, // ℘′ scale (℘′ ≫ ℘ near the pole; small keeps the neck from spiking)
  projMode: 'p.re,dp.re,dp.im', // real locus → z=0 plane, twist → y=0 plane
  // cutoff ellipsoid at the point at infinity
  R: 8,
  yStretch: 1.2,
  tubeB: 0.05, // boundary tube radius
  tubeR: 0.11, // real-locus tube radius
  showTwist: true,
  tubeT: 0.09, // twist tube radius
  // hierarchical lattice grid
  showGrid: true,
  gridBase: 2,
  gridLevels: 3,
  gridThick: 0.05,
  gridRatio: 0.55,
  showCorners: true,
  // (the rigid ℝ³ pose lives on holder.quaternion, driven by the gizmo — saved
  //  separately as `pose`, not here)
  // back wall (no floor)
  wallOn: true,
  wallDist: 3,
  wallW: 120, // large enough to fill the frame so the flat background never shows
  wallH: 80,
  // material colors (glass surface / pewter grid / bright real + twist)
  mats: {
    glass: 0xc9eaff,
    glassRough: 0.15,
    grid: 0x5a5d63,
    gridRough: 0.45,
    boundary: 0x2f6690,
    real: 0xff4d5e,
    twist: 0x2ed573,
  },
}
let hiRes = false // export-time geometry boost (finer surface tessellation)

function makeTube(pts: Vec3[], closed: boolean, radius: number, mat: THREE.Material): THREE.Mesh {
  const v = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  const curve = new THREE.CatmullRomCurve3(v, closed, 'centripetal')
  const seg = Math.min(2000, Math.max(16, v.length * 2))
  const geo = new THREE.TubeGeometry(curve, seg, radius, 12, closed)
  return new THREE.Mesh(geo, mat)
}

function cap(p: Vec3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 16, 12), mat)
  m.position.set(p[0], p[1], p[2])
  return m
}

/** Tube each run; open runs (capped on the cutoff) get a sphere at each end. */
function addRuns(group: THREE.Group, runs: Run[], radius: number, mat: THREE.Material): void {
  for (const run of runs) {
    if (run.points.length < 2) continue
    group.add(makeTube(run.points, run.closed, radius, mat))
    if (!run.closed) {
      group.add(cap(run.points[0]!, radius, mat))
      group.add(cap(run.points[run.points.length - 1]!, radius, mat))
    }
  }
}

function rebuild(): void {
  for (const c of [...content.children]) {
    content.remove(c)
    ;(c as THREE.Mesh).geometry?.dispose()
  }

  const proj = makeProjection(state.projMode, state.sP, state.sDP)
  const ell = { rx: state.R, ry: state.R * state.yStretch, rz: state.R }
  const build = buildSurface({ tau: TAU, proj, ell, N: state.N * (hiRes ? 2 : 1) })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(build.positions, 3))
  geo.computeVertexNormals()
  content.add(new THREE.Mesh(geo, surfaceMat))

  if (state.showGrid) {
    const radii: number[] = []
    for (let k = 0; k < state.gridLevels; k++) radii.push(state.gridThick * state.gridRatio ** k)
    for (const run of buildHierGrid(TAU, proj, ell, state.gridBase, GRID_FACTOR, radii)) {
      if (run.points.length >= 2) content.add(makeTube(run.points, run.closed, run.radius, gridMat))
    }
    if (state.showCorners) {
      for (const p of buildGridCorners(TAU, proj, ell, state.gridBase)) {
        content.add(cap(p, state.gridThick * 1.5, gridMat))
      }
    }
  }
  for (const loop of build.boundaryLoops) {
    if (loop.length >= 4) content.add(makeTube(loop, true, state.tubeB, boundaryMat))
  }
  addRuns(content, build.realRuns, state.tubeR, realMat)
  if (state.showTwist) addRuns(content, build.twistRuns, state.tubeT, twistMat)

  // Recenter: the affine CP² chart lands the object off-origin (centroid ≈
  // (−2.4, 0, 0)). Offsetting `content` by −center puts the holder's pivot
  // through the object's own center, so Rotate X/Y/Z spin it IN PLACE about
  // three distinct axes rather than orbiting it around the world origin (which
  // made the tilts read as one coupled swing). Computed from the surface bbox
  // in local coords, so it's independent of the current pose.
  let mnx = Infinity, mny = Infinity, mnz = Infinity
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
  const p = build.positions
  for (let i = 0; i < p.length; i += 3) {
    mnx = Math.min(mnx, p[i]!); mxx = Math.max(mxx, p[i]!)
    mny = Math.min(mny, p[i + 1]!); mxy = Math.max(mxy, p[i + 1]!)
    mnz = Math.min(mnz, p[i + 2]!); mxz = Math.max(mxz, p[i + 2]!)
  }
  if (p.length) content.position.set(-(mnx + mxx) / 2, -(mny + mxy) / 2, -(mnz + mxz) / 2)

  app.invalidate()
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`
const parseHex = (h: string): number => parseInt(h.replace(/^#/, ''), 16)

/** Push state.mats onto the shared materials (glass / pewter grid / bright arcs). */
function applyMaterials(): void {
  const m = state.mats
  surfaceMat.color.setHex(m.glass)
  surfaceMat.roughness = m.glassRough
  gridMat.color.setHex(m.grid)
  gridMat.roughness = m.gridRough
  boundaryMat.color.setHex(m.boundary)
  realMat.color.setHex(m.real)
  twistMat.color.setHex(m.twist)
  app.invalidate()
}

// ── save / load ──────────────────────────────────────────────────────────────
let exportHandle: ExportControlsHandle | null = null

interface SavedPiece {
  scene?: Partial<typeof state>
  /** Rigid object orientation (holder quaternion [x,y,z,w]) set by the gizmo. */
  pose?: number[]
  camera?: { position: number[]; target: number[]; fov: number }
  export?: { aspect: string; longEdge: number }
  studio?: string
  look?: {
    background?: number | null
    exposure?: number
    envIntensity?: number
    floorOffset?: number
    keyLightX?: number
    lights?: number[]
  }
}

function serialize(): SavedPiece {
  return {
    scene: { ...state },
    pose: holder.quaternion.toArray(),
    camera: { position: app.camera.position.toArray(), target: app.controls.target.toArray(), fov: app.camera.fov },
    ...(exportHandle ? { export: exportHandle.state() } : {}),
    studio: studioHandle.spec.name,
    look: {
      background: app.backgroundColor,
      exposure: app.renderer.toneMappingExposure,
      envIntensity: app.scene.environmentIntensity,
      floorOffset: app.floorOffset,
      keyLightX: app.keyLightX,
      lights: app.lightIntensities,
    },
  }
}

function applyScene(piece: SavedPiece): void {
  if (!piece.scene) return
  // `rot` is a legacy field (pre-gizmo Euler pose) — orientation now lives in
  // `pose`; drop it so it doesn't ride along into future saves.
  const { rot: _legacyRot, mats, ...scene } = piece.scene as Partial<typeof state> & { rot?: unknown }
  void _legacyRot
  Object.assign(state, scene)
  // `mats` is a nested object: MERGE key-by-key so a file saved before a color
  // was added (e.g. the copper `boundary`) keeps the current default for the
  // missing keys instead of wiping them to undefined (→ black / crash).
  if (mats) state.mats = { ...state.mats, ...mats }
}

function applyLook(look: NonNullable<SavedPiece['look']>): void {
  if (look.background !== undefined && look.background !== null) app.setBackground(look.background)
  if (look.exposure !== undefined) app.renderer.toneMappingExposure = look.exposure
  if (look.envIntensity !== undefined) app.scene.environmentIntensity = look.envIntensity
  if (look.floorOffset !== undefined) app.setFloorOffset(look.floorOffset)
  if (look.keyLightX !== undefined) app.setKeyLightX(look.keyLightX)
  if (look.lights) app.setLightIntensities(look.lights)
}

function applyCamera(cam: NonNullable<SavedPiece['camera']>): void {
  app.camera.position.fromArray(cam.position)
  app.controls.target.fromArray(cam.target)
  app.camera.fov = cam.fov
  app.camera.updateProjectionMatrix()
  app.controls.update()
}

const pieceGlob = import.meta.glob('./piece.json', { eager: true, import: 'default' })
const savedPiece = pieceGlob['./piece.json'] as SavedPiece | undefined

// ── boot (build first so the studio lights size to the real scene) ────────────
if (savedPiece) applyScene(savedPiece)
rebuild()
applyMaterials()
if (savedPiece?.pose) holder.quaternion.fromArray(savedPiece.pose)
let studioHandle = app.setStudio((savedPiece?.studio && STUDIOS[savedPiece.studio]) || coloredStudio)
app.setBackground(WALL_BG)

// back wall — the only backdrop (no floor); shares the studio floor's material
const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (studioHandle.floor?.material as THREE.Material) ?? matte(WALL_BG))
wall.receiveShadow = true
app.scene.add(wall)
function placeWall(): void {
  wall.visible = state.wallOn
  wall.material = (studioHandle.floor?.material as THREE.Material) ?? wall.material
  studioHandle.floor?.removeFromParent()
  wall.position.set(0, 0, -state.wallDist)
  wall.scale.set(state.wallW, state.wallH, 1)
  app.invalidate()
}

app.frame({ azimuth: 0.8, elevation: 1.0, fill: 0.85 })
placeWall()
if (savedPiece?.camera) applyCamera(savedPiece.camera)
if (savedPiece?.look) applyLook(savedPiece.look)
app.start()

// Orientation gizmo — grab the rings in the view to turn the curve in ℝ³ (the
// same gallery gizmo as the one-prime pieces). The object is the lone slot; it
// starts selected in Rotate mode so the rings are up immediately. Keys: R
// rotate, G move, Esc deselect. The pose lives on holder.quaternion (saved).
const placement = enablePlacement(app, [holder], { onChange: () => app.invalidate() })
placement.setMode('rotate')
placement.select(0)

// ── controls ──────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'complex · τ = ½ + 2.42i', width: 460 })

// Scene: the shared p-torus shell (orientation + wall + save).
const sceneTab = panel.tab('Scene')
sceneTab.label('Curve', 'E = ℂ/(ℤ + τℤ),  τ = ½ + 2.42i')
sceneTab.section('Orientation')
sceneTab.label('Gizmo', 'drag the rings in the view · R rotate / G move')
// Show/hide the gizmo (rings + highlight box) — turn it off for a clean render.
sceneTab.toggle('Show gizmo', true, (on) => placement.select(on ? 0 : null))
sceneTab.toggle('Tool: Rotate (else Move)', true, (on) => placement.setMode(on ? 'rotate' : 'translate'))
sceneTab.button('Reset orientation', () => {
  holder.quaternion.identity()
  app.invalidate()
})
sceneTab.section('Back wall')
sceneTab.toggle('Back wall', state.wallOn, (v) => {
  state.wallOn = v
  placeWall()
})
sceneTab.slider('Wall distance', { min: 0, max: 30, step: 0.5, value: state.wallDist }, (v) => {
  state.wallDist = v
  placeWall()
})
sceneTab.slider('Wall width', { min: 5, max: 250, step: 1, value: state.wallW }, (v) => {
  state.wallW = v
  placeWall()
})
sceneTab.slider('Wall height', { min: 5, max: 160, step: 1, value: state.wallH }, (v) => {
  state.wallH = v
  placeWall()
})
sceneTab.button('Reframe', () => {
  app.frame({ azimuth: 0.8, elevation: 1.0, fill: 0.85 })
  placeWall()
})
sceneTab.button('Path trace', () => {
  app.mode = app.mode === 'trace' ? 'live' : 'trace'
  app.invalidate()
})
const saveStatus = sceneTab.label('', '')
sceneTab.button('Save', () => {
  void (async () => {
    try {
      const res = await fetch('/api/save-piece?demo=complex', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(serialize()),
      })
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
      saveStatus.set('saved ✓ — reload to confirm')
    } catch (e) {
      saveStatus.set(`save failed: ${String(e)}`)
    }
  })()
})

// View: the R⁴→R³ projection + Weierstrass scales.
const view = panel.tab('View')
view.dropdown(
  'projection (x,y,z)',
  {
    options: [
      { label: 'Re℘, Re℘′, Im℘', value: 'p.re,dp.re,p.im' },
      { label: 'Re℘, Im℘, Re℘′', value: 'p.re,p.im,dp.re' },
      { label: 'Re℘, Re℘′, Im℘′', value: 'p.re,dp.re,dp.im' },
      { label: 'Im℘, Im℘′, Re℘', value: 'p.im,dp.im,p.re' },
    ],
    value: state.projMode,
  },
  (v) => {
    state.projMode = v
    rebuild()
  },
)
view.slider('℘ scale', { min: 0.3, max: 2.5, step: 0.05, value: state.sP }, (v) => {
  state.sP = v
  rebuild()
})
view.slider('℘′ scale', { min: 0.1, max: 1.2, step: 0.05, value: state.sDP }, (v) => {
  state.sDP = v
  rebuild()
})
view.slider('resolution', { min: 40, max: 220, step: 10, value: state.N }, (v) => {
  state.N = v
  rebuild()
})

// Cutoff: the ellipsoid clipping the point at infinity + tube radii.
const cut = panel.tab('Cutoff')
cut.slider('ellipsoid radius', { min: 2, max: 12, step: 0.1, value: state.R }, (v) => {
  state.R = v
  rebuild()
})
cut.slider('℘′-axis stretch', { min: 0.6, max: 3, step: 0.05, value: state.yStretch }, (v) => {
  state.yStretch = v
  rebuild()
})
cut.slider('boundary tube', { min: 0.01, max: 0.15, step: 0.005, value: state.tubeB }, (v) => {
  state.tubeB = v
  rebuild()
})
cut.slider('real-locus tube', { min: 0.01, max: 0.15, step: 0.005, value: state.tubeR }, (v) => {
  state.tubeR = v
  rebuild()
})
cut.toggle('twist real points', state.showTwist, (v) => {
  state.showTwist = v
  rebuild()
})
cut.slider('twist tube', { min: 0.01, max: 0.15, step: 0.005, value: state.tubeT }, (v) => {
  state.tubeT = v
  rebuild()
})

// Grid: the hierarchical lattice parallelogram.
const grid = panel.tab('Grid')
grid.toggle('lattice grid', state.showGrid, (v) => {
  state.showGrid = v
  rebuild()
})
grid.slider('base divisions', { min: 1, max: 6, step: 1, value: state.gridBase }, (v) => {
  state.gridBase = v
  rebuild()
})
grid.slider('levels', { min: 1, max: 4, step: 1, value: state.gridLevels }, (v) => {
  state.gridLevels = v
  rebuild()
})
grid.slider('thick tube', { min: 0.01, max: 0.09, step: 0.002, value: state.gridThick }, (v) => {
  state.gridThick = v
  rebuild()
})
grid.slider('thinning ratio', { min: 0.3, max: 0.8, step: 0.05, value: state.gridRatio }, (v) => {
  state.gridRatio = v
  rebuild()
})
grid.toggle('corner spheres', state.showCorners, (v) => {
  state.showCorners = v
  rebuild()
})

// Material: the glass surface, pewter grid, and the two bright real-form arcs.
const mat = panel.tab('Material')
mat.section('Surface (glass)')
mat.color('Glass tint', hex(state.mats.glass), (h) => {
  state.mats.glass = parseHex(h)
  applyMaterials()
})
mat.slider('Glass roughness', { min: 0, max: 0.6, step: 0.01, value: state.mats.glassRough }, (v) => {
  state.mats.glassRough = v
  applyMaterials()
})
mat.section('Grid (pewter)')
mat.color('Grid metal', hex(state.mats.grid), (h) => {
  state.mats.grid = parseHex(h)
  applyMaterials()
})
mat.slider('Grid roughness', { min: 0, max: 0.9, step: 0.01, value: state.mats.gridRough }, (v) => {
  state.mats.gridRough = v
  applyMaterials()
})
mat.section('Line at infinity')
mat.color('Ring color', hex(state.mats.boundary), (h) => {
  state.mats.boundary = parseHex(h)
  applyMaterials()
})
mat.section('Real forms')
mat.color('Real locus E(ℝ)', hex(state.mats.real), (h) => {
  state.mats.real = parseHex(h)
  applyMaterials()
})
mat.color('−1 twist', hex(state.mats.twist), (h) => {
  state.mats.twist = parseHex(h)
  applyMaterials()
})

addStudioControls(panel, app, studioHandle, {
  renderName: 'complex',
  capture: false,
  studios: [coloredStudio, bright, dark],
  onStudioChange: (h) => {
    studioHandle = h
    app.setBackground(WALL_BG)
    placeWall()
  },
})

exportHandle = addExportControls(panel, app, {
  renderName: 'complex',
  ...(savedPiece?.export?.aspect !== undefined ? { aspect: savedPiece.export.aspect } : {}),
  ...(savedPiece?.export?.longEdge !== undefined ? { longEdge: savedPiece.export.longEdge } : {}),
  onHighRes: (on) => {
    hiRes = on
    rebuild()
  },
  sidecar: () => ({ piece: serialize() }),
})

panel.mount(document.body)

export {}
