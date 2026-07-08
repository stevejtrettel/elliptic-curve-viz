/**
 * p23 — the conductor-11 curve over F₂₃ (trace −1, disc −91): the TWO forms of
 * the class group, staggered in depth. Both are self-conjugate (ambiguous
 * forms), so there is no mirror pair — just two independent CM tori of the same
 * discriminant, very different in shape:
 *   (5,3,5)  |τ|=1, Im τ ≈ 0.95 — compact & round → placed in FRONT
 *   (1,1,23) Im τ ≈ 4.77        — tall & wavy      → behind, offset left/right
 *
 * Shared "p-torus" style (as p107): dark subfield-shaded points, a colored back
 * wall (no floor), surface toggle. Warm front / cool back reinforces the depth.
 * Save writes gallery/p23/piece.json; the piece boots back into the saved state.
 */
import * as THREE from 'three'

import { type CayleyBasis, type ColorMode, CurveScene, type CurveSceneOptions } from '@/author'
import { matte } from '@/geometry'
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
const baseOpts: CurveSceneOptions = { curves, k: 2, colorMode: 'degree', pointRadius: 0.04 }
const DEFAULT_COLOR = 0xd43b3b
const WALL_BG = 0x0d0d0d // near-black back wall — the shared "p-torus" vibe (as p107)

// ── gallery-donut constants + helpers ────────────────────────────────────────
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

// ── OKLCH color: perceptually even hues; subfield points darker shades ────────
const PAL_C = 0.15 // chroma of the full-field points
const SUBFIELD_SAT = 0.1 // extra chroma for subfield points
const BASE_HUE = [200, 40] // (1,1,23) cool/back, (5,3,5) warm/front — warm advances

