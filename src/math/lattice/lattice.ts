/**
 * Lattices Λ = ℤ ⊕ τℤ and SL₂(ℤ) reduction (DESIGN.md §5.2).
 * Port of threejs-demos Lattice2D.tauReduced(), re-typed: τ is our Complex,
 * and the reduction word is returned as an exact integer Mat2Z.
 */
import { Complex } from '@/math/core'

import { Mat2Z } from '@/math/arithmetic'

const TOL_SL2Z = 1e-10
/** Fundamental-domain boundary snap: Re = ±½ and |τ| = 1 are identified. */
const TOL_BOUNDARY = 1e-9
const MAX_REDUCTION_STEPS = 200

/** Möbius action of g = ((a, b), (c, d)) on the upper half-plane: z ↦ (az+b)/(cz+d). */
export function mobius(g: Mat2Z, z: Complex): Complex {
  const num = z.scale(Number(g.a)).add(new Complex(Number(g.b), 0))
  const den = z.scale(Number(g.c)).add(new Complex(Number(g.d), 0))
  return num.div(den)
}

export interface ReducedTau {
  /** The representative in the fundamental domain |Re τ| ≤ ½, |τ| ≥ 1. */
  tau: Complex
  /** The word used: g·(original τ) = reduced τ, g ∈ SL₂(ℤ). */
  g: Mat2Z
}

export class Lattice {
  constructor(readonly tau: Complex) {
    if (!(tau.im > 0)) throw new RangeError(`τ must lie in the upper half-plane, got im = ${tau.im}`)
  }

  /**
   * Reduce τ into the SL₂(ℤ) fundamental domain via T moves (τ → τ − round(Re τ))
   * and S moves (τ → −1/τ when |τ| < 1), accumulating the exact word.
   */
  reduce(): ReducedTau {
    let t = this.tau
    let g = Mat2Z.ID
    for (let iter = 0; iter < MAX_REDUCTION_STEPS; iter++) {
      let changed = false
      const n = Math.round(t.re)
      if (n !== 0) {
        t = new Complex(t.re - n, t.im)
        g = new Mat2Z(1n, BigInt(-n), 0n, 1n).mul(g) // T^{−n}
        changed = true
      }
      if (t.abs2() < 1 - TOL_SL2Z) {
        t = new Complex(-t.re, t.im).div(new Complex(t.abs2(), 0)) // −1/τ = −τ̄/|τ|²
        g = new Mat2Z(0n, -1n, 1n, 0n).mul(g) // S
        changed = true
      }
      if (!changed) return canonicalizeBoundary(t, g)
    }
    throw new Error(`SL₂(ℤ) reduction did not converge for τ = ${this.tau.re} + ${this.tau.im}i`)
  }

  /** Area of the fundamental parallelogram of ℤ ⊕ τℤ. */
  covolume(): number {
    return this.tau.im
  }
}

/**
 * Snap to a canonical representative on the fundamental-domain boundary, so
 * two numerically-noisy reductions of the same lattice compare equal:
 * Re = +½ is identified with −½ (by T), and on the unit circle τ ~ −1/τ
 * (which reflects Re) — canonical choices: Re = −½, and Re ≤ 0 on the circle.
 */
function canonicalizeBoundary(t: Complex, g: Mat2Z): ReducedTau {
  if (Math.abs(t.re - 0.5) < TOL_BOUNDARY) {
    t = new Complex(t.re - 1, t.im)
    g = new Mat2Z(1n, -1n, 0n, 1n).mul(g) // T⁻¹
  }
  if (Math.abs(t.abs2() - 1) < TOL_BOUNDARY && t.re > TOL_BOUNDARY) {
    t = new Complex(-t.re, t.im).div(new Complex(t.abs2(), 0)) // S: on the circle, Re ↦ −Re
    g = new Mat2Z(0n, -1n, 1n, 0n).mul(g)
    if (Math.abs(t.re - 0.5) < TOL_BOUNDARY) {
      // the corner ρ = e^{iπ/3} cycles back to Re = +½; re-identify
      t = new Complex(t.re - 1, t.im)
      g = new Mat2Z(1n, -1n, 0n, 1n).mul(g)
    }
  }
  return { tau: t, g }
}
