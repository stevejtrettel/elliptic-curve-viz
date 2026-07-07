/**
 * colored — a bright, neutral lighting rig against a SOLID color backdrop the
 * user picks (Studio → Background). The environment gradient still lights the
 * subject cleanly (so glass/points read true); only the visible wall is the
 * chosen color. Default backdrop is a mid slate-blue.
 */
import type { StudioSpec } from '../specs'

export const colored: StudioSpec = {
  name: 'colored',
  environment: {
    kind: 'gradient',
    top: 0xffffff,
    bottom: 0xdfe4ea,
    exponent: 2,
    intensity: 0.95,
    background: 0x3a5a78, // solid wall color — overridden live by the Background picker
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
