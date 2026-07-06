/**
 * catalog-lifts — draw ANY curve in the shared catalog. The collection is
 * data/curves.json (Nadir's export format, spec in data/EXPORT.md): drop new
 * records there and they appear in the Curve menu, validated on load.
 *
 * Panel layout (Steve's spec):
 *   Curve    — curve choice, symmetry n (paper family / auto solver),
 *              field extension, and the group readout
 *   Scene    — studio preset, camera rig + S³ pose, point size/color, surface
 *   Renderer — path-trace button (prominent), quality knobs, screenshot,
 *              save scene data (JSON)
 *
 * Scriptable: ?curve=N&k=M&n=L&rig=top|threequarter&trace=1&blocktrace=S.
 */
import { CURVES, CurveScene, decodeParams, maxFeasibleK } from '@/author'
import { PALETTES, glass, solidSurface } from '@/geometry'
import { tauOf } from '@/math/arithmetic'
import { type PaperFamilySolution, solvePaperFamily } from '@/math/families'
import { App, ControlPanel, STUDIOS, addTraceControls, bridgesPaper, downloadBlob, saveScreenshot } from '@/studio'

const MAX_POINTS = 20000
const url = decodeParams(location.search)

// ── state ───────────────────────────────────────────────────────────────────
let curveIdx = url.curve ?? 0
let k = url.k ?? 2
let rig: 'top' | 'threequarter' = url.rig === 'threequarter' ? 'threequarter' : 'top'
let studioName = 'bridges-paper'
let pointRadius: number | null = null // null = auto by point count
let currentPointColor: number // set at boot; resets to the palette on curve change
let surfaceKind: 'glass' | 'opaque' = 'opaque'
let surfaceColor = 0xc9eaff

// Symmetry (lobe count). Default 'auto' follows THE PAPER'S OWN IMPLICIT LAW:
// n = 4·Im(τ)² reproduces its hand choices exactly (disc −3→3, −7→7, −11→11,
// −20→5) — big lattices get many lobes, small ones few. Skew a = 0.8/n
// (also the paper's law). Rectangular classes ignore n (latitude circles).
let symmetry: 'auto' | number = url.n ?? 'auto'
// capped at 24: beyond that the extreme flat tori (Im τ ≳ 2.5) break framing
// and near-pole handling before lobe count is the issue
const defaultN = (im: number) => Math.min(24, Math.max(2, Math.round(4 * im * im)))
const effectiveN = () =>
  symmetry === 'auto' ? defaultN(tauOf(CURVES[curveIdx]!.data.form).im) : symmetry

const familyCache = new Map<string, PaperFamilySolution | null>()

function familySolution(): PaperFamilySolution | null {
  const n = effectiveN()
  const lc = CURVES[curveIdx]!
  const key = `${lc.label}|${n}`
  if (!familyCache.has(key)) {
    // large n needs enough samples to resolve the lobes spectrally
    const samples = Math.max(256, 16 * n)
    familyCache.set(key, solvePaperFamily(tauOf(lc.data.form), n, { a: 0.8 / n, samples }))
  }
  return familyCache.get(key)!
}

// the paper's two camera rigs
const CAMERA_RIGS = {
  top: { azimuth: 2.36, elevation: 1.556, fill: 0.72, fov: 50 },
  threequarter: { azimuth: 2.94, elevation: 0.41, fill: 0.72, fov: 50 },
}

const colorFor = (i: number) => PALETTES.classic[i % PALETTES.classic.length]!.getHex()
/** ≈ the paper's hand radius ladder: shrink with point count, capped. */
const autoRadius = (count: number) => Math.min(0.06, 1.3 / Math.sqrt(count))
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// ── scene ───────────────────────────────────────────────────────────────────
const app = new App()
const scene = new CurveScene({
  curves: CURVES,
  curve: curveIdx,
  k,
  colorMode: 'uniform',
  color: colorFor(curveIdx),
  subfieldBoost: false,
  maxPoints: MAX_POINTS,
  onChange: () => app.invalidate(),
})
app.stage.add(scene.group)
scene.group.rotation.x = -Math.PI / 2 // torus parallel to the floor

