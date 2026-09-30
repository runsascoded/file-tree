#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["pyarrow"]
# ///
"""Write the zstd / snappy parquet fixtures for `test/parquet-compressors.test.ts`.

Same 3-row table in both codecs, 2 rows per row group, so the per-group
read path (`useRowGroup`) runs alongside the whole-file one (`useAllRows`).
"""
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

here = Path(__file__).parent
t = pa.table({
    'path': ['.', 'a', 'a/b'],
    'size': pa.array([3, 2, 1], pa.int64()),
    'kind': ['dir', 'dir', 'file'],
})
pq.write_table(t, here / 'sample-zstd.parquet', compression='zstd', compression_level=3, row_group_size=2)
pq.write_table(t, here / 'sample-snappy.parquet', compression='snappy', row_group_size=2)
