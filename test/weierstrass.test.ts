import { describe, expect, it } from 'vitest'

import { Complex } from '@/math/core'
import { weierstrassP } from '@/math/elliptic'

/** The three half-period values e_i = ℘(ω_i/2). */
function eValues(tau: Complex) {
  const e1 = weierstrassP(new Complex(0.5, 0), tau).p
  const e2 = weierstrassP(new Complex(0.5 * tau.re, 0.5 * tau.im), tau).p
  const e3 = weierstrassP(new Complex(0.5 + 0.5 * tau.re, 0.5 * tau.im), tau).p
  return { e1, e2, e3 }
}

/** g₂, g₃ from the e-values: ℘′² = 4(℘−e₁)(℘−e₂)(℘−e₃) with e₁+e₂+e₃ = 0. */
function invariants(tau: Complex) {
  const { e1, e2, e3 } = eValues(tau)
  const g2 = e1.mul(e2).add(e2.mul(e3)).add(e3.mul(e1)).scale(-4)
  const g3 = e1.mul(e2).mul(e3).scale(4)
  return { g2, g3 }
}

describe('Weierstrass ℘', () => {
  it('half-period values sum to zero (and e₃ = 0 for the square lattice τ = i)', () => {
    const tau = new Complex(0, 1)
    const { e1, e2, e3 } = eValues(tau)
    expect(e1.add(e2).add(e3).abs()).toBeLessThan(1e-9)
    // τ = i has an order-4 symmetry ⇒ e₂ = −e₁ and e₃ = 0.
    expect(e2.add(e1).abs()).toBeLessThan(1e-9)
    expect(e3.abs()).toBeLessThan(1e-9)
  })

  it('satisfies the differential equation ℘′² = 4℘³ − g₂℘ − g₃', () => {
    for (const tau of [new Complex(0, 1), new Complex(0.5, 1.15), new Complex(0.3, 1.4)]) {
      const { g2, g3 } = invariants(tau)
      const z = new Complex(0.2, 0.13)
      const { p, dp } = weierstrassP(z, tau)
      const lhs = dp.mul(dp)
      const rhs = p.mul(p).mul(p).scale(4).sub(p.mul(g2)).sub(g3)
      expect(lhs.sub(rhs).abs()).toBeLessThan(1e-8)
    }
  })

  it('℘ is even and ℘′ is odd', () => {
    const tau = new Complex(0.2, 1.3)
    const z = new Complex(0.17, 0.11)
    const a = weierstrassP(z, tau)
    const b = weierstrassP(z.neg(), tau)
    expect(a.p.sub(b.p).abs()).toBeLessThan(1e-9) // ℘(z) = ℘(−z)
    expect(a.dp.add(b.dp).abs()).toBeLessThan(1e-9) // ℘′(z) = −℘′(−z)
  })

  it('is Λ-periodic: ℘(z+1) = ℘(z+τ) = ℘(z)', () => {
    const tau = new Complex(0.25, 1.2)
    const z = new Complex(0.31, 0.19)
    const base = weierstrassP(z, tau).p
    const shift1 = weierstrassP(z.add(new Complex(1, 0)), tau).p
    const shiftTau = weierstrassP(z.add(tau), tau).p
    expect(base.sub(shift1).abs()).toBeLessThan(1e-8)
    expect(base.sub(shiftTau).abs()).toBeLessThan(1e-8)
  })
})