function applySurface(): void {
  scene.torus.setMaterial(surfaceKind === 'glass' ? glass(surfaceColor) : solidSurface(surfaceColor))
}

function apply(): void {
  // Symmetry n (τ-derived when 'auto'): wall classes get the paper family
  // (b solved from τ); other classes pin the general solver's lobe count.
  // ONE update = ONE ladder run, whatever the interaction changed.
  const sol = familySolution()
  scene.update({
    curve: curveIdx,
    k,
    lobes: sol ? null : effectiveN(),
    profile: sol?.curve ?? null,
    color: currentPointColor,
  })
  k = scene.k // update() clamps k to the feasible range
  scene.points.setBaseRadius(pointRadius ?? autoRadius(scene.scene.E.size))
  sizeSlider.set(pointRadius ?? autoRadius(scene.scene.E.size))
  applySurface()
  updateInfo()
  app.frame(CAMERA_RIGS[rig])
  app.invalidate()
}

const panel = new ControlPanel({ title: 'catalog lifts' })

// ═══ Curve ═══════════════════════════════════════════════════════════════
const curveTab = panel.tab('Curve')

const kOptions = () => {
  const kMax = maxFeasibleK(CURVES[curveIdx]!.data, MAX_POINTS)
  return Array.from({ length: kMax }, (_, i) => ({ value: String(i + 1), label: `F_p^${i + 1}` }))
}

curveTab.dropdown(
  'Curve',
  { options: CURVES.map((c, i) => ({ label: c.label, value: String(i) })), value: String(curveIdx) },
  (v) => {
    curveIdx = Number(v)
    currentPointColor = colorFor(curveIdx)
    pointColor.set(hex(currentPointColor))
    apply()
    kDropdown.setOptions(kOptions(), String(k))
  },
)

curveTab.dropdown(
  'Symmetry n',
  {
    options: [
      { label: 'auto — n = 4·Im(τ)²', value: 'auto' },
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 24].map((n) => ({ label: `${n}-fold`, value: String(n) })),
    ],
    value: symmetry === 'auto' ? 'auto' : String(symmetry),
  },
  (v) => {
    symmetry = v === 'auto' ? 'auto' : Number(v)
    apply()
  },
)

const kDropdown = curveTab.dropdown('Field extension', { options: kOptions(), value: String(k) }, (v) => {
  k = Number(v)
  apply()
})

const groupLabel = curveTab.label('Group')

function updateInfo(): void {
  const E = scene.scene.E
  const [n1, n2] = E.structure
  groupLabel.set(n1 > 1 ? `E ≅ ℤ/${n1} ⊕ ℤ/${n2} · ${E.size} points` : `E ≅ ℤ/${n2} · ${E.size} points`)
}

// ═══ Scene ═══════════════════════════════════════════════════════════════
const sceneTab = panel.tab('Scene')

app.setStudio(bridgesPaper)
sceneTab.dropdown(
  'Studio',
  { options: Object.keys(STUDIOS).map((s) => ({ label: s, value: s })), value: studioName },
  (v) => {
    studioName = v
    app.setStudio(STUDIOS[v]!)
    app.frame(CAMERA_RIGS[rig])
    app.invalidate()
  },
)

sceneTab.dropdown(
  'View',
  {
    options: [
      { label: 'top-down (dense)', value: 'top' },
      { label: 'three-quarter (hero)', value: 'threequarter' },
    ],
    value: rig,
  },
  (v) => {
    rig = v as typeof rig
    app.frame(CAMERA_RIGS[rig])
    app.invalidate()
  },
)

