/**
 * flat-domain — the flat picture ℂ/Λ on its own, dressed for inspection:
 * wall outline, interior grid of thin tubes, Cayley chords, coset colors
 * (DESIGN.md §9 view 2). The torus scene is computed but never staged — only
 * the DomainPlaque is shown, lying flat like a figure on paper. Every point
 * is drawn ONCE at its fundamental-domain representative (coordinates in
 * [0, 1) × [0, 1)); wall beads are never duplicated at the far wall.
 *
 * A hand-wired demo in the one-lift style: read top to bottom.
 */
import { CurveScene, decodeParams } from '@/author'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

const url = decodeParams(location.search)

// ── the scene: exact points → flat coordinates (the torus stays unstaged) ──
const app = new App()
const scene = new CurveScene({
  curve: url.curve ?? 'disc −3 · hexagonal',
  k: url.k ?? 3,
  cayley: url.cayley ?? true,
  colorMode: 'coset2',
  subfieldBoost: false,
  onChange: () => {
    refresh()
    app.invalidate()
  },
})
scene.plaque.rotation.x = -Math.PI / 2 // lie flat, figure-style
app.stage.add(scene.plaque)

// ── panel: curve on one tab, all flat-dressing knobs on another ────────────
const panel = new ControlPanel({ title: 'flat domain' })
const curveTab = panel.tab('Curve')
const flatTab = panel.tab('Flat')

curveTab.dropdown(
  'Curve',
  {
    options: scene.catalog.map((c, i) => ({ label: c.label, value: String(i) })),
    value: String(Math.max(0, scene.catalog.indexOf(scene.curve))),
  },
  (v) => {
    scene.setCurve(Number(v))
    kSlider.set(scene.k)
  },
)
const kSlider = curveTab.slider('k (field F_{p^k})', { min: 1, max: 6, step: 1, value: scene.k }, (v) => {
  const applied = scene.setK(v)
  if (applied !== v) kSlider.set(applied)
})
curveTab.dropdown(
  'Cayley chords',
  {
    options: [
      { label: 'off', value: 'off' },
      { label: 'generator g₁', value: 'g1' },
      { label: 'generator g₂', value: 'g2' },
      { label: 'both generators', value: 'both' },
    ],
    value: 'both',
  },
  (v) => scene.setCayley(v === 'off' ? [] : v === 'g1' ? [0] : v === 'g2' ? [1] : true),
)
curveTab.dropdown(
  'Cayley basis',
  {
    options: [
      { label: 'shortest (reduced)', value: 'reduced' },
      { label: 'structure (SNF)', value: 'structure' },
    ],
    value: scene.cayleyBasis,
  },
  (v) => scene.setCayleyBasis(v as 'reduced' | 'structure'),
)
curveTab.dropdown(
  'Color by',
  {
    options: [
      { label: 'coset of ⟨g₂⟩', value: 'coset2' },
      { label: 'coset of ⟨g₁⟩', value: 'coset1' },
      { label: 'field of definition', value: 'degree' },
      { label: 'group order', value: 'order' },
      { label: 'Frobenius orbit', value: 'orbit' },
      { label: 'single color', value: 'uniform' },
    ],
    value: scene.colorMode,
  },
  (v) => scene.setColorMode(v as 'coset2' | 'coset1' | 'degree' | 'order' | 'orbit' | 'uniform'),
)

// flat dressing state — applied by applyDress(), re-applied on every rebuild
let outlineOn = true
let outlineRadius = 0.006
let gridMode: 'off' | 'torsion' | 'custom' = 'torsion'
let gridDivisions = 12
let gridRadius = 0.0035
const TORSION_GRID_CAP = 40 // an N×N grid stops reading as a grid beyond this

function applyDress(): void {
  scene.plaque.setOutline(outlineOn ? { radius: outlineRadius } : null)
  const n = gridMode === 'off' ? 0 : gridMode === 'torsion' ? scene.scene.E.N : gridDivisions
  scene.plaque.setGrid(n >= 2 && n <= TORSION_GRID_CAP ? { u: n, v: n, radius: gridRadius } : null)
}

flatTab.toggle('Outline', outlineOn, (v) => {
  outlineOn = v
  applyDress()
  app.invalidate()
})
flatTab.slider('Outline radius', { min: 0.002, max: 0.02, step: 0.001, value: outlineRadius }, (v) => {
  outlineRadius = v
  applyDress()
  app.invalidate()
})
flatTab.dropdown(
  'Grid',
  {
    options: [
      { label: 'N-torsion (matches points)', value: 'torsion' },
      { label: 'custom divisions', value: 'custom' },
      { label: 'off', value: 'off' },
    ],
    value: gridMode,
  },
  (v) => {
    gridMode = v as typeof gridMode
    applyDress()
    app.invalidate()
  },
)
flatTab.slider('Custom divisions', { min: 2, max: 36, step: 1, value: gridDivisions }, (v) => {
  gridDivisions = v
  if (gridMode === 'custom') {
    applyDress()
    app.invalidate()
  }
})
flatTab.slider('Grid radius', { min: 0.001, max: 0.01, step: 0.0005, value: gridRadius }, (v) => {
  gridRadius = v
  applyDress()
  app.invalidate()
})
flatTab.slider('Point radius', { min: 0.004, max: 0.03, step: 0.001, value: 0.014 }, (v) => {
  scene.plaque.setPointRadius(v)
  app.invalidate()
})

// ── About: live facts, including the wall-bead single-copy check ──────────
const about = panel.tab('About')
const group = about?.label('Group')
const beads = about?.label('Beads')
const grid = about?.label('Grid')
about.label('Representatives', 'one per point, coordinates in [0,1)² — wall beads never doubled')

function refresh(): void {
  const { E, hopf, flat } = scene.scene
  const [n1, n2] = E.structure
  group?.set(`E(F_${scene.curve.data.p}^${scene.k}) ≅ ${n1 > 1 ? `ℤ/${n1} × ` : ''}ℤ/${n2} — |E| = ${E.size}`)
  // count beads sitting on the two 0-walls (their far-wall twins are NOT drawn)
  const [w1, w2] = hopf.lattice
  const det = w1.re * w2.im - w1.im * w2.re
  let onWalls = 0
  for (const z of flat) {
    const a = (z.re * w2.im - z.im * w2.re) / det
    const b = (w1.re * z.im - w1.im * z.re) / det
    if (a < 1e-6 || b < 1e-6) onWalls++
  }
  beads?.set(`${E.size} drawn (${onWalls} on walls, single copies)`)
  grid?.set(
    gridMode === 'torsion'
      ? E.N <= TORSION_GRID_CAP
        ? `N-torsion: ${E.N} × ${E.N} — every bead on a crossing`
        : `N = ${E.N} too fine to draw (cap ${TORSION_GRID_CAP})`
      : gridMode === 'custom'
        ? `${gridDivisions} × ${gridDivisions}`
        : 'off',
  )
  applyDress() // torsion-grid N follows the curve/k
}

// ── studio, camera, go ─────────────────────────────────────────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'flat-domain' })
panel.mount(document.body)

refresh()
app.frame({ azimuth: 2.36, elevation: 1.25, fill: 0.8 })
app.start()

export {}
