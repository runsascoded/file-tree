// Wrangler's module rules: `*.wasm` → a compiled `WebAssembly.Module`
// (built-in `CompiledWasm` rule); `*.ttf` → an `ArrayBuffer` (the `Data`
// rule in `wrangler.toml`).
declare module '*.wasm' {
  const mod: WebAssembly.Module
  export default mod
}
declare module '*.ttf' {
  const buf: ArrayBuffer
  export default buf
}
