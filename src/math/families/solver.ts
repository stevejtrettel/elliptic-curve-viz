/**
 * The τ solver (DESIGN.md §5.4): given τ in the upper half-plane, produce
 * profile curves on S² whose Hopf tori realize the lattice class of τ —
 * replacing every hand-derived tau.js with enumeration + three solve strata.
 *
 * Realizable region for τ′ = (A + iL)/(4π): 0 < Re τ′ ≤ ½ (A ∈ (0, 2π]) and
 * |τ′ − ½| ≥ ½ (spherical isoperimetric inequality L² ≥ A(4π − A)).
 *
 * Enumeration, not selection: each SL₂(ℤ) representative in the region is a
 * genuinely different embedding; candidates are returned sorted by achieved L
 * (shortest first — the fattest torus).
 */
import { Complex, egcd } from '@/math/core'

import { Mat2Z } from '@/math/arithmetic'

import { HopfTorus, LatitudeCircle, type ProfileCurve, WavyCircle } from '@/math/hopf'

import { Lattice, mobius } from '@/math/lattice'

const TWO_PI = 2 * Math.PI
const REGION_TOL = 1e-9

export type Stratum = 'boundary' | 'wall' | 'interior'

export interface Candidate {
  curve: ProfileCurve
  /** Exact bookkeeping: g·τ = τ′ (before reflection); flip mirrors the curve. */
  rep: { g: Mat2Z; flip: boolean }
  /** Lobe count used (smallest that converged, unless pinned). */
  n: number
  stratum: Stratum
  /** What the sampled curve ACTUALLY integrates to — matchLattices consumes these. */
  achieved: { A: number; L: number }
  /** Relative miss of the target (A, L). */
  residual: number
  /** The representative realized: τ′ = achieved (A + iL)/(4π). */
  tauPrime: Complex
}

export interface SolveOptions {
  /** Pin the lobe count (artistic override). */
  n?: number
  /**
   * θ skew, artistic, default 0. |2n·skew| < 1 keeps θ monotone; larger values
   * (the paper's look is 2n·skew = 1.6) let θ backtrack into loops. No ceiling:
   * whatever you pass is used; an (n, skew) the solve can't realize returns [].
   */
  skew?: number
  /** How many candidates to return (default 6). */
  maxCandidates?: number
  /** HopfTorus sample count used for achieved values (default 512). */
  samples?: number
}

// ---------------------------------------------------------------------------
// Wavy-family integrals with analytic partials (spectral trapezoid)
// ---------------------------------------------------------------------------

interface WavyIntegrals {
  A: number
  L: number
  dA: [number, number] // ∂/∂φ₀, ∂/∂b
  dL: [number, number]
}

function wavyIntegrals(phi0: number, b: number, n: number, skew: number, m: number): WavyIntegrals {
  let A = 0
  let L = 0
  let dA0 = 0
  let dAb = 0
  let dL0 = 0
  let dLb = 0
  for (let j = 0; j < m; j++) {
    const t = (TWO_PI * j) / m
    const c = Math.cos(n * t)
    const phi = phi0 + b * c
    const dPhi = -b * n * Math.sin(n * t)
    const dTheta = 1 + 2 * n * skew * Math.cos(2 * n * t)
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)
    // A = ∫ (1 − cos φ)·θ′
    A += (1 - cosPhi) * dTheta
    dA0 += sinPhi * dTheta
    dAb += sinPhi * c * dTheta
    // L = ∫ g, g = √(θ′² sin²φ + φ′²)
    const g = Math.sqrt(dTheta * dTheta * sinPhi * sinPhi + dPhi * dPhi)
    L += g
    // ∂g/∂φ₀ = θ′² sinφ cosφ / g;  ∂g/∂b = (θ′² sinφ cosφ·c + φ′·∂φ′/∂b)/g
    const common = dTheta * dTheta * sinPhi * cosPhi
    dL0 += common / g
    dLb += (common * c + dPhi * (-n * Math.sin(n * t))) / g
  }
  const h = TWO_PI / m
  return { A: A * h, L: L * h, dA: [dA0 * h, dAb * h], dL: [dL0 * h, dLb * h] }
}

// ---------------------------------------------------------------------------
// Strata solves
// ---------------------------------------------------------------------------

const PHI_MARGIN = 1e-6

