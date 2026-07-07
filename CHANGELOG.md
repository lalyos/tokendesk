# Changelog

## [Unreleased]

### Added
- Static welcome page at `public/index.html` with "Login with GitHub" button (no backend yet).
- `wrangler.toml` configured for Cloudflare Pages (`public/` as build output, no bindings).
- `package.json` with `npm run dev`, `npm run deploy`, `npm run typecheck` scripts.
- `tsconfig.json` (strict, workers-types) ready for the future `functions/` directory.
- `.dev.vars.example` template for local secrets.
- `README.md` with one-time CF Pages + GitHub integration steps for preview URLs on every push.
- `CHANGELOG.md` itself.
