#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Downloads Noto Sans SC fonts to public/fonts/ for share template rendering.
// Idempotent: skips download if files already exist with valid sizes.
// Fails loudly on network/IO errors so build does not silently produce broken posters.
//
// Runs automatically via predev / prebuild hooks; can be invoked manually with:
// npm run fonts:download

const fs = require('fs')
const https = require('https')
const path = require('path')

const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts')
const MIN_SIZE_BYTES = 1_000_000
const DOWNLOAD_TIMEOUT_MS = 60_000
const MAX_DOWNLOAD_ATTEMPTS = 2

const FONTS = [
  {
    name: 'NotoSansSC-Regular.otf',
    url: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
    fallbackUrl:
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  },
  {
    name: 'NotoSansSC-Bold.otf',
    url: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
    fallbackUrl:
      'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
  },
]

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function removePartial(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function fileIsValid(filePath) {
  if (!fs.existsSync(filePath)) return false
  const stats = fs.statSync(filePath)
  return stats.size >= MIN_SIZE_BYTES
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)

    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        file.close(() => {
          removePartial(destPath)
          download(response.headers.location, destPath).then(resolve).catch(reject)
        })
        return
      }

      if (statusCode !== 200) {
        file.close(() => {
          removePartial(destPath)
          reject(new Error(`HTTP ${statusCode} for ${url}`))
        })
        return
      }

      response.pipe(file)
      file.on('finish', () => file.close(resolve))
    })

    request.on('error', (error) => {
      file.close(() => {
        removePartial(destPath)
        reject(error)
      })
    })

    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timed out after ${DOWNLOAD_TIMEOUT_MS}ms for ${url}`))
    })

    file.on('error', (error) => {
      request.destroy()
      file.close(() => {
        removePartial(destPath)
        reject(error)
      })
    })
  })
}

async function downloadWithAttempts(sourceName, url, destPath) {
  let lastError = null

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    removePartial(destPath)

    try {
      await download(url, destPath)
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

async function downloadFont({ name, url, fallbackUrl }) {
  const destPath = path.join(FONTS_DIR, name)

  if (fileIsValid(destPath)) {
    const sizeMb = (fs.statSync(destPath).size / 1_000_000).toFixed(1)
    console.log(`${name} already exists (${sizeMb}MB)`)
    return
  }

  removePartial(destPath)
  console.log(`Downloading ${name} from jsDelivr...`)

  try {
    await downloadWithAttempts('jsDelivr', url, destPath)
  } catch (error) {
    console.warn(`jsDelivr failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    console.log('Retrying from GitHub raw...')
    await downloadWithAttempts('GitHub raw', fallbackUrl, destPath)
  }

  if (!fileIsValid(destPath)) {
    removePartial(destPath)
    throw new Error(`${name} downloaded but size is too small`)
  }

  const sizeMb = (fs.statSync(destPath).size / 1_000_000).toFixed(1)
  console.log(`${name} downloaded (${sizeMb}MB)`)
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
    process.exit(1)
  }
}

main()
