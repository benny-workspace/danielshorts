import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Images ship as files rather than base64 so the OG/preview assets stay
    // cacheable and the entry chunk stays small.
    assetsInlineLimit: 2048,
  },
  server: {
    // AI Studio disables HMR via DISABLE_HMR; file watching is turned off with
    // it to avoid flicker while an agent is editing files.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch:
      process.env.DISABLE_HMR === 'true'
        ? null
        : {
            // The dev database and generated PDFs live under .data. Without
            // this, every write triggers a full page reload and interrupts
            // whatever flow is being tested.
            ignored: ['**/.data/**', '**/dist/**', '**/.git/**'],
          },
  },
});
