import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('src/components/map/PmtilesSnapshotMap.tsx', 'utf8')

test('minimal basemap restores geographic context without enabling the full POI layer', () => {
  for (const layerId of ['places_subplace', 'roads_labels_major', 'roads_labels_minor']) {
    assert.match(source, new RegExp(`'${layerId}'`), `missing ${layerId}`)
  }

  const allowlist = source.match(/const allowedLayerIds = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  assert.doesNotMatch(allowlist, /'pois'/, 'the mixed commercial POI layer must remain excluded')
  assert.doesNotMatch(allowlist, /'address_label'|'roads_oneway'|'roads_shields'/)
})

test('peak labels reuse the Protomaps POI text style with a strict peak-only filter', () => {
  assert.match(source, /const PEAK_ONLY_LABEL_LAYER_ID = 'pois_peak'/)
  assert.match(source, /layer\.id !== 'pois' \|\| layer\.type !== 'symbol'/)
  assert.match(source, /\['==', \['get', 'kind'\], 'peak'\]/)
  assert.match(source, /\['>=', \['zoom'\], \['\+', \['get', 'min_zoom'\], 0\]\]/)
  assert.match(source, /delete layout\['icon-image'\]/)
  assert.match(source, /delete layout\['text-offset'\]/)
  assert.match(source, /delete layout\['text-variable-anchor'\]/)
})
