# TokenDesk — Specification

A Cloudflare-hosted single-page app where an admin pre-loads named **pools** of secrets, and any GitHub-authenticated user can claim one token per pool during admin-opened **claim windows**.

This document is the canonical handoff for the project. A future session that has only this file should be able to pick up and build. The first section is the build summary; the rest is the rationale and decision log.

---

## 1. Build summary

### 1.1 Stack
- **Frontend:** Mithril.js (loaded from CDN), single `index.html` with client-side routing, vanilla ES modules, no bundler.
- **Backend:** Cloudflare Pages Functions (TypeScript).
- **DB:** Cloudflare D1 — relational data: `users`, `pools`, `pool_tokens`, `machine_tokens`.
- **Window state:** Cloudflare KV — single key `window:open_until`.
- **Storage mode:** YOLO. No encryption at rest. Pool tokens and machine tokens are stored as cleartext strings in D1.

### 1.2 One-sentence flow
Admin creates pools, fills them with secrets. Admin opens a 3-minute claim window. Users log in with GitHub at any time; during an open window, they get auto-assigned one free token from every pool they're not yet in. The assignment is permanent. The web UI lets users see/copy their tokens; the API lets CI/scripts fetch them with a personal machine token.

### 1.3 Build order (suggested)

1. `wrangler.toml`, `package.json`, `tsconfig.json`, `schema.sql`, `.dev.vars.example`, `README.md`.
2. D1 schema + bootstrap script (`wrangler d1 execute`).
3. Auth flow: `/auth/login`, `/auth/callback`, `/auth/logout` + session cookie utilities.
4. Session middleware (`functions/_middleware.ts`) — verifies signed cookie, attaches user.
5. Admin middleware for `/api/admin/*` — checks `ADMIN_GH_USERS` env var.
6. `/api/me` — current user info.
7. Claim logic (used during `/auth/callback`): auto-claim one free token per pool if window is open.
8. `/api/tokens`, `/api/token/{pool}` — dual auth (cookie or Bearer), JSON or text/plain via `Accept` header.
9. `/api/me/machine-token` — create/rotate.
10. Admin API: `/api/admin/window` (GET/POST/DELETE), `/api/admin/pools` (GET/POST), `/api/admin/pools/{name}` (GET/POST), `/api/admin/users`, `/api/admin/assignments`.
11. SPA: `index.html` + `js/app.js` with Mithril routes for `/`, `/tokens`, `/admin`, `/admin/pools`, `/admin/users`, `/admin/assignments`.
12. SPA fallback (`functions/_routes.ts`) — rewrite non-API paths to `/index.html` for client-side routing.
13. CSS (`css/app.css`) — minimal styling.
14. Local dev setup: register a second GitHub OAuth App with callback `http://localhost:8788/auth/callback`.
15. End-to-end test: admin creates pool, opens window, user logs in, claims, copies token, hits `/api/tokens` with machine token.

---

## 2. Auth

### 2.1 GitHub OAuth
- **App type:** GitHub OAuth App (not GitHub App).
- **Scopes:** `read:user user:email`. OIDC/org scopes intentionally not requested in v1.
- **`allow_signup=true`** on the authorize URL — drive-by GitHub signups are fine.
- **No PKCE** — confidential client with client secret.
- **Two OAuth Apps:** one for production, one for `http://localhost:8788/auth/callback` (local dev). Keep `client_id` and `client_secret` in `wrangler secret` for each environment.
- **Env var `GITHUB_OAUTH_REDIRECT_BASE`** — used to build the `redirect_uri` value passed to GitHub. Defaults to `http://localhost:8788` in dev; set to the production origin in prod (e.g. `https://tokendesk.example.com`).

