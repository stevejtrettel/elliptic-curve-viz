# elliptic-curve-viz

Drawing elliptic curves over finite fields as point sets on flat tori in S³ (Pinkall's
construction via the Hopf fibration), stereographically projected to R³ — live in WebGL
and path-traced for final renders.

Companion code to N. Hajouji & S. Trettel, *Elliptic Curves and the Hopf Fibration*,
Bridges 2025 ([arXiv:2505.09627](https://arxiv.org/abs/2505.09627)) and
[elliptic-curves.art](https://www.elliptic-curves.art/).

**Read [DESIGN.md](DESIGN.md) first** — architecture, mathematical conventions, and the
decisions log. Reference-repo surveys live in [docs/surveys/](docs/surveys/).

## Commands

```
npm run dev        # dev server; opens a demo index (select with ?demo=<name>)
npm run build      # static build of all demos
npm test           # vitest (src/math unit tests)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint — also enforces the layer boundaries (src/math is pure)
```

## Layout

```
src/math/       pure mathematics — zero dependencies, fully tested
src/geometry/   three.js renderables (S³-cached buffers)
src/studio/     app shell, studios, path tracing, GUI
src/io/         file formats
demos/          one folder per demo; demos/_loader.ts is the index
```
