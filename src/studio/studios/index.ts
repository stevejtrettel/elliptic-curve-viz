/** The named studio registry (DESIGN.md §7) — one spec file per studio. */
import type { StudioSpec } from '../specs'
import { bridgesPaper } from './bridges-paper'
import { colored } from './colored'
import { dark } from './dark'
import { paperWhite } from './paper-white'
import { velvetDark } from './velvet-dark'

/** The gallery's "bright" studio is the Bridges-figure look under a friendlier name. */
export const bright: StudioSpec = { ...bridgesPaper, name: 'bright' }

export { bridgesPaper, colored, dark, paperWhite, velvetDark }

export const STUDIOS: Record<string, StudioSpec> = {
  bright,
  colored,
  dark,
  'paper-white': paperWhite,
  'velvet-dark': velvetDark,
  'bridges-paper': bridgesPaper,
}
