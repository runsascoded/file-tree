/** `useUrlPersistedState` — `use-prms` bridge for
 *  `<FileTree usePersistedState={...}>`. Stringly-shaped (`?key=value`)
 *  URL persistence with omit-on-default; dispatches `string` →
 *  `defStringParam` and `number` → `intParam` based on `typeof`.
 *
 *  This is the one and only place in the lib that imports `use-prms`.
 *  Consumers who don't import this sub-path tree-shake the dep out of
 *  their bundle.
 *
 *  Usage:
 *    import { useUrlPersistedState } from '@rdub/file-tree/url-state'
 *    <FileTree usePersistedState={useUrlPersistedState} ... />
 */
import { useUrlState, defStringParam, intParam } from 'use-prms'
import type { PersistedState } from '../react/persistedState'

export type { PersistedState }

export const useUrlPersistedState: PersistedState = <T extends string | number>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] => {
  // The `as unknown as` casts bridge a `typeof`-dispatched
  // implementation to the generic `PersistedState` interface. TS can't
  // narrow `T` from a runtime `typeof` check, so the cast is
  // unavoidable. Confined here; call-site UX stays clean.
  if (typeof defaultValue === 'number') {
    return useUrlState(key, intParam(defaultValue)) as unknown as [T, (value: T) => void]
  }
  return useUrlState(key, defStringParam(defaultValue as string)) as unknown as [T, (value: T) => void]
}
