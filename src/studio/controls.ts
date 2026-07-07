/**
 * addStudioControls (DESIGN.md §7): the standard Studio tab in one line —
 * studio picker (registry swap), mode toggle, environment/exposure, per-role
 * light intensities, trace quality knobs, live samples readout, capture
 * buttons. The tab re-renders itself after a picker swap.
 */
import type { App } from './app'
import type { ControlPanel, Tab } from './panel'
import type { StudioSpec } from './specs'
import type { StudioHandle } from './studio'
import { STUDIOS } from './studios'

/**
 * The shared path-trace quality knobs (bounces, glass bounces, fast preview) —
 * composed by addStudioControls and by demos with bespoke panel layouts, so
 * the ranges live in exactly one place.
 */
export function addTraceControls(tab: Tab, app: App): void {
  tab.slider('Bounces', { min: 2, max: 40, step: 1, value: app.trace.bounces }, (v) => {
    app.trace.bounces = v
    app.applyTraceSettings()
    app.invalidate()
  })

  tab.slider('Glass bounces', { min: 4, max: 30, step: 1, value: app.trace.transmissiveBounces }, (v) => {
    app.trace.transmissiveBounces = v
    app.applyTraceSettings()
    app.invalidate()
  })

  // dithered low-res compositing while accumulating: faster interaction, but
  // the whole image reads "rough" until it resolves — off by default
  tab.toggle('Fast preview (low-res)', app.trace.dynamicLowRes, (v) => {
    app.trace.dynamicLowRes = v
    app.applyTraceSettings()
    app.invalidate()
  })
}

export interface StudioControlsOptions {
  /** Called to collect the reproducibility descriptor for render-final sidecars. */
  sidecar?: () => Record<string, unknown>
  renderName?: string
  /** Show the studio-picker dropdown (default true). */
  picker?: boolean
  /** Curated studios for the picker (default: the full STUDIOS registry). */
  studios?: StudioSpec[]
  /** Show the capture buttons (Final samples / Screenshot / Render). Default true;
   *  set false when an Export tab owns capture (the gallery). */
  capture?: boolean
  /** Fired after a picker swap so callers can reframe and update references. */
  onStudioChange?: (handle: StudioHandle) => void
  /** Inject extra controls into the Studio tab (re-run on every studio swap). */
  extras?: (tab: Tab) => void
}

export interface StudioControlsHandle {
  /**
   * Re-render the tab against a new StudioHandle — required after ANY
   * app.setStudio outside the picker (e.g. a Design-tab edit), because the
   * light sliders close over the compiled handle's lights.
   */
  setHandle(handle: StudioHandle): void
}

