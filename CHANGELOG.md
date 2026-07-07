# Changelog

## [Unreleased]

### Fixed
- `/#/api-key` page was blank and broke the rest of the SPA: the `ExistingKeyMeta` sub-component received a `key` prop, but `key` is reserved by Mithril for keyed reconciliation and is not passed to `vnode.attrs`. So `vnode.attrs.key` was `undefined`, `if (!k.exists)` threw, and the broken mount state poisoned subsequent routes. Renamed state field and prop to `apiKey`.

### Changed
- Renamed the personal access token from "machine token" to "API key" everywhere except the DB table (`machine_tokens`, kept to avoid another migration). Endpoint: `GET/POST /api/me/api-key`. SPA: new `/#/api-key` page; `/#/tokens` now shows only the pool tokens table and is headed "Tokens". Code: `ApiKey` type, `getApiKey` / `getUserIdByApiKey` / `upsertApiKey` helpers. Topbar gets a new "API key" link.

### Fixed
- Infinite redirect loop on logout/login. The 401 handler in `lib/api.js` used to redirect to `/` for every 401, including the initial `/api/me` call on the landing page — which reloaded the page and triggered the same 401. Now we only redirect on 401 when we're on a hash route; on `/`, the SPA renders the login button when `me` is null.

### Added
- `DELETE /api/admin/pools/{name}` (admin): hard-deletes a pool and all of its tokens in one batch. 204 on success, 404 if missing, 400 on invalid name. Users with assigned tokens in the pool lose access.
- `deletePool` helper in `functions/_lib/db.ts`.
- Admin pool list: red "Delete" button on each row with a `confirm()` dialog that surfaces the count and warns if any tokens are currently assigned.

### Added
- Bearer auth on all cookie-auth endpoints: middleware tries `Authorization: Bearer <td_pat_...>` if there's no session cookie, looks up the user, and attaches them. `authMethod` is tracked on `context.data` so handlers can require cookie-only.
- Machine-token endpoints (`GET/POST /api/me/machine-token`) are cookie-only: a Bearer caller is rejected with 403 (chicken-egg: a CI/script caller can't create/rotate its own token; the UI is the only way to bootstrap).
- Admin dashboard page (`#/admin`): claim window controls (open/close with current state + `opened_by` + `opened_at`) and quick links to sub-pages.
- Topbar: "Admin" link for admins.
- Landing page: shows claim-window state and a "claimed X, Y" banner when the user just logged in and got tokens.
- `/tokens` empty state: copy reflects the current window state ("claim window is OPEN. Log out and back in..." vs "check back after an admin opens it").
- Claim window API (admin): `GET/POST/DELETE /api/admin/window`. Manual open/close (no auto-expiring timer in v1). Backed by the `window_state` table.
- Claim logic in `auth/callback.ts`: after upsert, if the window is open, run `runClaim(env, user.id)`. Idempotent and race-safe per pool via `UPDATE ... WHERE id = (SELECT ... AND NOT EXISTS(...))`.
- `functions/_lib/claim.ts` (`runClaim`).
- `functions/_lib/db.ts` window helpers: `getWindowState`, `openWindow`, `closeWindow`.
- `/api/me` now returns `window_open: boolean` so the UI can show claim-window state.
- `window_state` table (D1, single-row, `is_open` + `opened_by_user_id` + `opened_at`). Manual open/close in v1, no auto-expiring timer.
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
