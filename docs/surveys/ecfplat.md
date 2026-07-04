# Survey: `ecfplat` (Nadir Hajouji's computation repo)

*Exploration report generated 2026-07-04 as input to the elliptic-curve-art rewrite. Focus: the characteristic-zero lift and points over F_{p^n}.*

## 1. Overall structure, language, dependencies

**Language: pure Python (3.13-pinned). No Sage, no Magma, no Pari.** The entire number-theory stack is hand-rolled in plain Python with only numpy/pandas as numeric helpers. `requirements.txt` is just `numpy, pandas, streamlit, matplotlib, Pillow`. There are no algebra-system imports anywhere.

**Layout** (from README.md:57-108):
- `pycode/` — the core library. Notable modules: `alg_classes.py` (hand-built `GF_p`, `GF_pn`, `Mat_n_Z`, polynomials), `nt.py` (number-theory primitives), `qfs.py` (binary quadratic forms + class-group action), `velu.py` (field-generic Vélu isogeny engine), `ecfp.py` (curves over F_p), `ecqf_bij.py` (the lattice↔curve bijection drivers), `ecqf_tools.py` (Frobenius matrices, Mordell–Weil, the `ECQFIsogenyClass` object, table loaders), `modularpolynomials.py` (Atkin/Hilbert/classical modular polynomials).
- `pages/` + `app.py` — a Streamlit multi-page web app (`streamlit run app.py`), plus `notebooks/userguide.ipynb`.
- `pycode/data/` — precomputed JSON tables (bijections, modular polynomials, Hilbert class polys).

**Central object** (README.md:9-17): given `(a, p)` with `a² < 4p`, an explicit bijection between **lattice classes with CM by a root of `x² − ax + p`** (= classes of positive-definite binary quadratic forms of discriminant `d = a² − 4p`) and **elliptic curves in the F_p isogeny class** whose Frobenius has charpoly `x² − ax + p`.

Two layers: **computing** a bijection from scratch (`ecqf_full_bijection_ord` / `_ss` in `ecqf_bij.py`) vs. **using** a precomputed one (`ECQFIsogenyClass`, loading JSON from `pycode/data/`).

## 2. Pipeline for the characteristic-zero lift

**Output form: a binary quadratic form `(a,b,c)` → equivalently a `τ` in the upper half-plane.** The "characteristic-zero lift" is the Deuring lift: the CM elliptic curve `ℂ/Λ`, `Λ = ℤ + τℤ`, with CM by the order of discriminant `d = a² − 4p`. It is **not** represented as a j-invariant over a number field — it is represented as **lattice/modulus data**, which is what the visualization wants.

The single entry point is `ec_look_up((f,g), p)` at `pycode/ecqf_tools.py:433-469`:
1. `a = trace_frob((f,g), p)` — computed naively as `-Σ quad_rec(x³+fx+g, p)` (a Legendre-symbol sum over all `x`; `ecqf_tools.py:167-169`).
2. `j = fg_to_j((f,g), p)` and a twist sign `s = quad_rec(...)`.
3. `d = a² − 4p`, factored into fundamental disc + conductor via `discfac`.
4. **The lift lookup:** the quadratic form is read out of the precomputed bijection keyed by j-invariant (and by signature `(j,s)` in the supersingular case):
   - ordinary: `data['qf'] = ecqf_ord_1K_pc[(|a|,p)][j % p]` (`ecqf_tools.py:456-458`)
   - supersingular: `data['qf'] = ecqf_ss_1K_pc[p][(j,s)]` (`ecqf_tools.py:452-454`)
5. `τ` is then `abc_to_tau(qf)` at `ecqf_tools.py:52-54` — literally `np.roots([a,b,c])[0]`, the root of `aτ² + bτ + c = 0` in the upper half-plane, returned as `[Re, Im]`. A human-readable exact form `(−b+cond·√d)/(2a)` is built by `abc_to_tau_str` (`ecqf_tools.py:56-88`).

**What the *bijection itself* does** — the genuinely number-theoretic algorithm, in `ecqf_bij.py` (summarized from README.md:19-55):
- Form `d = a²−4p`.
- **Rigid l-set search:** find primes `ℓ` whose `ℓ`-isogeny directions independently generate the class group (`disc_rigid_lset_search`, `ord_rigid_lset`, `ss_rigid_lset`).
- **Neighbour data on both sides.** Lattice side = class-group action on quadratic forms (pure form arithmetic, `qfs.py`). Curve side = either read off **Atkin modular polynomials** (the 15 Atkin primes {2..71}) or computed with **Vélu's formulas** over an extension `F_{p^k}` (`velu.py`).
- **Match labellings:** walking the chosen `ℓ`-directions assigns each object an integer-tuple coordinate; matching coordinate-by-coordinate yields the bijection. A global orientation freedom (complex conjugation ↔ class-group inversion) is pinned by convention.