export function addStudioControls(
  panel: ControlPanel,
  app: App,
  handle: StudioHandle,
  opts: StudioControlsOptions = {},
): StudioControlsHandle {
  const tab = panel.tab('Studio')
  // a curated list (the gallery's bright/colored/dark), or the full registry plus
  // the incoming spec when it is not a registered one (custom studios stay pickable)
  const registry: Record<string, StudioSpec> = opts.studios
    ? Object.fromEntries(opts.studios.map((s) => [s.name, s]))
    : {
        ...(handle.spec.name in STUDIOS ? {} : { [handle.spec.name]: handle.spec }),
        ...STUDIOS,
      }

  const render = (h: StudioHandle): void => {
    tab.page.replaceChildren()

    if (opts.picker !== false && Object.keys(registry).length > 1) {
      tab.dropdown(
        'Studio',
        { options: Object.keys(registry).map((n) => ({ label: n, value: n })), value: h.spec.name },
        (name) => {
          const spec = registry[name]
          if (!spec || spec === h.spec) return
          const next = app.setStudio(spec)
          opts.onStudioChange?.(next)
          render(next)
        },
      )
    }

    // per-studio backdrop control, right under the picker: 'colored' gets a wall
    // color picker, 'dark' a darkness slider (dims a slate gray toward black),
    // 'bright' neither.
    if (h.spec.name === 'colored') {
      const bgHex = app.backgroundColor ?? 0x3a5a78
      tab.color('Background', `#${bgHex.toString(16).padStart(6, '0')}`, (hex) => {
        app.setBackground(Number.parseInt(hex.replace('#', ''), 16))
      })
      app.setBackground(bgHex) // tint the floor to the default now, not just on first pick
    } else if (h.spec.name === 'dark') {
      const SLATE = 0x5b6b7d
      const dim = (v: number): number => {
        const f = 1 - v // higher slider = darker
        const r = Math.round(((SLATE >> 16) & 0xff) * f)
        const g = Math.round(((SLATE >> 8) & 0xff) * f)
        const b = Math.round((SLATE & 0xff) * f)
        return (r << 16) | (g << 8) | b
      }
      // init the slider FROM the current wall color (restored from a saved piece,
      // or the preset default) by inverting dim() on the green channel — don't
      // re-apply, so a restored darkness isn't clobbered
      const bg = app.backgroundColor ?? dim(0.6)
      const initV = Math.min(0.95, Math.max(0, 1 - ((bg >> 8) & 0xff) / ((SLATE >> 8) & 0xff)))
      tab.slider('Darkness', { min: 0, max: 0.95, step: 0.02, value: initV }, (v) => app.setBackground(dim(v)))
    }

    // the manual Path-trace toggle + live sample readout belong to the trace
    // workflow; when an Export tab owns capture (the gallery) they move there.
    if (opts.capture !== false) {
      const samplesLabel = tab.label('Samples', '—')
      app.trace.onProgress = (s) => samplesLabel.set(String(s))
      tab.toggle('Path trace', app.mode === 'trace', (on) => {
        app.mode = on ? 'trace' : 'live'
        if (!on) samplesLabel.set('—')
      })
    }

    tab.slider('Env intensity', { min: 0, max: 3, step: 0.05, value: app.scene.environmentIntensity }, (v) => {
      app.scene.environmentIntensity = v
      app.invalidate()
    })

    tab.slider('Exposure', { min: 0.2, max: 3, step: 0.05, value: app.renderer.toneMappingExposure }, (v) => {
      app.renderer.toneMappingExposure = v
    })

    // move the floor/back wall up toward the subject (+) or away (−); raising it
    // pulls the cast shadows in closer
    tab.slider('Backdrop dist', { min: -25, max: 25, step: 0.1, value: app.floorOffset }, (v) => {
      app.setFloorOffset(v)
    })
    // slide the key light horizontally — sweeps the shadow left↔right across the frame
    tab.slider('Light X (shadow)', { min: -50, max: 50, step: 0.5, value: app.keyLightX }, (v) => {
      app.setKeyLightX(v)
    })
    // preview the key shadow live (raster shadow map) before path tracing
    tab.toggle('Live shadows', app.liveShadows, (on) => app.setLiveShadows(on))

    // gallery-injected controls (e.g. the global Surface material)
    opts.extras?.(tab)

    h.spec.lights.forEach((spec, i) => {
      if (spec.kind === 'custom' || spec.previewOnly) return
      const light = h.lights[i]!
      tab.slider(spec.role ?? `${spec.kind} ${i}`, { min: 0, max: 12, step: 0.1, value: light.intensity }, (v) => {
        light.intensity = v
        app.invalidate()
      })
    })

    addTraceControls(tab, app)

    // capture lives here by default, but the gallery moves it to an Export tab
    if (opts.capture !== false) {
      const target = tab.slider('Final samples', { min: 32, max: 1024, step: 32, value: 256 }, () => undefined)

      tab.button('Screenshot', () => {
        void import('./capture').then(({ saveScreenshot }) => saveScreenshot(app, `${opts.renderName ?? 'shot'}.png`))
      })

      tab.button('Render final (PNG + sidecar)', () => {
        void import('./capture').then(({ saveRenderFinal }) =>
          saveRenderFinal(app, {
            samples: target.value,
            sidecar: opts.sidecar?.() ?? {},
            name: opts.renderName ?? 'render',
          }),
        )
      })
    }
  }

  render(handle)
  return { setHandle: render }
}

/** Print-oriented aspect presets (label → width:height). */
const EXPORT_ASPECTS = [
  { label: 'Square 1:1', value: '1:1', ratio: 1 },
  { label: 'Portrait 4:5', value: '4:5', ratio: 4 / 5 },
  { label: 'Portrait 2:3', value: '2:3', ratio: 2 / 3 },
  { label: 'Landscape 3:2', value: '3:2', ratio: 3 / 2 },
  { label: 'Landscape 16:9', value: '16:9', ratio: 16 / 9 },
]
const EXPORT_EDGES = [1024, 2048, 4096, 8192]

/**
 * The Export tab: pick an aspect ratio + long-edge resolution, then path-trace a
 * final PNG (+ sidecar) at exactly those pixels. Tiling is auto-set so no GPU
 * pass exceeds ~2k/side (safe at 4k/8k). Independent of the on-screen viewport.
 */
export interface ExportControlsHandle {
  /** Current framing, for saving into a piece. */
  state(): { aspect: string; longEdge: number }
}

