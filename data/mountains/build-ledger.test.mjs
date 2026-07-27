import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkLedger,
  generateLedger,
  validateOverrideGraph,
} from './build-ledger.mjs';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const INPUT_FILES = [
  'README.md',
  'seed-catalog.md',
  'seed-distance.md',
  'disposition-ledger.json',
];
const MANAGED_OUTPUTS = [
  'ledger/source_records.jsonl',
  'ledger/candidates.jsonl',
  'ledger/effective_canonicals.jsonl',
  'ledger/reconciliation.md',
  'overrides.json',
];

async function createFixture(t, { currentOverrides = true } = {}) {
  const parent = await mkdtemp(join(tmpdir(), 'peak-trekker-ledger-test-'));
  const rootDir = join(parent, 'mountains');
  await mkdir(rootDir, { recursive: true });
  await Promise.all(INPUT_FILES.map((file) => copyFile(join(SOURCE_ROOT, file), join(rootDir, file))));
  if (currentOverrides) await copyFile(join(SOURCE_ROOT, 'overrides.json'), join(rootDir, 'overrides.json'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return rootDir;
}

async function readJsonl(path) {
  const text = await readFile(path, 'utf8');
  return text.trimEnd().split('\n').map((line) => JSON.parse(line));
}

async function snapshot(rootDir, paths = MANAGED_OUTPUTS) {
  return new Map(await Promise.all(paths.map(async (path) => [path, await readFile(join(rootDir, path))])));
}

function assertSnapshotEqual(before, after) {
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [path, expected] of before) {
    assert.deepEqual(after.get(path), expected, `${path} changed unexpectedly`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceTableRows(bytes) {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => {
      if (!line.startsWith('|') || !line.endsWith('|')) return false;
      const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
      return cells[0] !== '山峰名称' && !cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    });
}

function countBy(rows, field) {
  return Object.fromEntries(
    [...Map.groupBy(rows, (row) => row[field])]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, values.length]),
  );
}

test('generates schema v2 source, candidate and effective identity layers without losing provenance', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });

  const sourceRecords = await readJsonl(join(rootDir, 'ledger/source_records.jsonl'));
  const candidates = await readJsonl(join(rootDir, 'ledger/candidates.jsonl'));
  const effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));
  const overrides = JSON.parse(await readFile(join(rootDir, 'overrides.json'), 'utf8'));

  assert.equal(overrides.schema_version, 2);
  assert.equal(Object.keys(overrides.by_canonical_key).length, 406);
  assert.equal(Object.keys(overrides.synthetic_canonicals).length, 4);
  assert.equal(sourceRecords.length, 812);
  assert.equal(candidates.length, 406);
  assert.equal(new Set(candidates.map((row) => row.resolved_canonical_key)).size, 403);
  assert.equal(new Set(candidates.map((row) => row.effective_canonical_key)).size, 399);
  assert.equal(effective.length, 359);
  assert.deepEqual(countBy(effective, 'disposition'), { keep: 348, keep_route: 11 });
  assert.equal(effective.filter((row) => row.entity_type === 'route_corridor').length, 11);

  assert.equal(sourceRecords.filter((row) => row.source_document_id === 'catalog').length, 406);
  assert.equal(sourceRecords.filter((row) => row.source_document_id === 'distance').length, 406);
  assert.ok(sourceRecords.filter((row) => row.source_document_id === 'distance').every((row) => row.gps_present === false));
  assert.equal(sourceRecords.filter((row) => row.source_document_id === 'catalog' && row.gps_present).length, 396);
  assert.equal(sourceRecords.filter((row) => row.source_document_id === 'catalog' && !row.gps_present).length, 10);

  const k2 = sourceRecords.find((row) => row.source_document_id === 'catalog' && row.parsed.name === '乔戈里峰（K2）');
  assert.equal(k2.column_count, 6);
  assert.equal(k2.parsed.summit_gps_raw, null);
  assert.equal(k2.parsed.classic_route, '乔戈里峰传统南坡路线');

  for (const sourceDocumentId of ['catalog', 'distance']) {
    const sourceFile = sourceDocumentId === 'catalog' ? 'seed-catalog.md' : 'seed-distance.md';
    const rawRows = sourceTableRows(await readFile(join(rootDir, sourceFile)));
    const records = sourceRecords.filter((row) => row.source_document_id === sourceDocumentId);
    assert.equal(rawRows.length, 406);
    rawRows.forEach((rawPayload, index) => {
      assert.equal(records[index].raw_payload, rawPayload);
      assert.equal(records[index].source_hash, sha256(Buffer.from(rawPayload, 'utf8')));
    });
  }

  const sourceById = new Map(sourceRecords.map((row) => [row.source_row_id, row]));
  for (const candidate of candidates) {
    assert.equal(candidate.source_identity.name, sourceById.get(candidate.source_refs.catalog.source_row_id).parsed.name);
    assert.equal(candidate.source_identity.province, sourceById.get(candidate.source_refs.catalog.source_row_id).parsed.province);
    for (const sourceDocumentId of ['catalog', 'distance']) {
      const sourceRef = candidate.source_refs[sourceDocumentId];
      const sourceRecord = sourceById.get(sourceRef.source_row_id);
      assert.equal(sourceRecord.source_document_id, sourceDocumentId);
      assert.equal(sourceRecord.mapped_candidate_key, candidate.canonical_key);
      assert.equal(sourceRecord.resolved_canonical_key, candidate.resolved_canonical_key);
      assert.equal(sourceRecord.effective_canonical_key, candidate.effective_canonical_key);
      assert.equal(sourceRecord.source_hash, sourceRef.source_hash);
    }
  }

  for (const entity of effective) {
    assert.ok(entity.source_candidate_keys.length > 0);
    assert.equal(entity.source_refs.length, entity.source_candidate_keys.length);
    for (const ref of entity.source_refs) {
      assert.ok(entity.source_candidate_keys.includes(ref.canonical_key));
      assert.ok(sourceById.has(ref.catalog.source_row_id));
      assert.ok(sourceById.has(ref.distance.source_row_id));
    }
  }
});

