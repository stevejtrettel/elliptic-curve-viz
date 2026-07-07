// Per-demo dev/build runner — the threejs-demos convention:
//   npm run dev                 → all dev demos via the demos/ index (?demo=...)
//   npm run dev catalog-lifts   → serve ONE demo directly (demos/ or gallery/)
//   npm run build               → dist/ = all dev demos (portable)
//   npm run build catalog-lifts → dist/catalog-lifts = one-demo portable folder
//   npm run gallery             → serve the ART gallery (gallery/ index)
//   npm run gallery:build       → dist-gallery/ = the standalone art site
// The entry swap happens in memory: DEMO_ENTRY is read by the demo-entry plugin
// in vite.config.ts (transformIndexHtml) — nothing on disk is rewritten.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const [, , mode, arg] = process.argv
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let entry = null // DEMO_ENTRY (swapped into index.html)
let outDir = 'dist'

if (arg === '--gallery') {
  // the whole art gallery: its own loader is the entry, its own dist
  entry = '/gallery/_loader.ts'
  outDir = 'dist-gallery'
} else if (arg) {
  // a named demo — look in demos/ first, then gallery/
  const dir = ['demos', 'gallery'].find((d) => existsSync(path.join(root, d, arg, 'main.ts')))
  if (!dir) {
    console.error(`Demo not found: demos/${arg}/main.ts or gallery/${arg}/main.ts`)
    process.exit(1)
  }
  entry = `/${dir}/${arg}/main.ts`
  outDir = `dist/${arg}`
}

const viteArgs =
  mode === 'build' ? ['build', '--outDir', outDir] : mode === 'preview' ? ['preview', '--outDir', outDir] : []
const env = { ...process.env, ...(entry ? { DEMO_ENTRY: entry } : {}) }
const child = spawn('npx', ['vite', ...viteArgs], { stdio: 'inherit', cwd: root, env })
child.on('exit', (code) => process.exit(code ?? 0))
