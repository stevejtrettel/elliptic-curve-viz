/**
 * mirror-pair — a path-trace gallery test: a conjugate form pair rendered as two
 * tori that are EXACT mirror images, with a plate of glass on the symmetry plane.
 *
 * The two tori are one form and its reflection. (8,4,13) at p=101 is built once;
 * the second torus is the SAME geometry mirrored across x=0 (scale.x = −1). By
 * the conjugate-pair theorem (τ ↦ −τ̄) that mirror is a correct embedding of the
 * class-group inverse (8,−4,13) — so the picture is literally the pair, and the
 * glass plate between them stands for the mirror symmetry that relates them.
 *
 * Hand-wired (DESIGN.md §7.5): two identical CurveScenes from one options object,
 * the second reflected. matte() is DoubleSide, so the reflected surface renders;
 * the reflected copy's points are set DoubleSide too. Glass is a thin box so the
 * FrontSide thin-film plate reads from both sides. NOTE: raster (live) glass is
 * cheap-but-flat — path trace (Studio tab, or ?trace=1) for the real look.
 */
import * as THREE from 'three'

import { CurveScene, type CurveSceneOptions } from '@/author'
import { glass, matte } from '@/geometry'
import { parseCurveDescriptors } from '@/io'
import { App, ControlPanel, addStudioControls, colored } from '@/studio'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)

// ONE options object → two identical tori (so the mirror is exact)
const opts: CurveSceneOptions = { curves, curve: 0, k: 1, colorMode: 'order', pointRadius: 0.04 }

const app = new App()
const sceneA = new CurveScene(opts)
const sceneB = new CurveScene(opts)
for (const s of [sceneA, sceneB]) s.torus.setMaterial(matte(0xdde3ea))
// the reflected copy (holderB below) has negative determinant, which flips
// triangle winding. matte() is already DoubleSide, so the surface is fine; the
// point spheres use FrontSide colored(), so reach the internal mesh and set the
// shared material DoubleSide (the trace bake reuses this same material object).
const bPoints = (sceneB.points as unknown as { mesh: THREE.InstancedMesh }).mesh
;(bPoints.material as THREE.Material).side = THREE.DoubleSide

sceneA.torus.geometry.computeBoundingSphere()
const R0 = sceneA.torus.geometry.boundingSphere?.radius ?? 3

// torus A upright at +x; torus B is A reflected across x=0 (scale.x = −1) at −x
const holderA = new THREE.Group()
holderA.add(sceneA.group)
const holderB = new THREE.Group()
holderB.add(sceneB.group)
holderB.scale.x = -1
app.stage.add(holderA, holderB)

// the glass plate: a thin box on the symmetry plane x=0 (FrontSide thin-film,
// visible from both sides via its outward faces)
const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass(0xbfe3ff))
app.stage.add(plate)

const state = { sep: 1.5, plate: 4, thick: 0.05 } // in torus radii

function layout(): void {
  const d = state.sep * R0
  holderA.position.x = d
  holderB.position.x = -d
  const P = state.plate * R0
  plate.scale.set(state.thick * R0, P, P)
  app.frame()
  app.invalidate()
}

const studio = app.setStudio(colored)
app.setBackground(0x28537b)
layout()
app.start()

// ── controls ────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'mirror pair' })
const tab = panel.tab('Scene')
tab.slider('Separation', { min: 0.2, max: 4, step: 0.05, value: state.sep }, (v) => {
  state.sep = v
  layout()
})
tab.slider('Plate size', { min: 1, max: 10, step: 0.25, value: state.plate }, (v) => {
  state.plate = v
  layout()
})
tab.slider('Plate thickness', { min: 0.01, max: 0.4, step: 0.01, value: state.thick }, (v) => {
  state.thick = v
  layout()
})
tab.button('Path trace', () => {
  app.mode = app.mode === 'trace' ? 'live' : 'trace'
  app.invalidate()
})

let studioHandle = studio
addStudioControls(panel, app, studioHandle, {
  renderName: 'mirror-pair',
  sidecar: () => ({ curve: sceneA.curve.label, k: sceneA.k, studio: studioHandle.spec.name }),
  onStudioChange: (h) => {
    studioHandle = h
    app.setBackground(0x28537b)
    layout()
  },
})

panel.mount(document.body)

export {}
