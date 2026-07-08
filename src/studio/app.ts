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

import { isTraceBakeable, setSceneInstanceTotal } from '@/geometry'

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

/** Trace-quality defaults; StudioSpec.trace overrides these per studio. */
const TRACE_QUALITY_DEFAULTS = { bounces: 8, transmissiveBounces: 12, filterGlossyFactor: 0.25 }

export class App {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: PhysicalCamera
  readonly controls: OrbitControls
  /** Content lives here; studios never touch it. */
  readonly stage = new THREE.Group()
  readonly trace: TraceSettings = {
    ...TRACE_QUALITY_DEFAULTS,
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
  private readonly mount: HTMLElement
  /** No explicit mount → track the window; otherwise track the mount's client box. */
  private readonly fullWindow: boolean
  /** Letterbox the viewport to this aspect (null = fill), for WYSIWYG export framing. */
  private _previewAspect: number | null = null
  /** Undo the size/tiles change made by startRender, applied by stopRender. */
  private _renderRestore: (() => void) | null = null
  /** Auto floor height (from the studio) and the live offset raised over it. */
  private _floorBaseY = 0
  private _floorOffset = 0
  /** Key-light base x (from the studio) and the live horizontal offset (moves the shadow). */
  private _keyLightBaseX = 0
  private _keyLightOffsetX = 0
  /** Whether raster shadow maps are on in the live view (preview aid). */
  private _liveShadows = false
  private readonly noDof: { fStop: number; focusDistance: number }

  constructor(opts: AppOptions = {}) {
    // NO preserveDrawingBuffer: it is a severe frame-rate hit on some drivers
    // (macOS ANGLE/Metal); screenshot() re-renders synchronously before toBlob.
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // the raster transmission pass re-renders the scene into a mipmapped target
    // whenever glass is visible — half resolution there is visually invisible
    // through rough glass and roughly halves the live-mode frame cost
    this.renderer.transmissionResolutionScale = 0.5
    this.mount = opts.mount ?? document.body
    this.fullWindow = !opts.mount
    this.mount.appendChild(this.renderer.domElement)
    const [w, h] = this.viewSize()
    this.renderer.setSize(w, h)
    this.camera = new PhysicalCamera(45, w / h, 0.01, 500)
    // library defaults, restored by frame() when a studio has no dof spec
    this.noDof = { fStop: this.camera.fStop, focusDistance: this.camera.focusDistance }
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
    // remember the auto floor height and re-apply any live offset over it
    this._floorBaseY = compiled.handle.floor?.position.y ?? 0
    if (compiled.handle.floor) compiled.handle.floor.position.y = this._floorBaseY + this._floorOffset
    // same for the key light's horizontal position (sweeps the shadow left↔right)
    const keyIdx = compiled.handle.spec.lights.findIndex((s) => s.role === 'key')
    const keyLight = keyIdx >= 0 ? compiled.handle.lights[keyIdx] : undefined
    this._keyLightBaseX = keyLight?.position.x ?? 0
    if (keyLight) keyLight.position.x = this._keyLightBaseX + this._keyLightOffsetX
    this.scene.environment = compiled.environment
    this.scene.environmentIntensity = spec.environment.intensity ?? 1
    this.scene.environmentRotation.set(0, spec.environment.rotation ?? 0, 0)
    this.scene.background = compiled.background
    this.scene.backgroundBlurriness = spec.environment.background === 'blur' ? 0.6 : 0
    this.renderer.toneMapping = TONE_MAPPING[spec.look.toneMapping ?? 'aces']
    this.renderer.toneMappingExposure = spec.look.exposure ?? 1
    // trace QUALITY is part of the studio's look; absent fields reset to the
    // defaults so studios never inherit each other's settings
    this.trace.bounces = spec.trace?.bounces ?? TRACE_QUALITY_DEFAULTS.bounces
    this.trace.transmissiveBounces = spec.trace?.transmissiveBounces ?? TRACE_QUALITY_DEFAULTS.transmissiveBounces
    this.trace.filterGlossyFactor = spec.trace?.filterGlossyFactor ?? TRACE_QUALITY_DEFAULTS.filterGlossyFactor
    this.applyTraceSettings()
    this.cameraSpec = spec.camera
    if (this._liveShadows) this.setLiveShadows(true) // re-tune the new studio's key shadow
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
    } else {
      // a dof-less studio must not inherit the previous studio's aperture
      this.camera.fStop = this.noDof.fStop
      this.camera.focusDistance = this.noDof.focusDistance
      this.camera.bokehSize = 0
    }
    this.camera.updateProjectionMatrix()
    this.controls.update()
    if (this.handle?.floor && this.handle.spec.backdrop) {
      const { y, size } = placeFloor(this.handle.spec.backdrop, bounds)
      // this re-fit becomes the new auto height; keep the live backdrop offset on top
      this._floorBaseY = y
      this.handle.floor.position.set(bounds.center.x, y + this._floorOffset, bounds.center.z)
      const geo = this.handle.floor.geometry as THREE.PlaneGeometry
      const current = geo.parameters.width
      this.handle.floor.scale.setScalar(size / current)
    }
    this.syncTracer('camera')
  }

