export const SITE_ORIGIN = 'https://peaktrekker.cc'

export const SITE_HOSTNAMES = new Set([
  'peaktrekker.cc',
  'www.peaktrekker.cc',
  'peak-trekker.vercel.app',
])

export function isSiteHostname(hostname: string) {
  return SITE_HOSTNAMES.has(hostname.trim().toLowerCase())
}
