export const MOUNTAIN_DESCRIPTION_ALLOWED_TAGS = [
  'h2',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'br',
  'span',
] as const

export const MOUNTAIN_DESCRIPTION_ALLOWED_ATTR: string[] = []

export const MOUNTAIN_DESCRIPTION_FORBID_TAGS = [
  'img',
  'script',
  'iframe',
  'a',
  'style',
] as const

export function stripTagsForFallback(value: string) {
  return value.replace(/<[^>]+>/g, '')
}

export function getMountainDescriptionSanitizeConfig() {
  return {
    ALLOWED_TAGS: [...MOUNTAIN_DESCRIPTION_ALLOWED_TAGS],
    ALLOWED_ATTR: [...MOUNTAIN_DESCRIPTION_ALLOWED_ATTR],
    FORBID_TAGS: [...MOUNTAIN_DESCRIPTION_FORBID_TAGS],
  }
}
