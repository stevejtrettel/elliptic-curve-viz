/**
 * cayley-graph — the Cayley graph of E(F_{p^k}) drawn on its torus.
 *
 * pointsOver finds E(F_{p^k}) ≅ ℤ/n₁ × ℤ/n₂ (n₁ | n₂). The Cayley graph for
 * a generating pair {g₁, g₂} has an edge P → P + gᵢ at every point P. On the
 * torus this is not 2·|E| little sticks: adding gᵢ is translation of ℂ/Λ by
 * the constant δᵢ, so the gᵢ-edges decompose into the |E|/order(gᵢ) cosets
 * of ⟨gᵢ⟩ — and each coset is a CLOSED GEODESIC of the flat torus through
 * its points (a torus knot after roll-up). g₁ draws green, g₂ purple, on the
 * torus and as chords on the flat domain.
 *
 * Which pair? By default the REDUCED generators — the shortest basis of the
 * preimage lattice {v ∈ ℤ² : v mod N ∈ E} — so edges connect nearest
 * neighbors and even a cyclic group draws a tidy grid. The Smith-normal-form
 * structure generators (geometrically arbitrary; a cyclic group's single
 * geodesic winds |E| steps across the torus) are available via the
 * "Cayley basis" control. See src/author/torus-scene.ts (reducedGenerators).
 */
import { showCurve } from '@/author'

// disc −3 at k = 3 is the prettiest case in the catalog: E(F_7³) ≅ ℤ/18 × ℤ/18
// is the FULL 18-torsion of the curve — two transverse families of geodesics.
const demo = showCurve({
  title: 'cayley graph',
  curve: 'disc −3 · hexagonal',
  k: 3,
  cayley: true, //          both generators; ?cayley=g1|g2|both from the URL
  colorBy: 'coset2', //     one color per purple geodesic (coset of ⟨g₂⟩)
  subfieldBoost: false,
  domain: true, //          flat picture beside the torus: chords = the same geodesics
  onChange: () => refresh(), // keep the About tab honest across curve/k changes
})

// what you are looking at — LIVE, recomputed on every curve/k/basis change
const about = demo.panel?.tab('About')
const group = about?.label('Group')
const basis = about?.label('Generators')
const gen1 = about?.label('g₁ (green)')
const gen2 = about?.label('g₂ (purple)')
about?.label('Why geodesics', 'adding gᵢ translates ℂ/Λ by a constant — each ⟨gᵢ⟩-coset is a straight line')

function refresh(): void {
  const scene = demo.scene
  const E = scene.scene.E
  const [n1, n2] = E.structure
  const curve = scene.curve.data
  group?.set(`E(F_${curve.p}^${scene.k}) ≅ ${n1 > 1 ? `ℤ/${n1} × ` : ''}ℤ/${n2} — |E| = ${E.size}`)
  basis?.set(
    scene.cayleyBasis === 'reduced'
      ? 'reduced: the shortest minimal generating set'
      : 'structure: Smith normal form of Mᵏ − I',
  )
  const describe = (i: number) => {
    const g = scene.cayleyGenerators[i]
    if (!g) return '—'
    const m = E.order(g)
    return `order ${m}: ${E.size / m} closed geodesics of ${m} edges`
  }
  gen1?.set(describe(0))
  gen2?.set(describe(1))
}
refresh()

export {}
