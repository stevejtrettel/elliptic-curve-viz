/**
 * velvet-dark — paper-white's counterpart for luminous glass on black:
 * near-black blue-cast world, one warm key spot, a cool rim card behind the
 * subject, low fill, charcoal floor. Tuned with the Design tab (?design=1).
 */
import type { StudioSpec } from '../specs'

export const velvetDark: StudioSpec = {
  name: 'velvet-dark',
  environment: {
    kind: 'gradient',
    top: 0x0b0d12,
    bottom: 0x05060a,
    exponent: 1.6,
    intensity: 0.4,
    background: 'same',
  },
  lights: [
    { kind: 'spot', role: 'key', color: 0xffe2c4, intensity: 8, position: [-1.6, 2.4, 1.5], radius: 0.35 },
    { kind: 'area', role: 'rim', color: 0x9db8ff, intensity: 4, position: [1.2, 1.1, -2.0], width: 2.2, height: 1.4 },
    { kind: 'area', role: 'fill', color: 0x6d7f9a, intensity: 1.2, position: [2.0, 0.6, 1.6], width: 1.8, height: 1.8 },
    { kind: 'directional', role: 'preview key', intensity: 1.1, position: [1, 1.8, 1.2], previewOnly: true },
    { kind: 'ambient', role: 'preview ambient', intensity: 0.25, previewOnly: true },
  ],
  backdrop: { kind: 'floor', color: 0x101216, y: 'auto', size: 'auto' },
  camera: { fov: 45, azimuth: 0.55, elevation: 0.3, fill: 0.72 },
  look: { toneMapping: 'aces', exposure: 1.15 },
}
