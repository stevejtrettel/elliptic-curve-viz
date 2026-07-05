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
