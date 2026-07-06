/**
 * BaseSphere (DESIGN.md §9 view 3): the Hopf base S² with the profile curve
 * C drawn on it — the picture that EXPLAINS the construction: the torus is
 * η⁻¹(C), and every Hopf fiber is a point of C. Like DomainPlaque this is a
 * plain ℝ³ object (unit sphere in local coordinates), NOT an S3Renderable —
 * the demo places it in space.
 *
 * Layers: translucent unit sphere · profile-curve tube · instanced marks on
 * the curve (fiber base points; colors/sizes arrays parallel to the marks) ·
 * optional area cap — the region enclosed by C containing the NORTH pole,
 * whose area is A: the geometric meaning of Re ω₂ = A/2 (holonomy = A/2).
 */
import * as THREE from 'three'

import type { Vec3 } from '@/math/core'
import type { SpherePoint } from '@/math/hopf'
import { sphereToR3 } from '@/math/hopf'

import { TraceBaker } from './bake-instanced'
import { colored, glass, matte } from './materials'

export interface BaseSphereOptions {
  /** Sphere surface: glass (default), matte, or false = hidden. */
  surface?: 'glass' | 'matte' | false
  /** Profile-curve tube radius (the sphere has radius 1). */
  tubeRadius?: number
  tubeColor?: number
  markRadius?: number
}

export interface CapOptions {
  color?: number
  opacity?: number
}

/** Cap rings between the pole and the curve (triangulation resolution). */
const CAP_RINGS = 24
/** Lift the cap slightly off the unit sphere to avoid z-fighting. */
const CAP_LIFT = 1.004

export class BaseSphere extends THREE.Group {
  private readonly sphere: THREE.Mesh
  private readonly tube: THREE.Mesh
  private curvePoints: SpherePoint[] = []
  private tubeRadius: number
  private markRadius: number
  private marks: THREE.InstancedMesh
  private markPositions: Vec3[] = []
  private cap: THREE.Mesh | null = null
  private capOpts: CapOptions | null = null
  private readonly dummy = new THREE.Object3D()
  private readonly baker = new TraceBaker(this, () => this.marks)

