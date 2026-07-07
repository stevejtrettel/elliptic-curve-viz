import { defineConfig, type Plugin } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
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
 * Save round-trip for the `pieces` demo: POST /api/save-piece?name=<stem>
 * writes the request body to data/pieces/<stem>.json. DEV ONLY (configureServer
 * runs only under `vite` serve) — the production build ships no such route, so a
 * hosted gallery is read-only. `name` is whitelisted to a bare file stem so the
 * write can never escape data/pieces/.
 */
function savePiece(): Plugin {
  const dir = fileURLToPath(new URL('./data/pieces', import.meta.url))
  return {
    name: 'save-piece',
    configureServer(server) {
      server.middlewares.use('/api/save-piece', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end('POST only')
        }
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? ''
        if (!/^[a-z0-9._-]+$/i.test(name)) {
          res.statusCode = 400
          return res.end('bad piece name')
        }
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          try {
            const json = JSON.stringify(JSON.parse(body), null, 2) + '\n' // reject non-JSON bodies
            mkdirSync(dir, { recursive: true })
            writeFileSync(path.join(dir, `${name}.json`), json)
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
