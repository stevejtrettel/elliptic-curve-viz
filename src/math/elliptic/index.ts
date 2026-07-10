/**
 * math/elliptic — elliptic functions on the lattice Λ = ℤ + τℤ.
 *
 * The complex-analytic side (℘, ℘′ via Jacobi θ₁), as distinct from
 * math/lattice, which handles τ-reduction and the lattice-matching problem.
 * Plus the elementary real affine locus y²=x³+ax+b (real-curve, no ℘ needed).
 * PURE (DESIGN.md §4): depends only on math/core.
 */
export * from './weierstrass'
export * from './real-curve'
