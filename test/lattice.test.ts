import { describe, expect, it } from 'vitest'

import { Mat2Z } from '@/math/arithmetic'
import { Complex } from '@/math/core'
import { Lattice, mobius } from '@/math/lattice'

const TOL = 1e-9

/** Interior points of the fundamental domain (away from its boundary). */
const INTERIOR = [
  new Complex(0, 1.5),
  new Complex(0.3, 1.2),
  new Complex(-0.42, 2.7),
  new Complex(0.1, 1.05),
  new Complex(-0.05, 10),
]

/** Deterministic pseudo-random integer stream. */
function makeRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s
  }
}

describe('Lattice.reduce', () => {
  it('rejects τ outside the upper half-plane', () => {
    expect(() => new Lattice(new Complex(1, -2))).toThrow(RangeError)
    expect(() => new Lattice(new Complex(1, 0))).toThrow(RangeError)
  })

  it('is the identity on the fundamental domain interior', () => {
    for (const tau of INTERIOR) {
      const { tau: t, g } = new Lattice(tau).reduce()
      expect(t.equals(tau, TOL)).toBe(true)
      expect(g.equals(Mat2Z.ID)).toBe(true)
    }
  })

  it('lands in the fundamental domain with g ∈ SL₂(ℤ) and g·τ = reduced τ', () => {
    const rng = makeRng(7)
    for (const tau0 of INTERIOR) {
      for (let trial = 0; trial < 40; trial++) {
        // scramble τ₀ by a random word in T and S
        let z = tau0
        let w = Mat2Z.ID
        const len = 1 + (rng() % 6)
        for (let i = 0; i < len; i++) {
          const n = (rng() % 7) - 3
          z = new Complex(z.re + n, z.im) // T^n
          w = new Mat2Z(1n, BigInt(n), 0n, 1n).mul(w)
          if (rng() % 2 === 0) {
            z = new Complex(-z.re, z.im).div(new Complex(z.abs2(), 0)) // S
            w = new Mat2Z(0n, -1n, 1n, 0n).mul(w)
          }
        }
        const { tau: t, g } = new Lattice(z).reduce()
        // fundamental domain
        expect(Math.abs(t.re)).toBeLessThanOrEqual(0.5 + TOL)
        expect(t.abs2()).toBeGreaterThanOrEqual(1 - 1e-8)
        // exact SL2(Z) word acting correctly
        expect(g.det()).toBe(1n)
        expect(mobius(g, z).equals(t, 1e-8)).toBe(true)
        // recovers the interior representative
        expect(t.equals(tau0, 1e-8), `recovered ${tau0.re}+${tau0.im}i from scramble`).toBe(true)
        // and g inverts the scramble word (both send z to the same point; interior reps are unique)
        expect(mobius(w, tau0).equals(z, 1e-8)).toBe(true)
      }
    }
  })

  it('handles the hexagonal corner τ = (−1 + i√3)/2 without oscillating', () => {
    const hex = new Complex(-0.5, Math.sqrt(3) / 2)
    const { tau: t } = new Lattice(hex).reduce()
    expect(t.equals(hex, TOL)).toBe(true)
    // the equivalent representative at Re = +1/2 reduces to Re = −1/2
    const { tau: t2, g } = new Lattice(new Complex(0.5, Math.sqrt(3) / 2)).reduce()
    expect(t2.equals(hex, TOL)).toBe(true)
    expect(g.det()).toBe(1n)
  })

  it('covolume of ℤ ⊕ τℤ is Im τ', () => {
    expect(new Lattice(new Complex(0.5, 2.5)).covolume()).toBeCloseTo(2.5, 15)
  })
})
