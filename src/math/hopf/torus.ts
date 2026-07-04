/**
 * The Hopf torus η⁻¹(C) ⊂ S³ over a profile curve C on S², as the isometric
 * image of ℂ/Λ with Λ = 2πℤ ⊕ (A/2 + iL/2)ℤ (Pinkall; DESIGN.md §3, §5.3).
 *
 * Conventions fixed by the paper (arXiv:2505.09627):
 * - Hopf fiber H₍θ,φ₎(s) = (e^{i(θ+s)} sin(φ/2), e^{is} cos(φ/2)) ∈ ℂ² ≅ ℝ⁴
 *   with (z, w) = (x + iy, z + iw) — no axis swizzles; reorientation is
 *   S3Projection's rotation knob.
 * - Roll-up Steps 1–4: reduce into the fundamental domain (both directions —
 *   fixing lifting-modp's admitted toFundamentalDomain bug), invert arc length
 *   L(v) = 2t, holonomy f(v) = ∫₀ᵛ sin²(φ/2)·θ′ (the paper's Step 3 with the
 *   squared sine — flagged erratum), return H₍θ,φ₎(s − f).
 *
 * Two precision tiers (DESIGN §5.3): Float64 tables + lerp for surface meshes;
 * spectral antiderivatives + Newton for data points (machine precision).
 */
import { Complex, Vec4, cross4 } from '@/math/core'

import { PeriodicInterpolant, invertMonotoneTable, lerpTable } from './interpolant'
import type { ProfileCurve } from './profile'

export interface HopfTorusOptions {
  /** Profile-curve samples promoted to the trig interpolant (accuracy knob). */
  samples?: number
  /** Cheap-tier table resolution. */
  table?: number
}

export interface RollUpOptions {
  /** Newton + spectral antiderivatives instead of table lerp (data points). */
  exact?: boolean
}

const TWO_PI = 2 * Math.PI

export class HopfTorus {
  /** L — length of the profile curve. */
  readonly length: number
  /** A — area enclosed on S² (= 2 × total holonomy). */
  readonly area: number
  /** [2π, A/2 + iL/2] — generators of Λ_Hopf. */
  readonly lattice: [Complex, Complex]

  private readonly thetaP: PeriodicInterpolant // periodic part of θ (winding 1)
  private readonly phi: PeriodicInterpolant
  private readonly arcIntegrand: PeriodicInterpolant // √(θ′² sin²φ + φ′²)
  private readonly holIntegrand: PeriodicInterpolant // sin²(φ/2)·θ′
  private readonly arcTable: Float64Array // L(v) at uniform v-nodes (exact per node)
  private readonly holTable: Float64Array // f(v) at uniform v-nodes

  constructor(curve: ProfileCurve, opts: HopfTorusOptions = {}) {
    const n = opts.samples ?? 512
    const tableSize = opts.table ?? 2048
    const pts = curve.sample(n)
    if (pts.length !== n) throw new Error(`ProfileCurve.sample(${n}) returned ${pts.length} points`)

    const thetaPeriodic = new Float64Array(n)
    const phiSamples = new Float64Array(n)
    for (let j = 0; j < n; j++) {
      const t = (TWO_PI * j) / n
      thetaPeriodic[j] = pts[j]!.theta - t
      phiSamples[j] = pts[j]!.phi
      if (!(pts[j]!.phi > 0 && pts[j]!.phi < Math.PI)) {
        throw new RangeError(`profile curve leaves the chart: φ(${t.toFixed(3)}) = ${pts[j]!.phi}`)
      }
    }
    this.thetaP = new PeriodicInterpolant(thetaPeriodic)
    this.phi = new PeriodicInterpolant(phiSamples)

    // Integrands sampled from the interpolant's exact derivatives, then
    // re-interpolated: their antiderivatives are the exact tier.
    const arc = new Float64Array(n)
    const hol = new Float64Array(n)
    for (let j = 0; j < n; j++) {
      const t = (TWO_PI * j) / n
      const dTheta = 1 + this.thetaP.derivative(t)
      const dPhi = this.phi.derivative(t)
      const phi = this.phi.value(t)
      const sinPhi = Math.sin(phi)
      const sinHalf = Math.sin(phi / 2)
      arc[j] = Math.sqrt(dTheta * dTheta * sinPhi * sinPhi + dPhi * dPhi)
      hol[j] = sinHalf * sinHalf * dTheta
    }
    this.arcIntegrand = new PeriodicInterpolant(arc)
    this.holIntegrand = new PeriodicInterpolant(hol)

    this.length = TWO_PI * this.arcIntegrand.mean // = ∫₀^{2π} arc dt, spectrally exact
    this.area = 2 * TWO_PI * this.holIntegrand.mean
    this.lattice = [new Complex(TWO_PI, 0), new Complex(this.area / 2, this.length / 2)]

    // Cheap-tier tables: the spectral antiderivative sampled at uniform nodes,
    // so node values are exact and only the lerp between nodes is approximate.
    this.arcTable = new Float64Array(tableSize + 1)
    this.holTable = new Float64Array(tableSize + 1)
    for (let i = 0; i <= tableSize; i++) {
      const v = (TWO_PI * i) / tableSize
      this.arcTable[i] = this.arcIntegrand.antiderivative(v)
      this.holTable[i] = this.holIntegrand.antiderivative(v)
    }
  }

