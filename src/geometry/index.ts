/**
 * geometry — the renderable system (DESIGN.md §6). three.js allowed; studio is not.
 * Renderables cache S³ samples; S3Group owns the projection; style.ts maps structure
 * to color/size arrays.
 */
export * from './s3group'
export * from './torus-mesh'
export * from './point-cloud'
export * from './style'
export * from './materials'
