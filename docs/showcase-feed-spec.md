# Showcase Feed Spec

This app has no backend of its own for music data. Everything it plays comes
from a single public JSON feed, `showcase.json`, published by **Roam Studio**
(a separate, proprietary desktop app for organising Ableton projects, songs and
albums). This document is the consumer-side contract for that feed.

```
Roam Studio (desktop, private)
  └─ publishes albums + MP3 renders to Cloudflare R2
       └─ https://audio.rdelune.dev/showcase.json   ← upstream feed (this spec)
            └─ scripts/fetch-tracks.mjs              ← validates + normalises at build time
                 └─ public/data/showcase.json        ← normalised data the site reads
                      └─ productions.rdelune.dev     ← this app
```

Machine-readable schema: [`showcase-feed.schema.json`](./showcase-feed.schema.json)
(JSON Schema 2020-12). It describes the **upstream** feed, not the normalised
file in `public/data/`.

## Source and overrides

| Env var | Default | Purpose |
|---|---|---|
| `SHOWCASE_SOURCE_URL` | `https://audio.rdelune.dev/showcase.json` | Upstream feed |
| `REQUIRE_PUBLIC_MP3` | on (`0` disables) | Fail the build if a published track is not a public MP3 |
| `VALIDATE_TRACK_URLS` | on locally, off on Cloudflare Pages | HEAD-check each audio URL |
| `TRUST_DETECTED_SECTION_TIMES` | off (`1` enables) | Use auto-detected section boundaries, not only manual ones |

## Top level

| Field | Type | Notes |
|---|---|---|
| `generated_at` | ISO 8601 string | When Roam Studio generated the feed |
| `total_albums` | integer | Informational only |
| `total_tracks` | integer | Informational only |
| `albums` | array of Album | Required |

## Album

| Field | Type | Notes |
|---|---|---|
| `name` | string | **Required.** Display name; may change casing or contain diacritics |
| `active` | boolean | Defaults to `true` when absent |
| `status` | string | Release status from Roam Studio (e.g. `WEBSITE`) |
| `description` | string \| null | Shown as the album blurb |
| `artist_name` | string \| null | |
| `release_date` | string \| null | Free-form (a year is common) |
| `genre`, `bpm`, `key` | string/number \| null | Optional album-level metadata |
| `artwork_url` | URL \| null | Derived from a stable slug, so renames don't break it. `.heic` is ignored |
| `artwork_key` | string | R2 object key behind `artwork_url` |
| `base_color` | hex colour | Seeds the album's palette |
| `bandcamp_url`, `apple_music_url` | URL \| null | Optional store links |
| `visual_config` | object | Optional visual hints, e.g. `default_transition_ms` |
| `tracks` | array of Track | Required |

## Track

| Field | Type | Notes |
|---|---|---|
| `id` | integer | **Required.** Stable Roam Studio song id |
| `title` | string | **Required** (falls back to "Untitled") |
| `filename` | string | Original render filename |
| `format` | string | Must be `mp3` for published tracks |
| `r2_url` | URL \| null | Public audio URL. **Required** for published tracks |
| `duration_seconds` | number \| null | |
| `is_published` | boolean | Unpublished tracks are kept but not playable |
| `section_times` | number[] | Section boundaries in seconds |
| `section_times_source` | `manual` \| `detected` \| `fallback` | Only `manual` is trusted by default |
| `bpm` | number \| null | Optional; reserved for beat-aware transitions |
| `beat_start_at` | number \| null | Seconds to the first downbeat |
| `star_rating` | integer \| null | 0–5 |
| `notes` | string | Optional |
| `visual_config`, `visual_sequence`, `visual_steps`, `technique_sequence`, `technique_steps`, `recipe_id`, `fallback_recipe_id`, `visualizer`, `debug_label` | various | Optional per-track visual overrides |

The fetch script also accepts legacy camelCase spellings (`artworkUrl`,
`isPublished`, `beatStartAt`, ...) during the snake_case transition. New fields
should be snake_case.

## Guarantees the build enforces

1. **Published audio is a public MP3.** A published track with no `r2_url`, or
   a non-MP3 format, fails the build (`Showcase audio contract failed`) unless
   `REQUIRE_PUBLIC_MP3=0`.
2. **Section times are sanitised once, at ingestion**: sorted, de-duplicated,
   at least 0.75 s apart, and kept 8 s clear of either end. If nothing
   survives, the runtime synthesises an arc and the source becomes `fallback`.
3. **Artwork URLs are stable.** Keys come from a diacritic-stripped slug, so
   renaming `Vũ` for display never breaks `album-artwork-web/vu.jpg`.
4. **Unknown fields are ignored**, so the producer can add fields without
   breaking the consumer.

## Changing the contract

- **Additive changes** (new optional fields): fine at any time. Update the
  schema and this table.
- **Breaking changes** (renames, type changes, removing a required field):
  bump a `schema_version` field (planned, see ROADMAP), and keep the consumer
  tolerant of both versions for one release.
