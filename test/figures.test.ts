import { describe, expect, it } from 'vitest'

import { buildTorusScene, legacyWavy, maxFeasibleK, paperProfile, paperRadius, profileCandidate } from '@/author'
import { parseCurveDescriptors, parsePresentation } from '@/io'

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

  it("every specified profile builds a torus scene in the curve's-own-lattice mode", () => {
    for (const lc of LIFTS) {
      const profile = paperProfile(lc)
      if (!profile) continue
      const cand = profileCandidate(profile)
      const kTest = Math.min(2, maxFeasibleK(lc.data, 20000))
      const scene = buildTorusScene(lc.data, kTest, cand, { lattice: 'curve' })
      expect(scene.positions.length).toBe(scene.E.size)
      for (const q of scene.positions) {
        expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 10)
      }
    }
  })
})

describe('legacy profile family', () => {
  it('legacyWavy samples the exact lifting-modp formulas', () => {
    const hex = legacyWavy(0.276, 1.9, 3, 512)
    const pts = hex.sample(512)
    expect(pts.length).toBe(512)
    // t=0: φ = π/2 + a·b, θ = 0
    expect(pts[0]!.phi).toBeCloseTo(Math.PI / 2 + 0.276 * 1.9, 12)
    expect(pts[0]!.theta).toBeCloseTo(0, 12)
  })

  it("documents the finding: the paper's hex curve misses exact τ by ~8e-5", () => {
    // |2n·skew| = 1.656 > 1 (why DiscreteCurve carries it), and strict exact-τ
    // matching rejects it — the paper's figures live in the curve's own lattice
    expect(2 * 3 * 0.276).toBeGreaterThan(1)
    const lc = byLabel('disc −3 · hexagonal')
    const cand = profileCandidate(legacyWavy(0.276, 1.9, 3))
    expect(() => buildTorusScene(lc.data, 1, cand)).toThrow(/lattices do not match/)
  })
})
