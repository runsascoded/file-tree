/** File formats beyond the original set: tarballs, whole-file
 *  compression, JSONL tables, the hexdump fallback, and the broader text
 *  table in `parsePath`. */
import { describe, expect, it } from 'vitest'
import { parseFileKey, parsePath, tarCodec } from '../src/react/parsePath'
import { parseTar, readTar, tarEntryBytes } from '../src/react/tar'
import { decompress } from '../src/react/decompress'
import { hexdump, looksLikeText } from '../src/react/hexdump'
import { bytesStore } from '../src/react/bytesStore'
import { parseJsonl } from '../src/renderers/jsonl'
import { MockStore } from '../src/stores/mock'
import { gzipStored, tar, zstdRaw } from '../site/src/fixtures/archives'

const dec = new TextDecoder()
const enc = new TextEncoder()

describe('parsePath: new kinds', () => {
  it('classifies archives, compressed files, members and text names', () => {
    expect([
      'a/b.tar', 'b.tar.gz', 'b.tgz', 'b.tar.zst',
      'x.jsonl.gz', 'x.csv.zst', 'x.gz',
      'b.tgz!/dir/m.txt', 'b.tar!/m.parquet', 'z.zip!/m.txt',
      'Makefile', 'src/Dockerfile', 'LICENSE', 'some-dir',
      'main.go', 'lib.rs', 'pom.xml', 'x.ndjson', '.gitignore', 'blob.bin',
    ].map(k => parsePath(k))).toEqual([
      { kind: 'tar', path: 'a/b.tar' },
      { kind: 'tar', path: 'b.tar.gz', codec: 'gzip' },
      { kind: 'tar', path: 'b.tgz', codec: 'gzip' },
      { kind: 'tar', path: 'b.tar.zst', codec: 'zstd' },
      { kind: 'compressed', path: 'x.jsonl.gz', codec: 'gzip', inner: 'x.jsonl' },
      { kind: 'compressed', path: 'x.csv.zst', codec: 'zstd', inner: 'x.csv' },
      { kind: 'compressed', path: 'x.gz', codec: 'gzip', inner: 'x' },
      { kind: 'tarEntry', path: 'b.tgz', entry: 'dir/m.txt', codec: 'gzip' },
      { kind: 'tarEntry', path: 'b.tar', entry: 'm.parquet' },
      { kind: 'zipEntry', path: 'z.zip', entry: 'm.txt' },
      { kind: 'text', path: 'Makefile' },
      { kind: 'text', path: 'src/Dockerfile' },
      { kind: 'text', path: 'LICENSE' },
      { kind: 'dir', prefix: 'some-dir/' },
      { kind: 'text', path: 'main.go' },
      { kind: 'text', path: 'lib.rs' },
      { kind: 'text', path: 'pom.xml' },
      { kind: 'text', path: 'x.ndjson' },
      { kind: 'text', path: '.gitignore' },
      { kind: 'binary', path: 'blob.bin' },
    ])
  })

  it('treats an extension-less name inside a container as a file, not a dir', () => {
    expect(parseFileKey('x')).toEqual({ kind: 'binary', path: 'x' })
    expect(parseFileKey('b.tgz!/notes')).toEqual({ kind: 'binary', path: 'b.tgz!/notes' })
    expect(parseFileKey('b.tgz!/data.csv')).toEqual({ kind: 'text', path: 'b.tgz!/data.csv' })
  })

  it('tarCodec', () => {
    expect(['a.tar', 'a.tgz', 'a.tar.gz', 'a.tar.zstd', 'a.gz', 'a.zip'].map(tarCodec))
      .toEqual(['', 'gzip', 'gzip', 'zstd', null, null])
  })
})

const TAR = tar([
  { name: 'pkg/', type: '5' },
  { name: 'pkg/README.md', data: '# hi\n', mtime: 1767225600 },
  { name: 'pkg/data.csv', data: 'a,b\n1,2\n'.repeat(100), mtime: 1767312000 },
])

