import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { arrange } from '@/author'

const groups = (n: number) => Array.from({ length: n }, () => new THREE.Group())

describe('arrange', () => {
  it('row centers equal tori on the x-axis, touching at spacing 0', () => {
    const g = groups(3)
    arrange(g, [1, 1, 1], { type: 'row', spacing: 0, equalize: false })
    expect(g.map((s) => s.position.x)).toEqual([-2, 0, 2]) // radius 1 → centers 2 apart
    expect(g.every((s) => s.position.y === 0 && s.position.z === 0)).toBe(true)
    expect(g.every((s) => s.scale.x === 1)).toBe(true)
  })

  it('equalize scales each torus to the median radius (outliers shrink)', () => {
    const g = groups(4)
    // median of [1,2,3,100] = 2.5; the giant shrinks, the small ones grow
    arrange(g, [1, 2, 3, 100], { type: 'row', spacing: 0, equalize: true })
    expect(g[0]!.scale.x).toBeCloseTo(2.5, 6) // radius 1 → ×2.5
    expect(g[3]!.scale.x).toBeCloseTo(0.025, 6) // radius 100 → ×0.025
  })

  it('ring places tori on a circle in the y = 0 plane', () => {
    const g = groups(4)
    arrange(g, [1, 1, 1, 1], { type: 'ring', spacing: 0.5, equalize: false })
    const r = Math.hypot(g[0]!.position.x, g[0]!.position.z)
    for (const s of g) {
      expect(Math.hypot(s.position.x, s.position.z)).toBeCloseTo(r, 6) // same radius
      expect(s.position.y).toBe(0)
    }
    // 4 tori → 90° apart: #0 and #2 are antipodal
    expect(g[2]!.position.x).toBeCloseTo(-g[0]!.position.x, 6)
  })

  it('grid fills rows by ceil(√n) columns', () => {
    const g = groups(4)
    arrange(g, [1, 1, 1, 1], { type: 'grid', spacing: 0, equalize: false })
    // 2×2: two distinct x's and two distinct z's
    expect(new Set(g.map((s) => s.position.x)).size).toBe(2)
    expect(new Set(g.map((s) => s.position.z)).size).toBe(2)
  })
})
