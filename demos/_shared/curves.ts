/**
 * The demo curve battery — the same curves fixture-tested against ecfplat
 * (single source; scripts/*.ts keep their own copies for CLI independence).
 */
import type { CurveData } from '@/math/arithmetic'

export interface LabeledCurve {
  label: string
  data: CurveData
}

function c(a: number, b: number, cc: number, trace: number, p: number): CurveData {
  return {
    form: { a: BigInt(a), b: BigInt(b), c: BigInt(cc) },
    trace: BigInt(trace),
    p: BigInt(p),
    sign: 1,
  }
}

export const CURVES: LabeledCurve[] = [
  { label: 'disc −8 · rectangular (paper example)', data: c(1, 0, 2, 6, 11) },
  { label: 'disc −3 · hexagonal', data: c(1, 1, 1, 5, 7) },
  { label: 'disc −4 · square', data: c(1, 0, 1, 4, 5) },
  { label: 'disc −7', data: c(1, 1, 2, 4, 11) },
  { label: 'disc −11', data: c(1, 1, 3, 3, 5) },
  { label: 'disc −20 · form (1,0,5)', data: c(1, 0, 5, 12, 41) },
  { label: 'disc −20 · form (2,2,3)', data: c(2, 2, 3, 12, 41) },
  { label: 'disc −28 = −7·2²', data: c(1, 0, 7, 4, 11) },
]
