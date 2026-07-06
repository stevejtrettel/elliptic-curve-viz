import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Vec3 } from '@/math/core'
import { LatitudeCircle, sphereToR3 } from '@/math/hopf'

import { BaseSphere } from '@/geometry'

const PHI0 = Math.acos(1 / 3)
const CURVE = new LatitudeCircle(PHI0).sample(64)

describe('BaseSphere', () => {
  it('draws the profile curve as a closed tube of on-sphere samples', () => {
    const base = new BaseSphere()
    base.setCurve(CURVE)
    const tube = base.children[1] as THREE.Mesh
    const pos = tube.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBeGreaterThan(0)
    // tube vertices stay within tubeRadius of the unit sphere
    for (let i = 0; i < pos.count; i += 37) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))
      expect(Math.abs(r - 1)).toBeLessThanOrEqual(0.021)
    }
  })

  it('places marks at given ℝ³ positions with per-mark colors', () => {
    const base = new BaseSphere()
    base.setCurve(CURVE)
    const p = sphereToR3(CURVE[0]!)
    base.setMarks([new Vec3(p.x, p.y, p.z)], new Float32Array([1, 0, 0]))
    const marks = base.children[2] as THREE.InstancedMesh
    expect(marks.count).toBe(1)
    const m = new THREE.Matrix4()
    marks.getMatrixAt(0, m)
    const v = new THREE.Vector3().setFromMatrixPosition(m)
    expect(v.x).toBeCloseTo(p.x, 6) // instance matrices are Float32
    expect(v.z).toBeCloseTo(p.z, 6)
  })

  it('area cap: spherical-cap triangulation area ≈ 2π(1 − cos φ₀), toggles off', () => {
    const base = new BaseSphere()
    base.setCurve(new LatitudeCircle(PHI0).sample(256))
    const before = base.children.length
    base.setCap({})
    expect(base.children.length).toBe(before + 1)
    const cap = base.children[before] as THREE.Mesh
    // sum triangle areas: for a latitude circle the enclosed region is a
    // spherical cap of area A = 2π(1 − cos φ₀) — the closed form the solver
    // uses. Flat triangulation slightly underestimates; ~1% at this density.
    const posAttr = cap.geometry.getAttribute('position') as THREE.BufferAttribute
    const index = cap.geometry.getIndex()!
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    let area = 0
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(posAttr, index.getX(i))
      b.fromBufferAttribute(posAttr, index.getX(i + 1))
      c.fromBufferAttribute(posAttr, index.getX(i + 2))
      area += b.sub(a).cross(c.sub(a)).length() / 2
    }
    const A = 2 * Math.PI * (1 - Math.cos(PHI0))
    expect(area).toBeGreaterThan(0.97 * A)
    expect(area).toBeLessThan(1.03 * A)
    base.setCap(null)
    expect(base.children.length).toBe(before)
  })
})
