import { describe, expect, it } from 'vitest'

import { DiscreteCurve, HopfTorus, LatitudeCircle, WavyCircle } from '@/math/hopf'

describe('profile curve validation', () => {
  it('LatitudeCircle needs 0 < φ₀ < π', () => {
    expect(() => new LatitudeCircle(0)).toThrow(RangeError)
    expect(() => new LatitudeCircle(Math.PI)).toThrow(RangeError)
    expect(new LatitudeCircle(1).sample(8)).toHaveLength(8)
  })

  it('WavyCircle enforces φ₀ ± b ∈ (0, π) and |2n·skew| < 1', () => {
    expect(() => new WavyCircle({ phi0: Math.PI / 2, b: Math.PI / 2, n: 3 })).toThrow(RangeError)
    expect(() => new WavyCircle({ phi0: 0.2, b: 0.3, n: 2 })).toThrow(RangeError)
    expect(() => new WavyCircle({ phi0: Math.PI / 2, b: 0.5, n: 3, skew: 0.2 })).toThrow(RangeError)
    expect(() => new WavyCircle({ phi0: Math.PI / 2, b: 0.5, n: 1.5 })).toThrow(RangeError)
    expect(new WavyCircle({ phi0: Math.PI / 2, b: 0.5, n: 3, skew: 0.1 }).sample(16)).toHaveLength(16)
  })

  it('DiscreteCurve resamples through trig interpolation', () => {
    const wavy = new WavyCircle({ phi0: 1.3, b: 0.4, n: 3, skew: 0.05 })
    const disc = new DiscreteCurve(wavy.sample(64))
    const resampled = disc.sample(96)
    const direct = wavy.sample(96)
    for (let j = 0; j < 96; j += 7) {
      expect(resampled[j]!.theta).toBeCloseTo(direct[j]!.theta, 10)
      expect(resampled[j]!.phi).toBeCloseTo(direct[j]!.phi, 10)
    }
    // identity resample is exact
    const same = disc.sample(64)
    expect(same[13]).toEqual(wavy.sample(64)[13])
  })
})

describe('HopfTorus integrals vs closed forms', () => {
  it('latitude circles: A = 2π(1 − cos φ₀), L = 2π sin φ₀', () => {
    for (const phi0 of [0.4, Math.PI / 3, Math.PI / 2, 2.2]) {
      const torus = new HopfTorus(new LatitudeCircle(phi0), { samples: 64 })
      expect(torus.area).toBeCloseTo(2 * Math.PI * (1 - Math.cos(phi0)), 12)
      expect(torus.length).toBeCloseTo(2 * Math.PI * Math.sin(phi0), 12)
    }
  })

  it('equatorial wavy circles pin A = 2π regardless of amplitude and skew (the wall)', () => {
    for (const [b, n, skew] of [
      [0.5244, 3, 0.15],
      [0.8, 5, 0.02],
      [0.3, 1, 0],
    ] as const) {
      const torus = new HopfTorus(new WavyCircle({ phi0: Math.PI / 2, b, n, skew }), { samples: 512 })
      expect(torus.area).toBeCloseTo(2 * Math.PI, 11)
      expect(torus.length).toBeGreaterThan(2 * Math.PI)
    }
  })

  it('the legacy hex curve matches lifting-modp/data/-3 (via DiscreteCurve — it violates the monotone-θ bound)', () => {
    // legacy: θ = t + 0.276·sin(6t), φ = π/2 + 0.5244·cos(3t). |2n·skew| = 1.656 > 1,
    // so it is OUTSIDE the WavyCircle family bounds; DiscreteCurve is the escape hatch.
    const legacyHex = new DiscreteCurve(
      Array.from({ length: 512 }, (_, j) => {
        const t = (2 * Math.PI * j) / 512
        return { theta: t + 0.276 * Math.sin(6 * t), phi: Math.PI / 2 + 0.5244 * Math.cos(3 * t) }
      }),
    )
    const torus = new HopfTorus(legacyHex, { samples: 512 })
    expect(torus.area).toBeCloseTo(2 * Math.PI, 11) // A = 2π survives the skew (wall symmetry)
    // legacy target: curveLength = 4π·(√3/2) = 2π√3, hand-tuned so only ~2 digits
    expect(torus.length).toBeCloseTo(2 * Math.PI * Math.sqrt(3), 1)
  })

  it('lattice generators are [2π, A/2 + iL/2]', () => {
    const torus = new HopfTorus(new LatitudeCircle(1.1), { samples: 64 })
    expect(torus.lattice[0].re).toBeCloseTo(2 * Math.PI, 14)
    expect(torus.lattice[0].im).toBe(0)
    expect(torus.lattice[1].re).toBeCloseTo(torus.area / 2, 14)
    expect(torus.lattice[1].im).toBeCloseTo(torus.length / 2, 14)
  })
})
