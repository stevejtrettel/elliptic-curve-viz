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
export function fiberCurves(hopf: HopfTorus, count: number, samples = 96): TubeCurve[] {
  return Array.from({ length: count }, (_, f) => {
    const fiber = hopf.fiberAt(f / count)
    return {
      points: Array.from({ length: samples }, (_, i) => fiber((TWO_PI * i) / samples)),
      closed: true,
    }
  })
}

/** `count` gridlines along the lattice edge ω₂ = A/2 + iL/2 (closed on the torus). */
export function edgeCurves(hopf: HopfTorus, count: number, samples = 192): TubeCurve[] {
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
  segmentSamples = 24,
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

/** Translate z by Λ so it is as close to `near` as possible. */
function nearestTranslate(z: Complex, near: Complex, [w1, w2]: [Complex, Complex]): Complex {
  // lattice coordinates of the difference, rounded
  const d = z.sub(near)
  const det = w1.re * w2.im - w1.im * w2.re
  const a = (d.re * w2.im - d.im * w2.re) / det
  const b = (w1.re * d.im - w1.im * d.re) / det
  return z.sub(w1.scale(Math.round(a))).sub(w2.scale(Math.round(b)))
}
