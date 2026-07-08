/**
 * Builds the R³ picture of E = ℂ/(ℤ+τℤ) sitting in an affine patch of CP²
 * via z ↦ [℘(z):℘′(z):1], i.e. the affine coordinates (℘, ℘′) ∈ ℂ² ≅ R⁴
 * projected to R³ by dropping one real coordinate.
 *
 * The curve meets the line at infinity at the single point O = [0:1:0] (the
 * flex, = the pole z = 0), so in this chart exactly ONE neighbourhood blows
 * up. We cut it with a smooth ellipsoidal cutoff: marching-squares over the
 * (a,b) parameter torus at the level set {ellipsoid = 1}, keeping the inside
 * (torus-minus-a-disk) and extracting the crossing curve as a boundary loop.
 *
 * Outputs the surface triangles (non-indexed), the boundary loop(s), and the
 * real locus E(ℝ) with its −1 twist as clipped runs. The lattice grid is built
 * separately by buildHierGrid / buildGridCorners.
 */
import { Complex } from '@/math/core'
import { weierstrassP, termsFor, type WP } from '@/math/elliptic'

export type Vec3 = [number, number, number]
export interface Ellipsoid {
  rx: number
  ry: number
  rz: number
}
export type Projection = (w: WP) => Vec3

/** A polyline on the surface: an open arc (capped on the cutoff) or a closed loop. */
export interface Run {
  points: Vec3[]
  closed: boolean
}

/** Pick 3 of the 4 real coordinates of (℘, ℘′); ℘-coords scaled by sP, ℘′ by sDP. */
export function makeProjection(mode: string, sP: number, sDP: number): Projection {
  return (w) => {
    const pr = w.p.re * sP
    const pi = w.p.im * sP
    const dr = w.dp.re * sDP
    const di = w.dp.im * sDP
    switch (mode) {
      case 'p.im,dp.im,p.re':
        return [pi, di, pr]
      case 'p.re,p.im,dp.re':
        return [pr, pi, dr]
      case 'p.re,dp.re,dp.im':
        return [pr, dr, di]
      case 'p.re,dp.re,p.im':
      default:
        return [pr, dr, pi] // real locus (Im=0) lands in the z=0 plane
    }
  }
}

function fEll(P: Vec3, e: Ellipsoid): number {
  return (P[0] / e.rx) ** 2 + (P[1] / e.ry) ** 2 + (P[2] / e.rz) ** 2
}

/** Root-find the ellipsoid crossing along the segment zA→zB (A inside, B outside). */
function crossing(zA: Complex, zB: Complex, proj: Projection, ell: Ellipsoid, tau: Complex, terms: number): Vec3 {
  let lo = 0
  let hi = 1
  let P: Vec3 = [0, 0, 0]
  for (let it = 0; it < 24; it++) {
    const t = (lo + hi) / 2
    const z = new Complex(zA.re + (zB.re - zA.re) * t, zA.im + (zB.im - zA.im) * t)
    P = proj(weierstrassP(z, tau, terms))
    if (fEll(P, ell) <= 1) lo = t
    else hi = t
  }
  return P
}

export interface SurfaceBuild {
  positions: Float32Array
  boundaryLoops: Vec3[][]
  /** E(ℝ): ℘, ℘′ both real. */
  realRuns: Run[]
  /** The −1 quadratic twist's real points: ℘ real, ℘′ imaginary. */
  twistRuns: Run[]
}

export interface BuildOptions {
  tau: Complex
  proj: Projection
  ell: Ellipsoid
  /** grid segments per lattice direction */
  N: number
}

