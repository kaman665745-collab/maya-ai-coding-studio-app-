# Setup Guide — Advanced Coding Studio (ACS)

## Prerequisites

- Node.js 22+
- PostgreSQL 15+ (or Cloud SQL via Unix socket `/app/cloudsql/<connection-name>`)
- Firebase Project with Google Authentication enabled
- Google Gemini API Key (`GEMINI_API_KEY`, server-side only)

## 1. Environment Variables

Copy `.env.example` to `.env` and populate server secrets (never commit `.env`):

- `GEMINI_API_KEY`: Used strictly inside `src/server/services/gemini.ts`.
- `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DATABASE`: PostgreSQL connection parameters used by `src/db/index.ts`.
- `APP_URL`: Public origin for preview/OAuth links.
- `FIREBASE_ADMIN_CREDENTIALS` (optional JSON string outside AI Studio runtime): Enables `firebase-admin` token verification in self-hosted environments.

Frontend Firebase configuration lives in `firebase-applet-config.json` (or `VITE_FIREBASE_*` overrides if adapted for external hosts).

## 2. Install & Migrate Database

```bash
npm install
npx drizzle-kit generate
npx drizzle-kit push
```

## 3. Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`. Sign in with Google or click **Enter Demo Workspace** (`/?demo=1`) for an isolated sandbox tenant.

## 4. Verification

```bash
npm run lint
npx --yes tsx --test src/domain/*.test.ts src/server/api.integration.test.ts
```
