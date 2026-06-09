import { cwd } from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), '');
  const apiTarget = (env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

  const proxyApi = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      timeout: 120_000,
      proxyTimeout: 120_000,
    },
  };

  return {
    plugins: [react()],
    server: {
      proxy: proxyApi,
    },
    preview: {
      proxy: proxyApi,
    },
  };
});
