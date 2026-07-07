/**
 * showCurve — the one-call demo: choose an elliptic curve, get the full
 * standard kit (App + CurveScene + panel + studio + picking + URL params),
 * every handle returned for imperative escape. Sugar, not a cage: hand-wired
 * demos against geometry/studio remain first-class (DESIGN.md §7.5).
 */
import type { CurveData } from '@/math/arithmetic'
import type { ProfileCurve } from '@/math/hopf'

import { matte } from '@/geometry'

import {
  App,
  type CameraSpec,
  ControlPanel,
  STUDIOS,
  type StudioDesignHandle,
  type StudioHandle,
  type StudioSpec,
  addStudioControls,
  addStudioDesign,
  paperWhite,
} from '@/studio'

import type { LabeledCurve } from './catalog'
import {
  type CayleyBasis,
  type CayleySelection,
  type ColorMode,
  CurveScene,
  type ViewAngles,
} from './curve-scene'
import { addCurveTabs, candidateLabel } from './panel'
import { enableOrbitPicking } from './pick'
import { decodeParams } from './url'

export interface CurveDemoSpec {
  /** Panel title and render/sidecar name. */
  title?: string

  // ── the mathematical subject ──────────────────────────────────────────────
  curve?: number | string | CurveData
  /** Catalog for the Curve dropdown (default: the built-in battery). */
  curves?: LabeledCurve[]
  k?: number
  lobes?: number | null
  /** θ-skew, the paper's twist: θ = t + skew·sin(2n·t). Default 0 = untwisted. */
  skew?: number
  /** Which solver candidate (index into the sorted list; default 0 = fattest). */
  embedding?: number
  /** Explicit profile curve (paper reproduction) — replaces the solver's candidates. */
  profile?: ProfileCurve

  // ── scene layout: each demo's individual composition ────────────────────
  /** S³ rotation (alpha, beta, gamma) and projection-pole tilt. */
  view?: Partial<ViewAngles>
  /** Camera framing over the studio's default: azimuth, elevation, fill, fov, dof. */
  camera?: Partial<CameraSpec>
  fibers?: number
  gridlines?: number
  /** Cayley-graph edges: true = both generators, or explicit indices ([0], [1]). */
  cayley?: CayleySelection
  /** Cayley generating pair: 'reduced' shortest (default) or 'structure' SNF. */
  cayleyBasis?: CayleyBasis
  tubeRadius?: number
  pointRadius?: number
  colorBy?: ColorMode
  /** The single color when colorBy is 'uniform'. */
  color?: number
  subfieldBoost?: boolean
  /** Torus surface: glass (default), matte, or false = hidden. */
  torus?: 'glass' | 'matte' | false
  showPoints?: boolean
  /** Show the flat fundamental domain beside the torus. */
  domain?: boolean
  /** Show the S² base picture (profile curve + fiber marks) beside the torus. */
  sphere?: boolean
  maxPoints?: number
  /** Studio preset; false = bare renderer, no Studio tab. ?studio=<name> overrides from the registry. */
  studio?: StudioSpec | false
  /** Studio Design tab (live spec editing + Copy spec export); also ?design=1. */
  design?: boolean
  controls?: boolean
  interaction?: boolean
  urlSync?: boolean
  fps?: boolean
  /** Fired after every completed scene recompute (curve/k/… changes) — for
   *  demos keeping labels or custom UI in sync with the live state. */
  onChange?: () => void
}

export interface CurveDemo {
  app: App
  scene: CurveScene
  panel: ControlPanel | null
  studio: StudioHandle | null
  /** Refit camera and parked plaque to the current stage. */
  frame(): void
  dispose(): void
}

