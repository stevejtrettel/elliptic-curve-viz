import { defineConfig, type Plugin } from 'vite'
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

export default defineConfig({
  // relative paths: dist/ is a portable folder — host it anywhere, any subpath
  base: './',
  plugins: [demoEntry()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
