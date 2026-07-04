/**
 * Paper Step 5, kept separate so the same S³ scene admits different
 * projections (DESIGN.md §5.3): an optional ρ ∈ SO(4) (unit-quaternion pair —
 * the artistic knob that replaces every legacy axis swizzle), then
 * stereographic projection σ from a chosen pole (default the paper's
 * σ(x, y, z, w) = (x, y, z)/(1 − w), pole at w = 1).
 */
import { Quaternion, Vec3, Vec4, rotateS3 } from '@/math/core'

const E_W = new Vec4(0, 0, 0, 1)

export class S3Projection {
  private p: Quaternion = Quaternion.ONE
  private q: Quaternion = Quaternion.ONE
  private _pole: Vec4 = E_W
  /** Rotation aligning pole → e_w, precomputed when the pole is set. */
  private alignPole: ((x: Vec4) => Vec4) | null = null

  get rotation(): [Quaternion, Quaternion] {
    return [this.p, this.q]
  }

  /** ρ(x) = p·x·q̄; the pair is normalized on assignment. */
  set rotation([p, q]: [Quaternion, Quaternion]) {
    this.p = p.normalize()
    this.q = q.normalize()
  }

  get pole(): Vec4 {
    return this._pole
  }

  set pole(v: Vec4) {
    const u = v.normalize()
    this._pole = u
    const c = u.dot(E_W)
    if (c > 1 - 1e-15) {
      this.alignPole = null // default pole: no extra rotation
    } else if (c < -1 + 1e-15) {
      // antipodal: rotate by π in the z–w plane
      this.alignPole = (x) => new Vec4(x.x, x.y, -x.z, -x.w)
    } else {
      // the rotation taking u → e_w, identity on the orthogonal complement:
      // R(x) = x − (⟨x,u⟩ + ⟨x,e⟩)/(1 + ⟨u,e⟩)·(u + e) + 2⟨x,u⟩·e
      const sum = u.add(E_W)
      this.alignPole = (x) => {
        const xu = x.dot(u)
        const xe = x.w
        return x.sub(sum.scale((xu + xe) / (1 + c))).add(E_W.scale(2 * xu))
      }
    }
  }

  /** ρ then the pole-alignment rotation: the S³ point actually fed to σ. */
  private orient(x: Vec4): Vec4 {
    const r = rotateS3(this.p, this.q, x)
    return this.alignPole ? this.alignPole(r) : r
  }

  /** σ(ρx) ∈ ℝ³. Points at the pole map to large finite values (1e12 clamp). */
  project(x: Vec4): Vec3 {
    const h = this.orient(x)
    const denom = 1 - h.w
    if (Math.abs(denom) < 1e-12) {
      const s = 1e12
      return new Vec3(h.x * s, h.y * s, h.z * s)
    }
    return new Vec3(h.x / denom, h.y / denom, h.z / denom)
  }

  /**
   * The conformal compensation 1 + |σ(ρx)|² (= 2/(1 − w′) on the unit sphere),
   * used for projection-corrected point radii and tube widths (DESIGN §6).
   */
  scaleFactor(x: Vec4): number {
    const h = this.orient(x)
    const denom = 1 - h.w
    if (Math.abs(denom) < 1e-12) return 2e12
    return 2 / denom
  }
}
