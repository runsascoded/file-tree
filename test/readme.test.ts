import { describe, expect, test } from 'vitest'
import { pickArchiveReadme, pickReadme, readmeFormat } from '../src/react/readme'

describe('pickReadme', () => {
  test('prefers markdown over rst, txt and bare README', () => {
    expect(pickReadme(['README', 'README.txt', 'readme.rst', 'README.md', 'a.csv'])).toBe('README.md')
    expect(pickReadme(['README', 'README.txt', 'readme.rst'])).toBe('readme.rst')
    expect(pickReadme(['README', 'Readme.TXT'])).toBe('Readme.TXT')
    expect(pickReadme(['README', 'NOTES'])).toBe('README')
  })

  test('ignores non-README names and unknown extensions', () => {
    expect(pickReadme(['README.html', 'README.md.bak', 'MYREADME.md', 'notes.md'])).toBe(null)
  })

  test('only matches files directly in `dir`', () => {
    const keys = ['a/README.md', 'a/b/README.md', 'a/b/', 'README.md']
    expect(pickReadme(keys, 'a/')).toBe('a/README.md')
    expect(pickReadme(keys, 'a/b/')).toBe('a/b/README.md')
    expect(pickReadme(keys, 'c/')).toBe(null)
    expect(pickReadme(['README/'])).toBe(null)
  })
})

describe('pickArchiveReadme', () => {
  test('root README wins', () => {
    expect(pickArchiveReadme(['README.txt', 'pkg/README.md'])).toBe('README.txt')
  })

  test('falls back to the single top-level directory', () => {
    expect(pickArchiveReadme(['bundle/', 'bundle/README.md', 'bundle/metrics.csv'])).toBe('bundle/README.md')
    expect(pickArchiveReadme(['foo-1.2.3/README', 'foo-1.2.3/src/README.md'])).toBe('foo-1.2.3/README')
  })

  test('no README when members span several top-level directories', () => {
    expect(pickArchiveReadme(['a/README.md', 'b/x.csv'])).toBe(null)
  })

  test('no README nested deeper than the wrapper directory', () => {
    expect(pickArchiveReadme(['pkg/src/README.md', 'pkg/x.csv'])).toBe(null)
  })
})

test('readmeFormat', () => {
  expect(['README.md', 'a/readme.MARKDOWN', 'README.rst', 'README.txt', 'README'].map(readmeFormat))
    .toEqual(['markdown', 'markdown', 'text', 'text', 'text'])
})