  /** Arc length L(v) = ∫₀ᵛ √(θ′² sin²φ + φ′²), spectrally exact. */
  arcLength(v: number): number {
    return this.arcIntegrand.antiderivative(v)
  }

  /** Holonomy f(v) = ∫₀ᵛ sin²(φ/2)·θ′, spectrally exact. */
  holonomy(v: number): number {
    return this.holIntegrand.antiderivative(v)
  }

  /** The profile curve as interpolated: θ(v), φ(v). */
  profileAt(v: number): { theta: number; phi: number } {
    return { theta: v + this.thetaP.value(v), phi: this.phi.value(v) }
  }

  /**
   * Paper Steps 1–4: the isometry ℂ/Λ → S³. z = s + it in the flat coordinates
   * of Λ = 2πℤ ⊕ (A/2 + iL/2)ℤ.
   */
  rollUp(z: Complex, opts: RollUpOptions = {}): Vec4 {
    // Step 1 — reduce into the fundamental domain, both directions.
    const halfL = this.length / 2
    const halfA = this.area / 2
    const steps = Math.floor(z.im / halfL)
    let s = z.re - steps * halfA
    const t = z.im - steps * halfL
    s -= Math.floor(s / TWO_PI) * TWO_PI

    // Step 2 — v with L(v) = 2t.
    let v = invertMonotoneTable(this.arcTable, 2 * t, TWO_PI)
    if (opts.exact) {
      for (let iter = 0; iter < 4; iter++) {
        const err = this.arcIntegrand.antiderivative(v) - 2 * t
        if (Math.abs(err) < 1e-15 * this.length) break
        v -= err / this.arcIntegrand.value(v)
      }
    }

    // Step 3 — θ, φ, f.
    const { theta, phi } = this.profileAt(v)
    const f = opts.exact ? this.holIntegrand.antiderivative(v) : lerpTable(this.holTable, v, TWO_PI)

    // Step 4 — H₍θ,φ₎(s − f).
    return hopfFiberPoint(theta, phi, s - f)
  }

  /**
   * Whole-torus sampling by raw curve parameter: u ∈ [0, 1) around the fiber,
   * x ∈ [0, 1) along the curve. Same image as rollUp (fibers aligned via the
   * holonomy shift), but NOT arc-length parameterized in x.
   */
  surface(u: number, x: number): Vec4 {
    const v = TWO_PI * x
    const { theta, phi } = this.profileAt(v)
    const f = lerpTable(this.holTable, v, TWO_PI)
    return hopfFiberPoint(theta, phi, TWO_PI * u - f)
  }

