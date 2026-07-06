/**
 * Curve generators for TubeSet: Hopf fibers, lattice-edge gridlines, and
 * Frobenius-orbit polylines — all as S³ centerline samples.
 */
import type { CurvePoints, TorusPoint } from '@/math/arithmetic'
import { Complex, type Vec4 } from '@/math/core'
import type { HopfTorus } from '@/math/hopf'

import type { TubeCurve } from '@/geometry'

const TWO_PI = 2 * Math.PI

/** `count` Hopf fibers over uniform curve parameters — exact circles under σ. */
export function fiberCurves(hopf: HopfTorus, count: number, samples = 192): TubeCurve[] {
  return Array.from({ length: count }, (_, f) => {
    const fiber = hopf.fiberAt(f / count)
    return {
      points: Array.from({ length: samples }, (_, i) => fiber((TWO_PI * i) / samples)),
      closed: true,
    }
  })
}

/** `count` gridlines along the lattice edge ω₂ = A/2 + iL/2 (closed on the torus). */
export function edgeCurves(hopf: HopfTorus, count: number, samples = 384): TubeCurve[] {
  const [w1, w2] = hopf.lattice
  return Array.from({ length: count }, (_, e) => {
    const z0 = w1.scale(e / count)
    return {
      points: Array.from({ length: samples }, (_, i) =>
        hopf.rollUp(z0.add(w2.scale(i / samples)), { exact: true }),
      ),
      closed: true,
    }
  })
}

/**
 * The Frobenius orbit of P as a closed polyline: straight segments in ℂ/Λ
 * between consecutive M-images (cyclic order preserved), rolled up.
 */
export function orbitCurve(
  E: CurvePoints,
  P: TorusPoint,
  lambda: Complex,
  hopf: HopfTorus,
  flip: boolean,
  segmentSamples = 48,
): TubeCurve {
  const orbit: TorusPoint[] = []
  let Q = P
  do {
    orbit.push(Q)
    Q = E.frobenius(Q)
  } while (Q.x !== P.x || Q.y !== P.y)
  const zs = orbit.map((R) => {
    let z = E.toComplex(R)
    if (flip) z = z.conj()
    return lambda.mul(z)
  })
  const points: Vec4[] = []
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i]!
    // straight to the NEAREST lattice translate of the next point (short chords)
    const b = nearestTranslate(zs[(i + 1) % zs.length]!, a, hopf.lattice)
    for (let s = 0; s < segmentSamples; s++) {
      points.push(hopf.rollUp(a.add(b.sub(a).scale(s / segmentSamples)), { exact: true }))
    }
  }
  return { points, closed: true }
}

/**
 * The Cayley graph of E for one generator g: an edge P → P+g at every point.
 *
 * On the torus this is not |E| separate sticks. Adding g is translation by
 * the CONSTANT δ = λ·toComplex(g), so the edge set decomposes into the
 * |E|/order(g) cosets of ⟨g⟩, and each coset P, P+g, P+2g, … is the straight
 * line through P in direction δ₀ (the shortest lattice representative of δ),
 * closing up after order(g) steps since order(g)·δ₀ ∈ Λ. Each coset is a
 * CLOSED GEODESIC of the flat torus through its order(g) points — one
 * TubeCurve per coset, rolled up.
 */
export function cayleyCurves(
  E: CurvePoints,
  g: TorusPoint,
  lambda: Complex,
  hopf: HopfTorus,
  flip: boolean,
  samplesPerEdge = 12,
): TubeCurve[] {
  const m = E.order(g)
  if (m === 1) return [] // ⟨g⟩ trivial — no edges
  const toHopf = (P: TorusPoint) => {
    let z = E.toComplex(P)
    if (flip) z = z.conj()
    return lambda.mul(z)
  }
  const delta = nearestTranslate(toHopf(g), new Complex(0, 0), hopf.lattice)
  const samples = m * samplesPerEdge
  return E.cosets(g).map((coset) => {
    const z0 = toHopf(coset[0]!)
    // z₀ + s·m·δ₀ for s ∈ [0, 1): passes through toHopf(coset[j]) at s = j/m
    return {
      points: Array.from({ length: samples }, (_, i) =>
        hopf.rollUp(z0.add(delta.scale((i * m) / samples)), { exact: true }),
      ),
      closed: true,
    }
  })
}

