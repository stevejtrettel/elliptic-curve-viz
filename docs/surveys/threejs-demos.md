# Survey: `threejs-demos` (Hopf torus machinery)

*Exploration report generated 2026-07-04 as input to the elliptic-curve-art rewrite. The rebuilt, cleaner Hopf machinery designed for live rendering.*

## 1. Repo structure & tech stack

**Stack:** TypeScript (~5.9), Vite 7, three.js **0.181** (`@types/three` 0.181). ES modules (`"type": "module"`). Extra deps: `three-custom-shader-material` (CSM wrapping of `MeshPhysicalMaterial`), `three-gpu-pathtracer`, `file-saver`, `jszip`. Path alias `@/` → `src/` (see imports like `@/app/App`, `@/math/hopf`).

**Layout:**
- `src/` — the shared library. Two halves:
  - `src/app/` — a framework: `App.ts` orchestrates `RenderManager`, `CameraManager`, `ControlsManager`, `BackgroundManager` (HDRI/env), `ExportManager` (screenshot/video/OBJ), `ParameterManager` + `ui/overlay` (on-canvas GUI), `TimelineManager`.
  - `src/math/` — a large math library organized by domain: `hopf/`, `lattices/`, `surfaces/`, `curves/`, `algebra/`, `manifolds/`, `geodesics/`, `mesh/`, etc. Re-exported through `src/math/index.ts`.
  - `src/Params.ts` — a reactive parameter/dependency system used throughout.
- `demos/` — ~140 self-contained demos, each just a `main.ts`. No per-demo `index.html`; `scripts/run-demo.mjs` rewrites the single root `index.html` `<script src>` to point at `demos/<name>/main.ts`, then runs Vite (`npm run dev <demo>` / `build` → `dist/<demo>`).
- `legacy/` — the **old** repos, including `legacy/ellitpic-modp/` (the "lifting-modp" predecessor, hundreds of hand-written per-case `torus.js` files) and `legacy/world/world-scenes/HopfTorus.js` + `maps/Stereographic.js`. This is the ad-hoc code the new `src/math/hopf/` cleanly replaces.

**Caveat:** The root-level `TorusView.ts`, `defineTorus.ts`, `torus7.ts` are a *different* project (Rich Schwartz 8-vertex flat-torus combinatorics) and are unrelated to the Hopf/elliptic work. `data/hopf-tori/` is currently empty.

## 2. Files implementing the Hopf torus machinery

Core library (`src/math/hopf/`):
- **`hopfUtils.ts`** (45 lines) — the primitives: `toSpherical`/`fromSphericalCoords` (S² ↔ angles), `toroidalCoords` (S³ Hopf-fiber coords), `stereoProj` (S³→R³).
- **`HopfTorus.ts`** (399 lines) — the main class. Curve on S² → flat torus in R³ with the isometric (arc-length-corrected) embedding, derived lattice, and fiber/edge gridline lifting.
- **`HopfPreimage.ts`** (61 lines) — the *raw* (non-isometric) Hopf map: `hopfFiber(theta, phi)` (a single fiber circle) and `hopfPreimage(curve)` (swept preimage surface). Simpler than `HopfTorus`; no lattice/arc-length.
- **`index.ts`** — barrel; also surfaced via `src/math/index.ts`.

Supporting math:
- `src/math/lattices/Lattice2D.ts` (275 lines) — the modulus τ, Gauss reduction, SL(2,ℤ) reduction. `HopfTorus` builds one of these.
- `src/math/surfaces/SurfaceMesh.ts`, `buildGeometry.ts`, `RollUpMesh.ts` — geometry generators consuming the `Surface` interface `HopfTorus` implements.
- `src/math/curves/{CurveTube,NumericalCurve,ParametricCurve}.ts` — render lifted gridlines/fibers as tubes.

Demos:
- `demos/hopf-torus/main.ts` — glass torus + conformal fiber/edge grid (the flagship).
- `demos/hopf-wiggle/main.ts` — **live** animating S² curve → torus rebuilt every frame.
- `demos/hopf-torus-folding/main.ts` — `RollUpMesh` unrolls the flat parallelogram into the torus.
- `demos/hopf-torus-export/main.ts` — same geometry, watertight quad-OBJ export at selectable resolution.
- `demos/hopf-preimage/main.ts`, `demos/hopf-fibers/main.ts` — the raw-preimage / fiber demos.
- Elliptic-curve relatives: `demos/elliptic-curve/` (Weierstrass ℘ via `surfaces/EllipticCurveMesh.ts`), `demos/toric-elliptic/` (level-3 theta CP² embedding), `demos/lattice-flow/` (Eisenstein g₂,g₃ flow on space of lattices), and `demos/elliptic-fp`, `elliptic-z13` (E over F_p — descendants of `legacy/ellitpic-modp`, but now using `algebra/ProjectivePlane*`, not the Hopf lift).

