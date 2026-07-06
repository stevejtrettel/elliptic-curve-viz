import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Complex } from '@/math/core'

import { DomainPlaque } from '@/geometry'

const LATTICE: [Complex, Complex] = [new Complex(2 * Math.PI, 0), new Complex(1.5, 4)]

describe('DomainPlaque', () => {
  it('parallelogram corners are 0, ω₁, ω₁+ω₂, ω₂ (normalized)', () => {
    const plaque = new DomainPlaque(LATTICE, [])
    const mesh = plaque.children[0] as THREE.Mesh
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const s = 1 / (2 * Math.PI) // max(|ω₁|, |ω₂|) = 2π
    expect(pos.count).toBe(4)
    expect([pos.getX(0), pos.getY(0)]).toEqual([0, 0])
    expect(pos.getX(1)).toBeCloseTo(2 * Math.PI * s, 6)
    expect(pos.getY(1)).toBeCloseTo(0, 6)
    expect(pos.getX(2)).toBeCloseTo((2 * Math.PI + 1.5) * s, 6)
    expect(pos.getY(2)).toBeCloseTo(4 * s, 6)
    expect(pos.getX(3)).toBeCloseTo(1.5 * s, 6)
    expect(pos.getY(3)).toBeCloseTo(4 * s, 6)
  })

  it('places instanced points at normalized complex coordinates with sizes', () => {
    const pts = [new Complex(0, 0), new Complex(Math.PI, 2)]
    const plaque = new DomainPlaque(LATTICE, pts, { pointRadius: 0.1, sizes: [1, 3] })
    const spheres = plaque.children[1] as THREE.InstancedMesh
    expect(spheres.count).toBe(2)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    spheres.getMatrixAt(1, m)
    m.decompose(p, q, sc)
    const s = 1 / (2 * Math.PI)
    expect(p.x).toBeCloseTo(Math.PI * s, 6)
    expect(p.y).toBeCloseTo(2 * s, 6)
    expect(sc.x).toBeCloseTo(0.3, 6)
  })

  it('setPoints with a different count reallocates; colors follow', () => {
    const plaque = new DomainPlaque(LATTICE, [new Complex(1, 1)])
    const before = plaque.children[1]
    plaque.setPoints([new Complex(1, 1), new Complex(2, 2)], new Float32Array([1, 0, 0, 0, 0, 1]))
    expect(plaque.children[1]).not.toBe(before)
    expect((plaque.children[1] as THREE.InstancedMesh).count).toBe(2)
  })

  it('setLines builds one ribbon mesh per set, in plaque-local coordinates', () => {
    const plaque = new DomainPlaque(LATTICE, [])
    const base = plaque.children.length
    plaque.setLines([
      { segments: [[new Complex(0, 0), new Complex(Math.PI, 0)]], color: 0x43a33b },
      { segments: [[new Complex(0, 0), new Complex(0, 2)]], color: 0x7d46bd, width: 0.02 },
    ])
    expect(plaque.children.length).toBe(base + 2)
    const ribbon = plaque.children[base] as THREE.Mesh
    const pos = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBe(4) // one quad per segment
    // quad spans the segment: x runs 0 → π·scaleNorm, y = ±width/2
    const s = 1 / (2 * Math.PI)
    expect(Math.max(pos.getX(2), pos.getX(3))).toBeCloseTo(Math.PI * s, 6)
    expect(Math.abs(pos.getY(0))).toBeCloseTo(0.004, 6)
    // clearing removes the meshes and their resources
    plaque.setLines([])
    expect(plaque.children.length).toBe(base)
  })

  it('setOutline draws the four walls with corner joints; null removes', () => {
    const plaque = new DomainPlaque(LATTICE, [])
    const base = plaque.children.length
    plaque.setOutline({ radius: 0.01 })
    expect(plaque.children.length).toBe(base + 1)
    const group = plaque.children[base] as THREE.Group
    expect(group.children.length).toBe(8) // 4 wall tubes + 4 corner spheres
    // wall tubes span the parallelogram sides (normalized): |ω₁|·s = 1
    const wall = group.children[0] as THREE.Mesh
    expect(wall.scale.y).toBeCloseTo(1, 6)
    plaque.setOutline(null)
    expect(plaque.children.length).toBe(base)
  })

  it('setGrid draws interior lines only: (u−1) + (v−1) tubes', () => {
    const plaque = new DomainPlaque(LATTICE, [])
    const base = plaque.children.length
    plaque.setGrid({ u: 4, v: 3 })
    const group = plaque.children[base] as THREE.Group
    expect(group.children.length).toBe(3 + 2)
    plaque.setGrid(null)
    expect(plaque.children.length).toBe(base)
  })

  it('outline and grid survive a lattice change (rebuilt to the new shape)', () => {
    const plaque = new DomainPlaque(LATTICE, [])
    plaque.setOutline({})
    plaque.setGrid({ u: 2, v: 2 })
    const count = plaque.children.length
    plaque.setLattice([new Complex(1, 0), new Complex(0.2, 0.9)])
    expect(plaque.children.length).toBe(count)
  })

  it('setLattice rescales the plaque', () => {
    const plaque = new DomainPlaque(LATTICE, [])
    plaque.setLattice([new Complex(1, 0), new Complex(0, 0.5)])
    const mesh = plaque.children[0] as THREE.Mesh
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(pos.getX(1)).toBeCloseTo(1, 6) // ω₁ normalized to length 1
    expect(pos.getY(3)).toBeCloseTo(0.5, 6)
  })
})