  /** The Hopf circle over curve parameter x ∈ [0, 1), for tube rendering. */
  fiberAt(x: number): (s: number) => Vec4 {
    const v = TWO_PI * x
    const { theta, phi } = this.profileAt(v)
    const f = lerpTable(this.holTable, v, TWO_PI)
    return (s: number) => hopfFiberPoint(theta, phi, s - f)
  }

  /**
   * Everything the analytic surface frame needs at curve parameter v, computed
   * once per profile-curve column (O(samples)); framePoint then evaluates each
   * fiber row in closed form. Used by geometry's HopfTorusMesh (DESIGN §6:
   * normals are analytic, not finite-difference).
   */
  profileFrameAt(v: number): ProfileFrame {
    return {
      theta: v + this.thetaP.value(v),
      phi: this.phi.value(v),
      dTheta: 1 + this.thetaP.derivative(v),
      dPhi: this.phi.derivative(v),
      f: this.holIntegrand.antiderivative(v),
      fRate: this.holIntegrand.value(v),
    }
  }

  /** Position + unit surface normal in T_hS³ at (u, x) ∈ [0, 1)². */
  surfaceFrame(u: number, x: number): { point: Vec4; normal: Vec4 } {
    return framePoint(this.profileFrameAt(TWO_PI * x), TWO_PI * u)
  }
}

/** Profile-curve data at one parameter value, for closed-form frame evaluation. */
export interface ProfileFrame {
  theta: number
  phi: number
  dTheta: number
  dPhi: number
  /** Holonomy f(v). */
  f: number
  /** f′(v) = sin²(φ/2)·θ′. */
  fRate: number
}

/**
 * Closed-form surface point and unit normal at fiber coordinate s, given the
 * profile frame. Tangents: T₁ = ∂H/∂s (fiber direction) and
 * T₂ = θ′·∂H/∂θ + φ′·∂H/∂φ − f′·∂H/∂s; normal = cross4(h, T₁, T₂) normalized.
 */
export function framePoint(frame: ProfileFrame, s: number): { point: Vec4; normal: Vec4 } {
  const arg = s - frame.f
  const sinHalf = Math.sin(frame.phi / 2)
  const cosHalf = Math.cos(frame.phi / 2)
  const ca = Math.cos(frame.theta + arg)
  const sa = Math.sin(frame.theta + arg)
  const cs = Math.cos(arg)
  const ss = Math.sin(arg)
  const point = new Vec4(ca * sinHalf, sa * sinHalf, cs * cosHalf, ss * cosHalf)
  const dHds = new Vec4(-sa * sinHalf, ca * sinHalf, -ss * cosHalf, cs * cosHalf)
  const dHdTheta = new Vec4(-sa * sinHalf, ca * sinHalf, 0, 0)
  const dHdPhi = new Vec4((ca * cosHalf) / 2, (sa * cosHalf) / 2, (-cs * sinHalf) / 2, (-ss * sinHalf) / 2)
  const t2 = new Vec4(
    frame.dTheta * dHdTheta.x + frame.dPhi * dHdPhi.x - frame.fRate * dHds.x,
    frame.dTheta * dHdTheta.y + frame.dPhi * dHdPhi.y - frame.fRate * dHds.y,
    frame.dTheta * dHdTheta.z + frame.dPhi * dHdPhi.z - frame.fRate * dHds.z,
    frame.dTheta * dHdTheta.w + frame.dPhi * dHdPhi.w - frame.fRate * dHds.w,
  )
  return { point, normal: cross4(point, dHds, t2).normalize() }
}

/** H₍θ,φ₎(s) = (e^{i(θ+s)} sin(φ/2), e^{is} cos(φ/2)) in the fixed ℂ² ≅ ℝ⁴. */
export function hopfFiberPoint(theta: number, phi: number, s: number): Vec4 {
  const sinHalf = Math.sin(phi / 2)
  const cosHalf = Math.cos(phi / 2)
  return new Vec4(
    Math.cos(theta + s) * sinHalf,
    Math.sin(theta + s) * sinHalf,
    Math.cos(s) * cosHalf,
    Math.sin(s) * cosHalf,
  )
}
