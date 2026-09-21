import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // @kp/ui takes React as a peer, and Vite's optimizer can hand it a second
    // copy — which surfaces as "Invalid hook call" with nothing obviously
    // wrong in the component that throws.
    dedupe: ['react', 'react-dom'],
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    /*
     * @kp/ui is a linked workspace package, so Vite treats it as source and
     * does NOT pre-bundle it — but it *does* pre-bundle the app's own React.
     * Its imports then resolve to the raw copy in node_modules while the app
     * uses the optimized one, and two module instances of React is "Invalid
     * hook call" with nothing wrong in the component that throws.
     *
     * The `a > b` form is Vite's way of naming a nested dependency of a linked
     * package so it lands in the same pre-bundle.
     */
    include: ['react', 'react-dom', 'react/jsx-runtime', '@kp/ui > @base-ui/react'],
  },
  server: {
    port: 3001,
    proxy: {
      // BaniDB caches its allow-origin header across ports, so a direct call
      // from :3000 gets a response cached for another origin and is blocked.
      // Same-origin in dev sidesteps it — the Nuxt app solved this the same way.
      '/banidb': {
        target: 'https://api.banidb.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/banidb/, '/v2'),
      },
    },
  },
});
