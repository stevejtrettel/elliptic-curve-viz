/**
 * velvet-hex — the hexagonal curve at k=3 as a composed scene: chosen
 * embedding, S³ rotation and pole, camera angle, tube/point weights,
 * velvet-dark studio. The demo file IS the scene layout.
 */
import { showCurve } from '@/author'
import { paperWhite } from '@/studio'

showCurve({
  title: 'velvet hex',
  curve: 'disc −3 · hexagonal',
  k: 3,

  view: { alpha: 0.6, pole: 0.35 }, // S³ rotation + projection pole
  camera: { azimuth: -0.4, elevation: 0.45, fill: 0.8 },
  fibers: 12,
  gridlines: 6,
  tubeRadius: 0.009,
  pointRadius: 0.045,
  colorBy: 'orbit',

  studio: paperWhite,
})

export {}
