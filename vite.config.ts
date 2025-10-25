import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// vite.config.ts



export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "All India Postal Employees Union — Postman & MTS",
        short_name: "AIPEU PM&MTS",
        start_url: '/',
        display: 'standalone',
        background_color: "#ffffff",
        theme_color: "#C01622",
        icons: [
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/app-192.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MiB
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html-cache' }
          },
          {
            urlPattern: /^https:\/\/([a-z0-9-]+\.)?supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-rest' }
          },
          {
            urlPattern: /^https:\/\/([a-z0-9-]+\.)?supabase\.co\/auth\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'supabase-auth' }
          },
          {
            urlPattern: ({ request }) => ['style','script','image'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'asset-cache' }
          }
        ]
      }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: { protocol: 'ws', host: '127.0.0.1', port: 5173, clientPort: 5173 }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
})