## 3. Math implementation

**The chain** (`hopfUtils.ts`): S² point → `toSpherical` → `{theta, phi}`; `toroidalCoords(a,b,c)` builds an S³ point as `(cos a sin c, sin a sin c, cos b cos c, sin b cos c)` with a coordinate swap `(x,z,-y,w)` (`hopfUtils.ts:28-35`); `stereoProj` divides by `1 - z` with a large-scale fallback near the pole (`hopfUtils.ts:38-45`).

**Direct parameterization** (`HopfTorus.evaluate`, `HopfTorus.ts:119-125`): for `(u,v)∈[0,1]²`, `T=2πv`, `S=2πu`, take the curve's `{theta,phi}` and form `toroidalCoords(theta+S, S, phi/2)` then stereo-project. `phi/2` is the half-angle that makes the fibers Hopf circles. This is what `hopf-wiggle` and `hopf-torus-export` sample.

**Isometric embedding & the modulus** (`buildTables`, `HopfTorus.ts:294-346`): precomputes two Float64 tables over N=`resolution` samples (default 4096):
- arc length `ds² = sin²φ·dθ² + dφ²` with dθ wrapped to (−π,π] to survive the atan2 seam (`HopfTorus.ts:318-326`);
- the **holonomy / "fudge" factor** `∫ sin²(φ/2)·dθ` (`HopfTorus.ts:328-330`).

From these it derives `totalLength` and `totalHolonomy`, and builds the lattice `ω₁ = (2π, 0)`, `ω₂ = (totalHolonomy, totalLength/2)` (`HopfTorus.ts:342-345`). The fundamental-domain generators are `fiberPeriod = 2π` and `edgeGenerator = (totalHolonomy, L/2)` (`HopfTorus.ts:93-95`). So **the S² curve alone controls the torus modulus** τ = ω₂/ω₁, obtained via `hopf.lattice.tau()`. `isometricImage(pt)` (`HopfTorus.ts:164-181`) reduces the point into the fundamental domain, inverts arc length by binary search (`inverseArc`, `HopfTorus.ts:357-381`), interpolates the holonomy correction `f`, and evaluates `toroidalCoords(theta + s − f, s − f, phi/2)` — the correction is what makes the parameterization a genuine isometry from the flat domain.

**Mesh generation:** two coexisting patterns.
- *Library path* — `buildGeometry(surface, {uSegments, vSegments})` (`surfaces/buildGeometry.ts:58-162`): regular `(u+1)×(v+1)` grid, two triangles per quad, winding `du×dv`. Notable: per-vertex NaN detection drops quads touching non-finite points, giving clean holes for non-rectangular domains (`buildGeometry.ts:84-142`). `SurfaceMesh` (extends `THREE.Mesh`) wraps this with reactive `uSegments/vSegments` (rebuild) and `color/roughness/metalness/transmission/wireframe` (update), and optional CSM shaders (`SurfaceMesh.ts:161-231`).
- *Hand-rolled path* — `hopf-wiggle` builds its own `BufferGeometry` once with static UVs+indices and a mutable `Float32Array` position buffer, then rewrites positions each frame with `pos.needsUpdate = true` + `computeVertexNormals()` (`demos/hopf-wiggle/main.ts:77-118`). This is the efficient live pattern.
- `RollUpMesh` (`surfaces/RollUpMesh.ts`) animates the flat→curved fold `g_τ(u,v) = [f(c+τu, c+τv) − f(c)]/τ`, preallocated buffers updated in `setTau` (`RollUpMesh.ts:143-194`), with a `squareDomain` flag explicitly documented to be set false for the Hopf torus to keep the natural parallelogram (`RollUpMesh.ts:22-27`).

## 4. Live / interactive rendering

