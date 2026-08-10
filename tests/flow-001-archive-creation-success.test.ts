import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const archiveCreationSuccessPath = 'src/components/activity/ArchiveCreationSuccess.tsx'
const screenshotClient = readFileSync('src/app/(flow)/screenshot/ScreenshotClient.tsx', 'utf8')
const importClient = readFileSync('src/app/(flow)/import/ImportClient.tsx', 'utf8')

test('screenshot and track import converge on the shared archive creation success surface', () => {
  assert.equal(existsSync(archiveCreationSuccessPath), true)

  const archiveCreationSuccess = readFileSync(archiveCreationSuccessPath, 'utf8')
  assert.match(archiveCreationSuccess, /export default function ArchiveCreationSuccess/)
  assert.match(archiveCreationSuccess, /PersistedScreenshotRouteShape/)
  assert.match(archiveCreationSuccess, /ShareTrackPreview/)
  assert.match(archiveCreationSuccess, /trackPreview\?: ShareTrackPreview \| null/)
  assert.match(archiveCreationSuccess, /data-testid="archive-creation-success"/)
  assert.match(archiveCreationSuccess, /data-testid="archive-creation-success"[\s\S]{0,800}position:\s*'fixed'/)
  assert.match(archiveCreationSuccess, /data-archive-creation-cta/)
  assert.match(archiveCreationSuccess, /data-archive-creation-content/)
  assert.match(archiveCreationSuccess, /gap:\s*'var\(--space-3\)'/)
  assert.match(archiveCreationSuccess, /bottom:\s*'calc\(env\(safe-area-inset-bottom, 0px\) \+ 24px\)'/)
  assert.match(archiveCreationSuccess, /去分享/)
  assert.match(archiveCreationSuccess, /查看档案/)

  assert.match(screenshotClient, /import ArchiveCreationSuccess from '@\/components\/activity\/ArchiveCreationSuccess'/)
  assert.match(screenshotClient, /<ArchiveCreationSuccess[\s\S]*routeShape=\{submitResult\?\.routeShape \?\? null\}[\s\S]*onShare=\{handleArchiveContinue\}[\s\S]*onViewArchive=\{handleArchiveBack\}/)
  assert.match(screenshotClient, /buildShareUrlForCheckin\(\{[\s\S]*checkinId: submitResult\?\.checkinId,[\s\S]*template: initialTemplate,[\s\S]*\}\)/)
  assert.match(screenshotClient, /router\.replace\(`\/activity\/\$\{submitResult\.checkinId\}`\)/)

  assert.match(importClient, /import ArchiveCreationSuccess from '@\/components\/activity\/ArchiveCreationSuccess'/)
  assert.match(importClient, /import \{ buildShareTrackPreview \} from '@\/lib\/share-track-preview'/)
  assert.match(importClient, /buildShareTrackPreview\(parseResult\?\.trackPoints \?\? \[\]\)/)
  assert.match(importClient, /<ArchiveCreationSuccess[\s\S]*trackPreview=\{importTrackPreview\}[\s\S]*onShare=\{[\s\S]*buildShareUrlForCheckin\([\s\S]*checkinId: confirmResult\?\.checkinId,[\s\S]*onViewArchive=\{[\s\S]*router\.replace\(`\/activity\/\$\{confirmResult\.checkinId\}`\)/)
  assert.doesNotMatch(importClient, /function ImportSuccess\(/)
  assert.doesNotMatch(importClient, /data-import-success-/)
})
