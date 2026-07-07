/**
 * mirror — a path-trace gallery test: ONE torus + a REAL framed mirror, dressed
 * like the horizontal gallery renders (colored studio + solid backdrop). Both
 * the torus and the mirror are PLACEABLE with the gallery gizmo — click to
 * select, drag to move (on the floor; opt-in vertical), R to rotate freely.
 *
 * The torus is one of a conjugate form pair — (8,4,13) at p=101. Its class-group
 * inverse is (8,-4,13), the mirror image of the lattice (τ ↦ −τ̄), so the
 * reflection is a correct embedding of the PARTNER curve, E(F_p) points carried
 * along. Physical reflection = complex conjugation of the ideal class.
 *
 * Path tracing does the mirror exactly and for free. NOTE: raster (live) mode
 * only reflects the environment, so the reflected torus appears only under path
 * trace — hit "Path trace" in the Mirror tab (or the Studio tab), or ?trace=1.
 */
import * as THREE from 'three'

import { showCurve } from '@/author'
import { enablePlacement } from '@/author/place'
import { colored } from '@/studio'
import { parseCurveDescriptors } from '@/io'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)

const demo = showCurve({
  title: 'mirror',
  curves,
  curve: 0,
  k: 1, // E(F_101) — 100 points on the single torus
  torus: 'matte', // matte reads clearly as "the curve"; the mirror does the doubling
  colorBy: 'order',
  studio: colored,
  interaction: false, // the placement gizmo owns the pointer, not orbit-picking
  camera: { azimuth: 0.9, elevation: 0.22 },
})

const { app, scene, panel } = demo

// gallery backdrop — a muted slate blue, matching the a-series pieces
app.setBackground(0x28537b)

// unit of scale: the torus radius at load, so the mirror defaults sit sensibly
scene.torus.geometry.computeBoundingSphere()
const R0 = scene.torus.geometry.boundingSphere?.radius ?? 3

// ── torus slot: wrap the curve so the gizmo can pose it in ℝ³ ────────────────
const torusSlot = new THREE.Group()
app.stage.remove(scene.group)
torusSlot.add(scene.group)
app.stage.add(torusSlot)

// ── mirror slot: a specular plane + a precise square frame, posed as a unit ──
const mirrorSlot = new THREE.Group()
mirrorSlot.position.set(2.2 * R0, 0, 0)
mirrorSlot.rotation.y = -Math.PI / 2 // wall faces the torus (local +z → world −x)
app.stage.add(mirrorSlot)

// DoubleSide so a rotated mirror reflects regardless of which face the camera sees
const mirrorMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 1,
  roughness: 0,
  side: THREE.DoubleSide,
})
const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mirrorMat)
mirrorSlot.add(mirror)

// brushed-brass frame: four straight cylinders capped by small corner spheres
const frameMat = new THREE.MeshStandardMaterial({ color: 0xc7a24e, metalness: 0.85, roughness: 0.3 })
const frameGroup = new THREE.Group()
mirrorSlot.add(frameGroup)

const state = { size: 3, frameR: 0.05 } // wall edge and frame tube radius, in torus radii

/** A precise square frame in the plane's local XY: 4 edge cylinders + 4 corner spheres. */
function rebuildMirror(): void {
  const half = (state.size * R0) / 2
  const tubeR = state.frameR * R0
  mirror.scale.set(2 * half, 2 * half, 1)

  for (const child of frameGroup.children) (child as THREE.Mesh).geometry.dispose()
  frameGroup.clear()

  const edge = new THREE.CylinderGeometry(tubeR, tubeR, 2 * half, 16)
  const bead = new THREE.SphereGeometry(tubeR * 1.1, 16, 12)
  // top & bottom edges run along X (rotate the Y-axis cylinder onto X)
  for (const y of [half, -half]) {
    const m = new THREE.Mesh(edge, frameMat)
    m.rotation.z = Math.PI / 2
    m.position.set(0, y, 0)
    frameGroup.add(m)
  }
  // left & right edges run along Y (native cylinder axis)
  for (const x of [half, -half]) {
    const m = new THREE.Mesh(edge, frameMat)
    m.position.set(x, 0, 0)
    frameGroup.add(m)
  }
  // corner beads cover the mitres
  for (const x of [half, -half]) for (const y of [half, -half]) frameGroup.add(new THREE.Mesh(bead, frameMat).translateX(x).translateY(y))

  app.invalidate()
}
rebuildMirror()

demo.frame()
app.invalidate()

// ── placement: the gallery gizmo over [torus, mirror] ───────────────────────
const SLOTS = ['torus', 'mirror']
let selReadout: { set(t: string): void } | null = null
let modeToggle: { set(on: boolean): void } | null = null
const placement = enablePlacement(app, [torusSlot, mirrorSlot], {
  onSelect: (i) => selReadout?.set(i === null ? 'nothing selected' : `selected: ${SLOTS[i]}`),
  onMode: (m) => modeToggle?.set(m === 'rotate'),
})

// ── controls ────────────────────────────────────────────────────────────────
if (panel) {
  const place = panel.tab('Place')
  selReadout = place.label('Selection', 'nothing selected')
  place.button('Select torus', () => placement.select(0))
  place.button('Select mirror', () => placement.select(1))
  modeToggle = place.toggle('Tool: Rotate (else Move)', false, (on) => placement.setMode(on ? 'rotate' : 'translate'))
  place.toggle('Move vertically', false, (v) => placement.setVertical(v))

  const tab = panel.tab('Mirror')
  tab.slider('Wall size', { min: 1, max: 12, step: 0.25, value: state.size }, (v) => {
    state.size = v
    rebuildMirror()
  })
  tab.slider('Frame radius', { min: 0.01, max: 0.2, step: 0.005, value: state.frameR }, (v) => {
    state.frameR = v
    rebuildMirror()
  })
  tab.button('Path trace (see the reflection)', () => {
    app.mode = app.mode === 'trace' ? 'live' : 'trace'
    app.invalidate()
  })
}

export {}