/** Wall Re τ′ = ½: φ₀ = π/2 pinned by symmetry; monotone 1-D solve of b for L. */
function solveWall(targetL: number, n: number, skew: number, m: number): WavyCircle | null {
  const bMax = Math.PI / 2 - PHI_MARGIN
  const at = (b: number) => wavyIntegrals(Math.PI / 2, b, n, skew, m).L
  if (targetL < at(0) - 1e-12) return null
  if (targetL > at(bMax)) return null // this lobe count cannot reach so long a curve
  let lo = 0
  let hi = bMax
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2
    if (at(mid) < targetL) lo = mid
    else hi = mid
  }
  const b = (lo + hi) / 2
  return new WavyCircle({ phi0: Math.PI / 2, b, n, skew })
}

/** Interior: damped 2-D Newton on (φ₀, b) with analytic Jacobian. */
function solveInterior(targetA: number, targetL: number, n: number, skew: number, m: number): WavyCircle | null {
  // Seed φ₀ from the latitude circle matching A (its L is the isoperimetric
  // minimum), then warm-start b by a 1-D bisection on L at fixed φ₀ —
  // continuation that puts Newton inside its convergence basin.
  let phi0 = Math.acos(1 - targetA / TWO_PI)
  const inBounds = (p: number, amp: number) =>
    p - Math.abs(amp) > PHI_MARGIN && p + Math.abs(amp) < Math.PI - PHI_MARGIN
  const bCap = Math.min(phi0, Math.PI - phi0) - PHI_MARGIN
  if (wavyIntegrals(phi0, bCap, n, skew, m).L < targetL) return null // this n cannot reach
  let lo = 0
  let hi = bCap
  for (let iter = 0; iter < 40; iter++) {
    const mid = (lo + hi) / 2
    if (wavyIntegrals(phi0, mid, n, skew, m).L < targetL) lo = mid
    else hi = mid
  }
  let b = (lo + hi) / 2
  const scale = Math.abs(targetA) + Math.abs(targetL)
  for (let iter = 0; iter < 60; iter++) {
    const { A, L, dA, dL } = wavyIntegrals(phi0, b, n, skew, m)
    const rA = A - targetA
    const rL = L - targetL
    if ((Math.abs(rA) + Math.abs(rL)) / scale < 1e-14) {
      return new WavyCircle({ phi0, b: Math.abs(b), n, skew })
    }
    const det = dA[0] * dL[1] - dA[1] * dL[0]
    if (Math.abs(det) < 1e-14) return null
    const stepP = (rA * dL[1] - rL * dA[1]) / det
    const stepB = (rL * dA[0] - rA * dL[0]) / det
    // damp until the step stays inside the family bounds
    let damp = 1
    while (damp > 1e-6 && !inBounds(phi0 - damp * stepP, b - damp * stepB)) damp /= 2
    if (damp <= 1e-6) return null
    phi0 -= damp * stepP
    b -= damp * stepB
  }
  return null
}

// ---------------------------------------------------------------------------
// SL₂(ℤ) representative enumeration
// ---------------------------------------------------------------------------

interface Representative {
  tauPrime: Complex
  g: Mat2Z
  flip: boolean
}

function inRegion(t: Complex): boolean {
  const dx = t.re - 0.5
  return t.re > REGION_TOL && t.re <= 0.5 + REGION_TOL && dx * dx + t.im * t.im >= 0.25 - REGION_TOL
}

/**
 * All τ′ = g·τ in the realizable region with Im τ′ ≥ Im(reduced τ)/bound,
 * i.e. |c·τ₀ + d|² ≤ bound over coprime (c, d); Re is T-shifted into (−½, ½]
 * and negative-Re representatives are reflected (flip = mirrored curve).
 */
