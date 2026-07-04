/**
 * Complex numbers as immutable value objects. The math layer's own type —
 * no three.js (DESIGN.md §4). Floats: this is where exactness ends, so
 * Complex appears only downstream of the integer arithmetic (DESIGN.md §5.1
 * `toComplex` is the boundary).
 */

export class Complex {
  constructor(
    readonly re: number,
    readonly im: number,
  ) {}

  static readonly ZERO = new Complex(0, 0)
  static readonly ONE = new Complex(1, 0)
  static readonly I = new Complex(0, 1)

  /** r·e^{iθ}. */
  static fromPolar(r: number, theta: number): Complex {
    return new Complex(r * Math.cos(theta), r * Math.sin(theta))
  }

  add(z: Complex): Complex {
    return new Complex(this.re + z.re, this.im + z.im)
  }

  sub(z: Complex): Complex {
    return new Complex(this.re - z.re, this.im - z.im)
  }

  mul(z: Complex): Complex {
    return new Complex(this.re * z.re - this.im * z.im, this.re * z.im + this.im * z.re)
  }

  div(z: Complex): Complex {
    const d = z.abs2()
    return new Complex((this.re * z.re + this.im * z.im) / d, (this.im * z.re - this.re * z.im) / d)
  }

  neg(): Complex {
    return new Complex(-this.re, -this.im)
  }

  conj(): Complex {
    return new Complex(this.re, -this.im)
  }

  /** Multiplication by a real scalar. */
  scale(s: number): Complex {
    return new Complex(s * this.re, s * this.im)
  }

  /** |z|². */
  abs2(): number {
    return this.re * this.re + this.im * this.im
  }

  abs(): number {
    return Math.hypot(this.re, this.im)
  }

  /** Principal argument in (−π, π]. */
  arg(): number {
    return Math.atan2(this.im, this.re)
  }

  /** Componentwise comparison, |Δre| ≤ tol and |Δim| ≤ tol. */
  equals(z: Complex, tol = 0): boolean {
    return Math.abs(this.re - z.re) <= tol && Math.abs(this.im - z.im) <= tol
  }
}
