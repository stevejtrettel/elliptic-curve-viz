import { describe, expect, it } from 'vitest'

import { Quaternion, Vec4, cross4 } from '@/math/core'
import { HopfTorus, LatitudeCircle, S3Projection, WavyCircle } from '@/math/hopf'

const H = 1e-5

const TORI = [
  ['latitude', new HopfTorus(new LatitudeCircle(Math.acos(1 / 3)))],
  ['wavy', new HopfTorus(new WavyCircle({ phi0: 1.2, b: 0.35, n: 5, skew: 0.01 }))],
] as const

const SAMPLES: [number, number][] = [
  [0.13, 0.27],
  [0.55, 0.62],
  [0.91, 0.08],
]

describe('cross4', () => {
  it('is orthogonal to all three inputs and matches the e-basis case', () => {
    const a = new Vec4(1, 0, 0, 0)
    const b = new Vec4(0, 1, 0, 0)
    const c = new Vec4(0, 0, 1, 0)
    expect(cross4(a, b, c).equals(new Vec4(0, 0, 0, -1), 1e-15)).toBe(true)
    const u = new Vec4(0.3, -1, 2, 0.5)
    const v = new Vec4(1, 1, 0, -2)
    const w = new Vec4(-0.7, 0.2, 1.1, 0.9)
    const n = cross4(u, v, w)
    expect(Math.abs(n.dot(u))).toBeLessThan(1e-12)
    expect(Math.abs(n.dot(v))).toBeLessThan(1e-12)
    expect(Math.abs(n.dot(w))).toBeLessThan(1e-12)
  })
})

describe('HopfTorus.surfaceFrame', () => {
  it.each(TORI)('%s: normal is unit, ⊥ point, ⊥ finite-difference tangents', (_name, torus) => {
    for (const [u, x] of SAMPLES) {
      const { point, normal } = torus.surfaceFrame(u, x)
      expect(point.norm()).toBeCloseTo(1, 12)
      expect(normal.norm()).toBeCloseTo(1, 12)
      expect(Math.abs(normal.dot(point))).toBeLessThan(1e-12)
      const du = torus.surface(u + H, x).sub(torus.surface(u - H, x)).scale(1 / (2 * H))
      const dx = torus.surface(u, x + H).sub(torus.surface(u, x - H)).scale(1 / (2 * H))
      expect(Math.abs(normal.dot(du)) / du.norm()).toBeLessThan(1e-6)
      expect(Math.abs(normal.dot(dx)) / dx.norm()).toBeLessThan(1e-6)
      // and the frame's point agrees with surface() (which lerps f from the
      // table — agreement is at table accuracy, the frame itself is exact)
      expect(point.equals(torus.surface(u, x), 1e-4)).toBe(true)
    }
  })
})

describe('S3Projection.projectTangent', () => {
  const proj = new S3Projection()
  proj.rotation = [new Quaternion(1, 0.4, -0.2, 0.3).normalize(), new Quaternion(0.8, 0, 0.5, -0.1).normalize()]

  it('matches finite differences of project along tangent directions', () => {
    const torus = TORI[1][1]
    for (const [u, x] of SAMPLES) {
      const { point } = torus.surfaceFrame(u, x)
      // a tangent: the fiber direction via finite difference of surface in u (normalized to S³)
      const t = torus.surface(u + H, x).sub(torus.surface(u - H, x)).scale(1 / (2 * H))
      const analytic = proj.projectTangent(point, t)
      const fd = proj
        .project(point.add(t.scale(H)).normalize())
        .sub(proj.project(point.sub(t.scale(H)).normalize()))
        .scale(1 / (2 * H))
      expect(analytic.sub(fd).norm() / fd.norm()).toBeLessThan(1e-4)
    }
  })

  it('projected normal is ⊥ projected surface tangents (conformality)', () => {
    const torus = TORI[0][1]
    for (const [u, x] of SAMPLES) {
      const { point, normal } = torus.surfaceFrame(u, x)
      const nR3 = proj.projectTangent(point, normal).normalize()
      for (const t of [
        torus.surface(u + H, x).sub(torus.surface(u - H, x)),
        torus.surface(u, x + H).sub(torus.surface(u, x - H)),
      ]) {
        const tR3 = proj.projectTangent(point, t.scale(1 / (2 * H)))
        expect(Math.abs(nR3.dot(tR3)) / tR3.norm()).toBeLessThan(1e-5)
      }
    }
  })
})
