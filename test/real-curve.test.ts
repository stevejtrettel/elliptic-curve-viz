import { describe, expect, it } from 'vitest'

import { cubicRealRoots, realEllipticCurve } from '@/math/elliptic'

/** Cases spanning the two topological types (by sign of −4a³−27b²). */
const THREE_ROOT = [
  { a: -1, b: 0 }, // y²=x³−x, roots −1,0,1
  { a: -2, b: 1 }, // roots (−1−√5)/2, (√5−1)/2, 1
]
const ONE_ROOT = [
  { a: 0, b: 1 }, // y²=x³+1, root −1
  { a: -1, b: 1 }, // −4(−1)−27 = −23 < 0
]

describe('cubicRealRoots', () => {
  it('returns three real roots when −4a³−27b² > 0, each a root of the cubic', () => {
    for (const { a, b } of THREE_ROOT) {
      const roots = cubicRealRoots(a, b)
      expect(roots).toHaveLength(3)
      // ascending
      expect(roots[0]!).toBeLessThan(roots[1]!)
      expect(roots[1]!).toBeLessThan(roots[2]!)
      for (const r of roots) expect(Math.abs(r ** 3 + a * r + b)).toBeLessThan(1e-9)
    }
  })

  it('returns one real root when −4a³−27b² < 0', () => {
    for (const { a, b } of ONE_ROOT) {
      const roots = cubicRealRoots(a, b)
      expect(roots).toHaveLength(1)
      const r = roots[0]!
      expect(Math.abs(r ** 3 + a * r + b)).toBeLessThan(1e-9)
    }
  })

  it('finds the exact roots of x³−x', () => {
    const roots = cubicRealRoots(-1, 0)
    expect(roots[0]!).toBeCloseTo(-1, 9)
    expect(roots[1]!).toBeCloseTo(0, 9)
    expect(roots[2]!).toBeCloseTo(1, 9)
  })
})

describe('realEllipticCurve', () => {
  it('three real roots → an oval (closed) + an unbounded branch (open)', () => {
    for (const { a, b } of THREE_ROOT) {
      const comps = realEllipticCurve(a, b)
      expect(comps).toHaveLength(2)
      expect(comps.filter((c) => c.closed)).toHaveLength(1) // the oval
      expect(comps.filter((c) => !c.closed)).toHaveLength(1) // the branch
    }
  })

  it('one real root → a single unbounded branch', () => {
    for (const { a, b } of ONE_ROOT) {
      const comps = realEllipticCurve(a, b)
      expect(comps).toHaveLength(1)
      expect(comps[0]!.closed).toBe(false)
    }
  })

  it('every sampled point satisfies y² = x³ + a·x + b', () => {
    for (const { a, b } of [...THREE_ROOT, ...ONE_ROOT]) {
      for (const comp of realEllipticCurve(a, b)) {
        for (const [x, y] of comp.points) {
          expect(Math.abs(y * y - (x ** 3 + a * x + b))).toBeLessThan(1e-6)
        }
      }
    }
  })
})