const sizeSlider = sceneTab.slider(
  'Point size',
  { min: 0.004, max: 0.12, step: 0.002, value: autoRadius(scene.scene.E.size) },
  (v) => {
    pointRadius = v
    scene.points.setBaseRadius(v)
    app.invalidate()
  },
)

currentPointColor = colorFor(curveIdx)
const pointColor = sceneTab.color('Point color', hex(currentPointColor), (h) => {
  currentPointColor = parseInt(h.slice(1), 16)
  scene.setColor(currentPointColor)
})

sceneTab.dropdown(
  'Surface',
  {
    options: [
      { label: 'opaque', value: 'opaque' },
      { label: 'glass', value: 'glass' },
    ],
    value: surfaceKind,
  },
  (v) => {
    surfaceKind = v as typeof surfaceKind
    applySurface()
    app.invalidate()
  },
)

sceneTab.color('Surface color', hex(surfaceColor), (h) => {
  surfaceColor = parseInt(h.slice(1), 16)
  applySurface()
  app.invalidate()
})

const pose = (name: 'alpha' | 'beta' | 'gamma' | 'pole', label: string, max: number) =>
  sceneTab.slider(label, { min: 0, max, step: 0.01, value: url[name] ?? 0 }, (v) => scene.setView({ [name]: v }))
pose('alpha', 'Pose α', 2 * Math.PI)
pose('beta', 'Pose β', 2 * Math.PI)
pose('gamma', 'Pose γ', Math.PI)
pose('pole', 'Pole tilt', Math.PI)
scene.setView({ alpha: url.alpha ?? 0, beta: url.beta ?? 0, gamma: url.gamma ?? 0, pole: url.pole ?? 0 })

// ═══ Renderer ═══════════════════════════════════════════════════════════
const renderTab = panel.tab('Renderer')

const traceBtn = renderTab.button('▶  PATH TRACE', () => {
  if (app.mode === 'trace') {
    app.mode = 'live'
    traceBtn.setLabel('▶  PATH TRACE')
    samplesLabel.set('—')
  } else {
    app.mode = 'trace'
    traceBtn.setLabel('■  STOP — back to live')
  }
})
traceBtn.el.style.fontWeight = '700'
traceBtn.el.style.letterSpacing = '0.04em'

const samplesLabel = renderTab.label('Samples', '—')
app.trace.onProgress = (s) => samplesLabel.set(String(s))

addTraceControls(renderTab, app)
renderTab.slider('Exposure', { min: 0.2, max: 3, step: 0.05, value: app.renderer.toneMappingExposure }, (v) => {
  app.renderer.toneMappingExposure = v
})

renderTab.button('Screenshot (PNG)', () => void saveScreenshot(app, `${slug()}.png`))

renderTab.button('Save scene data (JSON)', () => {
  const lc = CURVES[curveIdx]!
  const sol = familySolution()
  const data = {
    curve: { label: lc.label, p: String(lc.data.p), trace: String(lc.data.trace), form: describeForm() },
    k,
    symmetry: symmetry === 'auto' ? `auto (n=${effectiveN()})` : symmetry,
    ...(sol ? { paperFamily: { a: sol.a, b: sol.b, n: sol.n } } : {}),
    pointColor: hex(currentPointColor),
    pointRadius: pointRadius ?? autoRadius(scene.scene.E.size),
    surface: { kind: surfaceKind, color: hex(surfaceColor) },
    studio: studioName,
    rig,
    pose: scene.view,
    samples: app.samples,
  }
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${slug()}-scene.json`)
})

function describeForm(): string {
  const { a, b, c } = CURVES[curveIdx]!.data.form
  return `(${a},${b},${c})`
}
function slug(): string {
  return CURVES[curveIdx]!.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── boot ────────────────────────────────────────────────────────────────────
panel.mount(document.body)
apply()
if (url.trace) {
  app.mode = 'trace'
  traceBtn.setLabel('■  STOP — back to live')
}
if (url.blocktrace !== undefined) app.stepTrace(url.blocktrace)
app.start()

export {}
