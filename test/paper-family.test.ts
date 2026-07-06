import { describe, expect, it } from 'vitest'

import { tauOf } from '@/math/arithmetic'
import { Complex } from '@/math/core'
import { paperWavy, solveFamily, solvePaperFamily } from '@/math/families'
import { HopfTorus, WavyCircle } from '@/math/hopf'

const TWO_PI = 2 * Math.PI

// the paper's hand-derived values (lifting-modp data/<disc>/tau.js), with the
// measured accuracy of each hand-tuning: −3/−7/−11 were tuned to <1% in b;
// the −20 para curve (the least-polished figure family) is 2.8% off exact.
const HAND = [
  { disc: -3, form: { a: 1n, b: 1n, c: 1n }, a: 0.276, b: 1.9, n: 3, tol: 0.01 },
  { disc: -7, form: { a: 1n, b: 1n, c: 2n }, a: 0.1179, b: 3.89, n: 7, tol: 0.01 },
  { disc: -11, form: { a: 1n, b: 1n, c: 3n }, a: 0.07, b: 5.705, n: 11, tol: 0.01 },
  { disc: -20, form: { a: 2n, b: 2n, c: 3n }, a: 0.2, b: 2.2, n: 5, tol: 0.03 },
]

describe('the paper family lives on the wall (area ≡ 2π)', () => {
  it('enclosed area is 2π for arbitrary (a, b, n)', () => {
    for (const [a, b, n] of [
      [0.276, 1.9, 3],
      [0.1, 4, 7],
      [0.3, 1.2, 2],
    ] as const) {
      const torus = new HopfTorus(paperWavy(a, b, n))
      expect(Math.abs(torus.area - TWO_PI)).toBeLessThan(1e-8)
    }
  })
})

describe('solvePaperFamily vs the hand-derived curves', () => {
  it('recovers each paper curve: same a and n ⇒ solved b close to the hand value, τ exact', () => {
    for (const hand of HAND) {
      const tau = tauOf(hand.form)
      const sol = solvePaperFamily(tau, hand.n, { a: hand.a })
      expect(sol, `disc ${hand.disc}`).not.toBeNull()
      // the hand values approximated τ; the solve nails it — measured gaps above
      expect(Math.abs(sol!.b - hand.b) / hand.b, `disc ${hand.disc}: b`).toBeLessThan(hand.tol)
      expect(sol!.residual, `disc ${hand.disc}: residual`).toBeLessThan(1e-9)
      expect(Math.abs(sol!.achieved.L - 4 * Math.PI * tau.im)).toBeLessThan(1e-8)
    }
  })

  it('fails cleanly off the wall and on unreachable lengths', () => {
    expect(solvePaperFamily(new Complex(0.3, 1), 3)).toBeNull() // not a wall class
    expect(solvePaperFamily(new Complex(0.5, 50), 3, { a: 0.276 })).toBeNull() // too long
  })
})

describe('solveFamily (general 2-parameter spaces)', () => {
  it('recovers known WavyCircle parameters from a nearby start', () => {
    const family = (u: number, v: number) => new WavyCircle({ phi0: u, b: v, n: 2 })
    const truth = new HopfTorus(family(1.2, 0.25))
    const sol = solveFamily(family, 1.1, 0.2, { A: truth.area, L: truth.length })
    expect(sol).not.toBeNull()
    expect(sol!.u).toBeCloseTo(1.2, 6)
    expect(sol!.v).toBeCloseTo(0.25, 6)
  })

  it('returns null for an isoperimetrically impossible target', () => {
    const family = (u: number, v: number) => new WavyCircle({ phi0: u, b: v, n: 2 })
    // L² ≥ A(4π − A) forbids A = 2π with tiny L
    expect(solveFamily(family, 1.2, 0.25, { A: TWO_PI, L: 0.5 })).toBeNull()
  })
})