function enumerateRepresentatives(tau: Complex, bound: number): Representative[] {
  const { tau: tau0, g: g0 } = new Lattice(tau).reduce()
  const reps: Representative[] = []
  const seen = new Set<string>()
  const cMax = Math.floor(Math.sqrt(bound) / tau0.im)
  for (let c = 0; c <= cMax; c++) {
    const dRadius = Math.sqrt(Math.max(0, bound - c * c * tau0.im * tau0.im))
    const dCenter = -c * tau0.re
    const dLo = Math.ceil(dCenter - dRadius)
    const dHi = Math.floor(dCenter + dRadius)
    for (let d = dLo; d <= dHi; d++) {
      if (c === 0 && d !== 1) continue // (0, ±1) give the same class; keep d = 1
      if (c > 0 && gcdInt(c, Math.abs(d)) !== 1) continue
      // complete to det 1: a·d − b·c = 1
      const { g: gg, x, y } = egcd(BigInt(d), BigInt(-c))
      if (gg !== 1n) continue
      let h = new Mat2Z(x, y, BigInt(c), BigInt(d))
      let t1 = mobius(h, tau0)
      // T-shift Re into (−½, ½]
      const m = Math.ceil(t1.re - 0.5 - REGION_TOL)
      if (m !== 0) {
        h = new Mat2Z(1n, BigInt(-m), 0n, 1n).mul(h)
        t1 = new Complex(t1.re - m, t1.im)
      }
      // reflect negative Re (extended fundamental domain; Re ±½ are T-equivalent)
      let flip = false
      let tp = t1
      if (t1.re < -REGION_TOL) {
        flip = true
        tp = new Complex(-t1.re, t1.im)
      } else if (t1.re < REGION_TOL) {
        continue // Re ≈ 0: rectangular classes appear via their boundary-circle representative
      }
      if (!inRegion(tp)) continue
      const key = `${tp.re.toFixed(9)},${tp.im.toFixed(9)}`
      if (seen.has(key)) continue
      seen.add(key)
      reps.push({ tauPrime: tp, g: h.mul(g0), flip })
    }
  }
  return reps
}

function gcdInt(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

// ---------------------------------------------------------------------------
// The solver
// ---------------------------------------------------------------------------

/**
 * Solve for profile curves realizing the lattice class of τ. Returns candidates
 * sorted by achieved L ascending (DESIGN policy: fattest torus first).
 */
export function solveProfileCurve(tau: Complex, opts: SolveOptions = {}): Candidate[] {
  const maxCandidates = opts.maxCandidates ?? 6
  const skew = opts.skew ?? 0
  const samples = opts.samples ?? 512
  const nMax = 8

  const candidates: Candidate[] = []
  for (let bound = 4; bound <= 64 && candidates.length < maxCandidates; bound *= 2) {
    candidates.length = 0
    for (const rep of enumerateRepresentatives(tau, bound)) {
      const targetA = 4 * Math.PI * rep.tauPrime.re
      const targetL = 4 * Math.PI * rep.tauPrime.im
      const solved = solveStrata(rep.tauPrime, targetA, targetL, opts.n, skew, nMax, samples)
      if (!solved) continue
      const torus = new HopfTorus(solved.curve, { samples })
      const achieved = { A: torus.area, L: torus.length }
      candidates.push({
        curve: solved.curve,
        rep: { g: rep.g, flip: rep.flip },
        n: solved.n,
        stratum: solved.stratum,
        achieved,
        residual:
          (Math.abs(achieved.A - targetA) + Math.abs(achieved.L - targetL)) / (targetA + targetL),
        tauPrime: new Complex(achieved.A, achieved.L).scale(1 / (4 * Math.PI)),
      })
    }
  }
  candidates.sort((a, b) => a.achieved.L - b.achieved.L)
  return candidates.slice(0, maxCandidates)
}

function solveStrata(
  tauPrime: Complex,
  targetA: number,
  targetL: number,
  pinnedN: number | undefined,
  skew: number,
  nMax: number,
  samples: number,
): { curve: ProfileCurve; n: number; stratum: Stratum } | null {
  const dx = tauPrime.re - 0.5
  const onBoundary = Math.abs(dx * dx + tauPrime.im * tauPrime.im - 0.25) < REGION_TOL
  const onWall = Math.abs(tauPrime.re - 0.5) < REGION_TOL

  if (onBoundary) {
    // latitude circle in closed form: A = 2π(1 − cos φ₀)
    const phi0 = Math.acos(1 - targetA / TWO_PI)
    return { curve: new LatitudeCircle(phi0), n: 0, stratum: 'boundary' }
  }
  const ns = pinnedN !== undefined ? [pinnedN] : Array.from({ length: nMax }, (_, i) => i + 1)
  for (const n of ns) {
    if (onWall) {
      const curve = solveWall(targetL, n, skew, samples)
      if (curve) return { curve, n, stratum: 'wall' }
    } else {
      const curve = solveInterior(targetA, targetL, n, skew, samples)
      if (curve) return { curve, n, stratum: 'interior' }
    }
  }
  return null
}
