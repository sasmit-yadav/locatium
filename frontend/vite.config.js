import { cwd, env as processEnv } from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, cwd(), '');
  const apiTarget = (env.VITE_API_URL || 'http://localhost:3002').replace(/\/+$/, '');

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
    build: {
      rolldownOptions: {
        output: {
          // Heavy libraries get their own long-cached chunks, so an app change does not
          // force visitors to re-download the map engine or the chart library.
          codeSplitting: {
            groups: [
              { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
              { name: 'echarts', test: /node_modules[\\/](echarts|zrender)/ },
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|scheduler|@tanstack|zustand|framer-motion)[\\/]/,
              },
            ],
          },
        },
      },
    },
    server: {
      proxy: proxyApi,
    },
    preview: {
      proxy: proxyApi,
    },
  };
});
