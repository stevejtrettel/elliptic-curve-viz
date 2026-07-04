# Survey: `knitted-surfaces` (studio / path-tracer separation)

*Exploration report generated 2026-07-04 as input to the elliptic-curve-art rewrite. Only the studio/environment machinery is relevant; the weaving pipeline is not.*

## 1. Overall structure & tech stack

- **Language/build:** TypeScript (`~5.9.3`), ESM (`"type":"module"`), Vite `^7.2.4`. Path alias `@` → `src` (`vite.config.ts`). Multi-page build — each demo is its own HTML entry (`vite.config.ts` `rollupOptions.input`).
- **3D:** `three@^0.181.2` (`@types/three@^0.181.0`), path tracer `three-gpu-pathtracer@^0.0.23`. Both real deps in `package.json`.
- **Layout:** `src/scene/` is the reusable engine layer (App, scene presets, GUI, path-trace/screenshot controls, and the `weaveStudio` scaffold). `src/geometry/`, `src/weave/`, `src/output/` are the math/mesh/knitting pipeline (mostly NOT relevant to the rewrite). `demos/*` are per-topic entry points; `demos/_shared/` holds two demo scaffolds (`surfaceDemo.ts`, `objDemo.ts`).
- No test framework, no linter config beyond `tsconfig.json`.

## 2. Studio / content separation

The separation is real but shallow. Two layers worth distinguishing:

**(a) The generic engine — `App` + `createScene` + scene setup functions.** This is the genuinely reusable "studio vs content" seam.

- `src/scene/App.ts:16-123` — owns `scene`, `camera`, `renderer` (ACES tone mapping + sRGB output set at `App.ts:47-48`), `OrbitControls`, the render loop, and the path tracer. It knows nothing about lights, floors, or geometry.
- `src/scene/createScene.ts:4-11` — `createScene(setup, appOptions)`: constructs an `App`, runs a **setup function** `(app) => R` that mutates `app.scene`, and returns `{ app, ...result }`. This is the "contract": a studio is just a function that adds things to the scene and returns a typed handle.
- `src/scene/scenes/types.ts:3-5` — the contract type is minimal: `SceneResult { lights?: StudioLights }`. That is the ONLY structured thing a scene hands back.
- **The one real studio:** `src/scene/scenes/studio.ts:13-20` — `studioScene(opts)` returns a setup fn that composes three presets and returns `{ lights }`:
  - `addGradientEnvironment` (`presets/environment.ts:9-19`) — a `GradientEquirectTexture` (from the path tracer lib) set as **both** `scene.environment` and `scene.background`; top/bottom colors configurable.
  - `addFloor` (`presets/floor.ts:9-23`) — a rotated `PlaneGeometry` with a `MeshPhysicalMaterial`; y/size/color options.
  - `addStudioLighting` (`presets/lighting.ts:12-46`) — 3 `PhysicalSpotLight`s (key/fill/rim, from the path tracer lib, `castShadow`) **plus** a `DirectionalLight` "preview" and an `AmbientLight`. Returns a `StudioLights` struct exposing all five.
- **The other scene:** `src/scene/scenes/empty.ts:9-14` — just sets a solid background. Shows the pattern is meant to scale to multiple studios, but only one full studio exists today.

**(b) The domain scaffold — `weaveStudio.ts`.** `src/scene/weaveStudio.ts:68-230` is what the demos actually call, and it conflates "studio" with "app + GUI + knitting pipeline." It calls `createScene(studioScene(...))` at `weaveStudio.ts:69-71`, sets camera (`:72-74`), owns tube/line/border **materials** (`:76-82`), builds the `ControlPanel` with Geometry/Look/Render tabs (`:94-97`), and exposes `start(providers)` where `providers` is the content contract for geometry/pattern/options (`StudioProviders`, `:50-54`).

**Interface between studio and content, concretely:**
- Content is injected as **provider callbacks**: `{ geometry(), pattern(), options() }` (`weaveStudio.ts:50-54`, `180-227`). The demo owns the pickers; the studio owns rebuild/render.
- Lights/env/floor/camera/tone-mapping live entirely on the studio side; the mathematical object is added to `app.scene` by `rebuild()` (`weaveStudio.ts:165-178`).
- **How studios are swapped:** by passing a different setup function to `createScene`. There is no runtime studio-switcher, no registry, no teardown/rebuild of a studio — you choose it once at construction. Swapping studios live is not supported.

## 3. Path tracer integration

All path-tracer logic is centralized in `App` plus a thin toggle helper — this is the cleanest part.

