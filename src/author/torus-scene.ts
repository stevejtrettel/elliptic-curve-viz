/**
 * The glue from exact arithmetic to S³ positions: E(F_{p^k}) points mapped
 * onto the Hopf torus of a solver candidate, flip-aware.
 *
 * Pipeline: P = (x, y) mod N  →  z = (x + yτ)/N ∈ ℂ/Λ_τ  →  (conjugate if the
 * candidate is a reflected representative)  →  λ·z ∈ ℂ/Λ_Hopf  →  rollUp → S³.
 */
import { type CurveData, type CurvePoints, type TorusPoint, pointsOver, tauOf } from '@/math/arithmetic'
import { Complex, type Vec4 } from '@/math/core'
import type { Candidate } from '@/math/families'
import { HopfTorus } from '@/math/hopf'
import { matchLattices } from '@/math/lattice'

export interface TorusScene {
  hopf: HopfTorus
  E: CurvePoints
  /** S³ positions parallel to E.points(). */
  positions: Vec4[]
  /**
   * The flat picture: λ·z ∈ ℂ/Λ_Hopf, parallel to E.points(), as the
   * CANONICAL representative in the fundamental parallelogram
   * {a·ω₁ + b·ω₂ : a, b ∈ [0, 1)} — what DomainPlaque draws.
   */
  flat: Complex[]
  lambda: Complex
  flip: boolean
  /**
   * Flat embedding of the coordinate unit vectors: a point (x, y) mod N sits
   * at x·unit[0] + y·unit[1] mod Λ. The ℝ-linear map behind `flat`.
   */
  unit: [Complex, Complex]
}

/** Reduce z into the fundamental parallelogram of the lattice. */
function toFundamental(z: Complex, [w1, w2]: [Complex, Complex]): Complex {
  const det = w1.re * w2.im - w1.im * w2.re
  // wall-straddling roundoff: snap 1 − ε back to 0 (same point of the torus)
  const frac = (x: number) => {
    const f = x - Math.floor(x)
    return f > 1 - 1e-9 ? 0 : f
  }
  const a = (z.re * w2.im - z.im * w2.re) / det
  const b = (w1.re * z.im - w1.im * z.re) / det
  return w1.scale(frac(a)).add(w2.scale(frac(b)))
}

export interface TorusSceneOptions {
  /**
   * 'tau' (default): exact map λ·(x+yτ)/N via matchLattices — requires the
   * curve to realize the lattice class of τ to machine tolerance.
   * 'curve': lay the exact lattice COORDINATES in the curve's OWN lattice
   * (x/N)·ω₁ + (y/N)·ω₂ — what lifting-modp did; required for the paper's
   * hand-tuned profiles, which only approximate τ (hex: off by 8×10⁻⁵).
   */
  lattice?: 'tau' | 'curve'
}

export function buildTorusScene(
  data: CurveData,
  k: number,
  candidate: Candidate,
  opts: TorusSceneOptions = {},
): TorusScene {
  const E = pointsOver(data, k)
  const tau = tauOf(data.form)
  const hopf = new HopfTorus(candidate.curve)
  if (opts.lattice === 'curve') {
    const [w1, w2] = hopf.lattice
    const flat = E.points().map((P) => w1.scale(P.x / E.N).add(w2.scale(P.y / E.N)))
    const positions = flat.map((z) => hopf.rollUp(z, { exact: true }))
    // λ is only ℂ-linear when the curve exactly realizes τ; report the 2π
    // rescale (exact for Re τ' = Re τ cases up to the profile's residual —
    // consumers of `lambda` inherit that ≤1e-4 discrepancy)
    const unit: [Complex, Complex] = [w1.scale(1 / E.N), w2.scale(1 / E.N)]
    return { hopf, E, positions, flat, lambda: w1, flip: false, unit }
  }
  // achieved values (recomputed here at the same default sample count) keep
  // matchLattices exact; flip mirrors the lattice and conjugates the points
  const flip = candidate.rep.flip
  const matchTau = flip ? new Complex(-tau.re, tau.im) : tau
  const { lambda } = matchLattices(matchTau, hopf.area, hopf.length)
  const flat = E.points().map((P) => {
    let z = E.toComplex(P)
    if (flip) z = z.conj()
    // λ·(ℤ ⊕ τℤ) = Λ_Hopf, but (λ, λτ) is a DIFFERENT basis of it than
    // (ω₁, ω₂) — reduce so the flat points land on the drawn parallelogram
    return toFundamental(lambda.mul(z), hopf.lattice)
  })
  const positions = flat.map((z) => hopf.rollUp(z, { exact: true }))
  // flip conjugates z: (x + yτ)/N ↦ x/N + y·conj(τ)/N — unit₂ follows suit
  const unitTau = flip ? tau.conj() : tau
  const unit: [Complex, Complex] = [lambda.scale(1 / E.N), lambda.mul(unitTau).scale(1 / E.N)]
  return { hopf, E, positions, flat, lambda, flip, unit }
}

/**
 * The geometrically SHORTEST minimal generating set of E — rank(E) elements
 * (1 for cyclic, 2 otherwise), measured in the flat embedding
 * e(x, y) = x·unit₀ + y·unit₁.
 *
 * The SNF `E.generators` are group-theoretically canonical (orders n₁ | n₂)
 * but geometrically arbitrary — a cyclic group's single geodesic can wind
 * |E| steps clear across the torus. Here instead:
 *
 * - cyclic (n₁ = 1): the shortest point of full order N — one Hamiltonian
 *   cycle through E in nearest-neighbor steps;
 * - rank 2: a reduced basis of the preimage lattice
 *   L = {v ∈ ℤ² : v mod N ∈ E} ⊇ N·ℤ². Since [ℤ² : L] = N²/|E|, a pair
 *   (v₁, v₂) ⊂ L with |v₁ × v₂| = N²/|E| is a basis of L, so its images
 *   generate E — two elements, the minimum possible for rank 2.
 *
 * Candidates: every point's shortest integer representative (the successive
 * minima of L are shortest in their own class mod N·ℤ²). Returns [] for the
 * trivial group.
 */
export function reducedGenerators(E: CurvePoints, unit: [Complex, Complex]): TorusPoint[] {
  if (E.size === 1) return []
  const N = E.N
  const len = (x: number, y: number) =>
    Math.hypot(x * unit[0].re + y * unit[1].re, x * unit[0].im + y * unit[1].im)
  const reps: { P: TorusPoint; v: [number, number]; l: number }[] = []
  for (const P of E.points()) {
    if (P.x === 0 && P.y === 0) continue
    let v: [number, number] = [P.x, P.y]
    let l = Infinity
    for (const x of [P.x, P.x - N]) {
      for (const y of [P.y, P.y - N]) {
        const c = len(x, y)
        if (c < l) {
          l = c
          v = [x, y]
        }
      }
    }
    reps.push({ P, v, l })
  }
  reps.sort((a, b) => a.l - b.l)
  if (E.structure[0] === 1) {
    // cyclic: the SHORTEST single generator of the whole group
    const g = reps.find(({ P }) => E.order(P) === E.size)
    return g ? [g.P] : E.generators
  }
  const index = (N * N) / E.size // [ℤ² : L], integer since n₁ | n₂
  const v1 = reps[0]!.v
  const g2 = reps.find(({ v }) => Math.abs(v1[0] * v[1] - v1[1] * v[0]) === index)
  if (!g2) return E.generators // unreachable for a valid embedding; stay safe
  return [reps[0]!.P, g2.P]
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
