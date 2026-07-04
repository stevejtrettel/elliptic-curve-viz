import { describe, expect, it } from 'vitest'

import { tauOf } from '@/math/arithmetic'
import { Complex } from '@/math/core'
import { solveProfileCurve } from '@/math/families'
import { HopfTorus, LatitudeCircle, WavyCircle } from '@/math/hopf'
import { Lattice, matchLattices } from '@/math/lattice'

const TAU8 = tauOf({ a: 1n, b: 0n, c: 2n }) // i√2
const TAU3 = tauOf({ a: 1n, b: 1n, c: 1n }) // (−1 + i√3)/2

describe('solveProfileCurve — legacy reproductions', () => {
  it('disc −8 (τ = i√2): the latitude circle of lifting-modp/data/-8, closed form', () => {
    const candidates = solveProfileCurve(TAU8)
    expect(candidates.length).toBeGreaterThan(0)
    const latitude = candidates.find((c) => c.stratum === 'boundary')
    expect(latitude, 'a boundary/latitude candidate must exist').toBeDefined()
    // legacy constants: A = 4π/3, L = 4√2π/3, cos φ₀ = 1/3
    expect(latitude!.achieved.A).toBeCloseTo((4 * Math.PI) / 3, 10)
    expect(latitude!.achieved.L).toBeCloseTo((4 * Math.PI * Math.SQRT2) / 3, 10)
    expect((latitude!.curve as LatitudeCircle).phi0).toBeCloseTo(Math.acos(1 / 3), 12)
    expect(latitude!.rep.flip).toBe(false)
    expect(latitude!.residual).toBeLessThan(1e-12)
    // ties Phase 1 + 2: matchLattices on the ACHIEVED values gives the arctan√2 λ
    const { lambda } = matchLattices(TAU8, latitude!.achieved.A, latitude!.achieved.L)
    expect(lambda.arg()).toBeCloseTo(Math.atan(Math.SQRT2), 9)
    expect(lambda.abs()).toBeCloseTo((2 * Math.PI) / Math.sqrt(3), 9)
  })

  it('disc −3 (τ hexagonal): wall stratum, φ₀ = π/2, no flip; pinned n = 3 matches legacy L', () => {
    const candidates = solveProfileCurve(TAU3, { n: 3 })
    const wall = candidates.find((c) => c.stratum === 'wall')
    expect(wall, 'a wall candidate must exist').toBeDefined()
    expect(wall!.rep.flip).toBe(false) // Re = −½ ↦ +½ by T, not by reflection
    expect(wall!.n).toBe(3)
    const curve = wall!.curve as WavyCircle
    expect(curve.phi0).toBeCloseTo(Math.PI / 2, 12)
    // legacy targets: A = 2π (wall symmetry), L = 4π·(√3/2)
    expect(wall!.achieved.A).toBeCloseTo(2 * Math.PI, 10)
    expect(wall!.achieved.L).toBeCloseTo(2 * Math.PI * Math.sqrt(3), 8)
    // and matchLattices is a pure 2π rescale (legacy data/-3/tau.js)
    const { lambda } = matchLattices(TAU3, wall!.achieved.A, wall!.achieved.L)
    expect(lambda.im).toBeCloseTo(0, 8)
    expect(lambda.re).toBeCloseTo(2 * Math.PI, 6)
  })

  it('the Clifford corner τ = i: the great circle (equator), sitting on both strata', () => {
    const candidates = solveProfileCurve(new Complex(0, 1))
    expect(candidates.length).toBeGreaterThan(0)
    const first = candidates[0]!
    // τ′ = (1+i)/2: A = 2π, L = 2π — the square/Clifford torus
    expect(first.achieved.A).toBeCloseTo(2 * Math.PI, 9)
    expect(first.achieved.L).toBeCloseTo(2 * Math.PI, 9)
  })
})

describe('solveProfileCurve — general contract', () => {
  const MESH = [
    new Complex(0.21, 1.05),
    new Complex(0.37, 1.4),
    new Complex(0.5, 0.95),
    new Complex(-0.29, 1.31), // negative Re: needs flip
    new Complex(0.05, 2.4),
  ]

  it('round-trip: solve → curve → HopfTorus (A, L) → (A + iL)/4π → SL₂-reduce = τ', () => {
    for (const tau of MESH) {
      const candidates = solveProfileCurve(tau)
      expect(candidates.length, `candidates for ${tau.re}+${tau.im}i`).toBeGreaterThan(0)
      const tauReduced = new Lattice(tau).reduce().tau
      for (const cand of candidates) {
        const torus = new HopfTorus(cand.curve, { samples: 512 })
        let tauH = new Complex(torus.area, torus.length).scale(1 / (4 * Math.PI))
        if (cand.rep.flip) tauH = new Complex(-tauH.re, tauH.im) // mirror back
        const back = new Lattice(tauH).reduce().tau
        // compare up to the Re ±½ boundary identification
        const sameRe =
          Math.abs(back.re - tauReduced.re) < 1e-7 || Math.abs(Math.abs(back.re) - 0.5) + Math.abs(Math.abs(tauReduced.re) - 0.5) < 1e-7
        expect(sameRe, `Re roundtrip for ${tau.re}+${tau.im}i via n=${cand.n}`).toBe(true)
        expect(back.im).toBeCloseTo(tauReduced.im, 7)
      }
    }
  })

  it('negative-Re τ yields flip candidates; the identity rep appears mirrored', () => {
    const tau = new Complex(-0.29, 1.31)
    const candidates = solveProfileCurve(tau)
    expect(candidates.some((c) => c.rep.flip)).toBe(true)
    // the mirror of τ itself must be among the candidates, flagged as flipped
    const mirror = candidates.find((c) => Math.abs(c.achieved.L - 4 * Math.PI * 1.31) < 1e-6)
    expect(mirror, 'mirrored identity representative').toBeDefined()
    expect(mirror!.rep.flip).toBe(true)
    expect(mirror!.achieved.A).toBeCloseTo(4 * Math.PI * 0.29, 8)
  })

  it('candidates are sorted by achieved L ascending and respect maxCandidates', () => {
    const candidates = solveProfileCurve(TAU8, { maxCandidates: 4 })
    expect(candidates.length).toBeLessThanOrEqual(4)
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]!.achieved.L).toBeGreaterThanOrEqual(candidates[i - 1]!.achieved.L)
    }
  })

  it('lobe count: defaults to the smallest converging n; pinning n is honored', () => {
    const free = solveProfileCurve(TAU3)
    const wallFree = free.find((c) => c.stratum === 'wall')
    expect(wallFree).toBeDefined()
    const pinned = solveProfileCurve(TAU3, { n: 5 })
    const wallPinned = pinned.find((c) => c.stratum === 'wall')
    expect(wallPinned).toBeDefined()
    expect(wallPinned!.n).toBe(5)
    expect(wallFree!.n).toBeLessThanOrEqual(wallPinned!.n)
    // same lattice either way
    expect(wallPinned!.achieved.L).toBeCloseTo(wallFree!.achieved.L, 8)
  })

  it('residuals are at solver tolerance and achieved values feed matchLattices cleanly', () => {
    for (const tau of [new Complex(0.21, 1.05), new Complex(0.4, 1.6)]) {
      for (const cand of solveProfileCurve(tau)) {
        expect(cand.residual).toBeLessThan(1e-9)
        if (!cand.rep.flip) {
          // must not throw: the whole point of achieved-value bookkeeping
          matchLattices(tau, cand.achieved.A, cand.achieved.L)
        }
      }
    }
  })
})
