/**
 * dark — a slate-gray world whose darkness is a slider (Studio → Darkness). The
 * gradient lights the subject; the visible wall is a slate gray the slider dims
 * from near-black to medium. Warm key + cool rim keep glass luminous on the gray.
 */
import type { StudioSpec } from '../specs'

/** Base slate-gray hue the Darkness slider dims toward black. */
export const DARK_SLATE = 0x5b6b7d

export const dark: StudioSpec = {
  name: 'dark',
  environment: {
    kind: 'gradient',
    top: 0x3a4552,
    bottom: 0x121820,
    exponent: 1.6,
    intensity: 0.5,
    background: 0x232b34, // slate gray — the Darkness slider overrides this live
  },
  lights: [
    { kind: 'spot', role: 'key', color: 0xffe2c4, intensity: 8, position: [-1.6, 2.4, 1.5], radius: 0.35 },
    { kind: 'area', role: 'rim', color: 0x9db8ff, intensity: 4, position: [1.2, 1.1, -2.0], width: 2.2, height: 1.4 },
    { kind: 'area', role: 'fill', color: 0x6d7f9a, intensity: 1.2, position: [2.0, 0.6, 1.6], width: 1.8, height: 1.8 },
    { kind: 'directional', role: 'preview key', intensity: 1.1, position: [1, 1.8, 1.2], previewOnly: true },
    { kind: 'ambient', role: 'preview ambient', intensity: 0.25, previewOnly: true },
  ],
  backdrop: { kind: 'floor', color: 0x1a2028, y: 'auto', size: 'auto' },
  camera: { fov: 45, azimuth: 0.55, elevation: 0.3, fill: 0.72 },
  look: { toneMapping: 'aces', exposure: 1.15 },
}