### 2.2 OAuth flow
1. User clicks "Login with GitHub" → `GET /auth/login`.
2. Function generates a random `state`, stores it in a short-lived cookie `td_oauth_state`.
3. Function 302s to `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=${GITHUB_OAUTH_REDIRECT_BASE}/auth/callback&scope=read:user%20user:email&state=<state>&allow_signup=true`.
4. GitHub redirects to `/auth/callback?code=...&state=...`.
5. Function verifies `state` matches cookie, deletes the state cookie, POSTs to `https://github.com/login/oauth/access_token` to exchange the code.
6. Function calls `GET https://api.github.com/user` and `GET https://api.github.com/user/emails` (if email missing from `/user`).
7. Function upserts a row in `users` (key on `gh_id`).
8. Function runs the **claim logic** (see §5).
9. Function sets the session cookie (§2.3) and 302s to `/tokens`.
10. On any error: redirect to `/?error=<message>` and show a banner on the landing page.

### 2.3 Session cookie
- **Name:** `td_session`.
- **Value:** `<user_id>.<hmac_sha256(user_id, SESSION_SECRET)>` where `hmac_sha256` is a 32-byte HMAC, base64url-encoded.
- **Attributes:** `HttpOnly; SameSite=Lax; Path=/; Secure` (omit `Secure` only when `request.url.hostname === "localhost"`).
- **Expiration:** none (yolo mode). To log everyone out, rotate `SESSION_SECRET`.
- **Logout:** client-side `Set-Cookie: td_session=; Max-Age=0; Path=/`. No server-side state to invalidate.

### 2.4 Admin identification
- Env var `ADMIN_GH_USERS` — comma-separated list of GitHub usernames (e.g. `alice,bob,carol`).
- On every authenticated request, the middleware checks if `user.gh_user` is in the list. The result is exposed as `user.is_admin` and gates `/api/admin/*` and `/admin/*` pages.
- No `is_admin` column in the database.

---

