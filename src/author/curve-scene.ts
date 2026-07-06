/**
 * CurveScene — the composable authoring core: one object owning the state of
 * "an elliptic curve drawn on its Hopf torus" and the renderables that show it.
 * No App, no DOM, no camera: constructible headless (tests) or staged by
 * showCurve (demos).
 *
 * Recomputation is a LINEAR LADDER — a setter reruns its stage and every
 * stage after it (DESIGN.md §7.5):
 *
 *   resolve  (curve, lobes)             solveProfileCurve, reset embedding
 *   build    (k, embedding)             buildTorusScene → surface/points/plaque
 *   tubes    (fibers, gridlines, cayley) fiber/edge/orbit/Cayley TubeSet curves
 *   style    (colorMode, boost, select) colors + sizes → points & plaque
 *   project  (α, β, γ, pole)            S3Projection → group
 *
 * Cheap knobs (radii, visibility, materials) are not state: use the exposed
 * renderables directly. Selection is the one shortcut: select() swaps only
 * the orbit tube, then reruns style → project (fiber/edge tubes untouched).
 */
import type { CurveData, TorusPoint } from '@/math/arithmetic'
import { tauOf } from '@/math/arithmetic'
import { Quaternion, Vec4 } from '@/math/core'
import type { Candidate } from '@/math/families'
import { solveProfileCurve } from '@/math/families'
import { type ProfileCurve, S3Projection, sphereToR3 } from '@/math/hopf'

import {
  BaseSphere,
  DomainPlaque,
  HopfTorusMesh,
  PointCloud,
  S3Group,
  TubeSet,
  colorByCoset,
  colorByDegree,
  colorByOrbit,
  colorByOrder,
  colored,
  highlightOrbit,
  sizeByDegree,
  uniformColors,
} from '@/geometry'

import { type LabeledCurve, CURVES, resolveCurve } from './catalog'
import { profileCandidate } from './figures'
import { cayleyCurves, cayleyFlatSegments, edgeCurves, fiberCurves, orbitCurve } from './grid-curves'
import { type TorusScene, buildTorusScene, maxFeasibleK, reducedGenerators } from './torus-scene'

/** 'coset1'/'coset2' color by coset of ⟨g₁⟩/⟨g₂⟩ — the Cayley geodesics. */
export type ColorMode = 'degree' | 'order' | 'orbit' | 'coset1' | 'coset2' | 'uniform'
export interface ViewAngles {
  alpha: number
  beta: number
  gamma: number
  pole: number
}

type Stage = 'resolve' | 'build' | 'tubes' | 'style' | 'project'
const STAGES: Stage[] = ['resolve', 'build', 'tubes', 'style', 'project']

/** Gray level for de-emphasized points during orbit highlight. */
const DIM = 0.82

/** Cayley-edge colors, one per generator: g₁ green, g₂ purple. */
const CAYLEY_COLORS = [0x43a33b, 0x7d46bd] as const

/** Which generators to draw Cayley edges for: true = all, false = none. */
export type CayleySelection = boolean | number[]

function cayleyIndices(sel: CayleySelection): number[] {
  return sel === true ? [0, 1] : sel === false ? [] : sel
}

/**
 * Which generating pair the Cayley graph (and coset colors) uses:
 * 'reduced' — shortest basis of the preimage lattice, nearest-neighbor edges
 *             (the default; see reducedGenerators);
 * 'structure' — the SNF generators of ℤ/n₁ × ℤ/n₂ (canonical, but a cyclic
 *               group's single geodesic then winds |E| steps over the torus).
 */
export type CayleyBasis = 'reduced' | 'structure'

export interface CurveSceneOptions {
  curve?: number | string | CurveData
  /** Catalog the curve reference resolves against (and the panel lists). */
  curves?: LabeledCurve[]
  k?: number
  lobes?: number | null
  embedding?: number
  fibers?: number
  gridlines?: number
  /** Cayley-graph edges: true = both generators, or explicit indices ([0], [1]). */
  cayley?: CayleySelection
  /** Generating pair for Cayley edges and coset colors (default 'reduced'). */
  cayleyBasis?: CayleyBasis
  maxPoints?: number
  pointRadius?: number
  tubeRadius?: number
  colorMode?: ColorMode
  /** The single color used when colorMode is 'uniform'. */
  color?: number
  subfieldBoost?: boolean
  /** Explicit profile curve (paper reproduction) — replaces the solver's candidates. */
  profile?: ProfileCurve
  /** Initial S³ rotation (α, β, γ) and projection-pole tilt. */
  view?: Partial<ViewAngles>
  /** Fired once after every completed recompute (showCurve → app.invalidate). */
  onChange?: () => void
}

