/**
 * Piece files — a rendered COMPOSITION of one or more tori (DESIGN.md §8).
 *
 * Deliberately SEPARATE from the curves: an art demo keeps its arithmetic in
 * demos/<name>/curves.json (pure descriptors, the data/curves.json format) and
 * its composition here in demos/<name>/piece.json — which curves (by index into
 * that file), at what extension k / lobes, with which render knobs, and where
 * each torus sits in ℝ³. Placement is a rigid transform on the projected
 * geometry, so it never touches the S³ math (see show-piece.ts). This file is
 * the Save target; curves.json is read-only input.
 *
 * Curve refs are HYBRID: a label/index resolves against the demo's curves; an
 * inline descriptor object stands alone for a one-off, validated through the
 * same descriptor contract (exact bigint arithmetic).
 */
import type { CurveData } from '@/math/arithmetic'

import { parseCurveDescriptors } from '@/io'

import type { CayleyBasis, CayleySelection, ColorMode, ViewAngles } from './curve-scene'
import type { LayoutType } from './layout'

/** A torus's pose in ℝ³ — applied to its slot group after projection. */
export interface Placement {
  position: [number, number, number]
  /** THREE quaternion order [x, y, z, w]. */
  quaternion: [number, number, number, number]
  /** Uniform scale multiplier over the torus's natural size (default 1). */
  scale?: number
}

/** One torus in a piece: a curve reference plus its render knobs and pose. */
export interface TorusEntry {
  /** Catalog label/index, or an inline descriptor for a one-off curve. */
  curve: string | number | CurveData
  /** Field extension degree — how many E(F_p^k) points populate the torus. */
  k?: number
  /** Profile lobe count (torus shape); null/absent = solver's auto choice. */
  lobes?: number | null
  /** θ-skew, the paper's twist: θ = t + skew·sin(2n·t). Absent/0 = untwisted. */
  skew?: number
  /**
   * Paper-family profile (torus-lifts look): fix twist a and lobes n, solve the
   * amplitude b from τ (solvePaperFamily). Overrides lobes/skew when present.
   */
  profile?: { a: number; n: number }
  fibers?: number
  gridlines?: number
  cayley?: CayleySelection
  /** Cayley generating pair: 'reduced' (shortest) or 'structure' (SNF). */
  cayleyBasis?: CayleyBasis
  colorBy?: ColorMode
  /** Single point color when colorBy is 'uniform'. */
  color?: number
  /** Per-subfield point colors for colorBy 'degree': { "1": 0xhex, "2": 0xhex, … }. */
  degreeColors?: Record<number, number>
  /** Point bead radius. */
  pointRadius?: number
  /** Torus surface: matte (default, opaque), glass, or false = hidden. */
  torus?: 'glass' | 'matte' | false
  /** Torus surface tint (glass/matte). */
  surfaceColor?: number
  /** Per-torus S³ rotation and projection-pole tilt. */
  view?: Partial<ViewAngles>
  /** ℝ³ pose. Absent → the builder auto-lays-out this torus. */
  placement?: Placement
}

/** The active layout template + its knobs, so a reopened piece restores them. */
export interface PieceLayout {
  type: LayoutType
  spacing: number
  equalize: boolean
}

/** Saved camera framing (absent → the demo's top-down default). */
export interface PieceCamera {
  /** Radians around y. */
  azimuth: number
  /** Radians above the horizon (≈ π/2 is straight down). */
  elevation: number
  /** Fraction of the frame the content fills (zoom). */
  fill?: number
}

/** Live studio adjustments layered on the preset — restored for an exact reload. */
export interface PieceLook {
  /** Torus surface, uniform across the whole piece (moved off per-torus). */
  surface?: 'glass' | 'matte' | 'paper' | false
  /** Torus surface tint, uniform across the piece. */
  surfaceColor?: number
  /** Paper-grain normal-map strength (when surface is 'paper'). */
  paperScale?: number
  /** Paper-grain normal-map filename (assets/textures/). */
  paperMap?: string
  /** Background/floor color override (colored picker / dark darkness slider). */
  background?: number | null
  exposure?: number
  envIntensity?: number
  /** Floor/back-wall height offset over the studio's auto position (shadow distance). */
  floorOffset?: number
  /** Key-light horizontal offset (sweeps the shadow left↔right). */
  keyLightX?: number
  /** Non-preview light intensities, in the studio spec's light order. */
  lights?: number[]
}

