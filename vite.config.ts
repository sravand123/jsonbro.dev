import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

const require = createRequire(import.meta.url)

/**
 * Directories the dev server is allowed to read from.
 *
 * This project's .npmrc points pnpm's virtual store at /tmp, which is outside the
 * project root — so Vite refused to serve Monaco's codicon.ttf ("outside of Vite
 * serving allow list") and every editor glyph rendered as a tofu box in dev.
 * Resolving the real paths keeps this correct wherever the store happens to live,
 * including the default in-project layout.
 */
function serveAllowList(): string[] {
  const allowed = new Set<string>([path.resolve(__dirname)])

  try {
    allowed.add(fs.realpathSync(path.resolve(__dirname)))
  } catch {
    // Root always resolves; ignore.
  }

  try {
    const monacoDir = fs.realpathSync(path.dirname(require.resolve('monaco-editor/package.json')))
    allowed.add(monacoDir)

    // Grant the whole virtual store, so any dependency that ships fonts or other
    // static assets is served rather than silently 403ing.
    const marker = `${path.sep}.pnpm${path.sep}`
    const index = monacoDir.indexOf(marker)
    if (index !== -1) allowed.add(monacoDir.slice(0, index + marker.length - 1))
  } catch {
    // monaco-editor not installed yet (fresh clone); nothing to add.
  }

  return [...allowed]
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Debug attributes are useful while developing and were previously shipped
    // to production because CI never set BUILD_MODE=prod. Tie them to `vite dev`.
    sourceIdentifierPlugin({
      enabled: command === 'serve',
      attributePrefix: 'data-matrix',
      includeProps: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: { allow: serveAllowList() },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Monaco is intentionally *not* pinned to a manual chunk: forcing it into
        // a named chunk makes Rollup hoist it into the entry's static imports,
        // which defeats the lazy import of the editor components.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/'))
            return 'react'
          if (
            id.includes('node_modules/jsonrepair') ||
            id.includes('node_modules/papaparse') ||
            id.includes('node_modules/jsonc-parser')
          )
            return 'parsers'
          if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/cmdk'))
            return 'ui'
          return undefined
        },
      },
    },
  },
}))
