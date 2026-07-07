/**
 * The curve catalog: data/curves.json parsed through the descriptor contract
 * (single source — grow the battery by editing the JSON), plus resolveCurve,
 * which turns any author-facing curve reference (index, label, raw data)
 * into a LabeledCurve.
 */
import type { CurveData } from '@/math/arithmetic'

import { type LabeledCurve, describeCurve, parseCurveDescriptors } from '@/io'

import rawCurves from '../../data/curves.json'

export type { LabeledCurve }
export { describeCurve }

export const CURVES: LabeledCurve[] = parseCurveDescriptors(rawCurves)

/**
 * Resolve an author-facing curve reference against a catalog:
 * a number (or numeric string, as URL params deliver) is an index,
 * any other string is an exact label, and raw CurveData passes through
 * with a generated label.
 */
export function resolveCurve(ref: number | string | CurveData, curves: LabeledCurve[] = CURVES): LabeledCurve {
  if (typeof ref === 'object') return { label: describeCurve(ref), data: ref }
  const idx = typeof ref === 'number' ? ref : /^\d+$/.test(ref) ? Number(ref) : null
  if (idx !== null) {
    const hit = curves[idx]
    if (!hit) throw new Error(`curve index ${idx} out of range (catalog has ${curves.length})`)
    return hit
  }
  const hit = curves.find((lc) => lc.label === ref)
  if (!hit) {
    throw new Error(`no curve labeled "${ref}" — catalog: ${curves.map((lc) => lc.label).join(' | ')}`)
  }
  return hit
}

/**
 * The catalog index for a curve reference (undefined → 0), for picking a demo's
 * initial curve — e.g. `resolveCurveIndex(url.curve ?? 'disc −3 · hexagonal')`.
 * A reference outside the catalog (raw CurveData) falls back to 0.
 */
export function resolveCurveIndex(
  ref: number | string | CurveData | undefined,
  curves: LabeledCurve[] = CURVES,
): number {
  if (ref === undefined) return 0
  const i = curves.indexOf(resolveCurve(ref, curves))
  return i < 0 ? 0 : i
}