/** Export framing so a reopened piece is ready to print at the same size. */
export interface PieceExport {
  /** Aspect preset value, e.g. '1:1' | '4:5' | '2:3' | '3:2' | '16:9'. */
  aspect?: string
  /** Long-edge resolution in pixels: 1024 | 2048 | 4096 | 8192. */
  longEdge?: number
}

export interface PieceFile {
  tori: TorusEntry[]
  /** Last layout template applied (control state); poses stay authoritative. */
  layout?: PieceLayout
  /** Per-piece camera; absent → start from the top-down default. */
  camera?: PieceCamera
  /** Studio preset name (STUDIOS registry); absent → the demo's default. */
  studio?: string
  /** Live studio look on top of the preset. */
  look?: PieceLook
  /** Export framing for prints. */
  export?: PieceExport
}

/**
 * Parse and validate a piece file. Inline curve objects are run through the
 * descriptor contract (→ bigint CurveData); label/index refs pass through for
 * CurveScene to resolve against its catalog. Throws with the offending torus
 * index on any malformed entry.
 */
export function parsePieceFile(json: unknown): PieceFile {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('piece: expected an object with a `tori` array')
  }
  const rec = json as Record<string, unknown>
  if (!Array.isArray(rec['tori']) || rec['tori'].length === 0) {
    throw new Error('piece.tori: expected a non-empty array')
  }
  const tori = rec['tori'].map((entry, i) => parseEntry(entry, i))
  const studio = rec['studio']
  if (studio !== undefined && typeof studio !== 'string') throw new Error('piece.studio: expected a preset name')
  const layout = rec['layout'] !== undefined ? parseLayout(rec['layout']) : undefined
  const camera = rec['camera'] !== undefined ? parseCamera(rec['camera']) : undefined
  const look = rec['look'] !== undefined ? parseLook(rec['look']) : undefined
  const exp = rec['export'] !== undefined ? parseExport(rec['export']) : undefined
  return {
    tori,
    ...(layout ? { layout } : {}),
    ...(camera ? { camera } : {}),
    ...(studio !== undefined ? { studio } : {}),
    ...(look ? { look } : {}),
    ...(exp ? { export: exp } : {}),
  }
}

function parseLook(raw: unknown): PieceLook {
  if (typeof raw !== 'object' || raw === null) throw new Error('piece.look: expected an object')
  const rec = raw as Record<string, unknown>
  const out: PieceLook = {}
  if (rec['surface'] !== undefined) {
    const s = rec['surface']
    if (s !== 'glass' && s !== 'matte' && s !== 'paper' && s !== false) {
      throw new Error('piece.look.surface: glass|matte|paper|false')
    }
    out.surface = s
  }
  if (rec['surfaceColor'] !== undefined) out.surfaceColor = int(rec['surfaceColor'], 'piece.look.surfaceColor')
  if (rec['paperScale'] !== undefined) out.paperScale = num(rec['paperScale'], 'piece.look.paperScale')
  if (rec['paperMap'] !== undefined) {
    if (typeof rec['paperMap'] !== 'string') throw new Error('piece.look.paperMap: expected a filename string')
    out.paperMap = rec['paperMap']
  }
  if (rec['background'] !== undefined) {
    out.background = rec['background'] === null ? null : int(rec['background'], 'piece.look.background')
  }
  if (rec['exposure'] !== undefined) out.exposure = num(rec['exposure'], 'piece.look.exposure')
  if (rec['envIntensity'] !== undefined) out.envIntensity = num(rec['envIntensity'], 'piece.look.envIntensity')
  if (rec['floorOffset'] !== undefined) out.floorOffset = num(rec['floorOffset'], 'piece.look.floorOffset')
  if (rec['keyLightX'] !== undefined) out.keyLightX = num(rec['keyLightX'], 'piece.look.keyLightX')
  if (rec['lights'] !== undefined) {
    if (!Array.isArray(rec['lights']) || !rec['lights'].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      throw new Error('piece.look.lights: expected an array of numbers')
    }
    out.lights = rec['lights'] as number[]
  }
  return out
}

function parseExport(raw: unknown): PieceExport {
  if (typeof raw !== 'object' || raw === null) throw new Error('piece.export: expected an object')
  const rec = raw as Record<string, unknown>
  const out: PieceExport = {}
  if (rec['aspect'] !== undefined) {
    if (typeof rec['aspect'] !== 'string') throw new Error('piece.export.aspect: expected a string')
    out.aspect = rec['aspect']
  }
  if (rec['longEdge'] !== undefined) out.longEdge = int(rec['longEdge'], 'piece.export.longEdge')
  return out
}

