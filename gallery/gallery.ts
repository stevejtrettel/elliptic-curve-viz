/**
 * Gallery manifest + renderer — the art project's home page. It is ONE page:
 * a categorized grid where you pick a piece and click to load it (?demo=…).
 * `npm run gallery` serves it; `npm run gallery:build` compiles it to
 * dist-gallery/ as a standalone click-to-run site (dev demos/ are excluded).
 *
 * Curated by hand: edit GALLERY to add, reorder, or recategorize pieces. Two
 * fixed sections — 'characteristic' (one prime: curves over a single
 * characteristic) and 'curve' (one curve, across characteristics). A piece whose
 * folder doesn't exist yet renders as a dimmed "soon" tile, so the gallery can
 * hold planned pieces before they're built.
 *
 * To add a piece: copy an existing gallery/<name> folder, then add an entry here.
 */
export type GalleryCategory = 'characteristic' | 'curve'

export interface GalleryEntry {
  /** Folder name under gallery/ and the ?demo= value. */
  demo: string
  title: string
  blurb?: string
  category: GalleryCategory
}

export const GALLERY: GalleryEntry[] = [
  // ── one characteristic: curves over F₅, by trace a ──
  { demo: 'a0', category: 'characteristic', title: 'a = 0', blurb: 'F₅ trace 0 — the disc −20 pair (y²=x³+1, y²=x³+2).' },
  { demo: 'a1', category: 'characteristic', title: 'a = 1', blurb: 'F₅ trace 1 — disc −19.' },
  { demo: 'a2', category: 'characteristic', title: 'a = 2', blurb: 'F₅ trace 2 — disc −4 and −16, stacked.' },
  { demo: 'a3', category: 'characteristic', title: 'a = 3', blurb: 'F₅ trace 3 — disc −11.' },
  { demo: 'a4', category: 'characteristic', title: 'a = 4', blurb: 'F₅ trace 4 — disc −4.' },

  // ── one curve: y²−y=x³−x²−10x−20 (conductor 11), by prime p ──
  { demo: 'p23', category: 'curve', title: 'p = 23', blurb: 'F₂₃ — disc −91, two forms staggered in depth: round (5,3,5) in front, tall wavy (1,1,23) behind.' },
  { demo: 'p101', category: 'curve', title: 'p = 101', blurb: 'F₁₀₁ — one curve, trace 2, form (1,0,4).' },
  { demo: 'p107', category: 'curve', title: 'p = 107', blurb: 'F₁₀₇ — ℤ/6 as a framed glass hexagon; mirror pairs across the glass, self-conjugate forms on the axis.' },
]

const SECTIONS: { category: GalleryCategory; title: string; blurb: string }[] = [
  {
    category: 'characteristic',
    title: 'One characteristic',
    blurb: 'One prime — the curves over a single characteristic, varied by trace.',
  },
  { category: 'curve', title: 'One curve', blurb: 'One curve, followed across characteristics.' },
]

/** Render the gallery into `parent`. `available` = piece folders that exist. */
export function renderGallery(parent: HTMLElement, available: Set<string>): void {
  injectStyles()
  const root = document.createElement('div')
  root.className = 'gallery'

  const h1 = document.createElement('h1')
  h1.textContent = 'elliptic curves'
  root.appendChild(h1)

  let rendered = 0
  for (const section of SECTIONS) {
    const entries = GALLERY.filter((e) => e.category === section.category)
    if (entries.length === 0) continue
    rendered++

    const sec = document.createElement('section')
    const h2 = document.createElement('h2')
    h2.textContent = section.title
    const blurb = document.createElement('p')
    blurb.className = 'section-blurb'
    blurb.textContent = section.blurb
    const grid = document.createElement('div')
    grid.className = 'grid'
    for (const e of entries) grid.appendChild(card(e, available.has(e.demo)))
    sec.append(h2, blurb, grid)
    root.appendChild(sec)
  }

  if (rendered === 0) {
    const empty = document.createElement('p')
    empty.className = 'section-blurb'
    empty.textContent = 'No pieces yet — add them to gallery/gallery.ts.'
    root.appendChild(empty)
  }

  parent.appendChild(root)
}

function card(e: GalleryEntry, exists: boolean): HTMLElement {
  const el = document.createElement(exists ? 'a' : 'div')
  el.className = 'card' + (exists ? '' : ' soon')
  if (exists) (el as HTMLAnchorElement).href = `?demo=${encodeURIComponent(e.demo)}`

  const title = document.createElement('h3')
  title.textContent = e.title
  const blurb = document.createElement('p')
  blurb.textContent = e.blurb ?? ''
  el.append(title, blurb)

  if (!exists) {
    const tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = 'soon'
    el.appendChild(tag)
  }
  return el
}

let stylesInjected = false
function injectStyles(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
    :root { color-scheme: light dark; }
    body { margin: 0; background: #fafafa; color: #1a1a1a;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .gallery { max-width: 68rem; margin: 0 auto; padding: 3.5rem 1.5rem 5rem; }
    .gallery h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 2.75rem; }
    .gallery section { margin-bottom: 3rem; }
    .gallery h2 { font-size: 1.15rem; font-weight: 600; margin: 0 0 0.2rem; }
    .section-blurb { color: #6a6a6a; font-size: 0.9rem; margin: 0 0 1.25rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 1rem; }
    .card { position: relative; display: block; text-decoration: none; color: inherit;
      background: #fff; border: 1px solid #e7e7e7; border-radius: 12px; padding: 1.15rem 1.2rem 1.25rem;
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
    a.card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); border-color: #cfcfcf; }
    .card h3 { margin: 0 0 0.45rem; font-size: 1rem; font-weight: 600; }
    .card p { margin: 0; font-size: 0.85rem; line-height: 1.5; color: #555; }
    .card.soon { opacity: 0.5; }
    .card .tag { position: absolute; top: 0.95rem; right: 1rem; font-size: 0.62rem; text-transform: uppercase;
      letter-spacing: 0.06em; color: #999; border: 1px solid #ddd; border-radius: 999px; padding: 0.1rem 0.45rem; }
    @media (prefers-color-scheme: dark) {
      body { background: #131315; color: #ececec; }
      .section-blurb { color: #9a9a9a; }
      .card { background: #1c1c1f; border-color: #2c2c30; }
      a.card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.4); border-color: #3a3a40; }
      .card p { color: #a8a8a8; }
      .card .tag { color: #888; border-color: #3a3a40; }
    }
  `
  document.head.appendChild(style)
}