So: **input** = `(f,g,p)` (or `(a,p)`); **output of the lift** = quadratic form `(a,b,c)` = τ = period-lattice/CM data. `d = a²−4p` is the CM order discriminant; the class number = number of curves in the isogeny class.

Deuring lifting is described narratively in `pages/3_Background.py:1171-1245` ("Lifting Frobenius (Deuring)"): *"we want a pair (Λ, α), where Λ is a lattice and α is an endomorphism of Λ … the model descends to E/F_p … and the endomorphism α descends to Frobenius φ … The results of Deuring show that a lift of Frobenius can always be found."*

## 3. Points over F_{p^n} via Frobenius fixed points — and the coordinate system

This is exactly the Frobenius-fixed-point method, and **the output points are in lattice-relative coordinates** — pairs `(x, y)` in `(ℤ/N)²` representing `(x/N)·1 + (y/N)·τ` mod `Λ`.

The model: `E(F_{p^n})` = fixed points of `Frobⁿ` = kernel of `(αⁿ − 1)` acting on `ℂ/Λ`, where `α` = multiplication by the root of `x² − ax + p`. Comment at `ecqf_tools.py:271`: *"We want to compute fixed points of a power of frobenius. Just need ability to compute kernel of a general matrix."*

Step-by-step, all in `pycode/ecqf_tools.py`:

1. **Frobenius as an integer 2×2 matrix on the lattice basis `{1, τ}`** — `qf_ap_FrMat(qf, (a,p), s)` at `ecqf_tools.py:363-385`. Comment (349-361): *"This computes the matrix that represents multiplication by the root of x²−ax+p whose imaginary part has sign equal to s on the lattice relative to the ordered basis 1, tau."* It builds `α = one_scalar·I + tau_scalar·(a·τ)-matrix`, where the generator matrix `qf_to_ERGM_1T(qf) = ((0,−c),(a,−b))` (`ecqf_tools.py:355-357`). Asserts `|trace| == |a|`. (Bulk version: `ap_FrbMats_1T`, `ecqf_tools.py:397-415`.)

2. **Fixed-point matrix** `M^k − I` — `frk_fxp_mat(frmat, k)` = `(frmat**k − frmat**0).vec` (`ecqf_tools.py:388-389`).

3. **Kernel = the `F_{p^k}` points** — `frob_to_mw_gens(frmat, k) = qf_mat_ker_gens(frk_fxp_mat(frmat, k))` (`ecqf_tools.py:393-394`). `qf_mat_ker_gens` (`ecqf_tools.py:339-347`, helpers `m2_tup_gcdfact` 279-284, `qf_mat_ker_cyc` 288-313, `divide_cyclic_gen` 322-335) returns a dict `{ (x,y): order }` of 0/1/2 generators of `ker(M^k − I)` as a finite abelian subgroup of `(ℤ/N)²`. Hall multipliers / gcd factoring give the group structure — elementary integer linear algebra, trivially portable.

4. **Enumerate the point group in lattice-relative integer coordinates** — `pts_from_gendic(gendic)` at `ecqf_tools.py:123-140` returns the full list of `(x, y)` integer tuples — precisely the "elements of (1/N)ℤ + (τ/N)ℤ / Λ" representation the visualization consumes.

5. **Convert to plane coordinates for plotting** — `mw_arr_from_gens(abc, gens)` at `ecqf_tools.py:417-426`: `den = max(order)`, builds all `(x,y) mod den`, returns `np.array([x·[1,0] + y·τ ...]) / den`. Note: the **integer lattice coordinates live in the pre-scaling tuples / `pts_from_gendic`**; `mw_arr_from_gens` throws away the integer form and emits floats.

On `ECQFIsogenyClass` (`ecqf_tools.py:604-620, 643-679`): `qf_to_mw_gens_dict(k)`, `qf_to_mwgroups_alltups(k)` (integer tuples), `qf_to_mwgr_arr_single(k, qf)` (float array), `ecqf_mw_df(k)` (DataFrame with `MW_gens`, `MW_iso_type`).

