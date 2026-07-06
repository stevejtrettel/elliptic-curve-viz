/**
 * HopfTorusMesh (DESIGN.md §6): the torus surface as a THREE.Mesh whose
 * vertices are cached in S³ (positions AND analytic normals in T_hS³, both
 * Float64) with ℝ³ attributes derived by reproject — precision is lost exactly
 * once, at the Float32 buffer write. NaN/near-pole hole handling kept from
 * threejs-demos buildGeometry: invalid vertices get placeholders and every
 * quad touching one is dropped from the index.
 */
import * as THREE from 'three'

import { Vec4 } from '@/math/core'
import { HopfTorus, S3Projection, framePoint } from '@/math/hopf'

import { applyIndexFilter, isProjectable } from './holes'
import { glass } from './materials'
import type { S3Renderable } from './s3group'

const TWO_PI = 2 * Math.PI

export interface HopfTorusMeshOptions {
  /** Fiber-direction segments (default 128). */
  uSegments?: number
  /** Curve-direction segments (default 128). */
  xSegments?: number
  /** Trace-mode grid (default 384×384): the bake is one-time, spend freely. */
  uSegmentsTrace?: number
  xSegmentsTrace?: number
  material?: THREE.Material
}

export class HopfTorusMesh extends THREE.Mesh implements S3Renderable {
  private uSegs: number
  private xSegs: number
  private readonly segsLive: [number, number]
  private readonly segsTrace: [number, number]
  private displayMode: 'live' | 'trace' = 'live'
  private hopf!: HopfTorus
  private points4!: Float64Array // (x,y,z,w) per vertex — the S³ cache
  private normals4!: Float64Array // unit normals in T_hS³
  private fullIndex!: Uint32Array // all quads; reproject filters holes
  private lastProjection: S3Projection | null = null

  constructor(hopf: HopfTorus, opts: HopfTorusMeshOptions = {}) {
    super(new THREE.BufferGeometry(), opts.material ?? glass())
    this.uSegs = opts.uSegments ?? 128
    this.xSegs = opts.xSegments ?? 128
    this.segsLive = [this.uSegs, this.xSegs]
    this.segsTrace = [opts.uSegmentsTrace ?? Math.max(384, this.uSegs), opts.xSegmentsTrace ?? Math.max(384, this.xSegs)]
    this.allocate()
    this.setSurface(hopf)
  }

  /**
   * Live/trace tessellation swap (called by App on mode changes): resample the
   * surface on the mode's grid — the S³ math reruns, the projection is cached.
   */
  setMode(mode: 'live' | 'trace'): void {
    if (mode === this.displayMode) return
    this.displayMode = mode
    const [u, x] = mode === 'trace' ? this.segsTrace : this.segsLive
    if (u === this.uSegs && x === this.xSegs) return
    this.uSegs = u
    this.xSegs = x
    this.allocate()
    this.setSurface(this.hopf)
  }

  /** EXPENSIVE — resample the S³ caches in place (the live-animation path). */
  setSurface(hopf: HopfTorus): void {
    this.hopf = hopf
    const { uSegs, xSegs } = this
    for (let j = 0; j <= xSegs; j++) {
      const frame = hopf.profileFrameAt((TWO_PI * j) / xSegs)
      for (let i = 0; i <= uSegs; i++) {
        const { point, normal } = framePoint(frame, (TWO_PI * i) / uSegs)
        const at = 4 * (j * (uSegs + 1) + i)
        this.points4[at] = point.x
        this.points4[at + 1] = point.y
        this.points4[at + 2] = point.z
        this.points4[at + 3] = point.w
        this.normals4[at] = normal.x
        this.normals4[at + 1] = normal.y
        this.normals4[at + 2] = normal.z
        this.normals4[at + 3] = normal.w
      }
    }
    if (this.lastProjection) this.reproject(this.lastProjection)
  }

  /** EXPENSIVE — set the live-mode grid; resamples immediately (like setMode). */
  setResolution(uSegments: number, xSegments: number): void {
    this.segsLive[0] = uSegments
    this.segsLive[1] = xSegments
    if (this.displayMode !== 'live') return // applied on the next switch back
    this.uSegs = uSegments
    this.xSegs = xSegments
    this.allocate()
    this.setSurface(this.hopf) // refills the S³ caches and reprojects
  }

  /** CHEAP. Takes ownership: the replaced material is disposed. */
  setMaterial(material: THREE.Material): void {
    if (material !== this.material) (this.material as THREE.Material).dispose()
    this.material = material
  }

  /** Release the geometry and current material. */
  dispose(): void {
    this.geometry.dispose()
    ;(this.material as THREE.Material).dispose()
  }

  /** O(vertices): derive ℝ³ positions + normals from the S³ cache. */
  reproject(proj: S3Projection): void {
    this.lastProjection = proj
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const nor = this.geometry.getAttribute('normal') as THREE.BufferAttribute
    const count = pos.count
    const valid = new Uint8Array(count)
    let anyInvalid = false
    for (let v = 0; v < count; v++) {
      const at = 4 * v
      const h = new Vec4(this.points4[at]!, this.points4[at + 1]!, this.points4[at + 2]!, this.points4[at + 3]!)
      const p = proj.project(h)
      // near the projection pole the clamp can return small values (exactly at
      // the pole, even 0) — the conformal factor is the honest blow-up signal
      const ok = isProjectable(p, proj.scaleFactor(h))
      valid[v] = ok ? 1 : 0
      if (!ok) {
        anyInvalid = true
        pos.setXYZ(v, 0, 0, 0)
        nor.setXYZ(v, 0, 0, 1)
        continue
      }
      const n4 = new Vec4(
        this.normals4[at]!,
        this.normals4[at + 1]!,
        this.normals4[at + 2]!,
        this.normals4[at + 3]!,
      )
      const n = proj.projectTangent(h, n4).normalize()
      pos.setXYZ(v, p.x, p.y, p.z)
      nor.setXYZ(v, n.x, n.y, n.z)
    }
    pos.needsUpdate = true
    nor.needsUpdate = true
    // index: the full grid, minus quads touching an invalid vertex
    applyIndexFilter(this.geometry, this.fullIndex, valid, anyInvalid)
  }

  private allocate(): void {
    const { uSegs, xSegs } = this
    const count = (uSegs + 1) * (xSegs + 1)
    this.points4 = new Float64Array(4 * count)
    this.normals4 = new Float64Array(4 * count)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * count), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * count), 3))
    // row-major two-triangle quads (threejs-demos buildGeometry layout)
    const index = new Uint32Array(6 * uSegs * xSegs)
    let at = 0
    for (let j = 0; j < xSegs; j++) {
      for (let i = 0; i < uSegs; i++) {
        const v0 = j * (uSegs + 1) + i
        const v1 = (j + 1) * (uSegs + 1) + i
        const v2 = v0 + 1
        const v3 = v1 + 1
        index[at++] = v0
        index[at++] = v2
        index[at++] = v1
        index[at++] = v1
        index[at++] = v2
        index[at++] = v3
      }
    }
    this.fullIndex = index
    geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.dispose()
    this.geometry = geometry
  }
}
