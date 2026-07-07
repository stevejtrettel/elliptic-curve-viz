/**
 * showPiece — render a PIECE: one or more tori composed in a single scene.
 *
 * The lever (DESIGN.md §7.5): CurveScene is headless and its `.group` is
 * geometry ALREADY projected out of S³ into ℝ³. So "N tori together" is just N
 * CurveScenes, each wrapped in a `slot` Group carrying a rigid ℝ³ pose. Layout
 * and dragging never touch the S³ math — they only set slot.position/quaternion,
 * which survive re-projection (that rewrites child buffers, not the group matrix).
 *
 * Composition is coarse-then-fine: a LAYOUT template (layout.ts) arranges all
 * tori at once; the GIZMO (place.ts) nudges individuals. A hand-placed file
 * loads as 'Custom' (its saved poses); a fresh file auto-arranges in a Row. Save
 * round-trips the resulting poses back to the file.
 */
import * as THREE from 'three'

import { matte } from '@/geometry'

import {
  App,
  type CameraSpec,
  ControlPanel,
  STUDIOS,
  type StudioHandle,
  type StudioSpec,
  addStudioControls,
  paperWhite,
} from '@/studio'

import { CurveScene } from './curve-scene'
import { type LayoutType, arrange } from './layout'
import type { PieceFile, Placement } from './piece'
import { serializePiece } from './piece'
import { type PlacementHandle, enablePlacement } from './place'

export interface PieceDemoSpec {
  piece: PieceFile
  /** File stem under data/pieces/ — the title, and the save target. */
  name?: string
  /** Studio preset override; piece.studio (by name) otherwise; else paperWhite. */
  studio?: StudioSpec
  /** Camera framing over the studio default. */
  camera?: Partial<CameraSpec>
}

export interface PieceDemo {
  app: App
  scenes: CurveScene[]
  /** One wrapper Group per torus — the ℝ³ pose lives here. */
  slots: THREE.Group[]
  panel: ControlPanel
  studio: StudioHandle
  placement: PlacementHandle
  frame(): void
  /** POST the current slot poses back to data/pieces/<name>.json (dev only). */
  save(): Promise<void>
  dispose(): void
}

export function showPiece(spec: PieceDemoSpec): PieceDemo {
  const { piece } = spec
  const title = spec.name ?? 'piece'

  const app = new App()
  const scenes: CurveScene[] = []
  const slots: THREE.Group[] = []

  for (const entry of piece.tori) {
    const scene = new CurveScene({
      curve: entry.curve,
      k: entry.k ?? 2,
      fibers: entry.fibers ?? 0,
      gridlines: entry.gridlines ?? 0,
      cayley: entry.cayley ?? false,
      colorMode: entry.colorBy ?? 'degree',
      ...(entry.color !== undefined ? { color: entry.color } : {}),
      ...(entry.view ? { view: entry.view } : {}),
      onChange: () => app.invalidate(),
    })
    if (entry.torus === 'matte') scene.torus.setMaterial(matte(0xdde3ea))
    if (entry.torus === false) scene.torus.visible = false

    // wrapper Group: separates the layout/drag pose from the projection group
    const slot = new THREE.Group()
    slot.add(scene.group)
    app.stage.add(slot)
    scenes.push(scene)
    slots.push(slot)
  }

  // intrinsic radii, measured once at scale 1 — the stable basis for every layout
  const radii = slots.map(radiusOf)

  // ── layout: a template arranges all tori; 'custom' = the file's saved poses ──
  const hasSaved = piece.tori.some((t) => t.placement)
  let layoutType: LayoutType | 'custom' = hasSaved ? 'custom' : 'row'
  let spacing = 0.4
  // on by default: tori vary wildly in intrinsic size (some ~10–30× others),
  // so a raw layout is dominated by one giant — equalize reads as "composed"
  let equalize = true
  const applyLayout = () => {
    if (layoutType === 'custom') applySaved(slots, radii, piece)
    else arrange(slots, radii, { type: layoutType, spacing, equalize })
  }
  applyLayout()

  const base = (piece.studio ? STUDIOS[piece.studio] : undefined) ?? spec.studio ?? paperWhite
  const studio = app.setStudio(base)

  const frame = () => app.frame(spec.camera ?? {})

  // ── save round-trip ────────────────────────────────────────────────────────
  const currentPoses = (): Placement[] =>
    slots.map((s) => ({
      position: [s.position.x, s.position.y, s.position.z],
      quaternion: [s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w],
      scale: s.scale.x,
    }))
  const save = async (): Promise<void> => {
    const body = JSON.stringify(serializePiece(piece, currentPoses()), null, 2)
    const res = await fetch(`/api/save-piece?name=${encodeURIComponent(title)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  }

  // ── placement: click a torus, drag/rotate; G/R switch mode, Esc deselect ────
  const placement = enablePlacement(app, slots, {
    onSelect: (i) => {
      status.set(i === null ? 'none — click a torus' : `torus ${i + 1}/${slots.length}`)
      if (i !== null) scaleSlider.set(slots[i]!.scale.x)
    },
    onMode: (m) => modeLabel.set(m === 'translate' ? 'Move (drag on floor)' : 'Rotate (spin)'),
  })

  // re-run the active template, drop any selection, refit the camera
  const relayout = () => {
    applyLayout()
    placement.select(null)
    frame()
    app.invalidate()
  }

  // ── panel ────────────────────────────────────────────────────────────────
  const panel = new ControlPanel({ title })

  const arrangeTab = panel.tab('Arrange')
  const layoutOptions = [
    ...(hasSaved ? [{ label: 'Custom (as saved)', value: 'custom' }] : []),
    { label: 'Row', value: 'row' },
    { label: 'Grid', value: 'grid' },
    { label: 'Ring', value: 'ring' },
  ]
  arrangeTab.dropdown('Layout', { options: layoutOptions, value: layoutType }, (v) => {
    layoutType = v as LayoutType | 'custom'
    relayout()
  })
  arrangeTab.slider('Spacing', { min: 0, max: 2, step: 0.05, value: spacing }, (v) => {
    spacing = v
    if (layoutType !== 'custom') relayout()
  })
  arrangeTab.toggle('Equalize sizes', equalize, (v) => {
    equalize = v
    if (layoutType !== 'custom') relayout()
  })

  const place = panel.tab('Place')
  const status = place.label('Selected', 'none — click a torus')
  const modeLabel = place.label('Mode', 'Move (drag on floor)')
  place.button('Move (G)', () => placement.setMode('translate'))
  place.button('Rotate (R)', () => placement.setMode('rotate'))
  place.toggle('Move vertically', false, (v) => placement.setVertical(v))
  place.toggle('Free rotate (tumble)', false, (v) => placement.setTumble(v))
  // uniform scale of the selected torus (per-axis gizmo scaling would distort it)
  const scaleSlider = place.slider('Scale', { min: 0.1, max: 5, step: 0.05, value: 1 }, (v) => {
    const i = placement.selected()
    if (i === null) return
    slots[i]!.scale.setScalar(v)
    app.invalidate()
  })
  place.button('Save placements', () => {
    saveStatus.set('saving…')
    save().then(
      () => saveStatus.set(`saved ${slots.length} tori → ${title}.json`),
      (err) => saveStatus.set(`save failed: ${err.message}`),
    )
  })
  const saveStatus = place.label('', '')

  addStudioControls(panel, app, studio, { renderName: title })
  panel.mount(document.body)

  frame()
  app.start()

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
