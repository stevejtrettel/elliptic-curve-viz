/**
 * base-sphere — the S² base picture of the Hopf fibration (DESIGN.md §9 view 3):
 * a profile curve C on the sphere, its Hopf preimage torus η⁻¹(C), and a few
 * fibers linking the two.
 *
 * Deliberately NO elliptic-curve points — this demo is about the GEOMETRY of the
 * construction, so it wires math + geometry directly (no CurveScene, no point
 * cloud). A catalog curve is used ONLY for its τ; the star control is the
 * EMBEDDING dropdown: same τ, different solver candidates → visibly different
 * curves on S².
 *
 * The Hopf map η: S³ → S² collapses each fiber circle to a point; the torus IS
 * η⁻¹(C). Each colored dot on the sphere is the base point of the same-colored
 * fiber circle on the torus. The area cap fills the region C encloses (area A);
 * with C's length L these are the lattice data — ω₂ = A/2 + iL/2, τ = (A + iL)/4π.
 */
import { CURVES, candidateLabel, curveDropdown, decodeParams, resolveCurveIndex } from '@/author'
import { BaseSphere, HopfTorusMesh, PALETTES, S3Group, TubeSet, colored } from '@/geometry'
import { tauOf } from '@/math/arithmetic'
import { type Candidate, solveProfileCurve } from '@/math/families'
import { HopfTorus, sphereToR3 } from '@/math/hopf'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

const TWO_PI = 2 * Math.PI
const url = decodeParams(location.search)
const palette = PALETTES.classic

// ── state (a catalog curve for its τ, an embedding candidate, the knobs) ────
let curveIndex = resolveCurveIndex(url.curve ?? 'disc −3 · hexagonal')
let lobes: number | null = null
let candidates: Candidate[] = []
let embedding = 0
let fiberCount = url.fibers ?? 8
let showCap = true

/** Solve the profile-curve candidates for the current curve's τ. */
function solve(): void {
  const tau = tauOf(CURVES[curveIndex]!.data.form)
  let cands = solveProfileCurve(tau, lobes !== null ? { n: lobes } : {})
  if (cands.length === 0 && lobes !== null) cands = solveProfileCurve(tau) // pinned n unsolvable → auto
  candidates = cands
  embedding = 0
}

// ── scene: torus at right, its base S² at left ─────────────────────────────
const app = new App()
const group = new S3Group() // owns the projection (default = the paper's σ)
group.rotation.x = -Math.PI / 2 // torus laid flat, like the paper figures
app.stage.add(group)

solve()
let hopf = new HopfTorus(candidates[embedding]!.curve)
const torus = new HopfTorusMesh(hopf)
group.add(torus)

const sphere = new BaseSphere()
sphere.setSurface('matte') // glass is for traced figures; matte reads live
app.stage.add(sphere)

let fiberTubes: TubeSet[] = []

/** The profile curve as uniform samples on S² (for the base-sphere tube). */
const profileSamples = () =>
  Array.from({ length: 256 }, (_, j) => hopf.profileAt((TWO_PI * j) / 256))

/**
 * Fibers over `fiberCount` equally-spaced base points: each as a closed tube on
 * the torus and a matching-colored dot on the sphere. A TubeSet has one
 * material, so matched colors = one single-curve TubeSet per fiber.
 */
function rebuildFibers(): void {
  for (const t of fiberTubes) {
    group.remove(t)
    t.dispose()
  }
  fiberTubes = Array.from({ length: fiberCount }, (_, f) => {
    const fiber = hopf.fiberAt(f / fiberCount)
    const points = Array.from({ length: 192 }, (_, i) => fiber((TWO_PI * i) / 192))
    return new TubeSet([{ points, closed: true }], {
      radius: 0.015,
      material: colored(palette[f % palette.length]!.getHex()),
    })
  })
  group.add(...fiberTubes) // S3Group.add reprojects the newcomers
  const marks = Array.from({ length: fiberCount }, (_, f) =>
    sphereToR3(hopf.profileAt((TWO_PI * f) / fiberCount)),
  )
  const colors = new Float32Array(3 * fiberCount)
  for (let f = 0; f < fiberCount; f++) {
    const c = palette[f % palette.length]!
    colors.set([c.r, c.g, c.b], 3 * f)
  }
  sphere.setMarks(marks, colors)
}

/** Rebuild the torus + sphere for the current candidate, then reframe. */
function rebuild(): void {
  hopf = new HopfTorus(candidates[embedding]!.curve)
  torus.setSurface(hopf) // refills the S³ cache and reprojects
  sphere.setCurve(profileSamples())
  sphere.setCap(showCap ? {} : null)
  rebuildFibers()
  refresh()
  frame()
  app.invalidate()
}

/** Park the base sphere beside the torus, scaled to match. */
function frame(): void {
  torus.geometry.computeBoundingSphere()
  const r = torus.geometry.boundingSphere?.radius ?? 3
  sphere.position.set(-1.8 * r, 0.6 * r, 0)
  sphere.scale.setScalar(0.6 * r)
  app.frame({ azimuth: 0.15, elevation: 0.55, fill: 0.8 })
}

// ── panel ──────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'base S²' })
const tab = panel.tab('Base')

curveDropdown(tab, curveIndex, (i) => {
  curveIndex = i
  solve()
  embDropdown.setOptions(embeddingOptions(), '0')
  rebuild()
})
const embeddingOptions = () =>
  candidates.map((c, i) => ({ value: String(i), label: candidateLabel(c) }))
const embDropdown = tab.dropdown(
  'Embedding',
  { options: embeddingOptions(), value: String(embedding) },
  (v) => {
    embedding = Number(v)
    rebuild()
  },
)
tab.dropdown(
  'Lobes n',
  {
    options: [
      { label: 'auto', value: 'auto' },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ label: String(n), value: String(n) })),
    ],
    value: 'auto',
  },
  (v) => {
    lobes = v === 'auto' ? null : Number(v)
    solve()
    embDropdown.setOptions(embeddingOptions(), '0')
    rebuild()
  },
)
tab.slider('Fibers', { min: 1, max: 24, step: 1, value: fiberCount }, (v) => {
  fiberCount = v
  rebuildFibers()
  app.invalidate()
})
tab.toggle('Area cap (encloses A)', showCap, (v) => {
  showCap = v
  sphere.setCap(v ? {} : null)
  app.invalidate()
})

// ── About: the two lattice data, read off the curve ───────────────────────
const about = panel.tab('About')
const areaLabel = about.label('Area A')
const lengthLabel = about.label('Length L')
const tauLabel = about.label('τ = (A+iL)/4π')
const embLabel = about.label('Embedding')
about.label('Reading it', 'dot on C = base of the same-colored fiber circle; cap area = A = 2·holonomy')

function refresh(): void {
  areaLabel.set(`${(hopf.area / Math.PI).toFixed(4)}π (cap ${showCap ? 'shown' : 'hidden'})`)
  lengthLabel.set(`${(hopf.length / Math.PI).toFixed(4)}π`)
  const tau = { re: hopf.area / (4 * Math.PI), im: hopf.length / (4 * Math.PI) }
  tauLabel.set(`${tau.re.toFixed(4)} + ${tau.im.toFixed(4)}i`)
  embLabel.set(candidateLabel(candidates[embedding]!))
}

// ── studio, camera, go ─────────────────────────────────────────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'base-sphere' })
panel.mount(document.body)

rebuild() // builds fibers/cap, fills the readout, parks the sphere, frames
app.start()

export {}
