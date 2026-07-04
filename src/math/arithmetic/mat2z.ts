/**
 * Exact 2×2 integer matrices (BigInt), the workhorse of the Frobenius
 * fixed-point computation (DESIGN.md §5.1): powers, kernels via Smith
 * normal form, and SL₂(ℤ) bookkeeping all live here.
 */
import { egcd } from '@/math/core'

export interface SmithNormalForm {
  /** Diagonal entries, d1 | d2, both ≥ 0. */
  d: [bigint, bigint]
  /** Unimodular left factor: U·M·V = diag(d1, d2). */
  U: Mat2Z
  /** Unimodular right factor. */
  V: Mat2Z
}

/** Immutable 2×2 BigInt matrix ((a, b), (c, d)) acting on column vectors. */
export class Mat2Z {
  constructor(
    readonly a: bigint,
    readonly b: bigint,
    readonly c: bigint,
    readonly d: bigint,
  ) {}

  static readonly ID = new Mat2Z(1n, 0n, 0n, 1n)
  static readonly ZERO = new Mat2Z(0n, 0n, 0n, 0n)

  add(m: Mat2Z): Mat2Z {
    return new Mat2Z(this.a + m.a, this.b + m.b, this.c + m.c, this.d + m.d)
  }

  sub(m: Mat2Z): Mat2Z {
    return new Mat2Z(this.a - m.a, this.b - m.b, this.c - m.c, this.d - m.d)
  }

  neg(): Mat2Z {
    return new Mat2Z(-this.a, -this.b, -this.c, -this.d)
  }

  scale(s: bigint): Mat2Z {
    return new Mat2Z(s * this.a, s * this.b, s * this.c, s * this.d)
  }

  mul(m: Mat2Z): Mat2Z {
    return new Mat2Z(
      this.a * m.a + this.b * m.c,
      this.a * m.b + this.b * m.d,
      this.c * m.a + this.d * m.c,
      this.c * m.b + this.d * m.d,
    )
  }

  /** Mᵏ by binary exponentiation, k ≥ 0. */
  pow(k: number): Mat2Z {
    if (!Number.isInteger(k) || k < 0) throw new RangeError(`pow: k must be a nonnegative integer, got ${k}`)
    let result = Mat2Z.ID
    let base = new Mat2Z(this.a, this.b, this.c, this.d)
    let e = k
    while (e > 0) {
      if (e % 2 === 1) result = result.mul(base)
      base = base.mul(base)
      e = Math.floor(e / 2)
    }
    return result
  }

  det(): bigint {
    return this.a * this.d - this.b * this.c
  }

  trace(): bigint {
    return this.a + this.d
  }

  transpose(): Mat2Z {
    return new Mat2Z(this.a, this.c, this.b, this.d)
  }

  /** Matrix–vector product M·(x, y)ᵀ. */
  apply(x: bigint, y: bigint): [bigint, bigint] {
    return [this.a * x + this.b * y, this.c * x + this.d * y]
  }

  equals(m: Mat2Z): boolean {
    return this.a === m.a && this.b === m.b && this.c === m.c && this.d === m.d
  }

  toString(): string {
    return `((${this.a}, ${this.b}), (${this.c}, ${this.d}))`
  }

  /**
   * Smith normal form: U·M·V = diag(d1, d2) with U, V ∈ GL₂(ℤ),
   * d1 | d2, d1, d2 ≥ 0. The group ℤ²/Mℤ² is then ℤ/d1 × ℤ/d2 —
   * exactly the structure of E(F_{p^k}) = ker(Mᵏ − I) (DESIGN.md §5.1).
   */
  smithNormalForm(): SmithNormalForm {
    // Work on a mutable copy; row ops accumulate into U, column ops into V.
    let [a, b, c, d] = [this.a, this.b, this.c, this.d]
    let U = Mat2Z.ID
    let V = Mat2Z.ID

    // Clear c using unimodular row ops. When a | c a plain shear suffices (and
    // leaves b untouched); otherwise a Bézout rotation strictly shrinks |a| to
    // gcd(a, c) — which is what guarantees the outer loop terminates.
    const clearLowerLeft = () => {
      if (c === 0n) return
      if (a !== 0n && c % a === 0n) {
        const m = c / a // r1 ← r1 − m·r0
        ;[c, d] = [0n, d - m * b]
        U = new Mat2Z(1n, 0n, -m, 1n).mul(U)
        return
      }
      const { g, x, y } = egcd(a, c)
      const [p, q] = [a / g, c / g] // p·x + q·y = 1
      const E = new Mat2Z(x, y, -q, p) // det = x·p + y·q = 1
      ;[a, b, c, d] = [x * a + y * c, x * b + y * d, -q * a + p * c, -q * b + p * d]
      U = E.mul(U)
    }
    // Clear b using unimodular column ops (same step on the transpose).
    const clearUpperRight = () => {
      if (b === 0n) return
      if (a !== 0n && b % a === 0n) {
        const m = b / a // col1 ← col1 − m·col0
        ;[b, d] = [0n, d - m * c]
        V = V.mul(new Mat2Z(1n, -m, 0n, 1n))
        return
      }
      const { g, x, y } = egcd(a, b)
      const [p, q] = [a / g, b / g]
      const E = new Mat2Z(x, -q, y, p) // columns: col0 ← x·col0 + y·col1, col1 ← −q·col0 + p·col1
      ;[a, b, c, d] = [a * x + b * y, -a * q + b * p, c * x + d * y, -c * q + d * p]
      V = V.mul(E)
    }

    while (b !== 0n || c !== 0n) {
      clearLowerLeft()
      clearUpperRight() // may reintroduce a nonzero c; the loop re-clears it
    }

    // Diagonal now. Put a zero (if any) in the last slot so d1 | d2 can hold.
    if (a === 0n && d !== 0n) {
      ;[a, d] = [d, a]
      U = new Mat2Z(0n, 1n, 1n, 0n).mul(U)
      V = V.mul(new Mat2Z(0n, 1n, 1n, 0n))
    }

    // Enforce divisibility: col0 ← col0 + col1 puts d into position c, then re-reduce.
    while (a !== 0n && d % a !== 0n) {
      c = d
      V = V.mul(new Mat2Z(1n, 0n, 1n, 1n))
      while (b !== 0n || c !== 0n) {
        clearLowerLeft()
        clearUpperRight()
      }
    }

    // Fix signs with row negations.
    if (a < 0n) {
      a = -a
      U = new Mat2Z(-1n, 0n, 0n, 1n).mul(U)
    }
    if (d < 0n) {
      d = -d
      U = new Mat2Z(1n, 0n, 0n, -1n).mul(U)
    }

    return { d: [a, d], U, V }
  }
}
