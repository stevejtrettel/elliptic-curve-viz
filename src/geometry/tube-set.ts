/**
 * TubeSet (DESIGN.md §6): tubes for Hopf fibers, gridlines, lifted lines, and
 * orbit highlights. The cache is S³ centerline samples plus the radius AS
 * MEASURED IN S³; reprojection derives everything in ℝ³:
 *   world radius = r_S³ × (conformal dilation of σ∘ρ)  — the same scaleFactor/2
 *   rule as PointCloud (the compensation IS the conformal dilation),
 * with ring orientation from ROTATION-MINIMIZING frames (double-reflection
 * method) — not Frenet: no flips at inflections, no ring-popping under slider
 * drags. Frames are deterministically seeded; closed loops seal by smearing the
 * frame holonomy around the loop. Near-pole rings are cut out via a filtered
 * index (same hole pattern as HopfTorusMesh).
 */
import * as THREE from 'three'

import { Vec3, Vec4 } from '@/math/core'
import { S3Projection } from '@/math/hopf'

import { colored } from './materials'
import type { S3Renderable } from './s3group'

const HOLE_LIMIT = 1e6

export interface TubeCurve {
  points: Vec4[]
  closed: boolean
}

export interface TubeSetOptions {
  /** Tube radius in S³ (world radii are conformally derived). */
  radius?: number
  radialSegments?: number
  material?: THREE.Material
}

interface CurveLayout {
  closed: boolean
  samples: number // centerline samples given
  rings: number // rings emitted (samples + 1 when closed: sealed duplicate)
  vertexOffset: number // first vertex index in the merged buffers
}

export class TubeSet extends THREE.Mesh implements S3Renderable {
  private centerlines!: Float64Array[] // per curve: 4 floats per sample
  private layouts!: CurveLayout[]
  private fullIndex!: Uint32Array
  private radiusS3: number
  private readonly radialSegments: number
  private lastProjection: S3Projection | null = null

  constructor(curves: TubeCurve[], opts: TubeSetOptions = {}) {
    super(new THREE.BufferGeometry(), opts.material ?? colored(0x4287f5))
    this.radiusS3 = opts.radius ?? 0.015
    this.radialSegments = opts.radialSegments ?? 8
    this.setCurves(curves)
  }

  /** EXPENSIVE — new centerlines (reallocates the merged buffers). */
  setCurves(curves: TubeCurve[]): void {
    this.centerlines = curves.map((c) => {
      const arr = new Float64Array(4 * c.points.length)
      c.points.forEach((p, i) => {
        arr[4 * i] = p.x
        arr[4 * i + 1] = p.y
        arr[4 * i + 2] = p.z
        arr[4 * i + 3] = p.w
      })
      return arr
    })
    let offset = 0
    this.layouts = curves.map((c) => {
      const rings = c.points.length + (c.closed ? 1 : 0)
      const layout: CurveLayout = {
        closed: c.closed,
        samples: c.points.length,
        rings,
        vertexOffset: offset,
      }
      offset += rings * (this.radialSegments + 1)
      return layout
    })
    this.allocate(offset)
    if (this.lastProjection) this.reproject(this.lastProjection)
  }

  /** Recomputes rings from the cached projection (O(vertices), no math-layer calls). */
  setRadius(radius: number): void {
    this.radiusS3 = radius
    if (this.lastProjection) this.reproject(this.lastProjection)
  }

  /** CHEAP. */
  setMaterial(material: THREE.Material): void {
    this.material = material
  }

