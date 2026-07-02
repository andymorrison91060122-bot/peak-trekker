import {
  SHARE_RENDER_TEMPLATE_IDS,
  type ShareRenderTemplate,
} from './share-templates/types.ts'

export const DEFAULT_SHARE_TEMPLATE: ShareRenderTemplate = 'base-classic'

export const SHARE_TEMPLATE_PENDING_STORAGE_KEY = 'peak-trekker:imprint-template'
const PENDING_TEMPLATE_TTL_MS = 30 * 60 * 1000

type PendingShareTemplateIntent = {
  source: 'imprint'
  template: ShareRenderTemplate
  createdAt: number
}

function firstSearchValue(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export function isShareRenderTemplate(value: unknown): value is ShareRenderTemplate {
  return typeof value === 'string' && (SHARE_RENDER_TEMPLATE_IDS as readonly string[]).includes(value)
}

export function resolveShareTemplateParam(value: string | string[] | null | undefined): ShareRenderTemplate | null {
  const candidate = firstSearchValue(value)
  return isShareRenderTemplate(candidate) ? candidate : null
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function storePendingShareTemplate(template: ShareRenderTemplate) {
  if (!canUseSessionStorage()) return
  const payload: PendingShareTemplateIntent = {
    source: 'imprint',
    template,
    createdAt: Date.now(),
  }
  window.sessionStorage.setItem(SHARE_TEMPLATE_PENDING_STORAGE_KEY, JSON.stringify(payload))
}

export function clearPendingShareTemplate() {
  if (!canUseSessionStorage()) return
  window.sessionStorage.removeItem(SHARE_TEMPLATE_PENDING_STORAGE_KEY)
}

function readPendingShareTemplate(): PendingShareTemplateIntent | null {
  if (!canUseSessionStorage()) return null
  const raw = window.sessionStorage.getItem(SHARE_TEMPLATE_PENDING_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PendingShareTemplateIntent>
    if (parsed.source !== 'imprint' || !isShareRenderTemplate(parsed.template) || typeof parsed.createdAt !== 'number') {
      clearPendingShareTemplate()
      return null
    }
    if (Date.now() - parsed.createdAt > PENDING_TEMPLATE_TTL_MS) {
      clearPendingShareTemplate()
      return null
    }
    return parsed as PendingShareTemplateIntent
  } catch {
    clearPendingShareTemplate()
    return null
  }
}

export function consumePendingShareTemplate(): ShareRenderTemplate | null {
  const pending = readPendingShareTemplate()
  clearPendingShareTemplate()
  return pending?.template ?? null
}

export function peekPendingShareTemplate(): ShareRenderTemplate | null {
  return readPendingShareTemplate()?.template ?? null
}

export function resolveInitialShareTemplate({
  urlTemplate,
  allowPending = false,
}: {
  urlTemplate?: string | string[] | null
  allowPending?: boolean
}) {
  const explicitTemplate = resolveShareTemplateParam(urlTemplate)
  if (explicitTemplate) return explicitTemplate
  if (!allowPending) return DEFAULT_SHARE_TEMPLATE
  return consumePendingShareTemplate() ?? DEFAULT_SHARE_TEMPLATE
}

export function resolveCompletionShareTemplate({
  urlTemplate,
  allowPending = false,
}: {
  urlTemplate?: string | string[] | null
  allowPending?: boolean
}) {
  const explicitTemplate = resolveShareTemplateParam(urlTemplate)
  if (explicitTemplate) {
    clearPendingShareTemplate()
    return explicitTemplate
  }
  return allowPending ? consumePendingShareTemplate() : null
}

export function buildShareUrl({
  checkinId,
  template,
}: {
  checkinId?: string | null
  template?: ShareRenderTemplate | null
}) {
  const params = new URLSearchParams()
  if (checkinId) params.set('checkinId', checkinId)
  if (template) params.set('template', template)
  const query = params.toString()
  return query ? `/share?${query}` : '/share'
}

export function buildShareUrlForCheckin({
  checkinId,
  template,
}: {
  checkinId: string | null | undefined
  template?: ShareRenderTemplate | null
}) {
  if (!checkinId) return null
  return buildShareUrl({ checkinId, template })
}

export function buildImportUrl(template?: ShareRenderTemplate | null) {
  return buildEntryUrl('/import', template)
}

export function buildScreenshotUrl(template?: ShareRenderTemplate | null) {
  return buildEntryUrl('/screenshot', template)
}

export function buildImprintImportUrl(template?: ShareRenderTemplate | null) {
  return buildEntryUrl('/import', template, { fromImprint: true })
}

export function buildImprintScreenshotUrl(template?: ShareRenderTemplate | null) {
  return buildEntryUrl('/screenshot', template, { fromImprint: true })
}

function buildEntryUrl(
  path: '/import' | '/screenshot',
  template?: ShareRenderTemplate | null,
  options: { fromImprint?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (template) params.set('template', template)
  if (options.fromImprint) params.set('from', 'imprint')
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function buildExploreShareTemplateUrl(template?: ShareRenderTemplate | null) {
  return template ? `/explore?shareTemplate=${encodeURIComponent(template)}` : '/explore'
}

export function buildTrekUrl({
  mountainId,
  template,
}: {
  mountainId?: string | null
  template?: ShareRenderTemplate | null
}) {
  const params = new URLSearchParams()
  if (mountainId) params.set('mountainId', mountainId)
  if (template) params.set('shareTemplate', template)
  const query = params.toString()
  return query ? `/trek?${query}` : '/trek'
}

export function consumePendingShareTemplateForTrekUrl({
  mountainId,
}: {
  mountainId?: string | null
}) {
  return buildTrekUrl({ mountainId, template: consumePendingShareTemplate() })
}

export function buildImprintUrl(template?: ShareRenderTemplate | null) {
  return template ? `/imprint?template=${encodeURIComponent(template)}` : '/imprint'
}

export function buildImprintSourceUrl(template?: ShareRenderTemplate | null) {
  const params = new URLSearchParams()
  if (template) params.set('template', template)
  params.set('step', 'source')
  return `/imprint?${params.toString()}`
}
