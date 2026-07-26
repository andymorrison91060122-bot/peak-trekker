import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildEntitySemantics,
  buildSemanticRecord,
  checkEntitySemantics,
  generateEntitySemantics,
} from './build-entity-semantics.mjs';

const ROOT = new URL('.', import.meta.url).pathname;

async function rows() {
  return (await buildEntitySemantics(ROOT)).records;
}

test('builds a deterministic 359-key semantics closure with conservative counts', async () => {
  const records = await rows();
  assert.equal(records.length, 359);
  assert.equal(new Set(records.map((row) => row.effective_canonical_key)).size, 359);
  const counts = Object.groupBy(records, (row) => row.semantic_status === 'needs_review' ? 'needs_review' : row.catalog_entity_kind);
  assert.equal(counts.route_corridor.length, 11);
  assert.equal(counts.mountain_area.length, 44);
  assert.equal(counts.independent_peak.length, 31);
  assert.equal(counts.needs_review.length, 273);
});

test('automatic rules separate primary summit, massif member, and route semantics', () => {
  const mountain = buildSemanticRecord({
    effective_canonical_key: 'sample-area', primary_name: '样例山', primary_summit: '样例顶',
    entity_type: 'peak', massif_key: null, aliases: ['样例山样例顶'], provinces: [],
    classic_routes: [], mountain_routes: [],
  });
  assert.equal(mountain.catalog_entity_kind, 'mountain_area');
  assert.equal(mountain.coordinate_target_role, 'representative_highpoint');
  assert.equal(mountain.verification_scope, 'area_or_route');
  assert.deepEqual(mountain.exact_target_names, ['样例山样例顶', '样例顶']);

  const member = buildSemanticRecord({
    effective_canonical_key: 'sample-member', primary_name: '样例峰', primary_summit: null,
    entity_type: 'massif_member', massif_key: 'sample', aliases: [], provinces: [],
    classic_routes: [], mountain_routes: [],
  });
  assert.equal(member.catalog_entity_kind, 'independent_peak');
  assert.equal(member.coordinate_target_role, 'independent_summit');
  assert.equal(member.verification_scope, 'summit_proximity');

  const route = buildSemanticRecord({
    effective_canonical_key: 'sample-route', primary_name: '样例线', primary_summit: null,
    entity_type: 'route_corridor', massif_key: null, aliases: [], provinces: [],
    classic_routes: [], mountain_routes: [],
  });
  assert.equal(route.catalog_entity_kind, 'route_corridor');
  assert.equal(route.coordinate_target_role, 'route_highpoint');
  assert.equal(route.verification_scope, 'route_geometry');
  assert.deepEqual(route.exact_target_names, []);
});

test('plain Phase 0 peak type remains needs_review instead of being guessed', () => {
  const record = buildSemanticRecord({
    effective_canonical_key: 'ambiguous-mountain', primary_name: '某某山', primary_summit: null,
    entity_type: 'peak', massif_key: null, aliases: [], provinces: [],
    classic_routes: [], mountain_routes: [],
  });
  assert.equal(record.semantic_status, 'needs_review');
  assert.equal(record.catalog_entity_kind, null);
  assert.equal(record.coordinate_target_role, 'none');
  assert.ok(record.risk_flags.includes('possible_mountain_area_modeled_as_peak'));
});

test('known cases keep product entity separate from coordinate target', async () => {
  const records = await rows();
  const byKey = new Map(records.map((row) => [row.effective_canonical_key, row]));
  for (const [key, summit] of [
    ['taishan', '玉皇顶'],
    ['huashan', '南峰'],
    ['huangshan', '莲花峰'],
  ]) {
    const row = byKey.get(key);
    assert.equal(row.catalog_entity_kind, 'mountain_area');
    assert.equal(row.coordinate_target_role, 'representative_highpoint');
    assert.equal(row.representative_highpoint_name, summit);
    assert.equal(row.primary_name.includes(summit), false);
  }

  const guangzhou = byKey.get('baiyun-shan-guangdong');
  assert.equal(guangzhou.primary_name, '白云山');
  assert.equal(guangzhou.representative_highpoint_name, '摩星岭');
  assert.deepEqual(guangzhou.exact_target_names, ['广州白云山摩星岭', '摩星岭', '白云山摩星岭']);
  assert.ok(guangzhou.query_names.includes('白云山'));
  assert.equal(guangzhou.exact_target_names.includes('白云山'), false);

  for (const key of ['siguniang-dafeng', 'siguniang-erfeng', 'siguniang-sanfeng', 'siguniang-yaomei-feng']) {
    const row = byKey.get(key);
    assert.equal(row.catalog_entity_kind, 'independent_peak');
    assert.equal(row.coordinate_target_role, 'independent_summit');
  }

  const yuzhu = byKey.get('yuzhu-feng');
  assert.equal(yuzhu.catalog_entity_kind, 'independent_peak');
  assert.deepEqual(yuzhu.exact_target_names, ['玉珠峰']);
  assert.ok(yuzhu.query_names.includes('玉珠峰北坡'));
  assert.ok(yuzhu.query_names.includes('玉珠峰南坡线'));
});

test('all 11 routes remain summit-free', async () => {
  const records = (await rows()).filter((row) => row.catalog_entity_kind === 'route_corridor');
  assert.equal(records.length, 11);
  for (const row of records) {
    assert.equal(row.coordinate_target_role, 'route_highpoint');
    assert.equal(row.verification_scope, 'route_geometry');
    assert.deepEqual(row.exact_target_names, []);
  }
});

test('generate and check are byte-identical and never rewrite overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fu51-entity-semantics-'));
  try {
    await mkdir(join(root, 'ledger'), { recursive: true });
    await cp(join(ROOT, 'ledger/effective_canonicals.jsonl'), join(root, 'ledger/effective_canonicals.jsonl'));
    await cp(join(ROOT, 'entity-semantics-overrides.json'), join(root, 'entity-semantics-overrides.json'));
    const before = await readFile(join(root, 'entity-semantics-overrides.json'));
    await generateEntitySemantics(root);
    const first = await Promise.all([
      readFile(join(root, 'ledger/entity-semantics.jsonl')),
      readFile(join(root, 'ledger/entity-semantics-review.md')),
    ]);
    await generateEntitySemantics(root);
    const second = await Promise.all([
      readFile(join(root, 'ledger/entity-semantics.jsonl')),
      readFile(join(root, 'ledger/entity-semantics-review.md')),
    ]);
    assert.deepEqual(second, first);
    assert.deepEqual(await readFile(join(root, 'entity-semantics-overrides.json')), before);
    await checkEntitySemantics(root);
    await writeFile(join(root, 'ledger/entity-semantics.jsonl'), 'drift\n');
    await assert.rejects(() => checkEntitySemantics(root), /differs from deterministic rebuild/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
