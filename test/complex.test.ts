import { describe, expect, it } from 'vitest'

import { Complex } from '@/math/core'

const TOL = 1e-12

describe('Complex arithmetic', () => {
  const z = new Complex(3, -4)
  const w = new Complex(-1, 2)

  it('adds and subtracts componentwise', () => {
    expect(z.add(w).equals(new Complex(2, -2))).toBe(true)
    expect(z.sub(w).equals(new Complex(4, -6))).toBe(true)
    expect(z.sub(z).equals(Complex.ZERO)).toBe(true)
  })

  it('multiplies: (3−4i)(−1+2i) = 5 + 10i, and i² = −1', () => {
    expect(z.mul(w).equals(new Complex(5, 10))).toBe(true)
    expect(Complex.I.mul(Complex.I).equals(new Complex(-1, 0))).toBe(true)
  })

  it('division inverts multiplication', () => {
    expect(z.mul(w).div(w).equals(z, TOL)).toBe(true)
    expect(z.div(z).equals(Complex.ONE, TOL)).toBe(true)
  })

  it('z·conj(z) = |z|², and |3−4i| = 5', () => {
    expect(z.mul(z.conj()).equals(new Complex(z.abs2(), 0), TOL)).toBe(true)
    expect(z.abs()).toBeCloseTo(5, 12)
    expect(z.abs2()).toBe(25)
  })

  it('neg and scale', () => {
    expect(z.neg().add(z).equals(Complex.ZERO)).toBe(true)
    expect(z.scale(2).equals(new Complex(6, -8))).toBe(true)
  })

  it('distributes: z(w + u) = zw + zu over a grid', () => {
    const vals = [-2, -0.5, 0, 1, 3]
    for (const a of vals)
      for (const b of vals) {
        const u = new Complex(a, b)
        expect(z.mul(w.add(u)).equals(z.mul(w).add(z.mul(u)), TOL)).toBe(true)
      }
  })
})

describe('Complex polar form', () => {
  it('fromPolar round-trips through abs/arg', () => {
    for (const r of [0.1, 1, 7.5])
      for (const t of [-3, -1, 0, 0.5, 2, 3.1]) {
        const z = Complex.fromPolar(r, t)
        expect(z.abs()).toBeCloseTo(r, 12)
        expect(z.arg()).toBeCloseTo(t, 12)
      }
  })

  it('arg lands in (−π, π] on the axes', () => {
    expect(new Complex(1, 0).arg()).toBe(0)
    expect(new Complex(0, 1).arg()).toBeCloseTo(Math.PI / 2, 15)
    expect(new Complex(-1, 0).arg()).toBeCloseTo(Math.PI, 15)
    expect(new Complex(0, -1).arg()).toBeCloseTo(-Math.PI / 2, 15)
  })

  it('multiplication adds arguments and multiplies moduli', () => {
    const a = Complex.fromPolar(2, 0.3)
    const b = Complex.fromPolar(0.5, 1.1)
    const p = a.mul(b)
    expect(p.abs()).toBeCloseTo(1, 12)
    expect(p.arg()).toBeCloseTo(1.4, 12)
  })
})

describe('Complex division near small |z|', () => {
  it('divides accurately by small denominators', () => {
    const tiny = new Complex(1e-150, -1e-150)
    const z = new Complex(2, 3)
    const q = z.div(tiny)
    expect(q.mul(tiny).equals(z, 1e-9)).toBe(true)
  })

  it('division by zero yields non-finite components rather than throwing', () => {
    const q = Complex.ONE.div(Complex.ZERO)
    expect(Number.isFinite(q.re)).toBe(false)
  })
})
