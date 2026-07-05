import { describe, expect, it } from 'vitest'

import { CURVES, describeCurve, resolveCurve } from '@/author'

describe('CURVES battery', () => {
  it('has unique labels', () => {
    expect(new Set(CURVES.map((c) => c.label)).size).toBe(CURVES.length)
  })

  it('satisfies the Hasse bound |a| ≤ 2√p and a²−4p = disc(form)·f² for integer conductor f', () => {
    for (const { data } of CURVES) {
      const { a, b, c } = data.form
      const disc = b * b - 4n * a * c
      const frob = data.trace * data.trace - 4n * data.p
      expect(Number(data.trace) ** 2).toBeLessThanOrEqual(4 * Number(data.p))
      expect(disc).toBeLessThan(0n)
      expect(frob % disc).toBe(0n)
      const f = Math.sqrt(Number(frob / disc))
      expect(Number.isInteger(f)).toBe(true)
    }
  })
})

describe('resolveCurve', () => {
  it('resolves by index and by numeric string (URL param form)', () => {
    expect(resolveCurve(1)).toBe(CURVES[1])
    expect(resolveCurve('1')).toBe(CURVES[1])
  })

  it('resolves by exact label', () => {
    expect(resolveCurve('disc −4 · square')).toBe(CURVES[2])
  })

  it('passes raw CurveData through with a generated label', () => {
    const data = CURVES[0]!.data
    const lc = resolveCurve(data)
    expect(lc.data).toBe(data)
    expect(lc.label).toBe(describeCurve(data))
    expect(lc.label).toContain('p=11')
  })

  it('throws with the catalog listing on unknown references', () => {
    expect(() => resolveCurve(99)).toThrow(/out of range/)
    expect(() => resolveCurve('nope')).toThrow(/disc −8/)
  })
})
