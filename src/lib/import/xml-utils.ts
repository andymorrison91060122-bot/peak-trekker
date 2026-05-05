export function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export function getFirstTagText(xml: string, tagName: string) {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i').exec(xml)
  return match?.[1] ? decodeXml(match[1].trim()) : undefined
}

export function getAttribute(tag: string, attributeName: string) {
  const match = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)
  return match?.[1]
}

export function getChildTagText(fragment: string, tagName: string) {
  return getFirstTagText(fragment, tagName)
}
