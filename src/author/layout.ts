/**
 * Layout templates — arrange a piece's tori by a rule instead of by hand.
 *
 * A template is the COARSE pass: it sets every slot's position (and, with
 * equalize, its scale) so a piece looks composed in one move. The gizmo is the
 * FINE pass on top — nudging individuals. Re-applying a template overwrites
 * those nudges, so templates and dragging layer cleanly (coarse, then fine).
 *
 * Radii are the tori's INTRINSIC bounding radii (measured once at scale 1), so
 * spacing is stable no matter what scale a previous equalize left behind.
 */
import * as THREE from 'three'

export type LayoutType = 'row' | 'grid' | 'ring'

export interface LayoutParams {
  type: LayoutType
  /** Neighbor gap as a fraction of the mean (effective) radius. */
  spacing: number
  /** Scale every torus to a common radius — tames big k-to-k size gaps. */
  equalize: boolean
  /** Grid columns; default ceil(√n). */
  columns?: number
}

/**
 * Arrange `slots` in place by `params`. `radii[i]` is torus i's intrinsic radius
 * (at scale 1). Each slot is reset to upright, scaled (equalize → common radius,
 * else 1), and positioned on the y = 0 plane per the template.
 */
export function arrange(slots: THREE.Group[], radii: number[], params: LayoutParams): void {
  const n = slots.length
  if (n === 0) return

  // equalize → everyone the MEDIAN radius: outliers shrink toward the group
  // instead of the whole scene ballooning up to the largest torus.
  const target = median(radii)
  const eff = radii.map((r) => (params.equalize ? target : r))
  const mean = eff.reduce((a, b) => a + b, 0) / n
  const gap = Math.max(params.spacing, 0) * mean

  const setScale = (slot: THREE.Group, i: number) =>
    slot.scale.setScalar(params.equalize ? target / radii[i]! : 1)

  if (params.type === 'row') {
    const total = eff.reduce((a, b) => a + 2 * b, 0) + gap * (n - 1)
    let x = -total / 2
    slots.forEach((slot, i) => {
      x += eff[i]!
      slot.position.set(x, 0, 0)
      slot.quaternion.identity()
      setScale(slot, i)
      x += eff[i]! + gap
    })
  } else if (params.type === 'grid') {
    const cols = params.columns ?? Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const cell = 2 * Math.max(...eff) + gap
    slots.forEach((slot, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      slot.position.set((col - (cols - 1) / 2) * cell, 0, (row - (rows - 1) / 2) * cell)
      slot.quaternion.identity()
      setScale(slot, i)
    })
  } else {
    // ring: radius so the circumference fits every torus plus its gaps
    const circ = eff.reduce((a, b) => a + 2 * b, 0) + gap * n
    const R = Math.max(circ / (2 * Math.PI), Math.max(...eff) * 1.5)
    slots.forEach((slot, i) => {
      const a = (2 * Math.PI * i) / n
      slot.position.set(R * Math.cos(a), 0, R * Math.sin(a))
      slot.quaternion.identity()
      setScale(slot, i)
    })
  }
}

/** Median radius — the equalize target (robust to a lone giant torus). */
function median(radii: number[]): number {
  const s = [...radii].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return Math.max(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2, 1e-6)
}
