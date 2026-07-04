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
}

export function buildTorusScene(data: CurveData, k: number, candidate: Candidate): TorusScene {
  const E = pointsOver(data, k)
  const tau = tauOf(data.form)
  const hopf = new HopfTorus(candidate.curve)
  // achieved values (recomputed here at the same default sample count) keep
  // matchLattices exact; flip mirrors the lattice and conjugates the points
  const matchTau = candidate.rep.flip ? new Complex(-tau.re, tau.im) : tau
  const { lambda } = matchLattices(matchTau, hopf.area, hopf.length)
  const positions = E.points().map((P) => {
    let z = E.toComplex(P)
    if (candidate.rep.flip) z = z.conj()
    return hopf.rollUp(lambda.mul(z), { exact: true })
  })
  return { hopf, E, positions }
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
