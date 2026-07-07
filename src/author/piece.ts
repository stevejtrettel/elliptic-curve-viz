/**
 * Piece files — a rendered COMPOSITION of one or more tori (DESIGN.md §8).
 *
 * Where a curve descriptor is pure arithmetic (data/curves.json, the shared
 * catalog), a PIECE is the finished art: which curves, at what extension k and
 * with which knobs, and — the part that round-trips from the viewport — where
 * each torus sits in ℝ³ (its `placement`). Placement is a rigid transform on the
 * projected geometry, so it never touches the S³ math (see show-piece.ts).
 *
 * Curve refs are HYBRID: a catalog label (or index) string resolves against
 * data/curves.json; an inline descriptor object stands alone for a one-off not
 * in the catalog. Inline curves are validated through the same descriptor
 * contract as the catalog (exact bigint arithmetic).
 */
import type { CurveData } from '@/math/arithmetic'

import { parseCurveDescriptors } from '@/io'

import type { CayleySelection, ColorMode, ViewAngles } from './curve-scene'

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
  k?: number
  fibers?: number
  gridlines?: number
  cayley?: CayleySelection
  colorBy?: ColorMode
  /** Single color when colorBy is 'uniform'. */
  color?: number
  /** Torus surface: glass (default), matte, or false = hidden. */
  torus?: 'glass' | 'matte' | false
  /** Per-torus S³ rotation and projection-pole tilt. */
  view?: Partial<ViewAngles>
  /** ℝ³ pose. Absent → the builder auto-lays-out this torus. */
  placement?: Placement
}

export interface PieceFile {
  tori: TorusEntry[]
  /** Studio preset name (STUDIOS registry); absent → the demo's default. */
  studio?: string
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
  return { tori, ...(studio !== undefined ? { studio } : {}) }
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
  if (rec['fibers'] !== undefined) out.fibers = int(rec['fibers'], `${at}.fibers`)
  if (rec['gridlines'] !== undefined) out.gridlines = int(rec['gridlines'], `${at}.gridlines`)
  if (rec['cayley'] !== undefined) out.cayley = rec['cayley'] as CayleySelection
  if (rec['colorBy'] !== undefined) out.colorBy = rec['colorBy'] as ColorMode
  if (rec['color'] !== undefined) out.color = int(rec['color'], `${at}.color`)
  if (rec['torus'] !== undefined) out.torus = rec['torus'] as 'glass' | 'matte' | false
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

/**
 * Serialize a piece back to a JSON-ready object, stamping each torus with its
 * current pose. This is the SAVE side of the round-trip: `poses[i]` is torus i's
 * live slot transform (position + quaternion). Inline curves are emitted through
 * the descriptor contract (bigints → JSON numbers, or decimal strings beyond
 * 2⁵³); label/index refs pass through untouched.
 */
export function serializePiece(piece: PieceFile, poses: Placement[]): unknown {
  return {
    ...(piece.studio !== undefined ? { studio: piece.studio } : {}),
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
