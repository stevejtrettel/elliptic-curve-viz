# data/ — curve descriptors

> The sendable spec for Nadir lives in [EXPORT.md](EXPORT.md).

`curves.json` is the catalog every demo's Curve dropdown lists, and the handoff
contract with `ecfplat` (Nadir's Python, which computes the j ↔ (a,b,c)
bijection). One JSON array; per curve:

```jsonc
{
  "label": "disc −8 · rectangular",     // optional — generated from the data if absent
  "p": 11,                               // the prime
  "trace": 6,                            // trace of Frobenius a_p
  "sign": 1,                             // ±1: which conjugate Frobenius embedding (mirror)
  "form": { "a": 1, "b": 0, "c": 2 },   // quadratic form from the bijection
  "equation": { "f": 1, "g": 2 }        // optional: y² = x³ + fx + g over F_p
}
```

Integers may be JSON numbers or decimal strings (use strings beyond 2⁵³).
Validated on load (`src/io/descriptors.ts`): disc(form) = b²−4ac < 0, the Hasse
bound trace² ≤ 4p, and trace²−4p = disc·f² for an integer conductor f. The
extension degree k is NOT part of the descriptor — it is chosen at render time.

No point data crosses this boundary: from these integers the TypeScript side
computes E(F_{p^k}) = ker(Frobᵏ−I) exactly. (Reminder for Nadir: ecfplat's
`pts_from_gendic` cyclic branch crashes at ecqf_tools.py:131 — `ZnProduct((lm.lm))`
should be `(lm, lm)` — but we don't consume point exports anyway.)
