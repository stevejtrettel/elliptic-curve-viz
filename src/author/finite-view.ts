/**
 * Bridge from a catalog CurveData to its F_p×F_p view (math/finite-field). The
 * direct point picture needs the actual Weierstrass model y² = x³ + fx + g,
 * which arrives only via the offline Deuring lift and is stored on
 * `CurveData.equation`. That equation is the only requirement — any prime is
 * fine, since the standard view plots just the solutions (≈p spheres).
 */
import type { CurveData } from '@/math/arithmetic'
import { type FiniteCurve, weierstrass } from '@/math/finite-field'

/**
 * The F_p×F_p view of a catalog curve, built from its stored Weierstrass
 * equation. Throws if the curve carries no `equation` (see hasFiniteView).
 */
export function finiteCurveFromData(data: CurveData): FiniteCurve {
  if (!data.equation) {
    throw new Error('curve has no Weierstrass equation — the F_p view needs CurveData.equation (Deuring lift is offline)')
  }
  return weierstrass(Number(data.p), Number(data.equation.f), Number(data.equation.g))
}

/** Whether this curve can be shown in the F_p view: it carries a Weierstrass equation. */
export function hasFiniteView(data: CurveData): boolean {
  return data.equation !== undefined
}
