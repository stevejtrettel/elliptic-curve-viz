import { describe, expect, it } from 'vitest'

import { Complex, Vec4 } from '@/math/core'
import { DiscreteCurve, HopfTorus, LatitudeCircle, WavyCircle } from '@/math/hopf'

const TWO_PI = 2 * Math.PI

// the legacy hex curve is outside the WavyCircle monotone-θ bound; build it raw
const legacyHex = new DiscreteCurve(
  Array.from({ length: 512 }, (_, j) => {
    const t = (TWO_PI * j) / 512
    return { theta: t + 0.276 * Math.sin(6 * t), phi: Math.PI / 2 + 0.5244 * Math.cos(3 * t) }
  }),
)

const TORI = [
  ['latitude φ₀ = acos(1/3) (disc −8 geometry)', new HopfTorus(new LatitudeCircle(Math.acos(1 / 3)))],
  ['legacy hex (DiscreteCurve)', new HopfTorus(legacyHex)],
  ['generic wavy', new HopfTorus(new WavyCircle({ phi0: 1.2, b: 0.35, n: 5, skew: 0.01 }))],
] as const

/** deterministic test points spread over (and beyond) the fundamental domain */
function testPoints(torus: HopfTorus): Complex[] {
  const [w1, w2] = torus.lattice
  const pts: Complex[] = []
  for (const [f1, f2] of [
    [0.1, 0.2],
    [0.7, 0.45],
    [0.33, 0.9],
    [0.99, 0.05],
  ] as const) {
    pts.push(w1.scale(f1).add(w2.scale(f2)))
  }
  return pts
}

describe('HopfTorus.rollUp', () => {
  it.each(TORI)('%s: lands on S³ in both tiers', (_name, torus) => {
    for (const z of testPoints(torus)) {
      expect(torus.rollUp(z).norm()).toBeCloseTo(1, 12)
      expect(torus.rollUp(z, { exact: true }).norm()).toBeCloseTo(1, 12)
    }
  })

  it.each(TORI)('%s: is Λ-periodic in both directions, far outside the domain too', (_name, torus) => {
    const [w1, w2] = torus.lattice
    for (const z of testPoints(torus)) {
      const base = torus.rollUp(z, { exact: true })
      const shifts = [
        z.add(w1),
        z.add(w2),
        z.sub(w1.scale(3)),
        z.sub(w2.scale(2)),
        z.add(w1.scale(5)).add(w2.scale(7)),
        z.sub(w1).sub(w2),
      ]
      for (const zs of shifts) {
        expect(torus.rollUp(zs, { exact: true }).equals(base, 1e-10)).toBe(true)
      }
    }
  })

  it.each(TORI)('%s: exact and table tiers agree to table accuracy', (_name, torus) => {
    for (const z of testPoints(torus)) {
      expect(torus.rollUp(z).equals(torus.rollUp(z, { exact: true }), 1e-4)).toBe(true)
    }
  })

  it.each(TORI)('%s: THE ISOMETRY TEST — metric pullback is ds² + dt²', (_name, torus) => {
    const h = 1e-5
    for (const z of testPoints(torus)) {
      const dds = torus
        .rollUp(z.add(new Complex(h, 0)), { exact: true })
        .sub(torus.rollUp(z.sub(new Complex(h, 0)), { exact: true }))
        .scale(1 / (2 * h))
      const ddt = torus
        .rollUp(z.add(new Complex(0, h)), { exact: true })
        .sub(torus.rollUp(z.sub(new Complex(0, h)), { exact: true }))
        .scale(1 / (2 * h))
      expect(dds.norm(), `|∂/∂s| at ${z.re},${z.im}`).toBeCloseTo(1, 6)
      expect(ddt.norm(), `|∂/∂t| at ${z.re},${z.im}`).toBeCloseTo(1, 6)
      expect(Math.abs(dds.dot(ddt)), `⟨∂s,∂t⟩ at ${z.re},${z.im}`).toBeLessThan(1e-6)
    }
  })
})

describe('HopfTorus surface and fibers', () => {
  it.each(TORI)('%s: surface(u, x) sits on S³ and on the rolled-up torus', (_name, torus) => {
    for (const [u, x] of [
      [0.15, 0.3],
      [0.8, 0.72],
      [0.5, 0],
    ] as const) {
      const p = torus.surface(u, x)
      expect(p.norm()).toBeCloseTo(1, 12)
      // same point via rollUp: s = 2πu, 2t = L(2πx)
      const z = new Complex(TWO_PI * u, torus.arcLength(TWO_PI * x) / 2)
      expect(p.equals(torus.rollUp(z, { exact: true }), 1e-4)).toBe(true)
    }
  })

  it.each(TORI)('%s: fibers are great circles', (_name, torus) => {
    const fiber = torus.fiberAt(0.37)
    const p0 = fiber(0)
    for (const s of [0.5, 1.5, 3, 5]) {
      const p = fiber(s)
      expect(p.norm()).toBeCloseTo(1, 12)
      // great circle: ⟨H(s), H(s')⟩ = cos(s − s')
      expect(p.dot(p0)).toBeCloseTo(Math.cos(s), 10)
    }
  })

  it('fiber direction is the s-coordinate: rollUp along Re z traces the fiber', () => {
    const torus = TORI[0][1]
    const z0 = new Complex(0.3, 0.9)
    const a = torus.rollUp(z0, { exact: true })
    const b = torus.rollUp(z0.add(new Complex(1.2, 0)), { exact: true })
    expect(a.dot(b)).toBeCloseTo(Math.cos(1.2), 10)
  })
})

describe('numerical guards', () => {
  it('rejects curves that leave the φ chart', () => {
    // DiscreteCurve-style raw samples with φ ≤ 0 must be caught at HopfTorus build
    const bad = {
      sample: (n: number) =>
        Array.from({ length: n }, (_, j) => ({ theta: (TWO_PI * j) / n, phi: 0.4 + 0.5 * Math.cos((TWO_PI * j) / n) })),
    }
    expect(() => new HopfTorus(bad)).toThrow(/chart/)
  })

  it('arcLength and holonomy are exact at the period: L(2π) = length, 2·f(2π) = area', () => {
    const torus = new HopfTorus(new WavyCircle({ phi0: 1.2, b: 0.35, n: 5 }), { samples: 256 })
    expect(torus.arcLength(TWO_PI)).toBeCloseTo(torus.length, 12)
    expect(2 * torus.holonomy(TWO_PI)).toBeCloseTo(torus.area, 12)
  })

  it('rollUp output is a Vec4', () => {
    const torus = TORI[0][1]
    expect(torus.rollUp(new Complex(0, 0))).toBeInstanceOf(Vec4)
  })
})
