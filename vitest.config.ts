import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // solver round-trips and whole-group orbit walks are compute-heavy; keep
    // headroom so a loaded machine (AV scanner, GPU sessions) doesn't flake them
    testTimeout: 30000,
  },
})
