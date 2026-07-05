import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Vec4 } from '@/math/core'
import { S3Projection } from '@/math/hopf'

import { PointCloud, bakeInstancedMesh, traceSphereDetail } from '@/geometry'

// small clouds bake at the finest subdivision within the triangle budget
const SPHERE_VERTS = new THREE.IcosahedronGeometry(1, traceSphereDetail(3)).getAttribute('position').count

function makeInstanced(count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshPhysicalMaterial(), count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    dummy.position.set(i, 2 * i, 0)
    dummy.scale.setScalar(0.5)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    mesh.setColorAt(i, new THREE.Color(i === 0 ? 0xff0000 : 0x0000ff))
  }
  return mesh
}

describe('bakeInstancedMesh', () => {
  it('merges instances into one geometry with per-vertex colors', () => {
    const baked = bakeInstancedMesh(makeInstanced(3))
    const pos = baked.geometry.getAttribute('position')
    const col = baked.geometry.getAttribute('color')
    expect(pos.count).toBe(3 * SPHERE_VERTS)
    expect(col.count).toBe(pos.count)
    expect(col.itemSize).toBe(4) // RGBA — the tracer's pipeline requires 4-component color
    expect(col.getW(0)).toBe(1)
    // instance 0 red, instance 1 blue
    expect(col.getX(0)).toBeCloseTo(1, 6)
    expect(col.getZ(SPHERE_VERTS)).toBeCloseTo(1, 6)
    const mat = baked.material as THREE.MeshPhysicalMaterial
    expect(mat.vertexColors).toBe(true)
  })

  it('applies instance transforms (centroid of instance i is its position)', () => {
    const baked = bakeInstancedMesh(makeInstanced(2))
    const pos = baked.geometry.getAttribute('position')
    let cx = 0
    let cy = 0
    for (let k = SPHERE_VERTS; k < 2 * SPHERE_VERTS; k++) {
      cx += pos.getX(k)
      cy += pos.getY(k)
    }
    expect(cx / SPHERE_VERTS).toBeCloseTo(1, 5)
    expect(cy / SPHERE_VERTS).toBeCloseTo(2, 5)
  })

  it('skips zero-scaled (hidden) instances', () => {
    const mesh = makeInstanced(3)
    mesh.setMatrixAt(1, new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))
    const baked = bakeInstancedMesh(mesh)
    expect(baked.geometry.getAttribute('position').count).toBe(2 * SPHERE_VERTS)
  })
})

describe('traceSphereDetail', () => {
  it('spends the triangle budget: finest for small clouds, coarser as counts grow', () => {
    expect(traceSphereDetail(300)).toBe(4) // 5120 tris/sphere
    expect(traceSphereDetail(2000)).toBe(3)
    expect(traceSphereDetail(9000)).toBe(2)
    expect(traceSphereDetail(20000)).toBe(1) // floor — never below the old fixed template
  })

  it('never exceeds ~the budget', () => {
    for (const count of [10, 500, 3000, 9375, 25000]) {
      expect(count * 20 * 4 ** traceSphereDetail(count)).toBeLessThanOrEqual(3_000_000)
    }
  })
})

describe('PointCloud.setMode', () => {
  const pts = [new Vec4(1, 0, 0, 0), new Vec4(0, 1, 0, 0)]

  it('toggles between live instanced mesh and the trace bake', () => {
    const cloud = new PointCloud(pts, { baseRadius: 0.1 })
    cloud.reproject(new S3Projection())
    cloud.setMode('trace')
    const children = cloud.children
    expect(children).toHaveLength(2)
    const instanced = children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh)!
    const baked = children.find((c) => !(c as THREE.InstancedMesh).isInstancedMesh)!
    expect(instanced.visible).toBe(false)
    expect(baked.visible).toBe(true)
    cloud.setMode('live')
    expect(instanced.visible).toBe(true)
    expect(baked.visible).toBe(false)
  })

  it('re-bakes after content changes while in trace mode', () => {
    const cloud = new PointCloud(pts, { baseRadius: 0.1 })
    cloud.reproject(new S3Projection())
    cloud.setMode('trace')
    const bakedBefore = cloud.children.find((c) => !(c as THREE.InstancedMesh).isInstancedMesh) as THREE.Mesh
    cloud.setColors(new Float32Array([1, 0, 0, 0, 1, 0]))
    const bakedAfter = cloud.children.find((c) => !(c as THREE.InstancedMesh).isInstancedMesh) as THREE.Mesh
    expect(bakedAfter).not.toBe(bakedBefore)
    expect(bakedAfter.geometry.getAttribute('color').getX(0)).toBeCloseTo(1, 6)
  })
})
