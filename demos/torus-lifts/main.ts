/**
 * torus-lifts — the paper's figure family: a pulldown for the CURVE and a
 * pulldown for the FIELD EXTENSION F_{p^k}.
 *
 * WHERE EVERYTHING COMES FROM (both files in THIS folder):
 *   ./curves.json           the ARITHMETIC — exactly Nadir's export format
 *                           (spec: data/EXPORT.md): quadratic form (a,b,c),
 *                           trace a_p, prime p, sign per curve. Swap in his
 *                           export and the menu fills with the collection.
 *   ./presentation.json     OUR aesthetics, label → style: the paper's
 *                           profile-curve parameters {a,b,n} (specified, not
 *                           from ecfplat; curves without one are SOLVED from
 *                           τ by solveProfileCurve), discriminant color,
 *                           point radius per k, surface.
 *   src/io/descriptors.ts   validates both (Hasse bound, disc·f²).
 *   CurveScene              computes E(F_{p^k}) = ker(Frobᵏ − I) exactly,
 *                           injects the paper's profile curve (or solves for
 *                           one), rolls the points onto the Hopf torus in S³,
 *                           stereographically projects to R³.
 *   bridges-paper studio    the paper's world: white→grey gradient, one white
 *                           spot, clearcoat floor, ACES, 30 bounces.
 *
 * Scriptable: ?curve=N&k=M&rig=top|threequarter&alpha=…&trace=1&blocktrace=S.
 */
import { CurveScene, maxFeasibleK, paperProfile, paperRadius } from '@/author'
import { parseCurveDescriptors, parsePresentation } from '@/io'
import { tauOf } from '@/math/arithmetic'
import { colored, glass } from '@/geometry'
import { App, ControlPanel, addStudioControls, addStudioDesign, bridgesPaper } from '@/studio'

import rawCurves from './curves.json'
import rawPresentation from './presentation.json'

// the collection THIS demo shows: arithmetic (Nadir's format) + our styling
const PRESENTATION = parsePresentation(rawPresentation)
const CURVES = parseCurveDescriptors(rawCurves).map((lc) => ({
  ...lc,
  ...(PRESENTATION[lc.label] ? { paper: PRESENTATION[lc.label] } : {}),
}))

// the paper's two camera rigs (from lifting-modp's scene files) — SPECIFIED here
const CAMERA_RIGS = {
  // camera at (0.1, 10, −0.1): 89.2° — straight down, the floor is the backdrop
  top: { azimuth: 2.36, elevation: 1.556, fill: 0.72, fov: 50 },
  // camera at (1, 2.2, −5)
  threequarter: { azimuth: 2.94, elevation: 0.41, fill: 0.72, fov: 50 },
}

const MAX_POINTS = 20000
const params = new URLSearchParams(location.search)
const num = (name: string, dflt: number) => (params.has(name) ? Number(params.get(name)) : dflt)

let curveIdx = num('curve', 0)
let k = num('k', 2)
// the paper's dense figures are top-down; hero shots switch to three-quarter
let rig: keyof typeof CAMERA_RIGS = params.get('rig') === 'threequarter' ? 'threequarter' : 'top'

const app = new App()
const first = CURVES[curveIdx]!
const firstProfile = paperProfile(first)
const scene = new CurveScene({
  curves: CURVES,
  curve: curveIdx,
  k,
  ...(firstProfile ? { profile: firstProfile } : {}),
  colorMode: 'uniform',
  color: first.paper?.color ?? 0xd43b3b,
  subfieldBoost: false,
  pointRadius: paperRadius(first, k),
  maxPoints: MAX_POINTS,
  onChange: () => app.invalidate(),
})
app.stage.add(scene.group)
// lay the torus parallel to the floor: the projected donut axis is z; this is
// the same rotation as legacy's (x,z,−y) swizzle, applied after projection
scene.group.rotation.x = -Math.PI / 2

function applyPresentation(): void {
  const lc = CURVES[curveIdx]!
  scene.setProfile(paperProfile(lc)) // resolve tier: also reruns build/style
  scene.setCurve(curveIdx)
  k = scene.setK(k)
  scene.setColor(lc.paper?.color ?? 0xd43b3b)
  scene.points.setBaseRadius(paperRadius(lc, k))
  scene.torus.setMaterial(lc.paper?.surface === 'glass' ? glass(0xffffff) : colored(0xc9eaff))
  updateInfo()
  app.frame(CAMERA_RIGS[rig])
  app.invalidate()
}

// ── panel: curve × field extension × view rig ───────────────────────────────
const panel = new ControlPanel({ title: 'torus lifts' })
const tab = panel.tab('Lift')