describe('tar', () => {
  it('parses ustar headers', () => {
    expect(parseTar(TAR).map(({ offset: _, ...e }) => e)).toEqual([
      { name: 'pkg/', size: 0, type: 'dir', lastModified: '2026-01-01T00:00:00.000Z' },
      { name: 'pkg/README.md', size: 5, type: 'file', lastModified: '2026-01-01T00:00:00.000Z' },
      { name: 'pkg/data.csv', size: 800, type: 'file', lastModified: '2026-01-02T00:00:00.000Z' },
    ])
  })

  it('reads a .tar.gz through a store, and slices members', async () => {
    const store = MockStore({ 'b.tar.gz': gzipStored(TAR) })
    const a = await readTar(store, 'b.tar.gz', 'gzip')
    expect(a.truncated).toBe(false)
    expect(a.entries.map(e => e.name)).toEqual(['pkg/', 'pkg/README.md', 'pkg/data.csv'])
    expect(dec.decode(tarEntryBytes(a, a.entries[1]))).toBe('# hi\n')
    // Cached per store + path.
    expect(await readTar(store, 'b.tar.gz', 'gzip')).toBe(a)
  })

  it('reads a .tar.zst', async () => {
    const a = await readTar(MockStore({ 'b.tar.zst': zstdRaw(TAR) }), 'b.tar.zst', 'zstd')
    expect(a.entries.map(e => [e.name, e.size])).toEqual([['pkg/', 0], ['pkg/README.md', 5], ['pkg/data.csv', 800]])
  })

  it('handles GNU long names and PAX paths', () => {
    const long = 'd/'.repeat(60) + 'f.txt'
    const pax = 'p/'.repeat(60) + 'g.txt'
    // A PAX record's length prefix counts its own digits.
    const rec = ` path=${pax}\n`
    let n = rec.length
    while (String(n).length + rec.length !== n) n = String(n).length + rec.length
    const paxBody = `${n}${rec}`
    const t = tar([
      { name: '././@LongLink', data: long + '\0' },
      { name: 'trunc', data: 'L' },
      { name: 'PaxHeader', data: paxBody },
      { name: 'trunc2', data: 'P' },
    ])
    // Retype the headers: `tar()` only writes files, so flip the flags.
    t[156] = 'L'.charCodeAt(0)
    const paxAt = 512 * 4
    t[paxAt + 156] = 'x'.charCodeAt(0)
    expect(parseTar(t).map(e => [e.name, e.size])).toEqual([[long, 1], [pax, 1]])
  })
})

describe('decompress', () => {
  const text = 'line\n'.repeat(1000)
  it('gzip, zstd', async () => {
    expect(dec.decode((await decompress(gzipStored(text), 'gzip')).bytes)).toBe(text)
    expect(dec.decode((await decompress(zstdRaw(text), 'zstd')).bytes)).toBe(text)
  })
  it('caps output and reports truncation', async () => {
    expect(await decompress(gzipStored(text), 'gzip', { max: 12 })).toEqual({ bytes: enc.encode('line\nline\nli'), truncated: true })
    expect(await decompress(zstdRaw(text), 'zstd', { max: 7 })).toEqual({ bytes: enc.encode('line\nli'), truncated: true })
  })
  it('keeps the head of a cut-short input', async () => {
    const gz = gzipStored(text)
    const r = await decompress(gz.subarray(0, 100), 'gzip', { inputTruncated: true })
    expect(r.truncated).toBe(true)
    expect(dec.decode(r.bytes)).toBe(text.slice(0, r.bytes.byteLength))
  })
})

describe('hexdump', () => {
  it('formats like hexdump -C', () => {
    expect(hexdump(enc.encode('Hello, world!\n\x00\x01ABCDEFGHIJ'))).toEqual([
      '00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 0a 00 01  |Hello, world!...|',
      '00000010  41 42 43 44 45 46 47 48  49 4a                    |ABCDEFGHIJ|',
    ])
    expect(hexdump(new Uint8Array([0xff]), 0x1000)).toEqual([
      '00001000  ff                                                |.|',
    ])
  })
  it('looksLikeText', () => {
    const euro = enc.encode('price: €5')
    expect([
      looksLikeText(enc.encode('plain\n')),
      looksLikeText(new Uint8Array([0x41, 0x00])),
      looksLikeText(new Uint8Array([0xff, 0xfe, 0x41])),
      // A head read that splits the last multi-byte char is still text.
      looksLikeText(euro.subarray(0, euro.length - 2)),
    ]).toEqual([true, false, false, true])
  })
})

describe('parseJsonl', () => {
  it('rows from records; nested values as JSON; non-objects in `value`; bad lines reported', () => {
    expect(parseJsonl([
      '{"id":1,"tags":["a","b"],"meta":{"k":null},"ok":true}',
      '',
      '{"id":2,"name":"x"}',
      'not json',
      '42',
      '["arr"]',
    ].join('\n'))).toEqual({
      rows: [
        { id: 1, tags: '["a","b"]', meta: '{"k":null}', ok: true },
        { id: 2, name: 'x' },
        { value: 42 },
        { value: '["arr"]' },
      ],
      errors: [{ line: 4, message: expect.stringMatching(/JSON/) }],
      truncated: false,
    })
  })
  it('stops at maxRows', () => {
    expect(parseJsonl('{"a":1}\n{"a":2}\n{"a":3}\n', { maxRows: 2 })).toEqual({
      rows: [{ a: 1 }, { a: 2 }], errors: [], truncated: true,
    })
  })
})

describe('bytesStore', () => {
  it('serves one key, with ranges', async () => {
    const s = bytesStore('x.csv', async () => enc.encode('abcdef'))
    expect(dec.decode((await s.get('x.csv', { offset: 2, length: 3 })).bytes)).toBe('cde')
    expect((await s.get('x.csv')).totalSize).toBe(6)
    await expect(s.get('y.csv')).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})
