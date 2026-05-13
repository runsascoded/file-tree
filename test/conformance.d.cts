import { Store } from '../index.cjs';

/** Canonical fixture every Store impl should be able to expose. Keys
 *  chosen to exercise: dir grouping, multi-level nesting, file content
 *  variety (text + bytes), and a CSS-special character in a key (this
 *  bit Plotly recently — relevant cousin). */
declare const CONFORMANCE_FIXTURE: Record<string, string | Uint8Array>;
interface ConformanceOptions {
    /** Skip range-read tests for stores that don't support them. */
    skipRange?: boolean;
    /** Skip cursor tests for stores that page differently than expected. */
    skipPagination?: boolean;
}
/** Mount the conformance suite. Inputs:
 *
 *  @param makeStore Factory. Each test call gets a fresh store seeded
 *      from `CONFORMANCE_FIXTURE`. For real-backend impls, the factory
 *      is responsible for seeding (and may want to skip / share setup
 *      across tests for cost).
 *  @param opts Capability skips.
 */
declare function runStoreConformance(makeStore: () => Promise<Store> | Store, opts?: ConformanceOptions): void;

export { CONFORMANCE_FIXTURE, type ConformanceOptions, runStoreConformance };
