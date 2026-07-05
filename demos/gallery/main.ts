/**
 * gallery — batch render the collection (DESIGN.md §7.5): tick curves from
 * the catalog (data/curves.json), choose k and a sample budget, pick a studio
 * in the Studio tab, then queue path-traced finals — one PNG + reproducibility
 * sidecar per curve. Single combinations stay scriptable via
 * ?curve=&studio=&trace=&blocktrace=.
 */
import { CURVES, showCurve } from '@/author'
import { saveRenderFinal } from '@/studio'

const demo = showCurve({ title: 'gallery', fibers: 8, gridlines: 4 })
const tab = demo.panel!.tab('Gallery')

const selected = new Set<number>(CURVES.map((_, i) => i))
CURVES.forEach((lc, i) => {
  tab.toggle(lc.label, true, (on) => {
    if (on) selected.add(i)
    else selected.delete(i)
  })
})

const kSlider = tab.slider('k (clamped per curve)', { min: 1, max: 6, step: 1, value: 2 }, () => undefined)
const samples = tab.slider('Samples per render', { min: 32, max: 1024, step: 32, value: 128 }, () => undefined)
const progress = tab.label('Progress', 'idle')
let running = false
let cancelled = false

tab.button('Render collection', () => {
  if (!running) void renderAll()
})
tab.button('Cancel', () => (cancelled = true))

async function renderAll(): Promise<void> {
  running = true
  cancelled = false
  const picks = [...selected].sort((a, b) => a - b)
  let done = 0
  for (const idx of picks) {
    if (cancelled) break
    const lc = CURVES[idx]!
    demo.scene.setCurve(idx)
    const k = demo.scene.setK(kSlider.value)
    demo.frame()
    progress.set(`${done + 1}/${picks.length} · ${lc.label}`)
    const studio = demo.studio?.spec.name ?? 'no-studio'
    await saveRenderFinal(demo.app, {
      samples: samples.value,
      name: `${slug(lc.label)}-k${k}-${studio}`,
      sidecar: {
        curve: lc.label,
        data: JSON.parse(
          JSON.stringify(lc.data, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
        ) as unknown,
        k,
        studio,
        samples: samples.value,
        embedding: demo.scene.embedding,
      },
    })
    done++
  }
  progress.set(cancelled ? `cancelled after ${done}/${picks.length}` : `done — ${done}/${picks.length}`)
  running = false
  cancelled = false
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export {}
