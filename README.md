# rdelune-productions

Standalone Roam Productions listening/PWA app for Cloudflare Pages, live at
[productions.rdelune.dev](https://productions.rdelune.dev/). It plays my
published albums with audio-reactive, section-aware generative visuals
(Three.js / WebGL), and installs as a PWA.

Built with Next.js 15 (static export), React 19, TypeScript, Three.js and
Tailwind, with Cloudflare Pages Functions and D1 for lightweight analytics.

## How it fits

```
Roam Studio (my desktop app for Ableton projects, private)
  -> publishes albums + MP3 renders to Cloudflare R2
  -> https://audio.rdelune.dev/showcase.json
  -> scripts/fetch-tracks.mjs (validates + normalises at build time)
  -> this app
```

The feed format is documented in [docs/showcase-feed-spec.md](docs/showcase-feed-spec.md)
with a JSON Schema alongside it. Planned work is in [ROADMAP.md](ROADMAP.md).

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

## License

The **code** in this repository is released under the [MIT License](LICENSE).

The **music, audio, album artwork and album/track metadata** served through
the showcase feed are not part of the code and are **not** covered by the MIT
License. All rights reserved.
