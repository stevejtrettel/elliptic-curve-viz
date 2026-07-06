import { describe, expect, it } from 'vitest'

import { buildTorusScene, maxFeasibleK, paperRadius, profileCandidate } from '@/author'
import { parseCurveDescriptors, parsePresentation } from '@/io'
import { tauOf } from '@/math/arithmetic'
import { paperWavy, solvePaperFamily } from '@/math/families'

// the torus-lifts demo's own files ARE the source of the specified values
import rawCurves from '../demos/torus-lifts/curves.json'
import rawPresentation from '../demos/torus-lifts/presentation.json'

const PRESENTATION = parsePresentation(rawPresentation)
const LIFTS = parseCurveDescriptors(rawCurves).map((lc) => ({
  ...lc,
  ...(PRESENTATION[lc.label] ? { paper: PRESENTATION[lc.label] } : {}),
}))
const byLabel = (label: string) => LIFTS.find((lc) => lc.label === label)!

describe('torus-lifts specification files', () => {
  it('curves.json is pure arithmetic (no presentation fields)', () => {
    for (const entry of rawCurves as Record<string, unknown>[]) {
      expect(Object.keys(entry).sort()).toEqual(['form', 'label', 'p', 'sign', 'trace'])
    }
  })

  it('every presentation label matches a curve', () => {
    const labels = new Set(LIFTS.map((lc) => lc.label))
    for (const label of Object.keys(PRESENTATION)) expect(labels.has(label)).toBe(true)
  })

  it('paperRadius: 2× the specified table (compensates the conformal-rule constant)', () => {
    const hex = byLabel('disc −3 · hexagonal')
    expect(paperRadius(hex, 3)).toBe(0.08) // specified 0.04, doubled
    expect(paperRadius(hex, 6)).toBe(0.018) // nearest is k=5: specified 0.009
    const bare = byLabel('disc −28 = −7·2²') // no presentation entry
    expect(paperRadius(bare, 2)).toBe(0.035)
  })

  it('every specified profile SOLVES from τ and builds a torus scene', () => {
    for (const lc of LIFTS) {
      const prof = lc.paper?.profile
      if (!prof) continue
      const sol = solvePaperFamily(tauOf(lc.data.form), prof.n, { a: prof.a })
      expect(sol, lc.label).not.toBeNull()
      const cand = profileCandidate(sol!.curve)
      const kTest = Math.min(2, maxFeasibleK(lc.data, 20000))
      const scene = buildTorusScene(lc.data, kTest, cand, { lattice: 'curve' })
      expect(scene.positions.length).toBe(scene.E.size)
      for (const q of scene.positions) {
        expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 10)
      }
    }
  })
})

describe('the paper family (historical record)', () => {
  it('paperWavy samples the exact lifting-modp formulas', () => {
    const hex = paperWavy(0.276, 1.9, 3, 512) // the historical hand values
    const pts = hex.sample(512)
    expect(pts.length).toBe(512)
    // t=0: φ = π/2 + a·b, θ = 0
    expect(pts[0]!.phi).toBeCloseTo(Math.PI / 2 + 0.276 * 1.9, 12)
    expect(pts[0]!.theta).toBeCloseTo(0, 12)
  })

  it("documents the finding: the paper's HAND-TUNED hex curve missed exact τ by ~8e-5", () => {
    // |2n·skew| = 1.656 > 1 (outside WavyCircle's monotone family), and strict
    // exact-τ matching rejected the hand values — which is why b is now SOLVED
    expect(2 * 3 * 0.276).toBeGreaterThan(1)
    const lc = byLabel('disc −3 · hexagonal')
    const cand = profileCandidate(paperWavy(0.276, 1.9, 3))
    expect(() => buildTorusScene(lc.data, 1, cand)).toThrow(/lattices do not match/)
  })
})
