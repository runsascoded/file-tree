/** Demo fixture for MockStore. Designed to look like a realistic
 *  data-bucket layout — same shape consumers (ctbk, crashes) browse
 *  in production. */
import { EVENTS_PARQUET } from './parquet'

export const DEMO_FIXTURE = {
  'README.md': '# @rdub/file-tree demo\n\nThis is a `MockStore`-backed file browser. ' +
    'Everything you see is in-memory, defined in `site/src/fixtures/demo.ts`.\n\n' +
    'Click around to navigate, use the filter to narrow listings, and try opening ' +
    'a text file to see the `<TextViewer>` in action.\n',
  'docs/intro.md': '# Introduction\n\nfile-tree exposes a minimal `Store` interface ' +
    'and a React `<FileTree>` component that adapts to any implementation.\n',
  'docs/guide/setup.md': '# Setup\n\nInstall + plug in a Store. See README for full snippet.\n',
  'docs/guide/usage.md': '# Usage\n\nCommon patterns and tips for typical layouts.\n',
  'data/2024/q1.csv': 'date,value\n2024-01-01,100\n2024-02-01,150\n2024-03-01,200\n',
  'data/2024/q2.csv': 'date,value\n2024-04-01,180\n2024-05-01,220\n2024-06-01,260\n',
  'data/2025/q1.csv': 'date,value\n2025-01-01,300\n2025-02-01,330\n2025-03-01,360\n',
  'data/2025/q2.csv': 'date,value\n2025-04-01,400\n2025-05-01,440\n',
  // FK-link targets: `MockDemo`'s parquet `renderCell` turns the
  // `region` column into links to these, so a cell click navigates to
  // another file in the same tree.
  'docs/regions/nyc.md': '# NYC\n\nNew York City. Timezone `America/New_York`; ' +
    'the `events.parquet` rows tagged `nyc` land here.\n',
  'docs/regions/sfo.md': '# SFO\n\nSan Francisco. Timezone `America/Los_Angeles`.\n',
  'docs/regions/lax.md': '# LAX\n\nLos Angeles. Timezone `America/Los_Angeles`.\n',
  'logs/2026-01-01.log': '[INFO] System started\n[DEBUG] Connected to db\n',
  'logs/2026-01-02.log': '[INFO] Processing batch 1\n[INFO] Processing batch 2\n',
  // Deliberately 4 levels deep (root → server → tls → ciphers): the JSON
  // viewer's `initialOpenDepth` and expand-all behavior are only
  // meaningfully exercised by nesting.
  'config.json': JSON.stringify({
    version: '0.0.1',
    demo: true,
    server: {
      host: 'localhost',
      tls: { enabled: false, ciphers: ['aes', 'chacha'] },
    },
  }, null, 2) + '\n',
  // Exercises what YAML has that JSON doesn't: comments, anchors and
  // aliases, block scalars, and native dates. The comments are the
  // interesting ones — `yaml.parse()` drops them, since they aren't in
  // the data model, so a tree of parsed values loses them silently
  // unless the renderer goes out of its way.
  'config.yaml': [
    '# Demo config — the tree viewer parses this, so YAML gets the same',
    '# collapsible nodes, search, depth controls and jq as JSON.',
    'version: 0.0.1   # inline comments attach to the line above them',
    'demo: true',
    '',
    '# Anchors let a block be named once and reused. `defaults` is the',
    '# anchor; the two servers below alias it.',
    'defaults: &defaults',
    '  retries: 3',
    '  timeout: 30',
    '',
    'servers:',
    '  - <<: *defaults',
    '    name: mock',
    '  - <<: *defaults',
    '    name: http',
    '    timeout: 60   # overrides the alias',
    '',
    '# Block scalars keep newlines (|) or fold them (>).',
    'notes: |',
    '  A literal block.',
    '  Newlines are preserved.',
    '',
    'released: 2026-04-25   # a native date, not a string',
    'sources:',
    '  - mock',
    '  - http',
    '',
  ].join('\n'),
  // Exercises the parquet viewer's timestamp inference — see
  // `./parquet.ts` for what each column is meant to prove.
  'samples/events.parquet': EVENTS_PARQUET,
  // Same bytes, second extension: `MockDemo` registers `.pqt` with
  // `fullLoadMaxBytes: 0` so the streaming half of small-table mode —
  // row-group pruning from footer statistics — is demoed on real data
  // rather than only unit-tested.
  'samples/events.pqt': EVENTS_PARQUET,
}
