import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const downloader = require('../scripts/download-fonts.js')
const opentype = require('@shuding/opentype.js')

const fontDir = join(process.cwd(), 'public', 'fonts')
const artifactFontDir = process.env.PEAK_TREKKER_ALLOW_TEST_OPENNEXT_FONT_DIR === '1'
  && process.env.PEAK_TREKKER_TEST_OPENNEXT_FONT_DIR
  ? process.env.PEAK_TREKKER_TEST_OPENNEXT_FONT_DIR
  : join(process.cwd(), '.open-next', 'assets', 'fonts')
const expectedFonts = {
  'NotoSansSC-Regular.otf': {
    bytes: 16_437_364,
    sha256: '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b',
  },
  'NotoSansSC-Bold.otf': {
    bytes: 17_002_248,
    sha256: 'b5f0d1a190a7f9b43c310a8850630af12553df32c4c050543f9059732d9b4c0a',
  },
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertExactParseableFont(filePath) {
  const expected = expectedFonts[basename(filePath)]
  assert.ok(expected, `unexpected font gate input: ${filePath}`)
  const bytes = readFileSync(filePath)
  assert.equal(bytes.byteLength, expected.bytes, `${basename(filePath)} exact byte length`)
  assert.equal(sha256(bytes), expected.sha256, `${basename(filePath)} exact SHA-256`)
  assert.doesNotThrow(() => opentype.parse(toArrayBuffer(bytes)), `${basename(filePath)} must parse with Satori's opentype dependency`)
}

test('Noto font integrity rejects known partial prefixes, wrong hashes, and interrupted temporary writes', async () => {
  assert.equal(typeof downloader.fontFileIsValid, 'function', 'downloader must expose its exact identity validator without executing main')
  assert.equal(typeof downloader.downloadAndInstallFont, 'function', 'downloader must expose the atomic installer for interruption testing')
  assert.equal(typeof downloader.FONTS, 'object', 'downloader must expose pinned font identities')

  const bold = downloader.FONTS.find((font) => font.name === 'NotoSansSC-Bold.otf')
  const regular = downloader.FONTS.find((font) => font.name === 'NotoSansSC-Regular.otf')
  assert.ok(bold)
  assert.ok(regular)

  const trustedBold = readFileSync(join(fontDir, bold.name))
  const trustedRegular = readFileSync(join(fontDir, regular.name))
  assert.equal(downloader.fontFileIsValid(join(fontDir, bold.name), bold), true, 'the trusted exact Bold identity must be accepted')
  assert.equal(downloader.fontFileIsValid(join(fontDir, regular.name), regular), true, 'the trusted exact Regular identity must be accepted')

  const fixtureDir = mkdtempSync(join(tmpdir(), 'peak-trekker-font-integrity-'))
  try {
    const deployedPrefixPath = join(fixtureDir, 'deployed-2710485-prefix.otf')
    const releasePrefixPath = join(fixtureDir, 'release-15308-prefix.otf')
    const sameSizeWrongHashPath = join(fixtureDir, 'same-size-wrong-hash.otf')
    writeFileSync(deployedPrefixPath, trustedBold.subarray(0, 2_710_485))
    writeFileSync(releasePrefixPath, trustedBold.subarray(0, 15_308))
    const wrongHash = Buffer.from(trustedRegular)
    wrongHash[0] ^= 0xff
    writeFileSync(sameSizeWrongHashPath, wrongHash)

    assert.equal(sha256(readFileSync(deployedPrefixPath)), '9063058e95b5b608b0e062f6fa82dde96ab28e64daa6bbe7043e1e0b102575d1', 'the 2.71MB fixture must match the proven production prefix')
    assert.equal(sha256(readFileSync(releasePrefixPath)), 'acdd3b06c0f67bd3262bac19da8462448ea91a46efe60757f8a702f756a067f5', 'the 15KB fixture must match the proven release prefix')
    assert.equal(downloader.fontFileIsValid(deployedPrefixPath, bold), false)
    assert.equal(downloader.fontFileIsValid(releasePrefixPath, bold), false)
    assert.equal(downloader.fontFileIsValid(sameSizeWrongHashPath, regular), false)

    const interruptedDest = join(fixtureDir, bold.name)
    await assert.rejects(
      () => downloader.downloadAndInstallFont({
        font: bold,
        destPath: interruptedDest,
        url: 'https://example.test/NotoSansSC-Bold.otf',
        download: async (_url, temporaryPath) => {
          writeFileSync(temporaryPath, trustedBold.subarray(0, 15_308))
          throw new Error('simulated interrupted download')
        },
      }),
      /simulated interrupted download/,
    )
    assert.equal(existsSync(interruptedDest), false, 'an interrupted transfer must not leave a live partial destination')
    assert.deepEqual(readdirSync(fixtureDir).filter((name) => name.endsWith('.tmp')), [], 'temporary font files must be removed after failure')

    const installedDest = join(fixtureDir, `installed-${bold.name}`)
    await downloader.downloadAndInstallFont({
      font: bold,
      destPath: installedDest,
      url: 'https://example.test/NotoSansSC-Bold.otf',
      download: async (_url, temporaryPath) => {
        copyFileSync(join(fontDir, bold.name), temporaryPath)
      },
    })
    assert.equal(downloader.fontFileIsValid(installedDest, bold), true, 'only a verified temporary file may become the live destination')
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true })
  }
})