/** Batched state change for update(): only the fields present are applied. */
export interface CurveSceneUpdate {
  curve?: number | string | CurveData
  lobes?: number | null
  /** Explicit profile curve; null = back to the solver's candidates. */
  profile?: ProfileCurve | null
  embedding?: number
  k?: number
  fibers?: number
  gridlines?: number
  cayley?: CayleySelection
  cayleyBasis?: CayleyBasis
  colorMode?: ColorMode
  color?: number
  subfieldBoost?: boolean
  view?: Partial<ViewAngles>
}

export class CurveScene {
  /** S³ content (torus, points, tubes) — add to app.stage. */
  readonly group = new S3Group()
  readonly torus: HopfTorusMesh
  readonly points: PointCloud
  readonly fiberTubes: TubeSet
  readonly edgeTubes: TubeSet
  readonly orbitTube: TubeSet
  /** Cayley-graph edges, one TubeSet per generator (g₁ green, g₂ purple). */
  readonly cayleyTubes: [TubeSet, TubeSet]
  /** The flat ℂ/Λ picture — NOT in `group` (not an S³ object); stage it yourself. */
  readonly plaque: DomainPlaque
  /** The Hopf base S² with the profile curve — NOT in `group`; stage it yourself. */
  readonly sphere: BaseSphere

  readonly catalog: LabeledCurve[]
  private readonly maxPoints: number
  private onChange: (() => void) | undefined

  private _curve: LabeledCurve
  private _lobes: number | null
  private _candidates: Candidate[] = []
  private _embedding: number
  private _k: number
  private _fibers: number
  private _gridlines: number
  private _cayley: number[]
  private _cayleyBasis: CayleyBasis = 'reduced'
  /** The generating pair Cayley edges & coset colors use (set at build). */
  private _displayGens: TorusPoint[] = []
  private _colorMode: ColorMode = 'degree'
  private _color = 0xd43b3b
  private _profile: ProfileCurve | null = null
  private _subfieldBoost = true
  private _selected: number | null = null
  private readonly _view: ViewAngles = { alpha: 0, beta: 0, gamma: 0, pole: 0 }
  private _scene!: TorusScene

  constructor(opts: CurveSceneOptions = {}) {
    this.catalog = opts.curves ?? CURVES
    this.maxPoints = opts.maxPoints ?? 20000
    this._curve = resolveCurve(opts.curve ?? 0, this.catalog)
    this._lobes = opts.lobes ?? null
    this._k = opts.k ?? 2
    this._fibers = opts.fibers ?? 0
    this._gridlines = opts.gridlines ?? 0
    this._cayley = cayleyIndices(opts.cayley ?? false)
    this._cayleyBasis = opts.cayleyBasis ?? 'reduced'
    this._colorMode = opts.colorMode ?? 'degree'
    this._color = opts.color ?? 0xd43b3b
    this._profile = opts.profile ?? null
    this._subfieldBoost = opts.subfieldBoost ?? true
    Object.assign(this._view, opts.view)
    this._embedding = 0

    this.stageResolve()
    this._embedding = Math.max(0, Math.min(opts.embedding ?? 0, this._candidates.length - 1))
    this.computeScene()

    const tubeRadius = opts.tubeRadius ?? 0.012
    this.torus = new HopfTorusMesh(this._scene.hopf)
    this.points = new PointCloud(this._scene.positions, { baseRadius: opts.pointRadius ?? 0.035 })
    this.fiberTubes = new TubeSet([], { radius: tubeRadius, material: colored(0x4287f5) })
    this.edgeTubes = new TubeSet([], { radius: tubeRadius, material: colored(0xd43b3b) })
    this.orbitTube = new TubeSet([], { radius: tubeRadius * 0.8, material: colored(0xe8ac2a) })
    this.cayleyTubes = [
      new TubeSet([], { radius: tubeRadius * 0.8, material: colored(CAYLEY_COLORS[0]) }),
      new TubeSet([], { radius: tubeRadius * 0.8, material: colored(CAYLEY_COLORS[1]) }),
    ]
    this.plaque = new DomainPlaque(this._scene.hopf.lattice, this._scene.flat, { pointRadius: 0.014 })
    this.sphere = new BaseSphere()
    this.sphere.setCurve(this.profileSamples())
    this.group.add(this.torus, this.points, this.fiberTubes, this.edgeTubes, this.orbitTube, ...this.cayleyTubes)

    this.stageTubes()
    this.stageStyle()
    this.stageProject()
    this.onChange = opts.onChange
  }

