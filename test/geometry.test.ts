import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { type CurveData, pointsOver } from '@/math/arithmetic'
import { Vec4 } from '@/math/core'
import { HopfTorus, LatitudeCircle, S3Projection } from '@/math/hopf'

import {
  HopfTorusMesh,
  PALETTES,
  PointCloud,
  S3Group,
  colorByDegree,
  colorByOrbit,
  colorByOrder,
  highlightOrbit,
  sizeByDegree,
} from '@/geometry'

const torus = new HopfTorus(new LatitudeCircle(Math.acos(1 / 3)))

const DATA: CurveData = {
  form: { a: 1n, b: 0n, c: 2n },
  trace: 6n,
  p: 11n,
  sign: 1,
} // disc −8 at p = 11 (the fixture curve)

describe('HopfTorusMesh', () => {
  const mesh = new HopfTorusMesh(torus, { uSegments: 16, xSegments: 12 })
  const proj = new S3Projection()
  mesh.reproject(proj)

  it('allocates the inclusive grid with the full quad index', () => {
    const pos = mesh.geometry.getAttribute('position')
    expect(pos.count).toBe(17 * 13)
    expect(mesh.geometry.getIndex()!.count).toBe(6 * 16 * 12)
  })

  it('seam vertices coincide (periodic evaluation)', () => {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let j = 0; j <= 12; j++) {
      const first = j * 17
      const last = j * 17 + 16
      expect(pos.getX(first)).toBeCloseTo(pos.getX(last), 5)
      expect(pos.getY(first)).toBeCloseTo(pos.getY(last), 5)
      expect(pos.getZ(first)).toBeCloseTo(pos.getZ(last), 5)
    }
  })

  it('positions match the projected S³ cache (Float32 narrowing only)', () => {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const p = proj.project(torus.surfaceFrame(0, 0).point)
    expect(pos.getX(0)).toBeCloseTo(p.x, 5)
    expect(pos.getY(0)).toBeCloseTo(p.y, 5)
    expect(pos.getZ(0)).toBeCloseTo(p.z, 5)
  })

  it('normals point OUTWARD, agreeing with the positive-volume winding (glass depends on this)', () => {
    // the path tracer decides glass entering/exiting from the shading normal:
    // inward normals render transmission as black (found the hard way, Phase 4)
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const nor = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    const idx = mesh.geometry.getIndex()!
    let volume = 0
    let disagree = 0
    for (let t = 0; t < idx.count; t += 3) {
      const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
      const abx = pos.getX(b) - pos.getX(a)
      const aby = pos.getY(b) - pos.getY(a)
      const abz = pos.getZ(b) - pos.getZ(a)
      const acx = pos.getX(c) - pos.getX(a)
      const acy = pos.getY(c) - pos.getY(a)
      const acz = pos.getZ(c) - pos.getZ(a)
      const nx = aby * acz - abz * acy
      const ny = abz * acx - abx * acz
      const nz = abx * acy - aby * acx
      volume += pos.getX(a) * nx + pos.getY(a) * ny + pos.getZ(a) * nz
      if (nx * nor.getX(a) + ny * nor.getY(a) + nz * nor.getZ(a) <= 0) disagree++
    }
    expect(volume).toBeGreaterThan(0) // outward winding
    expect(disagree).toBe(0) // shading normals agree with it
  })

  it('normals are unit and reprojection is idempotent', () => {
    const nor = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    for (const v of [0, 40, 100]) {
      expect(Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v))).toBeCloseTo(1, 5)
    }
    const before = Array.from(mesh.geometry.getAttribute('position').array.slice(0, 30))
    mesh.reproject(proj)
    const after = Array.from(mesh.geometry.getAttribute('position').array.slice(0, 30))
    expect(after).toEqual(before)
  })

  it('cuts holes when the projection pole lies on the torus', () => {
    const m2 = new HopfTorusMesh(torus, { uSegments: 16, xSegments: 12 })
    const onTorus = new S3Projection()
    onTorus.pole = torus.surfaceFrame(0, 0).point // pole exactly on a vertex
    m2.reproject(onTorus)
    const index = m2.geometry.getIndex()!
    expect(index.count).toBeLessThan(6 * 16 * 12) // some quads dropped
    const pos = m2.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let t = 0; t < index.count; t++) {
      const v = index.getX(t)
      const r = Math.hypot(pos.getX(v), pos.getY(v), pos.getZ(v))
      expect(Number.isFinite(r)).toBe(true)
      expect(r).toBeLessThan(1e6)
    }
    // switching back to a benign projection restores the full index
    m2.reproject(new S3Projection())
    expect(m2.geometry.getIndex()!.count).toBe(6 * 16 * 12)
  })
})

