# Seerr Selection Search

A Chrome (Manifest V3) extension that lets you highlight a movie or TV show
title on any webpage, right-click, and search your own self-hosted
[Seerr](https://github.com/seerr-org/seerr) (or Jellyseerr/Overseerr-compatible)
instance for it — no copy-pasting into a browser tab required.

## Features

- **Right-click search.** Select text, choose "Search Seerr" from the context
  menu, and get results in a new tab.
- **Polished results page.** Poster art, movie/TV badge, release year,
  overview, and Seerr's own availability status (Requested / Processing /
  Available / Partially Available / Not Requested) for every result.
- **Exact matches are highlighted** so it's obvious which result corresponds
  to what you selected, without hiding the rest.
- **Click through to Seerr.** Every card links straight to that title's page
  on your Seerr instance.
- **Nothing hardcoded.** Your Seerr URL and API key live in the extension's
  own Options page, stored locally — never in source code.
- **Minimal permissions.** The extension only ever requests network access
  to the one Seerr origin you configure, not to `<all_urls>`.

## Requirements

- Google Chrome (or a Chromium-based browser) supporting Manifest V3.
- A running Seerr instance (v3.x tested) reachable from your browser at some
  `http://` or `https://` URL — including private/home-network addresses
  like `http://192.168.1.10:5055`.
- Your Seerr **API key** (Seerr web UI → **Settings → General → API Key**).
- Node.js 20+ and npm, only if you want to build from source or run tests.

## How the Seerr integration works

