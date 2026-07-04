import { describe, expect, it } from 'vitest'

import { Quaternion, Vec3, Vec4 } from '@/math/core'
import { HopfTorus, LatitudeCircle, S3Projection } from '@/math/hopf'

function cross(a: Vec3, b: Vec3): Vec3 {
  return new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

/** Circumcenter of three points in ℝ³: c = p1 + [(|a|²b − |b|²a) × (a × b)] / (2|a×b|²). */
function circumcenter(p1: Vec3, p2: Vec3, p3: Vec3): Vec3 {
  const a = p2.sub(p1)
  const b = p3.sub(p1)
  const axb = cross(a, b)
  const term = cross(b.scale(a.norm2()).sub(a.scale(b.norm2())), axb).scale(1 / (2 * axb.norm2()))
  return p1.add(term)
}

describe('S3Projection defaults (the paper’s σ)', () => {
  const proj = new S3Projection()

  it('σ(x, y, z, w) = (x, y, z)/(1 − w)', () => {
    expect(proj.project(new Vec4(1, 0, 0, 0)).equals(new Vec3(1, 0, 0), 1e-14)).toBe(true)
    expect(proj.project(new Vec4(0, 0, 0, -1)).equals(new Vec3(0, 0, 0), 1e-14)).toBe(true)
    const p = new Vec4(0.5, 0.5, 0.5, 0.5)
    expect(proj.project(p).equals(new Vec3(1, 1, 1), 1e-12)).toBe(true)
  })

  it('scaleFactor = 1 + |σ(x)|² = 2/(1 − w)', () => {
    for (const x of [new Vec4(1, 0, 0, 0), new Vec4(0.5, 0.5, 0.5, 0.5), new Vec4(0, 0.6, 0, 0.8)]) {
      const s = proj.scaleFactor(x)
      expect(s).toBeCloseTo(1 + proj.project(x).norm2(), 9)
      expect(s).toBeCloseTo(2 / (1 - x.w), 12)
    }
  })

  it('clamps at the pole instead of dividing by zero', () => {
    const out = proj.project(new Vec4(0, 0, 0, 1))
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true)
  })

  it('is conformal: orthonormal tangent pairs stay orthogonal and isotropic', () => {
    const x = new Vec4(0.5, 0.5, 0.5, 0.5)
    const u1 = new Vec4(0.5, -0.5, 0.5, -0.5) // ⊥ x
    const u2 = new Vec4(0.5, 0.5, -0.5, -0.5) // ⊥ x, ⊥ u1
    const h = 1e-6
    const d = (u: Vec4) =>
      proj.project(x.add(u.scale(h)).normalize()).sub(proj.project(x.sub(u.scale(h)).normalize())).scale(1 / (2 * h))
    const d1 = d(u1)
    const d2 = d(u2)
    expect(d1.norm()).toBeCloseTo(d2.norm(), 6)
    expect(Math.abs(d1.dot(d2)) / d1.norm2()).toBeLessThan(1e-6)
    // |dσ| = scaleFactor/2 along tangent directions
    expect(d1.norm()).toBeCloseTo(proj.scaleFactor(x) / 2, 6)
  })
})

describe('S3Projection rotation and pole knobs', () => {
  it('rotation keeps S³ and equals projecting the rotated point', () => {
    const proj = new S3Projection()
    const p = new Quaternion(1, 2, -1, 0.5).normalize()
    const q = new Quaternion(-0.3, 0.4, 2, 1).normalize()
    proj.rotation = [p, q]
    const x = new Vec4(0.1, 0.7, -0.3, 0.63).normalize()
    const rotated = p.mul(Quaternion.fromVec4(x)).mul(q.conj()).toVec4()
    const reference = new S3Projection()
    expect(proj.project(x).equals(reference.project(rotated), 1e-12)).toBe(true)
  })

  it('setting the pole to −e_w flips the projection through the z–w plane rotation', () => {
    const proj = new S3Projection()
    proj.pole = new Vec4(0, 0, 0, -1)
    // now the OLD north pole projects to the origin, and points near −e_w blow up
    expect(proj.project(new Vec4(0, 0, 0, 1)).norm()).toBeCloseTo(0, 12)
    expect(proj.project(new Vec4(1e-7, 0, 0, -1).normalize()).norm()).toBeGreaterThan(1e4)
  })

  it('a generic pole sends nearby points far away and its antipode to the origin', () => {
    const proj = new S3Projection()
    const pole = new Vec4(0.5, 0.5, 0.5, 0.5)
    proj.pole = pole
    expect(proj.project(pole.add(new Vec4(1e-7, -1e-7, 0, 0)).normalize()).norm()).toBeGreaterThan(1e4)
    expect(proj.project(pole.scale(-1)).norm()).toBeCloseTo(0, 10)
    // points orthogonal to the pole land on the unit sphere
    const eq = new Vec4(0.5, -0.5, 0.5, -0.5)
    expect(proj.project(eq).norm()).toBeCloseTo(1, 10)
  })

  it('σ maps Hopf fibers to exact circles in ℝ³ (free end-to-end test)', () => {
    const torus = new HopfTorus(new LatitudeCircle(Math.acos(1 / 3)))
    const proj = new S3Projection()
    proj.rotation = [new Quaternion(1, 0.3, -0.2, 0.5).normalize(), new Quaternion(0.7, 0, 1, -0.1).normalize()]
    const fiber = torus.fiberAt(0.42)
    const pts = [0, 1, 2, 3, 4, 5].map((i) => proj.project(fiber((i * 2 * Math.PI) / 6)))
    const c = circumcenter(pts[0]!, pts[1]!, pts[2]!)
    const r = pts[0]!.sub(c).norm()
    for (const p of pts) {
      expect(p.sub(c).norm()).toBeCloseTo(r, 8)
    }
  })
})
