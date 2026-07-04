/**
 * Phase 1 deliverable (DESIGN.md §11): a readable listing of E(F_{p^k}) with
 * group structure, generators, and the degree/orbit census (the ζ_E picture)
 * for the fixture battery — the same curves golden-tested against ecfplat.
 *
 * Run: npm run points          (all curves, k ≤ 6)
 *      npm run points -- 4     (k ≤ 4)
 */
import {
  type CurveData,
  discriminant,
  frobeniusMatrix,
  pointsOver,
  tauOf,
} from '@/math/arithmetic'

const CENSUS_CAP = 25_000 // walk orbits only when the whole group fits comfortably

interface Entry {
  label: string
  data: CurveData
}

const battery: Entry[] = [
  { label: 'disc −3 · hexagonal', data: c(1, 1, 1, 5, 7) },
  { label: 'disc −4 · square', data: c(1, 0, 1, 4, 5) },
  { label: 'disc −7 (via conductor 2 at p = 11)', data: c(1, 1, 2, 4, 11) },
  { label: 'disc −28 = −7·2²', data: c(1, 0, 7, 4, 11) },
  { label: 'disc −8 · rectangular (the paper’s example)', data: c(1, 0, 2, 6, 11) },
  { label: 'disc −11', data: c(1, 1, 3, 3, 5) },
  { label: 'disc −20 · class number 2, form (1,0,5)', data: c(1, 0, 5, 12, 41) },
  { label: 'disc −20 · class number 2, form (2,2,3)', data: c(2, 2, 3, 12, 41) },
  { label: 'supersingular p = 5, form (1,0,5)', data: c(1, 0, 5, 0, 5) },
  { label: 'supersingular p = 7, form (1,1,2)', data: c(1, 1, 2, 0, 7) },
]

function c(a: number, b: number, cc: number, trace: number, p: number): CurveData {
  return {
    form: { a: BigInt(a), b: BigInt(b), c: BigInt(cc) },
    trace: BigInt(trace),
    p: BigInt(p),
    sign: 1,
  }
}

function sizes(trace: bigint, p: bigint, kMax: number): bigint[] {
  const ak = [2n, trace]
  for (let k = 2; k <= kMax; k++) ak.push(trace * ak[k - 1]! - p * ak[k - 2]!)
  return ak.map((t, k) => p ** BigInt(k) + 1n - t)
}

const kMax = Math.max(1, Math.min(10, Number(process.argv[2] ?? 6)))

for (const { label, data } of battery) {
  const { form, trace, p } = data
  const tau = tauOf(form)
  const M = frobeniusMatrix(data)
  console.log(`\n━━ ${label} ━━`)
  console.log(
    `   form (${form.a}, ${form.b}, ${form.c})  disc ${discriminant(form)}  ` +
      `Frobenius trace ${trace} over F_${p}  τ ≈ ${tau.re.toFixed(4)} + ${tau.im.toFixed(4)}i`,
  )
  console.log(`   M = ((${M.a}, ${M.b}), (${M.c}, ${M.d}))   det ${M.det()} = p, tr ${M.trace()} = a`)
  console.log('    k  |E(F_{p^k})|      structure            N      degree census (points per exact degree)')
  const sz = sizes(trace, p, kMax)
  for (let k = 1; k <= kMax; k++) {
    if (sz[k]! >= 2n ** 53n) {
      console.log(`   ${String(k).padStart(2)}  ${String(sz[k]).padStart(12)}  (beyond 2^53 — skipped)`)
      continue
    }
    const E = pointsOver(data, k)
    const structure = E.structure[0] === 1 ? `Z/${E.structure[1]}` : `Z/${E.structure[0]} × Z/${E.structure[1]}`
    let census = ''
    if (E.size <= CENSUS_CAP) {
      const byDegree = new Map<number, number>()
      for (const o of E.orbits()) byDegree.set(o.degree, (byDegree.get(o.degree) ?? 0) + o.points.length)
      census = [...byDegree.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([j, n]) => `deg ${j}: ${n}`)
        .join('   ')
    } else {
      census = '(too large to walk)'
    }
    console.log(
      `   ${String(k).padStart(2)}  ${String(E.size).padStart(12)}  ${structure.padEnd(19)} ${String(E.N).padStart(6)}   ${census}`,
    )
  }
  const gens = pointsOver(data, Math.min(kMax, 3))
  const gensStr = gens.generators.map((g) => `(${g.x}, ${g.y})/${gens.N}`).join(', ')
  console.log(`   generators of E(F_{p^${Math.min(kMax, 3)}}): ${gensStr || '(trivial)'}   [coords: (x + yτ)/N]`)
}

console.log()
