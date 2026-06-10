import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Phase B — multi-bundle build + PWA. Replaces the previous viteSingleFile()
// pipeline so we can ship a service worker, an installable manifest, and
// camera-capture inputs that work on iOS PWAs. Hosting target: Vercel /
// Cloudflare Pages / Supabase Hosting (vercel.json already handles SPA
// rewrites for the multi-bundle output).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'BuildTrack QA',
        short_name: 'BuildTrack',
        description:
          'Automated Photo-Based Quality Assurance — drop a daily site photo, the Gantt chart updates itself.',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        categories: ['productivity', 'business', 'utilities'],
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // The Vite manifest sometimes ships large module graphs while we're
        // still in an early build; raise the cache cap so the precache
        // doesn't reject big chunks (default is 2 MiB).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Supabase Storage signed URLs — photo thumbnails the gallery
            // re-fetches every render. CacheFirst with a 7-day expiry keeps
            // the gallery fast on flaky on-site connections.
            urlPattern: /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts — the editorial typography needs Fraunces + DM
            // Sans on every page; CacheFirst makes the second visit instant.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Surface SW behaviour during `npm run dev` so we can catch caching
        // issues before they hit production. Cheap to enable.
        enabled: false,
      },
    }),
  ],
  build: {
    // Split the big, rarely-changing vendor libs into their own long-cached
    // chunks instead of letting them duplicate across per-route chunks. Smaller
    // route bundles (incl. the heavy Gantt) + far better cross-deploy caching
    // (these chunks' hashes only change when the lib upgrades). Only well-known
    // leaf libraries are pinned; everything else keeps Vite's default
    // per-route splitting.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (/(recharts|d3-|victory-vendor|internmap)/.test(id)) return 'vendor-charts';
          if (id.includes('date-fns')) return 'vendor-date';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
