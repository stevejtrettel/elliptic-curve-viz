/** a2 — F₅, trace 2: disc −4 (top) and disc −16 (bottom), stacked vertically. */
import { parsePieceFile, showPiece } from '@/author'
import { parseCurveDescriptors } from '@/io'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
const pieceGlob = import.meta.glob('./piece.json', { eager: true, import: 'default' })
const pieceRaw = pieceGlob['./piece.json']

showPiece({ name: 'a2', curves, ...(pieceRaw ? { piece: parsePieceFile(pieceRaw) } : {}) })

export {}
