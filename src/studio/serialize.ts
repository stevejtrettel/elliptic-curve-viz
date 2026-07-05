/**
 * serializeStudioSpec — turn a (data-only) StudioSpec back into a ready-to-
 * paste TypeScript module: design in the browser, keep forever as a preset
 * file in src/studio/studios/. Function-valued fields (procedural
 * environments, custom lights) cannot be serialized and come out as comments.
 */
import type { StudioSpec } from './specs'

/** Keys whose integer values are colors and print as 0x hex. */
const COLOR_KEYS = new Set(['color', 'top', 'bottom', 'background'])

export function serializeStudioSpec(spec: StudioSpec, exportName = 'myStudio'): string {
  return `import type { StudioSpec } from '@/studio'\n\nexport const ${exportName}: StudioSpec = ${fmt(spec, 0)}\n`
}

function fmt(v: unknown, depth: number, key?: string): string {
  if (typeof v === 'function') return 'undefined /* function omitted — re-add by hand */'
  if (typeof v === 'number') {
    if (key !== undefined && COLOR_KEYS.has(key) && Number.isInteger(v) && v >= 0) {
      return `0x${v.toString(16).padStart(6, '0')}`
    }
    return String(Math.round(v * 1000) / 1000)
  }
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`
  if (typeof v === 'boolean' || v === null) return String(v)
  if (Array.isArray(v)) return `[${v.map((x) => fmt(x, depth, key)).join(', ')}]`
  if (typeof v === 'object') {
    const pad = '  '.repeat(depth + 1)
    const entries = Object.entries(v).filter(([, val]) => val !== undefined)
    if (entries.length === 0) return '{}'
    const rows = entries.map(([k, val]) => `${pad}${k}: ${fmt(val, depth + 1, k)},`).join('\n')
    return `{\n${rows}\n${'  '.repeat(depth)}}`
  }
  return String(v)
}
