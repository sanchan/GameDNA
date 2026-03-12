import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: './client',
  server: {
    port: 5173,
    proxy: {
      // Steam proxy routes (local-first mode)
      '/api/steam': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Legacy: full server API routes (for dev:legacy)
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
