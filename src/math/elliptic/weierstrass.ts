/**
 * Weierstrass ℘ and ℘′ for the normalized lattice Λ = ℤ + τℤ, via Jacobi θ₁.
 *
 * The identity used is
 *
 *   ℘(z) = −d²/dz² log θ₁(πz | τ) − c,   c = (π²/3)·E₂(τ),
 *
 * expanded through the first three derivatives of θ₁ so both ℘ and ℘′ come
 * from one pass. Convergence is exponential in Im(τ); ~12 terms is plenty in
 * the fundamental domain. We work in the normalized lattice (ω₁ = 1), so the
 * caller passes z already in coordinates z = a·1 + b·τ.
 *
 * PURE (DESIGN.md §4): depends only on math/core. Adapted from the
 * threejs-demos `lattices/weierstrass.ts`.
 */
import { Complex } from '@/math/core'

export interface WP {
  p: Complex // ℘(z)
  dp: Complex // ℘′(z)
}

/** e^{re + i·im}. */
function cexp(re: number, im: number): Complex {
  return Complex.fromPolar(Math.exp(re), im)
}

/** Sum of divisors σ₁(n). */
function sigma1(n: number): number {
  let s = 0
  for (let d = 1; d * d <= n; d++) {
    if (n % d === 0) {
      s += d
      const o = n / d
      if (o !== d) s += o
    }
  }
  return s
}

/** q_τ^a = e^{iπτ·a}. */
function qpow(a: number, tau: Complex): Complex {
  return cexp(-Math.PI * a * tau.im, Math.PI * a * tau.re)
}

/** sin of a complex argument. */
function csin(w: Complex): Complex {
  const eiw = cexp(-w.im, w.re)
  const emiw = cexp(w.im, -w.re)
  const diff = eiw.sub(emiw) // eiw − emiw
  return new Complex(diff.im / 2, -diff.re / 2) // ÷ (2i)
}

/** cos of a complex argument. */
function ccos(w: Complex): Complex {
  const eiw = cexp(-w.im, w.re)
  const emiw = cexp(w.im, -w.re)
  return eiw.add(emiw).scale(0.5)
}

interface ThetaSpec {
  coeff: (sign: number, k: number) => number
  trig: (w: Complex) => Complex
}

// θ₁(v) and its first three v-derivatives share the shape
//   Σ coeff(sign,k)·q^{(n+1/2)²}·trig(k·v),   k = 2n+1, sign = (−1)ⁿ.
const THETA1: ThetaSpec = { coeff: (s) => 2 * s, trig: csin }
const THETA1_D1: ThetaSpec = { coeff: (s, k) => 2 * s * k, trig: ccos }
const THETA1_D2: ThetaSpec = { coeff: (s, k) => -2 * s * k * k, trig: csin }
const THETA1_D3: ThetaSpec = { coeff: (s, k) => -2 * s * k * k * k, trig: ccos }

function thetaEval(v: Complex, tau: Complex, terms: number, spec: ThetaSpec): Complex {
  let result = Complex.ZERO
  for (let n = 0; n < terms; n++) {
    const sign = n % 2 === 0 ? 1 : -1
    const k = 2 * n + 1
    const qt = qpow((n + 0.5) * (n + 0.5), tau)
    const trig = spec.trig(v.scale(k))
    result = result.add(qt.mul(trig).scale(spec.coeff(sign, k)))
  }
  return result
}

/** Number of series terms giving ~double precision for a given τ. */
export function termsFor(tau: Complex): number {
  return Math.max(12, Math.ceil(8 / Math.max(0.05, tau.im)))
}

/**
 * ℘(z), ℘′(z) for Λ = ℤ + τℤ. `z` is in lattice coordinates a·1 + b·τ.
 */
export function weierstrassP(z: Complex, tau: Complex, terms = termsFor(tau)): WP {
  const pi = Math.PI
  const pi2 = pi * pi
  const pi3 = pi2 * pi

  const v = z.scale(pi)
  const f = thetaEval(v, tau, terms, THETA1)
  const f1 = thetaEval(v, tau, terms, THETA1_D1)
  const f2 = thetaEval(v, tau, terms, THETA1_D2)
  const f3 = thetaEval(v, tau, terms, THETA1_D3)

  const fSq = f.mul(f)
  const fSqInv = Complex.ONE.div(fSq)
  const fCuInv = Complex.ONE.div(fSq.mul(f))

  // E₂(τ) = 1 − 24 Σ σ₁(n) qⁿ,  q = e^{2πiτ}
  const q = cexp(-2 * pi * tau.im, 2 * pi * tau.re)
  let e2 = Complex.ONE
  let qn = q
  for (let n = 1; n <= terms; n++) {
    e2 = e2.sub(qn.scale(24 * sigma1(n)))
    qn = qn.mul(q)
  }
  // Additive constant fixing the Laurent expansion ℘ = z⁻² + O(z²) (no constant
  // term): ℘ = −d²/dz² log θ₁(πz) − (π²/3)E₂(τ). Verified against e₁+e₂+e₃ = 0.
  const c = e2.scale(pi2 / 3)

  // ℘ = −π²·(f''f − f'²)/f² − c
  const p = f2.mul(f).sub(f1.mul(f1)).mul(fSqInv).scale(-pi2).sub(c)

  // ℘' = −π³·(f'''f² − 3f''f'f + 2f'³)/f³
  const numDP = f3.mul(fSq).sub(f2.mul(f1).mul(f).scale(3)).add(f1.mul(f1).mul(f1).scale(2))
  const dp = numDP.mul(fCuInv).scale(-pi3)

  return { p, dp }
}
