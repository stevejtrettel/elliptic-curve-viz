/**
 * duet — the template art demo. Copy this folder to start a new piece.
 *
 * Two files author the piece:
 *   curves.json — just the curves (arithmetic descriptors, data/curves.json format)
 *   piece.json  — the composition (layout, per-torus k/lobes/points/color, poses)
 *
 * curves.json is read-only input; piece.json is written by the panel's Save
 * button. If piece.json doesn't exist yet, the demo starts from a default (one
 * torus per curve, side-by-side) — arrange it, tune the render, and Save writes
 * the file. `name` MUST equal this folder's name (it's the save target).
 */
import { parsePieceFile, showPiece } from '@/author'
import { parseCurveDescriptors } from '@/io'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
// piece.json is optional — glob so a missing file is empty, not an import error
const pieceGlob = import.meta.glob('./piece.json', { eager: true, import: 'default' })
const pieceRaw = pieceGlob['./piece.json']

showPiece({
  name: 'duet',
  curves,
  ...(pieceRaw ? { piece: parsePieceFile(pieceRaw) } : {}),
})

export {}
