import 'server-only'

let brandMarkMaskDataUriPromise: Promise<string> | null = null

async function fetchBrandMarkMaskDataUri(origin: string) {
  const response = await fetch(new URL('/brand/derived-mask-mark-white.png', origin), {
    cache: 'force-cache',
  })
  if (!response.ok) {
    throw new Error(`Brand mark responded ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return `data:image/png;base64,${bytes.toString('base64')}`
}

export async function loadBrandMarkMaskDataUri(origin: string) {
  brandMarkMaskDataUriPromise ??= fetchBrandMarkMaskDataUri(origin)
  try {
    return await brandMarkMaskDataUriPromise
  } catch (error) {
    brandMarkMaskDataUriPromise = null
    throw error
  }
}
