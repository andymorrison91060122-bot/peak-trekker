import 'server-only'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function publicPngDataUri(fileName: string) {
  const bytes = readFileSync(join(process.cwd(), 'public', 'brand', fileName))
  return `data:image/png;base64,${bytes.toString('base64')}`
}

export const BRAND_MARK_MASK_DATA_URI = publicPngDataUri('derived-mask-mark-white.png')
