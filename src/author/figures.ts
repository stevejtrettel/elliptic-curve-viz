/**
 * Paper-presentation helpers (DESIGN.md §7.5). A curve's presentation
 * (PaperStyle, from a demo's presentation.json) specifies the AESTHETICS:
 * profile-family parameters {a, n} (skew and lobe count — the amplitude
 * factor b is SOLVED from τ, see math/families solvePaperFamily), color,
 * point radius per k, surface. The historical hand-tuned b values live only
 * in the tests, as the measured record of the paper's tuning accuracy.
 */
import { Mat2Z } from '@/math/arithmetic'
import { Complex } from '@/math/core'
import type { Candidate } from '@/math/families'
import { HopfTorus, type ProfileCurve } from '@/math/hopf'

import type { LabeledCurve } from './catalog'

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

/**
 * The paper's base point radius for F_{p^k}: exact table entry, else nearest k.
 * The returned value is DOUBLED relative to the stored legacy radius: legacy
 * boosts by 1+|q|² = 2/(1−w) while PointCloud boosts by scaleFactor/2 =
 * 1/(1−w) — same conformal law, half the constant — so 2× the base radius
 * reproduces the paper's sizes exactly, pointwise.
 */
export function paperRadius(lc: LabeledCurve, k: number, fallback = 0.035): number {
  const table = lc.paper?.radiusByK
  if (!table || Object.keys(table).length === 0) return fallback
  if (table[k] !== undefined) return 2 * table[k]
  const nearest = Object.keys(table)
    .map(Number)
    .sort((a, b) => Math.abs(a - k) - Math.abs(b - k))[0]!
  return 2 * table[nearest]!
}
