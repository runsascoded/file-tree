import { TreeSource } from '../renderers/treeSource.js';

interface TreeConformanceOptions {
    /** Label the source gives the root node. Default `'root'`. */
    rootLabel?: string;
}
declare function runTreeSourceConformance(makeSource: () => TreeSource | Promise<TreeSource>, opts?: TreeConformanceOptions): void;

export { type TreeConformanceOptions, runTreeSourceConformance };