export function addExportControls(
  panel: ControlPanel,
  app: App,
  opts: {
    renderName?: string
    sidecar?: () => Record<string, unknown>
    /** Initial framing (restored from a saved piece). */
    aspect?: string
    longEdge?: number
    /** Toggle high-res geometry (smoother balls + surface) before tracing. */
    onHighRes?: (on: boolean) => void
  } = {},
): ExportControlsHandle {
  const tab = panel.tab('Export')
  let aspectValue = EXPORT_ASPECTS.find((a) => a.value === opts.aspect)?.value ?? EXPORT_ASPECTS[0]!.value
  let ratio = EXPORT_ASPECTS.find((a) => a.value === aspectValue)!.ratio
  let longEdge = EXPORT_EDGES.includes(opts.longEdge ?? 0) ? opts.longEdge! : 2048

  // long edge = the LONGER side; the short side follows the aspect. Even dims.
  const dims = (): [number, number] => {
    const [w, h] = ratio >= 1 ? [longEdge, longEdge / ratio] : [longEdge * ratio, longEdge]
    return [Math.round(w / 2) * 2, Math.round(h / 2) * 2]
  }
  const tilesFor = ([w, h]: [number, number]): [number, number] => [
    Math.max(1, Math.ceil(w / 2048)),
    Math.max(1, Math.ceil(h / 2048)),
  ]

  const output = tab.label('Output', '')
  const tilesReadout = tab.label('Tiles', '')
  const refresh = (): void => {
    const d = dims()
    const t = tilesFor(d)
    output.set(`${d[0]} × ${d[1]} px`)
    tilesReadout.set(t[0] === 1 && t[1] === 1 ? 'single pass' : `${t[0]} × ${t[1]}`)
  }

  tab.dropdown(
    'Aspect',
    { options: EXPORT_ASPECTS.map((a) => ({ label: a.label, value: a.value })), value: aspectValue },
    (v) => {
      aspectValue = v
      ratio = EXPORT_ASPECTS.find((a) => a.value === v)!.ratio
      // choosing an aspect turns cropping on and letterboxes the preview (WYSIWYG)
      app.setPreviewAspect(ratio)
      cropToggle.set(true)
      refresh()
    },
  )
  const cropToggle = tab.toggle('Crop preview', app.previewAspect !== null, (on) => {
    app.setPreviewAspect(on ? ratio : null)
  })
  tab.dropdown(
    'Long edge',
    { options: EXPORT_EDGES.map((e) => ({ label: `${e / 1024}k · ${e}px`, value: String(e) })), value: String(longEdge) },
    (v) => {
      longEdge = Number(v)
      refresh()
    },
  )
  // smoother balls + surface to trace against (expensive; do it before Start)
  if (opts.onHighRes) {
    tab.toggle('High-res geometry', false, (on) => opts.onHighRes!(on))
  }
  const autosave = tab.slider('Autosave at', { min: 32, max: 4096, step: 32, value: 256 }, () => undefined)
  const progress = tab.label('Progress', '—')
  const status = tab.label('', '')
  const name = () => opts.renderName ?? 'render'

  // ── the three-button flow: Start/Stop trace · Save image · Download scene data ──
  let tracing = false
  let savedThisRun = false

  const saveImage = () =>
    import('./capture').then(({ saveScreenshot }) => saveScreenshot(app, `${name()}.png`))

  const stopTracing = () => {
    tracing = false
    app.stopRender()
    traceBtn.setLabel('Start pathtrace')
  }

  // auto-download once the trace reaches the Autosave sample count, then stop
  app.trace.onProgress = (s) => {
    progress.set(`${s} samples`)
    if (tracing && !savedThisRun && s >= autosave.value) {
      savedThisRun = true
      void saveImage().then(() => {
        stopTracing()
        status.set(`autosaved at ${autosave.value} samples`)
      })
    }
  }

  const traceBtn = tab.button('Start pathtrace', () => {
    if (tracing) {
      stopTracing()
      status.set('stopped')
      return
    }
    const [width, height] = dims()
    savedThisRun = false
    tracing = true
    app.startRender(width, height)
    traceBtn.setLabel('Stop pathtrace')
    status.set(`tracing ${width}×${height}…`)
  })

  // save the current frame as-is (full resolution while tracing)
  tab.button('Save image', () => {
    void saveImage().then(() => status.set('saved image'))
  })

  // the reproducibility JSON (render settings + camera + curve data)
  tab.button('Download scene data', () => {
    void import('./capture').then(({ downloadBlob }) => {
      downloadBlob(new Blob([app.sceneData(opts.sidecar?.() ?? {})], { type: 'application/json' }), `${name()}.json`)
    })
    status.set('saved scene data')
  })

  refresh()
  // restore the saved framing's letterbox immediately, so a reopened piece frames
  // for print without a click
  if (opts.aspect) app.setPreviewAspect(ratio)
  return { state: () => ({ aspect: aspectValue, longEdge }) }
}
