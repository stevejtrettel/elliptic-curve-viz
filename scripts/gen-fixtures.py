#!/usr/bin/env python3
"""Golden-fixture generator for the TypeScript exact layer (DESIGN.md §10).

Runs Nadir's ecfplat (expected at ~/Code/ecfplat, Python 3.13) and dumps, for a
battery of curves, the Frobenius matrix, group generators/structure, and the full
point list of E(F_{p^k}) as lattice-relative integer coordinates in (Z/N)^2.
The TS code (src/math/arithmetic) must reproduce these exactly — group-equal for
point sets, entry-equal for the Frobenius matrix.

Battery (decided with Steve, 2026-07-04): the six legacy discriminants matching
lifting-modp/data (-3, -4, -7, -8, -11, -20, every form in the class), plus
supersingular cases p = 2, 3, 5 with both Frobenius signs to pin the sign
convention (DESIGN.md §13).

Run:  uv run --python 3.13 --with numpy==2.4.6 --with pandas==3.0.3 scripts/gen-fixtures.py
Output: test/fixtures/ecfplat/*.json (committed).
"""

import json
import sys
from pathlib import Path

ECFPLAT = Path.home() / "Code" / "ecfplat" / "pycode"
if not ECFPLAT.is_dir():
    sys.exit(f"ecfplat checkout not found at {ECFPLAT}")
sys.path.insert(0, str(ECFPLAT))

from ecqf_tools import (  # noqa: E402
    ecqf_ord_1K_pc,
    ecqf_ss_1K_pc,
    frob_to_mw_gens,
    qf_ap_FrMat,
)

OUT_DIR = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "ecfplat"
K_MAX = 6
POINTS_CAP = 100_000  # above this, store structure + generators only

# Ordinary battery: disc -> (a, p), p prime, p ∤ a. The bijection table covers
# p ≥ 5, and conductor-1 solutions of a^2 - 4p = disc need p = 2 or 3 for
# discs -7 and -8 — so those two run at conductor 2 (a^2 - 4p = 4·disc), which
# conveniently exercises the conductor-scaling branch of frobeniusMatrix: the
# (a,p) = (4,11) class contains forms of BOTH discs -7 and -28.
ORDINARY = {
    -3: (5, 7),
    -4: (4, 5),
    -7: (4, 11),  # disc(a,p) = -28 = -7·2²
    -8: (6, 11),  # disc(a,p) = -8
    -11: (3, 5),
    -20: (12, 41),
}
# Ordinary cases run sign +1; disc -8 additionally runs sign -1 (convention pin).
ORDINARY_BOTH_SIGNS = {-8}

SUPERSINGULAR_PRIMES = [5, 7]  # a = 0, both signs; ss table starts at p = 5


def curve_sizes(a: int, p: int, k_max: int) -> list[int]:
    """|E(F_{p^k})| = p^k + 1 - a_k, a_0 = 2, a_1 = a, a_k = a*a_{k-1} - p*a_{k-2}."""
    ak = [2, a]
    for k in range(2, k_max + 1):
        ak.append(a * ak[k - 1] - p * ak[k - 2])
    return [p**k + 1 - ak[k] for k in range(k_max + 1)]


def enumerate_points(gendic: dict) -> list[tuple[int, int]]:
    """All points x·g1 + y·g2 of the group, as tuples in (Z/N)^2, N = max order.

    Reimplements ecfplat's pts_from_gendic, whose cyclic branch crashes on
    `ZnProduct((lm.lm))` (ecqf_tools.py:131, `lm` is an int — report upstream).
    """
    if len(gendic) == 0:
        return [(0, 0)]
    gens = list(gendic.items())
    N = max(order for _, order in gens)
    pts = {(0, 0)}
    if len(gens) == 1:
        (gx, gy), n = gens[0]
        pts.update(((m * gx) % N, (m * gy) % N) for m in range(n))
    else:
        ((g1x, g1y), n1), ((g2x, g2y), n2) = gens
        pts.update(
            ((i * g1x + j * g2x) % N, (i * g1y + j * g2y) % N)
            for i in range(n1)
            for j in range(n2)
        )
    return sorted(pts)


def one_case(qf, a, p, sign):
    frmat = qf_ap_FrMat(qf, (a, p), sign)
    sizes = curve_sizes(a, p, K_MAX)
    levels = []
    for k in range(1, K_MAX + 1):
        gendic = frob_to_mw_gens(frmat, k)
        gens = [{"point": list(v), "order": int(n)} for v, n in gendic.items()]
        orders = sorted(int(n) for n in gendic.values())
        structure = ([1, 1] + orders)[-2:]  # pad with trivial factors
        level = {
            "k": k,
            "size": sizes[k],
            "structure": structure,
            "generators": gens,
        }
        if sizes[k] <= POINTS_CAP:
            pts = enumerate_points(gendic)
            assert len(pts) == sizes[k], (
                f"point count mismatch qf={qf} ap=({a},{p}) s={sign} k={k}: "
                f"{len(pts)} != {sizes[k]}"
            )
            level["points"] = [[int(x), int(y)] for x, y in pts]
        levels.append(level)
    return {
        "qf": list(qf),
        "ap": [a, p],
        "sign": sign,
        "discQf": qf[1] * qf[1] - 4 * qf[0] * qf[2],
        "discAp": a * a - 4 * p,
        "frobenius": [list(row) for row in frmat.vec],
        "levels": levels,
    }


def write_case(tag, case):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{tag}.json"
    with open(path, "w") as f:
        json.dump(case, f, separators=(",", ":"))
        f.write("\n")
    n_pts = sum(len(lv.get("points", [])) for lv in case["levels"])
    print(f"  {path.name}: frob={case['frobenius']} points stored={n_pts}")


def main():
    for disc, (a, p) in sorted(ORDINARY.items(), reverse=True):
        forms = sorted(set(ecqf_ord_1K_pc[(a, p)].values()))
        print(f"ordinary d={disc} (a,p)=({a},{p}) forms={forms}")
        for qf in forms:
            signs = (1, -1) if disc in ORDINARY_BOTH_SIGNS else (1,)
            for s in signs:
                tag = f"ord_d{disc}_a{a}_p{p}_qf{qf[0]}_{qf[1]}_{qf[2]}_s{s}"
                write_case(tag, one_case(qf, a, p, s))

    for p in SUPERSINGULAR_PRIMES:
        forms = sorted(set(ecqf_ss_1K_pc[p].values()))
        print(f"supersingular p={p} forms={forms}")
        for qf in forms:
            for s in (1, -1):
                tag = f"ss_p{p}_qf{qf[0]}_{qf[1]}_{qf[2]}_s{s}"
                write_case(tag, one_case(qf, 0, p, s))


if __name__ == "__main__":
    main()
