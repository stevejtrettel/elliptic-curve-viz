/**
 * The studio compiler (DESIGN.md §7): StudioSpec → scene subtree + typed handle.
 * Pure placement math is exported separately (placeCamera, placeFloor) so the
 * relative-framing rules are unit-testable without a renderer.
 */
import * as THREE from 'three'
import {
  BlurredEnvMapGenerator,
  GradientEquirectTexture,
  PhysicalSpotLight,
  ProceduralEquirectTexture,
  ShapedAreaLight,
} from 'three-gpu-pathtracer'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

import type { BackdropSpec, CameraSpec, EnvSpec, LightSpec, StageBounds, StudioSpec } from './specs'

export interface CompiledStudio {
  /** Lights + backdrop, ready to add to the scene. */
  group: THREE.Group
  /** For scene.environment (may resolve async for hdri — applied when loaded). */
  environment: THREE.Texture | null
  /** For scene.background. */
  background: THREE.Texture | THREE.Color | null
  handle: StudioHandle
}

export interface StudioHandle {
  spec: StudioSpec
  /** All compiled lights, parallel to spec.lights. */
  lights: THREE.Light[]
  /** The raster-preview lights that get zeroed in trace mode. */
  previewLights: THREE.Light[]
  /** Baseline intensities to restore when leaving trace mode (no drift). */
  readonly baseIntensities: number[]
  floor: THREE.Mesh | null
  /** Dispose every geometry/material/texture this studio created. */
  dispose(): void
}

// ── pure placement math ─────────────────────────────────────────────────────

/** Camera distance/position so the bounding sphere fills `fill` of the frame. */
export function placeCamera(
  spec: CameraSpec,
  bounds: StageBounds,
): { position: THREE.Vector3; target: THREE.Vector3; fov: number; distance: number } {
  const fov = spec.fov ?? 45
  const fill = spec.fill ?? 0.75
  const distance = bounds.radius / (fill * Math.tan(THREE.MathUtils.degToRad(fov / 2)))
  const { azimuth: az, elevation: el } = spec
  const position = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  )
    .multiplyScalar(distance)
    .add(bounds.center)
  return { position, target: bounds.center.clone(), fov, distance }
}

/** Floor plane placement against the content bounds. */
export function placeFloor(spec: BackdropSpec, bounds: StageBounds): { y: number; size: number } {
  const y = spec.y === 'auto' || spec.y === undefined ? bounds.center.y - 1.05 * bounds.radius : bounds.center.y + spec.y * bounds.radius
  const size = spec.size === 'auto' || spec.size === undefined ? 30 * bounds.radius : spec.size * bounds.radius
  return { y, size }
}

// ── environment ─────────────────────────────────────────────────────────────

function compileEnvironment(
  spec: EnvSpec,
  renderer: THREE.WebGLRenderer | null,
  onAsync: (tex: THREE.Texture) => void,
): { environment: THREE.Texture | null; background: THREE.Texture | THREE.Color | null; owned: THREE.Texture[] } {
  const owned: THREE.Texture[] = []
  let environment: THREE.Texture | null = null
  if (spec.kind === 'gradient') {
    const tex = new GradientEquirectTexture()
    tex.topColor.set(spec.top)
    tex.bottomColor.set(spec.bottom)
    if (spec.exponent !== undefined) tex.exponent = spec.exponent
    tex.update()
    environment = tex
    owned.push(tex)
  } else if (spec.kind === 'solid') {
    const tex = new GradientEquirectTexture(16)
    tex.topColor.set(spec.color)
    tex.bottomColor.set(spec.color)
    tex.update()
    environment = tex
    owned.push(tex)
  } else if (spec.kind === 'procedural') {
    const tex = new ProceduralEquirectTexture()
    tex.generationCallback = (polar: { theta: number; phi: number }, uv: THREE.Vector2, _coord: unknown, color: THREE.Color) => {
      spec.generate(polar, uv, color)
    }
    tex.update()
    environment = tex
    owned.push(tex)
  } else {
    // hdri: async; caller re-applies via onAsync when loaded
    new HDRLoader().load(spec.url, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping
      let final: THREE.Texture = tex
      if (spec.preBlur && renderer) {
        const gen = new BlurredEnvMapGenerator(renderer)
        final = gen.generate(tex, spec.preBlur)
        gen.dispose()
        tex.dispose()
      }
      owned.push(final)
      onAsync(final)
    })
  }
  let background: THREE.Texture | THREE.Color | null = environment
  if (spec.background === 'none') background = null
  else if (typeof spec.background === 'number') background = new THREE.Color(spec.background)
  // 'blur' is applied by the runtime via scene.backgroundBlurriness
  return { environment, background, owned }
}

