import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const explorePage = readFileSync('src/app/(main)/explore/page.tsx', 'utf8')
const profilePage = readFileSync('src/app/(main)/profile/page.tsx', 'utf8')

test('explore gates province ranking fetches behind PROVINCE_RANKING while preserving flag-on calls', () => {
  assert.match(explorePage, /import \{ isFeatureEnabled \} from '@\/lib\/feature-flags'/)
  assert.match(explorePage, /const provinceRankingEnabled = isFeatureEnabled\('PROVINCE_RANKING'\)/)
  assert.match(
    explorePage,
    /user && provinceRankingEnabled\s*\?\s*listProvinceMonthlyRankings\(currentMonth\.year, currentMonth\.month\)\s*:\s*Promise\.resolve\(undefined\)/
  )
  assert.match(
    explorePage,
    /user && provinceRankingEnabled\s*\?\s*listProvinceMonthlyRankings\(previousMonth\.year, previousMonth\.month\)\s*:\s*Promise\.resolve\(undefined\)/
  )
  assert.match(
    explorePage,
    /let provinceBanner: ProvinceBannerData \| null \| undefined = user && provinceRankingEnabled \? null : undefined/
  )
  assert.match(explorePage, /if \(user && provinceRankingEnabled && hometownProvince\)/)
})

test('profile gates province contribution fetch behind PROVINCE_RANKING while preserving flag-on call', () => {
  assert.match(profilePage, /import \{ isFeatureEnabled \} from '@\/lib\/feature-flags'/)
  assert.match(profilePage, /const provinceRankingEnabled = isFeatureEnabled\('PROVINCE_RANKING'\)/)
  assert.match(
    profilePage,
    /provinceRankingEnabled\s*\?\s*getUserMonthlyContribution\(user\.id, currentMonth\.year, currentMonth\.month\)\s*:\s*Promise\.resolve\(null\)/
  )
})