describe('PointCloud', () => {
  const pts = [new Vec4(1, 0, 0, 0), new Vec4(0, 1, 0, 0), new Vec4(0, 0.6, 0, 0.8)]
  const proj = new S3Projection()

  it('applies the conformal compensation to instance scales', () => {
    const cloud = new PointCloud(pts, { baseRadius: 0.05 })
    cloud.reproject(proj)
    const mesh = cloud.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    mesh.getMatrixAt(2, m)
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
    // scaleFactor(0,0.6,0,0.8) = 2/(1−0.8) = 10 → scale = 0.05 · 10/2 = 0.25
    expect(s.x).toBeCloseTo(0.25, 6)
    mesh.getMatrixAt(0, m)
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
    expect(s.x).toBeCloseTo(0.05, 6) // w = 0: scaleFactor 2 → factor 1
  })

  it('setPoints with the same count keeps the same InstancedMesh', () => {
    const cloud = new PointCloud(pts, { baseRadius: 0.05 })
    const before = cloud.children[0]
    cloud.setPoints([new Vec4(0, 0, 1, 0), new Vec4(1, 0, 0, 0), new Vec4(0, 1, 0, 0)])
    expect(cloud.children[0]).toBe(before)
    cloud.setPoints([new Vec4(0, 0, 1, 0)])
    expect(cloud.children[0]).not.toBe(before)
    expect((cloud.children[0] as THREE.InstancedMesh).count).toBe(1)
  })

  it('sizes multiply the base radius', () => {
    const cloud = new PointCloud(pts, { baseRadius: 0.1, sizes: [1, 2, 1] })
    cloud.reproject(proj)
    const mesh = cloud.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const s = new THREE.Vector3()
    mesh.getMatrixAt(1, m)
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s)
    expect(s.x).toBeCloseTo(0.2, 6) // w = 0 → conformal factor 1, size 2
  })
})

describe('S3Group', () => {
  it('fans setProjection out to all members, including nested ones', () => {
    const group = new S3Group()
    const cloud = new PointCloud([new Vec4(0, 0.6, 0, 0.8)], { baseRadius: 0.1 })
    const inner = new THREE.Group()
    inner.add(cloud)
    group.add(inner) // add() reprojects immediately
    const mesh = cloud.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    mesh.getMatrixAt(0, m)
    pos.setFromMatrixPosition(m)
    expect(pos.y).toBeCloseTo(3, 6) // σ(0,0.6,0,0.8) = (0, 3, 0)
    // a new projection with a rotated pole moves the instance
    const proj = new S3Projection()
    proj.pole = new Vec4(0, 0, 1, 0)
    group.setProjection(proj)
    mesh.getMatrixAt(0, m)
    pos.setFromMatrixPosition(m)
    expect(pos.y).not.toBeCloseTo(3, 2)
  })
})

describe('style helpers', () => {
  const E = pointsOver(DATA, 4) // Z/12 × Z/1224, plenty of structure

  it('arrays are parallel to E.points()', () => {
    expect(colorByDegree(E).length).toBe(3 * E.size)
    expect(colorByOrder(E).length).toBe(3 * E.size)
    expect(colorByOrbit(E).length).toBe(3 * E.size)
    expect(sizeByDegree(E).length).toBe(E.size)
  })

  it('colorByDegree is constant on orbits and distinguishes degrees', () => {
    const colors = colorByDegree(E)
    const pts = E.points()
    const byDegree = new Map<number, string>()
    pts.forEach((P, i) => {
      const key = `${colors[3 * i]},${colors[3 * i + 1]},${colors[3 * i + 2]}`
      const d = E.degree(P)
      if (byDegree.has(d)) expect(byDegree.get(d)).toBe(key)
      else byDegree.set(d, key)
    })
    expect(new Set(byDegree.values()).size).toBe(byDegree.size) // distinct colors per degree
  })

  it('sizeByDegree boosts exactly the subfield points, graded by tower depth', () => {
    const sizes = sizeByDegree(E, { subfieldBoost: 2 })
    const pts = E.points()
    pts.forEach((P, i) => {
      const d = E.degree(P)
      if (d === 4) expect(sizes[i]).toBe(1)
      if (d === 2) expect(sizes[i]).toBe(2) // one tower step
      if (d === 1) expect(sizes[i]).toBe(4) // two tower steps (4 = 2²)
    })
  })

  it('highlightOrbit boosts one orbit only', () => {
    const orbit = E.orbits().find((o) => o.degree === 4)!
    const sizes = highlightOrbit(E, orbit.points[0]!, 3)
    const boosted = sizes.filter((s) => s === 3).length
    expect(boosted).toBe(4)
  })

  it('palette exists and cycles', () => {
    expect(PALETTES.classic.length).toBeGreaterThanOrEqual(7)
  })
})