// ── lights ──────────────────────────────────────────────────────────────────

function compileLight(spec: LightSpec, radius: number): THREE.Light {
  if (spec.kind === 'custom') return spec.create()
  const color = spec.color ?? 0xffffff
  let light: THREE.Light
  switch (spec.kind) {
    case 'spot': {
      const s = new PhysicalSpotLight(color)
      s.angle = spec.angle ?? Math.PI / 4
      s.penumbra = spec.penumbra ?? 0.8
      s.radius = spec.radius ?? 0.25
      s.decay = spec.decay ?? 0
      s.castShadow = true
      light = s
      break
    }
    case 'area': {
      const a = new ShapedAreaLight(new THREE.Color(color), spec.intensity, (spec.width ?? 1) * radius, (spec.height ?? 1) * radius)
      a.isCircular = spec.circular ?? false
      light = a
      break
    }
    case 'point':
      light = new THREE.PointLight(color, spec.intensity, 0, spec.decay ?? 0)
      break
    case 'directional':
      light = new THREE.DirectionalLight(color)
      break
    case 'ambient':
      light = new THREE.AmbientLight(color)
      break
  }
  light.intensity = spec.intensity
  if (spec.kind !== 'ambient') {
    light.position.set(spec.position[0] * radius, spec.position[1] * radius, spec.position[2] * radius)
    const t = spec.target ?? [0, 0, 0]
    const targetObj = 'target' in light ? (light as THREE.SpotLight | THREE.DirectionalLight).target : null
    if (targetObj) {
      targetObj.position.set(t[0] * radius, t[1] * radius, t[2] * radius)
    } else if (spec.kind === 'area') {
      light.lookAt(t[0] * radius, t[1] * radius, t[2] * radius)
    }
  }
  return light
}

// ── the compiler ────────────────────────────────────────────────────────────

export function compileStudio(
  spec: StudioSpec,
  bounds: StageBounds,
  renderer: THREE.WebGLRenderer | null,
  onEnvironmentLoaded?: (tex: THREE.Texture) => void,
): CompiledStudio {
  const group = new THREE.Group()
  group.name = `studio:${spec.name}`

  const lights = spec.lights.map((l) => compileLight(l, bounds.radius))
  for (const [i, l] of lights.entries()) {
    group.add(l)
    const t = 'target' in l ? (l as THREE.SpotLight).target : null
    if (t && spec.lights[i]!.kind !== 'custom') group.add(t)
  }
  const previewLights = lights.filter((_, i) => spec.lights[i]!.previewOnly === true)
  const baseIntensities = lights.map((l) => l.intensity)

  let floor: THREE.Mesh | null = null
  if (spec.backdrop && spec.backdrop.kind === 'floor') {
    const { y, size } = placeFloor(spec.backdrop, bounds)
    const mat = new THREE.MeshPhysicalMaterial({
      color: spec.backdrop.color ?? 0xffffff,
      roughness: 0.6,
      metalness: 0,
    })
    if (spec.backdrop.shadowCatcher) {
      ;(mat as THREE.MeshPhysicalMaterial & { matte?: boolean }).matte = true
    }
    floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(bounds.center.x, y, bounds.center.z)
    floor.receiveShadow = true
    group.add(floor)
  }

  const { environment, background, owned } = compileEnvironment(
    spec.environment,
    renderer,
    onEnvironmentLoaded ?? (() => undefined),
  )

  const handle: StudioHandle = {
    spec,
    lights,
    previewLights,
    baseIntensities,
    floor,
    dispose() {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose()
        }
      })
      for (const tex of owned) tex.dispose()
    },
  }
  return { group, environment, background, handle }
}

/** Map LookSpec.toneMapping names to three constants. */
export const TONE_MAPPING = {
  aces: THREE.ACESFilmicToneMapping,
  neutral: THREE.NeutralToneMapping,
  linear: THREE.LinearToneMapping,
} as const
