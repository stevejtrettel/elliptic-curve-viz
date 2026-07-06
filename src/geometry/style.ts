/**
 * Style helpers: math structure → visual arrays (DESIGN.md §6). The ONLY place
 * where a point's arithmetic meaning becomes color or size. Arrays are parallel
 * to E.points() order — index alignment is the contract with PointCloud.
 */
import * as THREE from 'three'

import type { CurvePoints, TorusPoint } from '@/math/arithmetic'

/** The shared palette, seeded from lifting-modp's colors. */
export const PALETTES = {
  classic: [0xd43b3b, 0x4287f5, 0xe8ac2a, 0x43a33b, 0x7d46bd, 0xc25b2b, 0xcf48bf].map(
    (c) => new THREE.Color(c),
  ),
}

const DEFAULT = PALETTES.classic

/** Map key for a TorusPoint (exact integer coordinates). */
function pointKey(P: TorusPoint): string {
  return `${P.x},${P.y}`
}

function fill(colors: Float32Array, i: number, c: THREE.Color): void {
  colors[3 * i] = c.r
  colors[3 * i + 1] = c.g
  colors[3 * i + 2] = c.b
}

/** Color by field of definition: degree j ↦ palette[index of j among divisors of k]. */
export function colorByDegree(E: CurvePoints, palette = DEFAULT): Float32Array {
  const pts = E.points()
  const colors = new Float32Array(3 * pts.length)
  const degrees = [...new Set(pts.map((P) => E.degree(P)))].sort((a, b) => a - b)
  const index = new Map(degrees.map((d, i) => [d, i]))
  pts.forEach((P, i) => fill(colors, i, palette[index.get(E.degree(P))! % palette.length]!))
  return colors
}

/** Color by group-theoretic order (each distinct order gets a palette slot). */
export function colorByOrder(E: CurvePoints, palette = DEFAULT): Float32Array {
  const pts = E.points()
  const colors = new Float32Array(3 * pts.length)
  const orders = [...new Set(pts.map((P) => E.order(P)))].sort((a, b) => a - b)
  const index = new Map(orders.map((o, i) => [o, i]))
  pts.forEach((P, i) => fill(colors, i, palette[index.get(E.order(P))! % palette.length]!))
  return colors
}

/** Color by coset of ⟨g⟩: points on the same Cayley geodesic share a color. */
export function colorByCoset(E: CurvePoints, g: TorusPoint, palette = DEFAULT): Float32Array {
  const pts = E.points()
  const colors = new Float32Array(3 * pts.length)
  const slot = new Map<string, number>()
  E.cosets(g).forEach((coset, c) => {
    for (const P of coset) slot.set(pointKey(P), c)
  })
  pts.forEach((P, i) => fill(colors, i, palette[slot.get(pointKey(P))! % palette.length]!))
  return colors
}

/** Color by Frobenius orbit (palette cycles across orbits, one color per orbit). */
export function colorByOrbit(E: CurvePoints, palette = DEFAULT): Float32Array {
  const pts = E.points()
  const colors = new Float32Array(3 * pts.length)
  const slot = new Map<string, number>()
  E.orbits().forEach((orbit, o) => {
    for (const P of orbit.points) slot.set(pointKey(P), o)
  })
  pts.forEach((P, i) => fill(colors, i, palette[slot.get(pointKey(P))! % palette.length]!))
  return colors
}

/** One color for every point — the paper's per-discriminant coloring. */
export function uniformColors(count: number, hex: number): Float32Array {
  const c = new THREE.Color(hex)
  const colors = new Float32Array(3 * count)
  for (let i = 0; i < count; i++) fill(colors, i, c)
  return colors
}

/** Ω(n) — number of prime factors with multiplicity (subfield tower depth). */
function bigOmega(n: number): number {
  let m = n
  let count = 0
  for (let q = 2; q * q <= m; q++) {
    while (m % q === 0) {
      m /= q
      count++
    }
  }
  return m > 1 ? count + 1 : count
}

/**
 * Enlarge subfield points: size = boost^(tower depth of F_{p^deg} inside
 * F_{p^k}), so F_p points in the k = 6 picture get boost², the degree-2/3
 * layers boost¹, and generic degree-k points stay at 1.
 */
export function sizeByDegree(E: CurvePoints, opts: { subfieldBoost?: number } = {}): number[] {
  const boost = opts.subfieldBoost ?? 1.6
  return E.points().map((P) => Math.pow(boost, bigOmega(E.k / E.degree(P))))
}

/** Emphasize one Frobenius orbit: its points get `boost`, everything else 1. */
export function highlightOrbit(E: CurvePoints, P: TorusPoint, boost = 2): number[] {
  const inOrbit = new Set<string>()
  let Q = P
  do {
    inOrbit.add(pointKey(Q))
    Q = E.frobenius(Q)
  } while (Q.x !== P.x || Q.y !== P.y)
  return E.points().map((R) => (inOrbit.has(pointKey(R)) ? boost : 1))
}
