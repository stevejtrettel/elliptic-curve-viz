/**
 * Near-pole hole handling, shared by every S³ renderable (DESIGN.md §6):
 * ONE predicate deciding "this S³ point is too close to the projection pole
 * to draw", and the filtered-index step that cuts the triangles touching such
 * points. Keeping both here is what guarantees the torus surface, the tubes,
 * and the point cloud open their holes at the same place.
 *
 * The bound applies to the CONFORMAL FACTOR 2/(1 − w′) and to the projected
 * coordinates. Since |σ(x)|² = scaleFactor − 1, cutting the factor at 10⁶
 * cuts ℝ³ positions at distance ≈ 10³ from the origin — far outside any
 * framed view, close enough to keep Float32 buffers healthy.
 */
import * as THREE from 'three'

import type { Vec3 } from '@/math/core'

export const HOLE_LIMIT = 1e6

/** Is a projected point drawable? p = σ(ρh), scaleFactor = conformal factor at h. */
export function isProjectable(p: Vec3, scaleFactor: number): boolean {
  return (
    Number.isFinite(p.x + p.y + p.z) &&
    scaleFactor < HOLE_LIMIT &&
    Math.abs(p.x) < HOLE_LIMIT &&
    Math.abs(p.y) < HOLE_LIMIT &&
    Math.abs(p.z) < HOLE_LIMIT
  )
}

/**
 * Point the geometry at the triangles of `fullIndex` whose vertices are all
 * valid — or back at `fullIndex` itself when nothing is invalid (no realloc
 * on the common path). Recomputes the bounding sphere either way.
 */
export function applyIndexFilter(
  geometry: THREE.BufferGeometry,
  fullIndex: Uint32Array,
  vertexValid: Uint8Array,
  anyInvalid: boolean,
): void {
  if (anyInvalid) {
    const filtered: number[] = []
    for (let t = 0; t < fullIndex.length; t += 3) {
      if (vertexValid[fullIndex[t]!]! && vertexValid[fullIndex[t + 1]!]! && vertexValid[fullIndex[t + 2]!]!) {
        filtered.push(fullIndex[t]!, fullIndex[t + 1]!, fullIndex[t + 2]!)
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(filtered), 1))
  } else if (geometry.getIndex()?.array !== fullIndex) {
    geometry.setIndex(new THREE.BufferAttribute(fullIndex, 1))
  }
  geometry.computeBoundingSphere()
}
