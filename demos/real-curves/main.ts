/**
 * real-curves — the REAL elliptic curve y² = x³ + a·x + b, drawn as its familiar
 * plane picture. Straight from the (a, b) coefficients (no ℘ / lattice needed):
 * the real locus is sampled by @/math/elliptic realEllipticCurve and tubed in the
 * z = 0 plane, viewed head-on.
 *
 * A scratch bench to get the drawing reliable across the typology before we line
 * a list of them up: `a`/`b` sliders sweep between the two shapes — three real
 * roots (an oval + an unbounded branch) vs one (a single branch) — and a few
 * presets jump to canonical examples.
 */
import * as THREE from 'three'

import { realEllipticCurve, type Pt } from '@/math/elliptic'
import { colored } from '@/geometry'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

const app = new App()
const content = new THREE.Group()
app.stage.add(content)

const curveMat = colored(0xd1495b) // E(ℝ), the real-locus red (matches the CP² piece)
const axisMat = colored(0xbcc3cc)

const params = {
  a: -1,
  b: 0.4,
  xMax: 2.4, // right clip for the unbounded branch (auto if ≤ 0)
  tubeR: 0.05,
  samples: 240,
  showAxes: true,
}

function makeTube(pts: Pt[], closed: boolean, radius: number, mat: THREE.Material): THREE.Mesh {
  const v = pts.map(([x, y]) => new THREE.Vector3(x, y, 0))
  const curve = new THREE.CatmullRomCurve3(v, closed, 'centripetal')
  const seg = Math.min(2000, Math.max(16, v.length * 2))
  return new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 12, closed), mat)
}

function addAxes(halfX: number, halfY: number): void {
  const r = params.tubeR * 0.4
  const mkLine = (a: THREE.Vector3, b: THREE.Vector3) =>
    new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8, false), axisMat)
  content.add(mkLine(new THREE.Vector3(-halfX, 0, 0), new THREE.Vector3(halfX, 0, 0)))
  content.add(mkLine(new THREE.Vector3(0, -halfY, 0), new THREE.Vector3(0, halfY, 0)))
}

function rebuild(): void {
  for (const c of [...content.children]) {
    content.remove(c)
    ;(c as THREE.Mesh).geometry?.dispose()
  }

  const comps = realEllipticCurve(params.a, params.b, {
    samples: params.samples,
    ...(params.xMax > 0 ? { xMax: params.xMax } : {}),
  })

  // extents (for axis sizing) as we tube each component
  let mx = 1
  let my = 1
  for (const comp of comps) {
    if (comp.points.length < 2) continue
    for (const [x, y] of comp.points) {
      mx = Math.max(mx, Math.abs(x))
      my = Math.max(my, Math.abs(y))
    }
    content.add(makeTube(comp.points, comp.closed, params.tubeR, curveMat))
  }
  if (params.showAxes) addAxes(mx * 1.1, my * 1.1)
  app.invalidate()
}

/** Look straight at the z = 0 plane (a flat, chart-like view). */
function frontView(): void {
  const bnd = app.stageBounds()
  const dist = (bnd.radius / Math.tan(((app.camera.fov * Math.PI) / 180) / 2)) * 1.15
  app.camera.up.set(0, 1, 0)
  app.camera.position.set(bnd.center.x, bnd.center.y, bnd.center.z + dist)
  app.controls.target.copy(bnd.center)
  app.camera.updateProjectionMatrix()
  app.controls.update()
  app.invalidate()
}

// ── panel ─────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'Real curve · y² = x³ + a·x + b' })

const PRESETS = [
  { label: 'y²=x³−x  (oval + branch)', a: -1, b: 0 },
  { label: 'y²=x³−x+0.4  (near-merge)', a: -1, b: 0.4 },
  { label: 'y²=x³−2x+1  (oval + branch)', a: -2, b: 1 },
  { label: 'y²=x³+1  (single branch)', a: 0, b: 1 },
  { label: 'y²=x³−x+1  (single branch)', a: -1, b: 1 },
]

const eq = panel.tab('Curve')
eq.dropdown(
  'Preset',
  { options: PRESETS.map((p, i) => ({ label: p.label, value: String(i) })), value: '1' },
  (v) => {
    const p = PRESETS[Number(v)]!
    params.a = p.a
    params.b = p.b
    aSlider.set(p.a)
    bSlider.set(p.b)
    rebuild()
    frontView()
    refreshDisc()
  },
)
const aSlider = eq.slider('a', { min: -4, max: 4, step: 0.05, value: params.a }, (v) => {
  params.a = v
  rebuild()
  frontView()
  refreshDisc()
})
const bSlider = eq.slider('b', { min: -4, max: 4, step: 0.05, value: params.b }, (v) => {
  params.b = v
  rebuild()
  frontView()
  refreshDisc()
})
const disc = eq.label('', '')
const refreshDisc = () => {
  const d = -4 * params.a ** 3 - 27 * params.b ** 2
  disc.set(`−4a³−27b² = ${d.toFixed(2)}  →  ${d > 0 ? 'two components (oval + branch)' : d < 0 ? 'one component' : 'singular'}`)
}

const view = panel.tab('Draw')
view.slider('branch clip xMax', { min: 0, max: 8, step: 0.1, value: params.xMax }, (v) => {
  params.xMax = v
  rebuild()
  frontView()
})
view.slider('tube radius', { min: 0.01, max: 0.15, step: 0.005, value: params.tubeR }, (v) => {
  params.tubeR = v
  rebuild()
})
view.slider('samples', { min: 40, max: 500, step: 20, value: params.samples }, (v) => {
  params.samples = v
  rebuild()
})
view.toggle('axes', params.showAxes, (v) => {
  params.showAxes = v
  rebuild()
})
view.button('Reframe', () => frontView())

const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'real-curves' })
panel.mount(document.body)

rebuild()
refreshDisc()
app.frame()
frontView()
app.start()

export {}
