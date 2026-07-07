/**
 * Placement — drag/rotate a torus in ℝ³ to compose a piece (DESIGN.md §7.5).
 *
 * Fine pass on top of the layout templates (layout.ts). Click a torus to attach
 * a gizmo to its slot Group; the gizmo transforms slot.position/quaternion — the
 * ℝ³ pose — never the S³ math. Design choices target the three things that make
 * free 3D placement clunky:
 *
 *   • Selection is forgiving + visible — you pick a torus by clicking anywhere
 *     inside its bounding sphere (not the thin glass ring), and the selected
 *     torus wears a highlight box so you always know what's active.
 *   • Depth isn't a guess — translate is constrained to the ground (XZ) plane by
 *     default, so dragging slides a torus across the floor like an object on a
 *     table. Vertical lift is an explicit opt-in.
 *   • Rotate defaults to spin-in-place about vertical (the common move); full
 *     tumble is opt-in.
 *
 * OrbitControls is suspended while the gizmo drags (dragging-changed) so a
 * placement drag never doubles as a camera move; a press that travels more than
 * the threshold is a camera orbit, not a pick (same rule as pick.ts).
 */
import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

import type { App } from '@/studio'

/** Pixels of pointer travel above which a press is a camera drag, not a pick. */
const DRAG_PX = 5

export type PlaceMode = 'translate' | 'rotate'

export interface Placement3D {
  /** Fired whenever a slot's pose changes (gizmo drag) — for save/invalidate. */
  onChange?: () => void
  /** Fired when the selected slot changes (index or null) — for UI readout. */
  onSelect?: (index: number | null) => void
  /** Fired when the gizmo mode changes — to sync the UI's mode buttons. */
  onMode?: (mode: PlaceMode) => void
}

export interface PlacementHandle {
  selected(): number | null
  select(index: number | null): void
  mode(): PlaceMode
  setMode(mode: PlaceMode): void
  /** Allow vertical (Y) translation in Move mode (default off = ground plane). */
  setVertical(on: boolean): void
  /** Allow full tumble in Rotate mode (default off = spin about vertical). */
  setTumble(on: boolean): void
  dispose(): void
}

export function enablePlacement(app: App, slots: THREE.Group[], opts: Placement3D = {}): PlacementHandle {
  const el = app.renderer.domElement
  const raycaster = new THREE.Raycaster()

  const control = new TransformControls(app.camera, el)
  control.setSpace('local')
  app.scene.add(control.getHelper())

  // highlight box on the selected torus — the "what's active" cue
  const highlight = new THREE.BoxHelper(new THREE.Object3D(), 0x2b7fff)
  ;(highlight.material as THREE.LineBasicMaterial).depthTest = false
  highlight.visible = false
  highlight.renderOrder = 999
  app.scene.add(highlight)

  let index: number | null = null
  let vertical = false
  let tumble = false

  // constrain the gizmo handles to the current mode's intent
  const applyAxes = () => {
    if (control.getMode() === 'translate') {
      control.showX = true
      control.showY = vertical // off → drag on the ground plane, no depth guessing
      control.showZ = true
    } else {
      control.showX = tumble
      control.showY = true // on → spin in place about vertical
      control.showZ = tumble
    }
  }

  const setMode = (m: PlaceMode) => {
    control.setMode(m)
    applyAxes()
    opts.onMode?.(m)
  }
  // initial mode set directly — onMode listeners aren't wired until the UI is up
  control.setMode('translate')
  applyAxes()

  // Suspend orbiting while the gizmo drags; rebake + track highlight on change.
  let dragging = false
  control.addEventListener('dragging-changed', (e) => {
    dragging = (e as unknown as { value: boolean }).value
    app.controls.enabled = !dragging
  })
  control.addEventListener('objectChange', () => {
    if (index !== null) highlight.setFromObject(slots[index]!)
    app.invalidate()
    opts.onChange?.()
  })

  const select = (i: number | null) => {
    if (i === index) return
    index = i
    if (i === null) {
      control.detach()
      highlight.visible = false
    } else {
      control.attach(slots[i]!)
      highlight.setFromObject(slots[i]!)
      highlight.visible = true
    }
    app.invalidate()
    opts.onSelect?.(i)
  }

  // ── pick: a click (not a drag) selects the nearest torus under the ray ──────
  let downAt: [number, number] | null = null
  const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY])
  const onUp = (e: PointerEvent) => {
    // gizmo drags and camera orbits both move the pointer — neither is a pick
    if (dragging || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > DRAG_PX) return
    const box = el.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, app.camera)
    select(nearestSlot(raycaster.ray, slots))
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)

  // ── keys: G translate, R rotate, Esc deselect ─────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
    if (e.key === 'g' || e.key === 'G') setMode('translate')
    else if (e.key === 'r' || e.key === 'R') setMode('rotate')
    else if (e.key === 'Escape') select(null)
  }
  window.addEventListener('keydown', onKey)

  return {
    selected: () => index,
    select,
    mode: () => control.getMode() as PlaceMode,
    setMode,
    setVertical: (on) => {
      vertical = on
      applyAxes()
    },
    setTumble: (on) => {
      tumble = on
      applyAxes()
    },
    dispose() {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      control.detach()
      app.scene.remove(control.getHelper())
      control.dispose()
      app.scene.remove(highlight)
      highlight.geometry.dispose()
      app.controls.enabled = true
    },
  }
}

const _box = new THREE.Box3()
const _sphere = new THREE.Sphere()
const _hit = new THREE.Vector3()

/**
 * Nearest slot whose bounding sphere the ray pierces — a forgiving hit test that
 * selects a torus from anywhere over its body, not just the thin glass ring.
 */
function nearestSlot(ray: THREE.Ray, slots: THREE.Group[]): number | null {
  let best: number | null = null
  let bestDist = Infinity
  slots.forEach((slot, i) => {
    _box.setFromObject(slot)
    if (_box.isEmpty()) return
    _box.getBoundingSphere(_sphere)
    if (ray.intersectSphere(_sphere, _hit)) {
      const d = ray.origin.distanceToSquared(_hit)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
  })
  return best
}
