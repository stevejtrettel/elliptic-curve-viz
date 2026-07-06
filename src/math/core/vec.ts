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

  cross(v: Vec3): Vec3 {
    return new Vec3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x)
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

/** Pack Vec4s into a flat Float64Array of (x, y, z, w) — the S³ cache layout. */
export function packVec4s(points: readonly Vec4[]): Float64Array {
  const arr = new Float64Array(4 * points.length)
  points.forEach((p, i) => {
    arr[4 * i] = p.x
    arr[4 * i + 1] = p.y
    arr[4 * i + 2] = p.z
    arr[4 * i + 3] = p.w
  })
  return arr
}

/**
 * Generalized cross product in ℝ⁴: the unique vector orthogonal to a, b, c
 * with |a ∧ b ∧ c| magnitude, via cofactor expansion of det(e; a; b; c).
 * Used for surface normals in T_hS³ (h, ∂s, ∂v ↦ normal).
 */
export function cross4(a: Vec4, b: Vec4, c: Vec4): Vec4 {
  const m01 = b.x * c.y - b.y * c.x
  const m02 = b.x * c.z - b.z * c.x
  const m03 = b.x * c.w - b.w * c.x
  const m12 = b.y * c.z - b.z * c.y
  const m13 = b.y * c.w - b.w * c.y
  const m23 = b.z * c.w - b.w * c.z
  return new Vec4(
    a.y * m23 - a.z * m13 + a.w * m12,
    -(a.x * m23 - a.z * m03 + a.w * m02),
    a.x * m13 - a.y * m03 + a.w * m01,
    -(a.x * m12 - a.y * m02 + a.z * m01),
  )
}
