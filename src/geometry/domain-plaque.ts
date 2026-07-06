/**
 * DomainPlaque (DESIGN.md §9 view 2 groundwork): the flat fundamental domain
 * ℂ/Λ as a plaque in 3D — a translucent parallelogram spanned by ω₁, ω₂ with
 * instanced point spheres at complex coordinates. NOT an S3Renderable: this is
 * the flat picture, drawn in its own local plane (the demo places it in space).
 * Colors/sizes use the same parallel-array contract as PointCloud, so one
 * style.ts call feeds both views.
 */
import * as THREE from 'three'

import { Complex } from '@/math/core'

import { TraceBaker } from './bake-instanced'
import { colored, matte } from './materials'

export interface DomainPlaqueOptions {
  pointRadius?: number
  colors?: Float32Array
  sizes?: number[]
  material?: THREE.Material
}

/** One family of line segments drawn on the plaque (e.g. Cayley chords). */
export interface PlaqueLineSet {
  segments: [Complex, Complex][]
  color: number
  /** Ribbon width in the plaque's normalized units (default 0.008). */
  width?: number
}

/** Thin-tube styling for the outline / grid layers (lifting-modp's FD look). */
export interface PlaqueTubeOptions {
  /** Tube radius in the plaque's normalized units. */
  radius?: number
  color?: number
}

/** Interior gridlines: u × v cells (lines at a = i/u, b = j/v, walls excluded). */
export interface PlaqueGridOptions extends PlaqueTubeOptions {
  u: number
  v: number
}

/**
 * Ribbons float just above the plaque face AND above the outline/grid tube
 * tops (defaults below), still well under the point spheres — the colored
 * chords are content, the gray tubes are dressing.
 */
const LINE_Z = 0.005

const OUTLINE_RADIUS = 0.006
const GRID_RADIUS = 0.0035
const TUBE_COLOR = 0x8a919a

export class DomainPlaque extends THREE.Group {
  private lattice: [Complex, Complex]
  private points: Complex[]
  private pointRadius: number
  private sizes: number[] | null
  private scaleNorm = 1
  private plaque: THREE.Mesh
  private spheres: THREE.InstancedMesh
  private lineSets: PlaqueLineSet[] = []
  private lineMeshes: THREE.Mesh[] = []
  private outlineOpts: PlaqueTubeOptions | null = null
  private gridOpts: PlaqueGridOptions | null = null
  private outlineGroup: THREE.Group | null = null
  private gridGroup: THREE.Group | null = null
  private readonly dummy = new THREE.Object3D()
  private readonly baker = new TraceBaker(this, () => this.spheres)

  constructor(lattice: [Complex, Complex], points: Complex[], opts: DomainPlaqueOptions = {}) {
    super()
    this.lattice = lattice
    this.points = points
    this.pointRadius = opts.pointRadius ?? 0.02
    this.sizes = opts.sizes ?? null
    // translucency is applied only to the internally created default — a
    // caller-supplied material may be shared with other meshes; never mutate it
    let material = opts.material
    if (!material) {
      material = matte(0xe8ecf2)
      material.transparent = true
      material.opacity = 0.75
    }
    this.plaque = new THREE.Mesh(new THREE.BufferGeometry(), material)
    this.spheres = this.buildSpheres(points.length)
    this.add(this.plaque, this.spheres)
    this.rebuildPlaque()
    this.placePoints()
    if (opts.colors) this.setColors(opts.colors)
  }

  setLattice(lattice: [Complex, Complex]): void {
    this.lattice = lattice
    this.rebuildPlaque()
    this.placePoints()
    // scaleNorm may have changed — every derived layer follows
    this.rebuildLines()
    this.rebuildOutline()
    this.rebuildGrid()
  }

  /** Replace the line families drawn on the plaque ([] clears them). */
  setLines(sets: PlaqueLineSet[]): void {
    this.lineSets = sets
    this.rebuildLines()
  }

  /** Thin tubes along the four walls of the fundamental domain (null removes). */
  setOutline(opts: PlaqueTubeOptions | null): void {
    this.outlineOpts = opts
    this.rebuildOutline()
  }

