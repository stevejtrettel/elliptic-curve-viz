/**
 * PointCloud (DESIGN.md §6): E(F_{p^k}) as an InstancedMesh of spheres.
 * S³ positions are the cache; ℝ³ instance matrices are derived by reproject,
 * with the conformal compensation (× scaleFactor/2 = 1/(1 − w′)) applied
 * INTERNALLY — it is a consequence of the projection, not a style choice.
 * Color/size arrays are parallel to the positions (index alignment is the
 * contract with style.ts).
 *
 * The tracer does not support InstancedMesh, so setMode('trace') swaps in a
 * lazily-baked merged geometry with per-vertex colors (bake-instanced.ts).
 */
import * as THREE from 'three'

import { Vec4, packVec4s } from '@/math/core'
import { S3Projection } from '@/math/hopf'

import { TraceBaker } from './bake-instanced'
import { isProjectable } from './holes'
import { colored } from './materials'
import type { S3Renderable } from './s3group'

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
  private lastColors: Float32Array | null = null
  /** Sphere tessellation (width, height segments) — raised by the high-res toggle. */
  private sphereSegs: [number, number] = [16, 12]
  private readonly dummy = new THREE.Object3D()
  private readonly baker = new TraceBaker(this, () => this.mesh)

  constructor(pointsS3: Vec4[], opts: PointCloudOptions = {}) {
    super()
    this.baseRadius = opts.baseRadius ?? 0.03
    this.sizes = opts.sizes ?? null
    this.pointCount = pointsS3.length
    this.points4 = packVec4s(pointsS3)
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
    this.lastColors = colors
    const c = new THREE.Color()
    for (let i = 0; i < this.pointCount; i++) {
      c.setRGB(colors[3 * i]!, colors[3 * i + 1]!, colors[3 * i + 2]!)
      this.mesh.setColorAt(i, c)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this.baker.invalidate()
  }

  /** EXPENSIVE — new point set; reallocates only if the count changed. */
  setPoints(pointsS3: Vec4[], colors?: Float32Array, sizes?: number[] | null): void {
    if (pointsS3.length !== this.pointCount) {
      this.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh.dispose()
      this.pointCount = pointsS3.length
      this.points4 = packVec4s(pointsS3)
      this.mesh = this.buildMesh(this.mesh.material as THREE.Material)
      this.mesh.visible = this.baker.mode === 'live'
      this.add(this.mesh)
    } else {
      this.points4 = packVec4s(pointsS3)
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
      const sf = proj.scaleFactor(h)
      // same near-pole cut as HopfTorusMesh/TubeSet (shared predicate)
      if (!isProjectable(p, sf)) {
        this.mesh.setMatrixAt(i, ZERO_MATRIX)
        continue
      }
      this.dummy.position.set(p.x, p.y, p.z)
      this.dummy.scale.setScalar(this.baseRadius * (this.sizes?.[i] ?? 1) * (sf / 2))
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.computeBoundingSphere()
    this.baker.invalidate()
  }

  /**
   * Switch between the live InstancedMesh and the merged trace bake
   * (DESIGN §6: the tracer has no instancing; bake is lazy, color-only).
   */
  setMode(mode: 'live' | 'trace'): void {
    this.baker.setMode(mode)
  }

  /** Release every GPU resource this renderable created (mesh, bake, material). */
  dispose(): void {
    this.baker.dispose()
    this.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }

  /**
   * EXPENSIVE — rebuild the instanced spheres at a new tessellation (the high-res
   * toggle: smoother balls before a path trace). Re-applies colors + projection.
   */
  setSphereResolution(width: number, height: number): void {
    if (width === this.sphereSegs[0] && height === this.sphereSegs[1]) return
    this.sphereSegs = [width, height]
    const material = this.mesh.material as THREE.Material
    this.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.dispose()
    this.mesh = this.buildMesh(material)
    this.mesh.visible = this.baker.mode === 'live'
    this.add(this.mesh)
    if (this.lastColors) this.setColors(this.lastColors)
    if (this.lastProjection) this.reproject(this.lastProjection)
    this.baker.invalidate()
  }

  private buildMesh(material?: THREE.Material): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, this.sphereSegs[0], this.sphereSegs[1]),
      material ?? colored(),
      this.pointCount,
    )
    const white = new THREE.Color(1, 1, 1)
    for (let i = 0; i < this.pointCount; i++) mesh.setColorAt(i, white)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }
}

