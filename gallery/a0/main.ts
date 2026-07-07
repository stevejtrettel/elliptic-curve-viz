/** a0 — F₅, trace 0: the disc −20 pair (y²=x³+1 and y²=x³+2), side by side. */
import { parsePieceFile, showPiece } from '@/author'
import { parseCurveDescriptors } from '@/io'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
const pieceGlob = import.meta.glob('./piece.json', { eager: true, import: 'default' })
const pieceRaw = pieceGlob['./piece.json']

showPiece({ name: 'a0', curves, ...(pieceRaw ? { piece: parsePieceFile(pieceRaw) } : {}) })

export {}
