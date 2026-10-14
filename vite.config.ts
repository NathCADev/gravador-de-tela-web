import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/gravador-de-tela-web/',
  // O chunk do Mediabunny (~590 kB) só carrega sob demanda ao finalizar
  // um MP4, então o aviso de tamanho não se aplica ao carregamento inicial.
  build: { chunkSizeWarningLimit: 700 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Gravador de tela',
        short_name: 'Gravador',
        description: 'Grave tela, janela ou aba com áudio. Tudo no navegador.',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        background_color: '#121315',
        theme_color: '#121315',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,woff,png,svg}']
      }
    })
  ]
});
