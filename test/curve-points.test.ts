import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  type CurveData,
  Mat2Z,
  type TorusPoint,
  discriminant,
  discriminantFactor,
  frobeniusMatrix,
  pointsOver,
  tauOf,
} from '@/math/arithmetic'

// ---------------------------------------------------------------------------
// Golden fixtures generated from ecfplat (scripts/gen-fixtures.py)
// ---------------------------------------------------------------------------

interface Fixture {
  qf: [number, number, number]
  ap: [number, number]
  sign: 1 | -1
  discQf: number
  discAp: number
  frobenius: [[number, number], [number, number]]
  levels: {
    k: number
    size: number
    structure: [number, number]
    generators: { point: [number, number]; order: number }[]
    points?: [number, number][]
  }[]
}

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ecfplat')
const fixtures: [name: string, fx: Fixture][] = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as Fixture])

function curveData(fx: Fixture): CurveData {
  return {
    form: { a: BigInt(fx.qf[0]), b: BigInt(fx.qf[1]), c: BigInt(fx.qf[2]) },
    trace: BigInt(fx.ap[0]),
    p: BigInt(fx.ap[1]),
    sign: fx.sign,
  }
}

/** |E(F_{p^k})| for k = 0..kMax via the trace recurrence a_k = a·a_{k−1} − p·a_{k−2}. */
function sizesByRecurrence(a: bigint, p: bigint, kMax: number): bigint[] {
  const ak = [2n, a]
  for (let k = 2; k <= kMax; k++) ak.push(a * ak[k - 1]! - p * ak[k - 2]!)
  return ak.map((t, k) => p ** BigInt(k) + 1n - t)
}

const keyOf = (P: TorusPoint) => `${P.x},${P.y}`
const pointSet = (pts: TorusPoint[]) => new Set(pts.map(keyOf))

// Keep the expensive whole-group walks (orbits, filtration) to tractable sizes.
const WALK_CAP = 25_000