function parseCamera(raw: unknown): PieceCamera {
  if (typeof raw !== 'object' || raw === null) throw new Error('piece.camera: expected {azimuth, elevation}')
  const rec = raw as Record<string, unknown>
  const azimuth = num(rec['azimuth'], 'piece.camera.azimuth')
  const elevation = num(rec['elevation'], 'piece.camera.elevation')
  const fill = rec['fill'] !== undefined ? num(rec['fill'], 'piece.camera.fill') : undefined
  return { azimuth, elevation, ...(fill !== undefined ? { fill } : {}) }
}

function parseLayout(raw: unknown): PieceLayout {
  if (typeof raw !== 'object' || raw === null) throw new Error('piece.layout: expected an object')
  const rec = raw as Record<string, unknown>
  const type = rec['type']
  if (type !== 'row' && type !== 'column' && type !== 'grid' && type !== 'ring') {
    throw new Error('piece.layout.type: row|column|grid|ring')
  }
  const spacing = rec['spacing']
  if (typeof spacing !== 'number' || !Number.isFinite(spacing)) throw new Error('piece.layout.spacing: a number')
  if (typeof rec['equalize'] !== 'boolean') throw new Error('piece.layout.equalize: a boolean')
  return { type, spacing, equalize: rec['equalize'] }
}

function parseEntry(entry: unknown, i: number): TorusEntry {
  const at = `piece.tori[${i}]`
  if (typeof entry !== 'object' || entry === null) throw new Error(`${at}: expected an object`)
  const rec = entry as Record<string, unknown>

  const rawCurve = rec['curve']
  if (rawCurve === undefined) throw new Error(`${at}.curve: required (catalog label/index or inline descriptor)`)
  // hybrid ref: a string/number resolves against the catalog in CurveScene;
  // an inline object is validated here through the descriptor contract.
  let curve: TorusEntry['curve']
  if (typeof rawCurve === 'string' || typeof rawCurve === 'number') {
    curve = rawCurve
  } else if (typeof rawCurve === 'object') {
    curve = parseCurveDescriptors([rawCurve])[0]!.data
  } else {
    throw new Error(`${at}.curve: expected a label, index, or inline descriptor`)
  }

  const out: TorusEntry = { curve }
  if (rec['k'] !== undefined) out.k = int(rec['k'], `${at}.k`)
  if (rec['lobes'] !== undefined) out.lobes = rec['lobes'] === null ? null : int(rec['lobes'], `${at}.lobes`)
  if (rec['skew'] !== undefined) out.skew = num(rec['skew'], `${at}.skew`)
  if (rec['profile'] !== undefined) {
    const p = rec['profile']
    if (typeof p !== 'object' || p === null) throw new Error(`${at}.profile: expected {a, n}`)
    const prof = p as Record<string, unknown>
    out.profile = { a: num(prof['a'], `${at}.profile.a`), n: int(prof['n'], `${at}.profile.n`) }
  }
  if (rec['fibers'] !== undefined) out.fibers = int(rec['fibers'], `${at}.fibers`)
  if (rec['gridlines'] !== undefined) out.gridlines = int(rec['gridlines'], `${at}.gridlines`)
  if (rec['cayley'] !== undefined) out.cayley = rec['cayley'] as CayleySelection
  if (rec['cayleyBasis'] !== undefined) {
    if (rec['cayleyBasis'] !== 'reduced' && rec['cayleyBasis'] !== 'structure') {
      throw new Error(`${at}.cayleyBasis: reduced|structure`)
    }
    out.cayleyBasis = rec['cayleyBasis']
  }
  if (rec['colorBy'] !== undefined) out.colorBy = rec['colorBy'] as ColorMode
  if (rec['color'] !== undefined) out.color = int(rec['color'], `${at}.color`)
  if (rec['degreeColors'] !== undefined) {
    const dc = rec['degreeColors']
    if (typeof dc !== 'object' || dc === null) throw new Error(`${at}.degreeColors: expected an object`)
    out.degreeColors = {}
    for (const [d, v] of Object.entries(dc as Record<string, unknown>)) {
      out.degreeColors[Number(d)] = int(v, `${at}.degreeColors.${d}`)
    }
  }
  if (rec['pointRadius'] !== undefined) out.pointRadius = num(rec['pointRadius'], `${at}.pointRadius`)
  if (rec['torus'] !== undefined) out.torus = rec['torus'] as 'glass' | 'matte' | false
  if (rec['surfaceColor'] !== undefined) out.surfaceColor = int(rec['surfaceColor'], `${at}.surfaceColor`)
  if (rec['view'] !== undefined) out.view = rec['view'] as Partial<ViewAngles>
  if (rec['placement'] !== undefined) out.placement = parsePlacement(rec['placement'], `${at}.placement`)
  return out
}

