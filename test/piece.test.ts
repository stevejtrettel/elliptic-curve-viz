import { describe, expect, it } from 'vitest'

import { type Placement, parsePieceFile, serializePiece } from '@/author'
import type { CurveData } from '@/math/arithmetic'

// a valid inline descriptor: form (1,1,1) → disc −3; 5²−4·7 = −3 = disc·1²
const INLINE = { form: { a: 1, b: 1, c: 1 }, p: 7, trace: 5, sign: 1 }

describe('parsePieceFile', () => {
  it('parses label refs with knobs and placement (incl. scale)', () => {
    const piece = parsePieceFile({
      tori: [
        {
          curve: 'disc −3 · hexagonal',
          k: 3,
          fibers: 8,
          placement: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: 2.5 },
        },
      ],
    })
    expect(piece.tori).toHaveLength(1)
    expect(piece.tori[0]!.curve).toBe('disc −3 · hexagonal')
    expect(piece.tori[0]!.k).toBe(3)
    expect(piece.tori[0]!.placement).toEqual({ position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: 2.5 })
  })

  it('scale is optional — omitted stays undefined (builder defaults to 1)', () => {
    const piece = parsePieceFile({
      tori: [{ curve: 0, placement: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] } }],
    })
    expect(piece.tori[0]!.placement!.scale).toBeUndefined()
  })

  it('validates and resolves an inline curve to bigint CurveData', () => {
    const piece = parsePieceFile({ tori: [{ curve: INLINE, k: 2 }] })
    const curve = piece.tori[0]!.curve as CurveData
    expect(curve.form).toEqual({ a: 1n, b: 1n, c: 1n })
    expect(curve.p).toBe(7n)
    expect(curve.trace).toBe(5n)
  })

  it('rejects malformed input', () => {
    expect(() => parsePieceFile({ tori: [] })).toThrow(/non-empty/)
    expect(() => parsePieceFile({ tori: [{ k: 2 }] })).toThrow(/curve/)
    expect(() => parsePieceFile({ tori: [{ curve: INLINE, placement: { position: [1, 2] } }] })).toThrow(
      /position/,
    )
    // inline curve that violates the descriptor contract (disc ≥ 0)
    expect(() => parsePieceFile({ tori: [{ curve: { ...INLINE, form: { a: 1, b: 0, c: -1 } } }] })).toThrow()
    expect(() =>
      parsePieceFile({
        tori: [{ curve: 0, placement: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: -1 } }],
      }),
    ).toThrow(/scale/)
  })
})

describe('serializePiece', () => {
  it('stamps poses (with scale) and round-trips through the parser', () => {
    const piece = parsePieceFile({ tori: [{ curve: INLINE, k: 2, fibers: 4 }] })
    const poses: Placement[] = [{ position: [1.1234567, -2, 0], quaternion: [0, 0, 0, 1], scale: 0.5 }]

    const json = serializePiece(piece, poses) as { tori: Array<Record<string, unknown>> }
    const entry = json.tori[0]!
    // pose floats are trimmed, scale is emitted, inline bigints → JSON numbers
    expect(entry['placement']).toEqual({ position: [1.123457, -2, 0], quaternion: [0, 0, 0, 1], scale: 0.5 })
    expect(entry['curve']).toEqual({ form: { a: 1, b: 1, c: 1 }, p: 7, trace: 5, sign: 1 })
    expect(entry['k']).toBe(2)
    expect(entry['fibers']).toBe(4)

    // re-parsing the serialized output yields equivalent data
    const reparsed = parsePieceFile(json)
    expect((reparsed.tori[0]!.curve as CurveData).p).toBe(7n)
    expect(reparsed.tori[0]!.placement!.scale).toBe(0.5)
  })
})
