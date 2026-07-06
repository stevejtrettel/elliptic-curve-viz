import { describe, expect, it } from 'vitest'

import {
  CURVES,
  buildTorusScene,
  cayleyCurves,
  cayleyFlatSegments,
  edgeCurves,
  fiberCurves,
  orbitCurve,
} from '@/author'
import type { Complex } from '@/math/core'
import { tauOf } from '@/math/arithmetic'
import { solveProfileCurve } from '@/math/families'

const DISC8 = CURVES[0]!.data
const scene = buildTorusScene(DISC8, 2, solveProfileCurve(tauOf(DISC8.form))[0]!)

function expectUnitSamples(points: { x: number; y: number; z: number; w: number }[]) {
  for (const q of points) expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 10)
}

describe('fiberCurves', () => {
  const fibers = fiberCurves(scene.hopf, 5)

  it('returns `count` closed curves of unit-norm samples', () => {
    expect(fibers.length).toBe(5)
    for (const f of fibers) {
      expect(f.closed).toBe(true)
      expectUnitSamples(f.points)
    }
  })
})

describe('edgeCurves', () => {
  const edges = edgeCurves(scene.hopf, 4)

  it('returns `count` closed curves on S³', () => {
    expect(edges.length).toBe(4)
    for (const e of edges) {
      expect(e.closed).toBe(true)
      expectUnitSamples(e.points)
    }
  })

  it('is continuous at the closing seam (last sample near the first)', () => {
    for (const e of edges) {
      const a = e.points[0]!
      const b = e.points[e.points.length - 1]!
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)
      const step = 4 / e.points.length // generous bound: curve length ≤ ~4 in S³
      expect(gap).toBeLessThan(5 * step)
    }
  })
})

describe('cayleyCurves', () => {
  const E = scene.E
  const g = E.generators[E.generators.length - 1]! // the order-n₂ generator
  const m = E.order(g)
  const curves = cayleyCurves(E, g, scene.lambda, scene.hopf, scene.flip, 8)

  it('one closed geodesic per coset of ⟨g⟩, order(g)·samplesPerEdge samples each', () => {
    expect(curves.length).toBe(E.size / m)
    for (const c of curves) {
      expect(c.closed).toBe(true)
      expect(c.points.length).toBe(m * 8)
      expectUnitSamples(c.points)
    }
  })

  it('the geodesics pass exactly through the rolled-up points of E', () => {
    // edge-boundary samples (every samplesPerEdge-th) are the coset points
    const nodes = curves.flatMap((c) => c.points.filter((_, i) => i % 8 === 0))
    expect(nodes.length).toBe(E.size)
    for (const p of scene.positions) {
      const hit = nodes.some((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z, q.w - p.w) < 1e-6)
      expect(hit).toBe(true)
    }
  })

  it('steps are short: the direction is the shortest lattice representative', () => {
    for (const c of curves) {
      for (let i = 1; i < c.points.length; i++) {
        const a = c.points[i - 1]!
        const b = c.points[i]!
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)).toBeLessThan(0.75)
      }
    }
  })

  it('the identity (trivial subgroup) yields no edges', () => {
    expect(cayleyCurves(E, E.identity, scene.lambda, scene.hopf, scene.flip)).toEqual([])
  })
})

