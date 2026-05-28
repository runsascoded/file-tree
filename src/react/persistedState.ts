/** Persisted state — the lib's pluggable URL-state primitive.
 *
 *  Default impl is `useState` (in-memory, ephemeral). Consumers opt
 *  into URL state by passing `useUrlPersistedState` (from
 *  `@rdub/file-tree/url-state`) or their own hook to
 *  `<FileTree usePersistedState={...}>`.
 *
 *  Not threaded via React Context — sub-path bundling duplicates the
 *  Context instance (same root cause as the `instanceof NotFoundError`
 *  cross-bundle issue). The prop is drilled down to `DirListing` +
 *  renderers explicitly. */
import { useState } from 'react'

export type PersistedState = <T extends string | number>(
  key: string,
  defaultValue: T,
) => [T, (value: T) => void]

/** Default impl: ignores `key`, returns a plain `useState`. */
export const defaultUseState: PersistedState = (_key, defaultValue) => useState(defaultValue)
