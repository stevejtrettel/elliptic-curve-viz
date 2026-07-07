import { defineConfig, type Plugin } from 'vite'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Per-demo entry swap: `npm run dev <demo>` (scripts/run-demo.mjs) passes the
 * entry module via DEMO_ENTRY and this plugin rewrites the script tag IN
 * MEMORY — index.html on disk is never touched, so a killed dev server can't
 * leave the tree dirty. order: 'pre' so the swap lands before vite analyzes
 * the HTML's module graph (dev serve and build alike).
 */
function demoEntry(): Plugin {
  return {
    name: 'demo-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const entry = process.env['DEMO_ENTRY']
        if (!entry) return html
        return html.replace(
          /<script\s+type="module"\s+src="\/demos\/[^"]+"><\/script>/,
          `<script type="module" src="${entry}"></script>`,
        )
      },
    },
  }
}

/**
 * Save round-trip. POST /api/save-piece writes the request body to disk:
 *   ?demo=<name>  → gallery/<name>/piece.json or demos/<name>/piece.json
 *   ?name=<stem>  → data/pieces/<stem>.json   (the sandbox demo)
 * DEV ONLY (configureServer runs only under `vite` serve) — the production build
 * ships no such route, so a hosted gallery is read-only. Both params are
 * whitelisted to a bare stem, so the write can never escape its directory; a
 * ?demo target must be an existing piece folder (gallery/ preferred, then demos/).
 */
function savePiece(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const isStem = (s: string) => /^[a-z0-9._-]+$/i.test(s)
  return {
    name: 'save-piece',
    configureServer(server) {
      server.middlewares.use('/api/save-piece', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('POST only')
        }
        const q = new URL(req.url ?? '', 'http://localhost').searchParams
        const demo = q.get('demo')
        const name = q.get('name')
        let target: string | null = null
        if (demo && isStem(demo)) {
          const dir = ['gallery', 'demos'].find((d) => existsSync(path.join(root, d, demo)))
          if (dir) target = path.join(root, dir, demo, 'piece.json')
        } else if (name && isStem(name)) {
          target = path.join(root, 'data', 'pieces', `${name}.json`)
        }
        if (!target) {
          res.statusCode = 400
          return res.end('bad or unknown save target')
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const json = JSON.stringify(JSON.parse(body), null, 2) + '\n' // reject non-JSON bodies
            mkdirSync(path.dirname(target!), { recursive: true })
            writeFileSync(target!, json)
            res.statusCode = 200
            res.end('ok')
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })
      })
    },
  }
}

export default defineConfig({
  // relative paths: dist/ is a portable folder — host it anywhere, any subpath
  base: './',
  plugins: [demoEntry(), savePiece()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
