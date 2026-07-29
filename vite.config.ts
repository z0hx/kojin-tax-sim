import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE ?? '/kojin-tax-sim/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // 自動更新でなく明示的に更新を促す(NFR-14)
      manifest: {
        name: '個人税額・ふるさと納税シミュレータ',
        short_name: 'TaxSim',
        lang: 'ja',
        start_url: base, // サブパスを含める(NFR-11)
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f2937',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        runtimeCaching: [
          {
            // 税制パラメータはNetworkFirstにし、古い版の固着を防ぐ(R-10)
            urlPattern: /taxParams\/.*\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'tax-params', expiration: { maxAgeSeconds: 60 * 60 * 24 } },
          },
        ],
        // Webフォントは読み込まない(theme.cssはOS標準フォントのみを指定する)ため、
        // fonts.googleapis.com / fonts.gstatic.com のruntimeCachingは持たない。
        // 外部への通信が一切発生しない状態を保つ(NFR-01・要件定義書§7.1)
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/persistence/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/persistence/**', 'src/store/**', 'src/ui/**'],
    },
  },
});
