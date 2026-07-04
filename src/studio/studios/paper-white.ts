/**
 * paper-white — the starter studio (DESIGN.md §7): the Bridges-figure look.
 * Bright near-white environment, one soft key spot (radius → soft shadows),
 * a fill area light (MIS-weighted, best quality), preview-only raster helpers,
 * matte white floor. Light positions are in content units (× stage radius).
 */
import type { StudioSpec } from '../specs'

export const paperWhite: StudioSpec = {
  name: 'paper-white',
  environment: {
    kind: 'gradient',
    top: 0xffffff,
    bottom: 0xe9edf3,
    exponent: 2,
    intensity: 1,
    background: 'same',
  },
  lights: [
    { kind: 'spot', role: 'key', color: 0xfff1e0, intensity: 5, position: [-1.4, 2.2, 1.4], radius: 0.3 },
    { kind: 'area', role: 'fill', color: 0xdde8ff, intensity: 2, position: [1.8, 1.4, 0.8], width: 1.6, height: 1.6 },
    { kind: 'directional', role: 'preview key', intensity: 0.9, position: [1, 1.8, 1.2], previewOnly: true },
    { kind: 'ambient', role: 'preview ambient', intensity: 0.35, previewOnly: true },
  ],
  backdrop: { kind: 'floor', color: 0xffffff, y: 'auto', size: 'auto' },
  camera: { fov: 45, azimuth: 0.55, elevation: 0.32, fill: 0.72 },
  look: { toneMapping: 'aces', exposure: 1 },
}
