import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev        -> local app, /api is proxied to the Spring Boot backend (no CORS problems)
// npm run build:d365 -> Dynamics 365 web resources in dist-d365/ (relative paths, fixed file names, hash routing)
export default defineConfig(({ mode }) => {
  const d365 = mode === 'd365';
  return {
    plugins: [react()],
    base: d365 ? './' : '/',
    build: d365
      ? {
          outDir: 'dist-d365',
          emptyOutDir: true,
          assetsDir: '',
          // one JS + one CSS with stable names: each file becomes one web resource (fcqa_/cqa/cqa.js ...)
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              entryFileNames: 'cqa.js',
              chunkFileNames: 'cqa-[name].js',
              assetFileNames: (a) => ((a.names?.[0] ?? '').endsWith('.css') ? 'cqa.css' : '[name][extname]'),
            },
          },
        }
      : undefined,
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
  };
});
