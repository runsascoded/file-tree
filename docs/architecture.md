# Architecture

Design notes and what is next.

## Architectural notes

- `Store.list` returns directory entries with `isDir: true` (via the store's native delimiter) so the UI doesn't have to infer dirs from `key.endsWith('/')`.
- `Store.get` returns raw bytes; the UI decodes. New file kinds land via `parsePath`'s `Parsed` union + a `<…Renderer>` slot — no Store changes needed.
- The `prefixes` allow-list on `R2Store` / `S3Store` is a security boundary: same bucket may host browseable data (`raw/`) and private internals (`cells/`, `_internal/`); store rejects out-of-scope `list`/`get`.
- `NotFoundError` is detected via `e instanceof Error && e.name === 'NotFoundError'` (subpath bundles each carry their own copy, so `instanceof` cross-bundle is unreliable).
- The conformance harness (`@rdub/file-tree/test/conformance`) is the contract: new `Store` impls add a one-line vitest invocation and get coverage for free.

See [`specs/handoff.md`](https://github.com/runsascoded/file-tree/blob/main/specs/handoff.md) for full status + roadmap, and [`site/worker/README.md`](https://github.com/runsascoded/file-tree/blob/main/site/worker/README.md) for the demo worker setup runbook (R2 presign).

[disk-tree]: https://github.com/runsascoded/disky

## Roadmap

| Backend | Server-side | Browser-direct |
|---|---|---|
| R2 | ✅ (CFW binding + S3 API) | ✅ (via S3Store + R2 S3-compat creds) |
| S3 | ✅ (any runtime) | ✅ (pasted creds) |
| GitHub | TBD | TBD (`raw.githubusercontent.com` + REST tree) |
| GitLab | TBD | TBD |
| local FS | TBD (via [`disk-tree`][disk-tree]) | n/a |

Other open items: `<StoreAuthForm>` for credential-paste UX, manifest-based static `Store`, cross-browser e2e (currently chromium only).
