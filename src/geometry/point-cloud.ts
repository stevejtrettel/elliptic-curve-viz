/**
 * PointCloud (DESIGN.md §6): E(F_{p^k}) as an InstancedMesh of spheres.
 * S³ positions are the cache; ℝ³ instance matrices are derived by reproject,
 * with the conformal compensation (× scaleFactor/2 = 1/(1 − w′)) applied
 * INTERNALLY — it is a consequence of the projection, not a style choice.
 * Color/size arrays are parallel to the positions (index alignment is the
 * contract with style.ts).
 *
 * Trace-mode bake (merged geometry — the path tracer does not support
 * InstancedMesh) is deferred to Phase 4, when the tracer exists to verify it.
 */
import * as THREE from 'three'

import { Vec4 } from '@/math/core'
import { S3Projection } from '@/math/hopf'

import { colored } from './materials'
import type { S3Renderable } from './s3group'

const HOLE_LIMIT = 1e6
const ZERO_MATRIX = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

export interface PointCloudOptions {
  baseRadius?: number
  /** RGB triples parallel to points. */
  colors?: Float32Array
  /** Per-point size multipliers parallel to points. */
  sizes?: number[]
  material?: THREE.Material
}

export class PointCloud extends THREE.Group implements S3Renderable {
  private mesh: THREE.InstancedMesh
  private points4: Float64Array
  private pointCount: number
  private baseRadius: number
  private sizes: number[] | null
  private lastProjection: S3Projection | null = null
  private readonly dummy = new THREE.Object3D()

  constructor(pointsS3: Vec4[], opts: PointCloudOptions = {}) {
    super()
    this.baseRadius = opts.baseRadius ?? 0.03
    this.sizes = opts.sizes ?? null
    this.pointCount = pointsS3.length
    this.points4 = packPoints(pointsS3)
    this.mesh = this.buildMesh(opts.material)
    this.add(this.mesh)
    if (opts.colors) this.setColors(opts.colors)
  }

  /** CHEAP — instance scales only. */
  setBaseRadius(r: number): void {
    this.baseRadius = r
    if (this.lastProjection) this.reproject(this.lastProjection)
  }

  /** CHEAP — instance scales only. Pass null to clear. */
  setSizes(sizes: number[] | null): void {
    this.sizes = sizes
    if (this.lastProjection) this.reproject(this.lastProjection)
  }

  /** CHEAP — per-instance colors, parallel to the current points. */
  setColors(colors: Float32Array): void {
    const c = new THREE.Color()
    for (let i = 0; i < this.pointCount; i++) {
      c.setRGB(colors[3 * i]!, colors[3 * i + 1]!, colors[3 * i + 2]!)
      this.mesh.setColorAt(i, c)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  /** EXPENSIVE — new point set; reallocates only if the count changed. */
  setPoints(pointsS3: Vec4[], colors?: Float32Array, sizes?: number[] | null): void {
    if (pointsS3.length !== this.pointCount) {
      this.remove(this.mesh)
      this.mesh.dispose()
      this.pointCount = pointsS3.length
      this.points4 = packPoints(pointsS3)
      this.mesh = this.buildMesh(this.mesh.material as THREE.Material)
      this.add(this.mesh)
    } else {
      this.points4 = packPoints(pointsS3)
    }
    if (sizes !== undefined) this.sizes = sizes
    if (colors) this.setColors(colors)
    if (this.lastProjection) this.reproject(this.lastProjection)
  }

  /**
   * Raycast the instanced spheres; returns the index into the parallel point
   * arrays (= E.points() order) of the nearest hit, or null.
   */
  instanceAt(raycaster: THREE.Raycaster): number | null {
    const hits = raycaster.intersectObject(this.mesh, false)
    for (const hit of hits) {
      if (hit.instanceId !== undefined) return hit.instanceId
    }
    return null
  }

  /** O(points): derive instance matrices from the S³ cache. */
  reproject(proj: S3Projection): void {
    this.lastProjection = proj
    for (let i = 0; i < this.pointCount; i++) {
      const at = 4 * i
      const h = new Vec4(this.points4[at]!, this.points4[at + 1]!, this.points4[at + 2]!, this.points4[at + 3]!)
      const p = proj.project(h)
      const scale = this.baseRadius * (this.sizes?.[i] ?? 1) * (proj.scaleFactor(h) / 2)
      const ok = Number.isFinite(p.x + p.y + p.z) && Math.abs(p.x) < HOLE_LIMIT && scale < HOLE_LIMIT
      if (!ok) {
        this.mesh.setMatrixAt(i, ZERO_MATRIX)
        continue
      }
      this.dummy.position.set(p.x, p.y, p.z)
      this.dummy.scale.setScalar(scale)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.computeBoundingSphere()
  }

  private buildMesh(material?: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), material ?? colored(), this.pointCount)
    const white = new THREE.Color(1, 1, 1)
    for (let i = 0; i < this.pointCount; i++) mesh.setColorAt(i, white)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }
}

function packPoints(points: Vec4[]): Float64Array {
  const arr = new Float64Array(4 * points.length)
  points.forEach((p, i) => {
    arr[4 * i] = p.x
    arr[4 * i + 1] = p.y
    arr[4 * i + 2] = p.z
    arr[4 * i + 3] = p.w
  })
  return arr
}