  reproject(proj: S3Projection): void {
    this.lastProjection = proj
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const nor = this.geometry.getAttribute('normal') as THREE.BufferAttribute
    const R = this.radialSegments
    const ringValid: Uint8Array[] = []
    let anyInvalid = false

    for (let ci = 0; ci < this.centerlines.length; ci++) {
      const layout = this.layouts[ci]!
      const line = this.centerlines[ci]!
      const n = layout.samples
      // 1. project centerline + conformal radii + validity
      const centers: Vec3[] = new Array<Vec3>(n)
      const radii = new Float64Array(n)
      const valid = new Uint8Array(layout.rings)
      for (let i = 0; i < n; i++) {
        const h = vec4At(line, 4 * i)
        const c = centers[i] = proj.project(h)
        const sf = proj.scaleFactor(h)
        radii[i] = this.radiusS3 * (sf / 2)
        valid[i] = Number.isFinite(c.x + c.y + c.z) && sf < HOLE_LIMIT ? 1 : 0
        if (!valid[i]) anyInvalid = true
      }
      if (layout.closed) valid[n] = valid[0]!
      ringValid.push(valid)
      // 2. tangents (central differences; wrap when closed)
      const tangents: Vec3[] = new Array<Vec3>(n)
      for (let i = 0; i < n; i++) {
        const prev = centers[layout.closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!
        const next = centers[layout.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!
        const d = next.sub(prev)
        tangents[i] = d.norm() > 0 ? d.normalize() : new Vec3(1, 0, 0)
      }
      // 3. rotation-minimizing frames (double reflection), deterministic seed;
      //    a closed curve gets one extra propagated frame (once around the loop)
      const normals: Vec3[] = new Array<Vec3>(layout.rings)
      normals[0] = seedNormal(tangents[0]!)
      for (let i = 0; i < n - 1; i++) {
        normals[i + 1] = doubleReflect(centers[i]!, tangents[i]!, normals[i]!, centers[i + 1]!, tangents[i + 1]!)
      }
      // 4. closed loops: measure the frame holonomy, smear it around the loop —
      //    ring n carries the once-around frame, so −holonomy lands it on ring 0
      let holonomy = 0
      if (layout.closed) {
        const wrapped = doubleReflect(centers[n - 1]!, tangents[n - 1]!, normals[n - 1]!, centers[0]!, tangents[0]!)
        normals[n] = wrapped
        const b0 = tangents[0]!.cross(normals[0]!)
        holonomy = Math.atan2(wrapped.dot(b0), wrapped.dot(normals[0]!))
      }
      // 5. rings
      for (let ri = 0; ri < layout.rings; ri++) {
        const i = ri % n // sample index (ring n of a closed curve sits at sample 0)
        const twist = layout.closed ? -holonomy * (ri / n) : 0
        const cosT = Math.cos(twist)
        const sinT = Math.sin(twist)
        const t = tangents[i]!
        const b = t.cross(normals[ri]!)
        const nr = normals[ri]!.scale(cosT).add(b.scale(sinT)) // holonomy-corrected normal
        const br = t.cross(nr)
        const center = centers[i]!
        const radius = radii[i]!
        const base = layout.vertexOffset + ri * (R + 1)
        for (let k = 0; k <= R; k++) {
          const a = (2 * Math.PI * k) / R
          const dir = nr.scale(Math.cos(a)).add(br.scale(Math.sin(a)))
          if (valid[i]) {
            pos.setXYZ(base + k, center.x + radius * dir.x, center.y + radius * dir.y, center.z + radius * dir.z)
            nor.setXYZ(base + k, dir.x, dir.y, dir.z)
          } else {
            pos.setXYZ(base + k, 0, 0, 0)
            nor.setXYZ(base + k, 0, 0, 1)
          }
        }
      }
    }
    pos.needsUpdate = true
    nor.needsUpdate = true
    // 6. index: drop bands touching invalid rings
    if (anyInvalid) {
      const filtered: number[] = []
      let cursor = 0
      for (let ci = 0; ci < this.layouts.length; ci++) {
        const layout = this.layouts[ci]!
        const valid = ringValid[ci]!
        const bands = layout.rings - 1
        const triPerBand = 6 * this.radialSegments
        for (let b = 0; b < bands; b++) {
          const okA = valid[b % layout.samples]!
          const okB = valid[(b + 1) % layout.samples]!
          if (okA && okB) {
            for (let t = 0; t < triPerBand; t++) filtered.push(this.fullIndex[cursor + t]!)
          }
          cursor += triPerBand
        }
      }
      this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(filtered), 1))
    } else if (this.geometry.getIndex()?.array !== this.fullIndex) {
      this.geometry.setIndex(new THREE.BufferAttribute(this.fullIndex, 1))
    }
    this.geometry.computeBoundingSphere()
  }

  private allocate(vertexCount: number): void {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * vertexCount), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * vertexCount), 3))
    const R = this.radialSegments
    const indices: number[] = []
    for (const layout of this.layouts) {
      for (let b = 0; b < layout.rings - 1; b++) {
        const rowA = layout.vertexOffset + b * (R + 1)
        const rowB = rowA + R + 1
        for (let k = 0; k < R; k++) {
          indices.push(rowA + k, rowA + k + 1, rowB + k)
          indices.push(rowB + k, rowA + k + 1, rowB + k + 1)
        }
      }
    }
    this.fullIndex = new Uint32Array(indices)
    geometry.setIndex(new THREE.BufferAttribute(this.fullIndex, 1))
    this.geometry.dispose()
    this.geometry = geometry
  }
}

function vec4At(arr: Float64Array, at: number): Vec4 {
  return new Vec4(arr[at]!, arr[at + 1]!, arr[at + 2]!, arr[at + 3]!)
}

/** Deterministic frame seed: axis least aligned with t, Gram–Schmidt'd. */
function seedNormal(t: Vec3): Vec3 {
  const ax = Math.abs(t.x)
  const ay = Math.abs(t.y)
  const az = Math.abs(t.z)
  const pick = ax <= ay && ax <= az ? new Vec3(1, 0, 0) : ay <= az ? new Vec3(0, 1, 0) : new Vec3(0, 0, 1)
  return pick.sub(t.scale(pick.dot(t))).normalize()
}

/** One step of the double-reflection rotation-minimizing frame (Wang et al. 2008). */
function doubleReflect(c0: Vec3, t0: Vec3, n0: Vec3, c1: Vec3, t1: Vec3): Vec3 {
  const v1 = c1.sub(c0)
  const c1sq = v1.dot(v1)
  if (c1sq < 1e-30) return n0
  const rL = n0.sub(v1.scale((2 / c1sq) * v1.dot(n0)))
  const tL = t0.sub(v1.scale((2 / c1sq) * v1.dot(t0)))
  const v2 = t1.sub(tL)
  const c2sq = v2.dot(v2)
  if (c2sq < 1e-30) return rL
  return rL.sub(v2.scale((2 / c2sq) * v2.dot(rL))).normalize()
}
