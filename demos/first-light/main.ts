/**
 * first-light — the milestone demo (DESIGN.md §11): a glass Hopf torus with
 * the exact points of E(F_{p^k}); fiber/gridline tubes; click-to-highlight
 * Frobenius orbits; the flat fundamental domain; and, since Phase 4, the
 * paper-white studio with live path tracing and render capture.
 * Wiring only: every line binds a control to a setter or a rebuild.
 */
import * as THREE from 'three'

import {
  DomainPlaque,
  HopfTorusMesh,
  PointCloud,
  S3Group,
  TubeSet,
  colorByDegree,
  colorByOrbit,
  colorByOrder,
  colored,
  glass,
  highlightOrbit,
  matte,
  sizeByDegree,
} from '@/geometry'
import { tauOf } from '@/math/arithmetic'
import { Quaternion, Vec4 } from '@/math/core'
import { type Candidate, solveProfileCurve } from '@/math/families'
import { S3Projection } from '@/math/hopf'
import { App, ControlPanel, addStudioControls, paperWhite } from '@/studio'

import { CURVES } from '../_shared/curves'
import { edgeCurves, fiberCurves, orbitCurve } from '../_shared/gridCurves'
import { buildTorusScene, maxFeasibleK } from '../_shared/torusPoints'

const MAX_POINTS = 20000
const DIM = 0.82 // gray level for de-emphasized points during orbit highlight

// ── state (URL params override initial values: ?curve=1&k=3&fibers=8&grid=6&domain=1&trace=1) ──
const params = new URLSearchParams(location.search)
const num = (name: string, dflt: number) => (params.has(name) ? Number(params.get(name)) : dflt)
let curveIdx = num('curve', 0)
let k = num('k', 2)
let lobePin: number | null = params.has('lobes') ? Number(params.get('lobes')) : null
let candidates: Candidate[] = []
let candIdx = 0
let colorMode: 'degree' | 'order' | 'orbit' = 'degree'
let subfieldBoost = true
let baseRadius = 0.035
let alpha = 0
let beta = 0
let gamma = 0
let poleAngle = 0
let fiberCount = num('fibers', 0)
let gridCount = num('grid', 0)
let tubeRadius = 0.012
let selectedIdx: number | null = null
let showDomain = params.get('domain') === '1'

// ── app + renderables ───────────────────────────────────────────────────────
const app = new App()
const group = new S3Group()
app.stage.add(group)

let sceneData = rebuildSceneData()
const torusMesh = new HopfTorusMesh(sceneData.hopf)
const pointCloud = new PointCloud(sceneData.positions, { baseRadius })
const fiberTubes = new TubeSet([], { radius: tubeRadius, material: colored(0x4287f5) })
const edgeTubes = new TubeSet([], { radius: tubeRadius, material: colored(0xd43b3b) })
const orbitTube = new TubeSet([], { radius: tubeRadius * 0.8, material: colored(0xe8ac2a) })
group.add(torusMesh, pointCloud, fiberTubes, edgeTubes, orbitTube)

const plaque = new DomainPlaque(sceneData.hopf.lattice, sceneData.flat, { pointRadius: 0.014 })
if (showDomain) app.stage.add(plaque)

const readout = document.createElement('div')
readout.style.cssText =
  'position:fixed;left:12px;bottom:12px;font:12px system-ui;color:#333;background:rgba(255,255,255,0.85);' +
  'padding:6px 10px;border-radius:6px;display:none'
document.body.appendChild(readout)

// ── rebuild / style pipeline ────────────────────────────────────────────────
function rebuildSceneData() {
  const { data } = CURVES[curveIdx]!
  if (candidates.length === 0) {
    candidates = solveProfileCurve(tauOf(data.form), lobePin !== null ? { n: lobePin } : {})
    candIdx = Math.min(candIdx, candidates.length - 1)
  }
  const kMax = maxFeasibleK(data, MAX_POINTS)
  if (k > kMax) k = kMax
  return buildTorusScene(data, k, candidates[candIdx]!)
}

function applySceneData(frameCamera: boolean): void {
  selectedIdx = null
  torusMesh.setSurface(sceneData.hopf)
  pointCloud.setPoints(sceneData.positions)
  rebuildTubes()
  orbitTube.setCurves([])
  plaque.setLattice(sceneData.hopf.lattice)
  plaque.setPoints(sceneData.flat)
  applyStyle()
  group.setProjection(currentProjection())
  readout.style.display = 'none'
  if (frameCamera) frame()
  app.invalidate()
}

