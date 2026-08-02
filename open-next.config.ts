import { defineCloudflareConfig, type OpenNextConfig } from '@opennextjs/cloudflare'

export default {
  ...defineCloudflareConfig(),
  buildCommand: 'npm run build -- --webpack',
} satisfies OpenNextConfig