test('keeps source identities stable while parentizing exactly 35 mountain bodies', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const candidates = await readJsonl(join(rootDir, 'ledger/candidates.jsonl'));
  const effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));
  const expected = new Map([
    ['taishan-yuhuang-ding', ['taishan', '泰山', '玉皇顶']],
    ['huashan-nanfeng', ['huashan', '华山', '南峰']],
    ['huangshan-lianhua-feng', ['huangshan', '黄山', '莲花峰']],
    ['emeishan-wanfo-ding', ['emeishan', '峨眉山', '万佛顶']],
    ['fanjingshan-hongyun-jinding', ['fanjingshan', '梵净山', '红云金顶']],
    ['hengshan-tianfeng-ling', ['hengshan-shanxi', '恒山', '天峰岭']],
    ['hengshan-zhurong-feng', ['hengshan-hunan', '衡山', '祝融峰']],
    ['songshan-junji-feng', ['songshan', '嵩山', '峻极峰']],
    ['wutaishan-yedou-feng', ['wutaishan', '五台山', '北台叶斗峰']],
    ['wudangshan-tianzhu-feng', ['wudangshan', '武当山', '天柱峰']],
    ['tianzhushan-tianzhu-feng', ['tianzhushan-anhui', '天柱山', '天柱峰']],
    ['sanqingshan-yujing-feng', ['sanqingshan', '三清山', '玉京峰']],
    ['lushan-hanyang-feng', ['lushan', '庐山', '汉阳峰']],
    ['laojunshan-mazong-ling', ['laojunshan-henan', '老君山', '马鬃岭']],
    ['laoshan-jufeng', ['laoshan', '崂山', '巨峰']],
    ['wugongshan-jinding-jiangxi', ['wugongshan-jiangxi', '武功山', '金顶']],
    ['taibaishan-baxian-tai', ['taibaishan', '太白山', '拔仙台']],
    ['yuntaishan-zhuyu-feng-henan', ['yuntai-shan-henan', '云台山（河南）', '茱萸峰']],
    ['changbaishan-baiyun-feng', ['changbaishan', '长白山', '白云峰']],
    ['luofushan-feiyun-ding', ['luofushan', '罗浮山', '飞云顶']],
    ['baiyunshan-yuhuang-ding-henan', ['baiyun-shan-luoyang', '洛阳白云山', '玉皇顶']],
    ['cangshan-malong-feng', ['cangshan-yunnan', '苍山', '马龙峰']],
    ['chaya-shan-tianmo-feng', ['chaya-shan', '嵖岈山', '天磨峰']],
    ['huaguoshan-yunv-feng', ['huaguoshan-jiangsu', '花果山', '玉女峰']],
    ['jigongshan-baoxiao-feng', ['jigongshan', '鸡公山', '报晓峰']],
    ['jiugongshan-laoya-jian', ['jiugongshan', '九宫山', '老鸦尖']],
    ['jiuhuashan-shiwang-feng', ['jiuhuashan', '九华山', '十王峰']],
    ['kunyushan-taibo-ding', ['kunyushan', '昆嵛山', '泰礴顶']],
    ['shennongshan-zijin-ding', ['shennongshan', '神农山', '紫金顶']],
    ['tianjieshan-laoye-ding', ['tianjieshan', '天界山', '老爷顶']],
    ['wangwushan-tiantan-feng', ['wangwushan', '王屋山', '天坛峰']],
    ['yandangshan-baigang-jian', ['yandangshan-zhejiang', '雁荡山', '百岗尖']],
    ['yaoshan-yuhuang-ding', ['yaoshan-henan', '尧山', '玉皇顶']],
    ['yimengshan-guimeng-ding', ['yimengshan-guimeng', '沂蒙山龟蒙', '龟蒙顶']],
    ['yishan-yuhuang-ding', ['yishan-shandong', '沂山', '玉皇顶']],
  ]);

  assert.equal(expected.size, 35);
  for (const [sourceKey, [effectiveKey, name, summit]] of expected) {
    const candidate = candidates.find((row) => row.canonical_key === sourceKey);
    assert.equal(candidate.source_identity.name, candidate.aliases.find((alias) => alias === candidate.source_identity.name));
    assert.equal(candidate.effective_canonical_key, effectiveKey);
    assert.equal(candidate.primary_name, name);
    assert.equal(candidate.primary_summit, summit);
    assert.equal(candidate.entity_type, 'peak');
    assert.equal(candidate.massif_key, null);
    assert.ok(effective.some((row) => row.effective_canonical_key === effectiveKey));
  }

  assert.equal(new Set(effective.map((row) => row.effective_canonical_key)).size, effective.length);
  assert.ok(effective.some((row) => row.effective_canonical_key === 'hengshan-shanxi' && row.primary_name === '恒山'));
  assert.ok(effective.some((row) => row.effective_canonical_key === 'hengshan-hunan' && row.primary_name === '衡山'));
  assert.ok(effective.some((row) => row.effective_canonical_key === 'baiyun-shan-luoyang'));
  assert.ok(effective.some((row) => row.effective_canonical_key === 'yuntai-shan-henan'));
});