test('Satori opentype artifact gate validates local inputs and optionally cf:build assets', () => {
  for (const name of Object.keys(expectedFonts)) {
    assertExactParseableFont(join(fontDir, name))
  }

  if (process.env.PEAK_TREKKER_ASSERT_OPENNEXT_FONT_ARTIFACTS === '1') {
    for (const name of Object.keys(expectedFonts)) {
      assertExactParseableFont(join(artifactFontDir, name))
    }
  }
})

test('OpenNext artifact gate fails closed for missing or corrupt fonts', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'peak-trekker-opennext-font-artifact-'))
  const fixtureDir = join(fixtureRoot, 'validated-artifacts')
  const fixturePublicFontDir = join(fixtureRoot, 'public', 'fonts')
  const testFile = fileURLToPath(import.meta.url)
  const childEnvironment = { ...process.env }
  delete childEnvironment.NODE_TEST_CONTEXT
  delete childEnvironment.PEAK_TREKKER_ALLOW_TEST_OPENNEXT_FONT_DIR

  try {
    mkdirSync(fixtureDir, { recursive: true })
    mkdirSync(fixturePublicFontDir, { recursive: true })

    const runArtifactGate = ({ candidateArtifactDir, cwd = process.cwd(), allowTestOverride = true }) => spawnSync(
      process.execPath,
      ['--test', '--test-name-pattern=Satori opentype artifact gate', testFile],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...childEnvironment,
          PEAK_TREKKER_ASSERT_OPENNEXT_FONT_ARTIFACTS: '1',
          PEAK_TREKKER_TEST_OPENNEXT_FONT_DIR: candidateArtifactDir,
          ...(allowTestOverride ? { PEAK_TREKKER_ALLOW_TEST_OPENNEXT_FONT_DIR: '1' } : {}),
        },
      },
    )

    assert.equal(
      runArtifactGate({ candidateArtifactDir: artifactFontDir }).status,
      0,
      'a complete valid OpenNext font artifact set must pass',
    )

    assert.notEqual(
      runArtifactGate({ candidateArtifactDir: join(fixtureDir, 'missing') }).status,
      0,
      'a missing OpenNext font artifact must fail the gate',
    )

    for (const name of Object.keys(expectedFonts)) {
      copyFileSync(join(fontDir, name), join(fixtureDir, name))
      copyFileSync(join(fontDir, name), join(fixturePublicFontDir, name))
    }
    const corrupt = Buffer.from(readFileSync(join(fixtureDir, 'NotoSansSC-Bold.otf')))
    corrupt[0] ^= 0xff
    writeFileSync(join(fixtureDir, 'NotoSansSC-Bold.otf'), corrupt)
    assert.notEqual(
      runArtifactGate({ candidateArtifactDir: fixtureDir }).status,
      0,
      'a corrupt OpenNext font artifact must fail the gate',
    )

    const validOverride = join(fixtureRoot, 'valid-override')
    mkdirSync(validOverride, { recursive: true })
    for (const name of Object.keys(expectedFonts)) {
      copyFileSync(join(fontDir, name), join(validOverride, name))
    }

    assert.notEqual(
      runArtifactGate({ candidateArtifactDir: validOverride, cwd: fixtureRoot, allowTestOverride: false }).status,
      0,
      'an unprivileged environment override must not redirect the normal artifact gate',
    )
    assert.equal(
      runArtifactGate({ candidateArtifactDir: validOverride, cwd: fixtureRoot }).status,
      0,
      'only the explicit test capability may redirect the artifact gate to a fixture directory',
    )
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
