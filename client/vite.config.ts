import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the Vite server proxies /api to the Express backend on :3001.
// In production, Express serves the built client from client/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
});