export function showCurve(spec: CurveDemoSpec = {}): CurveDemo {
  const url = spec.urlSync !== false ? decodeParams(location.search) : {}
  const title = spec.title ?? 'curve'

  const app = new App()
  const scene = new CurveScene({
    ...(spec.curves ? { curves: spec.curves } : {}),
    curve: url.curve ?? spec.curve ?? 0,
    k: url.k ?? spec.k ?? 2,
    lobes: url.lobes ?? spec.lobes ?? null,
    skew: spec.skew ?? 0,
    embedding: spec.embedding ?? 0,
    fibers: url.fibers ?? spec.fibers ?? 0,
    gridlines: url.grid ?? spec.gridlines ?? 0,
    cayley: url.cayley ?? spec.cayley ?? false,
    ...(spec.cayleyBasis ? { cayleyBasis: spec.cayleyBasis } : {}),
    maxPoints: spec.maxPoints ?? 20000,
    pointRadius: spec.pointRadius ?? 0.035,
    tubeRadius: spec.tubeRadius ?? 0.012,
    colorMode: spec.colorBy ?? 'degree',
    ...(spec.color !== undefined ? { color: spec.color } : {}),
    subfieldBoost: spec.subfieldBoost ?? true,
    ...(spec.profile ? { profile: spec.profile } : {}),
    ...(spec.view ? { view: spec.view } : {}),
    onChange: () => {
      app.invalidate()
      spec.onChange?.()
    },
  })
  const torus = url.torus ?? spec.torus ?? 'glass'
  if (torus === 'matte') scene.torus.setMaterial(matte(0xdde3ea))
  if (torus === false) scene.torus.visible = false
  if (spec.showPoints === false) scene.points.visible = false
  app.stage.add(scene.group)

  let domainShown = url.domain ?? spec.domain ?? false
  const setDomain = (show: boolean) => {
    domainShown = show
    if (show) app.stage.add(scene.plaque)
    else app.stage.remove(scene.plaque)
  }
  if (domainShown) app.stage.add(scene.plaque)

  let sphereShown = url.sphere ?? spec.sphere ?? false
  const setSphere = (show: boolean) => {
    sphereShown = show
    if (show) app.stage.add(scene.sphere)
    else app.stage.remove(scene.sphere)
  }
  if (sphereShown) app.stage.add(scene.sphere)

  const frame = () => {
    // park the side pictures beside the torus (scaled to match) BEFORE
    // framing, so the camera fit accounts for them when visible
    scene.torus.geometry.computeBoundingSphere()
    const r = scene.torus.geometry.boundingSphere?.radius ?? 3
    scene.plaque.position.set(-1.55 * r, 0.45 * r, 0)
    scene.plaque.scale.setScalar(0.8 * r)
    scene.sphere.position.set(1.55 * r, 0.45 * r, 0)
    scene.sphere.scale.setScalar(0.45 * r)
    app.frame(spec.camera ?? {})
  }

  const panel = spec.controls !== false ? new ControlPanel({ title }) : null
  if (panel) {
    addCurveTabs(panel, scene, {
      frame,
      invalidate: () => app.invalidate(),
      setDomain,
      domainShown,
      setSphere,
      sphereShown,
      pointRadius: spec.pointRadius ?? 0.035,
      tubeRadius: spec.tubeRadius ?? 0.012,
      torus,
      showPoints: spec.showPoints ?? true,
    })
  }

  const picking = spec.interaction !== false ? enableOrbitPicking(app, scene) : null

  let studio: StudioHandle | null = null
  if (spec.studio !== false) {
    const base = (url.studio ? STUDIOS[url.studio] : undefined) ?? spec.studio ?? paperWhite
    studio = app.setStudio(base)
    if (panel) {
      let design: StudioDesignHandle | null = null
      const studioControls = addStudioControls(panel, app, studio, {
        renderName: title,
        sidecar: () => ({
          curve: scene.curve.label,
          k: scene.k,
          embedding: scene.candidates[scene.embedding] ? candidateLabel(scene.candidates[scene.embedding]!) : undefined,
          colorMode: scene.colorMode,
          projection: scene.view,
          fibers: scene.fibers,
          gridlines: scene.gridlines,
          cayley: scene.cayley,
          studio: studio?.spec.name,
        }),
        onStudioChange: (h) => {
          studio = h
          frame()
          design?.setSpec(h.spec)
        },
      })
      if (spec.design || url.design) {
        // Design edits recompile the studio; the Studio tab must re-render
        // against the new handle or its light sliders mutate detached lights.
        design = addStudioDesign(panel, app, base, (h) => {
          studio = h
          studioControls.setHandle(h)
        })
      }
    }
  }

  if (panel) panel.mount(document.body)

  // diagnostic, opt-in: `fps: true` in the spec
  let fpsStop: (() => void) | null = null
  if (spec.fps) fpsStop = fpsMeter()

  frame()
  if (url.trace) app.mode = 'trace'
  // headless-capture hook: block during load until N samples are in the canvas
  if (url.blocktrace !== undefined) app.stepTrace(url.blocktrace)
  app.start()

  return {
    app,
    scene,
    panel,
    get studio() {
      return studio
    },
    frame,
    dispose() {
      picking?.dispose()
      fpsStop?.()
      panel?.domElement.remove()
      scene.dispose()
      app.dispose()
    },
  }
}

/** Diagnostic fps meter, bottom-right. Returns a stop function. */
function fpsMeter(): () => void {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;right:12px;bottom:12px;font:11px system-ui;color:#666;background:rgba(255,255,255,0.7);' +
    'padding:3px 8px;border-radius:5px'
  document.body.appendChild(el)
  let frames = 0
  let last = performance.now()
  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    frames++
    const now = performance.now()
    if (now - last >= 1000) {
      el.textContent = `${Math.round((frames * 1000) / (now - last))} fps`
      frames = 0
      last = now
    }
  }
  tick()
  return () => {
    cancelAnimationFrame(raf)
    el.remove()
  }
}