describe('golden fixtures from ecfplat', () => {
  it('found the generated fixture battery', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(16)
  })

  it.each(fixtures)('%s', (_name, fx) => {
    const data = curveData(fx)
    const M = frobeniusMatrix(data)
    expect([
      [Number(M.a), Number(M.b)],
      [Number(M.c), Number(M.d)],
    ]).toEqual(fx.frobenius)

    for (const level of fx.levels) {
      const E = pointsOver(data, level.k)
      expect(E.size, `size at k=${level.k}`).toBe(level.size)
      expect(E.structure, `structure at k=${level.k}`).toEqual(level.structure)
      expect(E.N).toBe(level.structure[1])
      // Same subgroup of (Z/N)²: each ecfplat generator lies in ker(Mᵏ − I)
      // with its claimed order, and the group orders match.
      const Mk = M.pow(level.k).sub(Mat2Z.ID)
      const N = BigInt(E.N)
      for (const g of level.generators) {
        const P = { x: g.point[0], y: g.point[1] }
        const [u, v] = Mk.apply(BigInt(P.x), BigInt(P.y))
        expect(u % N, `generator in kernel at k=${level.k}`).toBe(0n)
        expect(v % N).toBe(0n)
        expect(E.order(P), `order of ecfplat generator at k=${level.k}`).toBe(g.order)
      }
      if (level.points) {
        const ours = pointSet(E.points())
        expect(ours.size, `distinct points at k=${level.k}`).toBe(level.size)
        const theirs = new Set(level.points.map(([x, y]) => `${x},${y}`))
        expect(ours, `point set at k=${level.k}`).toEqual(theirs)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Invariants, independent of the fixtures' numbers
// ---------------------------------------------------------------------------

const mobius = (n: number): number => {
  let m = n
  let mu = 1
  for (let q = 2; q * q <= m; q++) {
    if (m % q === 0) {
      m /= q
      if (m % q === 0) return 0
      mu = -mu
    }
  }
  if (m > 1) mu = -mu
  return mu
}

const divisors = (n: number) => Array.from({ length: n }, (_, i) => i + 1).filter((d) => n % d === 0)

describe('E(F_{p^k}) invariants', () => {
  it.each(fixtures)('%s: size recurrence and Weil bound n1 | p^k − 1', (_name, fx) => {
    const data = curveData(fx)
    const sizes = sizesByRecurrence(data.trace, data.p, 6)
    for (let k = 1; k <= 6; k++) {
      const E = pointsOver(data, k)
      expect(BigInt(E.size)).toBe(sizes[k])
      expect((data.p ** BigInt(k) - 1n) % BigInt(E.structure[0])).toBe(0n)
      expect(E.structure[1] % E.structure[0]).toBe(0)
    }
  })

  it.each(fixtures)('%s: group law, orders, Frobenius homomorphism', (_name, fx) => {
    const data = curveData(fx)
    const E = pointsOver(data, 4)
    const sample = [E.identity, ...E.generators]
    for (const g of E.generators) sample.push(E.mul(7, g), E.add(E.generators[0]!, g))
    for (const P of sample) {
      expect(E.add(P, E.neg(P))).toEqual(E.identity)
      expect(E.mul(E.order(P), P)).toEqual(E.identity)
      expect(E.size % E.order(P), 'order divides group order').toBe(0)
      for (const Q of sample) {
        expect(E.frobenius(E.add(P, Q))).toEqual(E.add(E.frobenius(P), E.frobenius(Q)))
      }
      // Frobenius^k fixes everything in E(F_{p^k}); degrees divide k
      let R = P
      for (let i = 0; i < 4; i++) R = E.frobenius(R)
      expect(R).toEqual(P)
      expect(4 % E.degree(P)).toBe(0)
    }
  })

  it.each(fixtures)('%s: Möbius degree census and orbit partition at k=6', (_name, fx) => {
    const data = curveData(fx)
    const sizes = sizesByRecurrence(data.trace, data.p, 6)
    if (sizes[6]! > BigInt(WALK_CAP)) return // whole-group walk too large; covered by smaller fixtures
    const E = pointsOver(data, 6)
    const orbits = E.orbits()
    // orbits partition the group
    expect(orbits.reduce((s, o) => s + o.points.length, 0)).toBe(E.size)
    const allKeys = new Set(orbits.flatMap((o) => o.points.map(keyOf)))
    expect(allKeys.size).toBe(E.size)
    // each orbit has |orbit| = degree of each of its points, dividing k
    for (const o of orbits.slice(0, 200)) {
      expect(o.degree).toBe(o.points.length)
      expect(6 % o.degree).toBe(0)
      expect(E.degree(o.points[0]!)).toBe(o.degree)
    }
    // Möbius: #{P : degree(P) = j} = Σ_{d|j} μ(j/d)·|E(F_{p^d})|
    const censusByDegree = new Map<number, number>()
    for (const o of orbits) censusByDegree.set(o.degree, (censusByDegree.get(o.degree) ?? 0) + o.points.length)
    for (const j of divisors(6)) {
      const expected = divisors(j).reduce((s, d) => s + mobius(j / d) * Number(sizes[d]!), 0)
      expect(censusByDegree.get(j) ?? 0, `degree-${j} census`).toBe(expected)
    }
  })

  it.each(fixtures)('%s: cosets of ⟨g⟩ partition the group into cycles of order(g)', (_name, fx) => {
    const data = curveData(fx)
    const E = pointsOver(data, 3)
    for (const g of [...E.generators, E.mul(2, E.generators[0]!), E.identity]) {
      const m = E.order(g)
      const cosets = E.cosets(g)
      expect(cosets.length).toBe(E.size / m)
      // partition: every point exactly once
      const all = pointSet(cosets.flat())
      expect(all.size).toBe(E.size)
      // cyclic order: consecutive entries differ by g, and the cycle closes
      for (const coset of cosets.slice(0, 50)) {
        expect(coset.length).toBe(m)
        for (let i = 0; i < m; i++) {
          expect(E.add(coset[i]!, g)).toEqual(coset[(i + 1) % m]!)
        }
      }
    }
  })

  it.each(fixtures)('%s: field-of-definition filtration matches pointsOver at each level', (_name, fx) => {
    const data = curveData(fx)
    const sizes = sizesByRecurrence(data.trace, data.p, 6)
    if (sizes[6]! > BigInt(WALK_CAP)) return
    const E6 = pointsOver(data, 6)
    for (const j of [1, 2, 3]) {
      const Ej = pointsOver(data, j)
      expect(E6.N % Ej.N, `N_${j} | N_6`).toBe(0)
      const scale = E6.N / Ej.N
      const embedded = pointSet(Ej.points().map((P) => ({ x: P.x * scale, y: P.y * scale })))
      const filtered = pointSet(E6.points().filter((P) => j % E6.degree(P) === 0))
      expect(filtered, `E(F_{p^${j}}) inside the k=6 picture`).toEqual(embedded)
    }
  })
})

// ---------------------------------------------------------------------------
// curve.ts unit behavior
// ---------------------------------------------------------------------------

describe('discriminants and τ', () => {
  it('discriminantFactor splits fundamental × conductor²', () => {
    expect(discriminantFactor(-3n)).toEqual({ fundamental: -3n, conductor: 1n })
    expect(discriminantFactor(-4n)).toEqual({ fundamental: -4n, conductor: 1n })
    expect(discriminantFactor(-8n)).toEqual({ fundamental: -8n, conductor: 1n })
    expect(discriminantFactor(-12n)).toEqual({ fundamental: -3n, conductor: 2n })
    expect(discriminantFactor(-20n)).toEqual({ fundamental: -20n, conductor: 1n })
    expect(discriminantFactor(-28n)).toEqual({ fundamental: -7n, conductor: 2n })
    expect(discriminantFactor(-36n)).toEqual({ fundamental: -4n, conductor: 3n })
    expect(discriminantFactor(-48n)).toEqual({ fundamental: -3n, conductor: 4n })
    expect(() => discriminantFactor(-5n)).toThrow(RangeError)
    expect(() => discriminantFactor(4n)).toThrow(RangeError)
  })

  it('tauOf solves aτ² + bτ + c = 0 in the upper half-plane', () => {
    for (const form of [
      { a: 1n, b: 0n, c: 2n },
      { a: 1n, b: 1n, c: 1n },
      { a: 2n, b: 2n, c: 3n },
    ]) {
      const tau = tauOf(form)
      expect(tau.im).toBeGreaterThan(0)
      const a = Number(form.a)
      const z = tau.mul(tau).scale(a).add(tau.scale(Number(form.b)))
      expect(z.re + Number(form.c)).toBeCloseTo(0, 10)
      expect(z.im).toBeCloseTo(0, 10)
      expect(discriminant(form) < 0n).toBe(true)
    }
  })

  it('frobeniusMatrix rejects incompatible form/trace pairs', () => {
    // disc(form) = −3 but trace²−4p = −8: different fundamental discriminants
    expect(() =>
      frobeniusMatrix({ form: { a: 1n, b: 1n, c: 1n }, trace: 2n, p: 3n, sign: 1 }),
    ).toThrow(/incompatible/)
  })

  it('frobeniusMatrix satisfies its own characteristic polynomial x² − a·x + p', () => {
    for (const [, fx] of fixtures) {
      const data = curveData(fx)
      const M = frobeniusMatrix(data)
      expect(M.trace()).toBe(data.trace)
      expect(M.det()).toBe(data.p)
      const charpoly = M.mul(M).sub(M.scale(data.trace)).add(Mat2Z.ID.scale(data.p))
      expect(charpoly.equals(Mat2Z.ZERO)).toBe(true)
    }
  })

  it('the two signs give conjugate Frobenii: M(+1) + M(−1) = a·I', () => {
    for (const [, fx] of fixtures) {
      const data = curveData(fx)
      const plus = frobeniusMatrix({ ...data, sign: 1 })
      const minus = frobeniusMatrix({ ...data, sign: -1 })
      expect(plus.add(minus).equals(Mat2Z.ID.scale(data.trace))).toBe(true)
      expect(plus.det()).toBe(minus.det())
    }
  })
})

describe('CurvePoints construction guards', () => {
  it('rejects k < 1 and non-integer k', () => {
    const data = curveData(fixtures[0]![1])
    expect(() => pointsOver(data, 0)).toThrow(RangeError)
    expect(() => pointsOver(data, 2.5)).toThrow(RangeError)
  })

  it('handles a trivial group: supersingular p=5, k=1, a=0 gives Z/1 × Z/6', () => {
    // |E(F_5)| = 5 + 1 − 0 = 6: never trivial, but structure is cyclic — generators.length = 1
    const fx = fixtures.find(([n]) => n === 'ss_p5_qf1_0_5_s1')![1]
    const E = pointsOver(curveData(fx), 1)
    expect(E.size).toBe(6)
    expect(E.generators.length).toBe(1)
    expect(E.points().length).toBe(6)
  })

  it('toComplex maps the identity to 0 and respects the lattice', () => {
    const fx = fixtures[0]![1]
    const E = pointsOver(curveData(fx), 2)
    expect(E.toComplex(E.identity).abs()).toBe(0)
    for (const g of E.generators) {
      const z = E.toComplex(g)
      expect(Number.isFinite(z.re) && Number.isFinite(z.im)).toBe(true)
      expect(z.im).toBeGreaterThanOrEqual(0)
    }
  })
})
