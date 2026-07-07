import { describe, expect, it } from 'vitest'

import { CURVES, finiteCurveFromData, hasFiniteView } from '@/author'
import type { CurveData } from '@/math/arithmetic'

const withEquation = (p: bigint, f: bigint, g: bigint): CurveData => ({
  form: { a: 1n, b: 0n, c: 1n },
  trace: 2n,
  p,
  sign: 1,
  equation: { f, g },
})

describe('finiteCurveFromData', () => {
  it('builds y² = x³ + fx + g from CurveData.equation', () => {
    // disc −4 · p=5 · form (1,0,1): equation f=1, g=0 ⇒ y² = x³ + x over F_5.
    // Affine points (0,0), (2,0), (−2,0) + [0:1:0] ⇒ #E = 4, trace = 6 − 4 = 2.
    const E = finiteCurveFromData(withEquation(5n, 1n, 0n))
    const pts = E.points()
    expect(pts).toHaveLength(4)
    expect(pts.some((q) => q[2] === 0)).toBe(true)
  })

  it('throws for a curve with no equation (Deuring lift is offline)', () => {
    const noEq: CurveData = { form: { a: 1n, b: 0n, c: 2n }, trace: 6n, p: 11n, sign: 1 }
    expect(() => finiteCurveFromData(noEq)).toThrow(/equation/)
  })
})

describe('hasFiniteView', () => {
  it('requires only a Weierstrass equation — any prime is fine', () => {
    expect(hasFiniteView(withEquation(5n, 1n, 0n))).toBe(true)
    expect(hasFiniteView(withEquation(101n, 1n, 0n))).toBe(true) // large p is fine
    expect(hasFiniteView({ form: { a: 1n, b: 0n, c: 2n }, trace: 6n, p: 11n, sign: 1 })).toBe(false) // no equation
  })

  it('matches the catalog: every eligible curve builds a nonempty F_p view', () => {
    const eligible = CURVES.filter((c) => hasFiniteView(c.data))
    expect(eligible.length).toBeGreaterThan(0)
    for (const c of eligible) {
      const pts = finiteCurveFromData(c.data).points()
      const p = Number(c.data.p)
      expect(pts.length).toBeGreaterThan(0)
      // sanity: the count sits inside the Hasse window for E(F_p)
      expect(Math.abs(pts.length - (p + 1))).toBeLessThanOrEqual(2 * Math.sqrt(p))
    }
  })
})
