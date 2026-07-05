# demos/ — how to add one

1. `mkdir demos/<name>` and create `main.ts` in it.
2. Write the demo — the spec is a complete scene layout, so the file reads as
   *what this demo shows and how it is composed*:

   ```ts
   import { showCurve } from '@/author'
   import { velvetDark } from '@/studio'

   showCurve({
     curve: 'disc −3 · hexagonal',            // the subject: catalog label/index or raw data
     k: 3,                                     //   points of E(F_{p³})
     embedding: 1,                             //   which solver candidate (torus shape)

     view: { alpha: 0.6, pole: 0.35 },         // the composition: S³ rotation + pole
     camera: { azimuth: -0.4, elevation: 0.45, fill: 0.8 },
     fibers: 12, gridlines: 6, tubeRadius: 0.009,
     pointRadius: 0.045, colorBy: 'orbit',
     torus: 'glass',                           //   or 'matte' | false

     studio: velvetDark,                       // the lighting/backdrop preset
   })
   ```

3. There is no step 3. The loader globs `demos/*/main.ts`; your demo appears on the
   index page and at `?demo=<name>`.

Everything is optional — `showCurve({})` is the plain paper-white default. Other knobs:
`lobes`, `subfieldBoost`, `showPoints`, `domain` (flat fundamental domain), `design: true`
(studio editor tab + Copy-spec export), `studio: false`, and `controls / interaction /
urlSync / fps: false` to strip pieces. New curves go in `data/curves.json` (see
[data/README.md](../data/README.md)); new studios in `src/studio/studios/`.

To customize beyond the spec, use the returned handles — every knob is exposed:

```ts
const demo = showCurve({ title: 'my demo' })
demo.scene.points.setBaseRadius(0.05)                       // renderables directly
demo.panel!.tab('Extras').slider('Wobble', { min: 0, max: 1, step: 0.01, value: 0 }, (v) => {
  demo.scene.setView({ gamma: v })                          // state via the scene
})
```

Fully hand-wired demos (plain three.js against `@/geometry` + `@/studio`, no authoring
layer) remain first-class — see DESIGN.md §6 for the renderable/setter vocabulary.
