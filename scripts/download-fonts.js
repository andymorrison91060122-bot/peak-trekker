#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Downloads pinned Noto Sans SC fonts to public/fonts/ for share rendering.
// A font becomes live only after its exact bytes and SHA-256 are verified.

const crypto = require('crypto')
const fs = require('fs')
const https = require('https')
const path = require('path')

const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts')
const DOWNLOAD_TIMEOUT_MS = 60_000
const MAX_DOWNLOAD_ATTEMPTS = 2

const FONTS = [
  {
    name: 'NotoSansSC-Regular.otf',
    bytes: 16_437_364,
    sha256: '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b',
    url: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    fallbackUrl:
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  },
  {
    name: 'NotoSansSC-Bold.otf',
    bytes: 17_002_248,
    sha256: 'b5f0d1a190a7f9b43c310a8850630af12553df32c4c050543f9059732d9b4c0a',
    url: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
    fallbackUrl:
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
  },
]

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function fontFileIsValid(filePath, font) {
  if (!fs.existsSync(filePath)) return false
  const stats = fs.statSync(filePath)
  return stats.isFile() && stats.size === font.bytes && sha256File(filePath) === font.sha256
}

function assertValidFontFile(filePath, font) {
  if (!fontFileIsValid(filePath, font)) {
    throw new Error(`${font.name} failed exact size or SHA-256 validation`)
  }
}

function temporaryPathFor(destPath) {
  return path.join(
    path.dirname(destPath),
    `.${path.basename(destPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  )
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath, { flags: 'w' })

    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        file.close(() => {
          removeFile(destPath)
          download(response.headers.location, destPath).then(resolve).catch(reject)
        })
        return
      }

      if (statusCode !== 200) {
        file.close(() => {
          removeFile(destPath)
          reject(new Error(`HTTP ${statusCode} for ${url}`))
        })
        return
      }

      response.pipe(file)
      file.on('finish', () => file.close(resolve))
    })

    request.on('error', (error) => {
      file.close(() => {
        removeFile(destPath)
        reject(error)
      })
    })

    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timed out after ${DOWNLOAD_TIMEOUT_MS}ms for ${url}`))
    })

    file.on('error', (error) => {
      request.destroy()
      file.close(() => {
        removeFile(destPath)
        reject(error)
      })
    })
  })
}

async function downloadAndInstallFont({ font, destPath, url, download: downloadFile = download }) {
  const temporaryPath = temporaryPathFor(destPath)
  removeFile(temporaryPath)

  try {
    await downloadFile(url, temporaryPath)
    assertValidFontFile(temporaryPath, font)
    fs.renameSync(temporaryPath, destPath)
  } catch (error) {
    removeFile(temporaryPath)
    throw error
  }
}

async function downloadWithAttempts(sourceName, url, font, destPath) {
  let lastError = null

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await downloadAndInstallFont({ font, destPath, url })
      return
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : 'unknown error'
      if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
        console.warn(`${sourceName} attempt ${attempt} failed: ${message}`)
        console.log(`Retrying ${sourceName}...`)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${sourceName} failed`)
}

async function downloadFont(font) {
  const destPath = path.join(FONTS_DIR, font.name)

  if (fontFileIsValid(destPath, font)) {
    console.log(`${font.name} already exists with verified identity`)
    return
  }

  removeFile(destPath)
  console.log(`Downloading ${font.name} from jsDelivr...`)

  try {
    await downloadWithAttempts('jsDelivr', font.url, font, destPath)
  } catch (error) {
    console.warn(`jsDelivr failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    console.log('Retrying from GitHub raw...')
    await downloadWithAttempts('GitHub raw', font.fallbackUrl, font, destPath)
  }

  assertValidFontFile(destPath, font)
  console.log(`${font.name} downloaded with verified identity`)
}

async function main() {
  ensureDir(FONTS_DIR)

  try {
    for (const font of FONTS) {
      await downloadFont(font)
    }
    console.log('All Noto Sans SC fonts ready')
  } catch (error) {
    console.error(`Font download failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    console.error('Share template rendering will produce broken Chinese characters.')
    console.error('Investigate network connectivity or upstream URL changes.')
    process.exitCode = 1
  }
}

module.exports = {
  FONTS,
  downloadAndInstallFont,
  fontFileIsValid,
  main,
}

if (require.main === module) {
  void main()
}
