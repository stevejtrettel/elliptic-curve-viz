/**
 * pieces — render a whole PIECE from a data/pieces/*.json file: one or more
 * elliptic-curve tori composed in a single scene. `?piece=<stem>` chooses the
 * file (default first-pair). Arrange them with a layout template, fine-tune with
 * the gizmo, and Save writes the poses back to the file.
 */
import { parsePieceFile, showPiece } from '@/author'

const files = import.meta.glob('../../data/pieces/*.json', { eager: true, import: 'default' })
const name = new URLSearchParams(location.search).get('piece') ?? 'first-pair'
const raw = files[`../../data/pieces/${name}.json`]

if (raw) {
  const demo = showPiece({ piece: parsePieceFile(raw), name, saveMode: 'sandbox' })
  // ?select=<i> deep-links a torus already selected; ?mode=rotate|translate
  const params = new URLSearchParams(location.search)
  const sel = params.get('select')
  if (sel !== null && /^\d+$/.test(sel)) demo.placement.select(Number(sel))
  const mode = params.get('mode')
  if (mode === 'rotate' || mode === 'translate') demo.placement.setMode(mode)
} else {
  const stems = Object.keys(files).map((k) => k.split('/').pop()!.replace('.json', ''))
  const p = document.createElement('p')
  p.style.cssText = 'font:16px/1.6 system-ui;margin:3rem'
  p.append(`No piece “${name}”. Available: ${stems.join(', ')}`) // append() escapes text
  document.body.append(p)
}

export {}
