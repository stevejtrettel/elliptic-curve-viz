/**
 * Profile curves on S² (DESIGN.md §5.3): closed curves, period 2π, given
 * canonically as uniform samples — formulas are just one way to make them,
 * keeping the door open for evolved/flowed curves (DiscreteCurve).
 */
import { PeriodicInterpolant } from './interpolant'

/** Spherical coordinates: φ ∈ (0, π) from the north pole, θ the longitude. */
export interface SpherePoint {
  theta: number
  phi: number
}

/**
 * A simple closed curve on S², parameter period 2π.
 * sample(n) returns values at t_j = 2πj/n, j = 0..n−1. θ must be a continuous
 * lift with winding number 1 (θ(t + 2π) = θ(t) + 2π) — the graph-over-the-
 * equator condition that makes Pinkall's simplicity hypothesis structural.
 */
export interface ProfileCurve {
  sample(n: number): SpherePoint[]
}

/** The latitude circle φ = φ₀: A = 2π(1 − cos φ₀), L = 2π sin φ₀ in closed form. */
export class LatitudeCircle implements ProfileCurve {
  constructor(readonly phi0: number) {
    if (!(phi0 > 0 && phi0 < Math.PI)) throw new RangeError(`need 0 < φ₀ < π, got ${phi0}`)
  }

  sample(n: number): SpherePoint[] {
    return Array.from({ length: n }, (_, j) => ({ theta: (2 * Math.PI * j) / n, phi: this.phi0 }))
  }
}

export interface WavyCircleParams {
  phi0: number
  /** Amplitude of the φ wave. */
  b: number
  /** Lobe count. */
  n: number
  /** θ skew: θ = t + skew·sin(2nt); |2n·skew| < 1 keeps θ monotone. Default 0. */
  skew?: number
}

/**
 * The default family (DESIGN.md §5.4): φ(t) = φ₀ + b·cos(nt),
 * θ(t) = t + skew·sin(2nt). θ monotone ⟹ graph over the equator ⟹ simple.
 */
export class WavyCircle implements ProfileCurve {
  readonly phi0: number
  readonly b: number
  readonly n: number
  readonly skew: number

  constructor({ phi0, b, n, skew = 0 }: WavyCircleParams) {
    if (!(Number.isInteger(n) && n >= 1)) throw new RangeError(`lobe count n must be a positive integer, got ${n}`)
    if (!(phi0 - Math.abs(b) > 0 && phi0 + Math.abs(b) < Math.PI)) {
      throw new RangeError(`φ₀ ± b must stay in (0, π): φ₀ = ${phi0}, b = ${b}`)
    }
    if (!(Math.abs(2 * n * skew) < 1)) throw new RangeError(`|2n·skew| < 1 required for monotone θ, got ${2 * n * skew}`)
    this.phi0 = phi0
    this.b = b
    this.n = n
    this.skew = skew
  }

  sample(count: number): SpherePoint[] {
    return Array.from({ length: count }, (_, j) => {
      const t = (2 * Math.PI * j) / count
      return {
        theta: t + this.skew * Math.sin(2 * this.n * t),
        phi: this.phi0 + this.b * Math.cos(this.n * t),
      }
    })
  }
}

/**
 * A curve given by raw uniform samples (the future home of curvature flows).
 * Resampling to a different n goes through trigonometric interpolation of
 * (θ − t) and φ, so accuracy is limited only by the original sample count.
 */
export class DiscreteCurve implements ProfileCurve {
  private readonly points: SpherePoint[]

  constructor(points: SpherePoint[]) {
    if (points.length < 4) throw new RangeError(`need at least 4 samples, got ${points.length}`)
    this.points = points.map((p) => ({ ...p }))
  }

  sample(n: number): SpherePoint[] {
    const m = this.points.length
    if (n === m) return this.points.map((p) => ({ ...p }))
    const thetaP = new PeriodicInterpolant(this.points.map((p, j) => p.theta - (2 * Math.PI * j) / m))
    const phi = new PeriodicInterpolant(this.points.map((p) => p.phi))
    return Array.from({ length: n }, (_, j) => {
      const t = (2 * Math.PI * j) / n
      return { theta: t + thetaP.value(t), phi: phi.value(t) }
    })
  }
}
