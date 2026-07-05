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
 *   tubes    (fibers, gridlines)        fiber/edge/orbit TubeSet curves
 *   style    (colorMode, boost, select) colors + sizes → points & plaque
 *   project  (α, β, γ, pole)            S3Projection → group
 *
 * Cheap knobs (radii, visibility, materials) are not state: use the exposed
 * renderables directly. Selection is the one shortcut: select() swaps only
 * the orbit tube, then reruns style → project (fiber/edge tubes untouched).
 */
import type { CurveData } from '@/math/arithmetic'
import { tauOf } from '@/math/arithmetic'
import { Quaternion, Vec4 } from '@/math/core'
import type { Candidate } from '@/math/families'
import { solveProfileCurve } from '@/math/families'
import { type ProfileCurve, S3Projection } from '@/math/hopf'

import {
  DomainPlaque,
  HopfTorusMesh,
  PointCloud,
  S3Group,
  TubeSet,
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
import { edgeCurves, fiberCurves, orbitCurve } from './grid-curves'
import { type TorusScene, buildTorusScene, maxFeasibleK } from './torus-scene'

export type ColorMode = 'degree' | 'order' | 'orbit' | 'uniform'
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

export interface CurveSceneOptions {
  curve?: number | string | CurveData
  /** Catalog the curve reference resolves against (and the panel lists). */
  curves?: LabeledCurve[]
  k?: number
  lobes?: number | null
  embedding?: number
  fibers?: number
  gridlines?: number
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

export class CurveScene {
  /** S³ content (torus, points, tubes) — add to app.stage. */
  readonly group = new S3Group()
  readonly torus: HopfTorusMesh
  readonly points: PointCloud
  readonly fiberTubes: TubeSet
  readonly edgeTubes: TubeSet
  readonly orbitTube: TubeSet
  /** The flat ℂ/Λ picture — NOT in `group` (not an S³ object); stage it yourself. */
  readonly plaque: DomainPlaque

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
    this._colorMode = opts.colorMode ?? 'degree'
    this._color = opts.color ?? 0xd43b3b
    this._profile = opts.profile ?? null
    this._subfieldBoost = opts.subfieldBoost ?? true
    Object.assign(this._view, opts.view)
    this._embedding = 0

    this.stageResolve()
    this._embedding = Math.min(opts.embedding ?? 0, this._candidates.length - 1)
    this.computeScene()

    const tubeRadius = opts.tubeRadius ?? 0.012
    this.torus = new HopfTorusMesh(this._scene.hopf)
    this.points = new PointCloud(this._scene.positions, { baseRadius: opts.pointRadius ?? 0.035 })
    this.fiberTubes = new TubeSet([], { radius: tubeRadius, material: colored(0x4287f5) })
    this.edgeTubes = new TubeSet([], { radius: tubeRadius, material: colored(0xd43b3b) })
    this.orbitTube = new TubeSet([], { radius: tubeRadius * 0.8, material: colored(0xe8ac2a) })
    this.plaque = new DomainPlaque(this._scene.hopf.lattice, this._scene.flat, { pointRadius: 0.014 })
    this.group.add(this.torus, this.points, this.fiberTubes, this.edgeTubes, this.orbitTube)

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

  // ── setters: assign + rerun the ladder from the named stage ──────────────
  setCurve(ref: number | string | CurveData): void {
    this._curve = resolveCurve(ref, this.catalog)
    this.recompute('resolve')
  }

  setLobes(n: number | null): void {
    this._lobes = n
    this.recompute('resolve')
  }

  setEmbedding(i: number): void {
    this._embedding = Math.max(0, Math.min(i, this._candidates.length - 1))
    this.recompute('build')
  }

  /** Returns the (possibly clamped) k actually applied. */
  setK(k: number): number {
    this._k = k
    this.recompute('build')
    return this._k
  }

  setFibers(n: number): void {
    this._fibers = n
    this.recompute('tubes')
  }

  setGridlines(n: number): void {
    this._gridlines = n
    this.recompute('tubes')
  }

  setColorMode(m: ColorMode): void {
    this._colorMode = m
    this.recompute('style')
  }

  /** The single color for colorMode 'uniform'. */
  setColor(hex: number): void {
    this._color = hex
    this.recompute('style')
  }

  /** Pin an explicit profile curve (null = back to the solver's candidates). */
  setProfile(p: ProfileCurve | null): void {
    this._profile = p
    this.recompute('resolve')
  }

  setSubfieldBoost(on: boolean): void {
    this._subfieldBoost = on
    this.recompute('style')
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
    Object.assign(this._view, v)
    this.recompute('project')
  }

  // ── the ladder ────────────────────────────────────────────────────────────
  private recompute(from: Stage): void {
    for (const s of STAGES.slice(STAGES.indexOf(from))) {
      if (s === 'resolve') this.stageResolve()
      else if (s === 'build') this.stageBuild()
      else if (s === 'tubes') this.stageTubes()
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
      this._candidates = solveProfileCurve(tau, this._lobes !== null ? { n: this._lobes } : {})
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
  }

  private stageTubes(): void {
    const { hopf } = this._scene
    this.fiberTubes.setCurves(this._fibers > 0 ? fiberCurves(hopf, this._fibers) : [])
    this.edgeTubes.setCurves(this._gridlines > 0 ? edgeCurves(hopf, this._gridlines) : [])
    this.orbitTube.setCurves(this.orbitCurves())
  }

  private stageStyle(): void {
    const { E } = this._scene
    const colors =
      this._colorMode === 'uniform'
        ? uniformColors(E.size, this._color)
        : this._colorMode === 'degree'
          ? colorByDegree(E)
          : this._colorMode === 'order'
            ? colorByOrder(E)
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
}