function oklchHex(L: number, C: number, hDeg: number): number {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  const enc = (x: number): number => {
    const c = Math.max(0, Math.min(1, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  const r = Math.round(enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255)
  const g = Math.round(enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255)
  const bl = Math.round(enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255)
  return (r << 16) | (g << 8) | bl
}
function hueOf(colorHex: number): number {
  const dec = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const r = dec((colorHex >> 16) & 255)
  const g = dec((colorHex >> 8) & 255)
  const b = dec(colorHex & 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return h
}
/** A shade of `baseHex`'s hue: full-field points (frac=1) at the palette
 *  lightness, subfield points (frac<1) progressively darker + more saturated. */
function shade(baseHex: number, frac: number): number {
  const L = state.pointL - (1 - frac) * state.subfieldDark
  const C = PAL_C + (1 - frac) * SUBFIELD_SAT
  return oklchHex(Math.max(0.05, L), C, hueOf(baseHex))
}

const app = new App()

interface Unit {
  name: string
  label: string
  scene: CurveScene
  holder: THREE.Group
  params: { scale: number; pointRadius: number; color: number; res: number }
}
const units: Unit[] = []

function makeUnit(name: string, label: string, curveIdx: number, res: number): Unit {
  const scene = new CurveScene({ ...baseOpts, curve: curveIdx })
  scene.torus.setMaterial(matte(0xdde3ea))
  const holder = new THREE.Group()
  holder.add(scene.group)
  app.stage.add(holder)
  const unit: Unit = { name, label, scene, holder, params: { scale: 1, pointRadius: 0.04, color: DEFAULT_COLOR, res } }
  units.push(unit)
  return unit
}
// the tall/wavy (1,1,23) carries ~5 lobes → needs a MUCH finer grid than the
// round (5,3,5); per-unit resolution so each torus is sampled to its own detail.
makeUnit('(1,1,23)', 'disc −91 · (1,1,23) — tall/wavy', 0, 1536) // back — wavy, high res
makeUnit('(5,3,5)', 'disc −91 · (5,3,5) — round/compact', 1, 384) // front — round

const TARGET = 1.5 // common radius when sizes are equalized
const state = {
  equalize: true,
  sep: 4, // front↔back depth separation (z)
  stagger: 3, // left↔right offset (x)
  lift: 0, // vertical offset of the back torus relative to the front (y)
  backRot: { x: 0, y: 0, z: 0 }, // rigid ℝ³ reorientation (Euler) of the back torus
  swap: false, // false → (5,3,5) in front
  wallOn: true,
  wallDist: 3,
  wallW: 120, // large enough to fill the frame so the flat background never shows
  wallH: 80,
  pointL: 0.62,
  subfieldDark: 0.34,
  surfaceOn: true,
}

/** Reposition + rescale everything; does NOT touch the camera (see Reframe). */
function layout(): void {
  const frontIdx = state.swap ? 0 : 1 // (5,3,5) is units[1]
  units.forEach((unit, ui) => {
    unit.scene.torus.geometry.computeBoundingSphere()
    const r = unit.scene.torus.geometry.boundingSphere?.radius ?? 1
    const s = (state.equalize ? TARGET / r : 1) * unit.params.scale
    unit.holder.scale.setScalar(s)
    const front = ui === frontIdx
    unit.holder.position.set(front ? state.stagger / 2 : -state.stagger / 2, front ? 0 : state.lift, front ? state.sep / 2 : -state.sep / 2)
    // rigid ℝ³ reorientation: only the back torus turns; the front stays upright
    if (front) unit.holder.rotation.set(0, 0, 0)
    else unit.holder.rotation.set(state.backRot.x, state.backRot.y, state.backRot.z)
  })
  app.invalidate()
}

// ── save / load ──────────────────────────────────────────────────────────────
let exportHandle: ExportControlsHandle | null = null

interface SavedUnit {
  scale: number
  pointRadius: number
  color: number
  res: number
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
      const s = u.scene
      return {
        scale: u.params.scale,
        pointRadius: u.params.pointRadius,
        color: u.params.color,
        res: u.params.res,
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
    if (u.res !== undefined) unit.params.res = u.res
    const s = unit.scene
    if (u.k !== undefined) s.setK(u.k)
    if (u.lobes !== undefined) s.setLobes(u.lobes)
    if (u.skew !== undefined) s.setSkew(u.skew)
    if (u.colorMode !== undefined) s.setColorMode(u.colorMode)
    if (u.degreeColors) for (const [d, hx] of Object.entries(u.degreeColors)) s.setDegreeColor(Number(d), hx)
    if (u.fibers !== undefined) s.setFibers(u.fibers)
    if (u.cayleyBasis !== undefined) s.setCayleyBasis(u.cayleyBasis)
    if (u.cayley !== undefined) s.setCayley(cayleyFromValue(u.cayley))
    if (u.view) s.setView(u.view)
    s.points.setBaseRadius(unit.params.pointRadius)
    applyUnitColor(unit)
  })
}

/** Color a unit in its current mode: Subfield (degree) = base-hue shades that
 *  darken over subfields; Uniform = one flat color. */
function applyUnitColor(unit: Unit): void {
  const base = unit.params.color
  const s = unit.scene
  if (s.colorMode === 'uniform') {
    s.setColorMode('uniform')
    s.setColor(base)
  } else {
    s.setColorMode('degree')
    for (const d of s.degrees) s.setDegreeColor(d, shade(base, d / Math.max(1, s.k)))
  }
  app.invalidate()
}

/** Show/hide the torus surfaces (the white shells the points sit on). */
function applySurfaces(): void {
  for (const u of units) u.scene.torus.visible = state.surfaceOn
  app.invalidate()
}

function applyRes(): void {
  for (const u of units) u.scene.torus.setResolution(u.params.res, u.params.res)
  app.invalidate()
}

/** Two distinct hues (warm front / cool back), subfield-shaded. */
function applyPalette(): void {
  units.forEach((unit, i) => {
    unit.params.color = oklchHex(state.pointL, PAL_C, BASE_HUE[i] ?? 0)
    applyUnitColor(unit)
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

// ── boot (position first so the studio lights size to the real scene) ─────────
if (savedPiece) applyScene(savedPiece)
layout()
applySurfaces()
applyRes()
let studioHandle = app.setStudio((savedPiece?.studio && STUDIOS[savedPiece.studio]) || colored)
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

app.frame()
placeWall()
if (savedPiece?.camera) applyCamera(savedPiece.camera)
if (savedPiece?.look) applyLook(savedPiece.look)
if (!savedPiece) applyPalette()
app.start()

// ── controls ──────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'p23 · disc −91', width: 460 })

const sceneTab = panel.tab('Scene')
sceneTab.slider('Separation (front↔back)', { min: 0, max: 12, step: 0.1, value: state.sep }, (v) => {
  state.sep = v
  layout()
})
sceneTab.slider('Stagger (left↔right)', { min: -10, max: 10, step: 0.1, value: state.stagger }, (v) => {
  state.stagger = v
  layout()
})
sceneTab.slider('Lift back (up↕down)', { min: -8, max: 8, step: 0.1, value: state.lift }, (v) => {
  state.lift = v
  layout()
})
sceneTab.slider('Back rotate X', { min: 0, max: 2 * Math.PI, step: 0.01, value: state.backRot.x }, (v) => {
  state.backRot.x = v
  layout()
})
sceneTab.slider('Back rotate Y', { min: 0, max: 2 * Math.PI, step: 0.01, value: state.backRot.y }, (v) => {
  state.backRot.y = v
  layout()
})
sceneTab.slider('Back rotate Z', { min: 0, max: 2 * Math.PI, step: 0.01, value: state.backRot.z }, (v) => {
  state.backRot.z = v
  layout()
})
sceneTab.toggle('Swap front/back', state.swap, (v) => {
  state.swap = v
  layout()
})
sceneTab.toggle('Equalize sizes', state.equalize, (v) => {
  state.equalize = v
  layout()
})
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
  app.frame()
  placeWall()
})
sceneTab.button('Palette', () => applyPalette())
sceneTab.slider('Point lightness', { min: 0.4, max: 0.85, step: 0.01, value: state.pointL }, (v) => {
  state.pointL = v
  for (const unit of units) applyUnitColor(unit)
})
sceneTab.slider('Subfield darkening', { min: 0, max: 0.5, step: 0.01, value: state.subfieldDark }, (v) => {
  state.subfieldDark = v
  for (const unit of units) applyUnitColor(unit)
})
sceneTab.toggle('Torus surfaces', state.surfaceOn, (v) => {
  state.surfaceOn = v
  applySurfaces()
})
sceneTab.button('Path trace', () => {
  app.mode = app.mode === 'trace' ? 'live' : 'trace'
  app.invalidate()
})
const saveStatus = sceneTab.label('', '')
sceneTab.button('Save', () => {
  void (async () => {
    try {
      const res = await fetch('/api/save-piece?demo=p23', {
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
  renderName: 'p23',
  capture: false,
  studios: [colored, bright, dark],
  onStudioChange: (h) => {
    studioHandle = h
    app.setBackground(WALL_BG)
    layout()
    placeWall()
  },
})

exportHandle = addExportControls(panel, app, {
  renderName: 'p23',
  ...(savedPiece?.export?.aspect !== undefined ? { aspect: savedPiece.export.aspect } : {}),
  ...(savedPiece?.export?.longEdge !== undefined ? { longEdge: savedPiece.export.longEdge } : {}),
  onHighRes: (on) => {
    for (const u of units) u.scene.setHighRes(on)
    app.invalidate()
  },
  sidecar: () => ({ piece: serialize() }),
})

panel.mount(document.body)

// ── per-torus tab: the gallery Curve tab (lobes/skew/k/color/point/pose/…) ────
function buildUnitTab(unit: Unit): void {
  const t = panel.tab(unit.name)
  const s = unit.scene
  const each = (fn: (sc: CurveScene) => void) => (fn(s), layout()) // size may change → relayout
  const touch = (fn: (sc: CurveScene) => void) => (fn(s), app.invalidate()) // no size change
  t.label('Form', unit.label)

  t.section('Complex curve')
  t.dropdown('Lobes n', { options: LOBE_OPTIONS, value: s.lobes === null ? 'auto' : String(s.lobes) }, (v) =>
    each((sc) => sc.setLobes(v === 'auto' ? null : Number(v))),
  )
  t.slider('Skew (twist)', { min: 0, max: 0.4, step: 0.005, value: s.skew }, (v) => each((sc) => sc.setSkew(v)))

  t.section('Finite curve')
  let refreshColorUI = (): void => {}
  const kDrop = t.dropdown('k (point field)', { options: kOptions(s.maxK), value: String(s.k) }, (v) => {
    const applied = s.setK(Number(v))
    if (applied !== Number(v)) kDrop.set(String(applied))
    refreshColorUI()
    layout()
  })
  const colorModeDrop = t.dropdown('Point color', { options: COLOR_MODES, value: s.colorMode }, (v) => {
    s.setColorMode(v as ColorMode)
    applyUnitColor(unit)
    refreshColorUI()
  })
  void colorModeDrop
  const uniformPicker = t.color('Base color', hex(unit.params.color), (h) => {
    unit.params.color = parseHex(h)
    applyUnitColor(unit)
    refreshColorUI()
  })
  const subfieldPickers = new Map<number, ReturnType<typeof t.color>>()
  for (let d = s.maxK; d >= 1; d--) {
    const label = d === 1 ? 'F_p pts' : `F_p^${d} pts`
    subfieldPickers.set(
      d,
      t.color(label, hex(s.degreeColor(d)), (h) => touch((sc) => sc.setDegreeColor(d, parseHex(h)))),
    )
  }
  refreshColorUI = () => {
    const present = new Set(s.degrees)
    uniformPicker.row.style.display = s.colorMode === 'uniform' ? '' : 'none'
    for (const [d, pick] of subfieldPickers) {
      pick.row.style.display = s.colorMode === 'degree' && present.has(d) ? '' : 'none'
      pick.set(hex(s.degreeColor(d)))
    }
  }
  refreshColorUI()
  t.slider('Point size', { min: 0.005, max: 0.12, step: 0.005, value: unit.params.pointRadius }, (v) => {
    unit.params.pointRadius = v
    touch((sc) => sc.points.setBaseRadius(v))
  })
  t.dropdown('Cayley edges', { options: CAYLEY_EDGES, value: cayleyValue(s.cayley as number[]) }, (v) =>
    touch((sc) => sc.setCayley(cayleyFromValue(v))),
  )
  t.dropdown('Cayley basis', { options: CAYLEY_BASES, value: s.cayleyBasis }, (v) =>
    touch((sc) => sc.setCayleyBasis(v as CayleyBasis)),
  )

  t.section('Positioning')
  const pose = (name: 'alpha' | 'beta' | 'gamma' | 'pole', label: string, max: number) =>
    t.slider(label, { min: 0, max, step: 0.01, value: s.view[name] }, (v) => touch((sc) => sc.setView({ [name]: v })))
  pose('alpha', 'Pose α', 2 * Math.PI)
  pose('beta', 'Pose β', 2 * Math.PI)
  pose('gamma', 'Pose γ', Math.PI)
  pose('pole', 'Pole tilt', Math.PI)
  t.slider('Scale', { min: 0.1, max: 5, step: 0.05, value: unit.params.scale }, (v) => {
    unit.params.scale = v
    layout()
  })
  // per-torus mesh resolution — the wavy (1,1,23) wants a much finer grid than
  // the round (5,3,5); ceiling raised well past the old global 1024 for it.
  t.slider('Mesh resolution', { min: 128, max: 3072, step: 64, value: unit.params.res }, (v) => {
    unit.params.res = v
    unit.scene.torus.setResolution(v, v)
    app.invalidate()
  })

  t.section('Fibers')
  t.slider('Fibers', { min: 0, max: 24, step: 1, value: s.fibers }, (v) => touch((sc) => sc.setFibers(v)))
}

export {}
