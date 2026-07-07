/**
 * P²(F_p) embedded into ℝ³ via a chosen embedding function. Pure math — no
 * three.js. The grid embedding lays the p² affine points on the xz-plane and
 * sends the p+1 points at infinity to a halo circle, placed at the angle of
 * the slope they represent. (A torus embedding is included for completeness;
 * the demos use the grid.)
 */
import { FiniteField, type ProjectivePoint } from './field'

export type ProjectiveEmbedding = (p: number, pt: ProjectivePoint) => [number, number, number]

/**
 * Angle of the direction a point at infinity represents:
 * [1:m:0] → direction (1, m) → atan2(m, 1); [0:1:0] → (0, 1) → π/2.
 */
function infinityAngle(pt: ProjectivePoint): number {
  if (pt[0] === 0) return Math.PI / 2
  return Math.atan2(pt[1], 1)
}

/** Place an affine [x, y] on a donut torus with radii R, r. */
function torusAffine(p: number, x: number, y: number, R: number, r: number): [number, number, number] {
  const u = (2 * Math.PI * x) / p
  const v = (2 * Math.PI * y) / p
  const ring = r * Math.cos(u) + R
  return [ring * Math.cos(v), -r * Math.sin(u), ring * Math.sin(v)]
}

/**
 * Flat grid embedding: affine points at (x, 0, y); infinity points on a circle
 * around the grid, clear of its corners, at the angle of their slope.
 */
export const gridEmbedding: ProjectiveEmbedding = (p, pt) => {
  if (pt[2] !== 0) return [pt[0], 0, pt[1]]
  const half = (p - 1) / 2
  const radius = half * Math.SQRT2 + 2 // clear of grid corners
  const angle = infinityAngle(pt)
  return [radius * Math.cos(angle), 0, radius * Math.sin(angle)]
}

/** Grid embedding with custom spacing. */
export function scaledGridEmbedding(scale: number): ProjectiveEmbedding {
  return (p, pt) => {
    if (pt[2] !== 0) return [pt[0] * scale, 0, pt[1] * scale]
    const half = (p - 1) / 2
    const radius = (half * Math.SQRT2 + 2) * scale
    const angle = infinityAngle(pt)
    return [radius * Math.cos(angle), 0, radius * Math.sin(angle)]
  }
}

/** Standard donut-torus embedding: affine on the torus, infinity on a halo. */
export const torusEmbedding: ProjectiveEmbedding = (p, pt) => {
  if (pt[2] !== 0) return torusAffine(p, pt[0], pt[1], 2, 1)
  const angle = infinityAngle(pt)
  return [2 * Math.cos(angle), 2.5, 2 * Math.sin(angle)]
}

export interface EmbeddedPoint {
  proj: ProjectivePoint
  pos: [number, number, number]
  isInfinity: boolean
}

export class ProjectivePlane {
  readonly field: FiniteField
  readonly embed: ProjectiveEmbedding

  constructor(field: FiniteField, embed: ProjectiveEmbedding) {
    this.field = field
    this.embed = embed
  }

  /** Map a projective point to ℝ³. */
  pointAt(pt: ProjectivePoint): [number, number, number]
  /** Map an affine [x, y] (shorthand for [x:y:1]) to ℝ³. */
  pointAt(x: number, y: number): [number, number, number]
  pointAt(a: ProjectivePoint | number, b?: number): [number, number, number] {
    if (typeof a === 'number') return this.embed(this.field.p, [a, b!, 1])
    return this.embed(this.field.p, a)
  }

  /** All p²+p+1 projective points with their ℝ³ positions. */
  allPoints(): EmbeddedPoint[] {
    return this.field.projectivePoints().map((proj) => ({
      proj,
      pos: this.embed(this.field.p, proj),
      isInfinity: proj[2] === 0,
    }))
  }
}