- **Frame loop:** `App.animate` (`app/App.ts:338-359`) runs `requestAnimationFrame`, updates timeline/controls, calls every registered `animate(time, delta)` and every `addAnimateCallback` fn, then `renderManager.render`.
- **Live rebuild:** `hopf-wiggle` re-evaluates the whole surface each frame — `hopf.rebuild()` (rebuilds tables at reduced `resolution: 512` for speed, noted "cheap at 512"), then rewrites the mutable position buffer (`demos/hopf-wiggle/main.ts:200-214`). No geometry reallocation.
- **Reactive params:** `src/Params.ts` gives each math object a `params` graph; setting a `triggers:'rebuild'` param cascades `rebuild()`/`update()` through the dependency DAG in topological (Kahn) order so diamond dependencies resolve correctly (`Params.ts:24-94`). `SurfaceMesh.params.dependOn(surface)` means changing the surface auto-rebuilds the mesh. Split of expensive `rebuild()` (new geometry) vs cheap `update()` (material props) is explicit (`SurfaceMesh.ts:220-252`).
- **GUI:** `ParameterManager.add(obj, prop, {min,max,label})` registers ad-hoc controls; `app.overlay` (`ui/overlay/OverlayManager`) renders on-canvas sliders. Demos also use plain keyboard handlers (press 1–4 to switch presets/curves in `hopf-wiggle`, `hopf-torus-folding`).
- **Perf tricks:** preallocated typed-array buffers with in-place updates; precomputed arc-length/holonomy tables with lerp + binary-search inversion instead of per-sample integration; `stereoScale = 1 + |p|²` used to scale tube radii so stereographically-stretched fibers keep uniform apparent thickness (`HopfTorus.ts:278-280`, used in `demos/hopf-torus/main.ts:75,90`); optional path-tracer swap (`App.enablePathTracing`) for offline-quality stills.

## 5. Code-organization assessment

**Shared library, yes.** `src/math/` is a real reusable library (barrel-exported via `src/math/index.ts`), cleanly separated from the `src/app/` rendering framework. Per-demo structure is minimal: one `main.ts` that imports from `@/math` and `@/app`, wires a scene, calls `app.start()`.

**Clean / worth carrying forward:**
- The **`hopfUtils.ts` primitive layer** is small, pure, dependency-light (only `THREE.Vector*`), and directly portable. This is the crown jewel to reuse.
- The **`Surface` interface** (`evaluate(u,v)→Vec3` + `getDomain()`, `surfaces/types.ts:39-49`) is a clean seam: `HopfTorus`, `hopfPreimage`, `EllipticCurveMesh` all implement it, and any of `buildGeometry`/`SurfaceMesh`/`RollUpMesh` consume it. Decoupling math from meshing is the right architecture for a rewrite.
- **`HopfTorus`'s "curve determines everything"** design (curve → arc length + holonomy → lattice/τ → isometric embedding) is mathematically principled and much cleaner than the legacy per-case `torus.js` files. The precomputed-table + binary-search arc-length inversion is solid.
- **`Lattice2D`** (Gauss + SL(2,ℤ) reduction, τ, covolume) is a well-factored, framework-free module — reuse as-is.
- The **`Params` reactive DAG** with topological cascade and rebuild/update split is genuinely nice for interactive apps.
- `buildGeometry`'s NaN-hole handling is a clean touch for non-rectangular domains.

**Ad hoc / friction points to reconsider:**
- **Two mesh-generation code paths coexist**: the reactive `SurfaceMesh`/`buildGeometry` path vs. the hand-rolled mutable-buffer path in `hopf-wiggle`. The reactive path *reallocates* geometry on rebuild (`SurfaceMesh.rebuild` disposes and rebuilds, `SurfaceMesh.ts:220-231`), which is why the live demo bypasses it. A rewrite should unify these: a surface mesh that updates positions in place when only the surface (not resolution) changed.
- **`HopfTorus.rebuild()` recomputes tables but `SurfaceMesh` would have to fully rebuild geometry** — the reactive wiring doesn't cover the "same topology, new positions" fast path, so live demos opt out of the framework entirely.
- **Duplicated boilerplate** across demos: every `main.ts` re-declares lights, camera, background by hand (compare the near-identical headers of `hopf-torus`, `hopf-preimage`, `hopf-fibers`, `hopf-torus-export`). A `demos/_shared` scene-setup helper exists for other topics but Hopf demos don't use it.
- **`toroidalCoords` bakes in a fixed coordinate swap `(x,z,-y,w)`** (`hopfUtils.ts:33`) and `stereoProj` a fixed axis convention (`hopfUtils.ts:42-44`); these "magic" reorientations are undocumented as to *why* those axes — worth parameterizing or at least commenting in a rewrite.
- The large flat `src/math/index.ts` barrel re-exports everything; fine now but will need namespacing as it grows.

**Bottom line for the rewrite:** carry forward `hopfUtils.ts`, the `Surface` interface, the `HopfTorus` curve→lattice→isometric-embedding design, and `Lattice2D` essentially verbatim. Keep the `Params` reactive model if you want live GUIs. Redesign the single seam that's currently awkward — a mesh object that supports cheap in-place position updates for the "curve wiggles, topology fixed" case — so the interactive path and the library path stop diverging.
