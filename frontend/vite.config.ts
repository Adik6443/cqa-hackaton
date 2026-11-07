import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// All /api requests go to the Spring Boot backend. No CORS problems, no extra settings in the browser.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.CQA_BACKEND || 'http://localhost:8080',
        changeOrigin: true,
        // the browser's Origin (127.0.0.1:5173 / localhost:5173) is not needed behind the proxy
        configure: (proxy) => proxy.on('proxyReq', (req) => req.removeHeader('origin')),
      },
    },
  },
});
