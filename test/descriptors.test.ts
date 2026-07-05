import { describe, expect, it } from 'vitest'

import { CURVES } from '@/author'
import { describeCurve, parseCurveDescriptors, parsePresentation } from '@/io'

const VALID = { p: 11, trace: 6, sign: 1, form: { a: 1, b: 0, c: 2 } }

describe('parseCurveDescriptors', () => {
  it('parses a minimal descriptor with generated label and default sign', () => {
    const [lc] = parseCurveDescriptors([{ p: 11, trace: 6, form: { a: 1, b: 0, c: 2 } }])
    expect(lc!.data.p).toBe(11n)
    expect(lc!.data.trace).toBe(6n)
    expect(lc!.data.sign).toBe(1)
    expect(lc!.label).toBe(describeCurve(lc!.data))
  })

  it('accepts decimal strings for bigint fields (beyond 2^53)', () => {
    const big = '9007199254740993' // 2^53 + 1
    const [lc] = parseCurveDescriptors([
      { p: big, trace: 0, form: { a: 1, b: 0, c: big } }, // supersingular-shaped: 0² − 4p = −4p = disc·1²...
    ])
    expect(lc!.data.p).toBe(9007199254740993n)
  })

  it('round-trips the battery: data/curves.json IS the catalog', () => {
    // CURVES is parsed from data/curves.json at import time; spot-check the paper example
    expect(CURVES[0]!.label).toContain('disc −8')
    expect(CURVES[0]!.data.form).toEqual({ a: 1n, b: 0n, c: 2n })
    expect(CURVES.length).toBe(8)
  })

  it('rejects a Hasse-violating trace with the offending index', () => {
    expect(() => parseCurveDescriptors([{ ...VALID, trace: 8 }])).toThrow(/descriptor\[0\].*Hasse/)
  })

  it('rejects a form whose discriminant does not divide trace²−4p as disc·f²', () => {
    expect(() => parseCurveDescriptors([{ ...VALID, form: { a: 1, b: 1, c: 1 } }])).toThrow(/conductor/)
  })

  it('rejects non-negative form discriminants', () => {
    expect(() => parseCurveDescriptors([{ ...VALID, form: { a: 1, b: 3, c: 1 } }])).toThrow(/negative/)
  })

  it('rejects malformed fields with field-precise errors', () => {
    expect(() => parseCurveDescriptors([{ ...VALID, p: 11.5 }])).toThrow(/descriptor\[0\]\.p/)
    expect(() => parseCurveDescriptors([{ ...VALID, sign: 2 }])).toThrow(/sign/)
    expect(() => parseCurveDescriptors([{ ...VALID, label: 7 }])).toThrow(/label/)
    expect(() => parseCurveDescriptors({})).toThrow(/array/)
  })

  it('parses the optional Weierstrass equation', () => {
    const [lc] = parseCurveDescriptors([{ ...VALID, equation: { f: 1, g: 2 } }])
    expect(lc!.data.equation).toEqual({ f: 1n, g: 2n })
  })
})

describe('parsePresentation', () => {
  it('parses a label → style map with hex colors and integer-k radii', () => {
    const p = parsePresentation({
      'disc −3': { profile: { a: 0.276, b: 1.9, n: 3 }, color: '0x43a33b', radiusByK: { '2': 0.075 } },
    })
    expect(p['disc −3']!.color).toBe(0x43a33b)
    expect(p['disc −3']!.profile).toEqual({ a: 0.276, b: 1.9, n: 3 })
    expect(p['disc −3']!.radiusByK).toEqual({ 2: 0.075 })
  })

  it('rejects non-object input and malformed styles with the offending label', () => {
    expect(() => parsePresentation([])).toThrow(/object/)
    expect(() => parsePresentation({ x: { surface: 'shiny' } })).toThrow(/presentation\["x"\]/)
  })
})
