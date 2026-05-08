/** Filter-string → predicate. Substring (case-insensitive) by default;
 *  if the value contains `*` or `?`, treats it as an anchored glob. */
export function makeMatcher(q: string): (s: string) => boolean {
  if (!q) return () => true
  if (!/[*?]/.test(q)) {
    const lower = q.toLowerCase()
    return (s: string) => s.toLowerCase().includes(lower)
  }
  // Anchored glob: `*` → `.*`, `?` → `.`. Other regex chars escaped.
  const pattern = q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  const re = new RegExp(`^${pattern}$`, 'i')
  return (s: string) => re.test(s)
}
