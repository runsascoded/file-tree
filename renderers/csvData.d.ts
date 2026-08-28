import { Store } from '../index.js';

declare const PAGE_BYTES: number;
declare const HEADER_PROBE_BYTES: number;
/** Minimal CSV/TSV line parser. Handles quoted fields with embedded
 *  delimiters and escaped quotes (`""` → `"`). Does NOT handle
 *  multi-line quoted fields (rare; would need a streaming parser). */
declare function parseLine(line: string, delimiter: string): string[];
/** Header + total size, from one probe read of the file's first bytes.
 *  `total` is needed for paging and comes from the store, so a store
 *  that doesn't report size can't be paged. */
declare function useCsvHeader(store: Store, path: string, delimiter: string): {
    header: string[] | null;
    total: number | null;
    error: string | null;
};
/** One page of rows, as a byte range.
 *
 *  Pages are *bytes*, not rows: the first and last lines of a range are
 *  almost certainly partial, so both are dropped. That's also why the
 *  viewer never learns a row count, and why a row index here is
 *  page-relative — nothing tells it how many rows preceded the range.
 */
declare function useCsvPage(store: Store, path: string, delimiter: string, page: number, total: number | null): {
    rows: string[][] | null;
    error: string | null;
};

export { HEADER_PROBE_BYTES, PAGE_BYTES, parseLine, useCsvHeader, useCsvPage };
