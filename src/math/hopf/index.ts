/**
 * math/hopf — the Hopf fibration and the roll-up map (DESIGN.md §3, §5.3).
 * Conventions from Hajouji–Trettel, arXiv:2505.09627:
 *   η(z, w) = z/w;  H_{(θ,φ)}(s) = (e^{i(θ+s)} sin(φ/2), e^{is} cos(φ/2));
 *   Λ = 2πZ ⊕ (A/2 + iL/2)Z;  σ(x, y, z, w) = (x, y, z)/(1 − w).
 * Step-3 holonomy integrand is sin²(φ/2)·θ′ (paper typo: square confirmed by ST).
 */
export * from './profile'
export * from './interpolant'
export * from './torus'
export * from './projection'
