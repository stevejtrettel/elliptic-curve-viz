/**
 * Capture and export (DESIGN.md §7): screenshots (both modes), sample-budgeted
 * final renders with the optional reproducibility sidecar, OBJ export.
 */
import type * as THREE from 'three'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'

import type { App } from './app'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveScreenshot(app: App, filename = 'screenshot.png'): Promise<void> {
  downloadBlob(await app.screenshot(), filename)
}

/** Path-trace to the sample budget, then download PNG (+ sidecar JSON beside it). */
export async function saveRenderFinal(
  app: App,
  opts: { samples?: number; scale?: number; sidecar?: Record<string, unknown>; name?: string } = {},
): Promise<void> {
  const name = opts.name ?? 'render'
  const result = await app.renderFinal(opts)
  downloadBlob(result.image, `${name}.png`)
  if (result.sidecar) downloadBlob(result.sidecar, `${name}.json`)
}

export function saveOBJ(object: THREE.Object3D, filename = 'export.obj'): void {
  const text = new OBJExporter().parse(object)
  downloadBlob(new Blob([text], { type: 'text/plain' }), filename)
}
