import { describe, expect, it } from 'vitest'

import { Mat2Z } from '@/math/arithmetic'
import { gcd } from '@/math/core'

const abs = (x: bigint) => (x < 0n ? -x : x)

/** A small grid of matrices: generic, singular, symmetric, zero, negative, large. */
const SAMPLES: Mat2Z[] = [
  new Mat2Z(1n, 0n, 0n, 1n),
  new Mat2Z(0n, 0n, 0n, 0n),
  new Mat2Z(2n, 0n, 0n, 3n),
  new Mat2Z(4n, 6n, 2n, 3n), // singular, det 0, rank 1
  new Mat2Z(0n, -3n, 5n, 7n),
  new Mat2Z(-2n, 4n, 4n, -8n), // singular
  new Mat2Z(6n, 4n, 2n, 8n),
  new Mat2Z(0n, 2n, -2n, 0n),
  new Mat2Z(1n, 1n, 0n, 1n), // T ∈ SL2(Z)
  new Mat2Z(0n, -1n, 1n, 0n), // S ∈ SL2(Z)
  new Mat2Z(10n ** 20n, 3n, -7n, 10n ** 18n), // beyond Number precision
  new Mat2Z(-4n, 0n, 0n, 6n),
  new Mat2Z(0n, 0n, 0n, 5n), // zero in the leading slot
  new Mat2Z(0n, 7n, 0n, 0n), // nilpotent
]

describe('Mat2Z ring operations', () => {
  const A = new Mat2Z(1n, 2n, 3n, 4n)
  const B = new Mat2Z(-2n, 0n, 5n, 1n)
  const C = new Mat2Z(7n, -1n, 0n, 3n)

  it('multiplies correctly', () => {
    expect(A.mul(B).equals(new Mat2Z(8n, 2n, 14n, 4n))).toBe(true)
    expect(A.mul(Mat2Z.ID).equals(A)).toBe(true)
    expect(Mat2Z.ID.mul(A).equals(A)).toBe(true)
  })

  it('is associative and distributive on samples', () => {
    expect(A.mul(B).mul(C).equals(A.mul(B.mul(C)))).toBe(true)
    expect(A.mul(B.add(C)).equals(A.mul(B).add(A.mul(C)))).toBe(true)
  })

  it('add/sub/neg/scale', () => {
    expect(A.add(B).sub(B).equals(A)).toBe(true)
    expect(A.add(A.neg()).equals(Mat2Z.ZERO)).toBe(true)
    expect(A.scale(-3n).equals(new Mat2Z(-3n, -6n, -9n, -12n))).toBe(true)
  })

  it('det is multiplicative; trace and transpose behave', () => {
    expect(A.mul(B).det()).toBe(A.det() * B.det())
    expect(A.trace()).toBe(5n)
    expect(A.transpose().transpose().equals(A)).toBe(true)
    expect(A.transpose().det()).toBe(A.det())
  })

  it('apply is the column action', () => {
    expect(A.apply(1n, 0n)).toEqual([1n, 3n])
    expect(A.apply(0n, 1n)).toEqual([2n, 4n])
    expect(A.apply(-2n, 5n)).toEqual([8n, 14n])
  })

  it('pow matches repeated multiplication and handles 0, 1, large k', () => {
    expect(A.pow(0).equals(Mat2Z.ID)).toBe(true)
    expect(A.pow(1).equals(A)).toBe(true)
    let m = Mat2Z.ID
    for (let k = 0; k <= 8; k++) {
      expect(A.pow(k).equals(m)).toBe(true)
      m = m.mul(A)
    }
    // Fibonacci: ((1,1),(1,0))^k has entries F_{k+1}, F_k, F_k, F_{k-1}
    const F = new Mat2Z(1n, 1n, 1n, 0n).pow(30)
    expect(F.b).toBe(832040n)
    expect(() => A.pow(-1)).toThrow(RangeError)
    expect(() => A.pow(1.5)).toThrow(RangeError)
  })
})

describe('Mat2Z.smithNormalForm', () => {
  it('satisfies the SNF contract on the sample grid', () => {
    for (const M of SAMPLES) {
      const { d, U, V } = M.smithNormalForm()
      const [d1, d2] = d
      // U·M·V is the claimed diagonal
      const D = U.mul(M).mul(V)
      expect(D.equals(new Mat2Z(d1, 0n, 0n, d2)), `UMV diagonal for ${M}`).toBe(true)
      // U, V unimodular
      expect(abs(U.det()), `det U for ${M}`).toBe(1n)
      expect(abs(V.det()), `det V for ${M}`).toBe(1n)
      // d1, d2 ≥ 0 and d1 | d2 (with 0 | 0 allowed only as d1 = d2 = 0)
      expect(d1 >= 0n && d2 >= 0n).toBe(true)
      if (d1 === 0n) expect(d2).toBe(0n)
      else expect(d2 % d1).toBe(0n)
      // product = |det|
      expect(d1 * d2).toBe(abs(M.det()))
      // d1 = gcd of all entries (for nonzero M)
      if (!M.equals(Mat2Z.ZERO)) {
        expect(d1).toBe(gcd(gcd(M.a, M.b), gcd(M.c, M.d)))
      }
    }
  })

  it('random small matrices satisfy the contract', () => {
    // deterministic pseudo-random walk over entries in [-9, 9]
    let seed = 12345
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return BigInt((seed % 19) - 9)
    }
    for (let i = 0; i < 200; i++) {
      const M = new Mat2Z(next(), next(), next(), next())
      const { d, U, V } = M.smithNormalForm()
      const D = U.mul(M).mul(V)
      expect(D.equals(new Mat2Z(d[0], 0n, 0n, d[1])), `UMV for ${M}`).toBe(true)
      expect(abs(U.det())).toBe(1n)
      expect(abs(V.det())).toBe(1n)
      expect(d[0] * d[1]).toBe(abs(M.det()))
      if (d[0] !== 0n) expect(d[1] % d[0]).toBe(0n)
    }
  })

  it('known cases', () => {
    expect(new Mat2Z(2n, 0n, 0n, 3n).smithNormalForm().d).toEqual([1n, 6n])
    expect(new Mat2Z(2n, 0n, 0n, 4n).smithNormalForm().d).toEqual([2n, 4n])
    expect(new Mat2Z(4n, 6n, 2n, 3n).smithNormalForm().d).toEqual([1n, 0n])
    expect(Mat2Z.ZERO.smithNormalForm().d).toEqual([0n, 0n])
    expect(Mat2Z.ID.smithNormalForm().d).toEqual([1n, 1n])
  })
})
