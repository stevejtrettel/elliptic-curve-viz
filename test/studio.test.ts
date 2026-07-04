import * as THREE from 'three'
import { GradientEquirectTexture, PhysicalSpotLight, ShapedAreaLight } from 'three-gpu-pathtracer'
import { describe, expect, it } from 'vitest'

import { buildSidecar, compileStudio, paperWhite, placeCamera, placeFloor } from '@/studio'
import type { StudioSpec } from '@/studio'

const BOUNDS = { center: new THREE.Vector3(0, 0, 0), radius: 2 }

describe('placeCamera', () => {
  it('distance fits the bounding sphere to the fill fraction', () => {
    const { position, distance, fov } = placeCamera({ azimuth: 0, elevation: 0, fov: 45, fill: 0.75 }, BOUNDS)
    expect(distance).toBeCloseTo(2 / (0.75 * Math.tan(THREE.MathUtils.degToRad(22.5))), 10)
    // azimuth 0, elevation 0 → straight down +z
    expect(position.x).toBeCloseTo(0, 10)
    expect(position.y).toBeCloseTo(0, 10)
    expect(position.z).toBeCloseTo(distance, 10)
    expect(fov).toBe(45)
  })

  it('azimuth/elevation land on the sphere around the center', () => {
    const off = { center: new THREE.Vector3(1, 2, 3), radius: 1.5 }
    const { position, target, distance } = placeCamera({ azimuth: 1.1, elevation: 0.4 }, off)
    expect(position.distanceTo(off.center)).toBeCloseTo(distance, 10)
    expect(target.equals(off.center)).toBe(true)
    expect(position.y).toBeGreaterThan(off.center.y) // positive elevation
  })
})

describe('placeFloor', () => {
  it('auto placement sits just below the bounds with a generous size', () => {
    const { y, size } = placeFloor({ kind: 'floor' }, BOUNDS)
    expect(y).toBeCloseTo(-2.1, 10) // center.y − 1.05·r
    expect(size).toBeCloseTo(60, 10) // 30·r
  })

  it('numeric y/size are in content units', () => {
    const { y, size } = placeFloor({ kind: 'floor', y: -2, size: 10 }, BOUNDS)
    expect(y).toBeCloseTo(-4, 10)
    expect(size).toBeCloseTo(20, 10)
  })
})

describe('compileStudio', () => {
  const spec: StudioSpec = {
    name: 'test',
    environment: { kind: 'gradient', top: 0xff0000, bottom: 0x0000ff, intensity: 1.5 },
    lights: [
      { kind: 'spot', role: 'key', intensity: 5, position: [-1, 2, 1], radius: 0.3 },
      { kind: 'area', role: 'fill', intensity: 2, position: [2, 1, 0], width: 1.5, circular: true },
      { kind: 'directional', intensity: 0.8, position: [1, 1, 1], previewOnly: true },
      { kind: 'ambient', intensity: 0.3, previewOnly: true },
      { kind: 'custom', create: () => new THREE.PointLight(0x00ff00, 7) },
    ],
    backdrop: { kind: 'floor', color: 0xffffff, shadowCatcher: true },
    camera: { azimuth: 0.5, elevation: 0.3 },
    look: { toneMapping: 'aces', exposure: 1.2 },
  }

  it('produces the right light classes with positions scaled by the bounds radius', () => {
    const { handle } = compileStudio(spec, BOUNDS, null)
    expect(handle.lights[0]).toBeInstanceOf(PhysicalSpotLight)
    expect((handle.lights[0] as PhysicalSpotLight).radius).toBeCloseTo(0.3)
    expect(handle.lights[0]!.position.x).toBeCloseTo(-2, 10) // −1 × radius 2
    expect(handle.lights[1]).toBeInstanceOf(ShapedAreaLight)
    expect((handle.lights[1] as ShapedAreaLight).isCircular).toBe(true)
    expect((handle.lights[1] as ShapedAreaLight).width).toBeCloseTo(3, 10) // 1.5 × radius
    expect(handle.lights[2]).toBeInstanceOf(THREE.DirectionalLight)
    expect(handle.lights[3]).toBeInstanceOf(THREE.AmbientLight)
    expect(handle.lights[4]).toBeInstanceOf(THREE.PointLight)
    expect(handle.lights[4]!.intensity).toBe(7) // custom factory untouched
  })

  it('collects previewOnly lights and baseline intensities for exact restore', () => {
    const { handle } = compileStudio(spec, BOUNDS, null)
    expect(handle.previewLights).toHaveLength(2)
    expect(handle.baseIntensities).toEqual([5, 2, 0.8, 0.3, 7])
  })

  it('builds the gradient environment and the shadow-catcher floor', () => {
    const { environment, handle } = compileStudio(spec, BOUNDS, null)
    expect(environment).toBeInstanceOf(GradientEquirectTexture)
    const tex = environment as GradientEquirectTexture
    expect(tex.topColor.getHex()).toBe(0xff0000)
    expect(tex.bottomColor.getHex()).toBe(0x0000ff)
    expect(handle.floor).not.toBeNull()
    const mat = handle.floor!.material as THREE.MeshPhysicalMaterial & { matte?: boolean }
    expect(mat.matte).toBe(true)
    expect(handle.floor!.position.y).toBeCloseTo(-2.1, 10)
  })

  it('dispose() disposes geometries, materials, and owned textures', () => {
    const { environment, handle } = compileStudio(spec, BOUNDS, null)
    let disposed = 0
    handle.floor!.geometry.addEventListener('dispose', () => disposed++)
    ;(handle.floor!.material as THREE.Material).addEventListener('dispose', () => disposed++)
    environment!.addEventListener('dispose', () => disposed++)
    handle.dispose()
    expect(disposed).toBe(3)
  })

  it('the paper-white registry spec compiles', () => {
    const { handle, environment } = compileStudio(paperWhite, BOUNDS, null)
    expect(handle.lights.length).toBe(4)
    expect(handle.previewLights.length).toBe(2)
    expect(environment).toBeInstanceOf(GradientEquirectTexture)
  })
})

describe('buildSidecar', () => {
  it('merges the caller descriptor with render and camera state', () => {
    const sidecar = buildSidecar(
      {
        trace: {
          bounces: 8,
          transmissiveBounces: 12,
          filterGlossyFactor: 0.25,
          stableNoise: true,
          renderScale: 2,
          tiles: [2, 2],
          dynamicLowRes: false,
          target: null,
        },
        camera: { position: new THREE.Vector3(1, 2, 3), fov: 45, fStop: 1.8 },
        studioName: 'paper-white',
      },
      { curve: 'disc -8', k: 3 },
      256,
    )
    const roundTrip = JSON.parse(JSON.stringify(sidecar)) as Record<string, unknown>
    expect(roundTrip['curve']).toBe('disc -8')
    expect(roundTrip['studio']).toBe('paper-white')
    expect((roundTrip['render'] as Record<string, unknown>)['samples']).toBe(256)
    expect((roundTrip['camera'] as Record<string, unknown>)['position']).toEqual([1, 2, 3])
  })
})
