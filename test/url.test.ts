import { describe, expect, it } from 'vitest'

import { decodeParams } from '@/author'

describe('decodeParams', () => {
  it('parses all legacy numeric params', () => {
    expect(decodeParams('?curve=1&k=3&lobes=4&fibers=8&grid=6&blocktrace=16')).toEqual({
      curve: 1,
      k: 3,
      lobes: 4,
      fibers: 8,
      grid: 6,
      blocktrace: 16,
    })
  })

  it('parses boolean flags only when "1"', () => {
    expect(decodeParams('?domain=1&trace=1&design=1')).toEqual({ domain: true, trace: true, design: true })
    expect(decodeParams('?domain=0&trace=yes')).toEqual({})
  })

  it('parses cayley generator selections', () => {
    expect(decodeParams('?cayley=1')).toEqual({ cayley: [0, 1] })
    expect(decodeParams('?cayley=both')).toEqual({ cayley: [0, 1] })
    expect(decodeParams('?cayley=g1')).toEqual({ cayley: [0] })
    expect(decodeParams('?cayley=g2')).toEqual({ cayley: [1] })
    expect(decodeParams('?cayley=banana')).toEqual({})
  })

  it('parses torus visibility/material', () => {
    expect(decodeParams('?torus=0')).toEqual({ torus: false })
    expect(decodeParams('?torus=off')).toEqual({ torus: false })
    expect(decodeParams('?torus=matte')).toEqual({ torus: 'matte' })
    expect(decodeParams('?torus=glass')).toEqual({ torus: 'glass' })
    expect(decodeParams('?torus=banana')).toEqual({})
  })

  it('passes studio through as a string', () => {
    expect(decodeParams('?studio=paper-white')).toEqual({ studio: 'paper-white' })
  })

  it('omits absent params entirely (exactOptionalPropertyTypes-clean)', () => {
    expect(decodeParams('')).toEqual({})
    expect('curve' in decodeParams('?k=2')).toBe(false)
  })

  it('ignores garbage values', () => {
    expect(decodeParams('?curve=banana&k=NaN')).toEqual({})
  })
})
