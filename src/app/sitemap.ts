import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { SITE_ORIGIN } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

const staticEntries: MetadataRoute.Sitemap = [
  { url: SITE_ORIGIN, changeFrequency: 'weekly', priority: 1 },
  { url: `${SITE_ORIGIN}/explore`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_ORIGIN}/imprint`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_ORIGIN}/faq`, changeFrequency: 'monthly', priority: 0.5 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return staticEntries

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase
    .from('mountains')
    .select('id')
    .eq('is_active', true)
    .eq('is_readable', true)
    .order('id', { ascending: true })

  if (error || !data) return staticEntries

  return [
    ...staticEntries,
    ...data.map((mountain) => ({
      url: `${SITE_ORIGIN}/mountain/${mountain.id}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
