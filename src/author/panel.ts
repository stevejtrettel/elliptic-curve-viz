/**
 * The standard control tabs (Curve / Points / View) bound to a CurveScene,
 * as one call. panel.tab() is get-or-create, so demos freely append their
 * own tabs/controls to the same panel.
 */
import type { Candidate } from '@/math/families'

import { glass, matte } from '@/geometry'

import type { ControlPanel } from '@/studio'

import type { ColorMode, CurveScene } from './curve-scene'

export interface StandardPanelOptions {
  /** Refit camera (and parked plaque) to the stage — after curve/embedding swaps. */
  frame: () => void
  /** app.invalidate — after cheap renderable-only knobs (radius, visibility). */
  invalidate: () => void
  /** Stage/unstage the flat-domain plaque; omit to drop the toggle. */
  setDomain?: (show: boolean) => void
  domainShown?: boolean
  /** Initial values for the cheap renderable knobs (the spec's scene layout). */
  pointRadius?: number
  tubeRadius?: number
  torus?: 'glass' | 'matte' | false
  showPoints?: boolean
}

export function candidateLabel(c: Candidate): string {
  return `${c.stratum} n=${c.n} L=${(c.achieved.L / Math.PI).toFixed(2)}π` + (c.rep.flip ? ' (mirror)' : '')
}

export function addCurveTabs(panel: ControlPanel, scene: CurveScene, opts: StandardPanelOptions): void {
  const curveTab = panel.tab('Curve')
  const pointsTab = panel.tab('Points')
  const viewTab = panel.tab('View')

  const candidateOptions = () =>
    scene.candidates.map((c, i) => ({ value: String(i), label: candidateLabel(c) }))

  const candDropdown = curveTab.dropdown(
    'Embedding',
    { options: candidateOptions(), value: String(scene.embedding) },
    (v) => {
      scene.setEmbedding(Number(v))
      opts.frame()
    },
  )

  curveTab.dropdown(
    'Curve',
    {
      options: scene.catalog.map((c, i) => ({ label: c.label, value: String(i) })),
      value: String(Math.max(0, scene.catalog.indexOf(scene.curve))),
    },
    (v) => {
      scene.setCurve(Number(v))
      candDropdown.setOptions(candidateOptions(), '0')
      kSlider.set(scene.k)
      opts.frame()
    },
  )

  const kSlider = curveTab.slider('k (field F_{p^k})', { min: 1, max: 6, step: 1, value: scene.k }, (v) => {
    const applied = scene.setK(v)
    if (applied !== v) kSlider.set(applied)
  })

  curveTab.dropdown(
    'Lobes n',
    {
      options: [
        { label: 'auto', value: 'auto' },
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ label: String(n), value: String(n) })),
      ],
      value: scene.lobes === null ? 'auto' : String(scene.lobes),
    },
    (v) => {
      scene.setLobes(v === 'auto' ? null : Number(v))
      candDropdown.setOptions(candidateOptions(), '0')
      opts.frame()
    },
  )

  pointsTab.dropdown(
    'Color by',
    {
      options: [
        { label: 'field of definition', value: 'degree' },
        { label: 'group order', value: 'order' },
        { label: 'Frobenius orbit', value: 'orbit' },
        { label: 'coset of ⟨g₁⟩', value: 'coset1' },
        { label: 'coset of ⟨g₂⟩', value: 'coset2' },
        { label: 'single color', value: 'uniform' },
      ],
      value: scene.colorMode,
    },
    (v) => scene.setColorMode(v as ColorMode),
  )

  pointsTab.slider('Radius', { min: 0.005, max: 0.12, step: 0.005, value: opts.pointRadius ?? 0.035 }, (v) => {
    scene.points.setBaseRadius(v)
    opts.invalidate()
  })

  pointsTab.toggle('Boost subfields', scene.subfieldBoost, (v) => scene.setSubfieldBoost(v))

  pointsTab.toggle('Show points', opts.showPoints ?? true, (v) => {
    scene.points.visible = v
    opts.invalidate()
  })

  if (opts.setDomain) {
    const setDomain = opts.setDomain
    pointsTab.toggle('Show flat domain', opts.domainShown ?? false, (v) => {
      setDomain(v)
      opts.invalidate()
    })
  }

  const view = scene.view
  const angle = (label: string, max: number, value: number, apply: (v: number) => void) =>
    viewTab.slider(label, { min: 0, max, step: 0.01, value }, apply)
  angle('Rotate α', 2 * Math.PI, view.alpha, (v) => scene.setView({ alpha: v }))
  angle('Rotate β', 2 * Math.PI, view.beta, (v) => scene.setView({ beta: v }))
  angle('Rotate γ', Math.PI, view.gamma, (v) => scene.setView({ gamma: v }))
  angle('Pole tilt', Math.PI, view.pole, (v) => scene.setView({ pole: v }))

  viewTab.slider('Fibers', { min: 0, max: 24, step: 1, value: scene.fibers }, (v) => scene.setFibers(v))
  viewTab.slider('Gridlines', { min: 0, max: 24, step: 1, value: scene.gridlines }, (v) => scene.setGridlines(v))

  const cayleyValue = () => {
    const sel = scene.cayley
    return sel.length === 0 ? 'off' : sel.length === 2 ? 'both' : sel[0] === 0 ? 'g1' : 'g2'
  }
  viewTab.dropdown(
    'Cayley graph',
    {
      options: [
        { label: 'off', value: 'off' },
        { label: 'generator g₁', value: 'g1' },
        { label: 'generator g₂', value: 'g2' },
        { label: 'both generators', value: 'both' },
      ],
      value: cayleyValue(),
    },
    (v) => scene.setCayley(v === 'off' ? [] : v === 'g1' ? [0] : v === 'g2' ? [1] : true),
  )

  viewTab.slider('Tube radius', { min: 0.004, max: 0.05, step: 0.002, value: opts.tubeRadius ?? 0.012 }, (v) => {
    scene.fiberTubes.setRadius(v)
    scene.edgeTubes.setRadius(v)
    scene.orbitTube.setRadius(v * 0.8)
    for (const t of scene.cayleyTubes) t.setRadius(v * 0.8)
    opts.invalidate()
  })

  viewTab.toggle('Glass torus', opts.torus !== 'matte', (v) => {
    scene.torus.setMaterial(v ? glass() : matte(0xdde3ea))
    opts.invalidate()
  })
  viewTab.toggle('Show torus', opts.torus !== false, (v) => {
    scene.torus.visible = v
    opts.invalidate()
  })
}