  // ── read state ────────────────────────────────────────────────────────────
  get curve(): LabeledCurve {
    return this._curve
  }
  get candidates(): Candidate[] {
    return this._candidates
  }
  /** Last build output (E, hopf, positions, flat, lambda, flip). */
  get scene(): TorusScene {
    return this._scene
  }
  get k(): number {
    return this._k
  }
  get lobes(): number | null {
    return this._lobes
  }
  get embedding(): number {
    return this._embedding
  }
  get fibers(): number {
    return this._fibers
  }
  get gridlines(): number {
    return this._gridlines
  }
  /** Generator indices whose Cayley edges are drawn ([] = off). */
  get cayley(): number[] {
    return [...this._cayley]
  }
  get cayleyBasis(): CayleyBasis {
    return this._cayleyBasis
  }
  /** The generating pair Cayley edges and coset colors use (per cayleyBasis). */
  get cayleyGenerators(): TorusPoint[] {
    return [...this._displayGens]
  }
  get colorMode(): ColorMode {
    return this._colorMode
  }
  get subfieldBoost(): boolean {
    return this._subfieldBoost
  }
  get selected(): number | null {
    return this._selected
  }
  get view(): ViewAngles {
    return { ...this._view }
  }
  get maxK(): number {
    return maxFeasibleK(this._curve.data, this.maxPoints)
  }

  // ── setters: each is sugar for a one-field update() ──────────────────────
  setCurve(ref: number | string | CurveData): void {
    this.update({ curve: ref })
  }

  setLobes(n: number | null): void {
    this.update({ lobes: n })
  }

  setEmbedding(i: number): void {
    this.update({ embedding: i })
  }

  /** Returns the (possibly clamped) k actually applied. */
  setK(k: number): number {
    this.update({ k })
    return this._k
  }

  setFibers(n: number): void {
    this.update({ fibers: n })
  }

  setGridlines(n: number): void {
    this.update({ gridlines: n })
  }

  /** Cayley-graph edges: true = both generators, or explicit indices ([0], [1]). */
  setCayley(sel: CayleySelection): void {
    this.update({ cayley: sel })
  }

  /** Switch the Cayley generating pair: 'reduced' (shortest) or 'structure' (SNF). */
  setCayleyBasis(basis: CayleyBasis): void {
    this.update({ cayleyBasis: basis })
  }

  setColorMode(m: ColorMode): void {
    this.update({ colorMode: m })
  }

  /** The single color for colorMode 'uniform'. */
  setColor(hex: number): void {
    this.update({ color: hex })
  }

  /** Pin an explicit profile curve (null = back to the solver's candidates). */
  setProfile(p: ProfileCurve | null): void {
    this.update({ profile: p })
  }

  setSubfieldBoost(on: boolean): void {
    this.update({ subfieldBoost: on })
  }

