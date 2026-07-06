/**
 * Studio vocabulary (DESIGN.md §7): studios are DATA — a StudioSpec describes
 * environment, lights, backdrop, camera framing, and tone-mapping look; one
 * runtime (studio.ts) compiles it. Field choices are grounded in what the path
 * tracer actually supports (docs/surveys/three-gpu-pathtracer.md).
 *
 * Positions are in CONTENT UNITS: they are multiplied by the stage's bounding
 * radius at compile time, so studios survive the wild scale variation
 * stereographic projection causes.
 */
import type * as THREE from 'three'

export interface StudioSpec {
  name: string
  environment: EnvSpec
  lights: LightSpec[]
  backdrop?: BackdropSpec
  camera: CameraSpec
  look: LookSpec
  /** Path-trace quality this look NEEDS (e.g. deep glass → many bounces). */
  trace?: TraceQualitySpec
}

/**
 * The studio-owned slice of the trace settings: quality the LOOK depends on.
 * Session knobs (samples target, tiles, render scale, progress) stay on
 * app.trace. setStudio applies these over the defaults — and resets to the
 * defaults when a spec omits them, so studios never inherit each other's.
 */
export interface TraceQualitySpec {
  bounces?: number
  /** Extra bounces through glass — raise for thick/stacked transmission. */
  transmissiveBounces?: number
  /** 0.25–1 tames fireflies on glossy surfaces. */
  filterGlossyFactor?: number
}

// ── environment ─────────────────────────────────────────────────────────────

interface EnvBase {
  /** Lighting intensity multiplier (scene.environmentIntensity). */
  intensity?: number
  /** Environment rotation about y, radians. */
  rotation?: number
  /** What the camera SEES (separate from lighting): same env, blurred env, flat color, or nothing. */
  background?: 'same' | 'blur' | number | 'none'
}

export type EnvSpec =
  | ({ kind: 'gradient'; top: number; bottom: number; exponent?: number } & EnvBase)
  | ({ kind: 'solid'; color: number } & EnvBase)
  | ({ kind: 'hdri'; url: string; preBlur?: number } & EnvBase)
  | ({
      kind: 'procedural'
      generate: (polar: { theta: number; phi: number }, uv: THREE.Vector2, color: THREE.Color) => void
    } & EnvBase)

// ── lights ──────────────────────────────────────────────────────────────────

interface LightBase {
  color?: number
  intensity: number
  /** Content units (× stage radius at compile). */
  position: [number, number, number]
  /** Content units; default origin. */
  target?: [number, number, number]
  /** Raster-preview helper: zeroed while the path tracer runs (the dimming trick). */
  previewOnly?: boolean
  /** Optional label for the studio-controls panel. */
  role?: string
}

export type LightSpec =
  | ({ kind: 'spot'; angle?: number; penumbra?: number; radius?: number; decay?: number } & LightBase)
  | ({ kind: 'area'; width?: number; height?: number; circular?: boolean } & LightBase)
  | ({ kind: 'point'; decay?: number } & LightBase)
  | ({ kind: 'directional' } & LightBase)
  | ({ kind: 'ambient' } & Omit<LightBase, 'position'> & { position?: undefined })
  | { kind: 'custom'; create: () => THREE.Light; previewOnly?: boolean; role?: string }

// ── backdrop / camera / look ────────────────────────────────────────────────

export interface BackdropSpec {
  kind: 'floor' | 'none'
  color?: number
  /** Glossy coat (0–1): bounces light back up into the subject's underside. */
  clearcoat?: number
  /** matte shadow-catcher (invisible to camera, still occludes) for composites. */
  shadowCatcher?: boolean
  /** Content units below the stage center; 'auto' = 1.05 × radius. */
  y?: number | 'auto'
  /** Content units; 'auto' = 30 × radius. */
  size?: number | 'auto'
}

export interface CameraSpec {
  fov?: number
  /** Radians around y. */
  azimuth: number
  /** Radians above the horizon. */
  elevation: number
  /** Fraction of the frame the content's bounding sphere fills (default 0.75). */
  fill?: number
  /** PhysicalCamera depth of field — active in trace mode only. */
  dof?: { fstop: number; focus: 'auto' | number }
  projection?: 'perspective' | 'orthographic'
}

export interface LookSpec {
  toneMapping?: 'aces' | 'neutral' | 'linear'
  exposure?: number
}

/** Content bounding data every placement computation works against. */
export interface StageBounds {
  center: THREE.Vector3
  radius: number
}
