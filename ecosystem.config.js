/**
 * PM2 process list for the LIVE deployment (Windows server).
 *
 *   pm2 start ecosystem.config.js      # start both
 *   pm2 save                           # remember them across reboots
 *   pm2-startup install                # (once) auto-start PM2 on boot
 *   pm2 logs / pm2 status / pm2 restart all
 *
 * Two processes:
 *   aquabooks-api  — the NestJS API on :3000 (reads apps/api/.env)
 *   aquabooks-web  — the built web on :5173, which proxies /api → :3000,
 *                    so client PCs only ever use http://<server-ip>:5173
 *
 * Prereqs (see DEPLOY-LIVE.md): `npm install` at the repo root, then
 * `npm run build` in apps/api and apps/web so dist/ folders exist.
 */
module.exports = {
  apps: [
    {
      name: 'aquabooks-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'aquabooks-web',
      cwd: './apps/web',
      // vite is hoisted to the repo-root node_modules; run it with node so PM2
      // does not depend on npm.cmd shims on Windows.
      script: '../../node_modules/vite/bin/vite.js',
      args: 'preview',
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
