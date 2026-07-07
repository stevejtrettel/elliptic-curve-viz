import { describe, expect, it } from 'vitest'

import {
  FiniteField,
  ProjectivePlane,
  affineCurve,
  gridEmbedding,
  weierstrass,
} from '@/math/finite-field'
import type { ProjectivePoint } from '@/math/finite-field'

const PRIMES = [5, 7, 11, 13]

describe('FiniteField arithmetic', () => {
  it('inverse and division invert multiplication', () => {
    for (const p of PRIMES) {
      const F = new FiniteField(p)
      for (const x of F.elements()) {
        if (F.mod(x) === 0) continue
        expect(F.mul(x, F.inv(x))).toBe(1)
        expect(F.div(x, x)).toBe(1)
      }
    }
  })

  it('elements are the centered representatives', () => {
    expect(new FiniteField(5).elements()).toEqual([-2, -1, 0, 1, 2])
    expect(new FiniteField(7).elements()).toEqual([-3, -2, -1, 0, 1, 2, 3])
  })
})

describe('P²(F_p) enumeration', () => {
  it('has exactly p² + p + 1 points, all distinct and canonical', () => {
    for (const p of PRIMES) {
      const F = new FiniteField(p)
      const pts = F.projectivePoints()
      expect(pts).toHaveLength(p * p + p + 1)
      const keys = new Set(pts.map((q) => q.join(',')))
      expect(keys.size).toBe(pts.length)
      // canonical: affine points end in 1, infinity points end in 0
      for (const q of pts) expect(q[2] === 0 || q[2] === 1).toBe(true)
    }
  })

  it('normalize is idempotent and canonical', () => {
    const F = new FiniteField(7)
    const raw: ProjectivePoint[] = [
      [2, 4, 3],
      [0, 0, 5],
      [3, 0, 0],
      [0, 6, 0],
    ]
    for (const q of raw) {
      const n = F.normalize(q)
      expect(F.normalize(n)).toEqual(n)
      expect(n[2] === 0 || n[2] === 1).toBe(true)
    }
  })
})

describe('solveProjective', () => {
  it('every returned point genuinely lies on the curve', () => {
    const F = new FiniteField(11)
    const Fpoly = (X: number, Y: number, Z: number) => Y * Y * Z - (X * X * X + 2 * X * Z * Z + 3 * Z * Z * Z)
    for (const q of F.solveProjective(Fpoly)) {
      expect(F.mod(Fpoly(q[0], q[1], q[2]))).toBe(0)
    }
  })

  it('#E(F_5) for y² = x³ + x + 1 is 9 (8 affine + infinity)', () => {
    // 8 affine points hand-checked; [0:1:0] is the ninth.
    const E = weierstrass(5, 1, 1)
    const pts = E.points()
    expect(pts).toHaveLength(9)
    expect(pts.some((q) => q[2] === 0)).toBe(true)
  })

  it('respects the Hasse bound |#E − (p+1)| ≤ 2√p across primes', () => {
    for (const p of PRIMES) {
      const n = weierstrass(p, 1, 1).points().length
      expect(Math.abs(n - (p + 1))).toBeLessThanOrEqual(2 * Math.sqrt(p))
    }
  })

  it('affineCurve agrees with weierstrass on the affine chart', () => {
    const p = 7
    const affine = affineCurve(p, (x, y) => y * y - (x * x * x + x + 1))
    const proj = weierstrass(p, 1, 1)
    const affineKeys = new Set(affine.points().map((q) => q.join(',')))
    const projAffineKeys = new Set(
      proj
        .points()
        .filter((q) => q[2] === 1)
        .map((q) => q.join(',')),
    )
    expect(affineKeys).toEqual(projAffineKeys)
  })
})

describe('projective lines', () => {
  it('a line through two distinct points has p + 1 points, including both', () => {
    for (const p of PRIMES) {
      const F = new FiniteField(p)
      const A: ProjectivePoint = [1, 2, 1]
      const B: ProjectivePoint = [-1, -1, 1]
      const line = F.projectiveLine(A, B)
      expect(line).toHaveLength(p + 1)
      const keys = new Set(line.map((q) => q.join(',')))
      expect(keys.has(F.normalize(A).join(','))).toBe(true)
      expect(keys.has(F.normalize(B).join(','))).toBe(true)
    }
  })

  it('lineEquation reconstructs the affine points of the line', () => {
    const F = new FiniteField(11)
    const A: ProjectivePoint = [2, 3, 1]
    const B: ProjectivePoint = [-4, 1, 1]
    const eq = F.lineEquation(A, B)
    expect(eq.vertical).toBe(false)
    if (!eq.vertical) {
      for (const q of F.projectiveLine(A, B)) {
        if (q[2] !== 1) continue
        expect(F.sub(q[1], F.add(F.mul(eq.m, q[0]), eq.c))).toBe(0)
      }
    }
  })

  it('a vertical line reports vertical with the right x0', () => {
    const F = new FiniteField(7)
    const eq = F.lineEquation([2, 1, 1], [2, -3, 1])
    expect(eq.vertical).toBe(true)
    if (eq.vertical) expect(eq.x0).toBe(2)
  })
})

describe('grid embedding', () => {
  it('places affine points at (x, 0, y) and infinity off the grid', () => {
    const plane = new ProjectivePlane(new FiniteField(5), gridEmbedding)
    expect(plane.pointAt(1, 2)).toEqual([1, 0, 2])
    const all = plane.allPoints()
    expect(all.filter((q) => q.isInfinity)).toHaveLength(6) // p + 1
    for (const q of all) if (q.isInfinity) expect(Math.hypot(q.pos[0], q.pos[2])).toBeGreaterThan(2)
  })
})
