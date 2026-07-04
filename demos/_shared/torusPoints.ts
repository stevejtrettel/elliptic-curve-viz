/**
 * The glue from exact arithmetic to S³ positions: E(F_{p^k}) points mapped
 * onto the Hopf torus of a solver candidate, flip-aware.
 *
 * Pipeline: P = (x, y) mod N  →  z = (x + yτ)/N ∈ ℂ/Λ_τ  →  (conjugate if the
 * candidate is a reflected representative)  →  λ·z ∈ ℂ/Λ_Hopf  →  rollUp → S³.
 */
import { type CurveData, type CurvePoints, pointsOver, tauOf } from '@/math/arithmetic'
import { Complex, type Vec4 } from '@/math/core'
import type { Candidate } from '@/math/families'
import { HopfTorus } from '@/math/hopf'
import { matchLattices } from '@/math/lattice'

export interface TorusScene {
  hopf: HopfTorus
  E: CurvePoints
  /** S³ positions parallel to E.points(). */
  positions: Vec4[]
  /** The flat picture: λ·z ∈ ℂ/Λ_Hopf, parallel to E.points(). */
  flat: Complex[]
  lambda: Complex
  flip: boolean
}

export function buildTorusScene(data: CurveData, k: number, candidate: Candidate): TorusScene {
  const E = pointsOver(data, k)
  const tau = tauOf(data.form)
  const hopf = new HopfTorus(candidate.curve)
  // achieved values (recomputed here at the same default sample count) keep
  // matchLattices exact; flip mirrors the lattice and conjugates the points
  const flip = candidate.rep.flip
  const matchTau = flip ? new Complex(-tau.re, tau.im) : tau
  const { lambda } = matchLattices(matchTau, hopf.area, hopf.length)
  const flat = E.points().map((P) => {
    let z = E.toComplex(P)
    if (flip) z = z.conj()
    return lambda.mul(z)
  })
  const positions = flat.map((z) => hopf.rollUp(z, { exact: true }))
  return { hopf, E, positions, flat, lambda, flip }
}

/** Largest k ≤ kMax whose |E(F_{p^k})| stays under `cap` points. */
export function maxFeasibleK(data: CurveData, cap: number, kMax = 6): number {
  const { trace: a, p } = data
  const ak = [2n, a]
  for (let k = 2; k <= kMax; k++) ak.push(a * ak[k - 1]! - p * ak[k - 2]!)
  let best = 1
  for (let k = 1; k <= kMax; k++) {
    if (p ** BigInt(k) + 1n - ak[k]! <= BigInt(cap)) best = k
  }
  return best
}
