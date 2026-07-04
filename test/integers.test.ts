import { describe, expect, it } from 'vitest'
import { egcd, gcd, mod } from '@/math/core'

describe('gcd', () => {
  it('computes classical values', () => {
    expect(gcd(12n, 18n)).toBe(6n)
    expect(gcd(17n, 5n)).toBe(1n)
    expect(gcd(0n, 7n)).toBe(7n)
    expect(gcd(0n, 0n)).toBe(0n)
  })

  it('is symmetric and sign-insensitive', () => {
    expect(gcd(-12n, 18n)).toBe(6n)
    expect(gcd(12n, -18n)).toBe(6n)
    expect(gcd(-12n, -18n)).toBe(6n)
  })

  it('handles values beyond Number precision', () => {
    const a = 2n ** 200n * 3n ** 5n
    const b = 2n ** 150n * 5n ** 7n
    expect(gcd(a, b)).toBe(2n ** 150n)
  })
})

describe('egcd', () => {
  it('satisfies the Bézout identity on a grid including negatives and zero', () => {
    const values = [-97n, -12n, -1n, 0n, 1n, 5n, 42n, 1024n, 3n ** 40n]
    for (const a of values) {
      for (const b of values) {
        const { g, x, y } = egcd(a, b)
        expect(g).toBe(gcd(a, b))
        expect(a * x + b * y).toBe(g)
      }
    }
  })
})

describe('mod', () => {
  it('returns least nonnegative residues', () => {
    expect(mod(7n, 5n)).toBe(2n)
    expect(mod(-7n, 5n)).toBe(3n)
    expect(mod(-5n, 5n)).toBe(0n)
  })
})
