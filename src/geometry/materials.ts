/**
 * Shared MeshPhysicalMaterial recipes (DESIGN.md §6), path-tracer compatible.
 * Glass parameters follow lifting-modp's makeMaterial (transmission 0.99,
 * ior 1.05, thin walls) — the look of the paper's figures.
 */
import * as THREE from 'three'

/** Transmissive glass, the torus-surface default. */
export function glass(color: THREE.ColorRepresentation = 0xc9eaff): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    transmission: 0.99,
    ior: 1.05,
    thickness: 0.01,
    side: THREE.DoubleSide,
  })
}

/** Diffuse matte, for floors and non-glass torus mode. */
export function matte(color: THREE.ColorRepresentation = 0xf0f0f0): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
}

/** Colored solid, the point-sphere default (per-instance colors multiply white). */
export function colored(color: THREE.ColorRepresentation = 0xffffff): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0 })
}
