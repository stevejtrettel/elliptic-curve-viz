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

## Authoring a demo

The whole standard experience — panel, studio, path tracing, orbit picking, URL params —
is one call (DESIGN.md §7.5):

```ts
// demos/<name>/main.ts
import { showCurve } from '@/author'
showCurve({ curve: 'disc −3 · hexagonal', k: 3, fibers: 8 })
```

Curves live in [data/curves.json](data/README.md) (the ecfplat handoff contract).
Useful URL params on any authored demo: `?curve=&k=&fibers=&grid=&domain=1&studio=velvet-dark`,
`?design=1` (live studio editor + Copy-spec export), `?trace=1` (boot path-traced),
`?demo=gallery` batch-renders the collection.

## Layout

```
src/math/       pure mathematics — zero dependencies, fully tested
src/geometry/   three.js renderables (S³-cached buffers)
src/studio/     app shell, studios, path tracing, GUI
src/author/     demo composition: CurveScene, showCurve, the curve catalog
src/io/         file formats (curve descriptors)
data/           curves.json — the descriptor catalog
demos/          one folder per demo; demos/_loader.ts is the index
```