## 3. Data model (D1)

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  gh_user       TEXT    UNIQUE NOT NULL,
  gh_id         INTEGER UNIQUE NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE pools (
  id          INTEGER PRIMARY KEY,
  name        TEXT    UNIQUE NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE pool_tokens (
  id                  INTEGER PRIMARY KEY,
  pool_id             INTEGER NOT NULL REFERENCES pools(id),
  value               TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  assigned_to_user_id INTEGER REFERENCES users(id),
  assigned_at         INTEGER
);
CREATE INDEX idx_pool_tokens_pool      ON pool_tokens(pool_id);
CREATE INDEX idx_pool_tokens_assigned  ON pool_tokens(assigned_to_user_id);
CREATE INDEX idx_pool_tokens_free      ON pool_tokens(pool_id, id) WHERE assigned_to_user_id IS NULL;

CREATE TABLE machine_tokens (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER UNIQUE NOT NULL REFERENCES users(id),
  token       TEXT    UNIQUE NOT NULL,
  created_at  INTEGER NOT NULL,
  rotated_at  INTEGER
);
```

All `created_at` / `assigned_at` are unix milliseconds (`Date.now()`).

`schema.sql` is the canonical schema; apply with `wrangler d1 execute tokendesk --file=schema.sql`.

### 3.1 Notes
- **No `assignments` table** — `pool_tokens.assigned_to_user_id` is the assignment. One source of truth.
- **No audit log** — yolo mode.
- **No `is_admin` column** — derived from env var.
- **No `last_login_at`** — kept lean.
- **Pool name validation** (enforced in app code, not SQL): `^[a-z0-9][a-z0-9-]{0,31}$` — lowercase, alphanumeric + dash, 1–32 chars, no leading dash.

---

## 4. Claim window

### 4.1 Storage
- Cloudflare KV namespace, binding name `WINDOW`.
- Single key: `window:open_until`, value: unix-ms timestamp string. Absence / empty value = closed.

### 4.2 Behavior
- **Default state on first deploy:** closed. KV is empty → `open_until = null`.
- **Open:** `POST /api/admin/window { duration_seconds: <n> }` writes `WINDOW:open_until = Date.now() + n*1000`. Default in UI: 180 (3 minutes). Configurable per open.
- **Re-open:** replaces `open_until` with the new value, even if the existing window had time remaining. (No "extend" semantics in v1.)
- **Auto-close:** hard timeout — `open_until < Date.now()` → effectively closed.
- **Manual close:** `DELETE /api/admin/window` deletes the KV key.

### 4.3 Login is always open
- `/auth/login` and `/auth/callback` are not gated by the window. Any GH user can authenticate at any time.
- The window gates only the act of **claiming a new token from a pool**.

---

## 5. Claim logic

Runs as part of `/auth/callback` (after user is upserted, before the session cookie is set) AND on every subsequent login. Idempotent.

```
for each pool p in pools:
  if user has no token in p:
    UPDATE pool_tokens
    SET assigned_to_user_id = <user_id>, assigned_at = <now>
    WHERE id = (
      SELECT id FROM pool_tokens
      WHERE pool_id = p.id AND assigned_to_user_id IS NULL
      ORDER BY id LIMIT 1
    );
    if rows_affected == 0: pool empty, skip, retry next login
```

Rules:
- Per-pool in its own transaction (D1 `db.batch()` with one statement per pool, or a `BEGIN/COMMIT` per pool). A failure in one pool does not block the others.
- If the window is closed (or `WINDOW:open_until < now`), skip the entire claim logic — the user gets the session but no new claims.
- "User has no token in p" = `SELECT 1 FROM pool_tokens WHERE pool_id = p.id AND assigned_to_user_id = <user_id> LIMIT 1` returns 0 rows.
- The race condition on the last free token is resolved atomically by the `UPDATE ... WHERE id = (SELECT ... LIMIT 1)`. Two users claiming the same token: one wins, the other gets zero rows affected and skips the pool. Safe.

---

## 6. API surface

All admin endpoints require `is_admin = true` (gated by middleware on `user.is_admin`). All other endpoints require an authenticated user (cookie or Bearer).

```
─── Auth (Pages Functions) ───
GET    /auth/login                       → 302 to GitHub OAuth URL
GET    /auth/callback                    → exchanges code, runs claim logic, sets session, 302 to /tokens
POST   /auth/logout                      → clears session cookie, 302 to /

─── User API (cookie OR Bearer auth) ───
GET    /api/me                           → { gh_user, email, avatar_url, is_admin, pools: [names] }
GET    /api/tokens                       → user's assigned tokens
                                            Accept: application/json → { "jira": "...", "openrouter": "..." }
                                            Accept: text/plain       → KEY=value lines (one per pool)
GET    /api/token/{pool}                 → single pool token, same content negotiation
POST   /api/me/machine-token             → create or rotate; returns plaintext ONCE
                                            cookie auth only (Bearer can't rotate itself)

─── Admin API (admin only) ───
GET    /api/admin/window                 → { open_until: <ms|null>, opened_by, opened_at }
POST   /api/admin/window                 → body: { duration_seconds: <n> } → opens, returns { open_until }
DELETE /api/admin/window                 → closes early
GET    /api/admin/pools                  → [ { name, total, free, assigned } ]
POST   /api/admin/pools                  → body: { name, tokens: ["v1","v2",...] } → creates pool with N tokens
GET    /api/admin/pools/{name}           → { name, total, free, assigned, tokens: [{ id, value, assigned_to }] }
POST   /api/admin/pools/{name}           → body: { tokens: ["v1","v2",...] } → adds tokens to existing pool
GET    /api/admin/users                  → [ { gh_user, email, claim_count, created_at } ]
GET    /api/admin/assignments            → [ { pool, gh_user, assigned_at } ]
```

### 6.1 Machine token
- **Format:** `td_pat_<32 hex chars>` (e.g. `td_pat_a1b2c3...` — 128 bits of entropy).
- **Storage:** cleartext in `machine_tokens.token`. Yolo mode.
- **Creation/rotation:** `POST /api/me/machine-token` (cookie auth). If a row exists for the user, replace `token` and bump `rotated_at`. If not, insert with `created_at = now`, `rotated_at = null`.
- **Response shape (success):** `{ "token": "td_pat_xxx...", "created_at": <ms>, "rotated_at": <ms|null> }`. The `token` field is the only time the plaintext is exposed.
- **One token per user** in v1.

### 6.2 `/api/tokens` and `/api/token/{pool}` content negotiation
- Default response (no `Accept` header or `Accept: */*`): JSON.
- `Accept: application/json`: JSON object `{ "poolname": "value", ... }`.
- `Accept: text/plain`: each line is `POOLNAME=value\n`. Easy to `eval` in bash.
- Auth: cookie (for SPA) OR `Authorization: Bearer <td_pat_xxx>` (for CI/scripts). Same handler.
- 404 if user has no token in the requested pool.
- 401 if neither cookie nor Bearer is present or valid.

### 6.3 Errors
- 400: validation error (bad pool name, etc.). Body: `{ "error": "<message>" }`.
- 401: unauthenticated.
- 403: authenticated but not admin (admin endpoints only).
- 404: pool not found / token not assigned to caller.
- 500: D1/KV/GitHub API failure. Body: `{ "error": "<message>" }`. Log server-side.

---

## 7. UI (SPA)

Single `index.html`, client-side routing via `m.route`. Pages Functions fallback (`functions/_routes.ts`) serves `/index.html` for any non-API, non-asset path so direct navigation and page refresh work.

### 7.1 Pages

**`/` — Landing**
- "Login with GitHub" button → `GET /auth/login`.
- Below: "Window is currently OPEN until <ts>" or "Window is currently closed."
- If `?error=<msg>` query param is present, show a banner.

**`/tokens` — My Tokens (auth required)**
- Header: "Logged in as <gh_user> <logout button>".
- Machine token section at top: "Your machine token" with "Show" / "Create" / "Rotate" buttons. When created/rotated, the plaintext is shown in a copy-able field with a "Copy" button and a warning ("This is the only time this will be shown. Save it now.").
- Pools section: list of pool names the user has a token in. Each row: pool name, "Show" button (toggle), copy button.
- If user has no tokens: "You have no tokens assigned. The claim window is currently <open|closed>. <Admin: open the window | User: check back later>."
- If user has partial claims: show their tokens, plus a "Pools with no assignment" sub-section if any pool exists with free tokens.

**`/admin` — Admin dashboard (admin only)**
- Window controls: "Open for [3] minutes" button, "Close now" button, current state with countdown.
- Summary cards: total pools, total free tokens, total assigned tokens, total users.
- Quick links: /admin/pools, /admin/users, /admin/assignments.

**`/admin/pools` — Pool management (admin only)**
- List of pools with `{name, total, free, assigned}` rows.
- "Create pool" form: name field (validates `^[a-z0-9][a-z0-9-]{0,31}$`), textarea for tokens (one per line, blank lines ignored), submit.
- For each existing pool: "Add tokens" textarea (one per line), submit. "View details" → modal/inline expansion showing all tokens (cleartext, click-to-reveal + copy).

**`/admin/users` — User list (admin only)**
- Table: `gh_user, email, claim_count, created_at`.
- Sort by `created_at` desc by default.

**`/admin/assignments` — Assignments (admin only)**
- Table: `pool, gh_user, assigned_at`.
- Sort by `assigned_at` desc by default.

### 7.2 Click-to-reveal pattern
- All secret values use the same pattern:
  - Hidden by default. The cell shows `••••••••` or `Show`.
  - Click "Show" → toggle visibility. Value stays in DOM until "Hide" or page nav.
  - Adjacent "Copy" button → copies to clipboard, briefly shows "Copied!".
- The `/tokens` page pre-loads `/api/tokens` once on mount; click-to-reveal is a CSS toggle, not a re-fetch.

### 7.3 Tech notes
- Mithril loaded from CDN: `https://unpkg.com/mithril/mithril.js` (or similar). Pin a major version in the script tag.
- `m.route(root, "/", routes)` for client-side routing.
- Fetch wrapper (`js/lib/api.js`) handles `Accept` header default + JSON parsing + 401 redirect-to-`/`.

---

## 8. Project layout

The repo root is `tokendesk/` (i.e. when you `git clone ... tokendesk`, the contents below live directly in `tokendesk/`, not under a subfolder).

```
.
├── SPEC.md                       # this file
├── README.md                     # quickstart: register OAuth App, wrangler login, etc.
├── wrangler.toml                 # CF Pages config, D1 + KV bindings, vars
├── package.json                  # devDeps: wrangler, typescript, @cloudflare/workers-types
├── tsconfig.json                 # strict, lib for workers
├── schema.sql                    # canonical D1 schema
├── .dev.vars.example             # template for local secrets (gitignored real file)
├── .gitignore
│
├── functions/                    # Pages Functions (TypeScript)
│   ├── _middleware.ts            # session verification, attaches user to context
│   ├── _routes.ts                # SPA fallback: serve /index.html for unknown non-API paths
│   ├── _lib/
│   │   ├── session.ts            # HMAC sign/verify, cookie attrs
│   │   ├── db.ts                 # D1 helper functions
│   │   ├── github.ts             # OAuth code exchange, /user, /user/emails
│   │   ├── claim.ts              # claim logic (§5)
│   │   ├── window.ts             # KV window state helpers
│   │   └── validate.ts           # pool name regex, etc.
│   ├── auth/
│   │   ├── login.ts              # GET  /auth/login
│   │   ├── callback.ts           # GET  /auth/callback
│   │   └── logout.ts             # POST /auth/logout
│   └── api/
│       ├── me.ts                 # GET  /api/me
│       ├── tokens.ts             # GET  /api/tokens
│       ├── token/
│       │   └── [pool].ts         # GET  /api/token/{pool}
│       ├── me/
│       │   └── machine-token.ts  # POST /api/me/machine-token
│       └── admin/
│           ├── _middleware.ts    # admin gate
│           ├── window.ts         # GET POST DELETE /api/admin/window
│           ├── pools.ts          # GET POST /api/admin/pools
│           ├── pools/
│           │   └── [name].ts     # GET POST /api/admin/pools/{name}
│           ├── users.ts          # GET  /api/admin/users
│           └── assignments.ts    # GET  /api/admin/assignments
│
└── public/                       # static assets, served by Pages
    ├── index.html                # SPA entrypoint
    ├── css/
    │   └── app.css
    └── js/
        ├── lib/
        │   ├── api.js            # fetch wrapper with Accept negotiation
        │   └── clipboard.js      # copy-to-clipboard helper
        ├── pages/
        │   ├── landing.js
        │   ├── tokens.js
        │   ├── admin-dashboard.js
        │   ├── admin-pools.js
        │   ├── admin-users.js
        │   └── admin-assignments.js
        └── app.js                # m.route setup, mounts
```

### 8.1 `wrangler.toml` (sketch)
```toml
name = "tokendesk"
compatibility_date = "2024-09-01"
pages_build_output_dir = "public"

[[d1_databases]]
binding = "DB"
database_name = "tokendesk"
database_id = "<set-after-wrangler-d1-create>"

[[kv_namespaces]]
binding = "WINDOW"
id = "<set-after-wrangler-kv-create>"

[vars]
GITHUB_OAUTH_REDIRECT_BASE = "http://localhost:8788"
# In prod, override to e.g. "https://tokendesk.example.com"
# ADMIN_GH_USERS, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET go via `wrangler secret put`
```

### 8.2 `.dev.vars.example`
```
GITHUB_CLIENT_ID=<from-localhost-oauth-app>
GITHUB_CLIENT_SECRET=<from-localhost-oauth-app>
SESSION_SECRET=<openssl rand -base64 32>
ADMIN_GH_USERS=your-gh-username
```

---

## 9. Security posture (yolo mode)

- No encryption at rest. Pool tokens and machine tokens are cleartext in D1.
- Open login: any GitHub user can authenticate.
- No per-pool ACL. Any authenticated user can claim from any pool.
- No audit log.
- The only gate is the time-limited claim window, default 3 minutes, admin-controlled.

If you ever want to harden:
- Add `is_admin` column or `read:org` scope.
- Add audit log table (`assignments_log`).
- Encrypt pool tokens with a key in `wrangler secret`, store ciphertext in D1.
- Hash machine tokens (the standard "store bcrypt, never recover" pattern) — at the cost of "user can never recover their machine token, only rotate."

---

## 10. Decision log (for context)

Why each major call, in case the next session questions it.

- **CF Pages + Functions over Workers alone:** the SPA lives at the same origin as the API. No CORS, no cookie-domain juggling, one CF project to deploy.
- **Mithril from CDN, no bundler:** the SPA is small. ES modules + Mithril + a fetch wrapper is enough. No build step means `wrangler pages dev` Just Works.
- **D1 + KV split:** D1 for relational joins (users, assignments, pool counts), KV for the single global "open until" timestamp. Could all be in D1, but KV is the right shape and the consistency model fits.
- **Yolo mode (cleartext storage):** explicit choice, not an oversight. The user wants speed and simplicity over at-rest security. Documented in §9.
- **Open login + no pool ACL:** the threat model is "drive-by scripts grabbing tokens" → mitigated by the time window. Pool-by-pool ACL adds UX complexity with no compensating benefit in v1.
- **One machine token per user, rotation button:** GitHub-PAT-style multi-named tokens are overkill for a single team. One token with rotation covers CI use.
- **Auto-claim on login:** consistent with "first-come-first-served, permanent." Manual claim button is friction without a real reason.
- **Login always open, window gates claiming only:** users with existing assignments shouldn't lose access to a 3-minute window that happened to close. The window is a "new user onboarding" gate, not a "team access" gate.
- **Same `/api/tokens` endpoint, dual auth (cookie + Bearer):** the endpoint answers "what are my assigned tokens." Auth method is an implementation detail. One handler, two callers.
- **Machine token storage in cleartext:** yolo mode. The standard pattern (hash, can't recover) is one wrap away if the user changes their mind.
- **Two GitHub OAuth Apps (prod + localhost):** callback URL is a single field per app. Honest dev/prod separation beats mocking or juggling.
- **No PKCE, `allow_signup=true`:** confidential client with client secret; drive-by GH signups are fine for an open tool.
- **Click-to-reveal with copy button, pre-load on page mount:** the value is already in client memory once fetched; reveal is a CSS toggle. Standard GH-PAT pattern.

---

## 11. Open / future (not in v1)

- Per-pool ACL (assign GH usernames per pool).
- Audit log of claims, token rotations, admin actions.
- Encrypted pool tokens (wrap with a `wrangler secret` key, store ciphertext).
- Hashed machine tokens.
- Scheduled windows (e.g., "open every Monday 10am for 5 min") via Cron Trigger + KV.
- Per-pool windows (different pools can have their own open/closed state).
- Multiple named machine tokens per user (GH-PAT-style).
- Token value validation per pool (e.g., "must start with `sk-or-`" for OpenRouter).
- Token expiration (admin sets TTL, token becomes invalid after N days, system can re-issue from a refresh flow).
- Org/team gate (read `read:org`, gate by `REQUIRED_ORG` env var).
- Notification on low pool (e.g., "openrouter pool has 1 free token left").
