/**
 * math/arithmetic — exact points of E(F_{p^k}) (DESIGN.md §5.1).
 * Frobenius as an integer 2×2 matrix on the lattice basis {1, τ};
 * E(F_{p^k}) = ker(M^k − I) via Smith normal form → CurvePoints.
 */
export * from './mat2z'
export * from './curve'
export * from './points'
