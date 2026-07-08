/**
 * cp2-weierstrass — an elliptic curve E = ℂ/(ℤ+τℤ) drawn in an affine patch of
 * CP² via z ↦ [℘(z):℘′(z):1], projected (℘,℘′) ∈ ℂ² ≅ R⁴ → R³.
 *
 * The one point at infinity O = [0:1:0] (the pole z = 0) is cut with a smooth
 * ellipsoidal cutoff; a tube traces the resulting boundary loop. On top we draw
 * the hierarchical lattice grid, the real locus E(ℝ), and — when the curve is
 * real — its −1 quadratic twist, each as tubes (open arcs capped on the cutoff).
 * Aesthetic modelled on the lifting-modp renders.
 */
import * as THREE from 'three'

import { Complex } from '@/math/core'
import { paper, colored } from '@/geometry'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

import { buildSurface, buildHierGrid, buildGridCorners, makeProjection, type Vec3, type Run } from './surface'

const app = new App()
const content = new THREE.Group()
app.stage.add(content)

// shared materials (kept across rebuilds; only geometries are disposed)
const surfaceMat = paper(0xece4d2)
surfaceMat.side = THREE.DoubleSide
const boundaryMat = colored(0x2f6690) // the line-at-infinity cutoff
const realMat = colored(0xd1495b) // the real locus E(ℝ)
const twistMat = colored(0x7b4fa3) // the −1 twist's real points
const gridMat = colored(0x394a52) // the lattice parallelogram grid

const params = {
  tauRe: 0, // Re τ ∈ [−½, ½]; real locus is genuine at 0 (rectangular) or ½ (rhombic)
  tauIm: 1.15,
  N: 130,
  sP: 1.0, // ℘ scale
  sDP: 0.12, // ℘′ scale (℘′ ≫ ℘ near the pole; small keeps the neck from spiking)
  R: 8, // ellipsoid base radius (must exceed the real 2-torsion e-values)
  yStretch: 1.2, // ellipsoid radius along the ℘′ axis
  tubeB: 0.05, // boundary tube radius
  tubeR: 0.11, // real-locus tube radius (thicker, to overpower the grid)
  showTwist: true,
  tubeT: 0.09, // twist tube radius
  showGrid: true,
  gridBase: 2, // coarsest divisions
  gridLevels: 3, // nested levels (each ×2 finer, ×ratio thinner)
  gridThick: 0.05, // coarsest grid tube radius
  gridRatio: 0.55, // per-level thinning
  showCorners: true,
  // (Re℘, Re℘′, Im℘′): E(ℝ) lands in the z=0 plane and the twist in the y=0
  // plane, so BOTH real forms show as curves (perpendicular). Dropping Im℘′
  // instead ('…,p.im', the sail look) flattens the twist onto a line.
  projMode: 'p.re,dp.re,dp.im',
}
const GRID_FACTOR = 2

function makeTube(pts: Vec3[], closed: boolean, radius: number, mat: THREE.Material): THREE.Mesh {
  const v = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  const curve = new THREE.CatmullRomCurve3(v, closed, 'centripetal')
  const seg = Math.min(2000, Math.max(16, v.length * 2))
  const geo = new THREE.TubeGeometry(curve, seg, radius, 12, closed)
  return new THREE.Mesh(geo, mat)
}

function cap(p: Vec3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 16, 12), mat)
  m.position.set(p[0], p[1], p[2])
  return m
}

/** Tube each run; open runs (capped on the cutoff) get a sphere at each end. */
function addRuns(group: THREE.Group, runs: Run[], radius: number, mat: THREE.Material): void {
  for (const run of runs) {
    if (run.points.length < 2) continue
    group.add(makeTube(run.points, run.closed, radius, mat))
    if (!run.closed) {
      group.add(cap(run.points[0]!, radius, mat))
      group.add(cap(run.points[run.points.length - 1]!, radius, mat))
    }
  }
}

function rebuild(): void {
  for (const c of [...content.children]) {
    content.remove(c)
    ;(c as THREE.Mesh).geometry?.dispose()
  }

  const tau = new Complex(params.tauRe, params.tauIm)
  const proj = makeProjection(params.projMode, params.sP, params.sDP)
  const ell = { rx: params.R, ry: params.R * params.yStretch, rz: params.R }
  const build = buildSurface({ tau, proj, ell, N: params.N })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(build.positions, 3))
  geo.computeVertexNormals()
  content.add(new THREE.Mesh(geo, surfaceMat))

  if (params.showGrid) {
    const radii: number[] = []
    for (let k = 0; k < params.gridLevels; k++) radii.push(params.gridThick * params.gridRatio ** k)
    for (const run of buildHierGrid(tau, proj, ell, params.gridBase, GRID_FACTOR, radii)) {
      if (run.points.length >= 2) content.add(makeTube(run.points, run.closed, run.radius, gridMat))
    }
    if (params.showCorners) {
      for (const p of buildGridCorners(tau, proj, ell, params.gridBase)) {
        content.add(cap(p, params.gridThick * 1.5, gridMat))
      }
    }
  }
  for (const loop of build.boundaryLoops) {
    if (loop.length >= 4) content.add(makeTube(loop, true, params.tubeB, boundaryMat))
  }
  addRuns(content, build.realRuns, params.tubeR, realMat)
  if (params.showTwist) addRuns(content, build.twistRuns, params.tubeT, twistMat)
  app.invalidate()
}

