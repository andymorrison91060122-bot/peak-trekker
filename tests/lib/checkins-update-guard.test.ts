import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const SOURCE_ROOT = path.join(process.cwd(), 'src')
const CHECKINS_UPDATE_PATTERN = /\.from\(['"]checkins['"]\)\s*\.update\(/g
const ALLOW_MARKER_PATTERN = /FU-41-allow:\s*\S+/
const ADMIN_UPDATE_PATTERNS = [
  /createSupabaseAdminClient\s*\(\)\s*\.from\(['"]checkins['"]\)\s*\.update\(/s,
  /await\s+\w*(?:admin|Admin)\w*\s*\.from\(['"]checkins['"]\)\s*\.update\(/s,
]

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) return listSourceFiles(fullPath)
      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [fullPath]
      return []
    })
  )

  return files.flat()
}

function lineNumberForIndex(source: string, index: number) {
  return source.slice(0, index).split('\n').length
}

function nearbyLines(lines: string[], lineNumber: number, before = 18, after = 1) {
  const start = Math.max(0, lineNumber - before - 1)
  const end = Math.min(lines.length, lineNumber + after)
  return lines.slice(start, end).join('\n')
}

test('checkins updates use service-role/admin clients', async () => {
  const violations: string[] = []
  const found: string[] = []

  for (const filePath of await listSourceFiles(SOURCE_ROOT)) {
    const source = await readFile(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const lines = source.split('\n')
    const matches = source.matchAll(CHECKINS_UPDATE_PATTERN)

    for (const match of matches) {
      const matchIndex = match.index ?? 0
      const lineNumber = lineNumberForIndex(source, matchIndex)
      const context = nearbyLines(lines, lineNumber)
      const location = `${relativePath}:${lineNumber}`
      const isAllowed = ALLOW_MARKER_PATTERN.test(context)
      const usesAdminClient = ADMIN_UPDATE_PATTERNS.some((pattern) => pattern.test(context))

      found.push(location)
      if (!isAllowed && !usesAdminClient) {
        violations.push(`${location}\n${context}`)
      }
    }
  }

  assert.ok(found.length > 0, 'expected to find checkins update callsites')
  assert.deepEqual(violations, [])
})
