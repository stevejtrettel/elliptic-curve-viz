// Phase 0 toolchain proof: three.js renders through the demo system. Throwaway.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf4f4f4)

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(2, 1.5, 3)

const controls = new OrbitControls(camera, renderer.domElement)

const torus = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.8, 0.28, 256, 48),
  new THREE.MeshNormalMaterial(),
)
scene.add(torus)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

renderer.setAnimationLoop((time) => {
  torus.rotation.y = time / 4000
  controls.update()
  renderer.render(scene, camera)
})
