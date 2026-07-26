import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DIFFICULTY_MAP,
  LICENSE_MAP,
  buildLedgerEnrichment,
  buildRiskNote,
  buildRouteNote,
  checkLedgerEnrichment,
  chooseGnsCandidate,
  estimateDuration,
  generateLedgerEnrichment,
  mapDifficulty,
  parseRouteCandidates,
  parseRouteSemantic,
  selectRepresentativeRoute,
} from './build-ledger-enrichment.mjs';

const ROOT = new URL('.', import.meta.url).pathname;

test('difficulty and product-license mappings remain explicit and ordered', () => {
  assert.deepEqual(DIFFICULTY_MAP, {
    休闲观光级: 'beginner',
    轻装徒步入门级: 'intermediate',
    高海拔进阶级: 'advanced',
    专业技术攀登级: 'expert',
  });
  assert.deepEqual(LICENSE_MAP, {
    beginner: 'none',
    intermediate: 'basic',
    advanced: 'intermediate',
    expert: 'advanced',
  });
  assert.equal(mapDifficulty('高海拔进阶级/专业技术攀登级'), 'expert');
  assert.equal(mapDifficulty('休闲观光级/轻装徒步入门级'), 'intermediate');
});

test('route semantics are exact, mutually exclusive, and unresolved lengths stay null', () => {
  assert.equal(parseRouteSemantic('景区正门往返主峰10km', true), 'round_trip');
  assert.equal(parseRouteSemantic('大本营至峰顶单程20km', true), 'one_way');
  assert.equal(parseRouteSemantic('景区环线4km', true), 'loop');
  assert.equal(parseRouteSemantic('南北穿越18km', true), 'traverse');
  assert.equal(parseRouteSemantic('昭苏县-夏塔古道徒步线20km', true), 'unmarked');
  assert.equal(parseRouteSemantic('未知', false), null);
  assert.throws(
    () => parseRouteSemantic('往返穿越20km', true),
    /multiple route semantics/,
  );
});

test('route candidates keep label, semantic, and distance bound within each literal segment', () => {
  assert.deepEqual(
    parseRouteCandidates(
      '鸿门岩-五台大朝台环线50km；常规台怀镇-北台往返20km',
      'wutaishan-yedou-feng',
    ),
    [
      {
        route_label: '鸿门岩-五台大朝台',
        semantic: 'loop',
        km: 50,
        raw_segment: '鸿门岩-五台大朝台环线50km',
        source_candidate_keys: ['wutaishan-yedou-feng'],
      },
      {
        route_label: '常规台怀镇-北台',
        semantic: 'round_trip',
        km: 20,
        raw_segment: '常规台怀镇-北台往返20km',
        source_candidate_keys: ['wutaishan-yedou-feng'],
      },
    ],
  );
  assert.deepEqual(
    parseRouteCandidates('大本营往返主峰18km', 'genie-shan')[0],
    {
      route_label: '大本营→主峰',
      semantic: 'round_trip',
      km: 18,
      raw_segment: '大本营往返主峰18km',
      source_candidate_keys: ['genie-shan'],
    },
  );
});

test('representative route uses longest distance then the locked semantic tie-break', () => {
  const selected = selectRepresentativeRoute([
    ...parseRouteCandidates('北线单程20km', 'north'),
    ...parseRouteCandidates('南线穿越20km', 'south'),
    ...parseRouteCandidates('主线往返20km', 'main'),
    ...parseRouteCandidates('短环线18km', 'short'),
  ]);
  assert.equal(selected.km, 20);
  assert.equal(selected.semantic, 'round_trip');
  assert.equal(selected.route_label, '主线');
});

