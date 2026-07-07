# Changelog

## [Unreleased]

### Added
- `/tokens` page (`#tokens`): machine token section (create/rotate with one-time plaintext + copy + warning + meta) and pools list (pre-loaded, per-pool show/hide + copy). Empty state when user has no assignments. Topbar gets a "Tokens" link for logged-in users.
- User tokens API: `GET /api/tokens` and `GET /api/token/{pool}` (cookie auth, content-negotiated JSON or `text/plain`).
- `POST /api/me/machine-token` (create/rotate, returns plaintext once + meta) and `GET /api/me/machine-token` (meta only: `exists`, `created_at`, `rotated_at`).
- `functions/_lib/respond.ts` (`wantsTextPlain`, `jsonResponse`, `textResponse`).
- `functions/_lib/db.ts`: user-side helpers `getUserAssignedPoolNames`, `getUserAssignedTokens`, `getUserTokenForPool`, `getMachineToken`, `upsertMachineToken`.
- `/api/me` now returns `pools: [pool names]` for the current user.
- Pool admin API: `GET/POST /api/admin/pools`, `GET/POST /api/admin/pools/{name}`. Admin-only; supports pool name validation (`^[a-z0-9][a-z0-9-]{0,31}$`), duplicate-pool 409, batched token inserts.
- `functions/_lib/validate.ts` (pool name + token array validation, `ValidationError`, `jsonError`).
- Pool DB helpers in `functions/_lib/db.ts` (`getPoolByName`, `createPool`, `addPoolTokens`, `listPoolSummaries`, `getPoolDetail`).
- Admin gate middleware `functions/api/admin/_middleware.ts` (401 unauth, 403 not admin).
- Admin pool management UI at `#/admin/pools` (Mithril): list pools, create with multi-line tokens textarea, add tokens to existing pool, per-token show/hide + copy. Mithril loaded from CDN (`unpkg`); hash routing via `m.route` with a shared `Layout` (topbar + main).
- `public/js/lib/api.js` (fetch wrapper: JSON, credentials, 401 -> redirect), `public/js/lib/clipboard.js` (clipboard + `execCommand` fallback).
- Topbar with brand, admin nav, and login/logout (matches Landing behavior).
- Static welcome page at `public/index.html` with "Login with GitHub" button.
- `wrangler.toml` configured for Cloudflare Pages (`public/` as build output, no bindings).
- `package.json` with `npm run dev`, `npm run deploy`, `npm run typecheck` scripts.
- `tsconfig.json` (strict, workers-types) for `functions/`.
- `.dev.vars.example` template for local secrets.
- `README.md` with one-time CF Pages + GitHub integration steps for preview URLs on every push.
- `CHANGELOG.md` itself.
- D1 database `tokendesk` (CF account `lalyos`, id in `wrangler.toml`) with full schema: `users`, `pools`, `pool_tokens`, `machine_tokens`. Applied to both local and remote.
- `wrangler.toml` D1 binding (`DB`).
- GitHub OAuth: `GET /auth/login` (state cookie + 302), `GET /auth/callback` (state verify + code exchange + user upsert + session cookie), `POST /auth/logout` (clear session).
- Session middleware `functions/_middleware.ts` — verifies HMAC-SHA256 cookie (`<user_id>.<hmac>`) and attaches user to `context.data`.
- `GET /api/me` — returns `{ gh_user, email, avatar_url, is_admin, pools: [] }`; 401 if no session.
- Session-aware landing page (`public/index.html` + `public/js/app.js`): shows login button or "Logged in as X [Logout]" with optional `?error=` banner. Logout is a POST form to `/auth/logout`.
- README: GitHub OAuth App setup (prod + dev), `wrangler pages secret put` commands for `SESSION_SECRET` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `ADMIN_GH_USERS`, and `GITHUB_OAUTH_REDIRECT_BASE` env var override.
