/**
 * General curve-family solving (DESIGN.md §5.4 extension):
 *
 * solveFamily — ANY 2-parameter space of profile curves (u, v) ↦ curve,
 * solved against the Hopf-torus targets (A, L) by damped Newton with a
 * finite-difference Jacobian. Returns null when no solution is found
 * (unreachable target, singular family, divergence).
 *
 * solvePaperFamily — the paper's own family (lifting-modp tau.js):
 *   φ(t) = π/2 + a·b·cos(nt),  θ(t) = t + a·sin(2nt).
 * This family is a DEGENERATE case of the general solver: its enclosed area
 * is 2π identically — sin(a·b·cos nt) carries only harmonics cos(knt) with
 * k odd, all orthogonal to θ′ = 1 + 2na·cos(2nt) — so every member sits on
 * the wall Re τ′ = ±½ by construction and the (A, L) Jacobian has rank 1.
 * Hitting a wall class τ is therefore a ONE-parameter solve: the skew a is a
 * free aesthetic, and the amplitude factor b is determined by
 * L = 4π·Im τ (bisection on the monotone L(b)). This is why the paper's
 * curves could be hand-tuned at all.
 */
import { Mat2Z } from '@/math/arithmetic'

import { Complex } from '@/math/core'

import { DiscreteCurve, HopfTorus, type ProfileCurve } from '@/math/hopf'

import type { Candidate } from './solver'

const TWO_PI = 2 * Math.PI

export interface FamilySolution {
  u: number
  v: number
  curve: ProfileCurve
  achieved: { A: number; L: number }
  /** Relative residual against the target. */
  residual: number
}

export interface SolveFamilyOptions {
  samples?: number
  maxIterations?: number
  /** Convergence: relative residual below this. */
  tolerance?: number
  /** Finite-difference step for the Jacobian. */
  h?: number
}

/**
 * Solve family(u, v) for Hopf-torus invariants (A, L) = target, starting from
 * (u0, v0). Damped Newton; null on divergence or singular Jacobian.
 *
 * Relationship to solver.ts: solveInterior is the wavy-family special case
 * with ANALYTIC partials (faster, tighter tolerance) — this is the general
 * extension point for arbitrary families (evolved/discrete curves), paying a
 * finite-difference Jacobian and a full HopfTorus build per evaluation.
 */
export function solveFamily(
  family: (u: number, v: number) => ProfileCurve,
  u0: number,
  v0: number,
  target: { A: number; L: number },
  opts: SolveFamilyOptions = {},
): FamilySolution | null {
  const samples = opts.samples ?? 512
  const maxIterations = opts.maxIterations ?? 40
  const tolerance = opts.tolerance ?? 1e-12
  const h = opts.h ?? 1e-6
  const scale = Math.abs(target.A) + Math.abs(target.L)

  const F = (u: number, v: number): [number, number] | null => {
    try {
      const torus = new HopfTorus(family(u, v), { samples })
      return [torus.area - target.A, torus.length - target.L]
    } catch {
      return null // family threw (parameters out of domain)
    }
  }

  let u = u0
  let v = v0
  let f = F(u, v)
  if (!f) return null
  let res = (Math.abs(f[0]) + Math.abs(f[1])) / scale

  for (let it = 0; it < maxIterations && res > tolerance; it++) {
    // finite-difference Jacobian
    const fu = F(u + h, v)
    const fv = F(u, v + h)
    if (!fu || !fv) return null
    const j11 = (fu[0] - f[0]) / h
    const j21 = (fu[1] - f[1]) / h
    const j12 = (fv[0] - f[0]) / h
    const j22 = (fv[1] - f[1]) / h
    const det = j11 * j22 - j12 * j21
    if (!Number.isFinite(det) || Math.abs(det) < 1e-20) return null // singular family
    let du = (-f[0] * j22 + f[1] * j12) / det
    let dv = (f[0] * j21 - f[1] * j11) / det
    // damping: halve the step until the residual improves
    let improved = false
    for (let d = 0; d < 8; d++) {
      const fNext = F(u + du, v + dv)
      if (fNext) {
        const resNext = (Math.abs(fNext[0]) + Math.abs(fNext[1])) / scale
        if (resNext < res) {
          u += du
          v += dv
          f = fNext
          res = resNext
          improved = true
          break
        }
      }
      du /= 2
      dv /= 2
    }
    if (!improved) return null
  }
  if (res > tolerance) return null
  const torus = new HopfTorus(family(u, v), { samples })
  return { u, v, curve: family(u, v), achieved: { A: torus.area, L: torus.length }, residual: res }
}

/** The paper family φ = π/2 + a·b·cos(nt), θ = t + a·sin(2nt), sampled. */
export function paperWavy(a: number, b: number, n: number, samples = 512): DiscreteCurve {
  return new DiscreteCurve(
    Array.from({ length: samples }, (_, j) => {
      const t = (TWO_PI * j) / samples
      return { phi: Math.PI / 2 + a * b * Math.cos(n * t), theta: t + a * Math.sin(2 * n * t) }
    }),
  )
}

export interface PaperFamilySolution {
  a: number
  b: number
  n: number
  curve: DiscreteCurve
  achieved: { A: number; L: number }
  residual: number
}

/**
 * Solve the paper family for a WALL class τ (|Re τ| = ½): fix the skew a
 * (aesthetic), bisect the amplitude factor b for L = 4π·Im τ. Null when τ is
 * not a wall class or the length is unreachable within the φ-domain bound
 * |a·b| < π/2.
 */
export function solvePaperFamily(
  tau: Complex,
  n: number,
  opts: { a?: number; samples?: number } = {},
): PaperFamilySolution | null {
  if (Math.abs(Math.abs(tau.re) - 0.5) > 1e-6) return null // family lives on the wall
  const a = opts.a ?? 0.1
  const samples = opts.samples ?? 512
  const targetL = 4 * Math.PI * tau.im

  const lengthAt = (b: number): number => new HopfTorus(paperWavy(a, b, n, samples), { samples }).length
  const bMax = (Math.PI / 2 - 1e-3) / Math.abs(a)
  let lo = 0
  let hi = bMax
  if (lengthAt(lo) > targetL || lengthAt(hi) < targetL) return null
  for (let it = 0; it < 100; it++) {
    const mid = (lo + hi) / 2
    if (lengthAt(mid) < targetL) lo = mid
    else hi = mid
  }
  const b = (lo + hi) / 2
  const curve = paperWavy(a, b, n, samples)
  const torus = new HopfTorus(curve, { samples })
  const residual =
    Math.abs(torus.length - targetL) / targetL + Math.abs(torus.area - TWO_PI) / TWO_PI
  return { a, b, n, curve, achieved: { A: torus.area, L: torus.length }, residual }
}

/**
 * A solved paper-family curve as a solver-shaped Candidate (wall stratum).
 * rep.g is nominal (identity): buildTorusScene only consumes rep.flip —
 * matchLattices recomputes the SL₂(ℤ) word from its own reductions.
 */
export function paperFamilyCandidate(sol: PaperFamilySolution): Candidate {
  return {
    curve: sol.curve,
    rep: { g: Mat2Z.ID, flip: false },
    n: sol.n,
    stratum: 'wall',
    achieved: sol.achieved,
    residual: sol.residual,
    tauPrime: new Complex(sol.achieved.A, sol.achieved.L).scale(1 / (4 * Math.PI)),
  }
}