/**
 * The same Cayley geodesics as cayleyCurves, drawn in the FLAT picture: each
 * ⟨g⟩-coset is a straight line in ℂ/Λ, here clipped to the fundamental
 * parallelogram {a·ω₁ + b·ω₂ : a, b ∈ [0, 1)} — parallel chords, split
 * wherever the line crosses a wall. `flat` is the plaque's own coordinate
 * array (parallel to E.points()), so the chords agree with the drawn spheres
 * exactly, in either lattice mode of buildTorusScene.
 */
export function cayleyFlatSegments(
  E: CurvePoints,
  g: TorusPoint,
  flat: Complex[],
  lattice: [Complex, Complex],
): [Complex, Complex][] {
  const m = E.order(g)
  if (m === 1) return []
  const flatOf = new Map<string, Complex>()
  E.points().forEach((P, i) => flatOf.set(`${P.x},${P.y}`, flat[i]!))
  const delta = nearestTranslate(flatOf.get(`${g.x},${g.y}`)!, new Complex(0, 0), lattice)
  // lattice coordinates: z = a·ω₁ + b·ω₂
  const [w1, w2] = lattice
  const det = w1.re * w2.im - w1.im * w2.re
  const coordsOf = (z: Complex): [number, number] => [
    (z.re * w2.im - z.im * w2.re) / det,
    (w1.re * z.im - w1.im * z.re) / det,
  ]
  const at = (a: number, b: number) => w1.scale(a).add(w2.scale(b))
  const [da, db] = coordsOf(delta)
  const EPS = 1e-9
  const segments: [Complex, Complex][] = []
  for (const coset of E.cosets(g)) {
    // the whole geodesic: (a(t), b(t)) = (a₀, b₀) + t·m·(da, db), t ∈ [0, 1]
    const [a0, b0] = coordsOf(flatOf.get(`${coset[0]!.x},${coset[0]!.y}`)!)
    const ts = [0, 1]
    for (const [x0, dx] of [
      [a0, m * da],
      [b0, m * db],
    ] as [number, number][]) {
      if (dx === 0) continue
      // wall crossings: x₀ + t·dx ∈ ℤ with t strictly inside (0, 1)
      const [lo, hi] = dx > 0 ? [x0, x0 + dx] : [x0 + dx, x0]
      for (let n = Math.ceil(lo - EPS); n <= Math.floor(hi + EPS); n++) {
        const t = (n - x0) / dx
        if (t > EPS && t < 1 - EPS) ts.push(t)
      }
    }
    ts.sort((p, q) => p - q)
    for (let i = 1; i < ts.length; i++) {
      const [t0, t1] = [ts[i - 1]!, ts[i]!]
      if (t1 - t0 < EPS) continue
      // wrap the piece into the fundamental domain by its midpoint's cell
      const tm = (t0 + t1) / 2
      const na = Math.floor(a0 + tm * m * da)
      const nb = Math.floor(b0 + tm * m * db)
      segments.push([
        at(a0 + t0 * m * da - na, b0 + t0 * m * db - nb),
        at(a0 + t1 * m * da - na, b0 + t1 * m * db - nb),
      ])
    }
  }
  return segments
}

/** Translate z by Λ so it is as close to `near` as possible. */
function nearestTranslate(z: Complex, near: Complex, [w1, w2]: [Complex, Complex]): Complex {
  // lattice coordinates of the difference, rounded
  const d = z.sub(near)
  const det = w1.re * w2.im - w1.im * w2.re
  const a = (d.re * w2.im - d.im * w2.re) / det
  const b = (w1.re * d.im - w1.im * d.re) / det
  return z.sub(w1.scale(Math.round(a))).sub(w2.scale(Math.round(b)))
}
