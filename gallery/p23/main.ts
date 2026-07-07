/** p23 — the conductor-11 curve y²−y=x³−x²−10x−20 over F₂₃: trace −1, disc −91, the 2 forms. */
import { parsePieceFile, showPiece } from '@/author'
import { parseCurveDescriptors } from '@/io'

import curvesRaw from './curves.json'

const curves = parseCurveDescriptors(curvesRaw)
const pieceGlob = import.meta.glob('./piece.json', { eager: true, import: 'default' })
const pieceRaw = pieceGlob['./piece.json']

showPiece({ name: 'p23', curves, ...(pieceRaw ? { piece: parsePieceFile(pieceRaw) } : {}) })

export {}
