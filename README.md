# rdelune-productions

Standalone Roam Productions listening/PWA app for Cloudflare Pages.

## Local development

```sh
npm ci
npm run dev
```

The build fetches the public showcase feed from `https://audio.rdelune.dev/showcase.json` unless `SHOWCASE_SOURCE_URL` is set.

## Cloudflare Pages

- Project name: `rdelune-productions`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `out`
- Custom domain: `productions.rdelune.dev`

Bindings/secrets:

- D1 binding `DB` pointing at `rdelune-analytics`
- Secret `STATS_TOKEN` for `/api/stats`

The PWA manifest and service worker are scoped to `/`, so the installed app opens directly at `https://productions.rdelune.dev/`.
