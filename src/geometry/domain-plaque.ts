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

import { bakeInstancedMesh } from './bake-instanced'
import { matte } from './materials'

export interface DomainPlaqueOptions {
  pointRadius?: number
  colors?: Float32Array
  sizes?: number[]
  material?: THREE.Material
}

export class DomainPlaque extends THREE.Group {
  private lattice: [Complex, Complex]
  private points: Complex[]
  private pointRadius: number
  private sizes: number[] | null
  private scaleNorm = 1
  private plaque: THREE.Mesh
  private spheres: THREE.InstancedMesh
  private readonly dummy = new THREE.Object3D()
  private traceMesh: THREE.Mesh | null = null
  private traceDirty = true
  private displayMode: 'live' | 'trace' = 'live'

  constructor(lattice: [Complex, Complex], points: Complex[], opts: DomainPlaqueOptions = {}) {
    super()
    this.lattice = lattice
    this.points = points
    this.pointRadius = opts.pointRadius ?? 0.02
    this.sizes = opts.sizes ?? null
    const material = opts.material ?? matte(0xe8ecf2)
    material.transparent = true
    material.opacity = 0.75
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
  }

  setPoints(points: Complex[], colors?: Float32Array, sizes?: number[] | null): void {
    if (points.length !== this.points.length) {
      this.remove(this.spheres)
      this.spheres.dispose()
      this.spheres = this.buildSpheres(points.length)
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
    this.invalidateBake()
  }

  setSizes(sizes: number[] | null): void {
    this.sizes = sizes
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
    this.invalidateBake()
  }

  /** Trace-mode dual representation (the tracer has no instancing). */
  setMode(mode: 'live' | 'trace'): void {
    this.displayMode = mode
    if (mode === 'trace') this.ensureBake()
    this.spheres.visible = mode === 'live'
    if (this.traceMesh) this.traceMesh.visible = mode === 'trace'
  }

  private invalidateBake(): void {
    this.traceDirty = true
    if (this.displayMode === 'trace') this.ensureBake()
  }

  private ensureBake(): void {
    if (!this.traceDirty && this.traceMesh) return
    if (this.traceMesh) {
      this.remove(this.traceMesh)
      this.traceMesh.geometry.dispose()
      ;(this.traceMesh.material as THREE.Material).dispose()
    }
    this.traceMesh = bakeInstancedMesh(this.spheres)
    this.traceMesh.visible = this.displayMode === 'trace'
    this.add(this.traceMesh)
    this.traceDirty = false
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