test('resolves four synthetic mountain bodies and preserves the approved 2/2/2/1 route topology', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const candidates = await readJsonl(join(rootDir, 'ledger/candidates.jsonl'));
  const effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));
  const expected = {
    'yuzhu-feng': 2,
    'huanggang-shan': 2,
    'wuling-shan': 2,
    'tiantang-zhai': 1,
  };

  for (const [key, routeCount] of Object.entries(expected)) {
    const entity = effective.find((row) => row.effective_canonical_key === key);
    assert.equal(entity.mountain_routes.length, routeCount);
    assert.ok(entity.source_candidate_keys.every((sourceKey) => candidates.find((row) => row.canonical_key === sourceKey)?.disposition === 'merge'));
  }

  const tiantang = effective.find((row) => row.effective_canonical_key === 'tiantang-zhai');
  assert.equal(tiantang.primary_name, '天堂寨');
  assert.deepEqual(tiantang.mountain_routes[0].source_candidate_keys, ['tiantang-zhai-anhui', 'tiantang-zhai-hubei']);
  assert.equal(tiantang.mountain_routes[0].entrance, '未核入口');

  const huanggang = effective.find((row) => row.effective_canonical_key === 'huanggang-shan');
  assert.equal(huanggang.primary_name, '黄岗山');
  assert.deepEqual(huanggang.mountain_routes.map((route) => route.entrance).sort(), ['桐木村', '篁村'].sort());
  assert.ok(huanggang.source_candidate_keys.includes('wuyishan-huanggang-merge'));
  assert.ok(!huanggang.mountain_routes.some((route) => route.route_raws.some((raw) => raw.includes('天游峰'))));
  const tianyou = candidates.find((row) => row.canonical_key === 'wuyishan-huanggang-merge');
  assert.ok(tianyou.field_issues.classic_route.some((issue) => issue.status === 'conflict'));
  assert.ok(tianyou.field_issues.length.some((issue) => issue.status === 'conflict'));

  const wuling = effective.find((row) => row.effective_canonical_key === 'wuling-shan');
  assert.equal(wuling.primary_name, '雾灵山');
});