export function buildSurface(opts: BuildOptions): SurfaceBuild {
  const { tau, proj, ell, N } = opts
  const terms = termsFor(tau)

  // ── grid over (a,b) ∈ [−0.5, 0.5), pole z = 0 at the centre ──────────────
  const zGrid: Complex[] = new Array(N * N)
  const P: Vec3[] = new Array(N * N)
  const inside: boolean[] = new Array(N * N)
  for (let i = 0; i < N; i++) {
    const a = -0.5 + i / N
    for (let j = 0; j < N; j++) {
      const b = -0.5 + j / N
      const z = new Complex(a + b * tau.re, b * tau.im)
      const p = proj(weierstrassP(z, tau, terms))
      const idx = i * N + j
      zGrid[idx] = z
      P[idx] = p
      inside[idx] = fEll(p, ell) <= 1
    }
  }

  // ── clip each quad against the ellipsoid (marching squares) ──────────────
  const positions: number[] = []
  // Boundary crossings are keyed by the grid EDGE they lie on (shared by
  // exactly two quads) — not by R³ position, which self-collides under the
  // coordinate-dropping projection and would fragment the loop.
  const segs: [BEnd, BEnd][] = []
  const pushTri = (a: Vec3, b: Vec3, c: Vec3) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }

  for (let i = 0; i < N; i++) {
    const ni = (i + 1) % N
    for (let j = 0; j < N; j++) {
      const nj = (j + 1) % N
      // corners CCW in (a,b)
      const corner = [i * N + j, ni * N + j, ni * N + nj, i * N + nj]
      let nIn = 0
      for (const c of corner) if (inside[c]!) nIn++
      if (nIn === 0) continue
      if (nIn === 4) {
        const [c0, c1, c2, c3] = corner as [number, number, number, number]
        pushTri(P[c0]!, P[c1]!, P[c2]!)
        pushTri(P[c0]!, P[c2]!, P[c3]!)
        continue
      }
      // mixed: walk the 4 edges, building the inside polygon + boundary crossings
      const poly: Vec3[] = []
      const bnd: BEnd[] = []
      for (let e = 0; e < 4; e++) {
        const A = corner[e]!
        const B = corner[(e + 1) % 4]!
        if (inside[A]!) poly.push(P[A]!)
        if (inside[A]! !== inside[B]!) {
          const zin = inside[A]! ? zGrid[A]! : zGrid[B]!
          const zout = inside[A]! ? zGrid[B]! : zGrid[A]!
          const X = crossing(zin, zout, proj, ell, tau, terms)
          poly.push(X)
          bnd.push({ p: X, key: A < B ? `${A}_${B}` : `${B}_${A}` })
        }
      }
      for (let k = 1; k + 1 < poly.length; k++) pushTri(poly[0]!, poly[k]!, poly[k + 1]!)
      if (bnd.length === 2) {
        segs.push([bnd[0]!, bnd[1]!])
      } else if (bnd.length === 4) {
        // Diagonal saddle: resolve the ambiguous crossing pairing by the sign
        // of the quad centre, so the boundary never mis-connects into a spur.
        const zc = zGrid[corner[0]!]!.add(zGrid[corner[1]!]!).add(zGrid[corner[2]!]!).add(zGrid[corner[3]!]!).scale(0.25)
        const cIn = fEll(proj(weierstrassP(zc, tau, terms)), ell) <= 1
        const pairAdjacent = inside[corner[0]!]! === cIn
        if (pairAdjacent) {
          segs.push([bnd[0]!, bnd[1]!], [bnd[2]!, bnd[3]!])
        } else {
          segs.push([bnd[1]!, bnd[2]!], [bnd[3]!, bnd[0]!])
        }
      }
    }
  }

  const real = traceRealLocus(tau, proj, ell)
  return {
    positions: new Float32Array(positions),
    boundaryLoops: chainLoops(segs),
    realRuns: real.curve,
    twistRuns: real.twist,
  }
}

// ── chain boundary segments into ordered closed loops ──────────────────────
// A boundary crossing point tagged with the grid edge it sits on.
interface BEnd {
  p: Vec3
  key: string
}

