# Survey: `three-gpu-pathtracer` capabilities (v0.0.23 → 0.0.24)

*Generated 2026-07-04 to inform the StudioSpec design. Local source read from
`knitted-surfaces/node_modules/three-gpu-pathtracer` (0.0.23); upstream checked.*

Full public export surface:
`WebGLPathTracer, PhysicalCamera, EquirectCamera, PhysicalSpotLight, ShapedAreaLight,
ProceduralEquirectTexture, GradientEquirectTexture, BlurredEnvMapGenerator,
DenoiseMaterial, FogVolumeMaterial` (+ deprecated: PathTracingSceneGenerator,
PhysicalPathTracingMaterial, PathTracingRenderer).

## 1. Lights

| Light | Supported | Notes |
|---|---|---|
| `RectAreaLight` | yes | width, height, color, intensity; ray-hittable, MIS-weighted |
| `SpotLight` | yes | color, intensity, decay, distance, angle, penumbra |
| `PointLight` | yes | color, intensity, decay, distance |
| `DirectionalLight` | yes | color, intensity, direction from target |
| `AmbientLight` / `HemisphereLight` | **no** | ignored — use environment instead |

Custom classes:
- **`PhysicalSpotLight extends SpotLight`** — adds `radius` (soft/area shadows, default 0)
  and `iesMap` (IES photometric profile DataTexture; load with three's `IESLoader`).
- **`ShapedAreaLight extends RectAreaLight`** — adds `isCircular` (disc instead of rect).

Gotchas: punctual lights (spot/point/directional) **require MIS on** (default on). Only
area lights get MIS; emissive materials act as lights but without MIS (noisier — prefer a
real ShapedAreaLight). No sphere lights, no portals.

## 2. Cameras

- **`PhysicalCamera extends PerspectiveCamera`**: `fStop` (1.4), `focusDistance` (25),
  `apertureBlades` (0 = circular), `apertureRotation`, `anamorphicRatio`, `bokehSize`
  (getter/setter ↔ focalLength/fStop). DoF active only when bokehSize ≠ 0; plain
  PerspectiveCamera = pinhole.
- **`EquirectCamera`** — 360° equirect panorama render.
- **OrthographicCamera** — auto-detected, just works (no DoF). Good for flat-figure views.

## 3. Environment & background

- `scene.environment` (lighting) and `scene.background` (visible) fully separated.
- Sources: equirect HDR/DataTexture (**importance-sampled** — big convergence win),
  `Color` (auto-wrapped), `CubeTexture` (auto-converted).
- Honored: `environmentIntensity`, `backgroundIntensity`, `environmentRotation`,
  `backgroundRotation`, `backgroundBlurriness`.
- **`GradientEquirectTexture(res=512)`**: `topColor`, `bottomColor`, `exponent` (2);
  call `.update()` after changes.
- **`ProceduralEquirectTexture`**: arbitrary `generationCallback(polar, uv, coord, color)`
  — the hook for authoring analytic studio environments.
- **`BlurredEnvMapGenerator(renderer).generate(tex, blur)`** — pre-blurred env converges
  faster (tip: blurred env + MIS off for env-lit scenes).
- `environment === null` forces env intensity 0.

## 4. WebGLPathTracer settings surface

Quality: `bounces` (10), **`transmissiveBounces` (10)** — extra bounces through glass,
raise if thick/stacked glass goes dark; `filterGlossyFactor` (0; 0.25–1 kills fireflies);
`multipleImportanceSampling` (true).

Sampling/preview: `stableNoise` (false; deterministic — use for stills/turntables),
`renderScale` (1), `textureSize` (1024²), `.tiles` (3×3 — **only settable via
`_pathTracer.tiles.set()`**, a rough edge to wrap), `.samples` (read: convergence counter),
`.isCompiling`, `renderDelay` (100ms), `minSamples` (5), `fadeDuration` (500ms),
`dynamicLowRes` (false) + `lowResScale` (0.25), `rasterizeScene`(+callback),
`renderToCanvas`(+callback), `enablePathTracing`, `pausePathTracing`,
`synchronizeRenderSize`.

Methods: `setScene`/`setSceneAsync` (+`setBVHWorker(worker)` for off-thread BVH build),
`setCamera`/`updateCamera`, `updateMaterials` (re-packs ALL), `updateLights`,
`updateEnvironment`, `renderSample`, `reset`, `dispose` (0.0.23 dispose has a bug —
fixed in 0.0.24).

## 5. Materials

Only `MeshStandardMaterial`/`MeshPhysicalMaterial` are traced. Supported (with maps):
color, roughness, metalness, opacity/alphaTest/alphaMap, side, flatShading, normal;
**transmission + ior + thickness + `attenuationColor`/`attenuationDistance`** (Beer–
Lambert tinted glass — colored depth in thick glass, auto thin-film when thickness=0);
clearcoat, sheen, iridescence (IOR + thickness range), specularColor/Intensity;
emissive (acts as light, no MIS).

Special: **`material.matte = true`** (shadow-catcher — invisible to camera, still
occludes: transparent-background composites); `material.castShadow = false`;
**`vertexColors = true` supported**; `FogVolumeMaterial` (density, emissive — volumetric
haze inside an enclosing mesh).

### InstancedMesh: NOT SUPPORTED
README gotcha + confirmed in source (no `isInstancedMesh`/`instanceMatrix`/`instanceColor`
anywhere; StaticGeometryGenerator only merges plain meshes). **Point clouds must be baked
for trace mode**: one merged BufferGeometry (low-tess sphere per point, transformed),
per-vertex `color` attribute carrying the per-point color, one `vertexColors` material.
Per-point material variation is impossible; color-only. BVH handles millions of tris but
build time/memory scale — keep sphere tessellation low, use async BVH worker, raise tiles.

## 6. Misc

- `DenoiseMaterial` — screen-space smart-denoise post pass (sigma/kSigma/threshold);
  self-wired via FullScreenQuad; light final polish only (not OIDN).
- Russian roulette on by default; throughput clamp ×20 (firefly control).
- Skinned/morph meshes baked per setScene. All scene textures must share wrap/filter flags.
- **WebGPU: not supported** (WebGL2 only), also not in 0.0.24.

## 7. Version: pin 0.0.24 + three ≥ r180

0.0.24 (2026-02-21): dispose fix, background-alpha/alpha-map fixes, `RGBELoader` →
`HDRLoader`, **requires three r180+**. No new capabilities (no instancing). Greenfield
project → start on three r18x + pathtracer 0.0.24.

Sources: local package source; https://github.com/gkjohnson/three-gpu-pathtracer/blob/main/CHANGELOG.md