test('S1.3 keeps ambiguous multi-route values at route scope instead of promoting one mountain length', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const byKey = new Map(model.records.map((row) => [row.effective_canonical_key, row]));
  const ambiguousKeys = [
    'helan-shan',
    'huanggang-shan',
    'lue-shan',
    'wuling-shan',
    'yubeng-route',
    'yuzhu-feng',
  ];

  for (const key of ambiguousKeys) {
    const row = byKey.get(key);
    assert.equal(row.length.length_km, null, `${key} mountain length must stay null`);
    assert.equal(row.length.route_semantic, 'conflict', `${key} mountain semantic must be conflict`);
    assert.equal(row.length.selected_route, null, `${key} must not select one route`);
    assert.equal(row.estimated_duration_min, null, `${key} must not estimate mountain duration`);
    assert.equal(row.duration_status, 'not_estimated_length_missing');
    assert.equal(
      row.length.routes.length >= (key === 'yubeng-route' ? 1 : 2),
      true,
      `${key} per-route records missing`,
    );
    assert.equal(row.route_note.includes('km'), false, `${key} route note must not publish one distance`);
    for (const route of row.length.routes) {
      assert.equal(typeof route.route_label, 'string');
      assert.equal(['round_trip', 'one_way', 'loop', 'traverse', 'unmarked'].includes(route.semantic), true);
      assert.equal(route.km == null || typeof route.km === 'number', true);
      assert.equal(route.aspect == null || ['north', 'south'].includes(route.aspect), true);
    }
  }

  assert.deepEqual(
    byKey.get('yuzhu-feng').length.routes.map((route) => ({
      km: route.km,
      semantic: route.semantic,
      aspect: route.aspect,
    })),
    [
      { km: 18, semantic: 'round_trip', aspect: 'north' },
      { km: 16, semantic: 'round_trip', aspect: 'south' },
    ],
  );
  assert.deepEqual(
    byKey.get('yubeng-route').length.routes.map((route) => ({
      route_label: route.route_label,
      km: route.km,
      semantic: route.semantic,
    })),
    [
      { route_label: '神瀑线', km: null, semantic: 'round_trip' },
    ],
  );
  assert.match(byKey.get('yubeng-route').route_note, /雨崩神瀑往返线/u);
  assert.doesNotMatch(byKey.get('yubeng-route').route_note, /冰湖/u);
  assert.doesNotMatch(byKey.get('yubeng-route').route_note, /环线/u);
  assert.doesNotMatch(byKey.get('yubeng-route').intro, /环线/u);
});

test('S1.3 preserves four confirmed representative routes', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const byKey = new Map(model.records.map((row) => [row.effective_canonical_key, row]));
  const expected = {
    wutaishan: { km: 50, semantic: 'loop', label: '鸿门岩-五台大朝台' },
    'wugongshan-jiangxi': { km: 18, semantic: 'traverse', label: '龙山村-发云界-金顶' },
    'xiling-xueshan': { km: 25, semantic: 'round_trip', label: '西岭镇-大本营-主峰' },
    'tiantang-zhai': { km: 10, semantic: 'round_trip', label: '景区正门线' },
  };

  for (const [key, route] of Object.entries(expected)) {
    const row = byKey.get(key);
    assert.equal(row.length.length_km, route.km);
    assert.equal(row.length.route_semantic, route.semantic);
    assert.equal(row.length.selected_route.route_label, route.label);
    assert.match(row.route_note, new RegExp(`${route.km}km`));
  }
});

test('S1.3 marks the Altyn-Tagh altitude disagreement as a non-promoted conflict', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const row = model.records.find((record) => record.effective_canonical_key === 'aerjin-shan');
  assert.equal(row.altitude.original_m, 5828);
  assert.equal(row.altitude.enriched_m, null);
  assert.equal(row.altitude.effective_m, null);
  assert.equal(row.altitude.status, 'conflict');
  assert.equal(row.altitude.source_class, null);
  assert.deepEqual(row.altitude.conflict_values_m, [5798, 5828]);
  assert.match(row.intro, /阿尔金山主峰位于甘肃省阿克塞境内/u);
  assert.doesNotMatch(row.intro, /5828|5798|国家级自然保护区/u);
});

