import { describe, expect, it } from 'vitest'

import { Complex, Vec4 } from '@/math/core'
import { HopfTorus, S3Projection, WavyCircle, rollUpFold, rollUpPole } from '@/math/hopf'

// a genuinely non-rectangular torus, so the pole choice actually matters
const HOPF = new HopfTorus(new WavyCircle({ phi0: Math.PI / 2, b: 0.5, n: 3, skew: 0.1 }))
const [W1, W2] = HOPF.lattice
const CENTER = W1.scale(0.5).add(W2.scale(0.5))
const at = (a: number, b: number) => new Complex(W1.re * a + W2.re * b, W1.im * a + W2.im * b)

describe('rollUpFold', () => {
  const proj = new S3Projection()
  const fold = rollUpFold(HOPF, proj, CENTER)

  it('τ = 1 is the projected torus, recentered at c', () => {
    const origin = proj.project(HOPF.rollUp(CENTER))
    const z = at(0.3, 0.7)
    const got = fold(z, 1)
    const want = proj.project(HOPF.rollUp(z)).sub(origin)
    expect(got.x).toBeCloseTo(want.x, 10)
    expect(got.y).toBeCloseTo(want.y, 10)
    expect(got.z).toBeCloseTo(want.z, 10)
  })

  it('the center is fixed at the origin for every τ', () => {
    for (const t of [1, 0.5, 0.1, 0.01]) {
      const p = fold(CENTER, t)
      expect(Math.hypot(p.x, p.y, p.z)).toBeLessThan(1e-9)
    }
  })

  it('τ → 0 converges to a linear map of (z − c): fold(c+2δ) → 2·fold(c+δ)', () => {
    const delta = 0.13
    const near = fold(at(0.5 + delta, 0.5), 1e-4)
    const far = fold(at(0.5 + 2 * delta, 0.5), 1e-4)
    // in the flat limit the fold is linear about c, so doubling the offset
    // doubles the image (residual is O(τ) ≈ 1e-4 here)
    expect(far.x).toBeCloseTo(2 * near.x, 3)
    expect(far.y).toBeCloseTo(2 * near.y, 3)
    expect(far.z).toBeCloseTo(2 * near.z, 3)
  })

  it('stays finite across the whole fold', () => {
    for (let t = 1; t >= 0.02; t -= 0.02)
      for (let a = 0; a <= 1; a += 0.25)
        for (let b = 0; b <= 1; b += 0.25) {
          const p = fold(at(a, b), t)
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true)
        }
  })
})

describe('rollUpPole', () => {
  const peakOver = (pole: Vec4): number => {
    const proj = new S3Projection()
    proj.pole = pole
    const fold = rollUpFold(HOPF, proj, CENTER)
    let peak = 0
    for (let t = 1; t >= 0.05; t -= 0.02)
      for (let a = 0; a <= 1; a += 0.05)
        for (let b = 0; b <= 1; b += 0.05) {
          const p = fold(at(a, b), t)
          peak = Math.max(peak, Math.hypot(p.x, p.y, p.z))
        }
    return peak
  }

  it('returns a unit S³ direction', () => {
    const p = rollUpPole(HOPF, CENTER)
    expect(Math.hypot(p.x, p.y, p.z, p.w)).toBeCloseTo(1, 10)
  })

  it('suppresses the billow vs the default (w = 1) pole', () => {
    const chosen = peakOver(rollUpPole(HOPF, CENTER))
    const naive = peakOver(new S3Projection().pole) // default pole e_w = (0,0,0,1)
    expect(chosen).toBeLessThan(naive)
  })
})
