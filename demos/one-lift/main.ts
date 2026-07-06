/**
 * one-lift — a SINGLE elliptic curve, everything fixed in code. The smallest
 * complete example of the pipeline; read top to bottom.
 */
import { CurveScene } from '@/author'
import { parseCurveDescriptors } from '@/io'
import { App, ControlPanel, addStudioControls, bridgesPaper } from '@/studio'

// ── 1. the curve, as a record in THE EXPORT FORMAT (data/EXPORT.md) ────────
// Exactly what Nadir's software emits: the five integers from the j ↔ (a,b,c)
// bijection. We never take the Weierstrass equation y² = x³ + fx + g
// directly; everything downstream is computed exactly from these. This is
// the paper's disc −8 example: CM by Z[√−2], τ = i√2.
const record = {
  label: 'disc −8 · rectangular (paper example)',
  p: 11,
  trace: 6, //                    a_p, trace of Frobenius
  sign: 1,
  form: { a: 1, b: 0, c: 2 }, //  quadratic form ⇒ the CM lattice class
}
const lift = parseCurveDescriptors([record])[0]! // validates: Hasse, disc·f²

// ── 2. the field: fix k, and with it the number of points ──────────────────
// |E(F_{p^k})| = pᵏ + 1 − a_k with a_k = a·a_{k−1} − p·a_{k−2}. For k = 3:
// a₃ = 18, so |E(F_11³)| = 1331 + 1 − 18 = 1314 points. Fixed.
const k = 3

// ── 3. scene: exact points → Hopf torus in S³ → stereographic R³ ───────────
const app = new App()
const scene = new CurveScene({
  curve: lift.data,
  k,
  colorMode: 'uniform', // the paper colors by discriminant, not structure
  color: 0xcc8d04, //     disc −8's yellow
  pointRadius: 0.05, //   paper level-3 radius (0.025), doubled per our conformal rule
  subfieldBoost: false,
  onChange: () => app.invalidate(),
})
app.stage.add(scene.group)
scene.group.rotation.x = -Math.PI / 2 // lay the torus parallel to the floor

// ── 4. the paper's world and camera ─────────────────────────────────────────
const handle = app.setStudio(bridgesPaper) // bridges-paper carries the paper's 30 bounces
const panel = new ControlPanel({ title: 'one lift' })

// what you are looking at — visible in the demo, not just in this file
const about = panel.tab('About')
about.label('Curve', `disc −8 · form (${record.form.a},${record.form.b},${record.form.c}) · trace ${record.trace} · p = ${record.p}`)
about.label('Field', `F_${record.p}^${k}`)
about.label('Points', `|E| = ${scene.scene.E.size} = p^${k} + 1 − a_${k}`)
about.label('τ', 'i√2 (rectangular lattice)')
about.label('S² profile', 'latitude circle, solved from τ (exact)')
about.label('Coloring', 'uniform — the paper colors by discriminant')

addStudioControls(panel, app, handle, {
  renderName: 'one-lift',
  sidecar: () => ({ curve: record, k, points: scene.scene.E.size }),
})
panel.mount(document.body)

// the paper's top-down rig (camera at (0.1, 10, −0.1): straight down) — SPECIFIED here
app.frame({ azimuth: 2.36, elevation: 1.556, fill: 0.72, fov: 50 })
app.start()

export {}
