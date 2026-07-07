// Gallery loader (the art site): every gallery/<name>/main.ts is discovered
// statically; ?demo=<name> loads one, no query shows the categorized grid
// (gallery.ts). `npm run gallery:build` bundles this + all gallery pieces into
// dist-gallery/ — one click-to-run page, dev demos/ excluded.
import { renderGallery } from './gallery'

const modules = import.meta.glob('./*/main.ts')

const name = new URLSearchParams(location.search).get('demo')
const key = `./${name}/main.ts`

if (name && key in modules) {
  void modules[key]!()
} else {
  const available = new Set(Object.keys(modules).map((k) => k.slice(2, -'/main.ts'.length)))
  if (name) {
    // unknown piece — a small note above the gallery. `name` is URL-controlled,
    // so set it via textContent, never markup.
    const note = document.createElement('p')
    note.style.cssText =
      'color:#b00;font:14px system-ui;max-width:68rem;margin:2rem auto -1.5rem;padding:0 1.5rem'
    note.textContent = `No piece named “${name}”.`
    document.body.appendChild(note)
  }
  renderGallery(document.body, available)
}
