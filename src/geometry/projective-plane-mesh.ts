/**
 * ProjectivePlaneMesh: the F_p×F_p view as three.js geometry. Every point of
 * P²(F_p) is a sphere; a generic layer system paints the curve's points (and
 * any other highlighted sets) over a glass background, last layer winning.
 * Optional grid-line tubes trace the embedding, and projective lines are drawn
 * as curves through the embedding (split at wraps for periodic embeddings).
 *
 * Unlike PointCloud/TubeSet this is a plain ℝ³ THREE.Group, NOT an
 * S3Renderable — the F_p view never touches S³. Plain meshes (no instancing)
 * keep it path-tracer compatible.
 */
import * as THREE from 'three'

import { ProjectivePlane, type ProjectivePoint } from '@/math/finite-field'

import { colored, glass } from './materials'

export interface PointLayer {
  /** Points as [X,Y,Z] projective, or [x,y] affine (auto-lifted to [x,y,1]). */
  points: ProjectivePoint[] | [number, number][]
  material: THREE.Material
  radius: number
}

export interface LineSpec {
  from: ProjectivePoint
  to: ProjectivePoint
  material: THREE.Material
  radius: number
}

export interface ProjectivePlaneMeshOptions {
  layers?: PointLayer[]
  lines?: LineSpec[]
  /**
   * Draw the p²+p+1 lattice points not claimed by any layer as background
   * spheres. false = plot ONLY the solutions (the layer points) — the standard
   * F_p scatter, and what keeps large p cheap (≈p spheres, not p²). Default true.
   */
  background?: boolean
  bgMaterial?: THREE.Material
  bgRadius?: number
  infinityBgMaterial?: THREE.Material
  infinityBgRadius?: number
  showGridLines?: boolean
  gridLineMaterial?: THREE.Material
  gridLineRadius?: number
}

/** Normalize a layer point to a canonical "X,Y,Z" key ([x,y] → "x,y,1"). */
function pointKey(pt: number[]): string {
  if (pt.length === 2) return `${pt[0]},${pt[1]},1`
  return `${pt[0]},${pt[1]},${pt[2]}`
}

