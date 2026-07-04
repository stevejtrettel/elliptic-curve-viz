/**
 * Minimal immutable vectors for S³ ⊂ ℝ⁴ geometry and its ℝ³ projections.
 * The math layer's own types — no three.js (DESIGN.md §4); geometry/ narrows
 * to THREE.Vector3/Float32 at the buffer boundary.
 */

export class Vec3 {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}

  add(v: Vec3): Vec3 {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z)
  }

  sub(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z)
  }

  scale(s: number): Vec3 {
    return new Vec3(s * this.x, s * this.y, s * this.z)
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z
  }

  norm2(): number {
    return this.dot(this)
  }

  norm(): number {
    return Math.sqrt(this.norm2())
  }

  normalize(): Vec3 {
    return this.scale(1 / this.norm())
  }

  equals(v: Vec3, tol = 0): boolean {
    return Math.abs(this.x - v.x) <= tol && Math.abs(this.y - v.y) <= tol && Math.abs(this.z - v.z) <= tol
  }
}

export class Vec4 {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly w: number,
  ) {}

  add(v: Vec4): Vec4 {
    return new Vec4(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w)
  }

  sub(v: Vec4): Vec4 {
    return new Vec4(this.x - v.x, this.y - v.y, this.z - v.z, this.w - v.w)
  }

  scale(s: number): Vec4 {
    return new Vec4(s * this.x, s * this.y, s * this.z, s * this.w)
  }

  dot(v: Vec4): number {
    return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w
  }

  norm2(): number {
    return this.dot(this)
  }

  norm(): number {
    return Math.sqrt(this.norm2())
  }

  normalize(): Vec4 {
    return this.scale(1 / this.norm())
  }

  equals(v: Vec4, tol = 0): boolean {
    return (
      Math.abs(this.x - v.x) <= tol &&
      Math.abs(this.y - v.y) <= tol &&
      Math.abs(this.z - v.z) <= tol &&
      Math.abs(this.w - v.w) <= tol
    )
  }
}
