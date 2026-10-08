# Tree sources

Live: [Snapshots](https://file-tree.rbw.sh/snapshots) (history and diffs) and the [MockStore demo](https://file-tree.rbw.sh/mock) (walked sizes and the treemap).

A `TreeSource` answers what a `Store` can't: a directory's recursive size, over time, diffable. Pass one as `<FileTree treeSource>` and dir rows show rolled-up sizes instead of `—`; add `treemapRenderer={TreeMapView}` (`@rdub/file-tree/renderers/treemap`, peer `@rdub/treemap`) for a list / map / split toggle. Four impls:

| Source | Reads | `history` / `diff` / `scan` |
|---|---|---|
| `walkTreeSource(store)` | Recursively `list()`s any `Store`, rolls up in JS (capped by `maxNodes`) | – / – / – |
| `snapshotTreeSource({ store, path })` | A [disk-tree] snapshot library (`disk-tree snapshots DEST`: `snapshots.json` + `snapshots/<id>/tree.parquet`) through any `Store`; row-group stats prune each level read (peer: `hyparquet`) | ✓ / ✓ (any pair, derived) / – |
| `diskTreeTreeSource({ baseUrl, uri })` | A live disk-tree server's existing Flask API | ✓ / ✓ / ✓ |
| `httpTreeSource({ baseUrl })` | `createTreeHandlers(source)` (`@rdub/file-tree/server/tree`), serving any of the above | as declared |

```ts
import { snapshotTreeSource } from '@rdub/file-tree/renderers/snapshotTreeSource'

// A bucket holding `scans/snapshots.json` + `scans/snapshots/<id>/tree.parquet`:
const treeSource = snapshotTreeSource({ store, path: 'scans' })   // newest scan; `snapshot: '<id>'` pins one
```

New sources opt into `runTreeSourceConformance` (`@rdub/file-tree/test/treeConformance`). See [`specs/tree-sources-and-treemap.md`](https://github.com/runsascoded/file-tree/blob/main/specs/tree-sources-and-treemap.md).

[disk-tree]: https://github.com/runsascoded/disky
