/**
 * p107-hexagon — the whole class group of p=107 (disc −104, Z/6) as ONE framed
 * glass piece. The six forms sit on a pointy-top hexagon; a single vertical glass
 * plate down the middle IS the class-group inversion g ↦ g⁻¹:
 *
 *              (1,0,26) identity            ← top vertex, on the axis
 *          (5,-4,6)        (5,4,6)          ← order-6 pair  (upper edge)
 *              │   ║ glass ║   │
 *          (3,-2,9)        (3,2,9)          ← order-3 pair  (lower edge)
 *              (2,0,13) order 2             ← bottom vertex, on the axis
 *
 * The left column is the EXACT mirror of the right (built once per form, then
 * reflected across x=0), so each mirror pair straddles the glass. The two
 * self-conjugate forms (the 2-torsion: identity + order-2) lie on the axis —
 * fixed points of the reflection. Glass sits only BETWEEN the columns.
 *
 * Hand-wired like demos/mirror-pair: matte() is DoubleSide, and the reflected
 * copies get DoubleSide points too, so flipped winding shades right. Path trace
 * (Studio tab, or ?trace=1) for the glass + reflections.
 */
import * as THREE from 'three'

import { CurveScene, type CurveSceneOptions } from '@/author'
import { glass, matte } from '@/geometry'
import { parseCurveDescriptors } from '@/io'
import { App, ControlPanel, addStudioControls, colored } from '@/studio'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
const base: CurveSceneOptions = { curves, k: 1, colorMode: 'order', pointRadius: 0.04 }

const app = new App()

// A torus of one form, wrapped in a holder. `reflect` mirrors it across x=0 so a
// pair member on the right generates its exact partner on the left.
interface Placed {
  holder: THREE.Group
  r: number // intrinsic radius (for optional size-equalizing)
  reflect: boolean
  vx: number // unit hexagon coords, scaled by the radius slider
  vy: number
}
const placed: Placed[] = []

function addTorus(curveIdx: number, vx: number, vy: number, reflect: boolean): void {
  const scene = new CurveScene({ ...base, curve: curveIdx })
  scene.torus.setMaterial(matte(0xdde3ea))
  scene.torus.geometry.computeBoundingSphere()
  const r = scene.torus.geometry.boundingSphere?.radius ?? 1
  if (reflect) {
    // reflected copy → force point spheres DoubleSide (matte is already DS)
    const mesh = (scene.points as unknown as { mesh: THREE.InstancedMesh }).mesh
    ;(mesh.material as THREE.Material).side = THREE.DoubleSide
  }
  const holder = new THREE.Group()
  holder.add(scene.group)
  app.stage.add(holder)
  placed.push({ holder, r, reflect, vx, vy })
}

const H = Math.sqrt(3) / 2 // 0.866 — half-width of a unit pointy-top hexagon
// right column built from the +b representative; left column = its reflection
addTorus(0, H, 0.5, false) // (5,4,6)  upper-right  [order 6]
addTorus(0, -H, 0.5, true) // (5,-4,6) upper-left  = reflection
addTorus(1, H, -0.5, false) // (3,2,9)  lower-right  [order 3]
addTorus(1, -H, -0.5, true) // (3,-2,9) lower-left  = reflection
addTorus(2, 0, 1, false) // (1,0,26) top      [identity, on axis]
addTorus(3, 0, -1, false) // (2,0,13) bottom   [order 2, on axis]

// the glass plate: thin box on the symmetry plane x=0, only between the columns
const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glass(0xbfe3ff))
app.stage.add(plate)

const TARGET = 1.5 // common radius when sizes are equalized
const state = { rh: 4, equalize: true, glassH: 1.2, glassD: 4, thick: 0.12 }

function layout(): void {
  for (const p of placed) {
    const s = state.equalize ? TARGET / p.r : 1
    p.holder.scale.set(p.reflect ? -s : s, s, s)
    p.holder.position.set(p.vx * state.rh, p.vy * state.rh, 0)
  }
  // between the columns: height a bit over the edge span (Rh), never reaching the
  // top/bottom tori at ±Rh
  plate.scale.set(state.thick, state.glassH * state.rh, state.glassD)
  plate.position.set(0, 0, 0)
  app.frame()
  app.invalidate()
}

let studioHandle = app.setStudio(colored)
app.setBackground(0x28537b)
layout()
app.start()

// ── controls ────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'p107 · Z/6' })
const tab = panel.tab('Scene')
tab.slider('Hexagon radius', { min: 2.5, max: 8, step: 0.1, value: state.rh }, (v) => {
  state.rh = v
  layout()
})
tab.toggle('Equalize sizes', state.equalize, (v) => {
  state.equalize = v
  layout()
})
tab.slider('Glass height', { min: 0.5, max: 2.6, step: 0.05, value: state.glassH }, (v) => {
  state.glassH = v
  layout()
})
tab.slider('Glass depth', { min: 1, max: 8, step: 0.25, value: state.glassD }, (v) => {
  state.glassD = v
  layout()
})
tab.slider('Glass thickness', { min: 0.02, max: 0.5, step: 0.02, value: state.thick }, (v) => {
  state.thick = v
  layout()
})
tab.button('Path trace', () => {
  app.mode = app.mode === 'trace' ? 'live' : 'trace'
  app.invalidate()
})

addStudioControls(panel, app, studioHandle, {
  renderName: 'p107-hexagon',
  sidecar: () => ({ p: 107, disc: -104, group: 'Z/6', studio: studioHandle.spec.name }),
  onStudioChange: (h) => {
    studioHandle = h
    app.setBackground(0x28537b)
    layout()
  },
})

panel.mount(document.body)

export {}
