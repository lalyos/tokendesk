# TokenDesk

Cloudflare-hosted SPA + Pages Functions. Admins pre-load named **pools** of
secrets; any GitHub-authenticated user can claim one token per pool during
admin-opened **claim windows**. See [SPEC.md](./SPEC.md) for the full design.

This repo is being built bottom-up. Current state:

- Static welcome page: deployed
- GitHub OAuth (login / callback / logout) + session cookie: implemented
- `/api/me`: implemented
- D1 schema: applied (users, pools, pool_tokens, machine_tokens)
- Claim logic, admin API, KV window, SPA pages: **not yet**

## One-time setup

### 1. Cloudflare Pages + GitHub (preview URLs on every push)

If you haven't already:

1. Cloudflare dashboard -> **Workers & Pages** -> **Create application** ->
   **Pages** -> **Connect to Git**.
2. Select the `lalyos/tokendesk` repo. Project name: `tokendesk`.
   Production branch: `master`.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty — no bundler)*
   - Build output directory: `public`
   - Root directory: *(leave empty)*
4. Save and Deploy. The first deploy will be the current commit.

After this, every push to any branch becomes a preview URL of the form
`https://<hash>.tokendesk.pages.dev`. PRs get a comment with their own URL.
See the **Deployments** tab for the full list.

### 2. D1 database

Already done. The `tokendesk` D1 database is in the `lalyos` CF account
(id in `wrangler.toml`). Schema is applied to both local and remote.
If you ever need to re-apply:

```
wrangler d1 execute DB --file=schema.sql            # local
wrangler d1 execute DB --file=schema.sql --remote   # prod
```

### 3. GitHub OAuth Apps

GitHub OAuth Apps have a single callback URL, so you need two: one for prod,
one for local dev. Register both at
<https://github.com/settings/developers> -> **New OAuth App**.

| App            | Homepage URL                                            | Callback URL                                       |
| -------------- | ------------------------------------------------------- | -------------------------------------------------- |
| tokendesk-prod | `https://tokendesk.pages.dev`                           | `https://tokendesk.pages.dev/auth/callback`        |
| tokendesk-dev  | `http://localhost:8788`                                 | `http://localhost:8788/auth/callback`              |

> Preview URLs (per-branch `<hash>.tokendesk.pages.dev`) cannot test the auth
> flow because the OAuth App callback is fixed. Use the prod URL to test
> login; previews are useful for the static parts and the unauthenticated UI.

For each app, note the **Client ID** and generate a **Client secret**.

### 4. CF Pages secrets

Set the secrets for the prod Pages project (run from the repo root):

```
SESSION_SECRET=$(openssl rand -base64 32)
wrangler pages secret put SESSION_SECRET --project-name=tokendesk
wrangler pages secret put GITHUB_CLIENT_ID --project-name=tokendesk
wrangler pages secret put GITHUB_CLIENT_SECRET --project-name=tokendesk
wrangler pages secret put ADMIN_GH_USERS --project-name=tokendesk
```

For `ADMIN_GH_USERS`, enter a comma-separated list of GitHub usernames that
should have admin access (per SPEC §2.4), e.g. `lalyos`.

Also override the redirect base for prod. In the Pages project -> **Settings**
-> **Environment variables**, add:

| Variable                       | Value                                |
| ------------------------------ | ------------------------------------ |
| `GITHUB_OAUTH_REDIRECT_BASE`   | `https://tokendesk.pages.dev`        |

(Local dev uses the default in `wrangler.toml`: `http://localhost:8788`.)

## Local dev

```
npm install
cp .dev.vars.example .dev.vars   # fill in the dev OAuth App credentials
npm run dev                       # http://localhost:8788
```

`wrangler pages dev` reads `.dev.vars` automatically. Visit `/` and click
"Login with GitHub" — the dev OAuth App should send you through the flow
and back to `/` with "Logged in as <you>".

## Layout

```
.
├── SPEC.md
├── README.md
├── wrangler.toml
├── package.json
├── tsconfig.json
├── schema.sql
├── .dev.vars.example
├── public/                       # static assets (Pages build output)
│   ├── index.html
│   ├── css/app.css
│   └── js/app.js
└── functions/                    # Pages Functions (TypeScript)
    ├── _middleware.ts            # verifies session cookie, attaches user
    ├── _lib/
    │   ├── env.ts                # shared Env / User / PagesContextData types
    │   ├── session.ts            # HMAC sign/verify, cookie attrs
    │   ├── db.ts                 # upsertUser, getUserById
    │   └── github.ts             # exchangeCode, getUser, getPrimaryEmail
    ├── auth/
    │   ├── login.ts              # GET  /auth/login
    │   ├── callback.ts           # GET  /auth/callback
    │   └── logout.ts             # POST /auth/logout
    └── api/
        └── me.ts                 # GET  /api/me
```