describe('cayleyFlatSegments', () => {
  const E = scene.E
  const g = E.generators[E.generators.length - 1]!
  const m = E.order(g)
  const lattice = scene.hopf.lattice
  const segments = cayleyFlatSegments(E, g, scene.flat, lattice)

  /** Lattice coordinates (a, b) of z: z = a·ω₁ + b·ω₂. */
  const coords = (z: Complex): [number, number] => {
    const [w1, w2] = lattice
    const det = w1.re * w2.im - w1.im * w2.re
    return [(z.re * w2.im - z.im * w2.re) / det, (w1.re * z.im - w1.im * z.re) / det]
  }

  it('every segment endpoint lies in the closed fundamental parallelogram', () => {
    for (const [p, q] of segments) {
      for (const [a, b] of [coords(p), coords(q)]) {
        expect(a).toBeGreaterThanOrEqual(-1e-6)
        expect(a).toBeLessThanOrEqual(1 + 1e-6)
        expect(b).toBeGreaterThanOrEqual(-1e-6)
        expect(b).toBeLessThanOrEqual(1 + 1e-6)
      }
    }
  })

  it('total length = |E| edges of length |δ₀| (the chords tile the geodesics)', () => {
    const [w1, w2] = lattice
    // δ₀ = shortest lattice representative of the flat coordinate of g
    const i = E.points().findIndex((P) => P.x === g.x && P.y === g.y)
    let delta = scene.flat[i]!
    const [da, db] = coords(delta)
    delta = delta.sub(w1.scale(Math.round(da))).sub(w2.scale(Math.round(db)))
    const total = segments.reduce((s, [p, q]) => s + q.sub(p).abs(), 0)
    expect(total).toBeCloseTo(E.size * delta.abs(), 6)
  })

  it('all chords are parallel to δ₀ (one straight line per coset, wrapped)', () => {
    const [p0, q0] = segments[0]!
    const d0 = q0.sub(p0)
    for (const [p, q] of segments) {
      const d = q.sub(p)
      expect(Math.abs(d.re * d0.im - d.im * d0.re)).toBeLessThan(1e-9 * (1 + d.abs() * d0.abs()))
    }
  })

  it('the chords thread the beads: every flat point lies on a chord MOD Λ', () => {
    // mod Λ: a bead sitting exactly on a wall/corner is drawn at one
    // representative while its chord stubs attach at an equivalent one
    // (e.g. the identity at (0,0) vs seam pieces ending at (1,0)/(0,1)) —
    // correct on the torus, a representative choice in the flat picture
    const [w1, w2] = lattice
    for (const z of scene.flat) {
      let best = Infinity
      for (const [p, q] of segments) {
        const d = q.sub(p)
        const len2 = d.re * d.re + d.im * d.im
        for (let na = -1; na <= 1; na++) {
          for (let nb = -1; nb <= 1; nb++) {
            const zt = z.add(w1.scale(na)).add(w2.scale(nb))
            const t = Math.max(0, Math.min(1, ((zt.re - p.re) * d.re + (zt.im - p.im) * d.im) / len2))
            best = Math.min(best, Math.hypot(zt.re - p.re - t * d.re, zt.im - p.im - t * d.im))
          }
        }
      }
      expect(best).toBeLessThan(1e-6)
    }
  })

  it('coset count × order(g) accounting: at least one chord per coset', () => {
    expect(segments.length).toBeGreaterThanOrEqual(E.size / m)
  })

  it('the identity generator yields no chords', () => {
    expect(cayleyFlatSegments(E, E.identity, scene.flat, lattice)).toEqual([])
  })
})

describe('orbitCurve', () => {
  it('samples degree(P) segments and closes', () => {
    const E = scene.E
    const P = E.points().find((Q) => E.degree(Q) > 1)!
    const curve = orbitCurve(E, P, scene.lambda, scene.hopf, scene.flip, 24)
    expect(curve.closed).toBe(true)
    expect(curve.points.length).toBe(E.degree(P) * 24)
    expectUnitSamples(curve.points)
  })

  it('keeps chords short (nearest lattice translate, no wrap-around jumps)', () => {
    const E = scene.E
    const P = E.points().find((Q) => E.degree(Q) > 1)!
    const curve = orbitCurve(E, P, scene.lambda, scene.hopf, scene.flip, 24)
    for (let i = 1; i < curve.points.length; i++) {
      const a = curve.points[i - 1]!
      const b = curve.points[i]!
      const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)
      expect(gap).toBeLessThan(0.75) // half the lattice diameter after roll-up, generously
    }
  })
})
