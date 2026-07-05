/**
 * Orbit picking: click a point of E(F_{p^k}) to highlight its Frobenius orbit
 * (gold tube + dimmed complement via scene.select) with a small readout.
 * Drags beyond 5 px are camera moves, not picks.
 */
import * as THREE from 'three'

import type { App } from '@/studio'

import type { CurveScene } from './curve-scene'

export function enableOrbitPicking(app: App, scene: CurveScene): { dispose(): void } {
  const readout = document.createElement('div')
  readout.style.cssText =
    'position:fixed;left:12px;bottom:12px;font:12px system-ui;color:#333;background:rgba(255,255,255,0.85);' +
    'padding:6px 10px;border-radius:6px;display:none'
  document.body.appendChild(readout)

  const raycaster = new THREE.Raycaster()
  let downAt: [number, number] | null = null
  const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY])
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, app.camera)
    const idx = scene.points.instanceAt(raycaster)
    scene.select(idx)
    if (idx !== null) {
      const { E } = scene.scene
      const P = E.points()[idx]!
      readout.textContent =
        `point (${P.x}, ${P.y})/${E.N} · degree ${E.degree(P)} (F_p^${E.degree(P)}) · ` +
        `order ${E.order(P)} · orbit size ${E.degree(P)}`
      readout.style.display = 'block'
    } else {
      readout.style.display = 'none'
    }
  }
  const el = app.renderer.domElement
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)

  return {
    dispose() {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      readout.remove()
    },
  }
}