test('keeps 22 named massif members independent and applies all ten special-entity rulings', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const candidates = await readJsonl(join(rootDir, 'ledger/candidates.jsonl'));
  const effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));

  assert.deepEqual(countBy(effective.filter((row) => ['siguniang', 'gongga', 'sanao', 'dangling', 'kongur', 'yuzhu'].includes(row.massif_key)), 'massif_key'), {
    dangling: 2,
    gongga: 8,
    kongur: 2,
    sanao: 3,
    siguniang: 5,
    yuzhu: 2,
  });

  const bySource = (key) => candidates.find((row) => row.canonical_key === key);
  assert.deepEqual(
    ['yading-xiannairi', 'yading-yangmaiyong', 'yading-xianuoduoji'].map((key) => {
      const row = bySource(key);
      return [row.primary_name, row.massif_key, row.access_status, row.permit_required, row.publication_status];
    }),
    [
      ['仙乃日', 'yading', 'closed', null, 'draft'],
      ['央迈勇', 'yading', 'closed', null, 'draft'],
      ['夏诺多吉', 'yading', 'closed', null, 'draft'],
    ],
  );
  assert.ok(!effective.some((row) => row.effective_canonical_key === 'yading-scenic-hike'));

  const yulong = bySource('yulong-xueshan-xuebao-ding');
  assert.equal(yulong.primary_name, '玉龙雪山');
  assert.equal(yulong.primary_summit, '扇子陡');
  assert.equal(yulong.access_status, 'restricted');
  assert.equal(yulong.mountain_routes.length, 1);
  assert.equal(yulong.mountain_routes[0].access_status, 'open');

  const kawagebo = bySource('kawagebo-weifeng');
  assert.equal(kawagebo.primary_name, '卡瓦格博峰');
  assert.equal(kawagebo.access_status, 'closed');
  assert.equal(kawagebo.permit_required, null);
  assert.equal(kawagebo.mountain_routes.length, 0);

  assert.equal(bySource('namchabarwa-weifeng').permit_required, true);
  assert.equal(bySource('nyainqentanglha-weifeng').permit_required, true);
  assert.equal(bySource('nianbaoyuze-weifeng').access_status, 'closed');
  assert.ok(bySource('nianbaoyuze-weifeng').field_issues.altitude.some((issue) => issue.status === 'unverified'));
  assert.ok(bySource('nianbaoyuze-weifeng').field_issues.gps.some((issue) => issue.status === 'unverified'));
  assert.equal(bySource('yala-weifeng').access_status, 'unknown');

  const weizhou = bySource('weizhoudao-huoshankou');
  assert.equal(weizhou.primary_name, '涠洲岛火山地貌游览线');
  assert.equal(weizhou.entity_type, 'route_corridor');
  assert.equal(weizhou.disposition, 'keep_route');
  assert.equal(weizhou.mountain_routes[0].access_status, 'open');
  assert.equal(weizhou.mountain_routes[0].permit_required, false);
  assert.ok(weizhou.field_issues.altitude.some((issue) => issue.status === 'withheld'));

  const yubeng = effective.find((row) => row.effective_canonical_key === 'yubeng-route');
  assert.ok(yubeng);
  assert.ok(!kawagebo.mountain_routes.some((route) => route.source_candidate_keys.includes('yubeng-route')));
});

