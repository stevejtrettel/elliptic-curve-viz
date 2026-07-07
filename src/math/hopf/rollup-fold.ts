/**
 * The growing-sphere roll-up (DESIGN.md §9 view 4): a homotopy from the flat
 * fundamental domain of a Hopf torus to the torus itself, plus the projection
 * pole that keeps it from billowing.
 *
 * At fold parameter τ = 1/R the picture is the genuine radius-R Pinkall torus
 * R·rollUp(z/R) ⊂ S³_R, stereographically projected. Because stereographic
 * projection commutes with dilation about its pole, that projection equals the
 * tangent-plane homotopy
 *
 *   fold(z, τ) = [ F(c + τ(z − c)) − F(c) ] / τ,   F = proj ∘ rollUp,
 *
 * exactly (not to leading order). τ = 1 is the torus (F recentered at c); as
 * τ → 0 it converges to the linear image of the lattice — the flat fundamental
 * parallelogram. c is the domain point held fixed at the origin.
 */
import { Complex, type Vec3, Vec4 } from '@/math/core'

import { S3Projection } from './projection'
import type { HopfTorus } from './torus'

/** c + τ(z − c), in ℂ. */
function lerpAbout(c: Complex, z: Complex, tau: number): Complex {
  return new Complex(c.re + tau * (z.re - c.re), c.im + tau * (z.im - c.im))
}

/**
 * A closure that folds flat coordinates for a fixed torus/projection/center:
 * `fold(z, τ)` places z ∈ ℂ/Λ at roll parameter τ ∈ (0, 1] (1 = torus, → 0
 * flat). The origin F(c) is captured once so each call is a single rollUp.
 */
export function rollUpFold(
  hopf: HopfTorus,
  proj: S3Projection,
  center: Complex,
): (z: Complex, tau: number) => Vec3 {
  const origin = proj.project(hopf.rollUp(center))
  return (z, tau) => proj.project(hopf.rollUp(lerpAbout(center, z, tau))).sub(origin).scale(1 / tau)
}

/** τ samples used to score candidate poles across the whole fold. */
const SEL_TAUS = [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]

/**
 * The stereographic pole that keeps the fold from billowing. The mid-fold
 * projected size depends strongly on where the torus sits relative to the pole
 * (a point sweeping near the pole balloons to infinity), and the worst case is
 * often at an intermediate τ, not at the torus itself. rollUp does not depend
 * on the pole, so we sample it once over a coarse (z × τ) grid and only
 * re-project per candidate — choosing among ±axes and sample-antipodes the pole
 * that minimizes the largest projected size over the whole fold.
 */
export function rollUpPole(hopf: HopfTorus, center: Complex): Vec4 {
  const [w1, w2] = hopf.lattice
  const grid: Complex[] = []
  for (let a = 0; a < 1; a += 0.06)
    for (let b = 0; b < 1; b += 0.06)
      grid.push(new Complex(w1.re * a + w2.re * b, w1.im * a + w2.im * b))
  const cache = SEL_TAUS.map((t) => grid.map((z) => hopf.rollUp(lerpAbout(center, z, t))))
  const centerV = hopf.rollUp(center)

  const cands: Vec4[] = []
  for (const s of [1, -1])
    for (const ax of [0, 1, 2, 3]) {
      const q = [0, 0, 0, 0]
      q[ax] = s
      cands.push(new Vec4(q[0]!, q[1]!, q[2]!, q[3]!))
    }
  for (const x of cache[0]!) cands.push(new Vec4(-x.x, -x.y, -x.z, -x.w).normalize())

  const proj = new S3Projection()
  let best = cands[0]!
  let bestPeak = Infinity
  for (const cand of cands) {
    proj.pole = cand
    const origin = proj.project(centerV)
    let peak = 0
    let bad = false
    for (let ti = 0; ti < SEL_TAUS.length && !bad; ti++) {
      const t = SEL_TAUS[ti]!
      for (const v of cache[ti]!) {
        const p = proj.project(v).sub(origin).scale(1 / t)
        const r = Math.hypot(p.x, p.y, p.z)
        if (!Number.isFinite(r)) {
          bad = true
          break
        }
        if (r > peak) peak = r
      }
    }
    if (!bad && peak < bestPeak) {
      bestPeak = peak
      best = cand
    }
  }
  return best
}