  /** Interior grid of thin tubes at a = i/u, b = j/v (null removes). */
  setGrid(opts: PlaqueGridOptions | null): void {
    this.gridOpts = opts
    this.rebuildGrid()
  }

  setPoints(points: Complex[], colors?: Float32Array, sizes?: number[] | null): void {
    if (points.length !== this.points.length) {
      this.remove(this.spheres)
      this.spheres.geometry.dispose()
      ;(this.spheres.material as THREE.Material).dispose()
      this.spheres.dispose()
      this.spheres = this.buildSpheres(points.length)
      this.spheres.visible = this.baker.mode === 'live'
      this.add(this.spheres)
    }
    this.points = points
    if (sizes !== undefined) this.sizes = sizes
    this.placePoints()
    if (colors) this.setColors(colors)
  }

  setColors(colors: Float32Array): void {
    const c = new THREE.Color()
    for (let i = 0; i < this.points.length; i++) {
      c.setRGB(colors[3 * i]!, colors[3 * i + 1]!, colors[3 * i + 2]!)
      this.spheres.setColorAt(i, c)
    }
    if (this.spheres.instanceColor) this.spheres.instanceColor.needsUpdate = true
    this.baker.invalidate()
  }

  setSizes(sizes: number[] | null): void {
    this.sizes = sizes
    this.placePoints()
  }

  /** Cheap: uniform bead radius (multiplied by the per-point sizes array). */
  setPointRadius(r: number): void {
    this.pointRadius = r
    this.placePoints()
  }

  /** Local xy coordinates of a complex number, in the plaque's normalized scale. */
  private toLocal(z: Complex): [number, number] {
    return [z.re * this.scaleNorm, z.im * this.scaleNorm]
  }

  private rebuildPlaque(): void {
    const [w1, w2] = this.lattice
    this.scaleNorm = 1 / Math.max(w1.abs(), w2.abs())
    const corners = [new Complex(0, 0), w1, w1.add(w2), w2].map((z) => this.toLocal(z))
    const positions = new Float32Array(corners.flatMap(([x, y]) => [x, y, 0]))
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.computeVertexNormals()
    this.plaque.geometry.dispose()
    this.plaque.geometry = geometry
  }

  private rebuildLines(): void {
    for (const mesh of this.lineMeshes) {
      this.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.lineMeshes = []
    for (const set of this.lineSets) {
      if (set.segments.length === 0) continue
      const half = (set.width ?? 0.008) / 2
      const positions = new Float32Array(12 * set.segments.length)
      const index: number[] = []
      set.segments.forEach(([p, q], s) => {
        const [px, py] = this.toLocal(p)
        const [qx, qy] = this.toLocal(q)
        const len = Math.hypot(qx - px, qy - py) || 1
        // in-plane normal, half a ribbon width long
        const nx = (-(qy - py) / len) * half
        const ny = ((qx - px) / len) * half
        positions.set(
          [px + nx, py + ny, LINE_Z, px - nx, py - ny, LINE_Z, qx + nx, qy + ny, LINE_Z, qx - nx, qy - ny, LINE_Z],
          12 * s,
        )
        index.push(4 * s, 4 * s + 1, 4 * s + 2, 4 * s + 1, 4 * s + 3, 4 * s + 2)
      })
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setIndex(index)
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, colored(set.color))
      this.lineMeshes.push(mesh)
      this.add(mesh)
    }
  }

