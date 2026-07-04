/** The named studio registry (DESIGN.md §7) — one spec file per studio. */
import type { StudioSpec } from '../specs'
import { paperWhite } from './paper-white'

export { paperWhite }

export const STUDIOS: Record<string, StudioSpec> = {
  'paper-white': paperWhite,
}