  /**
   * Batched change: assign every given field, then run the ladder ONCE from
   * the earliest affected stage. `scene.update({curve, k, profile})` costs one
   * recompute where the equivalent setter sequence costs three.
   */
  update(u: CurveSceneUpdate): void {
    let from: Stage | null = null
    const touch = (s: Stage) => {
      if (from === null || STAGES.indexOf(s) < STAGES.indexOf(from)) from = s
    }
    if (u.curve !== undefined) {
      this._curve = resolveCurve(u.curve, this.catalog)
      touch('resolve')
    }
    if (u.lobes !== undefined) {
      this._lobes = u.lobes
      touch('resolve')
    }
    if (u.profile !== undefined) {
      this._profile = u.profile
      touch('resolve')
    }
    if (u.k !== undefined) {
      this._k = u.k
      touch('build')
    }
    if (u.embedding !== undefined) touch('build') // applied post-resolve, see recompute
    if (u.fibers !== undefined) {
      this._fibers = u.fibers
      touch('tubes')
    }
    if (u.gridlines !== undefined) {
      this._gridlines = u.gridlines
      touch('tubes')
    }
    if (u.cayley !== undefined) {
      this._cayley = cayleyIndices(u.cayley)
      touch('tubes')
    }
    if (u.cayleyBasis !== undefined) {
      this._cayleyBasis = u.cayleyBasis
      touch('tubes') // display generators are recomputed at the tubes stage
    }
    if (u.colorMode !== undefined) {
      this._colorMode = u.colorMode
      touch('style')
    }
    if (u.color !== undefined) {
      this._color = u.color
      touch('style')
    }
    if (u.subfieldBoost !== undefined) {
      this._subfieldBoost = u.subfieldBoost
      touch('style')
    }
    if (u.view !== undefined) {
      Object.assign(this._view, u.view)
      touch('project')
    }
    if (from !== null) this.recompute(from, u.embedding)
  }

  /**
   * Select a point (index into E.points()) to highlight its Frobenius orbit,
   * or null to clear. Swaps the orbit tube directly, then style → project —
   * fiber/edge tubes are not rebuilt.
   */
  select(i: number | null): void {
    this._selected = i
    this.orbitTube.setCurves(this.orbitCurves())
    this.recompute('style')
  }

  setView(v: Partial<ViewAngles>): void {
    this.update({ view: v })
  }

  // ── the ladder ────────────────────────────────────────────────────────────
  /**
   * The embedding index is applied at the build stage, AFTER any resolve has
   * refreshed the candidate list — so `update({curve, embedding})` clamps
   * against the new curve's candidates, not the old ones.
   */
  private recompute(from: Stage, embedding?: number): void {
    for (const s of STAGES.slice(STAGES.indexOf(from))) {
      if (s === 'resolve') this.stageResolve()
      else if (s === 'build') {
        if (embedding !== undefined) {
          this._embedding = Math.max(0, Math.min(embedding, this._candidates.length - 1))
        }
        this.stageBuild()
      } else if (s === 'tubes') this.stageTubes()
      else if (s === 'style') this.stageStyle()
      else this.stageProject()
    }
    this.onChange?.()
  }

  private stageResolve(): void {
    if (this._profile) {
      this._candidates = [profileCandidate(this._profile)]
    } else {
      const tau = tauOf(this._curve.data.form)
      let cands = solveProfileCurve(tau, this._lobes !== null ? { n: this._lobes } : {})
      // a pinned lobe count can be unsolvable for this τ — fall back to auto
      // rather than leaving the scene without a curve
      if (cands.length === 0 && this._lobes !== null) cands = solveProfileCurve(tau)
      this._candidates = cands
    }
    if (this._candidates.length === 0) {
      const tau = tauOf(this._curve.data.form)
      throw new Error(
        `solver produced no profile candidates for "${this._curve.label}" (τ = ${tau.re} + ${tau.im}i)`,
      )
    }
    this._embedding = 0
  }

  private computeScene(): void {
    this._k = Math.min(this._k, this.maxK)
    this._scene = buildTorusScene(
      this._curve.data,
      this._k,
      this._candidates[this._embedding]!,
      // injected paper profiles only approximate τ — use the curve's own lattice
      this._profile ? { lattice: 'curve' } : {},
    )
    this._selected = null
  }

  private stageBuild(): void {
    this.computeScene()
    this.torus.setSurface(this._scene.hopf)
    this.points.setPoints(this._scene.positions)
    this.plaque.setLattice(this._scene.hopf.lattice)
    this.plaque.setPoints(this._scene.flat)
    this.sphere.setCurve(this.profileSamples())
  }

  /** The profile curve as drawn on the base S² (uniform samples). */
  private profileSamples() {
    const { hopf } = this._scene
    return Array.from({ length: 256 }, (_, j) => hopf.profileAt((2 * Math.PI * j) / 256))
  }

