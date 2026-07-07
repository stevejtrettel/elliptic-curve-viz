/**
 * roll-up — the flat fundamental domain rolling up into the Hopf torus
 * (DESIGN.md §9 view 4), with the E(F_q) points riding along.
 *
 * The honest "growing sphere" fold: at parameter R the picture is the genuine
 * radius-R Pinkall torus R·rollUp(z/R) ⊂ S³_R, stereographically projected. As
 * R → ∞ the sphere flattens and the torus unrolls to its flat fundamental
 * parallelogram; at R = 1 it is the paper torus. Because stereographic
 * projection commutes with dilation about its pole, that projection equals the
 * tangent-plane homotopy
 *
 *   fold(z, τ) = [ F(c + τ(z − c)) − F(c) ] / τ,   F = σ ∘ rollUp,  τ = 1/R,
 *
 * exactly (not approximately) — so one closure drives everything. τ = 1 is the
 * torus, τ → 0 the flat domain; c is the domain point held at the origin.
 *
 * Hand-wired against math + geometry (no CurveScene): a catalog curve gives the
 * profile, buildTorusScene gives its torus + E(F_q) + the flat coordinates the
 * points fold from.
 */
import * as THREE from 'three'

import { CURVES, buildTorusScene, curveDropdown, decodeParams, maxFeasibleK, resolveCurveIndex } from '@/author'
import { colorByDegree, matte } from '@/geometry'
import { tauOf } from '@/math/arithmetic'
import { Complex, Vec3 } from '@/math/core'
import { type Candidate, solveProfileCurve } from '@/math/families'
import { type HopfTorus, S3Projection, rollUpFold, rollUpPole } from '@/math/hopf'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

const url = decodeParams(location.search)
const MAX_POINTS = 20000

// surface & grid resolutions (the sheet is fine; the lattice grid is coarse)
const SURF_U = 72
const SURF_V = 72
const GRID_U = 12
const GRID_V = 12
const TAU_MIN = 0.02 // fold(·, 0) is a 0/0 limit; clamp just above

// ── state ──────────────────────────────────────────────────────────────────
let curveIndex = resolveCurveIndex(url.curve ?? 'disc −3 · hexagonal')
let k = url.k ?? 2
let tau = 1
let playing = false
let dir = -1 // autoplay starts by unrolling

// ── the current torus + points (rebuilt on curve/k change) ─────────────────
let hopf: HopfTorus
let flatPts: Complex[] = [] // one flat coordinate per E point
let pointRadius = 0.05
const proj = new S3Projection()
// the fold map for the current torus: fold(z, τ) ∈ ℝ³ (τ=1 torus, τ→0 flat)
let fold: (z: Complex, tau: number) => Vec3 = () => new Vec3(0, 0, 0)

// ── scene objects ───────────────────────────────────────────────────────────
const app = new App()
const group = new THREE.Group()
app.stage.add(group)

// the folding sheet (translucent so the points read through it)
const surfGeom = new THREE.BufferGeometry()
const surfPos = new Float32Array(3 * (SURF_U + 1) * (SURF_V + 1))
const surfPosAttr = new THREE.BufferAttribute(surfPos, 3)
surfGeom.setAttribute('position', surfPosAttr)
{
  const index: number[] = []
  const w = SURF_U + 1
  for (let i = 0; i < SURF_V; i++) {
    for (let j = 0; j < SURF_U; j++) {
      const a = i * w + j
      index.push(a, a + w, a + 1, a + 1, a + w, a + w + 1)
    }
  }
  surfGeom.setIndex(index)
}
const surfMat = matte(0xbcd3ea)
surfMat.transparent = true
surfMat.opacity = 0.5
surfMat.side = THREE.DoubleSide
const surfMesh = new THREE.Mesh(surfGeom, surfMat)
group.add(surfMesh)

// the fundamental-domain grid lines (a coarse lattice net that folds with it)
const gridGeom = new THREE.BufferGeometry()
const gridSegs: [number, number][] = [] // pairs of (a,b) grid-node indices
{
  const w = GRID_U + 1
  for (let i = 0; i <= GRID_V; i++)
    for (let j = 0; j < GRID_U; j++) gridSegs.push([i * w + j, i * w + j + 1])
  for (let j = 0; j <= GRID_U; j++)
    for (let i = 0; i < GRID_V; i++) gridSegs.push([i * w + j, (i + 1) * w + j])
}
const gridPos = new Float32Array(3 * 2 * gridSegs.length)
const gridPosAttr = new THREE.BufferAttribute(gridPos, 3)
gridGeom.setAttribute('position', gridPosAttr)
const gridNode = new Float32Array(3 * (GRID_U + 1) * (GRID_V + 1)) // reused folded-node scratch
const gridLines = new THREE.LineSegments(
  gridGeom,
  new THREE.LineBasicMaterial({ color: 0x274060, transparent: true, opacity: 0.55 }),
)
group.add(gridLines)

// the E(F_q) points, riding along
let points = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), matte(0xffffff), 0)
const _dummy = new THREE.Object3D()

