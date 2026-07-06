/**
 * addStudioDesign — the Design tab: live-edit the data fields of the current
 * StudioSpec (environment, lights, backdrop, camera, look) against real
 * content, then "Copy spec" exports a ready-to-paste preset module. Each edit
 * recompiles the studio via app.setStudio — cheap (a handful of lights), and
 * correct under both live and trace modes. Camera edits also reframe.
 */
import type { App } from './app'
import type { ControlPanel } from './panel'
import { serializeStudioSpec } from './serialize'
import type { StudioSpec } from './specs'
import type { StudioHandle } from './studio'

export interface StudioDesignHandle {
  /** Point the editor at a new base spec (after a studio-picker swap). */
  setSpec(spec: StudioSpec): void
}

export function addStudioDesign(
  panel: ControlPanel,
  app: App,
  spec: StudioSpec,
  onApply?: (handle: StudioHandle) => void,
): StudioDesignHandle {
  const tab = panel.tab('Design')
  let base = spec
  let working = cloneSpec(spec)

  const apply = (reframe = false): void => {
    const handle = app.setStudio(working)
    if (reframe) app.frame()
    app.invalidate()
    onApply?.(handle)
  }

  const hex = (n: number | undefined, dflt: number) => `#${(n ?? dflt).toString(16).padStart(6, '0')}`
  const num = (h: string) => parseInt(h.slice(1), 16)

  const render = (): void => {
    tab.page.replaceChildren()

    const env = working.environment
    if (env.kind === 'gradient') {
      tab.color('Env top', hex(env.top, 0xffffff), (h) => ((env.top = num(h)), apply()))
      tab.color('Env bottom', hex(env.bottom, 0xffffff), (h) => ((env.bottom = num(h)), apply()))
      tab.slider('Env exponent', { min: 0.5, max: 6, step: 0.1, value: env.exponent ?? 1 }, (v) => {
        env.exponent = v
        apply()
      })
    } else if (env.kind === 'solid') {
      tab.color('Env color', hex(env.color, 0xffffff), (h) => ((env.color = num(h)), apply()))
    } else {
      tab.label('Environment', `${env.kind} — not editable here`)
    }
    tab.slider('Env intensity', { min: 0, max: 3, step: 0.05, value: env.intensity ?? 1 }, (v) => {
      env.intensity = v
      apply()
    })

    working.lights.forEach((l, i) => {
      if (l.kind === 'custom') return
      const lt = l
      const name = lt.role ?? `${lt.kind} ${i}`
      tab.color(`${name} · color`, hex(lt.color, 0xffffff), (h) => ((lt.color = num(h)), apply()))
      tab.slider(`${name} · intensity`, { min: 0, max: 12, step: 0.1, value: lt.intensity }, (v) => {
        lt.intensity = v
        apply()
      })
      if (lt.kind !== 'ambient') {
        const pos = lt.position
        ;(['x', 'y', 'z'] as const).forEach((axis, ai) => {
          tab.slider(`${name} · ${axis}`, { min: -4, max: 4, step: 0.05, value: pos[ai]! }, (v) => {
            pos[ai] = v
            apply()
          })
        })
      }
    })

    const backdrop = working.backdrop
    if (backdrop && backdrop.kind === 'floor') {
      tab.color('Floor color', hex(backdrop.color, 0xffffff), (h) => ((backdrop.color = num(h)), apply()))
    }

    const cam = working.camera
    tab.slider('Cam azimuth', { min: -Math.PI, max: Math.PI, step: 0.02, value: cam.azimuth }, (v) => {
      cam.azimuth = v
      apply(true)
    })
    tab.slider('Cam elevation', { min: 0, max: 1.4, step: 0.02, value: cam.elevation }, (v) => {
      cam.elevation = v
      apply(true)
    })
    tab.slider('Cam fill', { min: 0.3, max: 1, step: 0.02, value: cam.fill ?? 0.75 }, (v) => {
      cam.fill = v
      apply(true)
    })
    tab.slider('Cam fov', { min: 20, max: 90, step: 1, value: cam.fov ?? 45 }, (v) => {
      cam.fov = v
      apply(true)
    })

    tab.slider('Exposure', { min: 0.2, max: 3, step: 0.05, value: working.look.exposure ?? 1 }, (v) => {
      working.look.exposure = v
      apply()
    })

    tab.button('Copy spec (TS)', () => {
      const src = serializeStudioSpec(working, camelName(working.name))
      console.info(src)
      void navigator.clipboard?.writeText(src)
    })
    tab.button('Reset to base', () => {
      working = cloneSpec(base)
      apply(true)
      render()
    })
  }
  render()

  return {
    setSpec(next: StudioSpec): void {
      base = next
      working = cloneSpec(next)
      render()
    },
  }
}

/** Deep-copy the data fields; function references (procedural/custom) are shared. */
function cloneSpec(spec: StudioSpec): StudioSpec {
  return {
    ...spec,
    environment: { ...spec.environment },
    lights: spec.lights.map((l) =>
      l.kind !== 'custom' && l.kind !== 'ambient' ? { ...l, position: [...l.position] } : { ...l },
    ),
    ...(spec.backdrop ? { backdrop: { ...spec.backdrop } } : {}),
    camera: { ...spec.camera, ...(spec.camera.dof ? { dof: { ...spec.camera.dof } } : {}) },
    look: { ...spec.look },
    ...(spec.trace ? { trace: { ...spec.trace } } : {}),
  }
}

/** 'paper-white' → paperWhite (a valid TS identifier for the export). */
function camelName(name: string): string {
  const id = name.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^[^a-zA-Z_$]+/, '')
  return id || 'myStudio'
}