function rebuildTubes(): void {
  fiberTubes.setCurves(fiberCount > 0 ? fiberCurves(sceneData.hopf, fiberCount) : [])
  edgeTubes.setCurves(gridCount > 0 ? edgeCurves(sceneData.hopf, gridCount) : [])
}

function applyStyle(): void {
  const { E } = sceneData
  const colors = currentColors()
  const sizes = currentSizes() ?? E.points().map(() => 1)
  if (selectedIdx !== null) {
    const P = E.points()[selectedIdx]!
    const boost = highlightOrbit(E, P, 1.6)
    for (let i = 0; i < sizes.length; i++) {
      if (boost[i] === 1) {
        colors[3 * i] = colors[3 * i + 1] = colors[3 * i + 2] = DIM
      } else {
        sizes[i] = sizes[i]! * boost[i]!
      }
    }
  }
  pointCloud.setColors(colors)
  pointCloud.setSizes(sizes)
  plaque.setColors(colors)
  plaque.setSizes(sizes)
}

function currentColors(): Float32Array {
  const { E } = sceneData
  return colorMode === 'degree' ? colorByDegree(E) : colorMode === 'order' ? colorByOrder(E) : colorByOrbit(E)
}

function currentSizes(): number[] | null {
  return subfieldBoost ? sizeByDegree(sceneData.E, { subfieldBoost: 1.6 }) : null
}

function currentProjection(): S3Projection {
  const proj = new S3Projection()
  const qi = (a: number) => Quaternion.fromAxisAngle({ i: 1, j: 0, k: 0 }, a)
  const qj = (a: number) => Quaternion.fromAxisAngle({ i: 0, j: 1, k: 0 }, a)
  proj.rotation = [qi(alpha).mul(qj(gamma)), qi(beta)]
  proj.pole = new Vec4(0, 0, Math.sin(poleAngle), Math.cos(poleAngle))
  return proj
}

function frame(): void {
  // park the flat domain beside the torus (scaled to match) BEFORE framing,
  // so the camera fit accounts for it when visible
  torusMesh.geometry.computeBoundingSphere()
  const r = torusMesh.geometry.boundingSphere?.radius ?? 3
  plaque.position.set(-1.55 * r, 0.45 * r, 0)
  plaque.scale.setScalar(0.8 * r)
  app.frame()
}

// ── orbit picking ───────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster()
let downAt: [number, number] | null = null
app.renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]))
app.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  )
  raycaster.setFromCamera(ndc, app.camera)
  const idx = pointCloud.instanceAt(raycaster)
  selectedIdx = idx
  if (idx !== null) {
    const { E, hopf, lambda, flip } = sceneData
    const P = E.points()[idx]!
    orbitTube.setCurves([orbitCurve(E, P, lambda, hopf, flip)])
    readout.textContent =
      `point (${P.x}, ${P.y})/${E.N} · degree ${E.degree(P)} (F_p^${E.degree(P)}) · ` +
      `order ${E.order(P)} · orbit size ${E.degree(P)}`
    readout.style.display = 'block'
  } else {
    orbitTube.setCurves([])
    readout.style.display = 'none'
  }
  applyStyle()
  group.setProjection(currentProjection())
  app.invalidate()
})

// ── panel ───────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'first light' })
const curveTab = panel.tab('Curve')
const pointsTab = panel.tab('Points')
const viewTab = panel.tab('View')

const candidateLabels = () =>
  candidates.map((c, i) => ({
    value: String(i),
    label:
      `${c.stratum} n=${c.n} L=${(c.achieved.L / Math.PI).toFixed(2)}π` + (c.rep.flip ? ' (mirror)' : ''),
  }))

const candDropdown = curveTab.dropdown('Embedding', { options: candidateLabels(), value: '0' }, (v) => {
  candIdx = Number(v)
  sceneData = rebuildSceneData()
  applySceneData(true)
})

curveTab.dropdown(
  'Curve',
  { options: CURVES.map((c, i) => ({ label: c.label, value: String(i) })), value: String(curveIdx) },
  (v) => {
    curveIdx = Number(v)
    candidates = []
    candIdx = 0
    sceneData = rebuildSceneData()
    candDropdown.setOptions(candidateLabels(), '0')
    applySceneData(true)
    kSlider.set(k)
  },
)

