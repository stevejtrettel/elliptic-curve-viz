/**
 * p107 — the class group of the conductor-11 curve over F₁₀₇ (disc −104, ℤ/6),
 * laid on the SIXTH ROOTS OF UNITY: a form of class-group order d sits at a
 * primitive d-th root of unity, identity at ζ⁰=(1,0) on the real axis. A
 * HORIZONTAL glass plate on the real axis is the inversion g ↦ g⁻¹ (= complex
 * conjugation ζ^k ↦ ζ^{-k}):
 *
 *      (3,2,9) ord3          (5,4,6) ord6        ← ζ², ζ¹   upper row
 *   (2,0,13) ord2 ───────────────── (1,0,26) id   ← ζ³, ζ⁰   real axis (on the glass)
 *      (3,-2,9) ord3         (5,-4,6) ord6        ← ζ⁴, ζ⁵   lower row
 *                 ══ glass (horizontal) ══
 *
 * The lower row is the EXACT mirror of the upper: each pair is built once from its
 * +b representative and reflected across y=0 (holder scale.y=−1), a correct
 * embedding of the −b partner. The two self-conjugate forms (2-torsion: identity
 * and order 2) are the real roots ±1, fixed points of the reflection, on the axis.
 *
 * FOUR control groups — one tab each, a faithful copy of the gallery Curve tab
 * (lobes / skew / k / point color / point size / Cayley / pose / scale / fibers).
 * A pair tab drives BOTH its tori identically, so they stay exact mirrors. Save
 * writes gallery/p107/piece.json; the piece boots back into the saved state.
 */
import * as THREE from 'three'

import { type CayleyBasis, type ColorMode, CurveScene, type CurveSceneOptions } from '@/author'
import { glass, matte } from '@/geometry'
import { parseCurveDescriptors } from '@/io'
import {
  App,
  ControlPanel,
  type ExportControlsHandle,
  STUDIOS,
  addExportControls,
  addStudioControls,
  bright,
  colored,
  dark,
} from '@/studio'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
const baseOpts: CurveSceneOptions = { curves, k: 1, colorMode: 'degree', pointRadius: 0.04 }
const DEFAULT_COLOR = 0xd43b3b

// ── gallery-donut constants + helpers (copied from show-piece.ts) ────────────
const LOBE_OPTIONS = [
  { label: 'auto', value: 'auto' },
  ...Array.from({ length: 20 }, (_, i) => i + 1).map((n) => ({ label: String(n), value: String(n) })),
]
const COLOR_MODES = [
  { label: 'Subfield', value: 'degree' },
  { label: 'Uniform', value: 'uniform' },
]
const CAYLEY_EDGES = [
  { label: 'Off', value: 'off' },
  { label: 'g₁ (green)', value: 'g1' },
  { label: 'g₂ (purple)', value: 'g2' },
  { label: 'Both', value: 'both' },
]
const CAYLEY_BASES = [
  { label: 'Reduced', value: 'reduced' },
  { label: 'Structure', value: 'structure' },
]
function kOptions(maxK: number): { label: string; value: string }[] {
  return Array.from({ length: Math.max(maxK, 1) }, (_, j) => ({ label: String(j + 1), value: String(j + 1) }))
}
const cayleyValue = (c: number[]): string =>
  c.length === 0 ? 'off' : c.length === 2 ? 'both' : c[0] === 0 ? 'g1' : 'g2'