test('never promotes contributions marked conflict, missing, unverified or withheld', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  let effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));

  const yulong = effective.find((row) => row.effective_canonical_key === 'yulong-xueshan');
  assert.equal(yulong.altitude.value_m, null);
  assert.equal(yulong.gps.present, false);
  assert.equal(yulong.length.value_km, null);

  const nianbao = effective.find((row) => row.effective_canonical_key === 'nianbaoyuze');
  assert.equal(nianbao.altitude.value_m, null);
  assert.equal(nianbao.gps.present, false);

  const weizhou = effective.find((row) => row.effective_canonical_key === 'weizhou-volcanic-landform-route');
  assert.equal(weizhou.altitude.value_m, null);

  const missing = effective.find((row) => row.effective_canonical_key === 'kongur-feng');
  assert.equal(missing.gps.present, false);

  const overridePath = join(rootDir, 'overrides.json');
  const overrides = JSON.parse(await readFile(overridePath, 'utf8'));
  overrides.by_canonical_key['dongling-shan'].field_issues.altitude = [{
    status: 'missing',
    reason: '受控测试：即使 raw 有值，missing contribution 也不得提升',
    source_candidate_keys: ['dongling-shan'],
  }];
  await writeFile(overridePath, stableJson(overrides), 'utf8');
  await generateLedger({ rootDir });
  effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));
  assert.equal(effective.find((row) => row.effective_canonical_key === 'dongling-shan').altitude.value_m, null);
});

test('separates final effective identities from D-group source labels', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const candidates = await readJsonl(join(rootDir, 'ledger/candidates.jsonl'));
  const effective = await readJsonl(join(rootDir, 'ledger/effective_canonicals.jsonl'));
  const reconciliation = await readFile(join(rootDir, 'ledger/reconciliation.md'), 'utf8');

  const expectedMappings = new Map([
    ['yulong-xueshan-xuebao-ding', 'yulong-xueshan'],
    ['kawagebo-weifeng', 'kawagebo'],
    ['namchabarwa-weifeng', 'namchabarwa'],
    ['nianbaoyuze-weifeng', 'nianbaoyuze'],
    ['nyainqentanglha-weifeng', 'nyainqentanglha'],
    ['yala-weifeng', 'yala-xueshan'],
    ['weizhoudao-huoshankou', 'weizhou-volcanic-landform-route'],
  ]);
  for (const [sourceKey, effectiveKey] of expectedMappings) {
    assert.equal(candidates.find((row) => row.canonical_key === sourceKey).effective_canonical_key, effectiveKey);
    assert.ok(effective.some((row) => row.effective_canonical_key === effectiveKey));
  }

  const forbiddenAliases = [
    '玉龙雪山雪宝顶',
    '卡瓦格博峰（卫峰）',
    '南迦巴瓦峰卫峰',
    '年保玉则卫峰',
    '念青唐古拉峰卫峰',
    '仙乃日卫峰',
    '央迈勇卫峰',
    '夏诺多吉卫峰',
    '雅拉雪山卫峰',
    '涠洲岛火山口主峰',
  ];
  const effectiveAliases = new Set(effective.flatMap((row) => row.aliases));
  for (const alias of forbiddenAliases) assert.ok(!effectiveAliases.has(alias), `forbidden effective alias: ${alias}`);

  const weizhou = effective.find((row) => row.effective_canonical_key === 'weizhou-volcanic-landform-route');
  assert.ok(weizhou.classic_routes.every((route) => !route.includes('主峰')));
  assert.ok(weizhou.mountain_routes.flatMap((route) => route.route_raws).every((route) => !route.includes('主峰')));

  assert.match(reconciliation, /A-group parentized mountain bodies: 35/);
  assert.match(reconciliation, /D-group Yulong primary summit corrections: 1/);
  assert.doesNotMatch(reconciliation, /Parentized mountain bodies: 36/);
});

