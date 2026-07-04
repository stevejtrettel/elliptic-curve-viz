/**
 * Curve data and the Frobenius matrix (DESIGN.md §5.1).
 *
 * A curve y² = x³ + fx + g over F_p arrives (via ecfplat's Deuring lift) as a
 * positive-definite binary quadratic form (a, b, c) of discriminant b² − 4ac,
 * together with the Frobenius trace. Frobenius acts on the lattice Λ = ℤ ⊕ τℤ,
 * τ = (−b + √d)/(2a), as multiplication by the root of x² − (trace)·x + p whose
 * imaginary part has sign `sign`; this file computes that action as an integer
 * matrix on the ordered basis {1, τ} (ecfplat's qf_ap_FrMat).
 */
import { Complex, mod } from '@/math/core'

import { Mat2Z } from './mat2z'

/** Positive-definite binary quadratic form ax² + bxy + cy², disc = b² − 4ac < 0. */
export interface QuadraticForm {
  a: bigint
  b: bigint
  c: bigint
}

/** What io/ produces and everything downstream consumes (DESIGN.md §5.1). */
export interface CurveData {
  form: QuadraticForm
  /** Trace of Frobenius. */
  trace: bigint
  p: bigint
  /** Choice of Frobenius root: sign of its imaginary part. */
  sign: 1 | -1
  /** y² = x³ + fx + g, for labeling and the F_p×F_p view. */
  equation?: { f: bigint; g: bigint }
}

/** b² − 4ac. */
export function discriminant(form: QuadraticForm): bigint {
  return form.b * form.b - 4n * form.a * form.c
}

/**
 * τ = (−b + √d)/(2a) ∈ upper half-plane — the root of aτ² + bτ + c = 0.
 * Floats begin here; keep everything upstream on the exact form.
 */
export function tauOf(form: QuadraticForm): Complex {
  const d = discriminant(form)
  if (d >= 0n) throw new RangeError(`form must be definite: disc = ${d} ≥ 0`)
  const twoA = 2 * Number(form.a)
  return new Complex(-Number(form.b) / twoA, Math.sqrt(-Number(d)) / twoA)
}

/**
 * Factor a discriminant (d < 0, d ≡ 0 or 1 mod 4) as d = d₀·f² with d₀
 * fundamental. Trial division — discriminants here are small.
 */
export function discriminantFactor(d: bigint): { fundamental: bigint; conductor: bigint } {
  if (d >= 0n || (mod(d, 4n) !== 0n && mod(d, 4n) !== 1n)) {
    throw new RangeError(`not a negative discriminant: ${d}`)
  }
  // squarefree decomposition |d| = (squarefree)·k²
  let rest = -d
  let k = 1n
  for (let q = 2n; q * q <= rest; q++) {
    while (rest % (q * q) === 0n) {
      rest /= q * q
      k *= q
    }
  }
  const m = -rest // squarefree part, negative
  if (mod(m, 4n) === 1n) return { fundamental: m, conductor: k }
  // m ≡ 2, 3 (mod 4): fundamental disc is 4m, and k must be even since 4 | d
  return { fundamental: 4n * m, conductor: k / 2n }
}

/** Multiplication by a·τ on the basis {1, τ}: τ·(a·τ) = −b·τ − c (ecfplat qf_to_ERGM_1T). */
function generatorMatrix(form: QuadraticForm): Mat2Z {
  return new Mat2Z(0n, -form.c, form.a, -form.b)
}

/**
 * The Frobenius matrix M on the ordered basis {1, τ} of the form's lattice:
 * multiplication by the root of x² − (trace)·x + p with im-part sign `sign`.
 * Port of ecfplat qf_ap_FrMat (ecqf_tools.py:363). The form's discriminant may
 * sit at a smaller conductor than trace² − 4p; the ratio scales the τ-part.
 */
export function frobeniusMatrix(data: CurveData): Mat2Z {
  const { form, trace, p, sign } = data
  const dForm = discriminantFactor(discriminant(form))
  const dFrob = discriminantFactor(trace * trace - 4n * p)
  if (dForm.fundamental !== dFrob.fundamental || dFrob.conductor % dForm.conductor !== 0n) {
    throw new RangeError(
      `incompatible form: disc ${discriminant(form)} vs trace²−4p = ${trace * trace - 4n * p}`,
    )
  }
  const tauScalar = BigInt(sign) * (dFrob.conductor / dForm.conductor)
  const G = generatorMatrix(form)
  const traceDiff = trace - tauScalar * G.trace()
  if (mod(traceDiff, 2n) !== 0n) throw new RangeError('non-integral Frobenius: trace parity mismatch')
  const M = Mat2Z.ID.scale(traceDiff / 2n).add(G.scale(tauScalar))
  const t = M.trace()
  if (t !== trace && t !== -trace) throw new Error('Frobenius construction failed the trace check')
  return t === trace ? M : M.neg()
}
