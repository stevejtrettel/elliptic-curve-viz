import { describe, expect, it } from 'vitest'

import { CURVES, buildTorusScene, edgeCurves, fiberCurves, orbitCurve } from '@/author'
import { tauOf } from '@/math/arithmetic'
import { solveProfileCurve } from '@/math/families'

const DISC8 = CURVES[0]!.data
const scene = buildTorusScene(DISC8, 2, solveProfileCurve(tauOf(DISC8.form))[0]!)

function expectUnitSamples(points: { x: number; y: number; z: number; w: number }[]) {
  for (const q of points) expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 10)
}

describe('fiberCurves', () => {
  const fibers = fiberCurves(scene.hopf, 5)

  it('returns `count` closed curves of unit-norm samples', () => {
    expect(fibers.length).toBe(5)
    for (const f of fibers) {
      expect(f.closed).toBe(true)
      expectUnitSamples(f.points)
    }
  })
})

describe('edgeCurves', () => {
  const edges = edgeCurves(scene.hopf, 4)

  it('returns `count` closed curves on S³', () => {
    expect(edges.length).toBe(4)
    for (const e of edges) {
      expect(e.closed).toBe(true)
      expectUnitSamples(e.points)
    }
  })

  it('is continuous at the closing seam (last sample near the first)', () => {
    for (const e of edges) {
      const a = e.points[0]!
      const b = e.points[e.points.length - 1]!
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)
      const step = 4 / e.points.length // generous bound: curve length ≤ ~4 in S³
      expect(gap).toBeLessThan(5 * step)
    }
  })
})

describe('orbitCurve', () => {
  it('samples degree(P) segments and closes', () => {
    const E = scene.E
    const P = E.points().find((Q) => E.degree(Q) > 1)!
    const curve = orbitCurve(E, P, scene.lambda, scene.hopf, scene.flip, 24)
    expect(curve.closed).toBe(true)
    expect(curve.points.length).toBe(E.degree(P) * 24)
    expectUnitSamples(curve.points)
  })

  it('keeps chords short (nearest lattice translate, no wrap-around jumps)', () => {
    const E = scene.E
    const P = E.points().find((Q) => E.degree(Q) > 1)!
    const curve = orbitCurve(E, P, scene.lambda, scene.hopf, scene.flip, 24)
    for (let i = 1; i < curve.points.length; i++) {
      const a = curve.points[i - 1]!
      const b = curve.points[i]!
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)
      expect(gap).toBeLessThan(0.75) // half the lattice diameter after roll-up, generously
    }
  })
})