// ── panel ───────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'CP² · Weierstrass' })
const lat = panel.tab('Lattice')
// Re τ ∈ [−½, ½] (fundamental domain). The curve is real only at Re τ = 0
// (rectangular) or ½ (rhombic), so the red/purple real curves appear there
// and nowhere else — at any other Re τ there are no real points to draw.
lat.slider('Re τ', { min: -0.5, max: 0.5, step: 0.01, value: params.tauRe }, (v) => {
  params.tauRe = v
  rebuild()
})
lat.slider('Im τ', { min: 0.5, max: 3, step: 0.01, value: params.tauIm }, (v) => {
  params.tauIm = v
  rebuild()
})
lat.slider('resolution', { min: 40, max: 220, step: 10, value: params.N }, (v) => {
  params.N = v
  rebuild()
})

const view = panel.tab('View')
view.dropdown(
  'projection (x,y,z)',
  {
    options: [
      { label: 'Re℘, Re℘′, Im℘', value: 'p.re,dp.re,p.im' },
      { label: 'Re℘, Im℘, Re℘′', value: 'p.re,p.im,dp.re' },
      { label: 'Re℘, Re℘′, Im℘′', value: 'p.re,dp.re,dp.im' },
      { label: 'Im℘, Im℘′, Re℘', value: 'p.im,dp.im,p.re' },
    ],
    value: params.projMode,
  },
  (v) => {
    params.projMode = v
    rebuild()
  },
)
view.slider('℘ scale', { min: 0.3, max: 2.5, step: 0.05, value: params.sP }, (v) => {
  params.sP = v
  rebuild()
})
view.slider('℘′ scale', { min: 0.1, max: 1.2, step: 0.05, value: params.sDP }, (v) => {
  params.sDP = v
  rebuild()
})

const cut = panel.tab('Cutoff')
cut.slider('ellipsoid radius', { min: 2, max: 12, step: 0.1, value: params.R }, (v) => {
  params.R = v
  rebuild()
})
cut.slider('℘′-axis stretch', { min: 0.6, max: 3, step: 0.05, value: params.yStretch }, (v) => {
  params.yStretch = v
  rebuild()
})
cut.slider('boundary tube', { min: 0.01, max: 0.15, step: 0.005, value: params.tubeB }, (v) => {
  params.tubeB = v
  rebuild()
})
cut.slider('real-locus tube', { min: 0.01, max: 0.15, step: 0.005, value: params.tubeR }, (v) => {
  params.tubeR = v
  rebuild()
})
cut.toggle('twist real points', params.showTwist, (v) => {
  params.showTwist = v
  rebuild()
})
cut.slider('twist tube', { min: 0.01, max: 0.15, step: 0.005, value: params.tubeT }, (v) => {
  params.tubeT = v
  rebuild()
})

const grid = panel.tab('Grid')
grid.toggle('lattice grid', params.showGrid, (v) => {
  params.showGrid = v
  rebuild()
})
grid.slider('base divisions', { min: 1, max: 6, step: 1, value: params.gridBase }, (v) => {
  params.gridBase = v
  rebuild()
})
grid.slider('levels', { min: 1, max: 4, step: 1, value: params.gridLevels }, (v) => {
  params.gridLevels = v
  rebuild()
})
grid.slider('thick tube', { min: 0.01, max: 0.09, step: 0.002, value: params.gridThick }, (v) => {
  params.gridThick = v
  rebuild()
})
grid.slider('thinning ratio', { min: 0.3, max: 0.8, step: 0.05, value: params.gridRatio }, (v) => {
  params.gridRatio = v
  rebuild()
})
grid.toggle('corner spheres', params.showCorners, (v) => {
  params.showCorners = v
  rebuild()
})

// ── studio, camera, go ───────────────────────────────────────────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, { renderName: 'cp2-weierstrass' })
panel.mount(document.body)

rebuild()
app.frame({ azimuth: 0.8, elevation: 1.0, fill: 0.85 })
app.start()

export {}
