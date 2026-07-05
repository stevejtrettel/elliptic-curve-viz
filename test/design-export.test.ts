import { describe, expect, it } from 'vitest'

import { type StudioSpec, paperWhite, serializeStudioSpec, velvetDark } from '@/studio'

/** Evaluate the emitted object literal (tests only). */
function roundTrip(src: string): unknown {
  const literal = src.slice(src.indexOf('= ') + 2)
  return new Function(`return ${literal}`)() as unknown
}

describe('serializeStudioSpec', () => {
  it('emits a ready-to-paste module with hex colors and the export name', () => {
    const src = serializeStudioSpec(paperWhite, 'paperWhite')
    expect(src).toContain("import type { StudioSpec } from '@/studio'")
    expect(src).toContain('export const paperWhite: StudioSpec = {')
    expect(src).toContain("kind: 'gradient'")
    expect(src).toContain('top: 0xffffff')
    expect(src).toContain('color: 0xfff1e0')
  })

  it('round-trips both built-in studios exactly (data fields)', () => {
    for (const spec of [paperWhite, velvetDark] as StudioSpec[]) {
      expect(roundTrip(serializeStudioSpec(spec))).toEqual(spec)
    }
  })

  it('replaces function fields with a comment instead of crashing', () => {
    const spec: StudioSpec = {
      ...paperWhite,
      environment: { kind: 'procedural', generate: () => undefined },
    }
    const src = serializeStudioSpec(spec)
    expect(src).toContain('function omitted')
  })
})