This was reverse-engineered against a live Seerr v3.4.1 instance before any
code was written (see [Design notes](#design-notes) below for details).

- Search uses the documented REST endpoint `GET /api/v1/search?query=...`,
  **not** the `/search?query=...` web UI route (that's the React frontend,
  not an API).
- Every request other than `/api/v1/status` requires an `X-Api-Key: <key>`
  header. Without it, Seerr returns `401 cookie 'connect.sid' required` —
  it expects either a logged-in browser session or an API key, and an API
  key is the only one of those an extension can reasonably hold.
- Seerr sends no CORS headers, so a normal web page can't read its
  responses cross-origin. This isn't a problem here because Manifest V3
  background/extension-page contexts with a granted `host_permission` for
  the target origin are exempt from CORS enforcement.
- A search result carries a `mediaInfo.status` field **only** if Seerr
  already knows about that title (requested/available/etc). Its absence
  means "not requested yet" — that's how the status pill is derived.
- A title's page on the Seerr web UI lives at `/movie/{tmdbId}` or
  `/tv/{tmdbId}`, which is enough to deep-link every result.

## Authentication

Seerr's API key is entered once in the extension's **Options** page and
stored in `chrome.storage.local` (never `chrome.storage.sync`, since it's a
credential and shouldn't leave the device via a Google account). It is never
written into source code, never logged, and never sent anywhere except to
the Seerr origin you configured.

## Installation (load unpacked, from a build)

1. Clone this repository and build it (see [Build](#build) below), or
   download a pre-built `dist/` if one was provided to you.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `dist/` folder produced by the
   build.
5. Click the extension's toolbar icon once to open **Options**, or right
   click the icon → **Options**.

## Configuration

1. Open the extension's Options page.
2. Enter your Seerr URL, e.g. `http://192.168.1.10:5055` (the scheme and
   port are required; a trailing slash is stripped automatically).
3. Enter your Seerr API key (Seerr → Settings → General → API Key).
4. Click **Test Connection** — you should see "Connected successfully."
   Chrome will prompt once for permission to contact that specific address;
   this is expected and only covers the origin you entered.
5. Click **Save**.

## Usage

1. Highlight a movie or show title on any webpage.
2. Right-click the selection.
3. Choose **Search Seerr** from the context menu.
4. Results open in a new tab, ranked with exact title matches first.
5. Click any result to open it on your Seerr instance.

## Project structure

```
src/
  manifest.json          Extension manifest (MV3)
  background/            Service worker: context menu + opening results
  lib/                   Shared logic: config/URL validation, Seerr API
                         client, response parsing, text/query handling
  options/               Options page (HTML/CSS/TS)
  results/               Results page (HTML/CSS/TS)
  icons/                 Toolbar/store icons
tests/                   Vitest unit tests
scripts/
  copy-static.mjs        Build helper: copies non-TS assets into dist/
  e2e-check.mjs          Optional manual end-to-end check (see below)
```

There is no bundler. MV3 service workers and extension pages both support
native ES modules, so `tsc` alone compiles `src/**/*.ts` into `dist/` with
working relative imports, and `copy-static.mjs` copies everything else
(HTML/CSS/icons/manifest) alongside it. `dist/` is a directly loadable
unpacked extension.

## Build

```bash
npm install
npm run build      # tsc + copy static assets -> dist/
```

`npm run watch` recompiles TypeScript on change (re-run `Load unpacked` /
click the reload icon on `chrome://extensions` to pick up changes; the copy
step from `npm run build` only needs to run again if you added/changed a
non-TS file).

## Tests

```bash
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

Unit tests cover URL validation/normalization, search-query trimming and
length limits, response parsing (including filtering out non-movie/TV
results and mapping Seerr's status codes), and the connection-test/error
paths — all with `fetch` and `chrome.storage` mocked, no network access.

### Optional: live end-to-end check

`scripts/e2e-check.mjs` is a Puppeteer script (not part of `npm test`) that
loads the **built** extension into headless Chrome and drives the real
Options and Results pages against an actual running Seerr instance. It's
how this extension's happy path, wrong-API-key path, and both error states
were verified against real data during development. It needs:

- Docker (the script was run via the `ghcr.io/puppeteer/puppeteer` image,
  so no local Chrome/Node install is required)
- A copy of `dist/` with your Seerr origin added to `host_permissions` in
  `manifest.json` (so Puppeteer isn't blocked on the native one-time
  permission prompt, which can't be automated)
- `SEERR_URL` and `SEERR_API_KEY` environment variables

It's a development aid, not a substitute for `npm test`, and isn't wired
into any CI.

## Manual testing procedure

1. `npm install && npm run build`.
2. Load `dist/` as an unpacked extension (see [Installation](#installation-load-unpacked-from-a-build)).
3. Open Options, enter your Seerr URL and API key, click **Test Connection**
   — confirm a clear success message.
4. Try an obviously wrong URL (e.g. `not a url`) — confirm a clear
   validation error, no crash.
5. Try a wrong API key — confirm **Test Connection** reports a rejected key,
   not a raw HTTP error.
6. Click **Save**.
7. On any webpage, highlight a show/movie title (e.g. "Breaking Bad").
8. Right-click the selection — confirm a **Search Seerr** item appears in
   the context menu.
9. Click it — confirm a new tab opens with a results grid: posters, type
   badges, years, overviews, and status pills.
10. Click a result — confirm it opens that title on your Seerr instance.
11. Right-click with nothing selected — confirm no crash occurs if the
    search menu item is invoked with no text (a "no text selected" message
    is shown on the results page instead of a raw error).
12. Select an extremely long passage of text and search it — confirm a
    "too long" message rather than a hung request.

## Required Chrome permissions

| Permission | Why |
|---|---|
| `contextMenus` | Add the "Search Seerr" right-click menu item |
| `storage` | Persist the configured Seerr URL and API key locally |
| `optional_host_permissions` (`http://*/*`, `https://*/*`, declared but **not granted at install**) | Lets the Options page request access to just the one origin you configure, instead of the extension asking for blanket access to every website up front |

No `activeTab`, no `tabs` content access, no `<all_urls>` at install time.

## Design notes

Before writing any code, the Seerr API was inspected directly (search
endpoint auth requirements, response shape, CORS behavior, status codes,
and web-UI route conventions) against a live instance, rather than assumed
from the `/search?query=` URL mentioned as a starting point. That research
is summarized in [How the Seerr integration works](#how-the-seerr-integration-works)
above.

## Known limitations / possible follow-ups

- Seerr's API key currently grants full account-level access (the same key
  used for third-party integrations generally) — there's no
  extension-scoped, read-only credential to hand out instead. Treat it like
  any other API key.
- The context menu label is static ("Search Seerr") rather than including
  the selected text (e.g. `Search Seerr for "Interstellar"`). Chrome's
  `contextMenus` API has no supported way to relabel an item with live
  selection text before it renders — the only workaround is a content
  script injected into every page just to keep the label in sync, which
  would require broad host permissions this project deliberately avoids.
  The full selected text is still used as the actual search query.
- Published on the Chrome Web Store; every push to `master` that touches
  the extension source builds, packages, and publishes a new version
  automatically (see `.github/workflows/publish-extension.yml`). This
  only takes effect if `version` in `src/manifest.json` has been bumped —
  the Chrome Web Store rejects uploads that don't increase the version.
- Settings are intentionally minimal (URL + API key) but structured so
  additional options (result count, "open top result automatically", etc.)
  can be added to `SeerrConfig` and the Options form without a redesign.
- No pagination beyond a simple "Load more results" button (fetches Seerr's
  next results page on demand rather than prefetching everything).

## License

Private project — no license granted for reuse.
