/**
 * URL parameter codec for authored demos — read-at-boot only (reproducibility
 * of final renders lives in the sidecar, not the URL). THE one place parameter
 * names are defined; demos must not hand-roll URLSearchParams. Legacy names
 * preserved: ?curve&k&lobes&fibers&grid&domain&trace&blocktrace, plus
 * studio/design, the camera rig, the S³ pose (alpha/beta/gamma/pole), and the
 * paper-family symmetry n.
 */
export interface UrlState {
  curve?: number
  k?: number
  lobes?: number
  /** Paper-family lobe count / symmetry override (catalog demos). */
  n?: number
  fibers?: number
  grid?: number
  domain?: boolean
  trace?: boolean
  blocktrace?: number
  studio?: string
  design?: boolean
  /** Named camera rig — demos map it onto their CameraSpec presets. */
  rig?: string
  /** S³ rotation angles and projection-pole tilt (ViewAngles). */
  alpha?: number
  beta?: number
  gamma?: number
  pole?: number
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
  num('n', (v) => (state.n = v))
  num('fibers', (v) => (state.fibers = v))
  num('grid', (v) => (state.grid = v))
  num('blocktrace', (v) => (state.blocktrace = v))
  num('alpha', (v) => (state.alpha = v))
  num('beta', (v) => (state.beta = v))
  num('gamma', (v) => (state.gamma = v))
  num('pole', (v) => (state.pole = v))
  if (p.get('domain') === '1') state.domain = true
  if (p.get('trace') === '1') state.trace = true
  if (p.get('design') === '1') state.design = true
  const studio = p.get('studio')
  if (studio) state.studio = studio
  const rig = p.get('rig')
  if (rig) state.rig = rig
  return state
}
