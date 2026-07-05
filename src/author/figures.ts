/**
 * Paper reproduction helpers (DESIGN.md §7.5): the exact profile-curve family
 * and per-curve presentation of the Bridges 2025 paper / lifting-modp. The
 * hand-tuned values live as `paper` blocks in data/curves.json (PaperStyle).
 *
 * Legacy profile family (lifting-modp data/<disc>/tau.js):
 *   φ(t) = π/2 + a·b·cos(nt),  θ(t) = t + a·sin(2nt)
 * — our WavyCircle with amplitude a·b and skew a, EXCEPT that the paper's
 * curves may violate the monotone-θ bound (hex: |2n·skew| = 1.656), so we
 * sample the formulas into a DiscreteCurve. Rectangular discriminants need no
 * injection: the solver's boundary candidate IS the legacy latitude circle.
 *
 * FUTURE (Steve, 2026-07-05): numerically search THIS family — (a, b) at
 * fixed n are two parameters for the two targets (A, L), so solving for the
 * paper look at exact τ is well-posed. Lives next to solveProfileCurve.
 */
import { Mat2Z } from '@/math/arithmetic'
import { Complex } from '@/math/core'
import type { Candidate } from '@/math/families'
import { DiscreteCurve, HopfTorus, type ProfileCurve } from '@/math/hopf'

import type { CameraSpec } from '@/studio'

import type { LabeledCurve } from './catalog'

/** The legacy wavy family, sampled exactly (512 uniform samples, spectral-safe). */
export function legacyWavy(a: number, b: number, n: number, samples = 512): DiscreteCurve {
  return new DiscreteCurve(
    Array.from({ length: samples }, (_, j) => {
      const t = (2 * Math.PI * j) / samples
      return { phi: Math.PI / 2 + a * b * Math.cos(n * t), theta: t + a * Math.sin(2 * n * t) }
    }),
  )
}

/** Wrap an explicit profile curve as a solver-shaped Candidate (identity rep, no flip). */
export function profileCandidate(curve: ProfileCurve): Candidate {
  const torus = new HopfTorus(curve)
  const achieved = { A: torus.area, L: torus.length }
  return {
    curve,
    rep: { g: Mat2Z.ID, flip: false },
    n: 0,
    stratum: 'interior',
    achieved,
    residual: 0,
    tauPrime: new Complex(achieved.A, achieved.L).scale(1 / (4 * Math.PI)),
  }
}

/** The curve's paper profile as a ProfileCurve, or null (solver default). */
export function paperProfile(lc: LabeledCurve): DiscreteCurve | null {
  const p = lc.paper?.profile
  return p ? legacyWavy(p.a, p.b, p.n) : null
}

/** The paper's base point radius for F_{p^k}: exact table entry, else nearest k. */
export function paperRadius(lc: LabeledCurve, k: number, fallback = 0.035): number {
  const table = lc.paper?.radiusByK
  if (!table || Object.keys(table).length === 0) return fallback
  if (table[k] !== undefined) return table[k]
  const nearest = Object.keys(table)
    .map(Number)
    .sort((a, b) => Math.abs(a - k) - Math.abs(b - k))[0]!
  return table[nearest]!
}

/** The paper's two camera rigs (lifting-modp scene files). */
export const CAMERA_RIGS = {
  // camera.position = (0.1, 10, −0.1), lookAt origin
  top: { azimuth: 3.13, elevation: 1.45, fill: 0.72, fov: 50 },
  // camera.position = (1, 2.2, −5)
  threequarter: { azimuth: 2.94, elevation: 0.41, fill: 0.72, fov: 50 },
} satisfies Record<string, Partial<CameraSpec>>