function parsePlacement(raw: unknown, at: string): Placement {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${at}: expected {position, quaternion}`)
  const rec = raw as Record<string, unknown>
  const position = numArray(rec['position'], 3, `${at}.position`)
  const quaternion = numArray(rec['quaternion'], 4, `${at}.quaternion`)
  const scale = rec['scale']
  if (scale !== undefined && (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0)) {
    throw new Error(`${at}.scale: expected a positive number`)
  }
  return {
    position: position as Placement['position'],
    quaternion: quaternion as Placement['quaternion'],
    ...(scale !== undefined ? { scale } : {}),
  }
}

function numArray(v: unknown, n: number, at: string): number[] {
  if (!Array.isArray(v) || v.length !== n || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`${at}: expected ${n} finite numbers`)
  }
  return v as number[]
}

function int(v: unknown, at: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`${at}: expected an integer`)
  return v
}

function num(v: unknown, at: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${at}: expected a number`)
  return v
}

/**
 * Serialize a piece back to a JSON-ready object, stamping each torus with its
 * current pose. This is the SAVE side of the round-trip: `poses[i]` is torus i's
 * live slot transform (position + quaternion). Inline curves are emitted through
 * the descriptor contract (bigints → JSON numbers, or decimal strings beyond
 * 2⁵³); label/index refs pass through untouched.
 */
export function serializePiece(piece: PieceFile, poses: Placement[]): unknown {
  return {
    ...(piece.camera ? { camera: roundCamera(piece.camera) } : {}),
    ...(piece.layout ? { layout: piece.layout } : {}),
    ...(piece.studio !== undefined ? { studio: piece.studio } : {}),
    ...(piece.look ? { look: roundLook(piece.look) } : {}),
    ...(piece.export ? { export: piece.export } : {}),
    tori: piece.tori.map((entry, i) => ({
      ...entry,
      curve: typeof entry.curve === 'object' ? curveToJSON(entry.curve) : entry.curve,
      placement: {
        position: poses[i]!.position.map(round) as Placement['position'],
        quaternion: poses[i]!.quaternion.map(round) as Placement['quaternion'],
        scale: round(poses[i]!.scale ?? 1),
      },
    })),
  }
}

/** Inline CurveData → a descriptor object with JSON-safe integer fields. */
function curveToJSON(c: CurveData): Record<string, unknown> {
  return {
    form: { a: biToJSON(c.form.a), b: biToJSON(c.form.b), c: biToJSON(c.form.c) },
    p: biToJSON(c.p),
    trace: biToJSON(c.trace),
    sign: c.sign,
    ...(c.equation ? { equation: { f: biToJSON(c.equation.f), g: biToJSON(c.equation.g) } } : {}),
  }
}

/** bigint → JSON number when exactly representable, else a decimal string. */
function biToJSON(v: bigint): number | string {
  return v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v.toString()
}

/** Trim pose floats to a tidy fixed precision so saved files read cleanly. */
function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

function roundCamera(c: PieceCamera): PieceCamera {
  return {
    azimuth: round(c.azimuth),
    elevation: round(c.elevation),
    ...(c.fill !== undefined ? { fill: round(c.fill) } : {}),
  }
}

function roundLook(l: PieceLook): PieceLook {
  return {
    ...(l.surface !== undefined ? { surface: l.surface } : {}),
    ...(l.surfaceColor !== undefined ? { surfaceColor: l.surfaceColor } : {}),
    ...(l.paperScale !== undefined ? { paperScale: round(l.paperScale) } : {}),
    ...(l.paperMap !== undefined ? { paperMap: l.paperMap } : {}),
    ...(l.background !== undefined ? { background: l.background } : {}),
    ...(l.exposure !== undefined ? { exposure: round(l.exposure) } : {}),
    ...(l.envIntensity !== undefined ? { envIntensity: round(l.envIntensity) } : {}),
    ...(l.floorOffset !== undefined ? { floorOffset: round(l.floorOffset) } : {}),
    ...(l.keyLightX !== undefined ? { keyLightX: round(l.keyLightX) } : {}),
    ...(l.lights ? { lights: l.lights.map(round) } : {}),
  }
}
