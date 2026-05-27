import * as react_jsx_runtime from 'react/jsx-runtime';
import { Store } from '../index.js';

declare function CsvViewer({ store, path, delimiter }: {
    store: Store;
    path: string;
    delimiter: string;
}): react_jsx_runtime.JSX.Element;

export { CsvViewer };
