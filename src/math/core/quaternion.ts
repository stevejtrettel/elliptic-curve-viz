/**
 * Quaternions, used as pairs (p, q) for SO(4) rotations of S³: x ↦ p·x·q̄
 * (DESIGN.md §3). The identification ℝ⁴ ≅ ℍ is fixed once:
 * (x, y, z, w) ↔ x + yi + zj + wk, so the complex pair (z_ℂ, w_ℂ) =
 * (x + iy, z + iw) of the Hopf map reads z_ℂ + w_ℂ·j.
 */
import { Vec4 } from './vec'

export class Quaternion {
  constructor(
    readonly r: number,
    readonly i: number,
    readonly j: number,
    readonly k: number,
  ) {}

  static readonly ONE = new Quaternion(1, 0, 0, 0)

  /** cos(α/2) + sin(α/2)·(unit axis), the usual half-angle form. */
  static fromAxisAngle(axis: { i: number; j: number; k: number }, alpha: number): Quaternion {
    const n = Math.hypot(axis.i, axis.j, axis.k)
    if (n === 0) throw new RangeError('fromAxisAngle: zero axis')
    const s = Math.sin(alpha / 2) / n
    return new Quaternion(Math.cos(alpha / 2), s * axis.i, s * axis.j, s * axis.k)
  }

  static fromVec4(v: Vec4): Quaternion {
    return new Quaternion(v.x, v.y, v.z, v.w)
  }

  toVec4(): Vec4 {
    return new Vec4(this.r, this.i, this.j, this.k)
  }

  mul(q: Quaternion): Quaternion {
    return new Quaternion(
      this.r * q.r - this.i * q.i - this.j * q.j - this.k * q.k,
      this.r * q.i + this.i * q.r + this.j * q.k - this.k * q.j,
      this.r * q.j - this.i * q.k + this.j * q.r + this.k * q.i,
      this.r * q.k + this.i * q.j - this.j * q.i + this.k * q.r,
    )
  }

  conj(): Quaternion {
    return new Quaternion(this.r, -this.i, -this.j, -this.k)
  }

  scale(s: number): Quaternion {
    return new Quaternion(s * this.r, s * this.i, s * this.j, s * this.k)
  }

  norm2(): number {
    return this.r * this.r + this.i * this.i + this.j * this.j + this.k * this.k
  }

  norm(): number {
    return Math.sqrt(this.norm2())
  }

  normalize(): Quaternion {
    return this.scale(1 / this.norm())
  }

  equals(q: Quaternion, tol = 0): boolean {
    return (
      Math.abs(this.r - q.r) <= tol &&
      Math.abs(this.i - q.i) <= tol &&
      Math.abs(this.j - q.j) <= tol &&
      Math.abs(this.k - q.k) <= tol
    )
  }
}

/** The SO(4) action of a unit pair: x ↦ p·x·q̄, with x ∈ ℝ⁴ read as a quaternion. */
export function rotateS3(p: Quaternion, q: Quaternion, x: Vec4): Vec4 {
  return p.mul(Quaternion.fromVec4(x)).mul(q.conj()).toVec4()
}