function chainLoops(segs: [BEnd, BEnd][]): Vec3[][] {
  const node = new Map<string, { p: Vec3; links: string[] }>()
  const touch = (e: BEnd) => {
    if (!node.has(e.key)) node.set(e.key, { p: e.p, links: [] })
    return e.key
  }
  for (const [a, b] of segs) {
    const ka = touch(a)
    const kb = touch(b)
    if (ka === kb) continue
    node.get(ka)!.links.push(kb)
    node.get(kb)!.links.push(ka)
  }

  const visited = new Set<string>()
  const loops: Vec3[][] = []
  for (const [startKey] of node) {
    if (visited.has(startKey)) continue
    const loop: Vec3[] = []
    let cur = startKey
    let prev = ''
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      const n = node.get(cur)!
      loop.push(n.p)
      const next = n.links.find((l) => l !== prev && !visited.has(l))
      prev = cur
      cur = next ?? ''
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

// ── real locus E(ℝ) and its −1 twist ───────────────────────────────────────

interface RealForms {
  /** E(ℝ): ℘ and ℘′ both real. */
  curve: Run[]
  /** The −1 twist: ℘ real, ℘′ imaginary. */
  twist: Run[]
}

/**
 * The real locus, traced as straight lines in the z-plane.
 *
 * For a real curve (g₂, g₃ real ⟺ Re τ = 0 or ½) ℘ is real exactly where
 * z̄ ≡ ±z mod Λ:
 *   • z̄ ≡ +z  ⇒  Im z = 0, and (when Re τ = 0) Im z = ½·Im τ   — horizontal
 *   • z̄ ≡ −z  ⇒  Re z = 0 and Re z = ½                          — vertical
 * Each is a geodesic of the torus, so we trace it directly — it runs smoothly
 * through the branch points (℘′ = 0) and clips cleanly on the ellipsoid, with
 * none of the junction trouble a contour tracer hits there. A candidate is
 * kept only if ℘ is actually real along it (so a non-real lattice draws
 * nothing), then sorted into E(ℝ) (℘′ real) or the twist (℘′ imaginary) by
 * the sign of ℘′².
 */
function traceRealLocus(tau: Complex, proj: Projection, ell: Ellipsoid): RealForms {
  const terms = termsFor(tau)
  // Vertical lines close after `per` periods in b (1 when Re τ = 0, else 2).
  const per = Math.abs(tau.re - Math.round(tau.re)) < 1e-6 ? 1 : 2
  const horizontal = (b: number) => (u: number) => new Complex(-0.5 + u + b * tau.re, b * tau.im)
  const vertical = (re: number) => (u: number) => new Complex(re, (-0.5 + u) * per * tau.im)
  const candidates = [horizontal(0), horizontal(0.5), vertical(0), vertical(0.5)]

  const curve: Run[] = []
  const twist: Run[] = []
  for (const zOf of candidates) {
    // Sample the line: is ℘ real along it, and if so is ℘′ real or imaginary?
    let sumImP = 0
    let sumAbsP = 0
    let dpReSq = 0 // Σ Re(℘′²): sign separates E(ℝ) (>0) from the twist (<0)
    let n = 0
    for (let k = 0; k < 240; k++) {
      const z = zOf((k + 0.5) / 240)
      if (z.abs2() < 1e-4) continue // skip the pole
      const w = weierstrassP(z, tau, terms)
      sumImP += Math.abs(w.p.im)
      sumAbsP += w.p.abs()
      dpReSq += w.dp.re * w.dp.re - w.dp.im * w.dp.im
      n++
    }
    // A genuinely real line gives Σ|Im ℘| / Σ|℘| ~ 1e-16; the nearest non-real
    // τ (Re τ ≈ 0.005) gives ≥ 1e-6, so 1e-9 rejects non-real lattices.
    if (n === 0 || sumImP > 1e-9 * sumAbsP) continue
    ;(dpReSq >= 0 ? curve : twist).push(...traceLine(zOf, 720, proj, ell, tau, terms))
  }
  return { curve, twist }
}

export interface GridRun extends Run {
  radius: number
}

/** The `n` grid values i/n wrapped into [−0.5, 0.5); always includes 0. */
function gridVals(n: number): number[] {
  const vals: number[] = []
  for (let i = 0; i < n; i++) {
    const v = i / n
    vals.push(v >= 0.5 ? v - 1 : v)
  }
  return vals
}

/** Trace both lattice lines through grid value v (constant a, then constant b). */
function gridLinesAt(v: number, proj: Projection, ell: Ellipsoid, tau: Complex, terms: number) {
  const a = traceLine((u) => new Complex(v + (-0.5 + u) * tau.re, (-0.5 + u) * tau.im), 600, proj, ell, tau, terms)
  const b = traceLine((u) => new Complex(-0.5 + u + v * tau.re, v * tau.im), 600, proj, ell, tau, terms)
  return [...a, ...b]
}

/**
 * A hierarchical lattice grid: `radii.length` nested levels, level k using
 * base·factorᵏ divisions and tube radius radii[k]. A level only draws the
 * lines the coarser levels didn't (i mod factor ≠ 0), so thick lines carry the
 * coarse parallelogram and progressively thinner ones fill it in. Because z =
 * a·1 + b·τ the cells are the true fundamental-domain parallelogram; lines
 * through the pole are clipped like the real locus.
 */
export function buildHierGrid(
  tau: Complex,
  proj: Projection,
  ell: Ellipsoid,
  base: number,
  factor: number,
  radii: number[],
): GridRun[] {
  const terms = termsFor(tau)
  const runs: GridRun[] = []
  for (let k = 0; k < radii.length; k++) {
    const div = base * factor ** k
    const radius = radii[k]!
    for (let i = 0; i < div; i++) {
      if (k > 0 && i % factor === 0) continue // already drawn at a coarser level
      const v = i / div >= 0.5 ? i / div - 1 : i / div
      for (const run of gridLinesAt(v, proj, ell, tau, terms)) {
        runs.push({ points: run.points, closed: run.closed, radius })
      }
    }
  }
  return runs
}

/**
 * Vertices of the coarse (base) grid that lie inside the cutoff — the corners
 * of the fundamental-parallelogram cells (base = 2 gives the 2-torsion points).
 * The lattice point (pole) is skipped.
 */
export function buildGridCorners(tau: Complex, proj: Projection, ell: Ellipsoid, divisions: number): Vec3[] {
  const terms = termsFor(tau)
  const vals = gridVals(divisions)
  const pts: Vec3[] = []
  for (const a0 of vals) {
    for (const b0 of vals) {
      if (a0 === 0 && b0 === 0) continue // the pole
      const P = proj(weierstrassP(new Complex(a0 + b0 * tau.re, b0 * tau.im), tau, terms))
      if (fEll(P, ell) <= 1) pts.push(P)
    }
  }
  return pts
}

function traceLine(
  zOf: (u: number) => Complex,
  M: number,
  proj: Projection,
  ell: Ellipsoid,
  tau: Complex,
  terms: number,
): Run[] {
  const P: Vec3[] = new Array(M)
  const inside: boolean[] = new Array(M)
  for (let k = 0; k < M; k++) {
    const p = proj(weierstrassP(zOf(k / M), tau, terms))
    P[k] = p
    inside[k] = fEll(p, ell) <= 1
  }
  if (inside.every((b) => b)) return [{ points: P, closed: true }]

  const off = inside.indexOf(false) // rotate so scanning starts outside
  const at = (m: number) => ((m % M) + M) % M
  const runs: Run[] = []
  let run: Vec3[] | null = null
  for (let m = 0; m <= M; m++) {
    const kPrev = at(m - 1 + off)
    const k = at(m + off)
    const isIn = m < M ? inside[k]! : false
    const wasIn = inside[kPrev]!
    if (isIn && !wasIn) {
      // entering: start run with the boundary crossing
      run = [crossing(zOf(k / M), zOf(kPrev / M), proj, ell, tau, terms)]
    }
    if (isIn && run) run.push(P[k]!)
    if (!isIn && wasIn && run) {
      // leaving: cap with the boundary crossing and close out
      run.push(crossing(zOf(kPrev / M), zOf(k / M), proj, ell, tau, terms))
      runs.push({ points: run, closed: false })
      run = null
    }
  }
  return runs
}
