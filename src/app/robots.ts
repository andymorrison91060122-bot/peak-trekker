import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/profile',
        '/trek',
        '/activity/',
        '/share',
        '/screenshot',
        '/import',
        '/admin/',
        '/debug/',
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  }
}
