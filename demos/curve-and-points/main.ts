/**
 * curve-and-points — one curve, two pictures side by side: the Hopf torus
 * η⁻¹(C) ⊂ S³ (left) and the literal F_p×F_p point plot in P²(F_p) (right).
 * Both are driven from the SAME catalog curve, so you can read the group of
 * E(F_{p^k}) on the torus against its degree-1 points on the grid.
 *
 * The F_p view needs the Weierstrass equation (CurveData.equation), so the
 * dropdown lists exactly the catalog curves that carry one (see
 * author/finite-view). Any prime is fine: the standard view plots only the
 * solutions (≈p spheres), not the full p²-point lattice.
 */
import type { Object3D } from 'three'

import { CURVES, CurveScene, finiteCurveFromData, hasFiniteView } from '@/author'
import { FiniteField, ProjectivePlane, gridEmbedding } from '@/math/finite-field'
import { ProjectivePlaneMesh, colored } from '@/geometry'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

/** Scale a grid-embedded mesh (halo radius half·√2+2) to targetRadius, place it flat at centerX. */
function gridScaleAndPlace(mesh: Object3D, p: number, targetRadius: number, centerX: number): void {
  const extent = ((p - 1) / 2) * Math.SQRT2 + 2
  mesh.scale.setScalar(targetRadius / extent)
  mesh.position.set(centerX, 0, 0)
}

// ── eligible catalog curves (equation present, small p) ─────────────────────
const eligible = CURVES.map((c, i) => ({ c, i })).filter(({ c }) => hasFiniteView(c.data))
let catalogIndex = eligible[0]!.i
let k = 3
let fpPointRadius = 0.18
let gridLines = true
let background = false // standard view: plot only the solutions

// where each picture sits on the floor (both lie flat in the xz-plane)
const TORUS_CENTER = -3.2
const GRID_CENTER = 3.2
const GRID_TARGET_RADIUS = 2.6 // scale the p-wide grid down to about this
const fpPointMat = colored(0x7d46bd)

// ── left: the Hopf torus, laid flat like a figure ───────────────────────────
const app = new App()
const scene = new CurveScene({
  curve: catalogIndex,
  k,
  colorMode: 'uniform',
  color: 0xcc8d04,
  subfieldBoost: false,
  onChange: () => app.invalidate(),
})
scene.group.rotation.x = -Math.PI / 2
scene.group.position.x = TORUS_CENTER
app.stage.add(scene.group)

// ── right: the F_p point plot, rebuilt whenever the curve/knobs change ───────
let fpMesh: ProjectivePlaneMesh | null = null

function rebuildFp(): void {
  if (fpMesh) {
    app.stage.remove(fpMesh)
    fpMesh.dispose()
  }
  const data = scene.curve.data
  const p = Number(data.p)
  const plane = new ProjectivePlane(new FiniteField(p), gridEmbedding)
  fpMesh = new ProjectivePlaneMesh(plane, {
    layers: [{ points: finiteCurveFromData(data).points(), material: fpPointMat, radius: fpPointRadius }],
    background,
    bgRadius: 0.1,
    showGridLines: gridLines,
  })
  gridScaleAndPlace(fpMesh, p, GRID_TARGET_RADIUS, GRID_CENTER)
  app.stage.add(fpMesh)
  refresh()
  app.invalidate()
}

// ── panel ───────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'curve & points' })
const curveTab = panel.tab('Curve')

curveTab.dropdown(
  'Curve',
  {
    options: eligible.map(({ c, i }) => ({ label: c.label, value: String(i) })),
    value: String(catalogIndex),
  },
  (v) => {
    catalogIndex = Number(v)
    scene.setCurve(catalogIndex)
    kSlider.set(scene.k)
    rebuildFp()
  },
)
const kSlider = curveTab.slider('k (field F_{p^k})', { min: 1, max: 6, step: 1, value: k }, (v) => {
  const applied = scene.setK(v)
  k = applied
  if (applied !== v) kSlider.set(applied)
  refresh()
})
curveTab.slider('F_p point size', { min: 0.06, max: 0.35, step: 0.01, value: fpPointRadius }, (v) => {
  fpPointRadius = v
  rebuildFp()
})
curveTab.toggle('F_p grid lines', gridLines, (v) => {
  gridLines = v
  rebuildFp()
})
curveTab.toggle('F_p background lattice', background, (v) => {
  background = v
  rebuildFp()
})

// ── About: the two point sets, side by side in words ────────────────────────
const about = panel.tab('About')
const eqLabel = about.label('Equation')
const fpLabel = about.label('E(F_p)')
const torusLabel = about.label('E(F_{p^k})')

function refresh(): void {
  const data = scene.curve.data
  const p = Number(data.p)
  const f = Number(data.equation!.f)
  const g = Number(data.equation!.g)
  eqLabel.set(`y² = x³ + ${f}x + ${g} over F_${p}`)
  const nFp = finiteCurveFromData(data).points().length
  const bound = 2 * Math.sqrt(p)
  fpLabel.set(`#E(F_${p}) = ${nFp}  (Hasse [${Math.ceil(p + 1 - bound)}, ${Math.floor(p + 1 + bound)}])`)
  const [n1, n2] = scene.scene.E.structure
  torusLabel.set(`E(F_${p}^${scene.k}) ≅ ${n1 > 1 ? `ℤ/${n1} × ` : ''}ℤ/${n2}  —  |E| = ${scene.scene.E.size}`)
}

// ── studio, camera, go ──────────────────────────────────────────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'curve-and-points' })
panel.mount(document.body)

rebuildFp()
app.frame({ azimuth: 0.9, elevation: 1.1, fill: 0.85 })
app.start()

export {}
