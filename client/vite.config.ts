import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: './client',
  clearScreen: false,
  server: {
    port: 5173,
    host: process.env.TAURI_ENV_PLATFORM ? '0.0.0.0' : 'localhost',
    proxy: {
      '/api/steam': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
