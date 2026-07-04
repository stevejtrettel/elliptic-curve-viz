/**
 * first-light — the Phase 3 milestone demo (DESIGN.md §11): a glass Hopf torus
 * with the exact points of E(F_{p^k}) riding on it. Wiring only: every line
 * binds a panel control to a renderable setter or a rebuild.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import {
  HopfTorusMesh,
  PointCloud,
  S3Group,
  colorByDegree,
  colorByOrbit,
  colorByOrder,
  glass,
  matte,
  sizeByDegree,
} from '@/geometry'
import { tauOf } from '@/math/arithmetic'
import { Quaternion, Vec4 } from '@/math/core'
import { type Candidate, solveProfileCurve } from '@/math/families'
import { S3Projection } from '@/math/hopf'
import { ControlPanel } from '@/studio'

import { CURVES } from '../_shared/curves'
import { buildTorusScene, maxFeasibleK } from '../_shared/torusPoints'

const MAX_POINTS = 20000

// ── three.js boilerplate ────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf2f3f5)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 500)
camera.position.set(3, 2, 4)
const controls = new OrbitControls(camera, renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 0.35))
const key = new THREE.DirectionalLight(0xffffff, 1.2)
key.position.set(5, 8, 6)
scene.add(key)
const back = new THREE.DirectionalLight(0xffffff, 0.4)
back.position.set(-6, -3, -5)
scene.add(back)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── state ───────────────────────────────────────────────────────────────────
let curveIdx = 0
let k = 2
let lobePin: number | null = null
let candidates: Candidate[] = []
let candIdx = 0
let colorMode: 'degree' | 'order' | 'orbit' = 'degree'
let subfieldBoost = true
let baseRadius = 0.035
let alpha = 0
let beta = 0
let gamma = 0
let poleAngle = 0

// ── renderables (built once, resurfaced on change) ─────────────────────────
const group = new S3Group()
scene.add(group)

let sceneData = rebuildSceneData()
const torusMesh = new HopfTorusMesh(sceneData.hopf)
const pointCloud = new PointCloud(sceneData.positions, { baseRadius })
group.add(torusMesh, pointCloud)

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
  torusMesh.setSurface(sceneData.hopf)
  pointCloud.setPoints(sceneData.positions, currentColors(), currentSizes())
  group.setProjection(currentProjection())
  if (frameCamera) frame()
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
  torusMesh.geometry.computeBoundingSphere()
  const r = torusMesh.geometry.boundingSphere?.radius ?? 3
  const dir = camera.position.clone().sub(controls.target).normalize()
  camera.position.copy(dir.multiplyScalar(Math.max(2.5, 3.1 * r)))
  controls.target.set(0, 0, 0)
  controls.update()
}

function candidateLabels() {
  return candidates.map((c, i) => ({
    value: String(i),
    label:
      `${c.stratum} n=${c.n} L=${(c.achieved.L / Math.PI).toFixed(2)}π` + (c.rep.flip ? ' (mirror)' : ''),
  }))
}

// ── panel ───────────────────────────────────────────────────────────────────
const panel = new ControlPanel({ title: 'first light' })
const curveTab = panel.tab('Curve')
const pointsTab = panel.tab('Points')
const viewTab = panel.tab('View')

const candDropdown = curveTab.dropdown('Embedding', { options: candidateLabels(), value: '0' }, (v) => {
  candIdx = Number(v)
  sceneData = rebuildSceneData()
  applySceneData(true)
})

curveTab.dropdown(
  'Curve',
  { options: CURVES.map((c, i) => ({ label: c.label, value: String(i) })), value: '0' },
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
    options: [{ label: 'auto', value: 'auto' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ label: String(n), value: String(n) }))],
    value: 'auto',
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
    pointCloud.setColors(currentColors())
  },
)

pointsTab.slider('Radius', { min: 0.005, max: 0.12, step: 0.005, value: baseRadius }, (v) => {
  baseRadius = v
  pointCloud.setBaseRadius(v)
})

pointsTab.toggle('Boost subfields', subfieldBoost, (v) => {
  subfieldBoost = v
  pointCloud.setSizes(currentSizes())
})

pointsTab.toggle('Show points', true, (v) => (pointCloud.visible = v))

const reproject = () => group.setProjection(currentProjection())
viewTab.slider('Rotate α', { min: 0, max: 2 * Math.PI, step: 0.01, value: 0 }, (v) => ((alpha = v), reproject()))
viewTab.slider('Rotate β', { min: 0, max: 2 * Math.PI, step: 0.01, value: 0 }, (v) => ((beta = v), reproject()))
viewTab.slider('Rotate γ', { min: 0, max: Math.PI, step: 0.01, value: 0 }, (v) => ((gamma = v), reproject()))
viewTab.slider('Pole tilt', { min: 0, max: Math.PI, step: 0.01, value: 0 }, (v) => ((poleAngle = v), reproject()))

viewTab.toggle('Glass torus', true, (v) => torusMesh.setMaterial(v ? glass() : matte(0xdde3ea)))
viewTab.toggle('Show torus', true, (v) => (torusMesh.visible = v))

panel.mount(document.body)

// ── go ──────────────────────────────────────────────────────────────────────
applySceneData(true)
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})

export {}