- **Setup (lazy):** `App.enablePathTracing()` (`App.ts:61-74`) constructs `WebGLPathTracer(this.renderer)` on first use, sets `bounces` from `ptDefaults`, `tiles.set(2,2)`, then `setScene`, `updateMaterials`, `updateEnvironment`. Defaults come from `AppOptions.pathTracerDefaults` (`App.ts:13`, `53-56`); weaveStudio passes `{ bounces: 10, samples: 1 }` (`weaveStudio.ts:70`) — note **`samples` is accepted but never actually applied** to the tracer.
- **Coexistence with WebGL:** single canvas, a **mode flag** `ptMode` (`App.ts:23`), not a separate renderer. The render loop (`App.ts:92-116`) branches: if `ptMode`, `pathTracer.renderSample()`; else `renderer.render()`. `disablePathTracing()` just flips the flag (`App.ts:76-78`) — the tracer object is retained.
- **Reset / re-sample logic (progressive):** the loop re-samples every frame. It resets only on two dirty signals (`App.ts:101-112`): environment change (compares `scene.environment` identity) and a `materialsNeedUpdate` flag toggled via `notifyMaterialsChanged()` (`App.ts:80-82`). Callers must manually call `notifyMaterialsChanged()` after any material/geometry edit — done throughout `weaveStudio.ts` (e.g. `:177`, `:189-194`). **Camera/orbit movement does NOT trigger a reset here** — the library's internal camera handling is relied on implicitly.
- **Materials:** ordinary `MeshPhysicalMaterial`s are read directly by the tracer via `updateMaterials()`. No dedicated material conversion layer.
- **Toggle UX:** `src/scene/pathTraceToggle.ts`. `addPathTraceControl(app, tab, {lights})` (`:55-64`) adds a GUI toggle; `togglePathTrace` (`:19-28`) enables/disables and **dims the raster-only helper lights** (`setPathTraceLights`, `:12-16`: `preview.intensity` and `ambient.intensity` → 0 while tracing, restored after). This is the key trick: preview lights make the rasterized view look right, but are zeroed so the tracer uses only the physical spot lights. A legacy toolbar variant `addPathTraceToggle` (`:34-49`) also exists.
- **Denoising / progressive UI:** none. No denoiser, no sample counter, no progress bar. Progressive refinement happens silently frame-by-frame.

## 4. Other reusable pieces

- **Custom GUI (no dependency):** `src/scene/panel.ts` (266 lines) — vanilla-DOM tabbed `ControlPanel` with `slider/dropdown/color/toggle/button` factories returning `{value, set()}` handles; styles injected once (`panel.ts:21-63`), dark glassy aesthetic. `src/scene/ui.ts` (99 lines) is an older `Toolbar`/`Button` primitive still used by minimal demos. Clean, dependency-free GUI worth keeping.
- **Screenshot system:** `src/scene/screenshot.ts` — `captureScreenshot` uses `renderer.domElement.toBlob` (relies on `preserveDrawingBuffer:true`, default in `App.ts:43`), works for both raster and path-traced frames. `addScreenshotControl` wires a GUI button.
- **OBJ export:** `src/output/obj.ts` + `src/io.ts` (`downloadOBJ`/`downloadBlob`).
- **Materials:** no shared material library — materials are inlined per-scaffold. A reusable material factory does not exist yet.
- **Demo scaffolds:** `demos/_shared/surfaceDemo.ts` and `objDemo.ts` show the provider-injection pattern (`surfaceDemo.ts:47-51`).

## 5. Assessment

**Works well / worth carrying into the rewrite:**
- The `App` class is a clean, framework-agnostic core: renderer + camera + controls + a **mode-flag path tracer** living behind `enable/disable/notifyMaterialsChanged`. The dirty-flag reset model (`App.ts:101-112`) is simple and correct in spirit.
- The `createScene(setup) → { app, ...result }` seam (`createScene.ts`) is a genuinely good "studio = function that populates a scene and returns a typed handle" contract. Environment/floor/lighting split into composable `presets/*` is exactly the right granularity for multiple studios.
- The **preview-light dimming trick** (`pathTraceToggle.ts:12-16`) is a smart, reusable answer to "same scene has to look right rasterized AND physically path-traced."
- Single-canvas toggle (not two renderers) keeps camera/controls/screenshot unified across both render modes.
- The custom vanilla GUI and the toBlob screenshot are dependency-free and portable.

**Rudimentary / awkward — redesign candidates:**
- **`weaveStudio` conflates three concerns:** studio setup, GUI construction, and the knit-specific pipeline are all in one 230-line function. For the rewrite, the "studio" (env/lights/camera/tone) should be separable from "content" (the torus) and from GUI.
- **Only one real studio exists** (`studioScene`); the multi-studio ambition isn't realized. There's no studio registry, no runtime switching, no teardown — a studio is chosen once at `createScene` time and its objects are never removed. Live studio-swapping would need new machinery.
- **The scene contract is too thin:** `SceneResult` only carries `lights?`. Camera framing, tone-mapping params, background color, and floor handle are not part of the returned contract, so callers reach into `app.scene`/`app.camera` ad hoc. A richer studio handle (camera preset, tone mapping, exposure, env intensity, dispose()) would help.
- **Path tracer reset is incomplete:** `samples` default is plumbed but never applied; no explicit reset on camera move (relies on library internals); no exposure/env-intensity control; `bounces`/`tiles` are hardcoded at enable-time and not GUI-exposed.
- **No progressive-render feedback** (sample count / done indicator) and **no denoiser** — for final renders both are wanted.
- **Materials are scattered and inlined**, no shared PBR library.
- **Tone mapping / color management is fixed** in `App` constructor rather than being a studio-level, per-look setting.

Net: the `App` + `createScene` + `presets/*` + `pathTraceToggle` quartet is the reusable nucleus; `weaveStudio.ts` is the anti-pattern to decompose (studio ≠ GUI ≠ content).
