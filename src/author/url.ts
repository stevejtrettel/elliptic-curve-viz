/**
 * URL parameter codec for authored demos — read-at-boot only (reproducibility
 * of final renders lives in the sidecar, not the URL). Legacy names preserved:
 * ?curve&k&lobes&fibers&grid&domain&trace&blocktrace, plus studio/design.
 */
export interface UrlState {
  curve?: number
  k?: number
  lobes?: number
  fibers?: number
  grid?: number
  domain?: boolean
  trace?: boolean
  blocktrace?: number
  studio?: string
  design?: boolean
}

export function decodeParams(search: string): UrlState {
  const p = new URLSearchParams(search)
  const state: UrlState = {}
  const num = (name: string, apply: (v: number) => void) => {
    const raw = p.get(name)
    if (raw === null) return
    const v = Number(raw)
    if (Number.isFinite(v)) apply(v)
  }
  num('curve', (v) => (state.curve = v))
  num('k', (v) => (state.k = v))
  num('lobes', (v) => (state.lobes = v))
  num('fibers', (v) => (state.fibers = v))
  num('grid', (v) => (state.grid = v))
  num('blocktrace', (v) => (state.blocktrace = v))
  if (p.get('domain') === '1') state.domain = true
  if (p.get('trace') === '1') state.trace = true
  if (p.get('design') === '1') state.design = true
  const studio = p.get('studio')
  if (studio) state.studio = studio
  return state
}
