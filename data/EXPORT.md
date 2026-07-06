# Curve export format for elliptic-curve-viz

*For Nadir — the handoff contract between ecfplat and the renderer
(github.com/stevejtrettel/elliptic-curve-viz). One JSON file in, every view
out; no point data crosses the boundary.*

## What the renderer needs

Per curve, exactly the integers that determine the Frobenius action on the CM
lattice — the output of the j ↔ (a,b,c) bijection:

```jsonc
{
  "label": "disc −8 · y² = x³ + x + 2 over F_11",   // optional; generated if absent
  "p": 11,                                           // the prime
  "trace": 6,                                        // a_p, trace of Frobenius
  "sign": 1,                                         // ±1, see below; default 1
  "form": { "a": 1, "b": 0, "c": 2 },               // quadratic form from the bijection
  "equation": { "f": 1, "g": 2 }                     // optional: y² = x³ + fx + g (labels only)
}
```

The file is a single JSON array of these records — as many curves, primes, and
discriminants as you like in one file.

From `(form, trace, p, sign)` the TypeScript side reconstructs the Frobenius
matrix M on the basis {1, τ} (the same construction as `qf_ap_FrMat`,
ecqf_tools.py:363) and computes, exactly, for any k chosen at render time:
E(F_{p^k}) = ker(Mᵏ − I) via Smith normal form — group structure, generators,
orders, Frobenius orbits, fields of definition. So:

- **Do NOT export point coordinates.** The old `.txt` float exports lose
  exactness and the group structure; they are not consumed at all.
- **Do NOT include k.** The field extension is a render-time choice; one
  record serves every k.

## Field details

- **Integers**: JSON numbers are fine up to 2⁵³; beyond that, use decimal
  strings (`"p": "9007199254740993"`) — both are accepted for `p`, `trace`,
  and the form/equation entries.
- **`form`**: the representative your bijection produces. Its discriminant may
  be the fundamental one — the renderer handles trace² − 4p = disc(form)·f²
  with any integer conductor f (e.g. disc −7 at p = 11 has f = 2).
- **`sign`**: the same ± convention as the `ap` sign in `qf_ap_FrMat` /
  the fixture-generation runs — it selects which of the two conjugate
  Frobenius embeddings acts, i.e. the mirror orientation of the rendered
  orbit structure. If a curve's sign is ambiguous on your side, pick one
  consistently; flipping it mirrors the picture.
- **`label`**: whatever you want shown in menus; if omitted the renderer
  generates `form (a,b,c) · p=… · a=…`.
- Extra fields (e.g. `"j"`, `"disc"`, comments) are allowed and ignored — feel
  free to include anything useful for bookkeeping.

## Validation on import (fail loudly, per record)

1. disc(form) = b² − 4ac < 0;
2. Hasse: trace² ≤ 4p;
3. trace² − 4p = disc(form) · f² for an integer conductor f;
4. sign ∈ {+1, −1}.

If a record passes these, every downstream quantity is determined.

## One known ecfplat bug (does not affect this export)

`pts_from_gendic`'s cyclic branch crashes at ecqf_tools.py:131 —
`ZnProduct((lm.lm))` should be `ZnProduct((lm, lm))` (`lm` is an int). Only
the point-export pathway hits it, which this format bypasses entirely.

## Example: a minimal three-curve file

```json
[
  { "p": 11, "trace": 6, "form": { "a": 1, "b": 0, "c": 2 },
    "label": "disc −8 (paper example)" },
  { "p": 7,  "trace": 5, "form": { "a": 1, "b": 1, "c": 1 },
    "label": "disc −3 hexagonal", "equation": { "f": 0, "g": 1 } },
  { "p": 11, "trace": 4, "form": { "a": 1, "b": 1, "c": 2 },
    "label": "disc −7 (conductor 2 at p=11)" }
]
```

## Where the file goes

Each demo owns its collection, so drop the file (or send it and Steve will):

- `demos/torus-lifts/curves.json` — the paper-figure demo: every curve
  appears in its Curve menu at every feasible field extension, with
  path-traced finals + reproducibility sidecars from the Studio tab.
  (Presentation — colors, point radii, profile aesthetics — lives separately
  in `presentation.json` beside it; new curves render fine without an entry.)
- `data/curves.json` — the default catalog for the exploratory demos.

Same format in both places; this file's spec is the single contract.
