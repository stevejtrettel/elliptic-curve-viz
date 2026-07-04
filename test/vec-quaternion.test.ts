import { describe, expect, it } from 'vitest'

import { Quaternion, Vec3, Vec4, rotateS3 } from '@/math/core'

const TOL = 1e-12

describe('Vec3 / Vec4', () => {
  it('linear operations and dot products', () => {
    const a = new Vec3(1, -2, 3)
    const b = new Vec3(0.5, 4, -1)
    expect(a.add(b).sub(b).equals(a, TOL)).toBe(true)
    expect(a.dot(b)).toBeCloseTo(0.5 - 8 - 3, 14)
    expect(a.scale(2).norm()).toBeCloseTo(2 * a.norm(), 12)
    expect(new Vec3(3, 4, 0).norm()).toBe(5)
    expect(a.normalize().norm()).toBeCloseTo(1, 14)
  })

  it('Vec4 behaves identically in 4D', () => {
    const a = new Vec4(1, -2, 3, 0.5)
    const b = new Vec4(2, 1, 0, -4)
    expect(a.add(b).sub(b).equals(a, TOL)).toBe(true)
    expect(a.dot(b)).toBeCloseTo(2 - 2 + 0 - 2, 14)
    expect(a.normalize().norm()).toBeCloseTo(1, 14)
  })
})

describe('Quaternion', () => {
  const p = new Quaternion(1, 2, -1, 0.5).normalize()
  const q = new Quaternion(-0.3, 0.4, 2, 1).normalize()

  it('i·j = k, j·i = −k (non-commutative)', () => {
    const I = new Quaternion(0, 1, 0, 0)
    const J = new Quaternion(0, 0, 1, 0)
    const K = new Quaternion(0, 0, 0, 1)
    expect(I.mul(J).equals(K)).toBe(true)
    expect(J.mul(I).equals(K.scale(-1))).toBe(true)
    expect(I.mul(I).equals(Quaternion.ONE.scale(-1))).toBe(true)
  })

  it('|pq| = |p||q| and q·q̄ = |q|²', () => {
    const a = new Quaternion(1, 2, 3, 4)
    const b = new Quaternion(-2, 0.5, 1, -1)
    expect(a.mul(b).norm()).toBeCloseTo(a.norm() * b.norm(), 12)
    expect(a.mul(a.conj()).equals(Quaternion.ONE.scale(a.norm2()), 1e-12)).toBe(true)
  })

  it('associativity and conj anti-homomorphism', () => {
    const a = new Quaternion(1, 2, 3, 4)
    const b = new Quaternion(-2, 0.5, 1, -1)
    const c = new Quaternion(0, 1, -1, 2)
    expect(a.mul(b).mul(c).equals(a.mul(b.mul(c)), 1e-10)).toBe(true)
    expect(a.mul(b).conj().equals(b.conj().mul(a.conj()), 1e-12)).toBe(true)
  })

  it('fromAxisAngle produces unit quaternions; angle 0 is identity', () => {
    const r = Quaternion.fromAxisAngle({ i: 1, j: 1, k: 0 }, 1.2)
    expect(r.norm()).toBeCloseTo(1, 14)
    expect(Quaternion.fromAxisAngle({ i: 0, j: 0, k: 1 }, 0).equals(Quaternion.ONE, TOL)).toBe(true)
    expect(() => Quaternion.fromAxisAngle({ i: 0, j: 0, k: 0 }, 1)).toThrow(RangeError)
  })

  it('rotateS3 preserves norms (lands on S³) and composes', () => {
    const xs = [new Vec4(1, 0, 0, 0), new Vec4(0.5, -0.5, 0.5, 0.5), new Vec4(0, 0, 0, 1)]
    for (const x of xs) {
      const y = rotateS3(p, q, x)
      expect(y.norm()).toBeCloseTo(x.norm(), 12)
    }
    // composition: (p1,q1) then (p2,q2) = (p2·p1, q2·q1)
    const p2 = new Quaternion(0, 1, 1, 0).normalize()
    const q2 = new Quaternion(2, 0, -1, 1).normalize()
    for (const x of xs) {
      const twice = rotateS3(p2, q2, rotateS3(p, q, x))
      const composed = rotateS3(p2.mul(p), q2.mul(q), x)
      expect(twice.equals(composed, 1e-12)).toBe(true)
    }
  })

  it('identity pair fixes everything; (p, p) fixes the real axis (1,0,0,0)', () => {
    const x = new Vec4(0.1, 0.2, 0.3, 0.9)
    expect(rotateS3(Quaternion.ONE, Quaternion.ONE, x).equals(x, TOL)).toBe(true)
    const e0 = new Vec4(1, 0, 0, 0)
    expect(rotateS3(p, p, e0).equals(e0, 1e-12)).toBe(true)
  })
})
