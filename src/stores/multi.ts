/** `MultiStore` — a virtual `Store` that splices N child stores under
 *  named top-level dirs. The first path segment routes to a child;
 *  listing the empty prefix synthesizes a directory entry per child.
 *
 * Usage:
 *   import { MultiStore } from '@rdub/file-tree/stores/multi'
 *   const store = MultiStore({
 *     ctbk: R2Store(env.CTBK, { prefixes: ['gbfs/', 'avail/'] }),
 *     crashes: R2Store(env.NJ_CRASHES, { prefixes: ['raw/'] }),
 *   })
 *
 * Listing `''` returns `[{ key: 'ctbk/', isDir: true }, { key: 'crashes/', isDir: true }]`.
 * Listing `'ctbk/'` delegates to the `ctbk` child with prefix `''`.
 * Listing `'ctbk/gbfs/'` delegates to the `ctbk` child with prefix `'gbfs/'`,
 * then re-prefixes returned keys with `ctbk/` so the UI sees a single
 * unified namespace.
 *
 * `range` capability is the AND of all children — if any child can't
 * range-read, neither can the composite.
 */
import type { Entry, GetResult, ListOptions, ListResult, Range, Store } from '../types'
import { NotFoundError } from '../types'

export type MultiStoreInput = Record<string, Store>

export function MultiStore(children: MultiStoreInput): Store {
  const names = Object.keys(children)
  for (const n of names) {
    if (n === '' || n.includes('/')) {
      throw new Error(`MultiStore: invalid child name ${JSON.stringify(n)} (must be non-empty, no '/')`)
    }
  }
  const sortedNames = [...names].sort()

  function split(path: string): { name: string; child: Store; rest: string } | null {
    const slashIdx = path.indexOf('/')
    const name = slashIdx < 0 ? path : path.slice(0, slashIdx)
    const child = children[name]
    if (!child) return null
    const rest = slashIdx < 0 ? '' : path.slice(slashIdx + 1)
    return { name, child, rest }
  }

  return {
    async list(prefix, opts: ListOptions = {}): Promise<ListResult> {
      // Virtual root: synthesize a dir per child.
      if (prefix === '' || prefix === '/') {
        return {
          entries: sortedNames.map(name => ({ key: `${name}/`, isDir: true })),
        }
      }
      const split1 = split(prefix.replace(/\/+$/, ''))
      if (!split1) {
        // Unknown child name. Match other stores' shape: empty list, no cursor.
        return { entries: [] }
      }
      const { name, child, rest } = split1
      const childPrefix = rest === '' ? '' : (rest.endsWith('/') ? rest : `${rest}/`)
      const r = await child.list(childPrefix, opts)
      const entries: Entry[] = r.entries.map(e => ({ ...e, key: `${name}/${e.key}` }))
      const out: ListResult = { entries }
      if (r.cursor) out.cursor = r.cursor
      return out
    },

    async get(path: string, range?: Range): Promise<GetResult> {
      const s = split(path)
      if (!s) throw new NotFoundError(path)
      return s.child.get(s.rest, range)
    },

    capabilities: {
      range: names.length > 0 && names.every(n => children[n].capabilities?.range === true),
    },

    // Only expose `getUrl` if *every* child can produce one — that way
    // the UI's "is download supported here?" check is a simple
    // `typeof store.getUrl === 'function'` instead of a per-path probe.
    ...(names.length > 0 && names.every(n => typeof children[n].getUrl === 'function')
      ? {
          getUrl(path: string): string {
            const s = split(path)
            if (!s) throw new Error(`MultiStore.getUrl: no child for ${JSON.stringify(path)}`)
            // Type-narrowing: the every() check above guarantees getUrl is defined.
            return s.child.getUrl!(s.rest)
          },
        }
      : {}),
  }
}
