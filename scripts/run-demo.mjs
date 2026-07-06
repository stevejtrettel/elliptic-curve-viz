// Per-demo dev/build runner — the threejs-demos convention:
//   npm run dev                 → all demos via the _loader index (?demo=...)
//   npm run dev catalog-lifts   → serve ONE demo directly
//   npm run build               → dist/ = the whole gallery (portable)
//   npm run build catalog-lifts → dist/catalog-lifts = one-demo portable folder
// The entry swap happens in memory: DEMO_ENTRY is read by the demo-entry
// plugin in vite.config.ts (transformIndexHtml) — nothing on disk is rewritten.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const [, , mode, demo] = process.argv
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (demo && !existsSync(path.join(root, 'demos', demo, 'main.ts'))) {
  console.error(`Demo not found: demos/${demo}/main.ts`)
  process.exit(1)
}

const outDir = demo ? `dist/${demo}` : 'dist'
const viteArgs =
  mode === 'build' ? ['build', '--outDir', outDir] : mode === 'preview' ? ['preview', '--outDir', outDir] : []
const env = { ...process.env, ...(demo ? { DEMO_ENTRY: `/demos/${demo}/main.ts` } : {}) }
const child = spawn('npx', ['vite', ...viteArgs], { stdio: 'inherit', cwd: root, env })
child.on('exit', (code) => process.exit(code ?? 0))