const cayleyFromValue = (v: string): number[] => (v === 'off' ? [] : v === 'g1' ? [0] : v === 'g2' ? [1] : [0, 1])
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`
const parseHex = (h: string): number => parseInt(h.replace(/^#/, ''), 16)

const app = new App()

interface Member {
  vx: number // unit hexagon coords (× hexagon radius)
  vy: number
  reflect: boolean
}
interface Unit {
  name: string
  label: string
  scenes: CurveScene[]
  holders: THREE.Group[]
  members: Member[]
  params: { scale: number; pointRadius: number; color: number }
}
const units: Unit[] = []

function makeUnit(name: string, label: string, curveIdx: number, members: Member[]): Unit {
  const scenes: CurveScene[] = []
  const holders: THREE.Group[] = []
  for (const m of members) {
    const scene = new CurveScene({ ...baseOpts, curve: curveIdx })
    scene.torus.setMaterial(matte(0xdde3ea))
    if (m.reflect) {
      // reflected copy → point spheres DoubleSide (matte already is) so flipped
      // winding shades correctly under path trace
      const mesh = (scene.points as unknown as { mesh: THREE.InstancedMesh }).mesh
      ;(mesh.material as THREE.Material).side = THREE.DoubleSide
    }
    const holder = new THREE.Group()
    holder.add(scene.group)
    app.stage.add(holder)
    scenes.push(scene)
    holders.push(holder)
  }
  const unit: Unit = { name, label, scenes, holders, members, params: { scale: 1, pointRadius: 0.04, color: DEFAULT_COLOR } }
  units.push(unit)
  return unit
}

// sixth roots of unity ζ^k; reflection is complex conjugation across the real
// axis (y=0), so a pair's two members are a vertex and its y-mirror.
const H = Math.sqrt(3) / 2 // sin 60° — the ±imaginary height of ζ¹,ζ²,ζ⁴,ζ⁵
makeUnit('order 6', '(5,±4,6)', 0, [
  { vx: 0.5, vy: H, reflect: false }, // (5,4,6)  upper-right  ζ¹
  { vx: 0.5, vy: -H, reflect: true }, // (5,-4,6) lower-right  ζ⁵ = reflection across y=0
])
makeUnit('order 3', '(3,±2,9)', 1, [
  { vx: -0.5, vy: H, reflect: false }, // (3,2,9)  upper-left  ζ²
  { vx: -0.5, vy: -H, reflect: true }, // (3,-2,9) lower-left  ζ⁴ = reflection across y=0
])
makeUnit('identity', '(1,0,26)', 2, [{ vx: 1, vy: 0, reflect: false }]) // ζ⁰=(1,0), right, on the real axis
makeUnit('order 2', '(2,0,13)', 3, [{ vx: -1, vy: 0, reflect: false }]) // ζ³=(−1,0), left, on the real axis

// glass plate: thin box on the symmetry plane x=0, only between the columns
const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass(0xbfe3ff))
app.stage.add(plate)

const TARGET = 1.5 // common radius when sizes are equalized
const state = { rh: 4, equalize: true, glassW: 1.3, glassD: 4, thick: 0.12, glassTilt: 0 }

/** Reposition + rescale everything; does NOT touch the camera (see Reframe). */
function layout(): void {
  for (const unit of units) {
    unit.scenes.forEach((scene, i) => {
      scene.torus.geometry.computeBoundingSphere()
      const r = scene.torus.geometry.boundingSphere?.radius ?? 1
      const s = (state.equalize ? TARGET / r : 1) * unit.params.scale
      const m = unit.members[i]!
      unit.holders[i]!.scale.set(s, m.reflect ? -s : s, s) // reflection is across y=0 (the real axis)
      unit.holders[i]!.position.set(m.vx * state.rh, m.vy * state.rh, 0)
    })
  }
  // horizontal glass slab on the real axis: x=width, y=thin, z=depth
  plate.scale.set(state.glassW * state.rh, state.thick, state.glassD)
  plate.rotation.set(state.glassTilt, 0, 0) // pitch about the horizontal axis — tilt toward the viewer
  app.invalidate()
}

// ── save / load: the whole scene as one JSON, round-tripped through piece.json ─
let exportHandle: ExportControlsHandle | null = null

interface SavedUnit {
  scale: number
  pointRadius: number
  color: number
  lobes: number | null
  skew: number
  k: number
  colorMode: ColorMode
  degreeColors: Record<number, number>
  fibers: number
  cayley: string
  cayleyBasis: CayleyBasis
  view: { alpha: number; beta: number; gamma: number; pole: number }
}
interface SavedPiece {
  scene?: Partial<typeof state>
  units?: SavedUnit[]
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
    units: units.map((u) => {
      const s = u.scenes[0]!
      return {
        scale: u.params.scale,
        pointRadius: u.params.pointRadius,
        color: u.params.color,
        lobes: s.lobes,
        skew: s.skew,
        k: s.k,
        colorMode: s.colorMode,
        degreeColors: s.degreeColors,
        fibers: s.fibers,
        cayley: cayleyValue(s.cayley as number[]),
        cayleyBasis: s.cayleyBasis,
        view: s.view,
      }
    }),
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
  if (piece.scene) Object.assign(state, piece.scene)
  piece.units?.forEach((u, i) => {
    const unit = units[i]
    if (!unit) return
    unit.params.scale = u.scale ?? 1
    unit.params.pointRadius = u.pointRadius ?? 0.04
    unit.params.color = u.color ?? DEFAULT_COLOR
    for (const s of unit.scenes) {
      if (u.k !== undefined) s.setK(u.k)
      if (u.lobes !== undefined) s.setLobes(u.lobes)
      if (u.skew !== undefined) s.setSkew(u.skew)
      if (u.colorMode !== undefined) s.setColorMode(u.colorMode)
      if (u.color !== undefined) s.setColor(u.color)
      if (u.degreeColors) for (const [d, hx] of Object.entries(u.degreeColors)) s.setDegreeColor(Number(d), hx)
      if (u.fibers !== undefined) s.setFibers(u.fibers)
      if (u.cayleyBasis !== undefined) s.setCayleyBasis(u.cayleyBasis)
      if (u.cayley !== undefined) s.setCayley(cayleyFromValue(u.cayley))
      if (u.view) s.setView(u.view)
      s.points.setBaseRadius(unit.params.pointRadius)
    }
  })
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

// ── boot ──────────────────────────────────────────────────────────────────
// Position the tori FIRST (as showPiece calls applyLayout before setStudio), so
// the studio compiles its lights against the real, spread-out bounds — not the
// origin cluster the holders start at. Otherwise the lights are sized for a tiny
// scene and the spread tori fall outside their range → nearly black in trace.
if (savedPiece) applyScene(savedPiece)
layout()
let studioHandle = app.setStudio((savedPiece?.studio && STUDIOS[savedPiece.studio]) || colored)
app.setBackground(0x28537b)
app.frame() // fit camera + floor to the laid-out scene
if (savedPiece?.camera) applyCamera(savedPiece.camera)
if (savedPiece?.look) applyLook(savedPiece.look)
app.start()

// ── controls ────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'p107 · ℤ/6', width: 460 })

const sceneTab = panel.tab('Scene')
sceneTab.slider('Hexagon radius', { min: 2.5, max: 8, step: 0.1, value: state.rh }, (v) => {
  state.rh = v
  layout()
})
sceneTab.toggle('Equalize sizes', state.equalize, (v) => {
  state.equalize = v
  layout()
})
sceneTab.slider('Glass width', { min: 0.5, max: 2.4, step: 0.05, value: state.glassW }, (v) => {
  state.glassW = v
  layout()
})
sceneTab.slider('Glass depth', { min: 1, max: 8, step: 0.25, value: state.glassD }, (v) => {
  state.glassD = v
  layout()
})
sceneTab.slider('Glass thickness', { min: 0.02, max: 0.5, step: 0.02, value: state.thick }, (v) => {
  state.thick = v
  layout()
})
sceneTab.slider('Glass tilt', { min: -0.8, max: 0.8, step: 0.01, value: state.glassTilt }, (v) => {
  state.glassTilt = v
  layout()
})
sceneTab.button('Reframe', () => app.frame())
sceneTab.button('Path trace', () => {
  app.mode = app.mode === 'trace' ? 'live' : 'trace'
  app.invalidate()
})
const saveStatus = sceneTab.label('', '')
sceneTab.button('Save', () => {
  void (async () => {
    try {
      const res = await fetch('/api/save-piece?demo=p107', {
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

for (const unit of units) buildUnitTab(unit)

addStudioControls(panel, app, studioHandle, {
  renderName: 'p107',
  capture: false, // capture lives in the Export tab, like the rest of the gallery
  studios: [colored, bright, dark],
  onStudioChange: (h) => {
    studioHandle = h
    app.setBackground(0x28537b)
    layout()
  },
})

exportHandle = addExportControls(panel, app, {
  renderName: 'p107',
  ...(savedPiece?.export?.aspect !== undefined ? { aspect: savedPiece.export.aspect } : {}),
  ...(savedPiece?.export?.longEdge !== undefined ? { longEdge: savedPiece.export.longEdge } : {}),
  onHighRes: (on) => {
    for (const unit of units) for (const s of unit.scenes) s.setHighRes(on)
    app.invalidate()
  },
  sidecar: () => ({ piece: serialize() }),
})

panel.mount(document.body)

// ── the per-unit tab: a faithful copy of the gallery Curve tab, driving BOTH
//    members of a pair at once so they stay exact mirrors ──────────────────────
function buildUnitTab(unit: Unit): void {
  const t = panel.tab(unit.name)
  const s0 = unit.scenes[0]!
  const each = (fn: (s: CurveScene) => void) => (unit.scenes.forEach(fn), layout()) // size may change → relayout
  const touch = (fn: (s: CurveScene) => void) => (unit.scenes.forEach(fn), app.invalidate()) // no size change
  t.label('Forms', unit.label)

  // ── Complex curve: the Hopf torus shape ──
  t.section('Complex curve')
  t.dropdown('Lobes n', { options: LOBE_OPTIONS, value: s0.lobes === null ? 'auto' : String(s0.lobes) }, (v) =>
    each((s) => s.setLobes(v === 'auto' ? null : Number(v))),
  )
  t.slider('Skew (twist)', { min: 0, max: 0.4, step: 0.005, value: s0.skew }, (v) => each((s) => s.setSkew(v)))

  // ── Finite curve: the points laid on the torus ──
  t.section('Finite curve')
  let refreshColorUI = (): void => {}
  const kDrop = t.dropdown('k (point field)', { options: kOptions(s0.maxK), value: String(s0.k) }, (v) => {
    let applied = Number(v)
    unit.scenes.forEach((s) => (applied = s.setK(Number(v))))
    if (applied !== Number(v)) kDrop.set(String(applied))
    refreshColorUI()
    layout()
  })
  const colorModeDrop = t.dropdown('Point color', { options: COLOR_MODES, value: s0.colorMode }, (v) => {
    touch((s) => s.setColorMode(v as ColorMode))
    refreshColorUI()
  })
  const uniformPicker = t.color('Uniform color', hex(unit.params.color), (h) => {
    unit.params.color = parseHex(h)
    touch((s) => s.setColor(parseHex(h)))
  })
  const subfieldPickers = new Map<number, ReturnType<typeof t.color>>()
  for (let d = s0.maxK; d >= 1; d--) {
    const label = d === 1 ? 'F_p pts' : `F_p^${d} pts`
    subfieldPickers.set(
      d,
      t.color(label, hex(s0.degreeColor(d)), (h) => touch((s) => s.setDegreeColor(d, parseHex(h)))),
    )
  }
  refreshColorUI = () => {
    const present = new Set(s0.degrees)
    uniformPicker.row.style.display = s0.colorMode === 'uniform' ? '' : 'none'
    for (const [d, pick] of subfieldPickers) {
      pick.row.style.display = s0.colorMode === 'degree' && present.has(d) ? '' : 'none'
      pick.set(hex(s0.degreeColor(d)))
    }
  }
  refreshColorUI()
  void colorModeDrop
  t.slider('Point size', { min: 0.005, max: 0.12, step: 0.005, value: unit.params.pointRadius }, (v) => {
    unit.params.pointRadius = v
    touch((s) => s.points.setBaseRadius(v))
  })
  t.dropdown('Cayley edges', { options: CAYLEY_EDGES, value: cayleyValue(s0.cayley as number[]) }, (v) =>
    touch((s) => s.setCayley(cayleyFromValue(v))),
  )
  t.dropdown('Cayley basis', { options: CAYLEY_BASES, value: s0.cayleyBasis }, (v) =>
    touch((s) => s.setCayleyBasis(v as CayleyBasis)),
  )

  // ── Positioning: rotate the S³ torus, then scale in ℝ³ ──
  t.section('Positioning')
  const pose = (name: 'alpha' | 'beta' | 'gamma' | 'pole', label: string, max: number) =>
    t.slider(label, { min: 0, max, step: 0.01, value: s0.view[name] }, (v) => touch((s) => s.setView({ [name]: v })))
  pose('alpha', 'Pose α', 2 * Math.PI)
  pose('beta', 'Pose β', 2 * Math.PI)
  pose('gamma', 'Pose γ', Math.PI)
  pose('pole', 'Pole tilt', Math.PI)
  t.slider('Scale', { min: 0.1, max: 5, step: 0.05, value: unit.params.scale }, (v) => {
    unit.params.scale = v
    layout()
  })

  // ── Fibers ──
  t.section('Fibers')
  t.slider('Fibers', { min: 0, max: 24, step: 1, value: s0.fibers }, (v) => touch((s) => s.setFibers(v)))
}

export {}
