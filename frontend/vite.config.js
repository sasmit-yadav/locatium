import { cwd, env as processEnv } from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, cwd(), '');
  const apiTarget = (env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

  if (
    command === 'build' &&
    processEnv.VERCEL &&
    (!env.VITE_API_URL || !/^https:\/\//i.test(apiTarget))
  ) {
    throw new Error('Vercel build requires an HTTPS VITE_API_URL');
  }

  const proxyApi = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      // Full-district scans (e.g. Gurugram ~1500 sites) can exceed 2 minutes on cold cache.
      timeout: 600_000,
      proxyTimeout: 600_000,
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
