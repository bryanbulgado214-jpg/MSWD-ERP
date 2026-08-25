import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to 0.0.0.0 so client laptops on the LAN can open the app at
    // http://<server-ip>:5173. Equivalent to running `vite --host`.
    host: true,
    port: 5173,
    strictPort: true,
    // Allow the app to be reached through a tunnel hostname (e.g. a
    // *.trycloudflare.com link) for remote viewing. Without this, Vite's
    // host-check rejects the request with "Blocked request. This host ...".
    allowedHosts: true,
    // Same-origin API access: the frontend calls `/api/*` (VITE_API_BASE_URL
    // = "/api"), and Vite forwards it to the API on :3000. This lets a SINGLE
    // public tunnel to :5173 serve both the UI and the API — no second tunnel,
    // no CORS, and the remote browser never needs to reach localhost:3000.
    proxy: {
      '/api': {
        // 127.0.0.1, not localhost: on Node 18+/Windows `localhost` can resolve
        // to IPv6 ::1 while the API listens on IPv4 only → ECONNREFUSED.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    // Production (built) server, run via `vite preview` under PM2. Same shape as
    // the dev server: bind the LAN, and proxy /api → the API on :3000 so client
    // PCs only need ONE port (5173) and there is no cross-origin call from the
    // browser. VITE_API_BASE_URL stays "/api".
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
