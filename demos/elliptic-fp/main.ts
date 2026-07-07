/**
 * elliptic-fp — a curve over F_p as its literal points in the projective plane
 * P²(F_p), laid flat on the grid embedding (DESIGN.md §5.1's F_p×F_p view). The
 * p² affine solutions of y² = x³ + ax + b sit on the xz-grid; the point(s) at
 * infinity ride a halo circle around it. Ported from threejs-demos/elliptic-fp,
 * dressed in the studio system so it path-traces for free.
 *
 * A hand-wired demo in the one-lift style: read top to bottom.
 */
import { FiniteField, ProjectivePlane, gridEmbedding, weierstrass } from '@/math/finite-field'
import { ProjectivePlaneMesh, colored } from '@/geometry'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

// ── curve parameters (prime + Weierstrass coefficients) ─────────────────────
const PRIMES = [5, 7, 11, 13, 17]
let p = 5
let a = 1 // y² = x³ + x + 1 (mod 5)
let b = 1
let pointRadius = 0.2
let gridLines = true
let background = false // standard view: plot only the solutions

const pointMat = colored(0x7d46bd)

// ── the scene: solve over F_p, embed on the grid, add to the stage ──────────
const app = new App()
let mesh: ProjectivePlaneMesh | null = null

function rebuild(): void {
  if (mesh) {
    app.stage.remove(mesh)
    mesh.dispose()
  }
  const plane = new ProjectivePlane(new FiniteField(p), gridEmbedding)
  const curve = weierstrass(p, a, b)
  mesh = new ProjectivePlaneMesh(plane, {
    layers: [{ points: curve.points(), material: pointMat, radius: pointRadius }],
    background,
    bgRadius: 0.12,
    showGridLines: gridLines,
  })
  app.stage.add(mesh)
  refresh()
  app.invalidate()
}

// ── panel: curve on one tab, view knobs on another ──────────────────────────
const panel = new ControlPanel({ title: 'elliptic-fp' })
const curveTab = panel.tab('Curve')
const viewTab = panel.tab('View')

curveTab.dropdown(
  'Prime p',
  { options: PRIMES.map((q) => ({ label: String(q), value: String(q) })), value: String(p) },
  (v) => {
    p = Number(v)
    rebuild()
  },
)
// a, b are reduced mod p by the curve, so a fixed integer range needs no rebounding.
curveTab.slider('a', { min: -8, max: 8, step: 1, value: a }, (v) => {
  a = v
  rebuild()
})
curveTab.slider('b', { min: -8, max: 8, step: 1, value: b }, (v) => {
  b = v
  rebuild()
})

viewTab.slider('Point radius', { min: 0.05, max: 0.4, step: 0.01, value: pointRadius }, (v) => {
  pointRadius = v
  rebuild()
})
viewTab.toggle('Grid lines', gridLines, (v) => {
  gridLines = v
  rebuild()
})
viewTab.toggle('Background lattice', background, (v) => {
  background = v
  rebuild()
})

// ── About: live equation and point count (with the Hasse window) ────────────
const about = panel.tab('About')
const eqLabel = about.label('Curve')
const countLabel = about.label('Points')

function refresh(): void {
  const solutions = weierstrass(p, a, b).points()
  eqLabel.set(`y² = x³ + ${a}x + ${b} over F_${p}`)
  // #E(F_p) = affine solutions + the one point at infinity [0:1:0];
  // Hasse: |#E − (p+1)| ≤ 2√p.
  const bound = 2 * Math.sqrt(p)
  const lo = Math.ceil(p + 1 - bound)
  const hi = Math.floor(p + 1 + bound)
  countLabel.set(`#E = ${solutions.length}  (Hasse window [${lo}, ${hi}])`)
}

// ── studio, camera, go (the studio supplies the matte floor) ────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'elliptic-fp' })
panel.mount(document.body)

rebuild()
app.frame({ azimuth: 0.9, elevation: 1.15, fill: 0.75 })
app.start()

export {}
