/**
 * Trace-mode bake (DESIGN.md §6): the path tracer does not support
 * InstancedMesh (survey §5), so instanced renderables maintain a second
 * representation for mode: 'trace' — ONE merged BufferGeometry (low-tess
 * sphere per instance, transformed) with per-point colors as a per-vertex
 * `color` attribute and a single vertexColors material. Consequence: per-point
 * variation in trace mode is color-only.
 */
import * as THREE from 'three'

const TEMPLATE = new THREE.IcosahedronGeometry(1, 1) // 42 verts / 80 tris per point

export function bakeInstancedMesh(mesh: THREE.InstancedMesh): THREE.Mesh {
  const tPos = TEMPLATE.getAttribute('position') as THREE.BufferAttribute
  const tNor = TEMPLATE.getAttribute('normal') as THREE.BufferAttribute
  const vPer = tPos.count // icosahedron geometry is non-indexed triangle soup

  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const m = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const v = new THREE.Vector3()
  const c = new THREE.Color(1, 1, 1)

  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    if (Math.abs(m.determinant()) < 1e-30) continue // zero-scaled (hidden) instances
    nm.getNormalMatrix(m)
    if (mesh.instanceColor) c.fromBufferAttribute(mesh.instanceColor as THREE.BufferAttribute, i)
    for (let k = 0; k < vPer; k++) {
      v.fromBufferAttribute(tPos, k).applyMatrix4(m)
      positions.push(v.x, v.y, v.z)
      v.fromBufferAttribute(tNor, k).applyMatrix3(nm).normalize()
      normals.push(v.x, v.y, v.z)
      colors.push(c.r, c.g, c.b)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material
  const material = source.clone() as THREE.MeshPhysicalMaterial
  material.vertexColors = true
  if ('color' in material) material.color = new THREE.Color(1, 1, 1)
  return new THREE.Mesh(geometry, material)
}

/** Renderables with a live/trace dual representation. */
export interface TraceBakeable {
  setMode(mode: 'live' | 'trace'): void
}

export function isTraceBakeable(obj: object): obj is TraceBakeable {
  return 'setMode' in obj && typeof (obj as TraceBakeable).setMode === 'function'
}