test('validates v4 status enums, effective keys and merge targets', async (t) => {
  const rootDir = await createFixture(t);
  const overrides = JSON.parse(await readFile(join(rootDir, 'overrides.json'), 'utf8'));
  const clone = () => structuredClone(overrides);

  const missing = clone();
  missing.by_canonical_key['guancen-shan'].effective_canonical_key = 'missing-target';
  missing.by_canonical_key['guancen-shan'].merge_target_effective_canonical_key = 'missing-target';
  assert.throws(() => validateOverrideGraph(missing), /does not exist/);

  const self = clone();
  self.by_canonical_key['guancen-shan'].effective_canonical_key = 'guancen-shan';
  self.by_canonical_key['guancen-shan'].merge_target_effective_canonical_key = 'guancen-shan';
  assert.throws(() => validateOverrideGraph(self), /cannot target itself/);

  const duplicate = clone();
  duplicate.by_canonical_key['dongling-shan'].effective_canonical_key = duplicate.by_canonical_key['taishan-yuhuang-ding'].effective_canonical_key;
  assert.throws(() => validateOverrideGraph(duplicate), /duplicate effective canonical key/);

  const badStatus = clone();
  badStatus.by_canonical_key['dongling-shan'].publication_status = 'review';
  assert.throws(() => validateOverrideGraph(badStatus), /publication_status/);

  const unopened = clone();
  unopened.by_canonical_key['dongling-shan'].access_status = 'unopened';
  assert.throws(() => validateOverrideGraph(unopened), /access_status/);

  const cyclic = clone();
  cyclic.by_canonical_key['guancen-shan'].effective_canonical_key = 'wuyishan-huanggang-merge';
  cyclic.by_canonical_key['guancen-shan'].merge_target_effective_canonical_key = 'wuyishan-huanggang-merge';
  cyclic.by_canonical_key['wuyishan-huanggang-merge'].effective_canonical_key = 'guancen-shan';
  cyclic.by_canonical_key['wuyishan-huanggang-merge'].merge_target_effective_canonical_key = 'guancen-shan';
  assert.throws(() => validateOverrideGraph(cyclic), /cycle/);
});

test('normal generation consumes but never overwrites v2 manual overrides', async (t) => {
  const rootDir = await createFixture(t);
  const overridePath = join(rootDir, 'overrides.json');
  const overrides = JSON.parse(await readFile(overridePath, 'utf8'));
  overrides.by_canonical_key['dongling-shan'].reason = '人工复核保留';
  await writeFile(overridePath, stableJson(overrides), 'utf8');
  const manuallyEditedBytes = await readFile(overridePath);

  await generateLedger({ rootDir });
  assert.deepEqual(await readFile(overridePath), manuallyEditedBytes);
  const candidates = await readJsonl(join(rootDir, 'ledger/candidates.jsonl'));
  assert.equal(candidates.find((row) => row.canonical_key === 'dongling-shan').reason, '人工复核保留');

  await generateLedger({ rootDir, forceBootstrap: true });
  const restored = JSON.parse(await readFile(overridePath, 'utf8'));
  assert.equal(restored.schema_version, 2);
  assert.equal(restored.by_canonical_key['dongling-shan'].reason, '北京最高峰，单一峰顶，数据完整');
  assert.deepEqual(restored.synthetic_canonicals, {});
});

