import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Resvg, initWasm } from '@resvg/resvg-wasm'
import type { SvgPngRenderInput } from '@/lib/share-render-runtime'

let wasmReadyPromise: Promise<void> | null = null

function ensureNodeResvgWasm() {
  wasmReadyPromise ??= readFile(join(process.cwd(), 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
    .then((wasm) => initWasm(wasm))
  return wasmReadyPromise
}

export async function renderSvgPngWithNode(input: SvgPngRenderInput): Promise<Uint8Array<ArrayBuffer>> {
  await ensureNodeResvgWasm()
  return renderWithResvg(input)
}

function renderWithResvg({ svg, fontBuffers = [], transparent = false }: SvgPngRenderInput): Uint8Array<ArrayBuffer> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' as const },
    ...(transparent ? {} : { background: '#121416' }),
    ...(fontBuffers.length > 0
      ? {
          font: {
            fontBuffers: fontBuffers.map((buffer) => new Uint8Array(buffer)),
            defaultFontFamily: 'Noto Sans SC',
            sansSerifFamily: 'Noto Sans SC',
          },
        }
      : {}),
  })
  const png = resvg.render().asPng()
  const copy = new Uint8Array(png.byteLength)
  copy.set(png)
  return copy
}
