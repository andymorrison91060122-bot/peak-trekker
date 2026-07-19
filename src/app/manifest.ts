import type { MetadataRoute } from 'next'
import { BRAND_ASSETS } from '@/lib/brand-assets'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Peak Trekker',
    short_name: 'Peak Trekker',
    start_url: '/',
    display: 'standalone',
    theme_color: '#121416',
    background_color: '#121416',
    icons: [
      { src: BRAND_ASSETS.pwa.any192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: BRAND_ASSETS.pwa.any512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: BRAND_ASSETS.pwa.maskable192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: BRAND_ASSETS.pwa.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
