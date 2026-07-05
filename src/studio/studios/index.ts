/** The named studio registry (DESIGN.md §7) — one spec file per studio. */
import type { StudioSpec } from '../specs'
import { bridgesPaper } from './bridges-paper'
import { paperWhite } from './paper-white'
import { velvetDark } from './velvet-dark'

export { bridgesPaper, paperWhite, velvetDark }

export const STUDIOS: Record<string, StudioSpec> = {
  'paper-white': paperWhite,
  'velvet-dark': velvetDark,
  'bridges-paper': bridgesPaper,
}