Plotting consumer: `graphic_tools.py:97-116` `ecqf_mw_lattice_plot(ecdata, k)` — *"Draw F_{p^k}-rational points inside the fundamental parallelogram."*

There is a **second, parallel** F_{p^n} path on the char-p (Vélu) side in `velu.py`: `frobenius(P, p)` = `(x^p, y^p)` (`velu.py:191-196`), `curve_cardinality(a, p, k)` via the recurrence `a_i = a·a_{i-1} − p·a_{i-2}` (`velu.py:199-204`), eigenline kernel finding (`velu.py:207-224`). But that engine is for building the *bijection*; the lattice-relative points come entirely from the integer-matrix path above.

## 4. Export formats

- **Web download (the actual hand-off to artwork):** `pages/2_EC_Search.py:13-20, 145-154`. `pts_to_export_str(pts_arr)` writes points as `.txt`, three per line, each formatted `[re,im]` truncated to 10 chars. **These are the Cartesian float coordinates in the parallelogram, not the integer `(a,b) mod N` lattice tuples.** Filename encodes provenance: `points_f{f}_g{g}_p{p}_qf{a}_{b}_{c}_k{k}.txt`.
- **Bijection data files (`pycode/data/`, JSON):**
  - `ecqf_ord_pcbij_4_1024.json` — `{"(a,p)": {j: [a,b,c]}}`, 6725 ordinary pairs (loaded `ecqf_tools.py:23-27`).
  - `ecqf_ss_pcbij_velu_4_1024.json` — `{p: {"(j,s)": [a,b,c]}}`; `ssfp_pc_bij_velu.json` = same in list form.
  - Per-discriminant: `qf_ldata.json`, `rigid_lset_cache.json`.
  - Modular-polynomial tables: `atkinpolys.json`, `hilbpolys.json`, `jcoefs.json`, `jq_coeffs.json`, `classical_modpolys.json`.
- No CSV. The DataFrame outputs (columns `qf_coefs`, `frobmat`, `tau_s`, `tau_xy`, `MW_gens`, `MW_iso_type`) are for in-app display.

## 5. TypeScript feasibility

**Trivially reimplementable in TypeScript (no Sage/Pari needed):**
- **All of capability (2) given `(a,b,c)` and `(a,p)`.** Pure integer 2×2 matrix arithmetic: build `α`, form `M^k − I`, compute the kernel as a subgroup of `(ℤ/N)²` (gcd/Bézout/Hall-multiplier, Smith-normal-form-style), enumerate `(x,y)` tuples, map to `(x/N)·1 + (y/N)·τ`. The only "number theory" is `gcd`, Bézout (`axby`), `hall_multiplier` — all elementary. **This is the part the visualization actually needs, and it is a clean port.**
- `abc_to_tau` (a quadratic root) and the parallelogram geometry.
- `trace_frob`, `fg_to_j`, Legendre symbol (`quad_rec`) — naive `O(p)` loops, fine for small `p`.

**Needs the heavy Python engine:**
- **Computing the bijection j ↔ `(a,b,c)` from scratch** (`ecqf_bij.py`): rigid l-set search over the class group, curve-side neighbour data.
- **Vélu isogeny engine** (`velu.py`): `ℓ`-torsion eigenline kernels over `F_{p^k}`, extension-field arithmetic (`GF_pn`), 2-isogeny volcanoes. Failure mode: too-large kernel extension degree `k` (`velu.py:227-254`, `frob_ext_degrees` in `nt.py:397-433`).
- **Modular polynomials** (`modularpolynomials.py`): Atkin `Φ_ℓ⁺`, Hilbert class polynomials, classical `Φ_ℓ(X,Y)` from the j-function q-expansion.
- Class-group / quadratic-form arithmetic (`qfs.py`) — portable in principle but non-trivial.

**Bottom line:** keep the bijection computation in Python (run offline, exported as `pycode/data/*.json`), and reimplement **only capability (2)** in TypeScript — given `(a,b,c)` + `(a,p)`, build the Frobenius matrix and enumerate `E(F_{p^n})` as lattice-relative `(x,y) mod N` fixed points of `M^n − I`. That path touches no isogenies, no modular polynomials, no extension fields. For *integer* lattice coordinates rather than truncated floats, pull from `pts_from_gendic` (`ecqf_tools.py:123-140`) rather than `mw_arr_from_gens`.
