/**
 * showPiece — render a PIECE: one or more tori composed in a single scene.
 *
 * The lever (DESIGN.md §7.5): CurveScene is headless and its `.group` is
 * geometry ALREADY projected out of S³ into ℝ³. So "N tori together" is just N
 * CurveScenes, each wrapped in a `slot` Group carrying a rigid ℝ³ pose. Layout
 * and dragging never touch the S³ math — they only set slot.position/quaternion,
 * which survive re-projection (that rewrites child buffers, not the group matrix).
 *
 * An art demo passes its own `curves` (demos/<name>/curves.json, pure
 * descriptors) and, once authored, a `piece` (the composition). With no piece it
 * starts from a default — one torus per curve. The panel:
 *   Arrange  — layout template (coarse) + gizmo move/rotate + Save
 *   Donut i  — one styling panel per torus: k / lobes / points / colors /
 *              surface / cayley / scale (all bound directly to that torus)
 *   Studio   — lighting/camera
 * Save reads the LIVE state off every scene and writes demos/<name>/piece.json.
 */
import * as THREE from 'three'

import { type PaperOptions, glass, loadNormalMap, matte, paper } from '@/geometry'

import {
  App,
  type CameraSpec,
  ControlPanel,
  STUDIOS,
  type ExportControlsHandle,
  type StudioHandle,
  type StudioSpec,
  type Tab,
  addExportControls,
  addStudioControls,
  bright,
  colored,
  dark,
} from '@/studio'

import type { LabeledCurve } from './catalog'
import { type CayleyBasis, type ColorMode, CurveScene } from './curve-scene'
import { type LayoutType, arrange, reflow } from './layout'
import type { PieceCamera, PieceFile, PieceLook, Placement, TorusEntry } from './piece'
import { serializePiece } from './piece'
import { type PlacementHandle, enablePlacement } from './place'

const DEFAULT_POINT_RADIUS = 0.035
const DEFAULT_COLOR = 0xd43b3b
const DEFAULT_SURFACE_COLOR = 0xc9eaff
// pieces are viewed from overhead — the paper's top rig (torus-lifts CAMERA_RIGS.top):
// camera nearly straight down, the floor as backdrop (elevation shy of 90° dodges
// the straight-down gimbal singularity)
const TOPDOWN_CAMERA: Partial<CameraSpec> = { azimuth: 2.36, elevation: 1.556, fill: 0.72, fov: 50 }

type Surface = 'glass' | 'matte' | 'paper' | false

export interface PieceDemoSpec {
  /** Demo folder name — panel title and Save target (demos/<name>/piece.json). */
  name?: string
  /** The demo's curves.json (parsed) — the catalog its curve refs resolve against. */
  curves?: LabeledCurve[]
  /** The composition. Absent → a default, one torus per curve. */
  piece?: PieceFile
  /** 'demo' → demos/<name>/piece.json (default); 'sandbox' → data/pieces/<name>.json. */
  saveMode?: 'demo' | 'sandbox'
  studio?: StudioSpec
  camera?: Partial<CameraSpec>
}

export interface PieceDemo {
  app: App
  scenes: CurveScene[]
  slots: THREE.Group[]
  panel: ControlPanel
  studio: StudioHandle
  placement: PlacementHandle
  frame(): void
  save(): Promise<void>
  dispose(): void
}

/** Per-torus render state not exposed as CurveScene getters (tracked for save). */
interface RenderState {
  color: number
  pointRadius: number
  surface: Surface
  surfaceColor: number
}

/** A donut tab's color-picker displays, so a synced change can refresh them. */
interface DonutColorUI {
  setUniform(hex: number): void
  setDegree(d: number, hex: number): void
}

/** Broadcasts a point-color change from one curve to itself, or to all when synced. */
interface ColorSyncCtx {
  register(i: number, ui: DonutColorUI): void
  uniform(origin: number, hex: number): void
  degree(origin: number, d: number, hex: number): void
}

