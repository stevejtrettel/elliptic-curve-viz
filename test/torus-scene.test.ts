import { describe, expect, it } from 'vitest'

import { CURVES, buildTorusScene, maxFeasibleK } from '@/author'
import { tauOf } from '@/math/arithmetic'
import { solveProfileCurve } from '@/math/families'

const DISC8 = CURVES[0]!.data // (1,0,2), a=6, p=11 — the paper example
const DISC3 = CURVES[1]!.data // (1,1,1), a=5, p=7 — hexagonal

function firstCandidate(data: typeof DISC8) {
  return solveProfileCurve(tauOf(data.form))[0]!
}

describe('buildTorusScene', () => {
  const scene = buildTorusScene(DISC8, 2, firstCandidate(DISC8))

  it('produces positions and flat points parallel to E.points()', () => {
    expect(scene.positions.length).toBe(scene.E.size)
    expect(scene.flat.length).toBe(scene.E.size)
  })

  it('places every point on the unit S³', () => {
    for (const q of scene.positions) {
      const n = Math.hypot(q.x, q.y, q.z, q.w)
      expect(n).toBeCloseTo(1, 12)
    }
  })

  it('rolls the identity to hopf.rollUp(0)', () => {
    const idx = scene.E.points().findIndex((P) => P.x === 0 && P.y === 0)
    const origin = scene.hopf.rollUp(scene.flat[idx]!, { exact: true })
    const expected = scene.positions[idx]!
    expect(origin.x).toBeCloseTo(expected.x, 12)
    expect(origin.w).toBeCloseTo(expected.w, 12)
  })

  it('conjugates flat points consistently when the candidate is a mirror representative', () => {
    // find any candidate with flip=true among the hexagonal curve's list; if
    // none exists the invariant is vacuous for this battery entry
    const flipped = solveProfileCurve(tauOf(DISC3.form)).find((c) => c.rep.flip)
    if (!flipped) return
    const s = buildTorusScene(DISC3, 1, flipped)
    expect(s.flip).toBe(true)
    const E = s.E
    const P = E.points()[1]!
    const z = E.toComplex(P).conj()
    // flat is the fundamental-domain representative: agree mod Λ_Hopf
    const d = s.flat[1]!.sub(s.lambda.mul(z))
    const [w1, w2] = s.hopf.lattice
    const det = w1.re * w2.im - w1.im * w2.re
    const a = (d.re * w2.im - d.im * w2.re) / det
    const b = (w1.re * d.im - w1.im * d.re) / det
    expect(a).toBeCloseTo(Math.round(a), 9)
    expect(b).toBeCloseTo(Math.round(b), 9)
  })

  it('flat points land inside the fundamental parallelogram of Λ_Hopf', () => {
    const [w1, w2] = scene.hopf.lattice
    const det = w1.re * w2.im - w1.im * w2.re
    for (const z of scene.flat) {
      const a = (z.re * w2.im - z.im * w2.re) / det
      const b = (w1.re * z.im - w1.im * z.re) / det
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(1)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(1)
    }
  })
})

describe('maxFeasibleK', () => {
  it('matches the point counts p^k + 1 − a_k for disc −8', () => {
    // a_k: 6, 14, 18, −46 → |E(F_{11^k})| = 6, 108, 1314, 14688
    expect(maxFeasibleK(DISC8, 6)).toBe(1)
    expect(maxFeasibleK(DISC8, 108)).toBe(2)
    expect(maxFeasibleK(DISC8, 107)).toBe(1)
    expect(maxFeasibleK(DISC8, 14688)).toBe(4)
    expect(maxFeasibleK(DISC8, 14687)).toBe(3)
  })

  it('returns 1 even when the base field already exceeds the cap', () => {
    expect(maxFeasibleK(DISC8, 1)).toBe(1)
  })
})