test('a failed generation preserves all prior ledger artifacts and leaves no transaction residue', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const before = await snapshot(rootDir, MANAGED_OUTPUTS.slice(0, 4));

  const overridePath = join(rootDir, 'overrides.json');
  const overrides = JSON.parse(await readFile(overridePath, 'utf8'));
  overrides.by_canonical_key['guancen-shan'].effective_canonical_key = 'missing-target';
  overrides.by_canonical_key['guancen-shan'].merge_target_effective_canonical_key = 'missing-target';
  await writeFile(overridePath, stableJson(overrides), 'utf8');

  await assert.rejects(generateLedger({ rootDir }), /does not exist/);
  assertSnapshotEqual(before, await snapshot(rootDir, MANAGED_OUTPUTS.slice(0, 4)));
  const rootEntries = await readdir(rootDir);
  assert.deepEqual(rootEntries.filter((name) => /ledger-(?:staging|backup)|overrides\..*tmp/.test(name)), []);
});

test('--check detects missing, mismatched and unexpected v2 artifacts', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  await checkLedger({ rootDir });

  const effectivePath = join(rootDir, 'ledger/effective_canonicals.jsonl');
  await unlink(effectivePath);
  await assert.rejects(checkLedger({ rootDir }), /missing managed artifact/);

  await generateLedger({ rootDir });
  const candidatesPath = join(rootDir, 'ledger/candidates.jsonl');
  await writeFile(candidatesPath, `${await readFile(candidatesPath, 'utf8')}\n`, 'utf8');
  await assert.rejects(checkLedger({ rootDir }), /content mismatch/);

  await generateLedger({ rootDir });
  await writeFile(join(rootDir, 'ledger/canonical.jsonl'), '{}\n', 'utf8');
  await assert.rejects(checkLedger({ rootDir }), /unexpected managed artifact/);
});

test('normal reruns are byte-identical and keep current overrides stable', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const before = await snapshot(rootDir);

  await generateLedger({ rootDir });
  const after = await snapshot(rootDir);

  assertSnapshotEqual(before, after);
  await checkLedger({ rootDir });
});

test('Phase 0 generation preserves separately managed semantics and enrichment layers', async (t) => {
  const rootDir = await createFixture(t);
  await generateLedger({ rootDir });
  const semantics = '{"effective_canonical_key":"sample"}\n';
  const review = '# Entity semantics review\n';
  const enrichment = '{"effective_canonical_key":"sample"}\n';
  const enrichmentReview = '# Ledger enrichment review\n';
  await writeFile(join(rootDir, 'ledger/entity-semantics.jsonl'), semantics);
  await writeFile(join(rootDir, 'ledger/entity-semantics-review.md'), review);
  await writeFile(join(rootDir, 'ledger/effective-canonical-enrichment.jsonl'), enrichment);
  await writeFile(join(rootDir, 'ledger/enrichment-review.md'), enrichmentReview);

  await generateLedger({ rootDir });
  await checkLedger({ rootDir });
  assert.equal(await readFile(join(rootDir, 'ledger/entity-semantics.jsonl'), 'utf8'), semantics);
  assert.equal(await readFile(join(rootDir, 'ledger/entity-semantics-review.md'), 'utf8'), review);
  assert.equal(
    await readFile(join(rootDir, 'ledger/effective-canonical-enrichment.jsonl'), 'utf8'),
    enrichment,
  );
  assert.equal(
    await readFile(join(rootDir, 'ledger/enrichment-review.md'), 'utf8'),
    enrichmentReview,
  );
});

test('README names the source and effective layers without changing frozen provenance', async () => {
  const readme = await readFile(join(SOURCE_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /812 source records/);
  assert.match(readme, /406 source-bound candidates/);
  assert.match(readme, /403 frozen source-resolved identities/);
  assert.match(readme, /399 effective-mapped identities/);
  assert.match(readme, /359 final effective canonicals/);
  assert.match(readme, /`effective_canonicals\.jsonl`/);
});
