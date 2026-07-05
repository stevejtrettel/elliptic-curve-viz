/**
 * bridges-paper — the paper's figure look (lifting-modp scene files): white
 * world falling to grey (GradientEquirect bottomColor 0x666666), one white
 * physical spot (legacy: pos (2,6,0), intensity 5, radius 0.5, penumbra 1,
 * decay 0), white ground, ACES. Positions here are content units ≈ legacy
 * absolute / stage radius (~2).
 */
import type { StudioSpec } from '../specs'

export const bridgesPaper: StudioSpec = {
  name: 'bridges-paper',
  environment: {
    kind: 'gradient',
    top: 0xffffff,
    bottom: 0x666666,
    exponent: 2,
    intensity: 1,
    background: 'same',
  },
  lights: [
    {
      kind: 'spot',
      role: 'key',
      color: 0xffffff,
      intensity: 5,
      position: [1, 3, 0],
      target: [0.5, 0, 0.02],
      radius: 0.5,
      penumbra: 1,
      angle: Math.PI / 2,
      decay: 0,
    },
    { kind: 'directional', role: 'preview key', intensity: 1, position: [0.5, 2, 0.3], previewOnly: true },
    { kind: 'ambient', role: 'preview ambient', intensity: 0.35, previewOnly: true },
  ],
  backdrop: { kind: 'floor', color: 0xffffff, y: 'auto', size: 'auto' },
  camera: { fov: 50, azimuth: 3.13, elevation: 1.45, fill: 0.72 },
  look: { toneMapping: 'aces', exposure: 1 },
}
