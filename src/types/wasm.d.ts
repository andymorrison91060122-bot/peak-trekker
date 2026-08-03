declare module '*.wasm?module' {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}

declare module '*.wasm' {
  const wasmModule: WebAssembly.Module
  export default wasmModule
}

interface CloudflareEnv {
  PEAK_TREKKER_YOGA_WASM?: WebAssembly.Module
}
