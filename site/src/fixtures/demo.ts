/** Demo fixture for MockStore. Designed to look like a realistic
 *  data-bucket layout — same shape consumers (ctbk, crashes) browse
 *  in production. */
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
  'logs/2026-01-01.log': '[INFO] System started\n[DEBUG] Connected to db\n',
  'logs/2026-01-02.log': '[INFO] Processing batch 1\n[INFO] Processing batch 2\n',
  'config.json': '{\n  "version": "0.0.1",\n  "demo": true\n}\n',
  'config.yaml': 'version: 0.0.1\ndemo: true\nsources:\n  - mock\n  - http\n',
}
