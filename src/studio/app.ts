/**
 * The studio runtime (DESIGN.md §7): one App owns renderer/camera/controls and
 * the content `stage`; studios are swapped as data via setStudio. A single
 * canvas serves both modes; `invalidate()` is the ONE coarse "content changed"
 * signal for the path tracer (camera and environment invalidation are handled
 * by the WebGLPathTracer façade automatically).
 */
import * as THREE from 'three'
import { PhysicalCamera, WebGLPathTracer } from 'three-gpu-pathtracer'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { isTraceBakeable } from '@/geometry'

import type { CameraSpec, StudioSpec } from './specs'
import { type StudioHandle, TONE_MAPPING, compileStudio, placeCamera, placeFloor } from './studio'

export interface TraceSettings {
  bounces: number
  /** Extra bounces through glass — raise for thick/stacked transmission. */
  transmissiveBounces: number
  /** 0.25–1 tames fireflies on glossy surfaces. */
  filterGlossyFactor: number
  /** Deterministic noise — use for stills/turntables. */
  stableNoise: boolean
  renderScale: number
  tiles: [number, number]
  dynamicLowRes: boolean
  /** Stop accumulating at this many samples (null = run forever). */
  target: number | null
  onProgress?: (samples: number) => void
}

export interface AppOptions {
  mount?: HTMLElement
  antialias?: boolean
}

export class App {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: PhysicalCamera
  readonly controls: OrbitControls
  /** Content lives here; studios never touch it. */
  readonly stage = new THREE.Group()
  readonly trace: TraceSettings = {
    bounces: 8,
    transmissiveBounces: 12,
    filterGlossyFactor: 0.25,
    stableNoise: false,
    renderScale: 1,
    tiles: [2, 2],
    dynamicLowRes: false,
    target: null,
  }

  private pathTracer: WebGLPathTracer | null = null
  private _mode: 'live' | 'trace' = 'live'
  private handle: StudioHandle | null = null
  private studioGroup: THREE.Group | null = null
  private cameraSpec: CameraSpec | null = null
  private running = false

  constructor(opts: AppOptions = {}) {
    // NO preserveDrawingBuffer: it is a severe frame-rate hit on some drivers
    // (macOS ANGLE/Metal); screenshot() re-renders synchronously before toBlob.
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // the raster transmission pass re-renders the scene into a mipmapped target
    // whenever glass is visible — half resolution there is visually invisible
    // through rough glass and roughly halves the live-mode frame cost
    this.renderer.transmissionResolutionScale = 0.5
    ;(opts.mount ?? document.body).appendChild(this.renderer.domElement)
    this.camera = new PhysicalCamera(45, window.innerWidth / window.innerHeight, 0.01, 500)
    this.camera.position.set(3, 2, 4)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.scene.add(this.stage)
    window.addEventListener('resize', this.onResize)
  }

