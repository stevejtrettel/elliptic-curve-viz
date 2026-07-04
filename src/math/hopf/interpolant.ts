/**
 * Trigonometric interpolation of smooth 2π-periodic functions from uniform
 * samples — the numerical engine behind DESIGN.md §5.3's precision strategy:
 * spectral accuracy for values, derivatives, and (crucially) antiderivatives,
 * so arc length L(v) and holonomy f(v) are exact to machine precision at
 * arbitrary v, not just at table nodes.
 *
 * Direct O(n²) DFT at construction; fine for n ≤ 1024 (FFT is a later
 * optimization, noted in the Phase 2 plan).
 */

export class PeriodicInterpolant {
  /** Mean value a₀ (the antiderivative's secular slope). */
  readonly mean: number
  private readonly a: Float64Array // cosine coefficients, k = 1..K (+ Nyquist last if n even)
  private readonly b: Float64Array // sine coefficients, k = 1..K (Nyquist slot unused, 0)
  private readonly K: number
  private readonly hasNyquist: boolean
  private readonly nyquistK: number

  constructor(samples: ArrayLike<number>) {
    const n = samples.length
    if (n < 2) throw new RangeError(`need at least 2 samples, got ${n}`)
    const K = Math.floor((n - 1) / 2)
    const hasNyquist = n % 2 === 0
    const a = new Float64Array(K + (hasNyquist ? 1 : 0))
    const b = new Float64Array(K + (hasNyquist ? 1 : 0))
    let mean = 0
    for (let j = 0; j < n; j++) mean += samples[j]!
    mean /= n
    const step = (2 * Math.PI) / n
    for (let k = 1; k <= K; k++) {
      let ak = 0
      let bk = 0
      for (let j = 0; j < n; j++) {
        const y = samples[j]!
        ak += y * Math.cos(k * j * step)
        bk += y * Math.sin(k * j * step)
      }
      a[k - 1] = (2 / n) * ak
      b[k - 1] = (2 / n) * bk
    }
    if (hasNyquist) {
      let aN = 0
      for (let j = 0; j < n; j++) aN += samples[j]! * (j % 2 === 0 ? 1 : -1)
      a[K] = aN / n
    }
    this.mean = mean
    this.a = a
    this.b = b
    this.K = K
    this.hasNyquist = hasNyquist
    this.nyquistK = n / 2
  }

  /** f(t). */
  value(t: number): number {
    let s = this.mean
    for (let k = 1; k <= this.K; k++) {
      s += this.a[k - 1]! * Math.cos(k * t) + this.b[k - 1]! * Math.sin(k * t)
    }
    if (this.hasNyquist) s += this.a[this.K]! * Math.cos(this.nyquistK * t)
    return s
  }

  /** f′(t). */
  derivative(t: number): number {
    let s = 0
    for (let k = 1; k <= this.K; k++) {
      s += k * (this.b[k - 1]! * Math.cos(k * t) - this.a[k - 1]! * Math.sin(k * t))
    }
    if (this.hasNyquist) s -= this.nyquistK * this.a[this.K]! * Math.sin(this.nyquistK * t)
    return s
  }

  /**
   * F(t) = ∫₀ᵗ f, evaluated spectrally: mean·t plus the periodic part with
   * Fourier coefficients divided by k. F(t + 2π) = F(t) + 2π·mean.
   */
  antiderivative(t: number): number {
    let s = this.mean * t
    for (let k = 1; k <= this.K; k++) {
      s += (this.a[k - 1]! * Math.sin(k * t) + this.b[k - 1]! * (1 - Math.cos(k * t))) / k
    }
    if (this.hasNyquist) s += (this.a[this.K]! * Math.sin(this.nyquistK * t)) / this.nyquistK
    return s
  }
}

/**
 * Invert a strictly increasing table over uniform parameters [0, tMax]:
 * find t with table(t) = value, by binary search + linear interpolation
 * (port of threejs-demos HopfTorus.inverseArc).
 */
export function invertMonotoneTable(table: Float64Array, value: number, tMax: number): number {
  const n = table.length - 1
  if (value <= table[0]!) return 0
  if (value >= table[n]!) return tMax
  let lo = 0
  let hi = n
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (table[mid]! <= value) lo = mid
    else hi = mid
  }
  const frac = (value - table[lo]!) / (table[hi]! - table[lo]!)
  return ((lo + frac) / n) * tMax
}

/** Linear interpolation into a uniform table over [0, tMax] (port of lerpTable). */
export function lerpTable(table: Float64Array, t: number, tMax: number): number {
  const n = table.length - 1
  const x = (t / tMax) * n
  const i = Math.max(0, Math.min(n - 1, Math.floor(x)))
  const frac = x - i
  return table[i]! * (1 - frac) + table[i + 1]! * frac
}