/** Solve the profile, build the torus + points, refill colors and buffers. */
function buildScene(): void {
  const data = CURVES[curveIndex]!.data
  k = Math.min(k, maxFeasibleK(data, MAX_POINTS))
  const tau0 = tauOf(data.form)
  const candidates: Candidate[] = solveProfileCurve(tau0)
  const scene = buildTorusScene(data, k, candidates[0]!)
  hopf = scene.hopf
  flatPts = scene.flat
  const [w1, w2] = hopf.lattice
  const center = w1.scale(0.5).add(w2.scale(0.5)) // domain point held at the origin
  proj.pole = rollUpPole(hopf, center) // per-curve pole that suppresses the billow
  fold = rollUpFold(hopf, proj, center)

  // (re)build the point instances — count changes with k
  if (points.count !== scene.E.size) {
    group.remove(points)
    points.geometry.dispose()
    ;(points.material as THREE.Material).dispose()
    points.dispose()
    points = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), matte(0xffffff), scene.E.size)
    group.add(points)
  }
  const colors = colorByDegree(scene.E)
  const c = new THREE.Color()
  for (let i = 0; i < scene.E.size; i++) {
    c.setRGB(colors[3 * i]!, colors[3 * i + 1]!, colors[3 * i + 2]!)
    points.setColorAt(i, c)
  }
  if (points.instanceColor) points.instanceColor.needsUpdate = true
}

/** Write every folded position for the current τ. */
function applyFold(t: number): void {
  const tc = Math.max(t, TAU_MIN)
  const [w1, w2] = hopf.lattice
  const at = (a: number, b: number) => new Complex(w1.re * a + w2.re * b, w1.im * a + w2.im * b)

  // surface sheet: z = a·ω₁ + b·ω₂ over [0,1]²
  let n = 0
  for (let i = 0; i <= SURF_V; i++) {
    const b = i / SURF_V
    for (let j = 0; j <= SURF_U; j++) {
      const p = fold(at(j / SURF_U, b), tc)
      surfPos[n++] = p.x
      surfPos[n++] = p.y
      surfPos[n++] = p.z
    }
  }
  surfPosAttr.needsUpdate = true
  surfGeom.computeVertexNormals()
  surfGeom.computeBoundingSphere()

  // grid nodes (same lattice, coarse), then expand into segment pairs
  let m = 0
  for (let i = 0; i <= GRID_V; i++) {
    const b = i / GRID_V
    for (let j = 0; j <= GRID_U; j++) {
      const p = fold(at(j / GRID_U, b), tc)
      gridNode[m++] = p.x
      gridNode[m++] = p.y
      gridNode[m++] = p.z
    }
  }
  let g = 0
  for (const [s, e] of gridSegs) {
    gridPos[g++] = gridNode[3 * s]!
    gridPos[g++] = gridNode[3 * s + 1]!
    gridPos[g++] = gridNode[3 * s + 2]!
    gridPos[g++] = gridNode[3 * e]!
    gridPos[g++] = gridNode[3 * e + 1]!
    gridPos[g++] = gridNode[3 * e + 2]!
  }
  gridPosAttr.needsUpdate = true

  // points ride the same fold
  for (let i = 0; i < flatPts.length; i++) {
    const p = fold(flatPts[i]!, tc)
    _dummy.position.set(p.x, p.y, p.z)
    _dummy.scale.setScalar(pointRadius)
    _dummy.updateMatrix()
    points.setMatrixAt(i, _dummy.matrix)
  }
  points.instanceMatrix.needsUpdate = true
  points.computeBoundingSphere()
}

/** Fit the camera to the rolled-up (τ = 1) torus — the stable hero pose. */
function frame(): void {
  applyFold(1)
  app.frame({ azimuth: 0.3, elevation: 0.5, fill: 0.85 })
  applyFold(tau)
}

// ── panel ──────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'roll-up' })
const tab = panel.tab('Fold')

curveDropdown(tab, curveIndex, (i) => {
  curveIndex = i
  buildScene()
  frame()
  app.invalidate()
})
const kSlider = tab.slider('k (field F_{p^k})', { min: 1, max: 6, step: 1, value: k }, (v) => {
  k = v
  buildScene()
  kSlider.set(k) // may have been clamped to a feasible value
  frame()
  app.invalidate()
})
const rollSlider = tab.slider('Roll (0 flat … 1 torus)', { min: 0, max: 1, step: 0.005, value: tau }, (v) => {
  tau = v
  applyFold(tau)
  app.invalidate()
})
const playBtn = tab.button('Play', () => {
  playing = !playing
  playBtn.setLabel(playing ? 'Pause' : 'Play')
})
tab.slider('Point radius', { min: 0.01, max: 0.15, step: 0.005, value: pointRadius }, (v) => {
  pointRadius = v
  applyFold(tau)
  app.invalidate()
})

const about = panel.tab('About')
about.label(
  'What this is',
  'the flat fundamental domain ℂ/Λ rolling up into the Hopf torus; points ride along',
)
about.label('The fold', 'radius-R Pinkall torus in S³_R projected — R = 1/τ, τ=1 is the unit-sphere torus')

// ── studio, go ───────────────────────────────────────────────────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'roll-up' })
panel.mount(document.body)

buildScene()
frame()

// autoplay ping-pongs τ between flat and torus
function animate(): void {
  requestAnimationFrame(animate)
  if (!playing) return
  tau += dir * 0.006
  if (tau >= 1) {
    tau = 1
    dir = -1
  } else if (tau <= TAU_MIN) {
    tau = TAU_MIN
    dir = 1
  }
  rollSlider.set(tau)
  applyFold(tau)
}
requestAnimationFrame(animate)
app.start()

export {}
