import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const serverUrl = process.env['VITE_DEV_SERVER_PROXY'] ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: true },
      '/healthz': { target: serverUrl, changeOrigin: true },
      '/socket.io': { target: serverUrl, ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4173 },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
