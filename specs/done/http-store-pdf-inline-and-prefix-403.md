# `HttpStore` PDFs download instead of rendering; prefix denials are 500s

*(From the `$c/hccs/hbt` session, 2026-09-27; hbt's `/files` uses `HttpStore('/api/files')` over `createHandlers(R2Store(env.HBT_BUCKET, { prefixes: ['raw/', 'data/'] }))`.)*

## 1. PDF viewer + `HttpStore` → download, not render

`PdfViewer` prefers `store.getUrl(path)` for its `<iframe>`. For `HttpStore` that's `${base}/get?path=…`, and `createHandlers`' `/get` always sets `Content-Disposition: attachment; filename=…` — so Chrome downloads the PDF instead of rendering it in the iframe.

hbt works around it in its Worker (rewrites `attachment` → `inline` for `*.pdf` on `/api/files/get`; `www/worker/index.ts` `handleFiles`).

Fix options (pick one):
- `/get` accepts `?inline=1` (→ `Content-Disposition: inline; filename=…`), and `HttpStore` gains a `getInlineUrl(path)` (or `getUrl(path, { inline: true })`) that `PdfViewer` (and `MediaViewer`, for the same reason with video/audio/images) uses.
- Or: `/get` picks the disposition from `Sec-Fetch-Dest` (`iframe` / `embed` / `image` / `video` / `audio` → `inline`; `document` / empty → `attachment`). Zero API change, but relies on a request header some clients omit.

Note same-origin `<a download>` downloads regardless of disposition; `attachment` only matters cross-origin — so an HttpStore on another origin still needs the explicit variant.

## 2. Prefix-allowlist violations return 500

`R2Store`'s allow-list check throws a plain `Error`; the server's `catch` maps it to a 500:

```
GET /api/files/list?prefix=.dvc/  → 500 {"error":"list prefix \".dvc/\" not under any allowed prefix: raw/, data/"}
GET /api/files/get?path=.dvc/cache/files/md5/…  → 500
```

It should be a 4xx: throw a typed error (e.g. `class ForbiddenPathError`) from the stores' prefix check, and have `createHandlers` map it to **404** (don't confirm existence of hidden keys) or 403. Also consider not echoing the allow-list in the body.

## Tests

- `/get` on a `.pdf` with the inline variant → `Content-Disposition: inline; …`; default stays `attachment`.
- list/get outside `prefixes` → 404 (or 403), for `R2Store` and `S3Store` alike (conformance suite).

## Resolution (2026-09-27)

1. **Inline PDFs**: took the explicit option, since it also covers cross-origin `HttpStore`s. `Store.getUrl(path, opts?: GetUrlOptions)` gains `{ inline?: boolean }`; `HttpStore` appends `&inline=1`; `createHandlers`' `/get` answers `Content-Disposition: inline; filename=…` for `inline=1` and keeps `attachment` otherwise. `PdfViewer` and `MediaViewer` request `inline`; the download link doesn't. Direct-object stores (public S3/R2/GCS URLs) ignore the flag. `MultiStore` forwards it. hbt can drop its Worker's `attachment`→`inline` rewrite once it picks this up.
2. **Prefix denials**: new exported `ForbiddenPathError` (`name === 'ForbiddenPathError'`) thrown by `R2Store` and the XML stores (`S3Store`, `GcsStore`) prefix check. `createHandlers` maps it to **404**. The message names the path but no longer echoes the allow-list (`list prefix ".dvc/" not under an allowed prefix`).

Tests: `/get` disposition (default vs `inline=1`), `HttpStore.getUrl` with/without `inline`, `/list` + `/get` denials → 404 with exact bodies; store-level rejects now assert `{ name, message }` exactly (R2, S3, GCS, incl. presign paths).
