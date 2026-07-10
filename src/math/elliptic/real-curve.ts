/**
 * The REAL affine locus of a Weierstrass elliptic curve y² = x³ + a·x + b, as
 * polylines in the (x, y) plane — the classic textbook picture.
 *
 * This is elementary and does NOT go through ℘ / the period lattice: the curve
 * is just y = ±√(x³ + a·x + b) over the x where the cubic is ≥ 0. Real curves
 * come in two shapes, by the sign of the cubic's discriminant −4a³ − 27b²:
 *
 *   • three real roots e₁<e₂<e₃  (−4a³−27b² > 0)  → an OVAL over [e₁, e₂]
 *     plus an UNBOUNDED branch over [e₃, ∞);
 *   • one real root e₁          (−4a³−27b² < 0)  → a single unbounded branch
 *     over [e₁, ∞).
 *
 * The unbounded branch runs off to infinity, so it is clipped at `xMax` into an
 * open arc. Samples cluster toward the roots (where the curve has a vertical
 * tangent) so the tubes stay smooth there.
 *
 * PURE (DESIGN.md §4): no dependencies.
 */

export type Pt = [number, number]

export interface RealComponent {
  points: Pt[]
  /** true = the bounded oval (a closed loop); false = the clipped branch (open arc). */
  closed: boolean
}

export interface RealCurveOptions {
  /** Right clip for the unbounded branch (largest x drawn). Default: data-driven. */
  xMax?: number
  /** Samples per half-branch (each component uses ~2× this). Default 200. */
  samples?: number
}

/** Real roots (ascending) of the depressed cubic x³ + a·x + b — one or three. */
export function cubicRealRoots(a: number, b: number): number[] {
  const p = a
  const q = b
  if (Math.abs(p) < 1e-14 && Math.abs(q) < 1e-14) return [0] // y² = x³
  const disc = -4 * p ** 3 - 27 * q ** 2 // > 0 ⇒ three distinct real roots
  if (disc > 0) {
    // three real roots (here p < 0) — the trigonometric solution
    const m = 2 * Math.sqrt(-p / 3)
    const C = Math.max(-1, Math.min(1, (3 * q) / (p * m))) // = (3q)/(2p)·√(−3/p)
    const t0 = Math.acos(C) / 3
    return [0, 1, 2].map((k) => m * Math.cos(t0 - (2 * Math.PI * k) / 3)).sort((x, y) => x - y)
  }
  // one real root (disc < 0) — Cardano
  const D = (q / 2) ** 2 + (p / 3) ** 3
  const s = Math.sqrt(D)
  return [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s)]
}

/** n+1 samples of [lo, hi] clustered toward BOTH ends (cosine spacing). */
function cosineSpace(lo: number, hi: number, n: number): number[] {
  const xs: number[] = []
  for (let i = 0; i <= n; i++) xs.push(lo + ((hi - lo) * (1 - Math.cos((Math.PI * i) / n))) / 2)
  return xs
}

/** n+1 samples of [lo, hi] clustered toward `lo` (quadratic spacing). */
function rootSpace(lo: number, hi: number, n: number): number[] {
  const xs: number[] = []
  for (let i = 0; i <= n; i++) xs.push(lo + (hi - lo) * (i / n) ** 2)
  return xs
}

/**
 * The real locus of y² = x³ + a·x + b as drawable components. The oval (if any)
 * is a closed loop; the unbounded branch is an open arc clipped at `xMax`.
 */
export function realEllipticCurve(a: number, b: number, opts: RealCurveOptions = {}): RealComponent[] {
  const roots = cubicRealRoots(a, b)
  const f = (x: number): number => x * x * x + a * x + b
  const yUp = (x: number): number => Math.sqrt(Math.max(0, f(x)))
  const n = opts.samples ?? 200
  const rMin = roots[0]!
  const rMax = roots[roots.length - 1]!
  const spread = Math.max(rMax - rMin, 1)
  const xMax = opts.xMax ?? rMax + Math.max(2, 1.5 * spread)

  const comps: RealComponent[] = []

  // bounded OVAL over [e₁, e₂] (only when the cubic has three real roots)
  if (roots.length === 3) {
    const xs = cosineSpace(roots[0]!, roots[1]!, n)
    const pts: Pt[] = xs.map((x) => [x, yUp(x)] as Pt) // upper arc, x increasing (ends at y≈0)
    for (let i = xs.length - 2; i >= 1; i--) pts.push([xs[i]!, -yUp(xs[i]!)]) // lower arc back (interior only)
    comps.push({ points: pts, closed: true })
  }

  // UNBOUNDED branch over [eₗₐₛₜ, xMax], clipped — a "U" opening to the right
  {
    const xs = rootSpace(rMax, xMax, n)
    const pts: Pt[] = []
    for (let i = xs.length - 1; i >= 0; i--) pts.push([xs[i]!, -yUp(xs[i]!)]) // lower, xMax → root (ends at apex)
    for (let i = 1; i < xs.length; i++) pts.push([xs[i]!, yUp(xs[i]!)]) // upper, root → xMax (skip the apex)
    comps.push({ points: pts, closed: false })
  }

  return comps
}
