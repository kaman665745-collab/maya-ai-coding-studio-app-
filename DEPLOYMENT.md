# Deployment Guide — Web, Desktop (Tauri 2), & Android (Capacitor)

## Web (Node.js / Cloud Run / Docker)

1. Build frontend assets:
   ```bash
   npm run build
   ```
2. Provision PostgreSQL and run migrations (`npx drizzle-kit push`).
3. Set `NODE_ENV=production`, `PORT=3000`, `GEMINI_API_KEY`, and `SQL_*` environment variables on the host.
4. Start the unified Fastify server:
   ```bash
   npm start
   ```

> **Note on Sandbox Isolation**: For multi-tenant production deployments beyond single-tenant development, configure the sandbox runner (`src/server/services/sandboxRunner.ts`) to dispatch builds/tests to an isolated container runtime (e.g., Firecracker microVM / gVisor worker) rather than local `os.tmpdir()` child processes.

## Desktop (Tauri 2)

`src-tauri/tauri.conf.json` configures Tauri 2 to wrap `dist/` in production and connect to `http://localhost:3000` during development.

```bash
npm install -D @tauri-apps/cli
npx tauri init   # if scaffolding Rust crate src-tauri/src for the first time
npx tauri build
```

## Android (Capacitor)

`capacitor.config.ts` targets `io.acs.studio` with `webDir: "dist"` and HTTPS scheme enforcement.

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Set `VITE_API_BASE_URL` when packaging Desktop/Android binaries so API calls route to your deployed ACS backend URL.