test('S1.4 intro overrides close all 359 keys without access or qualification claims', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  assert.equal(model.records.filter((row) => row.intro != null).length, 359);

  const banned = /最友好|容易|轻松|入门|亲民|说走就走/u;
  const qualification =
    /许可|手续|申请制|备案|审批|攀登须|攀登需|需具备|须具备|专业向导|技术装备|高海拔技能/u;
  for (const row of model.records) {
    assert(Array.isArray(row.intro_added_claims), `${row.effective_canonical_key} added_claims missing`);
    assert.doesNotMatch(row.intro, banned, `${row.effective_canonical_key} downplays risk`);
    assert.doesNotMatch(row.intro, qualification, `${row.effective_canonical_key} qualification leak`);
  }

  const byKey = new Map(model.records.map((row) => [row.effective_canonical_key, row]));
  assert.equal(
    byKey.get('muztagata-feng').intro,
    '人称"冰川之父"的慕士塔格峰，7546米冰川漫坡，常作为高海拔登山的训练目标。',
  );
  assert.match(byKey.get('yuzhu-feng').intro, /常作为高海拔登山的训练目标/u);
  assert.doesNotMatch(byKey.get('yuzhu-feng').intro, /入门级雪山/u);
  assert.equal(byKey.get('tianhua-shan').intro_added_claims.length, 0);
  assert.equal(byKey.get('jiaoding-shan').intro_added_claims.length, 0);
});

