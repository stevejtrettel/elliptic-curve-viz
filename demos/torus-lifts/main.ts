/**
 * torus-lifts — the paper's figure family (Steve's spec, 2026-07-05): one
 * demo, a pulldown for the CURVE and a pulldown for the FIELD EXTENSION.
 * Selecting a curve applies its paper presentation from data/curves.json
 * (exact legacy profile, discriminant color, per-k radius, surface) in the
 * bridges-paper studio. View rig: the paper's top-down / three-quarter
 * cameras. Scriptable: ?curve=N&k=M&rig=top&trace=1&blocktrace=S.
 */
import { CAMERA_RIGS, CURVES, CurveScene, maxFeasibleK, paperProfile, paperRadius } from '@/author'
import { colored, glass } from '@/geometry'
import { App, ControlPanel, addStudioControls, bridgesPaper } from '@/studio'

const MAX_POINTS = 20000
const params = new URLSearchParams(location.search)
const num = (name: string, dflt: number) => (params.has(name) ? Number(params.get(name)) : dflt)

let curveIdx = num('curve', 0)
let k = num('k', 2)
let rig: keyof typeof CAMERA_RIGS = params.get('rig') === 'top' ? 'top' : 'threequarter'

const app = new App()
const first = CURVES[curveIdx]!
const firstProfile = paperProfile(first)
const scene = new CurveScene({
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

function applyPresentation(): void {
  const lc = CURVES[curveIdx]!
  scene.setProfile(paperProfile(lc)) // resolve tier: also reruns build/style
  scene.setCurve(curveIdx)
  k = scene.setK(k)
  scene.setColor(lc.paper?.color ?? 0xd43b3b)
  scene.points.setBaseRadius(paperRadius(lc, k))
  scene.torus.setMaterial(lc.paper?.surface === 'glass' ? glass(0xffffff) : colored(0xc9eaff))
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

// ── studio + boot ───────────────────────────────────────────────────────────
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
panel.mount(document.body)

applyPresentation()
if (params.get('trace') === '1') app.mode = 'trace'
if (params.has('blocktrace')) app.stepTrace(Number(params.get('blocktrace')))
app.start()

export {}
