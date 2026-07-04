/**
 * THE bookkeeping function replacing every hand-written tau.js (DESIGN.md §5.2):
 * match the curve's lattice ℤ ⊕ τℤ to Pinkall's lattice Λ_Hopf = 2πℤ ⊕ (A/2 + iL/2)ℤ
 * actually achieved by the solved profile curve.
 */
import { Complex } from '@/math/core'

import { Mat2Z } from '@/math/arithmetic'

import { Lattice, mobius } from './lattice'

const TOL_MATCH = 1e-9

export interface LatticeMatch {
  /** g ∈ SL₂(ℤ) with g·τ = τ_H = (A + iL)/(4π). */
  g: Mat2Z
  /** Homothety: λ·(ℤ ⊕ τℤ) = 2πℤ ⊕ (A/2 + iL/2)ℤ. A point (x + yτ)/N maps to λ·(x + yτ)/N. */
  lambda: Complex
}

/**
 * Find g ∈ SL₂(ℤ) and λ ∈ ℂ with λ·(ℤ ⊕ τℤ) = 2πℤ ⊕ (A/2 + iL/2)ℤ.
 *
 * Both τ and τ_H = (A + iL)/(4π) are reduced to the fundamental domain; they
 * must agree there — matchLattices consumes the (A, L) ACHIEVED by the solver
 * (§5.4), so disagreement is a caller bug, not a solve step. With
 * g = ((a,b),(c,d)) mapping τ to τ_H, the basis {cτ+d, aτ+b} of ℤ ⊕ τℤ is
 * proportional to {1, τ_H}, so λ = 2π/(cτ+d) sends it to {2π, A/2 + iL/2}.
 */
export function matchLattices(tau: Complex, A: number, L: number, tol = TOL_MATCH): LatticeMatch {
  if (!(A > 0) || !(L > 0)) throw new RangeError(`need A, L > 0, got A = ${A}, L = ${L}`)
  const tauH = new Complex(A, L).scale(1 / (4 * Math.PI))
  const r1 = new Lattice(tau).reduce()
  const r2 = new Lattice(tauH).reduce()
  if (!r1.tau.equals(r2.tau, tol)) {
    const mirrored = new Complex(-r2.tau.re, r2.tau.im)
    if (r1.tau.equals(mirrored, tol)) {
      throw new Error(
        `lattices are complex-conjugate, not equal: τ reduces to ${r1.tau.re} + ${r1.tau.im}i, ` +
          `(A + iL)/4π to its mirror image. The profile curve must be reflected ` +
          `(the flip flag arrives with the Phase 2 solver).`,
      )
    }
    throw new Error(
      `lattices do not match: τ reduces to ${r1.tau.re} + ${r1.tau.im}i but ` +
        `(A + iL)/4π reduces to ${r2.tau.re} + ${r2.tau.im}i`,
    )
  }
  // g₂·τ_H = g₁·τ  ⇒  (g₂⁻¹·g₁)·τ = τ_H; det g = 1 so g⁻¹ = ((d,−b),(−c,a)).
  const g2inv = new Mat2Z(r2.g.d, -r2.g.b, -r2.g.c, r2.g.a)
  let g = g2inv.mul(r1.g)
  let lambda = new Complex(2 * Math.PI, 0).div(tau.scale(Number(g.c)).add(new Complex(Number(g.d), 0)))
  // ±g act identically on ℍ and ±λ generate the same lattice; canonicalize to Re λ > 0.
  if (lambda.re < 0 || (lambda.re === 0 && lambda.im < 0)) {
    g = g.neg()
    lambda = lambda.neg()
  }
  // Internal consistency: λ·(aτ + b) must equal 2π·τ_H = A/2 + iL/2.
  const second = lambda.mul(tau.scale(Number(g.a)).add(new Complex(Number(g.b), 0)))
  const target = new Complex(A / 2, L / 2)
  if (!second.equals(target, Math.max(1e-6, tol * target.abs()))) {
    throw new Error(
      `internal error: matched basis misses Λ_Hopf by ${second.sub(target).abs()} ` +
        `(g·τ = ${mobius(g, tau).re} + ${mobius(g, tau).im}i, τ_H = ${tauH.re} + ${tauH.im}i)`,
    )
  }
  return { g, lambda }
}
