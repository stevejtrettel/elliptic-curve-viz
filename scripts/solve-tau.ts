/**
 * Phase 2 deliverable (DESIGN.md §11): the programmatic replacement of every
 * hand-written tau.js, in one screen. For each fixture curve: reduce τ, run
 * the solver, print the candidate table with the matchLattices homothety.
 *
 * Run: npm run solve
 */
import { type CurveData, discriminant, tauOf } from '@/math/arithmetic'
import { type Candidate, solveProfileCurve } from '@/math/families'
import { LatitudeCircle, WavyCircle } from '@/math/hopf'
import { Lattice, matchLattices } from '@/math/lattice'

const battery: { label: string; data: CurveData }[] = [
  { label: 'disc −3 · hexagonal (legacy data/-3/tau.js)', data: c(1, 1, 1, 5, 7) },
  { label: 'disc −4 · square', data: c(1, 0, 1, 4, 5) },
  { label: 'disc −7', data: c(1, 1, 2, 4, 11) },
  { label: 'disc −8 · rectangular (legacy data/-8/tau.js)', data: c(1, 0, 2, 6, 11) },
  { label: 'disc −11', data: c(1, 1, 3, 3, 5) },
  { label: 'disc −20 · form (1,0,5)', data: c(1, 0, 5, 12, 41) },
  { label: 'disc −20 · form (2,2,3)', data: c(2, 2, 3, 12, 41) },
  { label: 'disc −28 · form (1,0,7)', data: c(1, 0, 7, 4, 11) },
]

function c(a: number, b: number, cc: number, trace: number, p: number): CurveData {
  return {
    form: { a: BigInt(a), b: BigInt(b), c: BigInt(cc) },
    trace: BigInt(trace),
    p: BigInt(p),
    sign: 1,
  }
}

function describeCurve(cand: Candidate): string {
  if (cand.curve instanceof LatitudeCircle) return `latitude φ₀=${cand.curve.phi0.toFixed(6)}`
  if (cand.curve instanceof WavyCircle) {
    const w = cand.curve
    return `wavy φ₀=${w.phi0.toFixed(4)} b=${w.b.toFixed(6)} n=${w.n}${w.skew ? ` skew=${w.skew}` : ''}`
  }
  return 'discrete'
}

for (const { label, data } of battery) {
  const tau = tauOf(data.form)
  const reduced = new Lattice(tau).reduce().tau
  console.log(`\n━━ ${label} ━━`)
  console.log(
    `   form (${data.form.a}, ${data.form.b}, ${data.form.c})  disc ${discriminant(data.form)}  ` +
      `τ = ${tau.re.toFixed(6)} + ${tau.im.toFixed(6)}i  (reduced: ${reduced.re.toFixed(6)} + ${reduced.im.toFixed(6)}i)`,
  )
  const candidates = solveProfileCurve(tau)
  if (candidates.length === 0) {
    console.log('   (no candidates — enumeration bound too small?)')
    continue
  }
  console.log('   #  stratum    A/π        L/π        flip  residual   curve                                        λ (r∠°)')
  candidates.forEach((cand, i) => {
    let lambdaStr = '(flip: conjugate match, Phase 3)'
    if (!cand.rep.flip) {
      const { lambda } = matchLattices(tau, cand.achieved.A, cand.achieved.L)
      lambdaStr = `${lambda.abs().toFixed(6)} ∠ ${((lambda.arg() * 180) / Math.PI).toFixed(2)}°`
    }
    console.log(
      `   ${i}  ${cand.stratum.padEnd(9)} ${(cand.achieved.A / Math.PI).toFixed(6).padStart(9)}  ` +
        `${(cand.achieved.L / Math.PI).toFixed(6).padStart(9)}  ${cand.rep.flip ? 'yes ' : 'no  '}  ` +
        `${cand.residual.toExponential(1)}   ${describeCurve(cand).padEnd(44)} ${lambdaStr}`,
    )
  })
}

console.log()
