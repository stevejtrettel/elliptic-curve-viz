import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Quaternion, Vec3, Vec4 } from '@/math/core'
import { HopfTorus, LatitudeCircle, S3Projection } from '@/math/hopf'

import { TubeSet } from '@/geometry'

import { edgeCurves, fiberCurves } from '../demos/_shared/gridCurves'

const torus = new HopfTorus(new LatitudeCircle(Math.acos(1 / 3)))
const R = 8

function attr(mesh: TubeSet, name: string): THREE.BufferAttribute {
  return mesh.geometry.getAttribute(name) as THREE.BufferAttribute
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

function circumcenter(p1: Vec3, p2: Vec3, p3: Vec3): Vec3 {
  const a = p2.sub(p1)
  const b = p3.sub(p1)
  const axb = cross(a, b)
  return p1.add(cross(b.scale(a.norm2()).sub(a.scale(b.norm2())), axb).scale(1 / (2 * axb.norm2())))
}

describe('TubeSet', () => {
  const curves = fiberCurves(torus, 3, 48)
  const tubes = new TubeSet(curves, { radius: 0.02, radialSegments: R })
  const proj = new S3Projection()
  proj.rotation = [new Quaternion(1, 0.3, -0.2, 0.5).normalize(), new Quaternion(0.7, 0, 1, -0.1).normalize()]
  tubes.reproject(proj)

  it('allocates rings for every curve (closed: samples + 1 sealed rings)', () => {
    expect(attr(tubes, 'position').count).toBe(3 * 49 * (R + 1))
    expect(tubes.geometry.getIndex()!.count).toBe(3 * 48 * R * 6)
  })

  it('rings lie at the conformally-compensated distance from the projected centerline', () => {
    const pos = attr(tubes, 'position')
    for (const [curveIdx, sample] of [
      [0, 0],
      [1, 12],
      [2, 30],
    ] as const) {
      const h = curves[curveIdx]!.points[sample]!
      const center = proj.project(h)
      const expected = 0.02 * (proj.scaleFactor(h) / 2)
      const base = curveIdx * 49 * (R + 1) + sample * (R + 1)
      for (let k = 0; k <= R; k++) {
        const v = new Vec3(pos.getX(base + k), pos.getY(base + k), pos.getZ(base + k))
        expect(v.sub(center).norm()).toBeCloseTo(expected, 6)
      }
    }
  })

  it('closed seam: last ring coincides with the first (holonomy smeared)', () => {
    const pos = attr(tubes, 'position')
    for (let c = 0; c < 3; c++) {
      const first = c * 49 * (R + 1)
      const last = c * 49 * (R + 1) + 48 * (R + 1)
      for (let k = 0; k <= R; k++) {
        for (const get of ['getX', 'getY', 'getZ'] as const) {
          expect(Math.abs(pos[get](first + k) - pos[get](last + k))).toBeLessThan(1e-5)
        }
      }
    }
  })

  it('no ring-popping: consecutive ring-0 directions never flip', () => {
    const pos = attr(tubes, 'position')
    const nor = attr(tubes, 'normal')
    void pos
    for (let c = 0; c < 3; c++) {
      let prev: Vec3 | null = null
      for (let ring = 0; ring < 49; ring++) {
        const at = c * 49 * (R + 1) + ring * (R + 1)
        const n = new Vec3(nor.getX(at), nor.getY(at), nor.getZ(at))
        if (prev) expect(n.dot(prev)).toBeGreaterThan(0.5)
        prev = n
      }
    }
  })

  it('projected fibers are exact circles (σ maps circles to circles)', () => {
    for (let c = 0; c < 3; c++) {
      const centers = curves[c]!.points.map((h) => proj.project(h))
      const cc = circumcenter(centers[0]!, centers[16]!, centers[32]!)
      const r = centers[0]!.sub(cc).norm()
      for (const p of centers) expect(p.sub(cc).norm()).toBeCloseTo(r, 7)
    }
  })

  it('reprojection is idempotent', () => {
    const before = Array.from(attr(tubes, 'position').array.slice(0, 60))
    tubes.reproject(proj)
    expect(Array.from(attr(tubes, 'position').array.slice(0, 60))).toEqual(before)
  })

  it('cuts holes when the pole sits on a fiber', () => {
    const t2 = new TubeSet(curves, { radius: 0.02, radialSegments: R })
    const onFiber = new S3Projection()
    onFiber.pole = curves[0]!.points[5]!
    t2.reproject(onFiber)
    const index = t2.geometry.getIndex()!
    expect(index.count).toBeLessThan(3 * 48 * R * 6)
    const pos = attr(t2, 'position')
    for (let t = 0; t < index.count; t++) {
      const v = index.getX(t)
      expect(Number.isFinite(pos.getX(v) + pos.getY(v) + pos.getZ(v))).toBe(true)
      expect(Math.hypot(pos.getX(v), pos.getY(v), pos.getZ(v))).toBeLessThan(1e6)
    }
    // benign projection restores the full index
    t2.reproject(new S3Projection())
    expect(t2.geometry.getIndex()!.count).toBe(3 * 48 * R * 6)
  })

  it('RMF handles an inflected planar curve without flipping (vs Frenet)', () => {
    // an S-curve on S³: slerp-ish path with an inflection in its projection
    const pts: Vec4[] = Array.from({ length: 40 }, (_, i) => {
      const t = -1 + (2 * i) / 39
      return new Vec4(0.3 * t, 0.2 * t * t * t, 0.1, Math.sqrt(1 - 0.09 * t * t - 0.04 * t ** 6 - 0.01))
    })
    const s = new TubeSet([{ points: pts, closed: false }], { radius: 0.01, radialSegments: R })
    s.reproject(new S3Projection())
    const nor = s.geometry.getAttribute('normal') as THREE.BufferAttribute
    let prev: Vec3 | null = null
    for (let ring = 0; ring < 40; ring++) {
      const at = ring * (R + 1)
      const n = new Vec3(nor.getX(at), nor.getY(at), nor.getZ(at))
      if (prev) expect(n.dot(prev)).toBeGreaterThan(0.8)
      prev = n
    }
  })
})

describe('edge gridlines', () => {
  it('close up and do not kink at the fundamental-domain seam', () => {
    const curves = edgeCurves(torus, 2, 96)
    for (const curve of curves) {
      const pts = curve.points
      const n = pts.length
      // closure: last sample is one step from the first (the curve is closed)
      const gap = pts[n - 1]!.sub(pts[0]!).norm()
      const step = pts[1]!.sub(pts[0]!).norm()
      expect(gap).toBeLessThan(3 * step)
      // no kinks anywhere, including across the wrap (the toFundamentalDomain fix)
      for (let i = 0; i < n; i++) {
        const a = pts[(i + 1) % n]!.sub(pts[i]!)
        const b = pts[(i + 2) % n]!.sub(pts[(i + 1) % n]!)
        const cosAngle = a.dot(b) / (a.norm() * b.norm())
        expect(cosAngle, `segment angle at ${i}`).toBeGreaterThan(0.9)
      }
    }
  })
})