export class ProjectivePlaneMesh extends THREE.Group {
  constructor(plane: ProjectivePlane, options: ProjectivePlaneMeshOptions = {}) {
    super()

    const {
      layers = [],
      lines = [],
      background = true,
      bgMaterial = glass(),
      bgRadius = 0.1,
      infinityBgMaterial,
      infinityBgRadius,
      showGridLines = false,
      gridLineMaterial,
      gridLineRadius = 0.02,
    } = options

    // Pre-build lookup sets and shared geometry per layer.
    const compiled = layers.map((layer) => ({
      set: new Set(layer.points.map((pt) => pointKey(pt as number[]))),
      geom: new THREE.SphereGeometry(layer.radius, 16, 16),
      material: layer.material,
    }))

    const bgGeom = new THREE.SphereGeometry(bgRadius, 16, 16)
    const infBgMat = infinityBgMaterial ?? bgMaterial
    const infBgGeom = infinityBgRadius ? new THREE.SphereGeometry(infinityBgRadius, 16, 16) : bgGeom

    // Place the points — last matching layer wins; unclaimed points get the
    // background treatment, or are skipped entirely when background is off.
    for (const { proj, pos, isInfinity } of plane.allPoints()) {
      const key = `${proj[0]},${proj[1]},${proj[2]}`
      let geom: THREE.SphereGeometry | null = null
      let mat: THREE.Material | null = null
      for (let i = compiled.length - 1; i >= 0; i--) {
        if (compiled[i]!.set.has(key)) {
          geom = compiled[i]!.geom
          mat = compiled[i]!.material
          break
        }
      }
      if (!geom) {
        if (!background) continue
        geom = isInfinity ? infBgGeom : bgGeom
        mat = isInfinity ? infBgMat : bgMaterial
      }
      const mesh = new THREE.Mesh(geom, mat!)
      mesh.position.set(pos[0], pos[1], pos[2])
      this.add(mesh)
    }

    const p = plane.field.p
    const half = (p - 1) / 2

    // Detect a periodic (torus-like) embedding: does x = -half wrap onto half+1?
    const testA = plane.embed(p, [-half, 0, 1])
    const testB = plane.embed(p, [half + 1, 0, 1])
    const wrapDist = Math.hypot(testA[0] - testB[0], testA[1] - testB[1], testA[2] - testB[2])
    const closed = wrapDist < 0.01

    const lo = closed ? 0 : -half - 0.5
    const hi = closed ? p : half + 0.5

    // Grid lines: one per row and column of F_p.
    if (showGridLines) {
      const lineMat = gridLineMaterial ?? colored(0xc9eaff)
      const N = 64
      for (const i of plane.field.elements()) {
        this.add(
          makeEmbeddedCurve((t) => plane.embed(p, [lerp(lo, hi, t), i, 1]), N, gridLineRadius, lineMat, closed),
        )
        this.add(
          makeEmbeddedCurve((t) => plane.embed(p, [i, lerp(lo, hi, t), 1]), N, gridLineRadius, lineMat, closed),
        )
      }
    }

    // Projective lines drawn through the embedding.
    for (const line of lines) {
      const eq = plane.field.lineEquation(line.from, line.to)
      const N = Math.max(128, p * 8)
      const jumpThreshold = p * 0.4

      const samples: THREE.Vector3[] = []
      for (let i = 0; i <= N; i++) {
        const t = lerp(lo, hi, i / N)
        let x: number
        let y: number
        if (eq.vertical) {
          x = eq.x0
          y = t
        } else {
          x = t
          // Real m·t + c, wrapped by centered-mod; torus embeddings handle
          // periodicity via sin/cos, the grid via this reduction.
          y = centeredMod(eq.m * t + eq.c, p)
        }
        const pos = plane.embed(p, [x, y, 1])
        samples.push(new THREE.Vector3(pos[0], pos[1], pos[2]))
      }

      // Split at wrap jumps (large ℝ³ gap between consecutive samples).
      const segments: THREE.Vector3[][] = [[samples[0]!]]
      for (let i = 1; i < samples.length; i++) {
        if (samples[i]!.distanceTo(samples[i - 1]!) > jumpThreshold) segments.push([])
        segments[segments.length - 1]!.push(samples[i]!)
      }

      const isClosed = closed && segments.length === 1
      for (const seg of segments) {
        if (seg.length < 2) continue
        const curve = new THREE.CatmullRomCurve3(seg, isClosed)
        const tubeSegs = Math.max(seg.length, 32)
        const geom = new THREE.TubeGeometry(curve, tubeSegs, line.radius, 8, isClosed)
        this.add(new THREE.Mesh(geom, line.material))
      }
    }
  }

  /** Release every geometry this group built (materials are caller-owned). */
  dispose(): void {
    this.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose()
    })
  }
}

/** Centered mod for non-integer x: reduce to [-(p-1)/2, (p-1)/2]. */
function centeredMod(x: number, p: number): number {
  const half = (p - 1) / 2
  let r = ((x % p) + p) % p
  if (r > half) r -= p
  return r
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function makeEmbeddedCurve(
  fn: (t: number) => [number, number, number],
  samples: number,
  radius: number,
  material: THREE.Material,
  closed: boolean,
): THREE.Mesh {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= samples; i++) {
    const pos = fn(i / samples)
    pts.push(new THREE.Vector3(pos[0], pos[1], pos[2]))
  }
  const curve = new THREE.CatmullRomCurve3(pts, closed)
  const geom = new THREE.TubeGeometry(curve, samples, radius, 8, closed)
  return new THREE.Mesh(geom, material)
}
