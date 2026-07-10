# elliptic-curve-viz

Visualizing elliptic curves — over finite fields as point sets on flat tori in **S³**
(Pinkall's construction via the Hopf fibration), and over **ℂ** as complex tori embedded in
**CP²** — live in WebGL and path-traced for final renders.

Companion code to N. Hajouji & S. Trettel, *Elliptic Curves and the Hopf Fibration*,
Bridges 2025 ([arXiv:2505.09627](https://arxiv.org/abs/2505.09627)), and the gallery behind
[elliptic-curves.art](https://www.elliptic-curves.art/).

> **Architecture, conventions, and the decisions log live in [DESIGN.md](DESIGN.md).** This
> README is the tour; DESIGN.md is the reference. Reference-repo surveys are in
> [docs/surveys/](docs/surveys/).

---

## The mathematics

The project draws the *same* elliptic curve several ways, each consuming a shared, exact
math core (`src/math`, pure and fully tested — floats enter only where geometry begins).

### 1. Curves over finite fields, as flat tori in S³ (the main construction)

An elliptic curve `E / F_p` with complex multiplication corresponds to a lattice
`Λ = ℤ ⊕ τℤ`, where τ comes from the CM quadratic form `(a, b, c)`:

```
τ = (−b + √d) / 2a,        d = b² − 4ac  < 0
```

Two facts make the finite side **exact** (no floating point):

- **Points.** Frobenius acts on `ℂ/Λ` as multiplication by the root α of `x² − aₚx + p`; as
  an integer matrix `M ∈ M₂(ℤ)` on the basis `{1, τ}`, the points over the degree-`k`
  extension are the exact kernel
  `E(F_{p^k}) = ker(Mᵏ − I) ⊂ (ℤ/N)²`
  — integers mod N, with full group structure (order, Frobenius orbits, subfield filtration
  `F_p ⊂ F_{p²} ⊂ …`).

- **The flat torus.** By **Pinkall's theorem**, a simple closed curve `C` on S² of length
  `L` enclosing area `A < 2π` has Hopf preimage `η⁻¹(C) ⊂ S³` isometric to `ℂ/Λ_Hopf` with
  `Λ_Hopf = 2πℤ ⊕ (A/2 + iL/2)ℤ`. Solving for a profile curve on S² that realizes our τ
  (a homothety `Λ_τ → Λ_Hopf`) gives an honest **flat torus** in S³.

The **roll-up map** (paper Steps 1–5) sends each point `s + it ∈ ℂ/Λ` onto that torus in
S³; an optional SO(4) rotation, then stereographic projection `σ(x,y,z,w) = (x,y,z)/(1−w)`,
lands everything in R³. Points are rendered as instanced spheres colored by **field of
definition** or **order/orbit**; the torus surface, Hopf fibers, and the lattice grid are
tubes/meshes on top.

The offline arithmetic (the Deuring lift `j ↔ (a,b,c)`, point sets, τ) comes from Nadir's
**ecfplat**; the JSON handoff contract is [data/curves.json](data/README.md).

### 2. Curves over ℂ, as complex tori in CP² (the `complex` gallery piece)

`E = ℂ/(ℤ + τℤ)` drawn via the **Weierstrass ℘-function**: `z ↦ [℘(z) : ℘′(z) : 1]`
embeds the torus in CP², and projecting `(℘, ℘′) ∈ ℂ² ≅ R⁴` to R³ gives the surface. The
single point at infinity `O = [0:1:0]` (the pole `z = 0`) is cut with a smooth ellipsoidal
cutoff, traced as the **line-at-infinity** loop. On top we draw the **real locus E(ℝ)**, its
**−1 quadratic twist**, and the hierarchical lattice grid. ℘ and ℘′ are computed from Jacobi
θ₁ ([src/math/elliptic/weierstrass.ts](src/math/elliptic/weierstrass.ts)).

### 3. The equation picture, and real curves

- **Finite affine scatter** `E(F_p) ⊂ F_p × F_p` (`demos/elliptic-fp`, `demos/curve-and-points`):
  the familiar solutions-of-the-equation plot, plus the point at infinity — connecting the
  torus picture back to `y² = x³ + …`. Backed by pure `src/math/finite-field`.
- **Real elliptic curves** `y² = x³ + ax + b` in the plane
  ([src/math/elliptic/real-curve.ts](src/math/elliptic/real-curve.ts)): elementary sampling
  straight from the coefficients — an **oval + unbounded branch** (three real roots) or a
  **single branch** (one), by the sign of `−4a³ − 27b²`.

---

## The gallery (the art)

`gallery/` is the curated art project — a single click-to-run site, separate from the dev
`demos/`. Two fixed sections plus the complex piece:

- **One characteristic** — curves over a single prime, varied by trace: `a0`–`a4` (over F₅).
  `a0-1` / `a0-2` are single-curve **square prints** of the a0 pair.
- **One curve** — the conductor-11 curve followed across characteristics: `over ℂ`
  (`complex`, the CP² picture above), then `p = 23`, `101`, `107` (the p-series; p107 is the
  ℤ/6 class group as a hexagon).

Each piece is a folder `gallery/<name>/` with `main.ts` (composition), `curves.json` (pure
arithmetic descriptors), and `piece.json` (the saved look: camera, poses, materials,
export). Tune a piece live and hit **Save** (dev only) to write its `piece.json` back.

```
npm run gallery          # serve the gallery locally (localhost:5173)
npm run gallery:build    # → dist-gallery/  : one self-contained, transportable folder
npm run gallery:preview  # serve the built dist-gallery/
```

**Deploy:** `dist-gallery/` is pure static files with relative paths (`base: './'`) — drop
it on any host, at the root or any subpath. The hosted copy is read-only (no Save endpoint).

**Serve on your LAN** (view from another computer on the same network):

```
npm run gallery:build
npx vite preview --outDir dist-gallery --host    # prints a http://<your-ip>:4173/ URL
```

---

## Commands

```
npm run dev [<demo>]   # dev server; no arg → demo index (?demo=<name>), or name one directly
npm run build [<demo>] # static build of all demos (or one, → dist/<demo>/)
npm run gallery        # serve the art gallery (see above)
npm test               # vitest — src/math unit tests (35 files, run in Node, no browser)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint — also enforces layer boundaries (src/math stays pure)
npm run solve          # τ-solver battery (scripts/solve-tau.ts)
npm run points         # list E(F_{p^k}) point sets (scripts/list-points.ts)
```

## Using & authoring

The whole standard experience — panel, studio, path tracing, orbit picking, URL params — is
one call (DESIGN.md §7.5):

```ts
// demos/<name>/main.ts  — one curve on its torus:
import { showCurve } from '@/author'
showCurve({ curve: 'disc −3 · hexagonal', k: 3, fibers: 8 })

// a composed PIECE — one or more tori, layout + gizmo placement + Save:
import { showPiece } from '@/author'
showPiece({ name: 'my-piece', curves, piece })
```

Curves live in [data/curves.json](data/README.md) (the ecfplat handoff contract); k is
chosen at render time. Useful URL params on any authored demo:
`?curve=&k=&fibers=&grid=&domain=1&studio=velvet-dark`, `?design=1` (live studio editor +
Copy-spec export), `?trace=1` (boot path-traced).

**Rendering.** Every studio supports a live WebGL view and a progressive path trace
(three-gpu-pathtracer). Glass surfaces need FrontSide + zero thickness; final PNGs export
with a reproducibility sidecar. Baked point-sphere detail is chosen adaptively against a
triangle budget ([src/geometry/bake-instanced.ts](src/geometry/bake-instanced.ts)) — dense
scenes coarsen, sparse ones stay smooth.

## Project layout

```
src/math/       pure mathematics — zero dependencies, fully tested
  core/           Complex
  lattice/        τ-reduction, SL₂(ℤ) bookkeeping, lattice matching
  arithmetic/     Frobenius matrix, exact E(F_{p^k}) points
  families/       profile-curve solver (realize τ as a curve on S²)
  hopf/           the roll-up map C/Λ → S³, torus geometry
  elliptic/       Weierstrass ℘ (via θ₁); real affine locus y²=x³+ax+b
  finite-field/   F_p arithmetic, P²(F_p) enumeration, the equation picture
src/geometry/   three.js renderables (S³-cached buffers, materials, tubes, bake)
src/studio/     app shell, studios, path tracing, GUI panel, export
src/author/     composition: CurveScene, showCurve / showPiece, catalog, placement
src/io/         file formats (curve descriptors)
data/           curves.json — the descriptor catalog (ecfplat handoff)
demos/          dev demos, one folder each; demos/_loader.ts is the index
gallery/        the curated art site; gallery/gallery.ts is the manifest
scripts/        offline CLIs (solve-tau, list-points) + the dev/build runner
test/           vitest suites for src/math
```

## Further reading

- **[DESIGN.md](DESIGN.md)** — full architecture, the fixed mathematical conventions, the
  view catalog (§9), and the running decisions log.
- **The paper** — [arXiv:2505.09627](https://arxiv.org/abs/2505.09627) for the construction.
- **[docs/surveys/](docs/surveys/)** — notes on the reference repos (ecfplat, lifting-modp,
  knitted-surfaces, three-gpu-pathtracer, threejs-demos).
```

Requires a WebGL2 browser; built on three.js (r185) + three-gpu-pathtracer, bundled with Vite.
