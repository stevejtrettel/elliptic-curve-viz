/**
 * Texture assets for surface materials (paper grain, etc). Drop image files in
 * `assets/textures/` at the repo root; load by filename. Vite needs a static,
 * file-relative glob — from `src/geometry/` the assets dir is `../../assets/textures`.
 *
 * Impure render boundary (three.js). Ported from low-vertex-flat-tori's normalMap.ts.
 */
import * as THREE from 'three'

const ASSET_URLS = import.meta.glob('../../assets/textures/*.{png,jpg,jpeg,webp}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** URL for an asset by filename (e.g. 'paper-normal.jpg'), or undefined if absent. */
export function textureUrl(filename: string): string | undefined {
  return ASSET_URLS[`../../assets/textures/${filename}`]
}

/** Names of the available texture assets. */
export function textureNames(): string[] {
  return Object.keys(ASSET_URLS).map((p) => p.split('/').pop()!)
}

export interface NormalMapOptions {
  /** How many times the map tiles per UV unit (default 1). */
  repeat?: number
}

/**
 * Load a tileable normal map from assets/textures by filename. Returns the Texture
 * immediately (it fills in once decoded); `onLoad` fires after — use it to notify
 * the path tracer / re-render. RepeatWrapping + linear color space (NOT sRGB).
 * Returns null (+ warns) if the file is missing.
 */
export function loadNormalMap(
  filename: string,
  opts: NormalMapOptions = {},
  onLoad?: (tex: THREE.Texture) => void,
): THREE.Texture | null {
  const url = textureUrl(filename)
  if (!url) {
    console.warn(`[textures] no asset "assets/textures/${filename}" (have: ${textureNames().join(', ')})`)
    return null
  }
  const tex = new THREE.TextureLoader().load(url, (t) => {
    t.needsUpdate = true
    onLoad?.(t)
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(opts.repeat ?? 1, opts.repeat ?? 1)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}
