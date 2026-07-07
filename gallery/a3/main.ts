/** a3 — F₅, trace 3: disc −11, a single torus. */
import { parsePieceFile, showPiece } from '@/author'
import { parseCurveDescriptors } from '@/io'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
const pieceGlob = import.meta.glob('./piece.json', { eager: true, import: 'default' })
const pieceRaw = pieceGlob['./piece.json']

showPiece({ name: 'a3', curves, ...(pieceRaw ? { piece: parsePieceFile(pieceRaw) } : {}) })

export {}
