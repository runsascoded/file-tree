import * as react_jsx_runtime from 'react/jsx-runtime';
import { P as PersistedState } from '../persistedState-CB_wfbcb.cjs';
import { JsonTreeOptions } from './json.cjs';
import 'react';

declare function parseYaml(source: string): Promise<unknown>;
/** Same options as the JSON tree (`renderValue`, `initialOpenDepth`) —
 *  minus `parse`/`label`, which this supplies. */
type YamlTreeOptions = Omit<JsonTreeOptions, 'parse' | 'label'>;
declare function makeYamlTreeRenderer(opts?: YamlTreeOptions): (source: string, usePersistedState?: PersistedState) => react_jsx_runtime.JSX.Element;
declare const renderYamlTree: (source: string, usePersistedState?: PersistedState) => react_jsx_runtime.JSX.Element;

export { type YamlTreeOptions, makeYamlTreeRenderer, parseYaml, renderYamlTree };
