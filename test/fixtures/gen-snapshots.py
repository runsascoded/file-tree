#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["click", "pandas", "pyarrow"]
# ///
"""Publish a two-scan disk-tree snapshot library into `test/fixtures/snapshots/`,
for `snapshotTreeSource`'s tests.

Runs disk-tree's *actual* pipeline (`disk-tree import` a bucket listing, twice,
then `disk-tree snapshots -a`), so the fixture carries disk-tree's real
published layout and row schema rather than a hand-written imitation. Needs a
`disk-tree` executable (`-b`, default `disk-tree` on `PATH`, e.g.
`~/c/disky/.venv/bin/disk-tree`); scans go to a throwaway `DISK_TREE_ROOT`.

The *newer* scan is exactly `CONFORMANCE_FIXTURE` (`src/test/conformance.ts`),
so the default (newest) snapshot passes the tree conformance harness. The
older scan differs by one of each diff status: `old/gone.txt` removed,
`data/2025/` added, `docs/intro.md` changed (size), `README.md` touched
(mtime only).

Also writes `test/fixtures/snapshots-rg3/`: the same library with each tree
rewritten in 3-row groups, to exercise row-group pruning.
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
from click import command, option

HERE = Path(__file__).parent
BUCKET = 'fixture'

T_OLD = dt.datetime(2026, 7, 1, tzinfo=dt.timezone.utc)
T_NEW = dt.datetime(2026, 8, 1, tzinfo=dt.timezone.utc)
MTIME_OLD = dt.datetime(2026, 6, 1, tzinfo=dt.timezone.utc)
MTIME_NEW = dt.datetime(2026, 7, 15, tzinfo=dt.timezone.utc)

# Byte sizes of `CONFORMANCE_FIXTURE`'s values.
NEW = {
    'README.md': len('# fixture\n\nTop-level readme.\n'),
    'docs/intro.md': len('introduction'),
    'docs/guide/setup.md': len('setup steps'),
    'docs/guide/usage.md': len('usage notes'),
    'data/2024/q1.csv': len('a,b\n1,2\n'),
    'data/2024/q2.csv': len('a,b\n3,4\n'),
    'data/2025/q1.csv': len('a,b\n5,6\n'),
    'binary.bin': 256,
}
OLD = {
    **{k: v for k, v in NEW.items() if not k.startswith('data/2025/')},
    'docs/intro.md': 5,
    'old/gone.txt': 40,
}
# Files whose mtime moved between scans (everything else keeps MTIME_OLD).
NEW_MTIMES = {'README.md', 'docs/intro.md', 'data/2025/q1.csv'}


def listing(files: dict[str, int], new: bool) -> pd.DataFrame:
    return pd.DataFrame([
        {
            'bucket': BUCKET,
            'name': name,
            'size_bytes': size,
            'created': MTIME_NEW if new and name in NEW_MTIMES else MTIME_OLD,
            'storage_class_id': 1,
        }
        for name, size in files.items()
    ])


@command()
@option('-b', '--bin', 'dt_bin', default='disk-tree', help='`disk-tree` executable')
def main(dt_bin: str):
    out = HERE / 'snapshots'
    with tempfile.TemporaryDirectory(dir=HERE) as tmp:
        tmp = Path(tmp)
        env = {**os.environ, 'DISK_TREE_ROOT': str(tmp / 'root')}
        (tmp / 'root').mkdir()

        def run(*args: str):
            subprocess.run([dt_bin, *args], env=env, check=True)

        for name, files, t, new in [('old', OLD, T_OLD, False), ('new', NEW, T_NEW, True)]:
            path = tmp / f'{name}.parquet'
            listing(files, new).to_parquet(path)
            run('import', '-m', '-l', str(path), '-b', BUCKET, '-t', t.isoformat())
        if out.exists():
            shutil.rmtree(out)
        run('snapshots', '-a', str(out))

    # The same library with 3-row groups, so level reads span, straddle and
    # prune row groups (disk-tree's 64K groups hold this whole fixture in one).
    small = HERE / 'snapshots-rg3'
    if small.exists():
        shutil.rmtree(small)
    shutil.copytree(out, small)
    for tree in small.glob('snapshots/*/tree.parquet'):
        pq.write_table(pq.read_table(tree), tree, row_group_size=3)

    manifest = json.loads((out / 'snapshots.json').read_text())
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
