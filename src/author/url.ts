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
  /** Cayley-graph generator indices: ?cayley=g1|g2|both (or 1 ≡ both). */
  cayley?: number[]
  /** Torus surface: ?torus=0|off hides it, matte|glass pick the material. */
  torus?: 'glass' | 'matte' | false
  domain?: boolean
  /** Show the S² base picture beside the torus (?sphere=1). */
  sphere?: boolean
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
  const cayley = p.get('cayley')
  if (cayley === '1' || cayley === 'both') state.cayley = [0, 1]
  else if (cayley === 'g1') state.cayley = [0]
  else if (cayley === 'g2') state.cayley = [1]
  const torus = p.get('torus')
  if (torus === '0' || torus === 'off') state.torus = false
  else if (torus === 'matte' || torus === 'glass') state.torus = torus
  if (p.get('domain') === '1') state.domain = true
  if (p.get('sphere') === '1') state.sphere = true
  if (p.get('trace') === '1') state.trace = true
  if (p.get('design') === '1') state.design = true
  const studio = p.get('studio')
  if (studio) state.studio = studio
  const rig = p.get('rig')
  if (rig) state.rig = rig
  return state
}