  constructor(opts: BaseSphereOptions = {}) {
    super()
    this.tubeRadius = opts.tubeRadius ?? 0.02
    this.markRadius = opts.markRadius ?? 0.045
    const surface = opts.surface ?? 'glass'
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      surface === 'matte' ? matte(0xdde3ea) : glass(),
    )
    this.sphere.visible = surface !== false
    this.tube = new THREE.Mesh(new THREE.BufferGeometry(), colored(opts.tubeColor ?? 0xd43b3b))
    this.marks = this.buildMarks(0)
    this.add(this.sphere, this.tube, this.marks)
  }

  /** Sphere surface material: glass (figures), matte (live clarity), hidden. */
  setSurface(surface: 'glass' | 'matte' | false): void {
    ;(this.sphere.material as THREE.Material).dispose()
    this.sphere.material = surface === 'matte' ? matte(0xdde3ea) : glass()
    this.sphere.visible = surface !== false
  }

  /** EXPENSIVE — the profile curve (closed, uniform samples on S²). */
  setCurve(points: SpherePoint[]): void {
    this.curvePoints = points
    this.rebuildTube()
    this.rebuildCap()
  }

  /** Cheap-ish: retube the same curve at a new radius. */
  setTubeRadius(r: number): void {
    this.tubeRadius = r
    this.rebuildTube()
  }

  /** Marks on the curve (e.g. fiber base points), colors parallel to points. */
  setMarks(points: Vec3[], colors?: Float32Array): void {
    if (points.length !== this.markPositions.length) {
      this.remove(this.marks)
      this.marks.geometry.dispose()
      ;(this.marks.material as THREE.Material).dispose()
      this.marks.dispose()
      this.marks = this.buildMarks(points.length)
      this.marks.visible = this.baker.mode === 'live'
      this.add(this.marks)
    }
    this.markPositions = points
    for (let i = 0; i < points.length; i++) {
      this.dummy.position.set(points[i]!.x, points[i]!.y, points[i]!.z)
      this.dummy.scale.setScalar(this.markRadius)
      this.dummy.updateMatrix()
      this.marks.setMatrixAt(i, this.dummy.matrix)
    }
    this.marks.instanceMatrix.needsUpdate = true
    this.marks.computeBoundingSphere()
    if (colors) {
      const c = new THREE.Color()
      for (let i = 0; i < points.length; i++) {
        c.setRGB(colors[3 * i]!, colors[3 * i + 1]!, colors[3 * i + 2]!)
        this.marks.setColorAt(i, c)
      }
      if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true
    }
    this.baker.invalidate()
  }

  /**
   * The enclosed-area cap: fills the region bounded by the curve containing
   * the north pole (area = A, since A = ∫(1 − cos φ)dθ). null removes.
   */
  setCap(opts: CapOptions | null): void {
    this.capOpts = opts
    this.rebuildCap()
  }

  /** Trace-mode dual representation for the instanced marks. */
  setMode(mode: 'live' | 'trace'): void {
    this.baker.setMode(mode)
  }

  private rebuildTube(): void {
    this.tube.geometry.dispose()
    if (this.curvePoints.length < 3) {
      this.tube.geometry = new THREE.BufferGeometry()
      return
    }
    const pts = this.curvePoints.map((p) => {
      const v = sphereToR3(p)
      return new THREE.Vector3(v.x, v.y, v.z)
    })
    const curve = new THREE.CatmullRomCurve3(pts, true)
    this.tube.geometry = new THREE.TubeGeometry(curve, 4 * this.curvePoints.length, this.tubeRadius, 12, true)
  }

  /**
   * Triangulate pole-to-curve: ring r at φ = (r/R)·φ(t) along each sampled
   * meridian — valid because the profile curve is a graph over the equator
   * (each meridian meets it once).
   */
  private rebuildCap(): void {
    if (this.cap) {
      this.remove(this.cap)
      this.cap.geometry.dispose()
      ;(this.cap.material as THREE.Material).dispose()
      this.cap = null
    }
    if (!this.capOpts || this.curvePoints.length < 3) return
    const n = this.curvePoints.length
    const positions = new Float32Array(3 * (1 + CAP_RINGS * n))
    positions.set([0, 0, CAP_LIFT], 0) // the north pole vertex
    for (let r = 1; r <= CAP_RINGS; r++) {
      for (let j = 0; j < n; j++) {
        const p = this.curvePoints[j]!
        const v = sphereToR3({ theta: p.theta, phi: (r / CAP_RINGS) * p.phi })
        positions.set([CAP_LIFT * v.x, CAP_LIFT * v.y, CAP_LIFT * v.z], 3 * (1 + (r - 1) * n + j))
      }
    }
    const index: number[] = []
    for (let j = 0; j < n; j++) index.push(0, 1 + j, 1 + ((j + 1) % n)) // pole fan
    for (let r = 1; r < CAP_RINGS; r++) {
      for (let j = 0; j < n; j++) {
        const a = 1 + (r - 1) * n + j
        const b = 1 + (r - 1) * n + ((j + 1) % n)
        index.push(a, a + n, b, b, a + n, b + n)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    const material = matte(this.capOpts.color ?? 0xe8ac2a)
    material.transparent = true
    material.opacity = this.capOpts.opacity ?? 0.45
    material.side = THREE.DoubleSide
    this.cap = new THREE.Mesh(geometry, material)
    this.add(this.cap)
  }

  private buildMarks(count: number): THREE.InstancedMesh {
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

  /** Release every GPU resource this renderable created. */
  dispose(): void {
    this.baker.dispose()
    this.setCap(null)
    this.remove(this.sphere, this.tube, this.marks)
    this.sphere.geometry.dispose()
    ;(this.sphere.material as THREE.Material).dispose()
    this.tube.geometry.dispose()
    ;(this.tube.material as THREE.Material).dispose()
    this.marks.geometry.dispose()
    ;(this.marks.material as THREE.Material).dispose()
    this.marks.dispose()
  }
}
