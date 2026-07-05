/**
 * Curve descriptors — the JSON handoff contract with ecfplat (DESIGN.md §8).
 * Per curve, five integers: quadratic form (a,b,c), trace, p (+sign, and
 * optionally the Weierstrass equation y² = x³ + fx + g for labeling). The
 * j ↔ (a,b,c) bijection runs Python-side; everything downstream of these
 * integers — Frobenius, E(F_{p^k}), τ, the torus — is computed here, exactly.
 */
import type { CurveData } from '@/math/arithmetic'

/** How the paper presents this curve (lifting-modp hand-tuned values). */
export interface PaperStyle {
  /** Legacy wavy profile φ=π/2+a·b·cos(nt), θ=t+a·sin(2nt); omitted = solver default. */
  profile?: { a: number; b: number; n: number }
  /** The discriminant's color in the paper. */
  color?: number
  /** Hand-tuned base point radius per field extension k. */
  radiusByK?: Record<number, number>
  surface?: 'opaque' | 'glass'
}

export interface LabeledCurve {
  label: string
  data: CurveData
  paper?: PaperStyle
}

/** Generated label for descriptor/raw data without one: form, prime, trace. */
export function describeCurve(data: CurveData): string {
  const { a, b, c } = data.form
  return `form (${a},${b},${c}) · p=${data.p} · a=${data.trace}`
}

/**
 * Parse and validate a JSON array of curve descriptors. Bigint fields accept
 * JSON numbers or strings (for primes beyond 2⁵³). Throws with the offending
 * index and field on any malformed or mathematically inconsistent entry.
 */
export function parseCurveDescriptors(json: unknown): LabeledCurve[] {
  if (!Array.isArray(json)) throw new Error('curve descriptors: expected a JSON array')
  return json.map((entry, i) => parseDescriptor(entry, i))
}

function parseDescriptor(entry: unknown, i: number): LabeledCurve {
  const at = `descriptor[${i}]`
  if (typeof entry !== 'object' || entry === null) throw new Error(`${at}: expected an object`)
  const rec = entry as Record<string, unknown>

  const p = toBigInt(rec['p'], `${at}.p`)
  const trace = toBigInt(rec['trace'], `${at}.trace`)
  const sign = rec['sign'] === undefined ? 1 : rec['sign']
  if (sign !== 1 && sign !== -1) throw new Error(`${at}.sign: expected 1 or -1`)

  const formRec = rec['form']
  if (typeof formRec !== 'object' || formRec === null) throw new Error(`${at}.form: expected {a, b, c}`)
  const f = formRec as Record<string, unknown>
  const form = {
    a: toBigInt(f['a'], `${at}.form.a`),
    b: toBigInt(f['b'], `${at}.form.b`),
    c: toBigInt(f['c'], `${at}.form.c`),
  }

  // consistency: disc(form) < 0, Hasse |a| ≤ 2√p, and a² − 4p = disc·f² (conductor f ∈ ℤ)
  const disc = form.b * form.b - 4n * form.a * form.c
  const frob = trace * trace - 4n * p
  if (disc >= 0n) throw new Error(`${at}: form discriminant b²−4ac = ${disc} must be negative`)
  if (Number(trace) * Number(trace) > 4 * Number(p)) {
    throw new Error(`${at}: Hasse bound violated — trace² = ${trace * trace} exceeds 4p = ${4n * p}`)
  }
  if (frob % disc !== 0n || !isPerfectSquare(frob / disc)) {
    throw new Error(
      `${at}: trace²−4p = ${frob} is not disc(form)·f² for any integer conductor f (disc = ${disc})`,
    )
  }

  let equation: { f: bigint; g: bigint } | undefined
  const eq = rec['equation']
  if (eq !== undefined) {
    if (typeof eq !== 'object' || eq === null) throw new Error(`${at}.equation: expected {f, g}`)
    const e = eq as Record<string, unknown>
    equation = { f: toBigInt(e['f'], `${at}.equation.f`), g: toBigInt(e['g'], `${at}.equation.g`) }
  }

  const data: CurveData = { form, trace, p, sign, ...(equation ? { equation } : {}) }
  const label = rec['label']
  if (label !== undefined && typeof label !== 'string') throw new Error(`${at}.label: expected a string`)
  const paper = parsePaper(rec['paper'], at)
  return { label: label ?? describeCurve(data), data, ...(paper ? { paper } : {}) }
}

/**
 * Parse a standalone presentation map: curve label → PaperStyle. This is the
 * RENDERER-side file (our aesthetics: profile parameters, colors, radii) —
 * deliberately separate from the arithmetic descriptors ecfplat exports.
 */
export function parsePresentation(json: unknown): Record<string, PaperStyle> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('presentation: expected an object mapping curve label → style')
  }
  const out: Record<string, PaperStyle> = {}
  for (const [label, raw] of Object.entries(json)) {
    const p = parsePaper(raw, `presentation["${label}"]`)
    if (p) out[label] = p
  }
  return out
}

function parsePaper(raw: unknown, at: string): PaperStyle | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'object' || raw === null) throw new Error(`${at}.paper: expected an object`)
  const rec = raw as Record<string, unknown>
  const paper: PaperStyle = {}
  if (rec['profile'] !== undefined) {
    const p = rec['profile'] as Record<string, unknown>
    const prof = { a: Number(p['a']), b: Number(p['b']), n: Number(p['n']) }
    if (![prof.a, prof.b, prof.n].every(Number.isFinite)) throw new Error(`${at}.paper.profile: expected {a, b, n}`)
    paper.profile = prof
  }
  if (rec['color'] !== undefined) {
    const c = typeof rec['color'] === 'number' ? rec['color'] : parseInt(String(rec['color']).replace(/^0x/, ''), 16)
    if (!Number.isInteger(c) || c < 0) throw new Error(`${at}.paper.color: expected a hex color`)
    paper.color = c
  }
  if (rec['radiusByK'] !== undefined) {
    const table: Record<number, number> = {}
    for (const [k, r] of Object.entries(rec['radiusByK'] as Record<string, unknown>)) {
      const kk = Number(k)
      const rr = Number(r)
      if (!Number.isInteger(kk) || !Number.isFinite(rr)) throw new Error(`${at}.paper.radiusByK: integer k → radius`)
      table[kk] = rr
    }
    paper.radiusByK = table
  }
  if (rec['surface'] !== undefined) {
    if (rec['surface'] !== 'opaque' && rec['surface'] !== 'glass') throw new Error(`${at}.paper.surface: opaque|glass`)
    paper.surface = rec['surface']
  }
  return paper
}

function toBigInt(v: unknown, at: string): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v)
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v)
  throw new Error(`${at}: expected an integer (number or decimal string), got ${JSON.stringify(v)}`)
}

function isPerfectSquare(q: bigint): boolean {
  if (q < 0n) return false
  const r = BigInt(Math.round(Math.sqrt(Number(q))))
  return r * r === q
}
