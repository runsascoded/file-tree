/** The stores the edge serves, shared by the `/v1/files/*` API and the
 *  OG image route so both see the same tree. */
import type { Store } from '@rdub/file-tree'
import { R2Store, type R2PresignOptions } from '@rdub/file-tree/stores/r2'
import { MultiStore } from '@rdub/file-tree/stores/multi'
import { MockStore } from '@rdub/file-tree/stores/mock'
import { walkTreeSource } from '@rdub/file-tree/renderers/walkTreeSource'
import type { TreeSource } from '@rdub/file-tree/renderers/treeSource'
import type { Env } from './env'
import { MOUNT_SOURCES, type Mount } from './routes'

function presignFor(env: Env, bucketName: string): R2PresignOptions | undefined {
  if (!env.R2_S3_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return undefined
  const expiresIn = env.R2_PRESIGN_EXPIRES ? parseInt(env.R2_PRESIGN_EXPIRES, 10) : undefined
  return {
    endpoint: env.R2_S3_ENDPOINT,
    bucket: bucketName,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    ...(expiresIn ? { expiresIn } : {}),
  }
}

/** `MultiStore({ demo, ctbk, crashes })` over the R2 bindings — what
 *  `/http` browses. Each child bucket is scoped via `R2Store.prefixes`
 *  to the same subset the real consumer apps expose (gbfs/, avail/ for
 *  ctbk; raw/ for crashes), so this demo worker can't reveal anything
 *  its parent apps don't already serve. */
export function r2DemoStore(env: Env): Store {
  const presign = (bucket: string) => {
    const p = presignFor(env, bucket)
    return p ? { presign: p } : {}
  }
  return MultiStore({
    demo: R2Store(env.DEMO, { prefixes: [''], ...presign('file-tree-demo') }),
    ctbk: R2Store(env.CTBK, { prefixes: ['gbfs/', 'avail/'], ...presign('ctbk') }),
    crashes: R2Store(env.NJ_CRASHES, { prefixes: ['raw/'], ...presign('nj-crashes') }),
  })
}

/** What `ogCardData` resolves a mount's cards against. */
export interface CardSource {
  store: Store
  treeSource?: TreeSource
}

/** Walk cap for the live R2 tree. Each walked dir is one R2 `list`
 *  (a binding op, capped per invocation), so keep it well under that;
 *  past it `walkTreeSource` throws `TreeTooLargeError` and `ogCardData`
 *  degrades to a plain dir card. */
const R2_MAX_NODES = 500

/** The fixture `MockStore` + its walk, built once per isolate. The
 *  fixture is imported lazily: it builds a parquet file at module init,
 *  which the API path shouldn't pay for. */
let fixtureSource: Promise<CardSource> | undefined
function fixtureCardSource(): Promise<CardSource> {
  fixtureSource ??= import('../../src/fixtures/demo').then(({ DEMO_FIXTURE }) => {
    const store = MockStore(DEMO_FIXTURE, { describe: 'mock://demo-bucket' })
    return { store, treeSource: walkTreeSource(store) }
  })
  return fixtureSource
}

/** The card source for a mount, per `MOUNT_SOURCES`. */
export async function cardSource(mount: Mount, env: Env): Promise<CardSource> {
  const { kind } = MOUNT_SOURCES[mount]
  switch (kind) {
    case 'fixture':
      return fixtureCardSource()
    case 'r2': {
      const store = r2DemoStore(env)
      return {
        store: { ...store, describe: () => 'r2 · demo · ctbk · crashes' },
        treeSource: walkTreeSource(store, { maxNodes: R2_MAX_NODES }),
      }
    }
    case 'path':
      // An empty store: `ogCardData` finds no size and draws a plain card.
      return { store: MockStore({}, { describe: mount }) }
  }
}
