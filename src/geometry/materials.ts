/**
 * Shared MeshPhysicalMaterial recipes (DESIGN.md §6), path-tracer compatible.
 * Glass parameters follow lifting-modp's makeMaterial (transmission 0.99,
 * ior 1.05, thin walls) — the look of the paper's figures.
 */
import * as THREE from 'three'

/**
 * Transmissive glass, the torus-surface default. Two path-tracer constraints
 * (survey §5, verified the hard way):
 * - thickness MUST be 0: zero-thickness transmission = thin film (what a torus
 *   shell is); positive thickness = solid glass, rays die inside → black.
 * - side MUST be FrontSide: DoubleSide transmission confuses the tracer's
 *   entering/exiting test (backface normals) → black glass. FrontSide is also
 *   markedly cheaper in the raster transmission pass.
 */
export function glass(color: THREE.ColorRepresentation = 0xc9eaff): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    transmission: 0.99,
    ior: 1.05,
    thickness: 0,
    side: THREE.FrontSide,
  })
}

/** Diffuse matte, for floors and non-glass torus mode. */
export function matte(color: THREE.ColorRepresentation = 0xf0f0f0): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
}

export interface PaperOptions {
  /** Grain normal map (from textures.loadNormalMap); null = plain matte paper. */
  normalMap?: THREE.Texture | null
  /** Grain strength (default 0.6). */
  normalScale?: number
  /** Optional base-color texture — the grid map (Phase 2). */
  map?: THREE.Texture | null
}

/**
 * Matte paper surface: like `matte` but carrying a tileable grain normal map (and,
 * later, a grid `map`). DoubleSide, path-tracer compatible. UVs come from
 * HopfTorusMesh's lattice UV attribute, so maps tile as the fundamental domain.
 */
export function paper(color: THREE.ColorRepresentation = 0xf0ece0, opts: PaperOptions = {}): THREE.MeshPhysicalMaterial {
  const scale = opts.normalScale ?? 0.6
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    normalMap: opts.normalMap ?? null,
    normalScale: new THREE.Vector2(scale, scale),
    map: opts.map ?? null,
  })
}

/** Colored solid, the point-sphere default (per-instance colors multiply white). */
export function colored(color: THREE.ColorRepresentation = 0xffffff): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0 })
}

/**
 * Metallic solid (e.g. pewter gridlines): tunable roughness + metalness.
 * DoubleSide so open tube caps read from either face. Lower roughness → mirror
 * chrome; ~0.4–0.6 → the soft dull sheen of pewter.
 *
 * A pure metal (metalness 1) has NO diffuse — it shows only its reflected
 * surroundings, so a small feature facing empty/dark space renders black. For
 * a colored metal that must read as its hue against a dark backdrop (e.g. a
 * copper ring at an opening), drop metalness slightly (~0.85) so a little of
 * the base-color albedo always shows through.
 */
export function metal(
  color: THREE.ColorRepresentation = 0x8a8d92,
  roughness = 0.45,
  metalness = 1,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, side: THREE.DoubleSide })
}

/**
 * Opaque torus surface: DOUBLE-sided — wavy embeddings expose their inner
 * face. (Glass stays FrontSide: the tracer's transmission needs it.)
 */
export function solidSurface(color: THREE.ColorRepresentation = 0xc9eaff): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, side: THREE.DoubleSide })
}
