// Module resolution hook: maps the tsconfig alias "@/x" to src/x, resolving
// extensionless specifiers to x.ts or x/index.ts the way the bundler does.
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = new URL('../src/', import.meta.url)

function withTsResolution(url) {
  const p = fileURLToPath(url)
  if (existsSync(p) && statSync(p).isFile()) return url
  if (existsSync(p) && statSync(p).isDirectory()) return pathToFileURL(`${p}/index.ts`).href
  if (existsSync(`${p}.ts`)) return pathToFileURL(`${p}.ts`).href
  return url
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(withTsResolution(new URL(specifier.slice(2), SRC).href), context)
  }
  // extensionless relative imports between .ts modules ("./mat2z", "../core")
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.endsWith('.ts')) {
    return nextResolve(withTsResolution(new URL(specifier, context.parentURL).href), context)
  }
  return nextResolve(specifier, context)
}