  /** Bounding sphere of the content (used by every relative placement). */
  stageBounds(): { center: THREE.Vector3; radius: number } {
    const box = new THREE.Box3().setFromObject(this.stage)
    if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 1 }
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    return { center: sphere.center, radius: Math.max(sphere.radius, 1e-6) }
  }

  /** Swap studios: dispose the old subtree, compile the spec against current bounds. */
  setStudio(spec: StudioSpec): StudioHandle {
    if (this.handle) this.handle.dispose()
    if (this.studioGroup) this.scene.remove(this.studioGroup)
    const bounds = this.stageBounds()
    const compiled = compileStudio(spec, bounds, this.renderer, (tex) => {
      this.scene.environment = tex
      if ((spec.environment.background ?? 'same') === 'same' || spec.environment.background === 'blur') {
        this.scene.background = tex
      }
      this.syncTracer('environment')
    })
    this.scene.add(compiled.group)
    this.studioGroup = compiled.group
    this.handle = compiled.handle
    this.scene.environment = compiled.environment
    this.scene.environmentIntensity = spec.environment.intensity ?? 1
    this.scene.environmentRotation.set(0, spec.environment.rotation ?? 0, 0)
    this.scene.background = compiled.background
    this.scene.backgroundBlurriness = spec.environment.background === 'blur' ? 0.6 : 0
    this.renderer.toneMapping = TONE_MAPPING[spec.look.toneMapping ?? 'aces']
    this.renderer.toneMappingExposure = spec.look.exposure ?? 1
    this.cameraSpec = spec.camera
    if (this._mode === 'trace') this.invalidate()
    return compiled.handle
  }

  /** EXPLICIT camera (+ floor) fit to the stage bounds — never automatic. */
  frame(overrides: Partial<CameraSpec> = {}): void {
    const spec: CameraSpec = { azimuth: 0.6, elevation: 0.35, ...this.cameraSpec, ...overrides }
    const bounds = this.stageBounds()
    const placed = placeCamera(spec, bounds)
    this.camera.fov = placed.fov
    this.camera.position.copy(placed.position)
    this.controls.target.copy(placed.target)
    if (spec.dof) {
      this.camera.fStop = spec.dof.fstop
      this.camera.focusDistance = spec.dof.focus === 'auto' ? placed.distance : spec.dof.focus
      this.camera.bokehSize = 0 // let fStop/focalLength drive; bokehSize setter overrides fStop
    }
    this.camera.updateProjectionMatrix()
    this.controls.update()
    if (this.handle?.floor && this.handle.spec.backdrop) {
      const { y, size } = placeFloor(this.handle.spec.backdrop, bounds)
      this.handle.floor.position.set(bounds.center.x, y, bounds.center.z)
      const geo = this.handle.floor.geometry as THREE.PlaneGeometry
      const current = geo.parameters.width
      this.handle.floor.scale.setScalar(size / current)
    }
    this.syncTracer('camera')
  }

  get mode(): 'live' | 'trace' {
    return this._mode
  }

  set mode(m: 'live' | 'trace') {
    if (m === this._mode) return
    this._mode = m
    this.stage.traverse((obj) => {
      if (isTraceBakeable(obj)) obj.setMode(m)
    })
    if (this.handle) {
      for (const light of this.handle.previewLights) {
        light.intensity = m === 'trace' ? 0 : this.handle.baseIntensities[this.handle.lights.indexOf(light)]!
      }
    }
    if (m === 'trace') {
      this.ensureTracer()
      this.applyTraceSettings()
      this.pathTracer!.setScene(this.scene, this.camera)
    }
  }

  /** ONE coarse signal: content changed. Rebakes and resyncs the tracer. */
  invalidate(): void {
    if (this._mode !== 'trace' || !this.pathTracer) return
    this.stage.traverse((obj) => {
      if (isTraceBakeable(obj)) obj.setMode('trace') // bake any newcomers
    })
    this.applyTraceSettings()
    this.pathTracer.setScene(this.scene, this.camera)
  }

  /** Convergence counter (0 when not tracing). */
  get samples(): number {
    return this.pathTracer ? Math.floor(this.pathTracer.samples) : 0
  }

  screenshot(): Promise<Blob> {
    // re-render synchronously so toBlob reads a fresh buffer (no preserveDrawingBuffer)
    if (this._mode === 'trace' && this.pathTracer) this.pathTracer.renderSample()
    else this.renderer.render(this.scene, this.camera)
    return new Promise((resolve, reject) => {
      this.renderer.domElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
    })
  }

  /**
   * Trace to a sample budget and hand back the PNG (plus an optional
   * reproducibility sidecar: the caller's descriptor merged with App state).
   */
  async renderFinal(opts: {
    samples?: number
    scale?: number
    sidecar?: Record<string, unknown>
  }): Promise<{ image: Blob; sidecar?: Blob }> {
    const target = opts.samples ?? 256
    const prevMode = this._mode
    const prevScale = this.trace.renderScale
    const prevTarget = this.trace.target
    const prevLowRes = this.trace.dynamicLowRes
    if (opts.scale) this.trace.renderScale = opts.scale
    this.trace.dynamicLowRes = false
    this.trace.target = target
    this.mode = 'trace'
    this.invalidate()
    await new Promise<void>((resolve) => {
      const check = () => (this.samples >= target ? resolve() : requestAnimationFrame(check))
      check()
    })
    const image = await this.screenshot()
    let sidecarBlob: Blob | undefined
    if (opts.sidecar) {
      const descriptor = buildSidecar(
        { trace: this.trace, camera: this.camera, studioName: this.handle?.spec.name },
        opts.sidecar,
        target,
      )
      sidecarBlob = new Blob([JSON.stringify(descriptor, null, 2)], { type: 'application/json' })
    }
    this.trace.renderScale = prevScale
    this.trace.target = prevTarget
    this.trace.dynamicLowRes = prevLowRes
    if (prevMode === 'live') this.mode = 'live'
    else this.applyTraceSettings()
    return sidecarBlob ? { image, sidecar: sidecarBlob } : { image }
  }

  /**
   * Synchronously accumulate n path-trace samples (blocking). For CI/headless
   * captures where the rAF loop can't run long enough; not for interactive use.
   */
  stepTrace(n: number): void {
    this.mode = 'trace'
    this.ensureTracer()
    const start = this.samples
    let guard = 0
    while (this.samples - start < n && guard++ < 100000) this.pathTracer!.renderSample()
  }

  start(): void {
    if (this.running) return
    this.running = true
    requestAnimationFrame(this.loop)
  }

  dispose(): void {
    this.running = false
    window.removeEventListener('resize', this.onResize)
    this.handle?.dispose()
    this.pathTracer?.dispose()
    this.renderer.dispose()
  }

  private loop = (): void => {
    if (!this.running) return
    requestAnimationFrame(this.loop)
    this.controls.update()
    if (this._mode === 'trace' && this.pathTracer) {
      if (this.trace.target === null || this.samples < this.trace.target) {
        this.pathTracer.renderSample()
        this.trace.onProgress?.(this.samples)
      }
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  private ensureTracer(): void {
    if (!this.pathTracer) this.pathTracer = new WebGLPathTracer(this.renderer)
  }

  /** Push the trace settings object onto the tracer (call after changing them). */
  applyTraceSettings(): void {
    if (!this.pathTracer) return
    const pt = this.pathTracer
    pt.bounces = this.trace.bounces
    pt.transmissiveBounces = this.trace.transmissiveBounces
    pt.filterGlossyFactor = this.trace.filterGlossyFactor
    // present at runtime (getter/setter on the façade) but missing from the typings
    ;(pt as WebGLPathTracer & { stableNoise: boolean }).stableNoise = this.trace.stableNoise
    pt.renderScale = this.trace.renderScale
    pt.dynamicLowRes = this.trace.dynamicLowRes
    pt.tiles.set(this.trace.tiles[0], this.trace.tiles[1])
  }

  private syncTracer(what: 'environment' | 'camera'): void {
    if (this._mode !== 'trace' || !this.pathTracer) return
    if (what === 'environment') this.pathTracer.updateEnvironment()
    else this.pathTracer.updateCamera()
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }
}

/** Pure sidecar assembly (exported for tests): caller descriptor + App state. */
export function buildSidecar(
  state: {
    trace: Omit<TraceSettings, 'onProgress'> & { onProgress?: unknown }
    camera: { position: THREE.Vector3; fov: number; fStop: number }
    studioName?: string | undefined
  },
  caller: Record<string, unknown>,
  samples: number,
): Record<string, unknown> {
  return {
    ...caller,
    studio: state.studioName,
    render: {
      samples,
      bounces: state.trace.bounces,
      transmissiveBounces: state.trace.transmissiveBounces,
      filterGlossyFactor: state.trace.filterGlossyFactor,
      stableNoise: state.trace.stableNoise,
      renderScale: state.trace.renderScale,
    },
    camera: {
      position: state.camera.position.toArray(),
      fov: state.camera.fov,
      fStop: state.camera.fStop,
    },
  }
}
