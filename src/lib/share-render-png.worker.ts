import { Resvg, initWasm } from '@resvg/resvg-wasm'
import resvgWasm from '../../node_modules/@resvg/resvg-wasm/index_bg.wasm?module'
import type { SvgPngRenderInput, SvgPngRenderer } from '@/lib/share-render-runtime'

let workerRendererReady: Promise<SvgPngRenderer> | null = null

function renderWithWorkerResvg({ svg, fontBuffers = [], transparent = false }: SvgPngRenderInput): Uint8Array<ArrayBuffer> {
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

export function ensureWorkerShareRenderer() {
  workerRendererReady ??= initWasm(resvgWasm).then(() => {
    return async (input: SvgPngRenderInput) => renderWithWorkerResvg(input)
  })
  return workerRendererReady
}