  get mode(): 'live' | 'trace' {
    return this._mode
  }

  /** Sum instanced-point counts across the stage so the bake budgets detail
   *  scene-wide (dense multi-torus scenes coarsen their spheres together). */
  private syncSceneBudget(): void {
    let total = 0
    this.stage.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) total += (o as THREE.InstancedMesh).count
    })
    setSceneInstanceTotal(total)
  }

  set mode(m: 'live' | 'trace') {
    if (m === this._mode) return
    this._mode = m
    if (m === 'trace') this.syncSceneBudget()
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
    this.syncSceneBudget() // point counts may have changed (k, add/remove) → rebudget
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
    /** Exact output pixel dimensions; camera aspect + tiling follow. */
    width?: number
    height?: number
    sidecar?: Record<string, unknown>
  }): Promise<{ image: Blob; sidecar?: Blob }> {
    const target = opts.samples ?? 256
    const prevMode = this._mode
    const prevScale = this.trace.renderScale
    const prevTarget = this.trace.target
    const prevLowRes = this.trace.dynamicLowRes
    const prevTiles: [number, number] = [this.trace.tiles[0], this.trace.tiles[1]]
    const prevPixelRatio = this.renderer.getPixelRatio()

    // custom output size: render the drawing buffer at EXACTLY width×height (no
    // devicePixelRatio multiply), aspect-correct the camera, and tile so no
    // single GPU pass exceeds ~2k per side (avoids driver timeouts at 4k/8k).
    const sized = !!(opts.width && opts.height)
    if (sized) {
      const w = opts.width!
      const h = opts.height!
      this.trace.tiles = [Math.max(1, Math.ceil(w / 2048)), Math.max(1, Math.ceil(h / 2048))]
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(w, h, false) // false: leave the on-screen CSS size alone
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    if (opts.scale) this.trace.renderScale = opts.scale
    this.trace.dynamicLowRes = false
    this.trace.target = target
    this.mode = 'trace'
    this.ensureTracer()
    this.applyTraceSettings()
    this.pathTracer!.setScene(this.scene, this.camera) // reinit the tracer at the new size
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
    this.trace.tiles = prevTiles
    if (sized) {
      this.renderer.setPixelRatio(prevPixelRatio)
      this.onResize() // restore the on-screen size + camera aspect
    }
    if (prevMode === 'live') this.mode = 'live'
    else {
      this.applyTraceSettings()
      this.pathTracer!.setScene(this.scene, this.camera)
    }
    return sidecarBlob ? { image, sidecar: sidecarBlob } : { image }
  }

  /**
   * Begin an UNBOUNDED path trace in the viewport (accumulates until stopRender),
   * optionally at an exact output size (tiled, pixelRatio 1) so a Save grabs full
   * resolution. The canvas keeps its on-screen CSS box; a big buffer downscales
   * for preview. Call stopRender() to return to live.
   */
  startRender(width?: number, height?: number): void {
    const prevTiles: [number, number] = [this.trace.tiles[0], this.trace.tiles[1]]
    const prevPixelRatio = this.renderer.getPixelRatio()
    const prevPreviewAspect = this._previewAspect
    if (width && height) {
      // letterbox the ON-SCREEN box to the export aspect first, so blowing the
      // drawing buffer up to width×height (same aspect) displays un-stretched
      this.setPreviewAspect(width / height)
      this.trace.tiles = [Math.max(1, Math.ceil(width / 2048)), Math.max(1, Math.ceil(height / 2048))]
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(width, height, false) // buffer to full res; CSS box stays letterboxed
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this._renderRestore = () => {
        this.trace.tiles = prevTiles
        this.renderer.setPixelRatio(prevPixelRatio)
        this.setPreviewAspect(prevPreviewAspect) // restores the box + re-fits via onResize
      }
    } else {
      this._renderRestore = () => {
        this.trace.tiles = prevTiles
      }
    }
    this.trace.target = null // unbounded — accumulate until stopped
    this.trace.dynamicLowRes = false
    this.mode = 'trace' // ensures tracer, applies tiles, setScene at the new size
  }

  /** Stop the viewport trace started by startRender and restore the live viewport. */
  stopRender(): void {
    this.mode = 'live'
    this._renderRestore?.()
    this._renderRestore = null
  }

  /** After a material/texture change (e.g. an async-decoded normal map): re-sync the
   *  tracer's materials and repaint. */
  refreshMaterials(): void {
    if (this._mode === 'trace' && this.pathTracer) this.pathTracer.updateMaterials()
    this.invalidate()
  }

  /** The reproducibility descriptor (render settings + camera + caller data) as JSON. */
  sceneData(caller: Record<string, unknown> = {}): string {
    const d = buildSidecar(
      { trace: this.trace, camera: this.camera, studioName: this.handle?.spec.name },
      caller,
      this.samples,
    )
    return JSON.stringify(d, null, 2)
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
    this.controls.dispose()
    this.handle?.dispose()
    if (this.studioGroup) this.scene.remove(this.studioGroup)
    this.pathTracer?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
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

  /** Read the current visible background color as a hex, or null if it's a texture. */
  get backgroundColor(): number | null {
    return this.scene.background instanceof THREE.Color ? this.scene.background.getHex() : null
  }

  /** Name of the current studio preset (tracks picker swaps). */
  get studioName(): string | undefined {
    return this.handle?.spec.name
  }

  get floorOffset(): number {
    return this._floorOffset
  }

  /**
   * Raise/lower the floor (shadow-catcher backdrop) relative to its auto height.
   * Raising it toward the subject pulls the cast shadows in closer/tighter.
   */
  setFloorOffset(dy: number): void {
    this._floorOffset = dy
    if (this.handle?.floor) this.handle.floor.position.y = this._floorBaseY + dy
    this.invalidate()
  }

  get keyLightX(): number {
    return this._keyLightOffsetX
  }

  get liveShadows(): boolean {
    return this._liveShadows
  }

  /**
   * Toggle real-time (raster) shadow maps in the LIVE view, so you can see where
   * the key light throws its shadow before committing to a path trace. Irrelevant
   * to the traced output (the tracer does its own shadows).
   */
  setLiveShadows(on: boolean): void {
    this._liveShadows = on
    this.renderer.shadowMap.enabled = on
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.needsUpdate = true
    // the key spot already castShadow=true (for the tracer); tune its raster map
    const h = this.handle
    if (h) {
      const i = h.spec.lights.findIndex((s) => s.role === 'key')
      const key = i >= 0 ? (h.lights[i] as THREE.SpotLight) : null
      if (key) {
        key.castShadow = on
        if (on && key.shadow) {
          key.shadow.mapSize.set(2048, 2048)
          key.shadow.bias = -0.0005
          key.shadow.camera.near = 0.5
          key.shadow.camera.far = 100
          key.shadow.camera.updateProjectionMatrix()
          key.shadow.needsUpdate = true
        }
      }
    }
    // tori/points cast (they live in `stage`)
    this.stage.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = on
    })
    // recompile EVERY lit material so the shadowMap toggle takes effect — crucially
    // the floor (the shadow RECEIVER) lives in the studio group, not `stage`
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material
      if (mat) for (const mm of Array.isArray(mat) ? mat : [mat]) mm.needsUpdate = true
    })
    this.invalidate()
  }

  /** Slide the key light horizontally (world x) — moves the cast shadow left↔right. */
  setKeyLightX(dx: number): void {
    this._keyLightOffsetX = dx
    const h = this.handle
    if (h) {
      const idx = h.spec.lights.findIndex((s) => s.role === 'key')
      if (idx >= 0) h.lights[idx]!.position.x = this._keyLightBaseX + dx
    }
    this.invalidate()
  }

  /** Non-preview light intensities in spec order — for save. */
  get lightIntensities(): number[] {
    const h = this.handle
    if (!h) return []
    const out: number[] = []
    h.spec.lights.forEach((spec, i) => {
      if (spec.kind === 'custom' || spec.previewOnly) return
      out.push(h.lights[i]!.intensity)
    })
    return out
  }

  /** Restore non-preview light intensities saved by lightIntensities. */
  setLightIntensities(vals: number[]): void {
    const h = this.handle
    if (!h) return
    let j = 0
    h.spec.lights.forEach((spec, i) => {
      if (spec.kind === 'custom' || spec.previewOnly) return
      const v = vals[j++]
      if (v !== undefined) h.lights[i]!.intensity = v
    })
    this.invalidate()
  }

  /**
   * Override the visible background (the "back wall") with a solid color, keeping
   * the lighting environment. Pass null to clear (transparent). Reflected in both
   * live and path-traced output.
   */
  setBackground(hex: number | null): void {
    // the FLOOR fills the top-down gallery frame, so color it too (not just the
    // sky background, which the floor hides from overhead)
    if (hex !== null && this.handle?.floor) {
      const mat = this.handle.floor.material as THREE.MeshStandardMaterial
      mat.color.setHex(hex)
    }
    this.scene.background = hex === null ? null : new THREE.Color(hex)
    this.scene.backgroundBlurriness = 0
    if (this._mode === 'trace' && this.pathTracer) {
      this.pathTracer.updateMaterials()
      this.pathTracer.updateEnvironment()
    }
    this.invalidate()
  }

  private viewSize(): [number, number] {
    if (this.fullWindow) return [window.innerWidth, window.innerHeight]
    return [Math.max(1, this.mount.clientWidth), Math.max(1, this.mount.clientHeight)]
  }

  private onResize = (): void => {
    const [vw, vh] = this.viewSize()
    let w = vw
    let h = vh
    // preview-aspect: letterbox the largest box of the target ratio that fits
    if (this._previewAspect) {
      if (vw / vh > this._previewAspect) w = Math.round(vh * this._previewAspect)
      else h = Math.round(vw / this._previewAspect)
    }
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.syncTracer('camera')
    this.invalidate()
  }

  /**
   * Constrain the on-screen viewport to an aspect ratio (letterboxed, centered) so
   * the live preview frames exactly what a render at that aspect will capture.
   * null → fill the window. The final render still uses its own exact pixel size.
   */
  setPreviewAspect(ratio: number | null): void {
    this._previewAspect = ratio
    const el = this.renderer.domElement
    if (ratio) {
      el.style.position = 'absolute'
      el.style.left = '50%'
      el.style.top = '50%'
      el.style.transform = 'translate(-50%, -50%)'
    } else {
      el.style.position = el.style.left = el.style.top = el.style.transform = ''
    }
    this.onResize()
  }

  get previewAspect(): number | null {
    return this._previewAspect
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
