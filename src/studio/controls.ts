/**
 * addStudioControls (DESIGN.md §7): the standard Studio tab in one line —
 * studio picker (registry swap), mode toggle, environment/exposure, per-role
 * light intensities, trace quality knobs, live samples readout, capture
 * buttons. The tab re-renders itself after a picker swap.
 */
import type { App } from './app'
import type { ControlPanel } from './panel'
import type { StudioSpec } from './specs'
import type { StudioHandle } from './studio'
import { STUDIOS } from './studios'

export interface StudioControlsOptions {
  /** Called to collect the reproducibility descriptor for render-final sidecars. */
  sidecar?: () => Record<string, unknown>
  renderName?: string
  /** Show the studio-picker dropdown (default true). */
  picker?: boolean
  /** Fired after a picker swap so callers can reframe and update references. */
  onStudioChange?: (handle: StudioHandle) => void
}

export function addStudioControls(
  panel: ControlPanel,
  app: App,
  handle: StudioHandle,
  opts: StudioControlsOptions = {},
): void {
  const tab = panel.tab('Studio')
  // registry + the incoming spec when it is not a registered one (custom studios stay pickable)
  const registry: Record<string, StudioSpec> = {
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

    const samplesLabel = tab.label('Samples', '—')
    app.trace.onProgress = (s) => samplesLabel.set(String(s))

    tab.toggle('Path trace', app.mode === 'trace', (on) => {
      app.mode = on ? 'trace' : 'live'
      if (!on) samplesLabel.set('—')
    })

    tab.slider('Env intensity', { min: 0, max: 3, step: 0.05, value: app.scene.environmentIntensity }, (v) => {
      app.scene.environmentIntensity = v
      app.invalidate()
    })

    tab.slider('Exposure', { min: 0.2, max: 3, step: 0.05, value: app.renderer.toneMappingExposure }, (v) => {
      app.renderer.toneMappingExposure = v
    })

    h.spec.lights.forEach((spec, i) => {
      if (spec.kind === 'custom' || spec.previewOnly) return
      const light = h.lights[i]!
      tab.slider(spec.role ?? `${spec.kind} ${i}`, { min: 0, max: 12, step: 0.1, value: light.intensity }, (v) => {
        light.intensity = v
        app.invalidate()
      })
    })

    tab.slider('Bounces', { min: 2, max: 20, step: 1, value: app.trace.bounces }, (v) => {
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

  render(handle)
}
