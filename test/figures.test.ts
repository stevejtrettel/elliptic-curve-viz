import { describe, expect, it } from 'vitest'

import {
  CURVES,
  buildTorusScene,
  legacyWavy,
  maxFeasibleK,
  paperProfile,
  paperRadius,
  profileCandidate,
  resolveCurve,
} from '@/author'

describe('paper presentation (curves.json paper blocks)', () => {
  it('every paper block is well-formed: color present, radii at feasible k', () => {
    for (const lc of CURVES) {
      if (!lc.paper) continue
      expect(lc.paper.color).toBeGreaterThan(0)
      for (const kk of Object.keys(lc.paper.radiusByK ?? {}).map(Number)) {
        expect(kk).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('paperRadius: exact table hit, nearest-k fallback, default when absent', () => {
    const hex = resolveCurve('disc −3 · hexagonal')
    expect(paperRadius(hex, 3)).toBe(0.04)
    expect(paperRadius(hex, 6)).toBe(0.009) // nearest is k=5
    const bare = resolveCurve('disc −28 = −7·2²')
    expect(paperRadius(bare, 2)).toBe(0.035)
  })

  it("every paper profile builds a torus scene in the curve's-own-lattice mode", () => {
    for (const lc of CURVES) {
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
    // matching rejects it — the legacy figures live in the curve's own lattice
    expect(2 * 3 * 0.276).toBeGreaterThan(1)
    const lc = resolveCurve('disc −3 · hexagonal')
    const cand = profileCandidate(legacyWavy(0.276, 1.9, 3))
    expect(() => buildTorusScene(lc.data, 1, cand)).toThrow(/lattices do not match/)
  })
})