const kSlider = curveTab.slider('k (field F_{p^k})', { min: 1, max: 6, step: 1, value: k }, (v) => {
  const kMax = maxFeasibleK(CURVES[curveIdx]!.data, MAX_POINTS)
  k = Math.min(v, kMax)
  if (k !== v) kSlider.set(k)
  sceneData = rebuildSceneData()
  applySceneData(false)
})

curveTab.dropdown(
  'Lobes n',
  {
    options: [
      { label: 'auto', value: 'auto' },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ label: String(n), value: String(n) })),
    ],
    value: lobePin === null ? 'auto' : String(lobePin),
  },
  (v) => {
    lobePin = v === 'auto' ? null : Number(v)
    candidates = []
    candIdx = 0
    sceneData = rebuildSceneData()
    candDropdown.setOptions(candidateLabels(), '0')
    applySceneData(true)
  },
)

pointsTab.dropdown(
  'Color by',
  {
    options: [
      { label: 'field of definition', value: 'degree' },
      { label: 'group order', value: 'order' },
      { label: 'Frobenius orbit', value: 'orbit' },
    ],
    value: colorMode,
  },
  (v) => {
    colorMode = v as typeof colorMode
    applyStyle()
    app.invalidate()
  },
)

pointsTab.slider('Radius', { min: 0.005, max: 0.12, step: 0.005, value: baseRadius }, (v) => {
  baseRadius = v
  pointCloud.setBaseRadius(v)
  app.invalidate()
})

pointsTab.toggle('Boost subfields', subfieldBoost, (v) => {
  subfieldBoost = v
  applyStyle()
  app.invalidate()
})

pointsTab.toggle('Show points', true, (v) => {
  pointCloud.visible = v
  app.invalidate()
})

pointsTab.toggle('Show flat domain', showDomain, (v) => {
  showDomain = v
  if (v) app.stage.add(plaque)
  else app.stage.remove(plaque)
  app.invalidate()
})

const reproject = () => {
  group.setProjection(currentProjection())
  app.invalidate()
}
viewTab.slider('Rotate α', { min: 0, max: 2 * Math.PI, step: 0.01, value: 0 }, (v) => ((alpha = v), reproject()))
viewTab.slider('Rotate β', { min: 0, max: 2 * Math.PI, step: 0.01, value: 0 }, (v) => ((beta = v), reproject()))
viewTab.slider('Rotate γ', { min: 0, max: Math.PI, step: 0.01, value: 0 }, (v) => ((gamma = v), reproject()))
viewTab.slider('Pole tilt', { min: 0, max: Math.PI, step: 0.01, value: 0 }, (v) => ((poleAngle = v), reproject()))

viewTab.slider('Fibers', { min: 0, max: 24, step: 1, value: fiberCount }, (v) => {
  fiberCount = v
  rebuildTubes()
  reproject()
})
viewTab.slider('Gridlines', { min: 0, max: 24, step: 1, value: gridCount }, (v) => {
  gridCount = v
  rebuildTubes()
  reproject()
})
viewTab.slider('Tube radius', { min: 0.004, max: 0.05, step: 0.002, value: tubeRadius }, (v) => {
  tubeRadius = v
  fiberTubes.setRadius(v)
  edgeTubes.setRadius(v)
  orbitTube.setRadius(v * 0.8)
  app.invalidate()
})

viewTab.toggle('Glass torus', true, (v) => {
  torusMesh.setMaterial(v ? glass() : matte(0xdde3ea))
  app.invalidate()
})
viewTab.toggle('Show torus', true, (v) => {
  torusMesh.visible = v
  app.invalidate()
})

// ── studio ──────────────────────────────────────────────────────────────────
const handle = app.setStudio(paperWhite)
addStudioControls(panel, app, handle, {
  renderName: 'first-light',
  sidecar: () => ({
    curve: CURVES[curveIdx]!.label,
    k,
    embedding: candidateLabels()[candIdx]?.label,
    colorMode,
    projection: { alpha, beta, gamma, poleAngle },
    fibers: fiberCount,
    gridlines: gridCount,
  }),
})

panel.mount(document.body)

// ── go ──────────────────────────────────────────────────────────────────────
applySceneData(true)
if (params.get('trace') === '1') app.mode = 'trace'
// headless-capture hook: block during load until N samples are in the canvas
if (params.has('blocktrace')) app.stepTrace(Number(params.get('blocktrace')))
app.start()

export {}
