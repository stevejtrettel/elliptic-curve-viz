import { describe, expect, it } from 'vitest'

import { CurveScene } from '@/author'

describe('CurveScene ladder', () => {
  it('setView reruns project only: scene and candidates keep identity', () => {
    const cs = new CurveScene()
    const scene = cs.scene
    const cands = cs.candidates
    cs.setView({ alpha: 1 })
    expect(cs.scene).toBe(scene)
    expect(cs.candidates).toBe(cands)
  })

  it('setColorMode reruns style only: scene keeps identity', () => {
    const cs = new CurveScene()
    const scene = cs.scene
    cs.setColorMode('orbit')
    expect(cs.scene).toBe(scene)
    expect(cs.colorMode).toBe('orbit')
  })

  it('setK rebuilds the scene but keeps the candidate list', () => {
    const cs = new CurveScene({ k: 1 })
    const scene = cs.scene
    const cands = cs.candidates
    cs.setK(2)
    expect(cs.scene).not.toBe(scene)
    expect(cs.candidates).toBe(cands)
    expect(cs.scene.E.k).toBe(2)
  })

  it('setEmbedding rebuilds the scene but keeps the candidate list', () => {
    const cs = new CurveScene()
    const cands = cs.candidates
    if (cands.length < 2) return // battery default always has ≥2, guard anyway
    const scene = cs.scene
    cs.setEmbedding(1)
    expect(cs.scene).not.toBe(scene)
    expect(cs.candidates).toBe(cands)
  })

  it('setCurve re-solves: candidate list replaced, embedding reset', () => {
    const cs = new CurveScene()
    cs.setEmbedding(1)
    const cands = cs.candidates
    cs.setCurve(1)
    expect(cs.candidates).not.toBe(cands)
    expect(cs.embedding).toBe(0)
    expect(cs.curve.label).toContain('disc −3')
  })

  it('setLobes re-solves and pins the lobe count (boundary latitude circles stay n=0)', () => {
    const cs = new CurveScene()
    cs.setLobes(4)
    expect(cs.candidates.length).toBeGreaterThan(0)
    for (const c of cs.candidates) {
      if (c.stratum !== 'boundary') expect(c.n).toBe(4)
    }
  })
})

describe('CurveScene clamping and options', () => {
  it('clamps k to maxFeasibleK under the point cap', () => {
    const cs = new CurveScene({ maxPoints: 108 }) // disc −8: |E(F_121)| = 108
    expect(cs.setK(6)).toBe(2)
    expect(cs.k).toBe(2)
  })

  it('honors initial curve/k/fibers options', () => {
    const cs = new CurveScene({ curve: 2, k: 1, fibers: 3, gridlines: 2 })
    expect(cs.curve.label).toContain('disc −4')
    expect(cs.k).toBe(1)
    expect(cs.fibers).toBe(3)
    expect(cs.gridlines).toBe(2)
  })
})

describe('CurveScene selection', () => {
  it('select() populates the orbit tube and dims non-orbit points to the DIM gray', () => {
    const cs = new CurveScene()
    const E = cs.scene.E
    const idx = E.points().findIndex((P) => E.degree(P) > 1)
    cs.select(idx)
    expect(cs.selected).toBe(idx)
    // orbit tube got exactly one curve: its geometry has nonzero vertices
    expect(cs.orbitTube.geometry.getAttribute('position').count).toBeGreaterThan(0)
    cs.select(null)
    expect(cs.orbitTube.geometry.getAttribute('position').count).toBe(0)
  })

  it('a rebuild clears the selection', () => {
    const cs = new CurveScene()
    const E = cs.scene.E
    cs.select(E.points().findIndex((P) => E.degree(P) > 1))
    cs.setK(1)
    expect(cs.selected).toBe(null)
  })
})

describe('CurveScene Cayley graph', () => {
  const tubeCount = (cs: CurveScene, i: number) =>
    cs.cayleyTubes[i]!.geometry.getAttribute('position').count

  it('setCayley fills one TubeSet per selected generator, tubes stage only (no rebuild)', () => {
    const cs = new CurveScene()
    const scene = cs.scene
    expect(tubeCount(cs, 0)).toBe(0)
    expect(tubeCount(cs, 1)).toBe(0)
    cs.setCayley(true)
    expect(cs.scene).toBe(scene) // tubes stage: scene identity kept
    cs.cayleyTubes.forEach((_, i) => {
      if (scene.E.generators[i]) expect(tubeCount(cs, i)).toBeGreaterThan(0)
      else expect(tubeCount(cs, i)).toBe(0)
    })
    cs.setCayley(false)
    expect(tubeCount(cs, 0)).toBe(0)
    expect(tubeCount(cs, 1)).toBe(0)
  })

  it('draws the flat chords on the plaque when cayley is on, clears when off', () => {
    const cs = new CurveScene()
    const base = cs.plaque.children.length
    cs.setCayley(true)
    const drawn = cs.plaque.children.length - base
    expect(drawn).toBe(cs.scene.E.generators.length)
    cs.setCayley(false)
    expect(cs.plaque.children.length).toBe(base)
  })

  it('coset color modes restyle without rebuilding the scene', () => {
    const cs = new CurveScene()
    const scene = cs.scene
    cs.setColorMode('coset2')
    expect(cs.scene).toBe(scene)
    expect(cs.colorMode).toBe('coset2')
    cs.setColorMode('coset1') // falls back gracefully even for cyclic groups
    expect(cs.colorMode).toBe('coset1')
  })

  it('the selection persists across rebuilds (k change)', () => {
    const cs = new CurveScene({ cayley: true, k: 2 })
    cs.setK(1)
    expect(cs.cayley).toEqual([0, 1])
    const E = cs.scene.E
    cs.cayleyTubes.forEach((_, i) => {
      if (E.generators[i]) expect(tubeCount(cs, i)).toBeGreaterThan(0)
    })
  })
})

describe('CurveScene onChange', () => {
  it('fires exactly once per setter, none during construction', () => {
    let calls = 0
    const cs = new CurveScene({ onChange: () => calls++ })
    expect(calls).toBe(0)
    cs.setView({ beta: 0.5 })
    expect(calls).toBe(1)
    cs.setK(1)
    expect(calls).toBe(2)
    cs.setColorMode('order')
    expect(calls).toBe(3)
    cs.select(null)
    expect(calls).toBe(4)
  })
})
