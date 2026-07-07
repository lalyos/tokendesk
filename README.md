# TokenDesk

Cloudflare-hosted SPA + Pages Functions. Admins pre-load named **pools** of
secrets; any GitHub-authenticated user can claim one token per pool during
admin-opened **claim windows**. See [SPEC.md](./SPEC.md) for the full design.

This repo is being built bottom-up. The first cut is just a static welcome
page so that preview deploys work on every push. Backend (auth, claim logic,
admin API, D1, KV) is added incrementally per SPEC §1.3.

## Status

- Static welcome page: deployed
- `/auth/login`, `/auth/callback`, `/api/*`, D1 schema, KV window: **not yet**

## One-time setup (Cloudflare dashboard)

To get a preview URL on every push, connect this repo to Cloudflare Pages:

1. Cloudflare dashboard -> **Workers & Pages** -> **Create application** ->
   **Pages** -> **Connect to Git**.
2. Select the `lalyos/tokendesk` repo.
3. Project name: `tokendesk`. Production branch: `master`.
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty — no bundler)*
   - Build output directory: `public`
   - Root directory: *(leave empty)*
5. Save and Deploy. The first deploy will be the current commit.

After this, every push to any branch becomes a preview URL of the form
`https://<hash>.<project-name>.pages.dev`, and every PR gets a comment with
its own URL. See the **Deployments** tab in the Pages project for the full
list.

To deploy a single branch without going through Git, use
`npm run deploy` (requires `wrangler login` first).

## Local dev

```
npm install
cp .dev.vars.example .dev.vars   # fill in values
npm run dev                       # http://localhost:8788
```

The local GitHub OAuth App callback URL must be
`http://localhost:8788/auth/callback` (see SPEC §2.1).

## Layout

```
.
├── SPEC.md
├── README.md
├── wrangler.toml
├── package.json
├── tsconfig.json
├── .dev.vars.example
├── public/                 # static assets (Pages build output)
│   ├── index.html
│   └── css/app.css
└── functions/              # Pages Functions (added later)
```