const kOptions = () => {
  const kMax = maxFeasibleK(CURVES[curveIdx]!.data, MAX_POINTS)
  return Array.from({ length: kMax }, (_, i) => {
    const kk = i + 1
    return { value: String(kk), label: `F_p^${kk}` }
  })
}

tab.dropdown(
  'Curve',
  { options: CURVES.map((c, i) => ({ label: c.label, value: String(i) })), value: String(curveIdx) },
  (v) => {
    curveIdx = Number(v)
    applyPresentation()
    kDropdown.setOptions(kOptions(), String(k))
  },
)

const kDropdown = tab.dropdown('Field extension', { options: kOptions(), value: String(k) }, (v) => {
  k = Number(v)
  applyPresentation()
})

// ── what you are looking at (the paper's data) ──────────────────────────────
const info = {
  curve: tab.label('Curve data'),
  field: tab.label('Field'),
  count: tab.label('Points'),
  tau: tab.label('τ target'),
  profile: tab.label('S² profile'),
  family: tab.label('Family'),
  achieved: tab.label('Achieved'),
}

function updateInfo(): void {
  const lc = CURVES[curveIdx]!
  const { a, b, c } = lc.data.form
  const eq = lc.data.equation
  info.curve.set(
    `disc ${b * b - 4n * a * c} · form (${a},${b},${c}) · trace ${lc.data.trace}` +
      (eq ? ` · y²=x³+${eq.f}x+${eq.g}` : ''),
  )
  info.field.set(`F_p^${k}, p = ${lc.data.p}`)
  info.count.set(`|E(F_p^${k})| = ${scene.scene.E.size}`)
  const tau = tauOf(lc.data.form)
  info.tau.set(`${tau.re.toFixed(4)} + ${tau.im.toFixed(4)}i`)
  const prof = lc.paper?.profile
  if (prof) {
    // specified: the paper's hand-tuned curve, from this entry's paper block
    // in data/curves.json — points laid in the curve's OWN lattice
    info.profile.set(`paper values a=${prof.a}, b=${prof.b}, n=${prof.n} (./presentation.json)`)
    info.family.set('φ = π/2 + ab·cos(nt), θ = t + a·sin(2nt)')
  } else {
    // solved: solveProfileCurve(τ) — rectangular τ ⇒ the exact latitude circle
    info.profile.set('solved from τ (solveProfileCurve)')
    info.family.set('latitude circle φ = const')
  }
  const cand = scene.candidates[scene.embedding]!
  info.achieved.set(
    `(A+iL)/4π = ${cand.tauPrime.re.toFixed(4)} + ${cand.tauPrime.im.toFixed(4)}i · ` +
      `lattice: ${prof ? "curve's own" : 'exact τ'}`,
  )
}

tab.dropdown(
  'View',
  {
    options: [
      { label: 'three-quarter (hero)', value: 'threequarter' },
      { label: 'top-down (dense)', value: 'top' },
    ],
    value: rig,
  },
  (v) => {
    rig = v as keyof typeof CAMERA_RIGS
    app.frame(CAMERA_RIGS[rig])
    app.invalidate()
  },
)

// pose matching against the paper figures: rotate the torus IN S³ (not the
// camera) until it matches, then we bake the numbers (?alpha=&beta=&gamma=&pole=)
const pose = (name: 'alpha' | 'beta' | 'gamma' | 'pole', max: number) =>
  tab.slider(`Pose ${name === 'pole' ? 'pole tilt' : name}`, { min: 0, max, step: 0.01, value: num(name, 0) }, (v) =>
    scene.setView({ [name]: v }),
  )
pose('alpha', 2 * Math.PI)
pose('beta', 2 * Math.PI)
pose('gamma', Math.PI)
pose('pole', Math.PI)
scene.setView({ alpha: num('alpha', 0), beta: num('beta', 0), gamma: num('gamma', 0), pole: num('pole', 0) })

// ── studio + boot ───────────────────────────────────────────────────────────
app.trace.bounces = 30 // the paper's figures traced at 30 bounces
const handle = app.setStudio(bridgesPaper)
addStudioControls(panel, app, handle, {
  renderName: 'torus-lift',
  sidecar: () => {
    const lc = CURVES[curveIdx]!
    return {
      curve: lc.label,
      k,
      rig,
      pointRadius: paperRadius(lc, k),
      color: lc.paper?.color,
      profile: lc.paper?.profile ?? 'solver default',
      lattice: lc.paper?.profile ? 'curve' : 'tau',
    }
  },
})
// ?design=1: live-edit the studio against a real figure, Copy spec to keep it
if (params.get('design') === '1') addStudioDesign(panel, app, bridgesPaper)
panel.mount(document.body)

applyPresentation()
if (params.get('trace') === '1') app.mode = 'trace'
if (params.has('blocktrace')) app.stepTrace(Number(params.get('blocktrace')))
app.start()

export {}
