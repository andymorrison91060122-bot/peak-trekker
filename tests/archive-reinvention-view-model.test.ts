import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const pagePath = new URL('../src/app/(main)/archive/page.tsx', import.meta.url)
const pageSource = readFileSync(pagePath, 'utf8')
const clientPath = new URL('../src/app/(main)/archive/ArchiveClient.tsx', import.meta.url)
const clientSource = readFileSync(clientPath, 'utf8')

type ArchivePureHelpers = {
  resolveActivityAt: (values: {
    startTime?: string | null
    sessionStartedAt?: string | null
    createdAt?: string | null
  }) => string | null
  resolveArchiveMaxAltitude: (values: {
    maxElevationMeters?: unknown
    altitude?: unknown
    sessionMaxAltitudeM?: unknown
    mountainAltitude?: unknown
    isSummit: boolean
  }) => number | null
  normalizeArchiveNote: (value: unknown) => string | null
}

function loadPureHelpers(): ArchivePureHelpers {
  const sourceFile = ts.createSourceFile(pagePath.pathname, pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set([
    'toNumber',
    'toValidIsoDate',
    'resolveActivityAt',
    'resolveArchiveMaxAltitude',
    'normalizeArchiveNote',
  ])
  const printer = ts.createPrinter()
  const declarations = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && Boolean(statement.name && names.has(statement.name.text)),
  )

  assert.equal(declarations.length, names.size, 'all archive pure helpers must remain extractable from page.tsx')

  const extracted = declarations.map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile)).join('\n')
  const compiled = ts.transpileModule(
    `${extracted}\nmodule.exports = { resolveActivityAt, resolveArchiveMaxAltitude, normalizeArchiveNote }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const runtimeModule = { exports: {} as ArchivePureHelpers }
  new Function('module', 'exports', compiled)(runtimeModule, runtimeModule.exports)
  return runtimeModule.exports
}

test('activityAt uses start_time before session.started_at and created_at', () => {
  const { resolveActivityAt } = loadPureHelpers()
  assert.equal(
    resolveActivityAt({
      startTime: '2022-05-03T08:00:00.000Z',
      sessionStartedAt: '2023-06-04T08:00:00.000Z',
      createdAt: '2024-07-05T08:00:00.000Z',
    }),
    '2022-05-03T08:00:00.000Z',
  )
})

test('activityAt falls back through invalid and missing dates', () => {
  const { resolveActivityAt } = loadPureHelpers()
  assert.equal(
    resolveActivityAt({ startTime: 'invalid', sessionStartedAt: '2023-06-04T08:00:00.000Z', createdAt: '2024-07-05T08:00:00.000Z' }),
    '2023-06-04T08:00:00.000Z',
  )
  assert.equal(
    resolveActivityAt({ startTime: null, sessionStartedAt: 'invalid', createdAt: '2024-07-05T08:00:00.000Z' }),
    '2024-07-05T08:00:00.000Z',
  )
})

test('un-summited trip without a measured altitude stays unknown', () => {
  const { resolveArchiveMaxAltitude } = loadPureHelpers()
  assert.equal(resolveArchiveMaxAltitude({ mountainAltitude: 5025, isSummit: false }), null)
})

test('summited trip may use mountain metadata when measured altitude is absent', () => {
  const { resolveArchiveMaxAltitude } = loadPureHelpers()
  assert.equal(resolveArchiveMaxAltitude({ mountainAltitude: 5025, isSummit: true }), 5025)
})

test('measured altitude wins over mountain metadata', () => {
  const { resolveArchiveMaxAltitude } = loadPureHelpers()
  assert.equal(
    resolveArchiveMaxAltitude({ maxElevationMeters: 4912, altitude: 4888, sessionMaxAltitudeM: 4800, mountainAltitude: 5025, isSummit: true }),
    4912,
  )
})

test('missing compatible note normalizes to null', () => {
  const { normalizeArchiveNote } = loadPureHelpers()
  assert.equal(normalizeArchiveNote(undefined), null)
  assert.equal(normalizeArchiveNote('   '), null)
  assert.equal(normalizeArchiveNote(' 风比想象里更烈。 '), '风比想象里更烈。')
})

test('checkin select variants retain a minimal final compatibility fallback', () => {
  const match = pageSource.match(/const CHECKIN_SELECT_VARIANTS = \[([\s\S]*?)\] as const/)
  assert.ok(match, 'CHECKIN_SELECT_VARIANTS must exist')
  const variants = [...match[1].matchAll(/`([\s\S]*?)`/g)].map((entry) => entry[1])
  assert.ok(variants.length >= 2)
  for (const variant of variants.slice(0, -1)) {
    assert.match(variant, /\bstart_time\b/)
    assert.match(variant, /\bnote\b/)
  }
  assert.doesNotMatch(variants.at(-1) ?? '', /\bstart_time\b|\bnote\b/)
})

function loadArchiveClientHelpers() {
  const sourceFile = ts.createSourceFile(clientPath.pathname, clientSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['getExpandedYearKey', 'getYearSummaryCopy', 'getArchiveFooterCopy', 'getYearFoldCopy'])
  const printer = ts.createPrinter()
  const declarations = sourceFile.statements.filter(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && Boolean(statement.name && names.has(statement.name.text)),
  )
  assert.equal(declarations.length, names.size, 'archive filter copy helpers must remain extractable from ArchiveClient.tsx')
  const extracted = declarations.map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile)).join('\n')
  const compiled = ts.transpileModule(
    `${extracted}\nmodule.exports = { getExpandedYearKey, getYearSummaryCopy, getArchiveFooterCopy, getYearFoldCopy }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const runtimeModule = { exports: {} as {
    getExpandedYearKey: (filterId: string, year: string) => string
    getYearSummaryCopy: (filterLabel: string, count: number, visibleCount: number, isAll: boolean) => string
    getArchiveFooterCopy: (filterLabel: string, count: number, oldestYear: string, isAll: boolean) => string
    getYearFoldCopy: (filterLabel: string, hiddenCount: number, isExpanded: boolean) => string
  } }
  new Function('module', 'exports', compiled)(runtimeModule, runtimeModule.exports)
  return runtimeModule.exports
}

test('expanded year state is isolated by filter and year', () => {
  const { getExpandedYearKey } = loadArchiveClientHelpers()
  assert.equal(getExpandedYearKey('all', '2025'), 'all:2025')
  assert.equal(getExpandedYearKey('proof', '2025'), 'proof:2025')
  assert.notEqual(getExpandedYearKey('all', '2025'), getExpandedYearKey('proof', '2025'))
})

test('year, fold, and footer copy identify the active filter', () => {
  const { getYearSummaryCopy, getArchiveFooterCopy, getYearFoldCopy } = loadArchiveClientHelpers()
  assert.equal(getYearSummaryCopy('全部', 8, 3, true), '8 次 · 显示 3 次')
  assert.equal(getYearSummaryCopy('登顶', 4, 2, false), '登顶 4 次 · 显示 2 次')
  assert.equal(getYearFoldCopy('登顶', 2, false), '2 次折叠 · 登顶 · 展开')
  assert.equal(getYearFoldCopy('登顶', 4, true), '收起这一年')
  assert.equal(getArchiveFooterCopy('全部', 9, '2022', true), '已收录 9 次 · 始于 2022')
  assert.equal(getArchiveFooterCopy('登顶', 9, '2022', false), '筛选 登顶 · 已收录 9 次 · 始于 2022')
})
