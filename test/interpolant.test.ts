import { describe, expect, it } from 'vitest'

import { PeriodicInterpolant, invertMonotoneTable, lerpTable } from '@/math/hopf'

const TWO_PI = 2 * Math.PI

function samplesOf(f: (t: number) => number, n: number): Float64Array {
  return Float64Array.from({ length: n }, (_, j) => f((TWO_PI * j) / n))
}

describe('PeriodicInterpolant', () => {
  const f = (t: number) => 2 + Math.cos(t) + 0.5 * Math.sin(3 * t) - 0.25 * Math.cos(5 * t)
  const df = (t: number) => -Math.sin(t) + 1.5 * Math.cos(3 * t) + 1.25 * Math.sin(5 * t)
  const F = (t: number) => 2 * t + Math.sin(t) + (0.5 * (1 - Math.cos(3 * t))) / 3 - (0.25 * Math.sin(5 * t)) / 5

  it('reproduces a trig polynomial exactly (values, derivatives, antiderivative)', () => {
    const interp = new PeriodicInterpolant(samplesOf(f, 16))
    for (const t of [0, 0.1, 1.7, Math.PI, 4.9, 6.2]) {
      expect(interp.value(t)).toBeCloseTo(f(t), 12)
      expect(interp.derivative(t)).toBeCloseTo(df(t), 11)
      expect(interp.antiderivative(t)).toBeCloseTo(F(t), 12)
    }
    expect(interp.mean).toBeCloseTo(2, 13)
  })

  it('antiderivative is quasi-periodic: F(t + 2π) = F(t) + 2π·mean', () => {
    const interp = new PeriodicInterpolant(samplesOf(f, 32))
    for (const t of [0.3, 2.2, 5.5]) {
      expect(interp.antiderivative(t + TWO_PI)).toBeCloseTo(interp.antiderivative(t) + TWO_PI * interp.mean, 11)
    }
  })

  it('converges spectrally on smooth non-polynomial data (e^{cos t})', () => {
    const g = (t: number) => Math.exp(Math.cos(t))
    const coarse = new PeriodicInterpolant(samplesOf(g, 32))
    const fine = new PeriodicInterpolant(samplesOf(g, 64))
    for (const t of [0.7, 2.9, 4.1]) {
      expect(coarse.value(t)).toBeCloseTo(g(t), 10)
      // Richardson: the two resolutions agree far beyond the coarse truncation
      expect(Math.abs(coarse.antiderivative(t) - fine.antiderivative(t))).toBeLessThan(1e-11)
    }
    // I₀(1)·2π: the mean of e^{cos t} is the modified Bessel I₀(1) ≈ 1.2660658777520
    expect(coarse.mean).toBeCloseTo(1.2660658777520084, 12)
  })

  it('rejects degenerate input', () => {
    expect(() => new PeriodicInterpolant([1])).toThrow(RangeError)
  })
})

describe('table helpers', () => {
  const table = Float64Array.from({ length: 101 }, (_, i) => Math.sinh(i / 25)) // strictly increasing

  it('invertMonotoneTable inverts within lerp accuracy and clamps ends', () => {
    for (const v of [0.05, 1, 5, 20]) {
      const t = invertMonotoneTable(table, v, TWO_PI)
      const back = lerpTable(table, t, TWO_PI)
      expect(back).toBeCloseTo(v, 9)
    }
    expect(invertMonotoneTable(table, -1, TWO_PI)).toBe(0)
    expect(invertMonotoneTable(table, 1e9, TWO_PI)).toBe(TWO_PI)
  })

  it('lerpTable hits nodes exactly', () => {
    expect(lerpTable(table, 0, TWO_PI)).toBe(table[0]!)
    expect(lerpTable(table, TWO_PI, TWO_PI)).toBeCloseTo(table[100]!, 12)
    expect(lerpTable(table, TWO_PI / 2, TWO_PI)).toBeCloseTo(table[50]!, 12)
  })
})
