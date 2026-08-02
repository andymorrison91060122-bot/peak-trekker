import { defineCloudflareConfig, type OpenNextConfig } from '@opennextjs/cloudflare'

export default {
  ...defineCloudflareConfig(),
  buildCommand: 'NEXT_PUBLIC_PEAK_TREKKER_RUNTIME=cloudflare npm run build -- --webpack',
} satisfies OpenNextConfig
