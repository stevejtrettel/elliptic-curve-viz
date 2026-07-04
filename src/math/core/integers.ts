/**
 * Exact integer arithmetic (BigInt). The foundation of src/math/arithmetic:
 * point orders, Smith normal form, and lattice bookkeeping all reduce to gcd/Bézout.
 */

/** Greatest common divisor, gcd(a, b) ≥ 0, gcd(0, 0) = 0. */
export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b !== 0n) {
    ;[a, b] = [b, a % b]
  }
  return a
}

/**
 * Extended Euclid: returns { g, x, y } with g = gcd(a, b) ≥ 0 and a·x + b·y = g.
 */
export function egcd(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  let [r0, r1] = [a, b]
  let [x0, x1] = [1n, 0n]
  let [y0, y1] = [0n, 1n]
  while (r1 !== 0n) {
    const q = r0 / r1 // BigInt division truncates toward zero; Bézout still holds
    ;[r0, r1] = [r1, r0 - q * r1]
    ;[x0, x1] = [x1, x0 - q * x1]
    ;[y0, y1] = [y1, y0 - q * y1]
  }
  if (r0 < 0n) return { g: -r0, x: -x0, y: -y0 }
  return { g: r0, x: x0, y: y0 }
}

/** Least nonnegative residue of a mod n (n > 0), correct for negative a. */
export function mod(a: bigint, n: bigint): bigint {
  const r = a % n
  return r < 0n ? r + n : r
}