export function showPiece(spec: PieceDemoSpec): PieceDemo {
  const title = spec.name ?? 'piece'
  const curves = spec.curves
  const piece = spec.piece ?? defaultPiece(curves)

  const app = new App()
  const scenes: CurveScene[] = []
  const slots: THREE.Group[] = []
  const render: RenderState[] = piece.tori.map((e) => ({
    color: e.color ?? DEFAULT_COLOR,
    pointRadius: e.pointRadius ?? DEFAULT_POINT_RADIUS,
    surface: (e.torus ?? 'matte') as Surface, // opaque by default
    surfaceColor: e.surfaceColor ?? DEFAULT_SURFACE_COLOR,
  }))
  // surface is UNIFORM across a piece (style is global, positioning stays per-curve):
  // collapse to the global look, or torus 0's saved value for pre-global pieces.
  const globalSurface: Surface = piece.look?.surface ?? render[0]?.surface ?? 'matte'
  const globalSurfaceColor = piece.look?.surfaceColor ?? render[0]?.surfaceColor ?? DEFAULT_SURFACE_COLOR
  for (const rs of render) {
    rs.surface = globalSurface
    rs.surfaceColor = globalSurfaceColor
  }

  // the 'paper' surface grain: normal maps loaded (and cached) by filename, async —
  // re-syncs the view and tracer on decode. paperState is global; paperOpts() live.
  const normalCache = new Map<string, THREE.Texture | null>()
  const getNormal = (file: string): THREE.Texture | null => {
    if (!normalCache.has(file)) normalCache.set(file, loadNormalMap(file, { repeat: 4 }, () => app.refreshMaterials()))
    return normalCache.get(file) ?? null
  }
  const paperState = {
    normalScale: piece.look?.paperScale ?? 1,
    map: piece.look?.paperMap ?? 'crease-rough.png',
  }
  const paperOpts = (): PaperOptions => ({ normalMap: getNormal(paperState.map), normalScale: paperState.normalScale })

  piece.tori.forEach((entry, i) => {
    const scene = new CurveScene({
      ...(curves ? { curves } : {}),
      curve: entry.curve,
      k: entry.k ?? 2,
      // pieces are always the paper family (torus-lifts look): n = lobes, a = skew,
      // amplitude b solved from τ. `profile: {a, n}` is shorthand for those two.
      // (Non-wall/rectangular τ have no paper solution → the general solver's
      // latitude circle, exactly as the paper drew them.)
      lobes: entry.profile?.n ?? entry.lobes ?? null,
      skew: entry.profile?.a ?? entry.skew ?? 0,
      paper: true,
      fibers: entry.fibers ?? 0,
      gridlines: entry.gridlines ?? 0,
      cayley: entry.cayley ?? false,
      cayleyBasis: entry.cayleyBasis ?? 'reduced',
      colorMode: entry.colorBy ?? 'degree',
      color: render[i]!.color,
      ...(entry.degreeColors ? { degreeColors: entry.degreeColors } : {}),
      pointRadius: render[i]!.pointRadius,
      subfieldBoost: false, // torus-lifts: no subfield radius boost
      ...(entry.view ? { view: entry.view } : {}),
      onChange: () => app.invalidate(),
    })
    applySurface(scene, render[i]!.surface, render[i]!.surfaceColor, paperOpts())

    const slot = new THREE.Group()
    // torus-lifts lays the donut flat: the projected axis is z, so tip it so the
    // hole faces the top-down camera (same as legacy's post-projection swizzle)
    scene.group.rotation.x = -Math.PI / 2
    slot.add(scene.group)
    app.stage.add(slot)
    scenes.push(scene)
    slots.push(slot)
  })

  // intrinsic radii, measured once at scale 1 — the stable basis for every layout
  const radii = slots.map(radiusOf)

  // ── color sync (multi-torus): when on, a color set on one torus applies to all,
  // updating their scenes/render state AND their pickers; off = independent ──
  const colorSync = { on: false }
  const donutUI: (DonutColorUI | undefined)[] = new Array(slots.length)
  const colorTargets = (origin: number): number[] => (colorSync.on ? slots.map((_, i) => i) : [origin])
  const colorCtx: ColorSyncCtx = {
    register: (idx, ui) => {
      donutUI[idx] = ui
    },
    uniform: (origin, h) => {
      for (const i of colorTargets(origin)) {
        render[i]!.color = h
        scenes[i]!.setColor(h)
        scenes[i]!.setColorMode('uniform')
        donutUI[i]?.setUniform(h)
      }
      app.invalidate()
    },
    degree: (origin, d, h) => {
      for (const i of colorTargets(origin)) {
        scenes[i]!.setDegreeColor(d, h) // sets the layer color + switches to Subfield mode
        donutUI[i]?.setDegree(d, h)
      }
      app.invalidate()
    },
  }

  // ── layout state ────────────────────────────────────────────────────────
  // Saved per-torus placements are AUTHORITATIVE — they carry the exact pose
  // (position/rotation/scale) the user left, so a piece with any placement loads
  // as 'custom' and honors it. A template re-derives poses (and resets rotation
  // to identity), so it must NOT auto-run on top of saved placements; piece.layout
  // only pre-fills the spacing/equalize controls for when a template is re-picked.
  const hasSaved = piece.tori.some((t) => t.placement)
  let layoutType: LayoutType | 'custom' = hasSaved ? 'custom' : (piece.layout?.type ?? 'row')
  let spacing = piece.layout?.spacing ?? 0.4
  let equalize = piece.layout?.equalize ?? true
  const applyLayout = () => {
    if (layoutType === 'custom') applySaved(slots, radii, piece)
    else arrange(slots, radii, { type: layoutType, spacing, equalize })
  }
  applyLayout()

  const base = (piece.studio ? STUDIOS[piece.studio] : undefined) ?? spec.studio ?? bright
  const studio = app.setStudio(base)
  // restore the saved live look on top of the preset BEFORE the panels build, so
  // every Studio control initializes from these values (not the preset defaults)
  if (piece.look) {
    if (piece.look.background !== undefined) app.setBackground(piece.look.background)
    if (piece.look.exposure !== undefined) app.renderer.toneMappingExposure = piece.look.exposure
    if (piece.look.envIntensity !== undefined) app.scene.environmentIntensity = piece.look.envIntensity
    if (piece.look.floorOffset !== undefined) app.setFloorOffset(piece.look.floorOffset)
    if (piece.look.keyLightX !== undefined) app.setKeyLightX(piece.look.keyLightX)
    if (piece.look.lights) app.setLightIntensities(piece.look.lights)
  }
  // per-piece camera: an explicit demo override, else the saved one, else top-down
  const startCamera: Partial<CameraSpec> = spec.camera ?? piece.camera ?? TOPDOWN_CAMERA
  const frame = () => app.frame(startCamera)

  // ── save: read the LIVE settings off each scene, write the piece file ───────
  const liveEntry = (i: number): TorusEntry => {
    const scene = scenes[i]!
    const r = render[i]!
    const entry: TorusEntry = {
      curve: piece.tori[i]!.curve,
      k: scene.k,
      lobes: scene.lobes,
      fibers: scene.fibers,
      // paper family round-trips as `profile: {a, n}` (a = skew, n = lobes)
      ...(scene.paper && scene.lobes !== null
        ? { profile: { a: scene.skew, n: scene.lobes } }
        : scene.skew !== 0
          ? { skew: scene.skew }
          : {}),
      colorBy: scene.colorMode,
      pointRadius: r.pointRadius,
      // surface/surfaceColor are GLOBAL now — saved once in look, not per curve
    }
    if (scene.colorMode === 'uniform') entry.color = r.color
    if (Object.keys(scene.degreeColors).length) entry.degreeColors = scene.degreeColors
    if (scene.gridlines) entry.gridlines = scene.gridlines
    if (scene.cayley.length) {
      entry.cayley = scene.cayley
      entry.cayleyBasis = scene.cayleyBasis
    }
    const v = scene.view
    if (v.alpha || v.beta || v.gamma || v.pole) entry.view = v
    return entry
  }
  const currentPoses = (): Placement[] =>
    slots.map((s) => ({
      position: [s.position.x, s.position.y, s.position.z],
      quaternion: [s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w],
      scale: s.scale.x,
    }))
  // read the live camera (after the user has orbited/zoomed) back into a spec
  const currentCamera = (): PieceCamera => {
    const azimuth = app.controls.getAzimuthalAngle()
    const elevation = Math.PI / 2 - app.controls.getPolarAngle()
    const dist = app.camera.position.distanceTo(app.controls.target)
    const tan = Math.tan(THREE.MathUtils.degToRad(app.camera.fov / 2))
    const radius = app.stageBounds().radius
    const camera: PieceCamera = { azimuth, elevation }
    if (dist > 0 && tan > 0) camera.fill = radius / (dist * tan)
    return camera
  }
  // assigned when the Export tab is built (below); read at save time
  let exportHandle: ExportControlsHandle | undefined
  // the live studio look (background/exposure/env/lights) read straight off the app
  const liveLook = (): PieceLook => {
    const look: PieceLook = {
      surface: render[0]!.surface, // surface is uniform across the piece
      surfaceColor: render[0]!.surfaceColor,
      ...(render[0]!.surface === 'paper' ? { paperScale: paperState.normalScale, paperMap: paperState.map } : {}),
      exposure: app.renderer.toneMappingExposure,
      envIntensity: app.scene.environmentIntensity,
    }
    const bg = app.backgroundColor
    if (bg !== null) look.background = bg
    if (app.floorOffset !== 0) look.floorOffset = app.floorOffset
    if (app.keyLightX !== 0) look.keyLightX = app.keyLightX
    const lights = app.lightIntensities
    if (lights.length) look.lights = lights
    return look
  }
  const livePiece = (): PieceFile => ({
    tori: piece.tori.map((_, i) => liveEntry(i)),
    camera: currentCamera(),
    ...(layoutType !== 'custom' ? { layout: { type: layoutType, spacing, equalize } } : {}),
    ...(app.studioName !== undefined ? { studio: app.studioName } : {}),
    look: liveLook(),
    ...(exportHandle ? { export: exportHandle.state() } : {}),
  })
  const save = async (): Promise<void> => {
    const body = JSON.stringify(serializePiece(livePiece(), currentPoses()), null, 2)
    const query = spec.saveMode === 'sandbox' ? `name=${encodeURIComponent(title)}` : `demo=${encodeURIComponent(title)}`
    const res = await fetch(`/api/save-piece?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  }

  // ── placement: click a torus → gizmo (drives the Arrange tab) ───────────────
  const placement = enablePlacement(app, slots, {
    onSelect: (i) => status.set(i === null ? 'none — click a curve' : `curve ${i + 1}/${slots.length}`),
    onMode: (m) => {
      modeToggle.set(m === 'rotate')
      modeToggle.setLabel(m === 'translate' ? 'Tool: Move (drag on floor)' : 'Tool: Rotate (free)')
    },
  })
  const relayout = () => {
    applyLayout()
    placement.select(null)
    frame()
    app.invalidate()
  }

  // ── panel ───────────────────────────────────────────────────────────────
  const panel = new ControlPanel({ title })

  // Arrange: layout template (coarse) + gizmo move/rotate (fine) + Save. The
  // multi-torus LAYOUT controls (template/spacing/equalize) only make sense with
  // 2+ tori — a single-torus piece just gets the gizmo + Save.
  const arrangeTab = panel.tab('Arrange')
  const multi = slots.length > 1
  if (multi) {
    arrangeTab.section('Layout')
    const layoutOptions = [
      ...(hasSaved || layoutType === 'custom' ? [{ label: 'Custom (as saved)', value: 'custom' }] : []),
      { label: 'Row', value: 'row' },
      { label: 'Column', value: 'column' },
      { label: 'Grid', value: 'grid' },
      { label: 'Ring', value: 'ring' },
    ]
    arrangeTab.dropdown('Layout', { options: layoutOptions, value: layoutType }, (v) => {
      layoutType = v as LayoutType | 'custom'
      relayout()
    })
    arrangeTab.slider('Spacing', { min: 0, max: 2, step: 0.05, value: spacing }, (v) => {
      spacing = v
      // reflow = reposition only; preserves each torus's manual scale + rotation
      if (layoutType !== 'custom') {
        reflow(slots, radii, { type: layoutType, spacing })
        app.invalidate()
      }
    })
    arrangeTab.toggle('Equalize sizes', equalize, (v) => {
      equalize = v
      if (layoutType !== 'custom') relayout()
    })
    // sync colors across tori: a color set on one applies to all
    arrangeTab.toggle('Sync colors', colorSync.on, (on) => {
      colorSync.on = on
    })
  }
  if (multi) arrangeTab.section('Place')
  const status = arrangeTab.label('Selected', multi ? 'none — click a curve' : 'the curve')
  // one toggle flips the gizmo between Move and Rotate (keys G/R sync it)
  const modeToggle = arrangeTab.toggle('Tool: Move (drag on floor)', false, (on) =>
    placement.setMode(on ? 'rotate' : 'translate'),
  )
  arrangeTab.toggle('Move vertically', false, (v) => placement.setVertical(v))
  arrangeTab.button('Save', () => runSave())
  const saveStatus = arrangeTab.label('', '')

  // One styling panel per donut, bound directly to that torus.
  piece.tori.forEach((_, i) =>
    buildDonutTab(panel, i, scenes[i]!, slots[i]!, render[i]!, placement, colorCtx, () => app.invalidate()),
  )

  // the surface material is GLOBAL (uniform across the piece) — it lives in Studio,
  // applied to every curve at once. Positioning stays per-curve.
  const applyGlobalSurface = (s: Surface, c: number): void => {
    for (let i = 0; i < scenes.length; i++) {
      render[i]!.surface = s
      render[i]!.surfaceColor = c
      applySurface(scenes[i]!, s, c, paperOpts())
    }
    app.invalidate()
  }
  const surfaceExtras = (tab: Tab): void => {
    tab.section('Surface')
    tab.dropdown(
      'Surface',
      { options: SURFACES, value: render[0]!.surface === false ? 'hidden' : render[0]!.surface },
      (v) => applyGlobalSurface(v === 'hidden' ? false : (v as 'glass' | 'matte' | 'paper'), render[0]!.surfaceColor),
    )
    tab.color('Surface color', hex(render[0]!.surfaceColor), (h) => applyGlobalSurface(render[0]!.surface, parseHex(h)))
    // paper grain map + strength — only meaningful when the surface is 'paper'
    tab.dropdown(
      'Paper texture',
      { options: PAPER_MAPS.map((f) => ({ label: f.replace(/\.(jpg|png)$/, ''), value: f })), value: paperState.map },
      (v) => {
        paperState.map = v
        applyGlobalSurface(render[0]!.surface, render[0]!.surfaceColor)
      },
    )
    tab.slider('Paper grain', { min: 0, max: 3, step: 0.05, value: paperState.normalScale }, (v) => {
      paperState.normalScale = v
      applyGlobalSurface(render[0]!.surface, render[0]!.surfaceColor)
    })
  }
  addStudioControls(panel, app, studio, {
    renderName: title,
    capture: false,
    studios: [bright, colored, dark],
    extras: surfaceExtras,
  })
  exportHandle = addExportControls(panel, app, {
    renderName: title,
    ...(piece.export?.aspect !== undefined ? { aspect: piece.export.aspect } : {}),
    ...(piece.export?.longEdge !== undefined ? { longEdge: piece.export.longEdge } : {}),
    onHighRes: (on) => {
      for (const s of scenes) s.setHighRes(on)
      app.invalidate()
    },
    // scene data = the FULL live piece (composition + layout + camera + studio +
    // look + export), enough to rebuild the exact image; buildSidecar adds the
    // render settings + camera pose on top.
    sidecar: () => ({ piece: serializePiece(livePiece(), currentPoses()) }),
  })
  panel.mount(document.body)

  function runSave(): void {
    saveStatus.set('saving…')
    save().then(
      () => saveStatus.set(`saved ${slots.length} tori → ${title}`),
      (err) => saveStatus.set(`save failed: ${err.message}`),
    )
  }

  frame()
  app.start()
  // ?trace previews the piece in pathtracing mode (to check the final look)
  if (new URLSearchParams(location.search).get('trace') !== null) app.mode = 'trace'

  return {
    app,
    scenes,
    slots,
    panel,
    studio,
    placement,
    frame,
    save,
    dispose() {
      placement.dispose()
      panel.domElement.remove()
      for (const s of scenes) s.dispose()
      app.dispose()
    },
  }
}

/** Build the styling tab for one donut — every control bound directly to it. */
function buildDonutTab(
  panel: ControlPanel,
  i: number,
  scene: CurveScene,
  slot: THREE.Group,
  r: RenderState,
  placement: PlacementHandle,
  colors: ColorSyncCtx,
  invalidate: () => void,
): void {
  const tab = panel.tab(`Curve ${i + 1}`)
  // NB: parameter tweaks never call frame() — the camera stays exactly where you
  // left it. Only an explicit re-frame (Arrange/save/load) moves the camera.
  tab.label('Curve', scene.curve.label)

  // ── Complex curve: E(ℂ) = ℂ/Λ_τ, drawn as the Hopf torus shape ──
  tab.section('Complex curve')
  tab.dropdown(
    'Lobes n',
    { options: LOBE_OPTIONS, value: scene.lobes === null ? 'auto' : String(scene.lobes) },
    (v) => {
      scene.setLobes(v === 'auto' ? null : Number(v))
      invalidate()
    },
  )
  tab.slider('Skew (twist)', { min: 0, max: 0.4, step: 0.005, value: scene.skew }, (v) => {
    scene.setSkew(v)
    invalidate()
  })

  // ── Finite curve: E(F_p^k) — the points laid on the torus ──
  tab.section('Finite curve')
  // refreshColorUI = show the right pickers for the current mode/k (local display only)
  let refreshColorUI = (): void => {}
  const kDrop = tab.dropdown('k (point field)', { options: kOptions(scene.maxK), value: String(scene.k) }, (v) => {
    const applied = scene.setK(Number(v))
    if (applied !== Number(v)) kDrop.set(String(applied)) // k clamps to maxK
    refreshColorUI() // the drawn field changed → show only the subfields now present
    invalidate()
  })
  const colorModeDrop = tab.dropdown('Point color', { options: COLOR_MODES, value: scene.colorMode }, (v) => {
    scene.setColorMode(v as ColorMode)
    refreshColorUI() // reveal the pickers for the chosen mode
    invalidate()
  })
  // color changes go through `colors` so they honor the Sync-colors toggle (this
  // torus only, or all tori) and keep every tab's pickers in agreement.
  const uniformPicker = tab.color('Uniform color', hex(r.color), (h) => colors.uniform(i, parseHex(h)))
  // one picker per subfield layer F_p^d — the 'Subfield' palette. Which layers EXIST
  // depends on the drawn field: F_{p^k} has a layer for each divisor of k that has
  // points (F_5 → just F_p; F_{5^6} → F_p, F_p², F_p³, F_p⁶, no 4th). Build a picker
  // for every possible degree (1…maxK); show only those present at the current k AND
  // only in Subfield mode. Full field first, F_p last.
  const subfieldLabel = (d: number) => (d === 1 ? 'F_p pts' : `F_p^${d} pts`)
  const subfieldPickers = new Map<number, ReturnType<typeof tab.color>>()
  for (let d = scene.maxK; d >= 1; d--) {
    subfieldPickers.set(
      d,
      tab.color(subfieldLabel(d), hex(scene.degreeColor(d)), (h) => colors.degree(i, d, parseHex(h))),
    )
  }
  // show the Uniform box only in 'uniform' mode; the subfield boxes only in 'degree'
  // mode (and only for the degrees actually present at the current k).
  refreshColorUI = () => {
    const present = new Set(scene.degrees)
    uniformPicker.row.style.display = scene.colorMode === 'uniform' ? '' : 'none'
    for (const [d, pick] of subfieldPickers) {
      pick.row.style.display = scene.colorMode === 'degree' && present.has(d) ? '' : 'none'
      pick.set(hex(scene.degreeColor(d))) // refresh the warm-ramp default for this k
    }
  }
  refreshColorUI()
  // register this tab's picker displays so synced changes from other tori update them
  colors.register(i, {
    setUniform: (h) => {
      uniformPicker.set(hex(h))
      colorModeDrop.set('uniform')
      refreshColorUI()
    },
    setDegree: (d, h) => {
      subfieldPickers.get(d)?.set(hex(h))
      colorModeDrop.set('degree')
      refreshColorUI()
    },
  })
  tab.slider('Point size', { min: 0.005, max: 0.12, step: 0.005, value: r.pointRadius }, (v) => {
    r.pointRadius = v
    scene.points.setBaseRadius(v)
    invalidate()
  })
  tab.dropdown('Cayley edges', { options: CAYLEY_EDGES, value: cayleyValue(scene.cayley) }, (v) => {
    scene.setCayley(cayleyFromValue(v))
    invalidate()
  })
  tab.dropdown('Cayley basis', { options: CAYLEY_BASES, value: scene.cayleyBasis }, (v) => {
    scene.setCayleyBasis(v as CayleyBasis)
    invalidate()
  })

  // ── Positioning: rotate the S³ torus (sets the hole / look), then scale in ℝ³ ──
  tab.section('Positioning')
  tab.button('Select in view', () => placement.select(i))
  const pose = (name: 'alpha' | 'beta' | 'gamma' | 'pole', label: string, max: number) =>
    tab.slider(label, { min: 0, max, step: 0.01, value: scene.view[name] }, (v) => {
      scene.setView({ [name]: v })
      invalidate()
    })
  pose('alpha', 'Pose α', 2 * Math.PI)
  pose('beta', 'Pose β', 2 * Math.PI)
  pose('gamma', 'Pose γ', Math.PI)
  pose('pole', 'Pole tilt', Math.PI)
  tab.slider('Scale', { min: 0.1, max: 5, step: 0.05, value: slot.scale.x }, (v) => {
    slot.scale.setScalar(v)
    invalidate()
  })

  // ── Fibers: the Hopf fibers over the profile (surface material is now global,
  // in the Studio tab). ──
  tab.section('Fibers')
  tab.slider('Fibers', { min: 0, max: 24, step: 1, value: scene.fibers }, (v) => {
    scene.setFibers(v)
    invalidate()
  })
}

const LOBE_OPTIONS = [
  { label: 'auto', value: 'auto' },
  ...Array.from({ length: 20 }, (_, i) => i + 1).map((n) => ({ label: String(n), value: String(n) })),
]
// the gallery colors points two ways: by subfield of definition ('degree') or a
// flat 'uniform'. (order/orbit/coset modes exist on the scene but aren't exposed here.)
const COLOR_MODES = [
  { label: 'Subfield', value: 'degree' },
  { label: 'Uniform', value: 'uniform' },
]
const SURFACES = [
  { label: 'Glass', value: 'glass' },
  { label: 'Matte', value: 'matte' },
  { label: 'Paper', value: 'paper' },
  { label: 'Hidden', value: 'hidden' },
]
// grain normal maps for the 'paper' surface (assets/textures/); crease-rough is the
// most visibly textured (matches low-vertex-flat-tori's paper renders).
const PAPER_MAPS = ['crease-rough.png', 'paper-normal.jpg', 'rough2.png', 'stone-normal.png']
const CAYLEY_EDGES = [
  { label: 'Off', value: 'off' },
  { label: 'g₁ (green)', value: 'g1' },
  { label: 'g₂ (purple)', value: 'g2' },
  { label: 'Both', value: 'both' },
]
const CAYLEY_BASES = [
  { label: 'Reduced', value: 'reduced' },
  { label: 'Structure', value: 'structure' },
]

const cayleyValue = (c: number[]): string =>
  c.length === 0 ? 'off' : c.length === 2 ? 'both' : c[0] === 0 ? 'g1' : 'g2'
const cayleyFromValue = (v: string): number[] => (v === 'off' ? [] : v === 'g1' ? [0] : v === 'g2' ? [1] : [0, 1])

/** k dropdown options 1…maxK. */
function kOptions(maxK: number): { label: string; value: string }[] {
  return Array.from({ length: Math.max(maxK, 1) }, (_, j) => ({ label: String(j + 1), value: String(j + 1) }))
}

/** No composition yet → one torus per curve at k = 2. */
function defaultPiece(curves?: LabeledCurve[]): PieceFile {
  if (!curves || curves.length === 0) throw new Error('showPiece: provide a piece or a non-empty curves list')
  return { tori: curves.map((_, i) => ({ curve: i, k: 2 })) }
}

/** Apply a torus surface + tint (glass/matte); false hides it. */
function applySurface(scene: CurveScene, s: Surface, color: number, paperOpts?: PaperOptions): void {
  scene.torus.visible = s !== false
  if (s === 'matte') scene.torus.setMaterial(matte(color))
  else if (s === 'glass') scene.torus.setMaterial(glass(color))
  else if (s === 'paper') scene.torus.setMaterial(paper(color, paperOpts))
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`
const parseHex = (h: string): number => parseInt(h.replace(/^#/, ''), 16)

/**
 * 'Custom' layout: a Row base, then each torus's saved `placement` overrides it
 * (so a torus without a saved pose still lands somewhere sensible).
 */
function applySaved(slots: THREE.Group[], radii: number[], piece: PieceFile): void {
  arrange(slots, radii, { type: 'row', spacing: 0.4, equalize: false })
  slots.forEach((slot, i) => {
    const p = piece.tori[i]!.placement
    if (p) {
      slot.position.fromArray(p.position)
      slot.quaternion.fromArray(p.quaternion)
      slot.scale.setScalar(p.scale ?? 1)
    }
  })
}

const _box = new THREE.Box3()
const _sphere = new THREE.Sphere()

/** Bounding-sphere radius of a slot's projected geometry (at its current pose). */
function radiusOf(slot: THREE.Object3D): number {
  _box.setFromObject(slot)
  if (_box.isEmpty()) return 1
  _box.getBoundingSphere(_sphere)
  return Math.max(_sphere.radius, 1e-6)
}
