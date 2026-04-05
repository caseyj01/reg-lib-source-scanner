import { defineConfig, build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

/**
 * Plugin that builds the service worker and content script as self-contained
 * IIFE bundles (no external imports) after the main popup build completes,
 * then copies the manifest into dist/.
 */
function extensionScriptsPlugin() {
  return {
    name: 'extension-scripts',
    apply: 'build',
    async closeBundle() {
      // ── Service Worker ──────────────────────────────────────────────────
      await viteBuild({
        configFile: false,
        define: { 'process.env.NODE_ENV': '"production"' },
        build: {
          outDir: resolve(__dirname, 'dist'),
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, 'src/background/service-worker.js'),
            formats: ['iife'],
            name: 'ServiceWorker',
            fileName: () => 'service-worker.js',
          },
          rollupOptions: {
            output: { manualChunks: undefined },
          },
        },
      });

      // ── Content Script ───────────────────────────────────────────────────
      await viteBuild({
        configFile: false,
        build: {
          outDir: resolve(__dirname, 'dist'),
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, 'src/content/content-script.js'),
            formats: ['iife'],
            name: 'ContentScript',
            fileName: () => 'content-script.js',
          },
          rollupOptions: {
            output: { manualChunks: undefined },
          },
        },
      });

      // ── Manifest ─────────────────────────────────────────────────────────
      copyFileSync(
        resolve(__dirname, 'public/manifest.json'),
        resolve(__dirname, 'dist/manifest.json')
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), extensionScriptsPlugin()],
  // Use relative base so script/css paths in the popup HTML are relative,
  // which is required for chrome-extension:// page loads.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup:     resolve(__dirname, 'src/popup/index.html'),
        reporting: resolve(__dirname, 'src/reporting/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
        manualChunks: undefined,
      },
    },
  },
});
