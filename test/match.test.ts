import { describe, expect, it } from 'vitest'

import { Mat2Z, tauOf } from '@/math/arithmetic'
import { Complex } from '@/math/core'
import { matchLattices } from '@/math/lattice'

const TAU8 = tauOf({ a: 1n, b: 0n, c: 2n }) // i√2, disc −8
const TAU3 = tauOf({ a: 1n, b: 1n, c: 1n }) // (−1 + i√3)/2, disc −3

/** z = m + n·τ_H for integers m, n (τ_H-lattice membership at unit scale). */
function latticeCoords(z: Complex, tauH: Complex): [number, number] {
  const n = z.im / tauH.im
  const m = z.re - n * tauH.re
  return [m, n]
}

function expectInHopfLattice(z: Complex, A: number, L: number) {
  // Λ_Hopf = 2πℤ ⊕ (A/2 + iL/2)ℤ = 2π·(ℤ ⊕ τ_H ℤ)
  const tauH = new Complex(A, L).scale(1 / (4 * Math.PI))
  const [m, n] = latticeCoords(z.scale(1 / (2 * Math.PI)), tauH)
  expect(Math.abs(m - Math.round(m)), `re-coordinate ${m}`).toBeLessThan(1e-8)
  expect(Math.abs(n - Math.round(n)), `τ_H-coordinate ${n}`).toBeLessThan(1e-8)
}

describe('matchLattices — legacy hand-derived constants', () => {
  it('disc −8: the arctan√2 rotation and 2π/√3 rescale (lifting-modp data/-8/tau.js)', () => {
    // latitude-circle closed form at the rectangular class: A = 4π/3, L = 4√2π/3
    const A = (4 * Math.PI) / 3
    const L = (4 * Math.PI * Math.SQRT2) / 3
    const { g, lambda } = matchLattices(TAU8, A, L)
    expect(g.det()).toBe(1n)
    // "NOT JUST A RESCALING": λ = 2π(1 + i√2)/3
    expect(lambda.abs()).toBeCloseTo((2 * Math.PI) / Math.sqrt(3), 10)
    expect(lambda.arg()).toBeCloseTo(Math.atan(Math.SQRT2), 10)
    // λ and λτ generate Λ_Hopf
    expectInHopfLattice(lambda, A, L)
    expectInHopfLattice(lambda.mul(TAU8), A, L)
  })

  it('disc −3: the hexagonal torus is a pure rescaling by 2π (lifting-modp data/-3/tau.js)', () => {
    // wall stratum: A = 2π pinned by symmetry; τ_H = 1/2 + i·Im τ₃
    const A = 2 * Math.PI
    const L = 4 * Math.PI * TAU3.im
    const { g, lambda } = matchLattices(TAU3, A, L)
    expect(lambda.im).toBeCloseTo(0, 10)
    expect(lambda.re).toBeCloseTo(2 * Math.PI, 10)
    // g is the T-translation identifying Re −1/2 with Re +1/2
    expect(g.equals(new Mat2Z(1n, 1n, 0n, 1n))).toBe(true)
  })

  it('the Clifford corner: τ = i (square torus) matches A = 2π, L = 2π at λ = π(1−i)', () => {
    // τ_H = (1 + i)/2 is SL₂-equivalent to i (S and T moves): λ is a genuine
    // rotation+rescale here too — λ·1 = π − iπ = 2π − (π + iπ) ∈ Λ_Hopf. A naive
    // λ = 2π would give the square lattice 2π(ℤ ⊕ iℤ) of covolume 4π² ≠ 2π·L/2 = 2π².
    const A = 2 * Math.PI
    const L = 2 * Math.PI
    const { g, lambda } = matchLattices(new Complex(0, 1), A, L)
    expect(g.det()).toBe(1n)
    expect(lambda.equals(new Complex(Math.PI, -Math.PI), 1e-9)).toBe(true)
    expectInHopfLattice(lambda, A, L)
    expectInHopfLattice(lambda.mul(new Complex(0, 1)), A, L)
  })
})

describe('matchLattices — general contract', () => {
  it('reduced τ with A = 4π·Re τ, L = 4π·Im τ gives g = I, λ = 2π', () => {
    for (const tau of [new Complex(0.3, 1.2), new Complex(0.5, 1.4), new Complex(0.05, 3)]) {
      const { g, lambda } = matchLattices(tau, 4 * Math.PI * tau.re, 4 * Math.PI * tau.im)
      expect(g.equals(Mat2Z.ID)).toBe(true)
      expect(lambda.equals(new Complex(2 * Math.PI, 0), 1e-9)).toBe(true)
    }
  })

  it('λ·{1, τ} generates Λ_Hopf across scrambled inputs', () => {
    // τ and τ_H the same class seen through different representatives
    const cases: [Complex, number, number][] = [
      [TAU8, (4 * Math.PI) / 3, (4 * Math.PI * Math.SQRT2) / 3],
      [new Complex(3.3, 1.2), 4 * Math.PI * 0.3, 4 * Math.PI * 1.2], // τ needs T⁻³
      [new Complex(0.3, 1.2).div(new Complex(0.3 * 0.3 + 1.2 * 1.2, 0)).mul(new Complex(-1, 0)).add(new Complex(2, 0)), 4 * Math.PI * 0.3, 4 * Math.PI * 1.2], // τ = T²S·τ₀
    ]
    for (const [tau, A, L] of cases) {
      const t = tau.im > 0 ? tau : tau.conj()
      const { g, lambda } = matchLattices(t, A, L)
      expect(g.det()).toBe(1n)
      expectInHopfLattice(lambda, A, L)
      expectInHopfLattice(lambda.mul(t), A, L)
      // and conversely both Λ_Hopf generators are integer combos of λ, λτ:
      // covolumes agree, so containment one way plus equal covolume = equality.
      const covHopf = 2 * Math.PI * (L / 2)
      const covImage = lambda.abs2() * t.im
      expect(covImage / covHopf).toBeCloseTo(1, 8)
    }
  })

  it('mirror mismatch throws the flip message', () => {
    // τ reduces to −0.42 + 2.7i; A, L land τ_H at its mirror +0.42 + 2.7i.
    expect(() => matchLattices(new Complex(-0.42, 2.7), 4 * Math.PI * 0.42, 4 * Math.PI * 2.7)).toThrow(
      /conjugate|reflect/i,
    )
  })

  it('honest mismatch throws', () => {
    expect(() => matchLattices(new Complex(0.3, 1.2), 4 * Math.PI * 0.3, 4 * Math.PI * 1.7)).toThrow(
      /do not match/,
    )
  })

  it('rejects nonpositive A or L', () => {
    expect(() => matchLattices(new Complex(0, 1.2), -1, 2)).toThrow(RangeError)
    expect(() => matchLattices(new Complex(0, 1.2), 1, 0)).toThrow(RangeError)
  })
})
