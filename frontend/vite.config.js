import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'

const require = createRequire(import.meta.url)

// MapLibre v6 tạo worker bằng new URL('./maplibre-gl-worker.mjs', import.meta.url)
// => cần file worker + shared nằm cạnh chunk trong dist/assets (Vite không tự emit).
function copyMaplibreWorkerPlugin() {
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'copy-maplibre-worker',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist', 'assets')
      const candidates = [resolve(process.cwd(), 'node_modules', 'maplibre-gl', 'dist')]
      try { candidates.push(dirname(require.resolve('maplibre-gl'))) } catch { /* ignore */ }
      let copied = 0
      for (const f of files) {
        for (const dir of candidates) {
          const src = resolve(dir, f)
          if (existsSync(src)) {
            mkdirSync(outDir, { recursive: true })
            copyFileSync(src, resolve(outDir, f))
            copied += 1
            break
          }
        }
      }
      if (copied === 0) this.warn('copy-maplibre-worker: khong tim thay file worker cua maplibre-gl')
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    copyMaplibreWorkerPlugin(),
  ],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
    include: [
      'react', 'react-dom', 'react-router-dom',
      'lucide-react',
      'leaflet', 'react-leaflet',
      'mathjs', 'xlsx', 'mammoth', 'jszip', 'file-saver',
      '@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-link',
      '@tiptap/extension-image', '@tiptap/extension-table',
      '@tiptap/extension-youtube', '@tiptap/extension-placeholder',
    ],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: ['**/public/pmtiles/**', '**/dist/**', '**/*.pmtiles']
    },
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    },
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true
      },
      '/tiles': {
        target: 'http://backend:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const p = id.replace(/\\/g, '/')
          if (p.includes('maplibre-gl')) return undefined
          if (p.includes('/node_modules/leaflet/') || p.includes('/node_modules/react-leaflet/') || p.includes('@react-leaflet')) return 'leaflet'
          if (p.includes('/node_modules/react-router') || p.includes('/node_modules/@remix-run/')) return 'react-vendor'
          if (/\/node_modules\/(react|react-dom|react-is|scheduler)\//.test(p)) return 'react-vendor'
          if (p.includes('/node_modules/mathjs/')) return 'mathjs'
          if (p.includes('/node_modules/xlsx/')) return 'xlsx'
          if (p.includes('/node_modules/mammoth/')) return 'mammoth'
          if (p.includes('/node_modules/jszip/') || p.includes('/node_modules/file-saver/')) return 'excel-io'
          if (p.includes('/node_modules/lucide-react/')) return 'icons'
          return undefined
        }
      }
    }
  }
})