  /**
   * One layer of thin cylinders along in-plane segments (+ optional sphere
   * joints), sharing one unit geometry and one material — cheap to rebuild,
   * plain meshes so the path tracer takes them as-is.
   */
  private buildTubeLayer(
    segments: [Complex, Complex][],
    joints: Complex[],
    radius: number,
    color: number,
  ): THREE.Group {
    const group = new THREE.Group()
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1)
    const sph = new THREE.SphereGeometry(1, 12, 8)
    const material = colored(color)
    for (const [p, q] of segments) {
      const [px, py] = this.toLocal(p)
      const [qx, qy] = this.toLocal(q)
      const len = Math.hypot(qx - px, qy - py)
      if (len === 0) continue
      const mesh = new THREE.Mesh(cyl, material)
      mesh.scale.set(radius, len, radius)
      mesh.position.set((px + qx) / 2, (py + qy) / 2, 0)
      mesh.rotation.z = Math.atan2(qy - py, qx - px) - Math.PI / 2 // cylinder axis is local y
      group.add(mesh)
    }
    for (const j of joints) {
      const [x, y] = this.toLocal(j)
      const mesh = new THREE.Mesh(sph, material)
      mesh.scale.setScalar(radius)
      mesh.position.set(x, y, 0)
      group.add(mesh)
    }
    return group
  }

  private disposeTubeLayer(group: THREE.Group | null): void {
    if (!group) return
    this.remove(group)
    const seen = new Set<THREE.BufferGeometry | THREE.Material>()
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        seen.add(o.geometry)
        seen.add(o.material as THREE.Material)
      }
    })
    for (const r of seen) r.dispose()
  }

  private rebuildOutline(): void {
    this.disposeTubeLayer(this.outlineGroup)
    this.outlineGroup = null
    if (!this.outlineOpts) return
    const [w1, w2] = this.lattice
    const zero = new Complex(0, 0)
    const corners = [zero, w1, w1.add(w2), w2]
    const walls: [Complex, Complex][] = corners.map((c, i) => [c, corners[(i + 1) % 4]!])
    this.outlineGroup = this.buildTubeLayer(
      walls,
      corners, // sphere joints seal the four corners
      this.outlineOpts.radius ?? OUTLINE_RADIUS,
      this.outlineOpts.color ?? TUBE_COLOR,
    )
    this.add(this.outlineGroup)
  }

  private rebuildGrid(): void {
    this.disposeTubeLayer(this.gridGroup)
    this.gridGroup = null
    if (!this.gridOpts) return
    const { u, v } = this.gridOpts
    const [w1, w2] = this.lattice
    const segments: [Complex, Complex][] = []
    for (let i = 1; i < u; i++) {
      const a = w1.scale(i / u)
      segments.push([a, a.add(w2)]) // parallel to ω₂
    }
    for (let j = 1; j < v; j++) {
      const b = w2.scale(j / v)
      segments.push([b, b.add(w1)]) // parallel to ω₁
    }
    this.gridGroup = this.buildTubeLayer(
      segments,
      [],
      this.gridOpts.radius ?? GRID_RADIUS,
      this.gridOpts.color ?? TUBE_COLOR,
    )
    this.add(this.gridGroup)
  }

  private placePoints(): void {
    for (let i = 0; i < this.points.length; i++) {
      const [x, y] = this.toLocal(this.points[i]!)
      this.dummy.position.set(x, y, 0)
      this.dummy.scale.setScalar(this.pointRadius * (this.sizes?.[i] ?? 1))
      this.dummy.updateMatrix()
      this.spheres.setMatrixAt(i, this.dummy.matrix)
    }
    this.spheres.instanceMatrix.needsUpdate = true
    this.spheres.computeBoundingSphere()
    this.baker.invalidate()
  }

  /** Trace-mode dual representation (the tracer has no instancing). */
  setMode(mode: 'live' | 'trace'): void {
    this.baker.setMode(mode)
  }

  /** Release every GPU resource this renderable created. */
  dispose(): void {
    this.baker.dispose()
    this.lineSets = []
    this.rebuildLines()
    this.disposeTubeLayer(this.outlineGroup)
    this.disposeTubeLayer(this.gridGroup)
    this.outlineGroup = null
    this.gridGroup = null
    this.remove(this.plaque, this.spheres)
    this.plaque.geometry.dispose()
    ;(this.plaque.material as THREE.Material).dispose()
    this.spheres.geometry.dispose()
    ;(this.spheres.material as THREE.Material).dispose()
    this.spheres.dispose()
  }

  private buildSpheres(count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0 }),
      count,
    )
    const white = new THREE.Color(1, 1, 1)
    for (let i = 0; i < count; i++) mesh.setColorAt(i, white)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }
}
