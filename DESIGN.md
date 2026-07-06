# elliptic-curve-viz — Design Document

*Draft for review, 2026-07-04. Companion to the paper: N. Hajouji & S. Trettel,
"Elliptic Curves and the Hopf Fibration", Bridges 2025, [arXiv:2505.09627](https://arxiv.org/abs/2505.09627).*

## 1. Vision

A clean TypeScript system for drawing elliptic curves over finite fields as point sets on
flat tori in S³ (Pinkall's construction via the Hopf fibration), stereographically projected
to R³. Two rendering targets, one codebase:

- **live**: interactive WebGL demos that respond to parameter changes in real time;
- **beautiful**: progressive path-traced renders (three-gpu-pathtracer) in reusable "studios".

Guiding principles:

1. **The code mirrors the paper.** Names, formulas, and pipeline stages match the paper's
   conventions exactly (§3). Anyone holding the paper can read the math core.
2. **Exactness until the last moment.** Points of E(F_q) are integers mod N with group
   structure; SL₂(ℤ) bookkeeping is exact. Floats enter only where geometry begins.
3. **Layers with one-way dependencies.** `math` (pure, zero-dependency) → `geometry`
   (three.js buffers) → `studio` (apps, lighting, path tracing) → `demos` (thin entries).
4. **Every magic number is a named parameter.** No axis swizzles, no per-case constants;
   orientation, projection pole, and S³ rotation are first-class, documented knobs.

## 2. The pipeline

```
 y² = x³ + fx + g  over F_p
        │
        │  (Nadir's ecfplat, offline: Deuring lift via the j ↔ (a,b,c) bijection)
        ▼
 quadratic form (a,b,c), trace a, prime p        ──── io: read JSON/txt exports
        │
        │  τ = (−b + √d)/2a,  Λ = Z ⊕ τZ                    [math/lattice]
        │  Frobenius M ∈ M₂(Z) on basis {1, τ}              [math/arithmetic]
        ▼
 E(F_{p^k}) = ker(Mᵏ − I) ⊂ (Z/N)²   — exact points + group structure
        │
        │  SL₂(ℤ) representative + homothety λ: Λ_τ → Λ_Hopf  [math/lattice]
        │  profile curve on S² realizing τ (solver)           [math/families]
        ▼
 flat torus η⁻¹(C) ⊂ S³, points as s+it ∈ C/Λ_Hopf           [math/hopf]
        │
        │  roll-up map (paper Steps 1–5): isometry C/Λ → S³,
        │  optional S³ rotation, stereographic projection σ
        ▼
 R³ — surface mesh, instanced point spheres, fiber/grid tubes  [geometry]
        │
        ▼
 live viewer  /  path-traced studio render                     [studio]
```

## 3. Mathematical conventions (fixed by the paper)

- **Hopf map** η: S³ → S², η(z, w) = z/w for unit (z, w) ∈ C², valued in C ∪ ∞.
- **Hopf fiber** over (θ, φ) ∈ S²:  H₍θ,φ₎(s) = (e^{i(θ+s)} sin(φ/2), e^{is} cos(φ/2)).
- **Pinkall's theorem**: for a simple closed curve C on S² of length L enclosing area
  A < 2π, η⁻¹(C) is isometric to C/Λ with **Λ = 2πZ ⊕ (A/2 + iL/2)Z**.
- **Roll-up map** C/Λ → R³ (paper Steps 1–5). Given s + it and curve (θ(x), φ(x)):
  1. reduce s + it into the fundamental domain of Λ (both directions — fixing the
     admitted bug in lifting-modp's `toFundamentalDomain`);
  2. find v with L(v) = ∫₀ᵛ √(θ′² sin²φ + φ′²) dx = 2t  (precomputed table + binary search);
  3. θ = θ(v), φ = φ(v), f = ∫₀ᵛ **sin²(φ(x)/2)** θ′(x) dx  (table);
  4. h = H₍θ,φ₎(s − f), understood in C² ≅ R⁴;
  5. return σ(ρ·h) where ρ ∈ SO(4) is an optional rotation and
     **σ(x, y, z, w) = (x, y, z)/(1 − w)**.
- **Frobenius** on C/Λ is multiplication by the root α of x² − ax + p with chosen sign;
  as an integer matrix M on the ordered basis {1, τ} (ecfplat's `qf_ap_FrMat`,
  generator matrix ((0, −c), (a, −b))). E(F_{p^k}) = ker(Mᵏ − I).

> **Note (paper erratum candidate).** The published Step 3 reads sin(φ/2); both existing
> codebases and the holonomy geometry (holonomy = ½·enclosed area, dA = (1−cos φ)dθ =
> 2 sin²(φ/2)dθ) require **sin²(φ/2)**. The code uses the square; flag for the arXiv version.

**Orientation and projection are parameters, not conventions.** The legacy axis swizzles
((x,z,−y,w) etc.) existed to reorient output. Here the identification C² ≅ R⁴ is fixed
once — (z, w) = (x + iy, z + iw) — and all reorientation happens through two explicit knobs:

- `rotation`: ρ ∈ SO(4) given as a pair of unit quaternions (p, q), acting by x ↦ p·x·q̄.
  Rotating the torus in S³ *before* projecting dramatically changes the R³ picture
  (including turning the "inside" out); this becomes a slider instead of commented-out code.
- `pole`: stereographic projection center (default: the paper's σ, pole at w = 1).

## 4. Repository layout

Single Vite + TypeScript package (strict mode). Import boundaries enforced by lint rule:
`src/math` imports nothing outside itself (no three.js); `src/io` may import only math;
`src/geometry` may import three and math; `src/studio` may not import `src/author`;
`src/author` may import all of src; `demos/*` are leaves.

```
src/
  math/                    # PURE. Zero dependencies. Fully unit-tested (vitest).
    core/                  #   Complex, Vec2/3/4, small numeric helpers (own types)
    arithmetic/            #   BigInt integer linear algebra & finite curve points
    lattice/               #   lattices, SL2(Z), the lattice-matching problem
    hopf/                  #   the Hopf fibration, roll-up map, S³ geometry
    families/              #   profile-curve families + the τ solver
  geometry/                # three.js buffer construction (no scenes, no DOM)
  studio/                  # App, studios, path tracer, GUI panel, export
  author/                  # demo composition: CurveScene, showCurve, catalog (§7.5)
  io/                      # file formats: curve descriptors, ecfplat exports
data/                      # curve descriptors (curves.json — the catalog; §8)
demos/                     # one folder per demo, each a thin main.ts
docs/                      # this file, surveys/, conventions notes
test/                      # fixtures (incl. golden data generated from ecfplat)
```

## 5. Module design — `src/math`

### 5.1 `arithmetic` — exact points of E(F_{p^k})

```ts
interface CurveData {            // what io/ produces and everything downstream consumes
  form: QuadraticForm            // (a, b, c), disc d = b² − 4ac < 0
  trace: bigint                  // a = trace of Frobenius
  p: bigint
  sign: 1 | -1                   // choice of Frobenius root (im part sign)
  equation?: { f: bigint, g: bigint }   // y² = x³ + fx + g, for labeling & the F_p×F_p view
}

class Mat2Z { /* BigInt 2×2: mul, pow, sub, det, smithNormalForm() */ }

frobeniusMatrix(data: CurveData): Mat2Z          // ecfplat qf_ap_FrMat, asserts |tr| = |a|

// ker(M^k − I) ⊂ (Q/Z)² via Smith normal form — exact.
pointsOver(data: CurveData, k: number): CurvePoints
```

`CurvePoints` is E(F_{p^k}) as an exact group with its Galois structure. BigInt lives in
the algebra (M, powers, SNF); point coordinates are bounded by the group exponent, so
points are plain numbers (guarded < 2⁵³ at construction):

```ts
interface TorusPoint { x: number; y: number }     // exact integers mod N,
                                                  // meaning (x + yτ)/N ∈ C/Λ
class CurvePoints {
  readonly k: number
  readonly structure: [n1: number, n2: number]    // Z/n₁ × Z/n₂, n₁ | n₂
  readonly N: number                              // = n₂: ONE denominator for all points
  readonly size: number                           // n₁·n₂ = pᵏ + 1 − aₖ
  readonly generators: TorusPoint[]               // 0, 1, or 2
  readonly identity: TorusPoint                   // (0,0) — the point at infinity

  add(P, Q): TorusPoint;  neg(P): TorusPoint;  mul(m: number, P): TorusPoint
  order(P): number                                // N / gcd(x, y, N)
  frobenius(P): TorusPoint                        // M·P mod N
  degree(P): number                               // min j | k with P ∈ E(F_{p^j})
                                                  //   = Frobenius orbit size (cached)
  orbits(): { degree: number, points: TorusPoint[] }[]   // cyclic M-order preserved
  points(): TorusPoint[]
  toComplex(P): Complex                           // (x + yτ)/N — floats begin HERE
}
```

Design notes settled in discussion (2026-07-04):

- **No filtration API.** E(F_{p^j}) inside the k-picture is `{P : degree(P) | j}` — same
  coordinates, same denominator. A standalone level-j object is just `pointsOver(data, j)`
  (exponents satisfy N_j | N_k, so cross-level identification is an integer rescale).
- **No decoration/style types.** Demos are plain code: they call `degree/order/orbits` and
  build color/size arrays directly (shared palettes & repeated colorings are tiny helper
  functions, now in `src/author` — see §7.5 for how that grew into the authoring layer).
  Math carries nothing visual.
- **Orbit rendering is selective.** Frobenius is multiplication by α = √p·e^{iψ} — an
  expanding endomorphism — so generic orbits are equidistributed k-point constellations;
  drawing all of them is noise. `orbits()` keeps cyclic order (free), and demos use it for
  coloring and click/hover single-orbit highlighting. (Pleasant fact: degree-j orbit counts
  are the closed points of degree j, i.e. coloring by degree is a picture of ζ_E.)

Test invariants: |E(F_{p^k})| = pᵏ + 1 − aₖ (a₀ = 2, a₁ = a, aₖ = a·aₖ₋₁ − p·aₖ₋₂);
n₁ | pᵏ − 1 (Weil pairing); Möbius: #{degree exactly j} = Σ_{d|j} μ(j/d)·|E(F_{p^d})|.

*(Deliberately out of scope for now: computing the (a,b,c) ↔ j bijection itself — rigid
ℓ-sets, Vélu, modular polynomials. That stays in ecfplat; we consume its JSON.)*

### 5.2 `lattice` — τ, reduction, and the matching problem

```ts
class Lattice {                    // port of threejs-demos Lattice2D, re-typed
  constructor(tau: Complex)
  reduce(): { tau: Complex, g: Mat2Z }   // SL2(Z) reduction, returning the word used
  covolume(): number
}

// THE bookkeeping function replacing every hand-written tau.js:
// find g ∈ SL2(Z) and homothety λ ∈ C with λ·(Z ⊕ τZ) = 2πZ ⊕ (A/2 + iL/2)Z,
// given the (A, L) actually achieved by the solved profile curve.
matchLattices(tau: Complex, A: number, L: number): { g: Mat2Z, lambda: Complex }

// then a point (x + yτ)/N maps exactly to  λ·(x + yτ)/N  ∈ C/Λ_Hopf.
```

Realizability (region, strata, and SL₂(ℤ) representative enumeration) is the solver's
contract, not the caller's problem — see §5.4.

### 5.3 `hopf` — the fibration and the roll-up map

The key interface decision (motivated by future curve *evolution* within fixed (A, L)):
profile curves are **numerical objects**; formulas are just one way to make them.

```ts
interface ProfileCurve {           // closed curve on S², period 2π in the parameter
  sample(n: number): SpherePoint[]         // (θ, φ) samples — the canonical form
}
// implementations: LatitudeCircle, WavyCircle, DiscreteCurve (raw samples —
// the future home of curvature flows / evolved curves), later: splines.

class HopfTorus {                  // built from any ProfileCurve
  readonly length: number          // L
  readonly area: number            // A  (= 2·holonomy)
  readonly lattice: Complex[]      // [2π, A/2 + iL/2]
  // precomputed monotone arc-length & holonomy tables (Float64Array, binary search)
  rollUp(z: Complex): Vec4                 // paper Steps 1–4: C/Λ → S³  (exact isometry)
  surface(u: number, v: number): Vec4      // Surface-style sampling of the whole torus
  fiberAt(t: number): (s: number) => Vec4  // Hopf circles, for tube rendering
}

// Step 5, kept separate so the same S³ scene admits different projections:
class S3Projection {
  rotation: [Quaternion, Quaternion]       // ρ ∈ SO(4) as unit-quaternion pair
  pole: Vec4                               // default (0,0,0,1) → paper's σ
  project(x: Vec4): Vec3
  scaleFactor(x: Vec4): number             // 1 + |σ(x)|², for distortion-corrected radii
}
```

`HopfTorus` is rebuildable in ~O(resolution) so live curve animation stays cheap
(threejs-demos demonstrated 512-sample tables rebuilt per frame).

**Numerical precision (point placement on the preimage).** Data points must land exactly;
the strategy is two-tier:

- *Totals are near machine precision for free*: L and A are integrals of smooth periodic
  functions, and uniform trapezoid sums converge spectrally there. This protects
  `matchLattices` (an error in L or A shears the whole point cloud).
- *Surface vertices* (≥256², possibly per frame): precomputed tables + interpolation.
- *Data points* (thousands, on parameter change only): Newton on L(v) − 2t = 0 seeded from
  the table, derivative = the exact integrand — quadratic convergence, ~3 steps to machine
  precision; the holonomy f(v) evaluated by high-order local quadrature at the solved v.
- *DiscreteCurve* is promoted once to a smooth periodic interpolant (trigonometric or
  periodic cubic spline); all quadrature and derivatives act on the interpolant, making
  sample count the single accuracy knob (with a Richardson-style error estimate).
- *Acceptance tests*: N-torsion points vs. directly refined isometry values; points of
  E(F_{p^k′}) for k′ | k must coincide with their images in the k-picture (the filtration
  provides free consistency checks).

### 5.4 `families` — the τ solver

**Realizable region.** A curve gives τ_H = (A + iL)/(4π); with x = Re, y = Im:
A ∈ (0, 2π] ⟺ x ∈ (0, ½], and the spherical isoperimetric inequality L² ≥ A(4π − A)
⟺ **|τ_H − ½| ≥ ½**. So the region is the half-strip 0 < x ≤ ½ outside the open disk of
radius ½ at ½. The extended (reflection-allowed) fundamental domain {0 ≤ Re ≤ ½, |τ| ≥ 1}
lies inside it — every τ is realizable (Pinkall, now constructive). Reflection = mirroring
the profile curve = a `flip` flag carried through the match and applied to points.

**Strata match the arithmetic** — three solve modes:

| Stratum | Curve | Solve |
|---|---|---|
| boundary |τ′−½| = ½ (rectangular classes; SL₂-image of the imaginary axis) | latitude circle | closed form: A = 2π(1−cos φ₀), L = 2π sin φ₀ |
| wall Re τ′ = ½ (hexagonal-type; A = 2π) | equatorial wavy, φ₀ = π/2 pinned by symmetry (∫sin(b cos nt)dt = 0 forces A = 2π) | 1-parameter: amplitude b tunes L |
| interior (generic) | wavy family | 2-parameter Newton in (φ₀, b) |

(Corner case: the great circle sits on both walls and gives τ ~ i — Clifford torus =
square torus, as it must.) This derives what the old tau.js files hand-computed: the −8
latitude circle with arctan√2 rotation, and *why* the −3 hex curve was equatorial with
only its amplitude tuned.

**Default family** (generalizing the legacy hex curve; latitude circle = b = 0):
φ(t) = φ₀ + b·cos(nt), θ(t) = t + skew·sin(2nt). Properties: θ monotone ⟹ the curve is a
graph over the equator ⟹ **automatically simple** (Pinkall's hypothesis is structural);
bounds φ₀ ± b ∈ (0, π) (stays on the sphere chart) and |2n·skew| < 1 (monotonicity).
A, L, and the Newton Jacobian are integrals of smooth periodic functions → spectral
trapezoid; seeding by continuation from the latitude circle of matching A.

**Enumeration, not selection.** Different SL₂(ℤ) representatives τ′ give genuinely
different embeddings of the same curve (which homology class becomes the Hopf fiber
changes; lobe count n imprints an order-n ambient symmetry). The solver returns a sorted
candidate list; demos flip through candidates like camera angles:

```ts
solveProfileCurve(tau: Complex, family: CurveFamily, opts?): Candidate[]
interface Candidate {
  curve: ProfileCurve
  rep: { g: Mat2Z, flip: boolean }         // exact bookkeeping for matchLattices
  n: number
  achieved: { A: number, L: number }       // matchLattices consumes ACHIEVED values,
  residual: number                         //   so placement is exact at Newton tolerance
}
```

Policies (2026-07-04): default order = **shortest L first** (fattest torus; wilder
representatives remain available); lobe count = **smallest n that reaches** the target
within family bounds (deterministic; reported; user may pin n as artistic override).

Tests: legacy constants as fixtures (−8: A = 4π/3, L = 4π√2/3, rotation arctan√2;
−3: equatorial with the old amplitude); round-trip τ → curve → (A + iL)/4π → SL₂-reduce
= τ over a mesh of random τ; strata edge cases (boundary, wall, corner i).

Future (planned for, not built): constrained flows on `DiscreteCurve` — evolve within a
fixed-(A, L) level set to minimize bending energy etc. `ProfileCurve`-as-samples keeps
this door open; the solver's candidate structure is unaffected (a flowed curve just
replaces `curve` in its Candidate).

## 6. `src/geometry` — the renderable system

The uniform pattern for everything visible (points, surfaces, tubes, plaques):

**1. Renderables.** Each visual object is a class wrapping a `THREE.Object3D` whose public
surface is *typed setters, each documented cheap or expensive*. Setters apply immediately —
there is no update()/rebuild() protocol for callers, and no reactive framework. Cheap =
writes attributes/uniforms; expensive = resamples (reallocating only if counts changed).

**2. S³ caching.** Every renderable caches its samples in S³ — the Step-4 outputs
h = H₍θ,φ₎(s−f) ∈ S³ ⊂ R⁴, as flat Float64Arrays of (x,y,z,w), one quadruple per
vertex/point — and treats R³ positions as derived data (narrowed to Float32 only when
written into three.js buffers, so precision is lost exactly once). The expensive math
(reduction, arc-length inversion, holonomy) ends at S³; rotation ρ and projection σ are
a few flops per point and are exactly what the artistic sliders change. Hence `reproject(proj)` is a uniform O(vertices) transform for all
renderables — rotation/pole sliders never touch the math layer. Projection-dependent
corrections (point size compensation × (1+|q|²), tube radii) are recomputed inside the
renderable; they are consequences of the projection, not choices.

**3. The view group owns the projection.** `S3Group` (a THREE.Group) holds the single
`S3Projection` and fans `reproject` out to its members on `setProjection` — eliminating
the "forgot to update the tubes" bug class. The projection is a property of the view.

**4. Style helpers map math structure → visual arrays**, in `src/geometry/style.ts`
(math → geometry is the allowed import direction): `colorByDegree/Order/Orbit(pts, palette)`,
`sizeByDegree(pts, {subfieldBoost})`, `highlightOrbit(pts, P)`, shared `PALETTES`.
Named, tested, reused across demos — not scattered in demo files.

**5. Demos are wiring only**: every line binds a panel control to a setter. *(Since the
authoring layer, §7.5, the standard wiring itself ships as `showCurve` — a bespoke demo
still hand-wires exactly as described here.)*

Concrete renderables and their setters:

- `HopfTorusMesh(hopf, opts)` — the torus surface. Cheap: `setMaterial` (recipe or params).
  Expensive: `setSurface(hopf)` (in-place resample; the live-animation path),
  `setResolution(u, v)` (realloc — the only setter that touches the static grid
  index/seam buffers). NaN-hole handling kept from buildGeometry.
  **Normals are analytic, not finite-difference**: the cache holds, per vertex, both
  h ∈ S³ and the unit surface normal n ∈ T_hS³ (from the known tangents: ∂/∂s = fiber
  direction, ∂/∂t from the curve tables). Since σ is conformal it maps normal directions
  to normal directions, and dσ is closed-form — so reproject rewrites positions AND
  normals exactly, with no ε-evaluations and no computeVertexNormals pass. Surface
  vertices are evaluated by the fast table tier; data points by the Newton tier (§5.3).
- `PointCloud(positionsS3, {baseRadius, colors, sizes})` — InstancedMesh of spheres.
  Cheap: `setBaseRadius`, `setColors`, `setSizes` (arrays parallel to positions — index
  alignment is the contract). Expensive: `setPoints(positionsS3, colors?, sizes?)`.
  **Trace-mode bake**: the path tracer does not support InstancedMesh (see
  docs/surveys/three-gpu-pathtracer.md §5), so `PointCloud` maintains a second
  representation for `mode: 'trace'` — one merged BufferGeometry (low-tessellation sphere
  per point, transformed) with the per-point colors written as a per-vertex `color`
  attribute and one `vertexColors` material. Built lazily on entering trace mode,
  invalidated by `setPoints`; the mode switch toggles which object is visible.
  Consequence: per-point variation in trace mode is color-only (one material for all
  points). Large clouds: async BVH build (`setBVHWorker`) + raised tiles.
- `TubeSet(curvesS3, {radius})` — tubes for fibers, gridlines, lifted lines, orbit
  highlights. Cache: Vec4 centerline samples (+ closed/open flag) and the radius *as
  measured in S³*. Reproject: project centerline; per-sample world radius = r_S³ ×
  conformal scale factor of σ∘ρ (the same `proj.scaleFactor` used for point sizes — the
  compensation IS the conformal dilation, not a heuristic); rebuild rings with
  **rotation-minimizing frames** (not Frenet — no flips at inflections, no ring-popping
  under slider drags), deterministically seeded, closed loops sealing by distributing the
  frame holonomy around the loop. Cost: O(samples × radialSegments), closed-form.
  Free end-to-end tests: projected Hopf fibers must be exact circles (σ maps circles to
  circles); gridline tubes must not kink at fundamental-domain seams.
- `materials.ts` — the shared glass/matte/colored MeshPhysicalMaterial recipes
  (path-tracer compatible), currently duplicated across the old repos.

Where a point's size is decided, end to end: uniform radius = `PointCloud.setBaseRadius`
(bound to a slider); a per-point rule = a named function in `style.ts` producing a `sizes`
array; the array lives as an instance attribute inside `PointCloud`; the projection
compensation is internal to `PointCloud`. Colors identically. Nothing visual in `src/math`;
no per-point meaning in `src/geometry` internals — only in `style.ts` mappings.

## 7. `src/studio` — apps, studios, path tracing

**Studios are data; one runtime compiles them.** (Replaces knitted-surfaces' imperative
setup functions, whose structural flaws — no teardown, ad-hoc handles, tone mapping in the
App, floor height hardcoded — all trace back to studios being code.)

```ts
interface StudioSpec {
  name: string
  environment: EnvSpec              // gradient | hdri | solid; intensity; showAsBackground
  lights: LightSpec[]               // physical, PT-compatible; role key/fill/rim;
                                    //   previewOnly: true → raster helper, auto-zeroed in
                                    //   trace mode (the dimming trick, formalized)
  backdrop?: BackdropSpec           // floor | cyclorama | none; placed against CONTENT BOUNDS
  camera: CameraSpec                // fov + azimuth/elevation/fill-fraction — RELATIVE;
                                    //   optional dof: {fstop, focus: 'auto'|number} (PT-only)
  look: { toneMapping, exposure }   // part of the studio, not the App
}
```

```ts
class App {
  stage: THREE.Group                          // content (S3Group etc.); studios never touch it
  setStudio(spec: StudioSpec): StudioHandle   // runtime-swappable: dispose subtree, rebuild
  frame(opts?): void                          // fit camera + backdrop to stage bounding
                                              //   sphere per CameraSpec; EXPLICIT, never
                                              //   automatic (doesn't fight orbit controls)
  mode: 'live' | 'trace'                      // single canvas, mode flag (kept)
  invalidate(): void                          // ONE coarse "content changed" signal for PT;
                                              //   camera/environment invalidation automatic
  trace: { samples, target?, onProgress }     // progress exposed; samples/bounces/tiles real
  renderFinal(opts): Promise<Blob>            // trace N samples at chosen scale → PNG;
                                              //   sidecar: true also writes the render
                                              //   descriptor JSON (OFF by default)
}
```

Principles: (1) *studio-as-data buys reproducibility* — a finished artwork is
`{curve descriptor, k, candidate, style, studio, camera, projection, PT settings}`, and
`renderFinal({sidecar: true})` saves it next to the PNG so any image can be regenerated
(escape hatch: spec fields may take factory functions for one-offs). (2) *Relative camera
+ bounds-aware backdrop* absorb the wild scale variation stereographic projection causes.
(3) *One dirty signal* — PT resync is monolithic; finer flags were false precision.
(4) *Studio/content/GUI trisection is structural*: spec → subtree with typed handles;
content = `app.stage`; `addStudioControls(panel, handle)` generates the standard Studio
tab (env, light intensities, exposure, mode toggle, samples progress, save) in one line.

**Spec vocabularies, grounded in what the tracer supports**
(survey: docs/surveys/three-gpu-pathtracer.md):

- `LightSpec` kinds: `spot` (PhysicalSpotLight: radius for soft shadows, optional IES
  profile), `area` (ShapedAreaLight: rect or disc — best quality, MIS-weighted), `point`,
  `directional`; any may be `previewOnly` (raster helper, zeroed in trace mode — note
  ambient/hemisphere are ignored by the tracer anyway, so preview ambients are free).
  Punctual lights require MIS on (default). Prefer real area lights over emissive
  materials (emissive traces without MIS → noisy).
- `EnvSpec` kinds: `gradient` (GradientEquirectTexture: top/bottom/exponent), `hdri`
  (importance-sampled; optional pre-blur via BlurredEnvMapGenerator), `procedural`
  (ProceduralEquirectTexture callback — analytic studio backdrops), `solid`. Fields:
  intensity, rotation, `background` (separate visible background: color/blur/same).
- `CameraSpec`: fov, azimuth/elevation/fill; `dof?: {fstop, focus: 'auto'|number,
  apertureBlades?, anamorphicRatio?}` (PhysicalCamera, trace-only); `projection?:
  'perspective' | 'orthographic'` (ortho is traced fine — the flat-figure studio).
- `app.trace` settings: bounces, **transmissiveBounces** (raise for thick glass tori),
  filterGlossyFactor (firefly control), stableNoise (turntables/stills), renderScale,
  tiles (wrapped — upstream only exposes it on the internal renderer), dynamicLowRes for
  interactive framing, samples/target/onProgress.
- Glass materials use **attenuationColor/attenuationDistance** (Beer–Lambert tinted
  depth) — the recipe for colored glass tori that the old flat-transmission scenes lacked.
  `matte` shadow-catcher floors enable transparent-background composites for figures.

- **GUI**: our own dependency-free tabbed panel, seeded from knitted-surfaces' `panel.ts`.
- **Wiring**: explicit — demos are plain code binding panel controls to setters (§6).
- **Export**: screenshot (toBlob, both modes), `renderFinal` (+ optional sidecar), OBJ
  export of any BufferGeometry.
- **Starter studio**: `paper-white` (the Bridges-figure look: bright white environment,
  soft floor shadows, gentle key). Others (softbox, void, flat-figure for the 2D views)
  are one spec file each, added when a demo wants them.
- Deferred deliberately: denoising (the library's DenoiseMaterial screen-space pass is
  available as an optional final polish when wanted), video/timeline, EquirectCamera
  360° panoramas (supported upstream; fun for the site someday).

**Versions (2026-07-04, "newest everything")**: three ≥ 0.185 (r185), three-gpu-pathtracer
0.0.24 (requires r180+; WebGL2 only — we stay on WebGLRenderer), Vite 8, vitest 4,
latest TypeScript. Note 0.0.24 uses `HDRLoader` (not RGBELoader).

Layout: `src/studio/{App, Studio, specs, capture, panel/}` + `src/studio/studios/*.ts`
(the named registry).

## 7.5. `src/author` — demo authoring

*Added 2026-07-04 (after Phase 4), superseding the "no demo framework" stance of §5.1/§6.5
for the common path.* Phase 4 made studios declarative (StudioSpec, one runtime) and it
worked; the authoring layer extends the same move to demo composition. The goal, stated by
ST: choosing an elliptic curve and rendering it must be trivially easy and clear.
**Sugar, not a cage** — hand-wired demos against geometry/studio remain first-class.

The whole standard demo is one call:

```ts
import { showCurve } from '@/author'
showCurve({ title: 'first light' })            // ≡ the entire first-light demo
showCurve({ curve: 'disc −3 · hexagonal', k: 3, fibers: 8, studio: velvetDark })
```

`showCurve(spec)` assembles App + CurveScene + standard panel (Curve/Points/View) +
studio & Studio tab (picker across the registry) + orbit picking + URL params
(`?curve&k&lobes&fibers&grid&domain&studio&design&trace&blocktrace`, read-at-boot only —
render reproducibility lives in the sidecar) and returns `{ app, scene, panel, studio,
frame, dispose }` for imperative escape. Opt-outs: `controls/interaction/urlSync/fps:
false`, `studio: false`; opt-in `design: true` adds the studio Design tab (live spec
editing + "Copy spec" export of a ready-to-paste preset module).

Underneath is the composable core, `CurveScene`: state + renderables (S3Group with torus,
points, tubes; the DomainPlaque staged separately), no App/DOM — constructible headless in
tests. Recomputation is a **linear ladder**; a setter reruns its stage and every stage
after it:

| stage | inputs | work |
|---|---|---|
| resolve | curve, lobes | `solveProfileCurve`, reset embedding |
| build | k, embedding | `buildTorusScene` → surface/points/plaque |
| tubes | fibers, gridlines | fiber/edge/orbit tube curves |
| style | colorMode, boost, selection | color/size arrays → points & plaque |
| project | α, β, γ, pole | S3Projection → group |

Cheap knobs (radii, visibility, materials) are not state — use the renderables directly.
Each completed recompute fires `onChange` once (`showCurve` wires it to `app.invalidate()`).
`src/author` also holds the catalog (`CURVES` parsed from `data/curves.json`, `resolveCurve`)
and the promoted math↔geometry glue (`buildTorusScene`, `maxFeasibleK`, grid/fiber/orbit
curve generators) that began life in `demos/_shared`.

## 8. `src/io` — data in and out

- **Import (pathway 1):** Nadir's `.txt` point exports (float `[re,im]` pairs; filename
  metadata `points_f{f}_g{g}_p{p}_qf{a}_{b}_{c}_k{k}.txt`) and the ecfplat JSON bijection
  tables (`{"(a,p)": {j: [a,b,c]}}`).
- **Compute (pathway 2):** given `(a,b,c)` + `(a,p)` (typed in, or looked up in a bundled
  JSON table), `arithmetic` produces exact points internally. This is the preferred path —
  the `.txt` floats lose exactness and group structure.
- **Own format (BUILT, 2026-07-04):** a small JSON *curve descriptor* —
  `{label?, p, trace, sign, form, equation?}` — parsed and validated by
  `src/io/descriptors.ts` (Hasse bound, disc·f² consistency; bigints as numbers or decimal
  strings). `data/curves.json` is the catalog every demo lists; it is THE handoff contract
  with ecfplat (contract documented in `data/README.md`). k is chosen at render time, not
  stored. Render sidecars record the rest of a reproducible view.
- Ask Nadir: add integer `(x, y) mod N` (from `pts_from_gendic`) + the quadratic form to
  ecfplat's export, so pathway 1 is exact too.

## 9. Views (all consuming the same math core)

1. **3D torus** (phase one): glass torus + instanced points + optional fiber/grid tubes.
2. **Flat fundamental domain**: the parallelogram with lattice points, as flat plaque in 3D.
3. **S² base picture**: profile curve on the sphere, fibers over it (explains the construction).
4. **Folding animation**: flat parallelogram → torus with points riding along (RollUpMesh idea).
5. **F_p × F_p graph**: the affine scatter plot with point at infinity — connects back to
   the equation picture.
6. Structure overlays everywhere: color by order / field-of-definition filtration
   (F_p ⊂ F_p² ⊂ …) / Frobenius orbit; animate k growing.

## 10. Testing

- vitest on `src/math` (runs in Node, no browser, no three.js — this is why the core is
  zero-dependency).
- **Golden fixtures from ecfplat**: run Nadir's Python offline to dump point sets, τ values,
  Frobenius matrices, group structures for a battery of (equation, p, k); TS must reproduce
  exactly.
- **Invariants**: |E(F_{p^k})| = pᵏ + 1 − aₖ; ker nesting (field-of-definition filtration);
  solver round-trip τ → curve → (A, L) → τ′ with g·τ′ = τ; latitude-circle closed forms;
  isometry check (numerical metric pullback ≈ flat metric); σ conformality spot checks.
- **Legacy fixtures**: the hand-derived tau.js constants and lifting-modp's `data/` point
  files as regression anchors.

## 11. Phases

Each phase ends with something visible and testable; plans reviewed before coding.

- **Phase 0 — scaffold.** Vite + TS strict + vitest + lint (import-boundary rule), empty
  module skeletons, this document finalized.
- **Phase 1 — exact layer.** `math/core`, `math/arithmetic`, `math/lattice` with full tests
  (ecfplat fixtures generated). Deliverable: CLI-ish test output listing E(F_{p^k}) with
  structure for the paper's example curves.
- **Phase 2 — Hopf layer.** `math/hopf`, `math/families`: roll-up map, S³ projection,
  τ solver, lattice matching. Deliverable: solver reproduces all legacy tau.js data;
  numerical isometry test passes.
- **Phase 3 — first light.** `geometry` + minimal viewer: torus + instanced points, live
  sliders (k, lobes n, S³ rotation, projection pole), color by structure. The live-demo
  milestone.
- **Phase 4 — studios.** `studio` layer: panel GUI, studio registry, path tracer with
  progress UI, screenshot. Deliverable: reproduce a Figure-11-class render from the paper.
- **Phase 4.5 — authoring (built 2026-07-04).** `src/author` (§7.5): `CurveScene` +
  `showCurve`, catalog from `data/curves.json` descriptors (§8), studio picker/Design
  tab/spec export, velvet-dark, gallery batch-render demo. first-light = one call.
- **Phase 5 — breadth.** Remaining views (§9), io round-trip for legacy exports,
  optional static multi-demo build (gallery-ready, per "local-first, keep door open").

## 12. Decisions log

| Date | Decision |
|---|---|
| 2026-07-04 | General τ→curve solver; wavy-circle default family, lobe count etc. as artistic params; discrete curves first-class (future: fixed-(A,L) curve evolution) |
| 2026-07-04 | Zero-dependency math core; own Complex/Vec types; three.js only in geometry+ |
| 2026-07-04 | TS Frobenius fixed-point arithmetic (BigInt) from the start; file import as second pathway |
| 2026-07-04 | Single package, layered src/, thin demos; vitest; lint-enforced boundaries |
| 2026-07-04 | Explicit wiring (no reactive framework); own GUI panel seeded from knitted-surfaces |
| 2026-07-04 | Point model carries: field-of-definition filtration, group structure/orders, Frobenius orbits |
| 2026-07-04 | Views in scope: 3D torus first; flat domain, folding, S² base, F_p×F_p graph to follow |
| 2026-07-04 | Local-first dev; keep static gallery build possible |
| 2026-07-04 | Paper conventions verbatim (η, H, σ, Λ = 2πZ⊕(A/2+iL/2)Z); Step-3 integrand is sin²(φ/2) (paper typo, confirmed by ST) |
| 2026-07-04 | Point framework: CurvePoints methods only — no decoration types, no filtration API, no style functions; style.ts helpers in geometry; PointCloud/HopfTorusMesh/TubeSet cache S³ samples, view group owns projection |
| 2026-07-04 | Solver returns sorted Candidate[] (enumeration, not selection); default = shortest L; lobe count = smallest reaching n, user-pinnable |
| 2026-07-04 | Studios are declarative StudioSpecs compiled by one runtime; runtime-swappable; relative camera framing + bounds-aware backdrop; one coarse invalidate(); starter studio paper-white; render-descriptor sidecar optional flag; PhysicalCamera DoF as optional CameraSpec field |
| 2026-07-04 | Authoring layer `src/author` (§7.5): demos-as-specs (`showCurve`) atop composable `CurveScene`; extends studios-as-data to demo composition; supersedes "demos are wiring only" for the common path; hand-wiring stays first-class |
| 2026-07-04 | `demos/_shared` promoted into `src/author`; recompute = linear ladder resolve < build < tubes < style < project; URL params read-at-boot only (no write-back); zero new dependencies |
| 2026-07-04 | `data/curves.json` descriptor list = the ecfplat handoff contract and the demo catalog (single source, parsed+validated at import); j↔(a,b,c) bijection stays Python-side |
| 2026-07-04 | Studio design workflow: picker in Studio tab (registry swap), opt-in Design tab edits spec data live via setStudio recompile, "Copy spec" serializes a preset module; second built-in studio velvet-dark |
| 2026-07-06 | Cayley graphs of E(F_{p^k}) for the SNF generators: `cosets(g)` on CurvePoints (math); edges rendered per generator as the \|E\|/order(g) ⟨g⟩-coset cycles, each a CLOSED GEODESIC of ℂ/Λ (adding g = translation by the constant λ·g) — `cayleyCurves` in author, one TubeSet per generator (g₁ green, g₂ purple), `cayley` in CurveScene/showCurve/`?cayley=g1\|g2\|both` |

## 13. Open questions

- Extend ecfplat's export with exact integer coordinates + form data (ask Nadir).
- Curve-evolution flows: functional(s) to minimize, discretization of the (A, L) constraint
  manifold — design when we get there (post Phase 5).
- Supersingular cases / sign conventions: confirm the `sign` handling against ecfplat when
  building fixtures.
