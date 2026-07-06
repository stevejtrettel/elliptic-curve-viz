/**
 * cayley-graph — the Cayley graph of E(F_{p^k}) for its computed generators.
 *
 * pointsOver finds E(F_{p^k}) ≅ ℤ/n₁ × ℤ/n₂ (n₁ | n₂) WITH generators g₁, g₂
 * (the Smith normal form of Mᵏ − I). The Cayley graph for {g₁, g₂} has an
 * edge P → P + gᵢ at every point P. On the torus this is not 2·|E| little
 * sticks: adding gᵢ is translation of ℂ/Λ by the constant δᵢ = λ·gᵢ, so the
 * gᵢ-edges decompose into the |E|/order(gᵢ) cosets of ⟨gᵢ⟩ — and each coset
 * is a CLOSED GEODESIC of the flat torus through its points (a torus knot
 * after roll-up). g₁ draws green, g₂ purple; see src/author/grid-curves.ts.
 */
import { showCurve } from '@/author'

// disc −3 at k = 3 is the prettiest case in the catalog: E(F_7³) ≅ ℤ/18 × ℤ/18
// is the FULL 18-torsion of the curve, so both generators have order 18 and
// each draws 18 geodesics — two transverse families of torus knots.
const demo = showCurve({
  title: 'cayley graph',
  curve: 'disc −3 · hexagonal',
  k: 3,
  cayley: true, //          both generators; ?cayley=g1|g2|both from the URL
  colorBy: 'coset2', //     one color per purple geodesic (coset of ⟨g₂⟩)
  subfieldBoost: false,
  domain: true, //          flat picture beside the torus: chords = the same geodesics
})

// what you are looking at — visible in the demo, not just in this file
// (describes the boot state; the panel's Curve/k controls change the group)
const E = demo.scene.scene.E
const [n1, n2] = E.structure
const about = demo.panel?.tab('About')
about?.label('Group', `E(F_7³) ≅ ℤ/${n1} × ℤ/${n2} — |E| = ${E.size}`)
about?.label('Generators', `g₁, g₂ from the Smith normal form of M³ − I`)
about?.label('g₁ (green)', `order ${n1}: ${E.size / n1} closed geodesics of ${n1} edges`)
about?.label('g₂ (purple)', `order ${n2}: ${E.size / n2} closed geodesics of ${n2} edges`)
about?.label('Why geodesics', 'adding gᵢ translates ℂ/Λ by a constant — each ⟨gᵢ⟩-coset is a straight line')

export {}