test('S1.4 intros remove access requirements and declare structured added claims', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const records = model.records;
  assert.equal(records.length, 359);

  const accessLanguage = /许可|手续|申请制|备案|审批/u;
  const downplayingLanguage = /最友好|容易|轻松|入门|亲民|说走就走/u;
  for (const row of records) {
    assert.doesNotMatch(row.intro, accessLanguage, `${row.effective_canonical_key} access language`);
    assert.doesNotMatch(row.intro, downplayingLanguage, `${row.effective_canonical_key} downplaying`);
    for (const claim of row.intro_added_claims) {
      assert.equal(typeof claim, 'object');
      assert.equal(typeof claim.claim, 'string');
      assert(['source', 'safety_generic', 'needs_review'].includes(claim.basis));
    }
    if (row.intro_added_claims.some((claim) => claim.basis === 'needs_review')) {
      assert.notEqual(
        row.provenance.content.intro.generation_note,
        'ai_one_time_source_grounded',
      );
    }
  }

  const byKey = new Map(records.map((row) => [row.effective_canonical_key, row]));
  for (const [key, claimPattern] of [
    ['huaguoshan-jiangsu', /玉女峰/u],
    ['jinggang-shan', /五指峰/u],
    ['baiyun-shan-guangdong', /摩星岭/u],
    ['baiyun-shan-luoyang', /玉皇顶/u],
  ]) {
    const claims = byKey.get(key).intro_added_claims;
    assert(
      claims.some((claim) =>
        claim.basis === 'needs_review' && claimPattern.test(claim.claim)),
      `${key} must declare its world-knowledge addition`,
    );
  }

  const cleanupRows = model.stats.intro_permit_cleanup_count;
  assert.equal(cleanupRows, 70);
  const cleanupSection = model.artifacts['ledger/enrichment-review.md']
    .match(/## S1\.4 Intro Permit Cleanup[\s\S]*?## /u)?.[0] || '';
  assert.equal((cleanupSection.match(/^\| `/gmu) || []).length, 70);
});

test('S1.4 risk copy separates capability guidance from legal assertions', () => {
  const advanced = buildRiskNote('advanced');
  const expert = buildRiskNote('expert');

  for (const note of [advanced, expert]) {
    assert.match(note, /专业向导/u);
    assert.match(note, /技术装备/u);
    assert.match(note, /相应审批/u);
    assert.match(note, /具体要求请向当地主管部门与专业机构确认/u);
    assert.match(note, /自然保护区核心区及未开发未开放区域禁止擅自进入/u);
    assert.match(note, /开放范围以当地最新公告为准/u);
    assert.doesNotMatch(
      note,
      /办正规手续|官方登山许可|须持证向导|违规进入将依|救援费用依|由个人承担/u,
    );
  }
});

test('S1.4 access status covers all entities without inventing per-mountain legal bans', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  assert.deepEqual(model.stats.access_statuses, {
    closed: 7,
    open: 347,
    pilgrimage_only: 1,
    unknown: 4,
  });

  const nonOpen = model.records.filter((row) => row.access_status !== 'open');
  assert.equal(nonOpen.length, 12);
  for (const row of nonOpen) {
    assert.equal(typeof row.access_source, 'string');
    assert(row.access_source.length > 0);
    assert.equal(typeof row.access_note, 'string');
    assert(row.access_note.length > 0);
    assert.doesNotMatch(row.access_note, /法律明令禁止攀登/u);
    if (['closed', 'pilgrimage_only'].includes(row.access_status)) {
      assert(['regulation', 'religious', 'both'].includes(row.closed_basis));
    } else {
      assert.equal(row.closed_basis, null);
    }
  }

  assert.match(
    model.artifacts['ledger/enrichment-review.md'],
    /山峰存在周期性封山与临时管控（如防火期、生态修复期）/,
  );
});

test('S1.4 removes the closed Rain Village ice-lake route from effective content', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const rain = model.records.find((row) => row.effective_canonical_key === 'yubeng-route');
  assert.equal(rain.length.length_km, null);
  assert.deepEqual(
    rain.length.routes.map((route) => route.route_label),
    ['神瀑线'],
  );
  assert.doesNotMatch(rain.intro, /冰湖/u);
  assert.doesNotMatch(rain.route_note, /冰湖/u);
  assert.match(rain.intro, /神瀑/u);
  assert.match(rain.route_note, /神瀑/u);
});

test('S1.4 withholds disputed Yading altitudes and preserves both value groups', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const byKey = new Map(model.records.map((row) => [row.effective_canonical_key, row]));
  for (const [key, values] of [
    ['yading-xiannairi', [5998.5, 6032]],
    ['yading-yangmaiyong', [5958, 6033]],
    ['yading-xianuoduoji', [5951.3, 5958]],
  ]) {
    const altitude = byKey.get(key).altitude;
    assert.equal(altitude.status, 'conflict');
    assert.equal(altitude.effective_m, null);
    assert.equal(altitude.source_class, null);
    assert.deepEqual(altitude.conflict_values_m, values);
    assert.doesNotMatch(byKey.get(key).intro, /\d{4}(?:\.\d)?米/u);
  }
});

test('S1.4 keeps misbound satellite routes out of mountain-level distance', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const byKey = new Map(model.records.map((row) => [row.effective_canonical_key, row]));
  for (const key of [
    'kawagebo',
    'yading-xiannairi',
    'yading-yangmaiyong',
    'yading-xianuoduoji',
  ]) {
    const row = byKey.get(key);
    assert.equal(row.length.length_km, null);
    assert.equal(row.estimated_duration_min, null);
    assert(
      row.length.routes.every((route) =>
        ['satellite_peak', 'unbound'].includes(route.binding_status)),
      `${key} must retain only non-promoted satellite/unbound routes`,
    );
  }

  const baihaizi = byKey.get('gongga-baihaizi-shan');
  assert(
    baihaizi.review_flags.some((flag) =>
      flag.status === 'needs_review' && /白海子/u.test(flag.reason)),
  );
});

test('duration estimates only supported day-hike round trips and loops', () => {
  assert.deepEqual(estimateDuration({
    lengthKm: 10,
    difficulty: 'beginner',
    routeSemantic: 'round_trip',
  }), {
    estimated_duration_min: 300,
    estimated_duration: '5h',
    duration_status: 'estimated',
  });
  assert.deepEqual(estimateDuration({
    lengthKm: 18,
    difficulty: 'beginner',
    routeSemantic: 'round_trip',
  }), {
    estimated_duration_min: null,
    estimated_duration: null,
    duration_status: 'not_estimated_length_cap',
  });
  assert.deepEqual(estimateDuration({
    lengthKm: 16,
    difficulty: 'intermediate',
    routeSemantic: 'loop',
  }), {
    estimated_duration_min: 480,
    estimated_duration: '8h',
    duration_status: 'estimated',
  });
  assert.equal(estimateDuration({
    lengthKm: null,
    difficulty: 'beginner',
    routeSemantic: null,
  }).duration_status, 'not_estimated_length_missing');
  assert.equal(estimateDuration({
    lengthKm: 10,
    difficulty: 'expert',
    routeSemantic: 'round_trip',
  }).duration_status, 'not_estimated_difficulty');
  assert.equal(estimateDuration({
    lengthKm: 10,
    difficulty: 'beginner',
    routeSemantic: 'one_way',
  }).duration_status, 'not_estimated_route_semantic');
});

test('risk and route copy are deterministic and keep product safety boundaries explicit', () => {
  assert.equal(
    buildRiskNote('beginner'),
    '成熟景区步道，整体风险低。留意雨雪后台阶湿滑、旺季拥挤、山顶气温低于山下；按标识行进、量力而行。',
  );
  assert.equal(
    buildRiskNote('intermediate'),
    '成熟山野路线、新手友好但非铺装。留意碎石土路湿滑、岔路辨向、山区天气多变(防风保暖避雷雨)、预留下撤时间；建议结伴备水。',
  );
  assert.equal(
    buildRiskNote('advanced'),
    '高海拔路线含高反风险，需适应与体能储备。留意高原反应、剧烈天气、路线漫长易迷路；高海拔或技术型攀登通常需要专业向导、技术装备与相应审批，具体要求请向当地主管部门与专业机构确认。自然保护区核心区及未开发未开放区域禁止擅自进入。开放范围以当地最新公告为准。',
  );
  assert.equal(
    buildRiskNote('expert'),
    '技术型攀登含冰雪、岩壁与陡峭地形，风险极高，需成熟团队与完整技术能力。高海拔或技术型攀登通常需要专业向导、技术装备与相应审批，具体要求请向当地主管部门与专业机构确认。自然保护区核心区及未开发未开放区域禁止擅自进入。开放范围以当地最新公告为准。',
  );

  assert.equal(
    buildRouteNote({
      routeLabel: '黄山南大门-迎客松-莲花峰往返线',
      routeSemantic: 'round_trip',
      lengthKm: 12,
      difficulty: 'beginner',
    }),
    '经典线路：黄山南大门-迎客松-莲花峰往返线 · 往返12km · 石阶步道。本路线仅供参考，请结合现场情况、天气、专业地图、向导与自身能力综合判断。',
  );
  assert.equal(buildRouteNote({
    routeLabel: null,
    routeSemantic: null,
    lengthKm: null,
    difficulty: 'advanced',
  }), null);
});

test('GNS chooses one in-province peak deterministically and preserves all candidates', () => {
  const bogda = chooseGnsCandidate({
    targetName: '博格达峰',
    acceptedNames: ['博格达峰', 'Bogeda Feng'],
    allowedAdm1: ['CN-XJ'],
    bbox: { minLat: 34, maxLat: 49.5, minLon: 73, maxLon: 96.5 },
    knownLocation: { latitude: 43.8, longitude: 88.34 },
    candidates: [
      {
        ufi: -1899019,
        uni: 15052134,
        full_name: '博格达峰',
        desig_cd: 'PK',
        adm1: 'CN-XJ',
        latitude: 43.75,
        longitude: 88.533333,
        coordinate_precision: 6,
      },
      {
        ufi: 12181329,
        uni: 15043820,
        full_name: '博格达峰',
        desig_cd: 'PK',
        adm1: 'CN-XJ',
        latitude: 43.793232,
        longitude: 88.344441,
        coordinate_precision: 6,
      },
    ],
  });

  assert.equal(bogda.chosen.ufi, 12181329);
  assert.equal(bogda.multi_candidate, true);
  assert.equal(bogda.candidates.length, 2);
  assert.ok(bogda.candidate_spread_m > 15_000);
  assert.ok(bogda.candidate_spread_m < 16_500);
  assert.match(bogda.selection_reason, /positive UFI/);
});

test('GNS rejects cross-province and over-100km candidate sets', () => {
  const base = {
    targetName: '样例峰',
    acceptedNames: ['样例峰'],
    allowedAdm1: ['CN-XJ'],
    bbox: { minLat: 34, maxLat: 49.5, minLon: 73, maxLon: 96.5 },
    knownLocation: null,
  };
  assert.throws(() => chooseGnsCandidate({
    ...base,
    candidates: [
      { ufi: 1, full_name: '样例峰', desig_cd: 'PK', adm1: 'CN-XJ', latitude: 40, longitude: 80, coordinate_precision: 6 },
      { ufi: 2, full_name: '样例峰', desig_cd: 'PK', adm1: 'CN-QH', latitude: 40.1, longitude: 80.1, coordinate_precision: 6 },
    ],
  }), /cross-province/);
  assert.throws(() => chooseGnsCandidate({
    ...base,
    candidates: [
      { ufi: 1, full_name: '样例峰', desig_cd: 'PK', adm1: 'CN-XJ', latitude: 35, longitude: 75, coordinate_precision: 6 },
      { ufi: 2, full_name: '样例峰', desig_cd: 'PK', adm1: 'CN-XJ', latitude: 45, longitude: 90, coordinate_precision: 6 },
    ],
  }), /exceeds 100km/);
});

test('GNS excludes a remote same-name feature before province conflict checks', () => {
  const decision = chooseGnsCandidate({
    targetName: '布洛阿特峰',
    acceptedNames: ['布洛阿特峰', 'Broad Peak'],
    allowedAdm1: ['S1-000'],
    bbox: { minLat: 34, maxLat: 38, minLon: 73, maxLon: 79 },
    knownLocation: { latitude: 35.81, longitude: 76.57 },
    candidates: [
      {
        ufi: -3414670,
        full_name: 'Broad Peak',
        desig_cd: 'PK',
        adm1: 'S1-000',
        latitude: 35.810927,
        longitude: 76.568086,
        coordinate_precision: 6,
      },
      {
        ufi: 999,
        full_name: 'Broad Peak',
        desig_cd: 'PK',
        adm1: 'CA-NU',
        latitude: 68.5,
        longitude: -96.5,
        coordinate_precision: 6,
      },
    ],
  });

  assert.equal(decision.chosen.ufi, -3414670);
  assert.equal(decision.candidates.length, 1);
  assert.equal(decision.multi_candidate, false);
});

test('GNS collector pins curl to HTTP/1.1 and retains bounded retries', async () => {
  const source = await readFile(
    new URL('./collect-ledger-enrichment-sources.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /'--http1\.1'/);
  assert.match(source, /async function fetchBytes\(url, attempts = 3\)/);
});

test('builds the complete enrichment sidecar with expected trust and derivation counts', async () => {
  const model = await buildLedgerEnrichment(ROOT);
  const records = model.records;
  assert.equal(records.length, 359);
  assert.equal(new Set(records.map((row) => row.effective_canonical_key)).size, 359);

  const count = (selector) => records.filter(selector).length;
  assert.equal(count((row) => row.coordinate.source_class === 'seed_literal'), 340);
  assert.equal(count((row) => row.coordinate.source_class === 'authority_reference'), 13);
  assert.equal(count((row) => row.coordinate.source_class === 'curated_canonical'), 6);
  assert.equal(count((row) => row.coordinate.status === 'missing'), 0);
  assert.equal(count((row) => row.altitude.source_class === 'seed_literal'), 349);
  assert.equal(count((row) => row.altitude.source_class === 'authority_reference'), 5);
  assert.equal(count((row) => row.altitude.source_class === null), 5);
  assert.equal(
    count((row) => row.length.source_class === 'seed_claimed_platform_source'),
    359,
  );
  assert.equal(count((row) => row.length.source_class === 'platform_sourced'), 0);
  assert.equal(JSON.stringify(records).includes('"verified"'), false);
  assert.deepEqual(
    Object.fromEntries(
      ['beginner', 'intermediate', 'advanced', 'expert'].map((difficulty) => [
        difficulty,
        count((row) => row.difficulty.product_enum === difficulty),
      ]),
    ),
    {
      beginner: 151,
      intermediate: 133,
      advanced: 43,
      expert: 32,
    },
  );

  assert.deepEqual(model.stats.route_semantics, {
    conflict: 6,
    loop: 61,
    null: 9,
    one_way: 31,
    round_trip: 244,
    traverse: 7,
    unmarked: 1,
  });
  assert.deepEqual(model.stats.duration_statuses, {
    estimated: 258,
    not_estimated_difficulty: 65,
    not_estimated_length_cap: 13,
    not_estimated_length_missing: 15,
    not_estimated_route_semantic: 8,
  });

  const weizhou = records.find((row) =>
    row.effective_canonical_key === 'weizhou-volcanic-landform-route');
  assert.equal(weizhou.altitude.status, 'route_highpoint_missing');
  assert.equal(weizhou.altitude.effective_m, null);
  assert.equal(weizhou.altitude.source_class, null);

  for (const key of [
    'nianbaoyuze',
    'yading-xiannairi',
    'yading-xianuoduoji',
    'yading-yangmaiyong',
    'yala-xueshan',
    'yulong-xueshan',
  ]) {
    const row = records.find((record) => record.effective_canonical_key === key);
    assert.equal(row.coordinate.source_class, 'curated_canonical');
    assert.equal(row.coordinate.curated, true);
    assert.equal(row.coordinate.provenance_ids.includes('curated:claude-canonical-six-v1'), true);
    assert.equal(
      row.provenance.coordinate.some((item) =>
        item.kind === 'gns_no_candidate' && item.result === 'no_peak_candidate'),
      true,
    );
    assert.equal(
      row.provenance.coordinate.find((item) => item.kind === 'external_source').selection_reason,
      'claude_curated; GNS无峰顶候选; 低风险字段(不显示); 非verified',
    );
  }
  const manifest = JSON.parse(await readFile(
    new URL('./enrichment/source-manifest.json', import.meta.url),
    'utf8',
  ));
  assert.equal(
    manifest.sources.find((source) => source.source_id === 'curated:claude-canonical-six-v1').provider,
    'Claude curated canonical',
  );
  assert.equal(JSON.stringify(manifest).includes('user-approved'), false);

  const bogda = records.find((record) => record.effective_canonical_key === 'bogeda-feng');
  assert.equal(
    bogda.provenance.coordinate.find((item) => item.kind === 'external_source').selection_reason,
    'matches known summit ≈43.80N,88.34E/5445m; rejected -1899019 @15.9km east',
  );

  for (const row of records) {
    assert.equal(
      row.length.provenance_note,
      'seed distance library citing 8264/两步路; not per-mountain URL/track verified',
    );
    assert.equal(typeof row.risk_note, 'string');
    if (['advanced', 'expert'].includes(row.difficulty.product_enum)) {
      assert.equal(row.estimated_duration_min, null);
    }
    if (!['round_trip', 'loop', null, 'conflict'].includes(row.length.route_semantic)) {
      assert.equal(row.estimated_duration_min, null);
    }
    if (row.length.length_km > 16) {
      assert.equal(row.estimated_duration_min, null);
    }
    if (row.length.selected_route) {
      assert.equal(row.route_note.includes(row.length.route_label), true);
      assert.equal(row.route_note.includes(`${row.length.length_km}km`), true);
    } else if (row.length.resolution === 'per_route_only') {
      assert.equal(typeof row.route_note, 'string');
      assert.equal(row.route_note.includes('km'), false);
    } else {
      assert.equal(row.route_note, null);
    }
  }

  const expectedBoundRoutes = {
    taishan: 10.5,
    'tiantang-zhai': 10,
    'wugongshan-jiangxi': 18,
    wutaishan: 50,
    'xiling-xueshan': 25,
  };
  for (const [key, lengthKm] of Object.entries(expectedBoundRoutes)) {
    const row = records.find((record) => record.effective_canonical_key === key);
    assert.equal(row.length.length_km, lengthKm);
    assert.equal(row.length.status, 'exact');
    assert.equal(row.length.resolution, 'longest_bound_route_candidate');
    assert(row.length.selected_route);
    assert.match(row.route_note, new RegExp(`${lengthKm}km`));
  }
  assert.equal(
    records.find((row) => row.effective_canonical_key === 'wutaishan')
      .length.route_semantic,
    'loop',
  );
  assert.equal(
    records.find((row) => row.effective_canonical_key === 'wugongshan-jiangxi')
      .length.route_semantic,
    'traverse',
  );
  assert.equal(
    records.find((row) => row.effective_canonical_key === 'xiling-xueshan')
      .length.length_km,
    25,
  );
  assert.match(
    records.find((row) => row.effective_canonical_key === 'xiling-xueshan').route_note,
    /登山线：西岭镇-主峰大本营 · 往返25km/u,
  );
  assert.match(
    records.find((row) => row.effective_canonical_key === 'wutaishan').route_note,
    /五台大朝台 · 环线50km/u,
  );
  assert.match(
    records.find((row) => row.effective_canonical_key === 'wugongshan-jiangxi').route_note,
    /发云界-金顶 · 穿越18km/u,
  );
  const k2 = records.find((row) => row.effective_canonical_key === 'qiaogeli-feng-k2');
  assert.equal(k2.length.route_label, '大本营→主峰');
  assert.doesNotMatch(k2.route_note, /南坡|Abruzzi/u);

  const tenKmBenchmark = estimateDuration({
    lengthKm: 10,
    difficulty: 'beginner',
    routeSemantic: 'round_trip',
  });
  assert.equal(tenKmBenchmark.estimated_duration_min, 300);
  assert.equal(tenKmBenchmark.estimated_duration, '5h');

  const intros = records.filter((row) => row.intro != null);
  assert.equal(intros.length, 359);
  assert.deepEqual(
    [...new Set(intros.map((row) => row.difficulty.product_enum))].sort(),
    ['advanced', 'beginner', 'expert', 'intermediate'],
  );
  for (const remoteKey of [
    'cang-shan',
    'dadong-shan',
    'dushu-jian',
    'jiaoding-shan',
    'tianhua-shan',
  ]) {
    assert.equal(intros.some((row) => row.effective_canonical_key === remoteKey), true);
  }
  for (const row of intros) {
    const length = [...row.intro].length;
    assert(length >= 25 && length <= 45, `${row.effective_canonical_key} intro length=${length}`);
    assert.doesNotMatch(row.intro, /^[^，。]{1,20}海拔\d/u);
    assert.doesNotMatch(row.intro, /记忆点|路线信息|分别保留/u);
  }
  const introByKey = new Map(intros.map((row) => [row.effective_canonical_key, row.intro]));
  assert.equal(
    introByKey.get('aerjin-shan'),
    '阿尔金山主峰位于甘肃省阿克塞境内，是甘肃西部高山地貌的重要山峰。',
  );
  assert.equal(
    introByKey.get('bogeda-feng'),
    '天山东段主峰博格达峰，冰雪之巅俯临天山天池，是新疆醒目的雪山地标。',
  );
  assert.equal(
    introByKey.get('muztagata-feng'),
    '人称"冰川之父"的慕士塔格峰，7546米冰川漫坡，常作为高海拔登山的训练目标。',
  );
  assert.equal(
    introByKey.get('qiaogeli-feng-k2'),
    '世界第二高峰乔戈里峰，8611米陡峭冰岩矗立于喀喇昆仑山脉。',
  );
  assert.equal(
    introByKey.get('dadong-shan'),
    '广东经典徒步线，大东山的原始森林与山间温泉，藏着岭南少见的野趣。',
  );
  assert.equal(
    introByKey.get('yuzhu-feng'),
    '青藏线旁冰川铺展，6178米玉珠峰常作为高海拔登山的训练目标。',
  );

  const curatedBacklog = model.artifacts['ledger/enrichment-review.md']
    .match(/## 坐标精度补录 backlog[\s\S]*?## /)?.[0] || '';
  for (const key of [
    'nianbaoyuze',
    'yading-xiannairi',
    'yading-xianuoduoji',
    'yading-yangmaiyong',
    'yala-xueshan',
    'yulong-xueshan',
  ]) {
    assert.match(curatedBacklog, new RegExp(`\\\`${key}\\\``));
  }
  assert.doesNotMatch(model.artifacts['ledger/enrichment-review.md'], /已核实路线距离/);
  assert.match(
    model.artifacts['ledger/enrichment-review.md'],
    /多线路实体只保留 per-route 距离，不提升为山体单值/,
  );
  assert.match(model.artifacts['ledger/enrichment-review.md'], /山地粗估2km\/h、非真轨迹耗时/);
  assert.match(model.artifacts['ledger/enrichment-review.md'], /Part2 接两步路\/六只脚真距离\+真耗时\+轨迹/);

  const gangrenboqi = records.find((row) =>
    row.effective_canonical_key === 'gangrenboqi-cluster');
  assert.doesNotMatch(gangrenboqi.route_note, /周边山峰/);
  assert.match(gangrenboqi.route_note, /冈仁波齐转山/);

  const routeBacklog = records.filter((row) => row.route_note == null);
  assert(routeBacklog.length > 0);
});

test('generated artifacts check cleanly and rebuild byte-identically', async () => {
  const overrideUrl = new URL('./enrichment/field-overrides.json', import.meta.url);
  const overridesBefore = await readFile(overrideUrl);
  await generateLedgerEnrichment(ROOT);
  await checkLedgerEnrichment(ROOT);
  const result = await generateLedgerEnrichment(ROOT);
  const overridesAfter = await readFile(overrideUrl);
  assert.equal(result.byte_identical_to_existing, true);
  assert.deepEqual(overridesAfter, overridesBefore);
});
