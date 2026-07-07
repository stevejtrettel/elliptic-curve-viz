/**
 * A curve over F_p as a point set in P²(F_p). Deliberately equation-agnostic:
 * a FiniteCurve is just its prime field plus the solution set it defines, so
 * the input need NOT be in Weierstrass form. Three factories cover the cases:
 *
 *   projectiveCurve(p, F)   general homogeneous F(X,Y,Z) = 0
 *   affineCurve(p, f)       f(x,y) = 0 in the affine chart (lifted to [x:y:1])
 *   weierstrass(p, a, b)    convenience: y² = x³ + ax + b
 *
 * A CurveData → weierstrass adapter (later) is all it takes to plot a catalog
 * curve's F_p×F_p view alongside its Hopf torus.
 */
import { FiniteField, type ProjectivePoint } from './field'

export interface FiniteCurve {
  readonly field: FiniteField
  /** The solution set in P²(F_p), canonical form. */
  points(): ProjectivePoint[]
  readonly label?: string
}

/** A curve from a general homogeneous form F(X,Y,Z); F = 0 defines it in P²(F_p). */
export function projectiveCurve(
  p: number,
  F: (X: number, Y: number, Z: number) => number,
  label?: string,
): FiniteCurve {
  const field = new FiniteField(p)
  return {
    field,
    ...(label !== undefined && { label }),
    points: () => field.solveProjective(F),
  }
}

/**
 * A curve from an affine form f(x,y); f = 0 defines it in F_p×F_p. Solutions
 * are lifted to [x:y:1] — points at infinity are NOT inferred (the affine form
 * carries no information about them). Use projectiveCurve for a homogeneous F.
 */
export function affineCurve(
  p: number,
  f: (x: number, y: number) => number,
  label?: string,
): FiniteCurve {
  const field = new FiniteField(p)
  return {
    field,
    ...(label !== undefined && { label }),
    points: () => field.solve(f).map(([x, y]) => [x, y, 1] as ProjectivePoint),
  }
}

/**
 * Weierstrass curve y² = x³ + ax + b over F_p, homogenized to
 * Y²Z = X³ + aXZ² + bZ³. Its one point at infinity is [0:1:0].
 */
export function weierstrass(p: number, a: number, b: number, label?: string): FiniteCurve {
  return projectiveCurve(
    p,
    (X, Y, Z) => Y * Y * Z - (X * X * X + a * X * Z * Z + b * Z * Z * Z),
    label ?? `y² = x³ + ${a}x + ${b} over F_${p}`,
  )
}
