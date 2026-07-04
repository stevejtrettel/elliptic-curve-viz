/**
 * The view group owns the projection (DESIGN.md §6): S3Group holds the single
 * S3Projection and fans reproject out to its members — eliminating the
 * "forgot to update the tubes" bug class. Rotation/pole sliders call
 * setProjection; nothing else touches the math layer.
 */
import * as THREE from 'three'

import { S3Projection } from '@/math/hopf'

/** A renderable that caches S³ samples and derives ℝ³ data on demand. */
export interface S3Renderable {
  reproject(proj: S3Projection): void
}

function isS3Renderable(obj: object): obj is S3Renderable {
  return 'reproject' in obj && typeof (obj as S3Renderable).reproject === 'function'
}

export class S3Group extends THREE.Group {
  private projection = new S3Projection()

  /** The current projection; treat as read-only — change it via setProjection. */
  getProjection(): S3Projection {
    return this.projection
  }

  /** Store the projection and reproject every S³ renderable in the subtree. */
  setProjection(proj: S3Projection): void {
    this.projection = proj
    this.traverse((child) => {
      if (isS3Renderable(child)) child.reproject(proj)
    })
  }

  /** Adds like THREE.Group, then immediately reprojects newcomers. */
  override add(...objects: THREE.Object3D[]): this {
    super.add(...objects)
    for (const obj of objects) {
      obj.traverse((child) => {
        if (isS3Renderable(child)) child.reproject(this.projection)
      })
    }
    return this
  }
}