  private stageTubes(): void {
    const { hopf, E, lambda, flip, unit } = this._scene
    this.fiberTubes.setCurves(this._fibers > 0 ? fiberCurves(hopf, this._fibers) : [])
    this.edgeTubes.setCurves(this._gridlines > 0 ? edgeCurves(hopf, this._gridlines) : [])
    // each fiber tube's base point, marked on the S² picture (same x = f/count)
    this.sphere.setMarks(
      Array.from({ length: this._fibers }, (_, f) =>
        sphereToR3(hopf.profileAt((2 * Math.PI * f) / this._fibers)),
      ),
      uniformColors(this._fibers, 0x4287f5),
    )
    this._displayGens = this._cayleyBasis === 'structure' ? E.generators : reducedGenerators(E, unit)
    // |E| edges per generator regardless of coset structure — spend fewer
    // samples per edge as the group grows (adjacent points are closer)
    const samplesPerEdge = Math.max(3, Math.min(12, Math.ceil(60000 / E.size)))
    this.cayleyTubes.forEach((tube, i) => {
      const g = this._displayGens[i]
      tube.setCurves(
        this._cayley.includes(i) && g ? cayleyCurves(E, g, lambda, hopf, flip, samplesPerEdge) : [],
      )
    })
    // the same geodesics on the flat picture: parallel chords per generator
    this.plaque.setLines(
      this._cayley
        .filter((i) => this._displayGens[i])
        .map((i) => ({
          segments: cayleyFlatSegments(E, this._displayGens[i]!, this._scene.flat, hopf.lattice),
          color: CAYLEY_COLORS[i]!,
        })),
    )
    this.orbitTube.setCurves(this.orbitCurves())
  }

  private stageStyle(): void {
    const { E } = this._scene
    // coset modes use the SAME generators as the Cayley edges; fall back to
    // the last one when g₂ doesn't exist, the identity for the trivial group
    const cosetGen = (i: number) =>
      this._displayGens[i] ?? this._displayGens[this._displayGens.length - 1] ?? E.identity
    const colors =
      this._colorMode === 'uniform'
        ? uniformColors(E.size, this._color)
        : this._colorMode === 'degree'
          ? colorByDegree(E)
          : this._colorMode === 'order'
            ? colorByOrder(E)
            : this._colorMode === 'coset1'
              ? colorByCoset(E, cosetGen(0))
              : this._colorMode === 'coset2'
                ? colorByCoset(E, cosetGen(1))
                : colorByOrbit(E)
    const sizes = this._subfieldBoost ? sizeByDegree(E, { subfieldBoost: 1.6 }) : E.points().map(() => 1)
    if (this._selected !== null) {
      const P = E.points()[this._selected]!
      const boost = highlightOrbit(E, P, 1.6)
      for (let i = 0; i < sizes.length; i++) {
        if (boost[i] === 1) {
          colors[3 * i] = colors[3 * i + 1] = colors[3 * i + 2] = DIM
        } else {
          sizes[i] = sizes[i]! * boost[i]!
        }
      }
    }
    this.points.setColors(colors)
    this.points.setSizes(sizes)
    this.plaque.setColors(colors)
    this.plaque.setSizes(sizes)
  }

  private stageProject(): void {
    const { alpha, beta, gamma, pole } = this._view
    const proj = new S3Projection()
    const qi = (a: number) => Quaternion.fromAxisAngle({ i: 1, j: 0, k: 0 }, a)
    const qj = (a: number) => Quaternion.fromAxisAngle({ i: 0, j: 1, k: 0 }, a)
    proj.rotation = [qi(alpha).mul(qj(gamma)), qi(beta)]
    proj.pole = new Vec4(0, 0, Math.sin(pole), Math.cos(pole))
    this.group.setProjection(proj)
  }

  private orbitCurves() {
    if (this._selected === null) return []
    const { E, lambda, hopf, flip } = this._scene
    return [orbitCurve(E, E.points()[this._selected]!, lambda, hopf, flip)]
  }

  /** Release every GPU resource owned by the scene's renderables. */
  dispose(): void {
    this.torus.dispose()
    this.points.dispose()
    this.fiberTubes.dispose()
    this.edgeTubes.dispose()
    this.orbitTube.dispose()
    for (const t of this.cayleyTubes) t.dispose()
    this.plaque.dispose()
    this.sphere.dispose()
  }
}
