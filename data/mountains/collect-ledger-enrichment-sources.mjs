import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { chooseGnsCandidate } from './build-ledger-enrichment.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENRICHMENT_DIR = join(ROOT, 'enrichment');
const SNAPSHOT_DIR = join(ENRICHMENT_DIR, 'snapshots/sha256');
const GNS_QUERY_URL =
  'https://geonames.nga.mil/geon-ags/rest/services/RESEARCH/GIS_OUTPUT/MapServer/0/query';
const ADAPTER_VERSION = 'ledger-enrichment-sources-v1';
const execFileAsync = promisify(execFile);
const OUT_FIELDS = [
  'ufi',
  'uni',
  'full_name',
  'all_names',
  'desig_cd',
  'fc',
  'adm1',
  'cc_ft',
  'lat_dd',
  'long_dd',
  'nt',
  'lang_cd',
  'term_dt_f',
  'term_dt_n',
  'mod_dt_ft',
  'mod_dt_nm',
].join(',');

const BBOXES = Object.freeze({
  xinjiang: {
    source_id: 'province-bbox-v1:xinjiang',
    minLat: 34,
    maxLat: 49.5,
    minLon: 73,
    maxLon: 96.5,
  },
  yunnan: {
    source_id: 'province-bbox-v1:yunnan',
    minLat: 21,
    maxLat: 29.5,
    minLon: 97,
    maxLon: 106.5,
  },
  xizang: {
    source_id: 'province-bbox-v1:xizang',
    minLat: 26.5,
    maxLat: 36.5,
    minLon: 78,
    maxLon: 99.5,
  },
  qinghai: {
    source_id: 'province-bbox-v1:qinghai',
    minLat: 31,
    maxLat: 39.5,
    minLon: 89,
    maxLon: 103.5,
  },
  sichuan: {
    source_id: 'province-bbox-v1:sichuan',
    minLat: 26,
    maxLat: 34.5,
    minLon: 97,
    maxLon: 108.6,
  },
});

const GNS_TARGETS = Object.freeze([
  {
    key: 'bogeda-feng',
    targetName: '博格达峰',
    names: ['博格达峰', 'Bogda Peak', 'Bogda Feng', 'Bogeda Feng'],
    allowedAdm1: ['CN-XJ'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
    knownLocation: { latitude: 43.8, longitude: 88.34 },
    forcedUfi: 12181329,
  },
  {
    key: 'broad-peak',
    targetName: '布洛阿特峰',
    names: ['布洛阿特峰', 'Broad Peak', 'Falchan Kangri'],
    allowedAdm1: ['CN-XJ', 'PK-GB', 'S1-000'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'gasherbrum-1-feng',
    targetName: '加舒尔布鲁木I峰',
    names: ['加舒尔布鲁木I峰', 'Gasherbrum I', 'Hidden Peak'],
    allowedAdm1: ['CN-XJ', 'PK-GB', 'S1-000'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'gasherbrum-2-feng',
    targetName: '加舒尔布鲁木II峰',
    names: ['加舒尔布鲁木II峰', 'Gasherbrum II'],
    allowedAdm1: ['CN-XJ', 'PK-GB', 'S1-000'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'hantengeli-feng',
    targetName: '汗腾格里峰',
    names: ['汗腾格里峰', 'Khan Tengri', 'Hantengri Feng'],
    allowedAdm1: ['CN-XJ', 'KZ-19', 'KG-Y', 'S1-000'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'kawagebo',
    targetName: '卡瓦格博峰',
    names: ['卡瓦格博峰', 'Kawagarbo', 'Kawagebo', 'Meili Xueshan'],
    allowedAdm1: ['CN-YN', 'CN-XZ', 'S1-000'],
    bbox: BBOXES.yunnan,
    province: '云南省',
  },
  {
    key: 'kongur-feng',
    targetName: '公格尔峰',
    names: ['公格尔峰', '公格尔山', 'Kongur', 'Kongur Tagh', 'Kongur Shan'],
    allowedAdm1: ['CN-XJ'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'kongur-jiubie-feng',
    targetName: '公格尔九别峰',
    names: ['公格尔九别峰', '公格尔山九别峰', 'Kongur Tiube', 'Kongur Jiubie Feng'],
    allowedAdm1: ['CN-XJ'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'muztagata-feng',
    targetName: '慕士塔格峰',
    names: ['慕士塔格峰', 'Muztagh Ata', 'Muztagata', 'Muztag Ata'],
    allowedAdm1: ['CN-XJ'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'namchabarwa',
    targetName: '南迦巴瓦峰',
    names: ['南迦巴瓦峰', '南迦巴瓦', 'Namcha Barwa', 'Namjagbarwa Feng'],
    allowedAdm1: ['CN-XZ'],
    bbox: BBOXES.xizang,
    province: '西藏自治区',
  },
  {
    key: 'nianbaoyuze',
    targetName: '年保玉则',
    names: ['年保玉则', 'Nianbaoyuze', 'Nyenbo Yurtse', 'Nianbaoyuze Feng'],
    allowedAdm1: ['CN-QH', 'CN-SC', 'S1-000'],
    bbox: BBOXES.qinghai,
    province: '青海省',
  },
  {
    key: 'nyainqentanglha',
    targetName: '念青唐古拉峰',
    names: [
      '念青唐古拉峰',
      'Nyainqêntanglha Feng',
      'Nyainqentanglha',
      'Nyenchen Tanglha',
      'Nyainqentanglha Feng',
    ],
    allowedAdm1: ['CN-XZ'],
    bbox: BBOXES.xizang,
    province: '西藏自治区',
  },
  {
    key: 'qiaogeli-feng-k2',
    targetName: '乔戈里峰（K2）',
    names: ['乔戈里峰（K2）', '乔戈里峰', 'K2', 'Mount K2', 'Qogir Feng', 'Chhogori'],
    allowedAdm1: ['CN-XJ', 'PK-GB', 'S1-000'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'tuomuer-feng',
    targetName: '托木尔峰',
    names: ['托木尔峰', 'Tomur Peak', 'Pik Pobedy', 'Jengish Chokusu', 'Tömür'],
    allowedAdm1: ['CN-XJ', 'KG-Y', 'S1-000'],
    bbox: BBOXES.xinjiang,
    province: '新疆维吾尔自治区',
  },
  {
    key: 'yading-xiannairi',
    targetName: '仙乃日',
    names: ['仙乃日', 'Xiannairi', 'Chenrezig'],
    allowedAdm1: ['CN-SC'],
    bbox: BBOXES.sichuan,
    province: '四川省',
  },
  {
    key: 'yading-xianuoduoji',
    targetName: '夏诺多吉',
    names: ['夏诺多吉', 'Xianuoduoji', 'Chanadorje'],
    allowedAdm1: ['CN-SC'],
    bbox: BBOXES.sichuan,
    province: '四川省',
  },
  {
    key: 'yading-yangmaiyong',
    targetName: '央迈勇',
    names: ['央迈勇', 'Yangmaiyong', 'Jampelyang'],
    allowedAdm1: ['CN-SC'],
    bbox: BBOXES.sichuan,
    province: '四川省',
  },
  {
    key: 'yala-xueshan',
    targetName: '雅拉雪山',
    names: ['雅拉雪山', 'Yala Snow Mountain', 'Yala Kamiyama', 'Zhara Lhatse'],
    allowedAdm1: ['CN-SC'],
    bbox: BBOXES.sichuan,
    province: '四川省',
  },
  {
    key: 'yulong-xueshan',
    targetName: '扇子陡',
    names: ['扇子陡', '玉龙雪山扇子陡', 'Shanzidou', 'Shanzidou Peak'],
    allowedAdm1: ['CN-YN'],
    bbox: BBOXES.yunnan,
    province: '云南省',
  },
]);

const AUTHORITY_SOURCES = Object.freeze([
  {
    source_id: 'authority:sport-mountain-grade-standard',
    provider: '国家体育总局',
    url: 'https://www.sport.gov.cn/n315/n9041/n25319615/n25319760/c28467087/part/28467101.pdf',
    expected_content_type: 'application/pdf',
  },
  {
    source_id: 'authority:yunnan-yulong-2025-survey',
    provider: '云南省自然资源厅',
    url: 'https://dnr.yn.gov.cn/html/2025/shengtingdongtai_0623/4049856.html',
    expected_tokens: ['5590.2', '玉龙雪山'],
  },
  {
    source_id: 'authority:qinghai-nianbaoyuze',
    provider: '青海省人民政府',
    url: 'http://www.qinghai.gov.cn/dmqh/system/2015/08/12/010174685.shtml',
    expected_tokens: ['年保玉则', '5369'],
  },
  {
    source_id: 'authority:sichuan-yading',
    provider: '四川省台湾事务办公室',
    url: 'https://www.sctyzx.gov.cn/ywdt/201506/54249111.html',
    expected_tokens: ['仙乃日', '6032', '央迈勇', '5958', '夏诺多吉'],
  },
  {
    source_id: 'authority:sport-kawagebo',
    provider: '国家体育总局',
    url: 'https://www.sport.gov.cn/n4/n97/n103/c324771/content.html',
    expected_tokens: ['6740'],
  },
]);

const ALTITUDE_OVERRIDES = Object.freeze({
  kawagebo: {
    value_m: 6740,
    source_id: 'authority:sport-kawagebo',
    extraction_path: 'HTML text: 最高的卡格博峰（海拔6740米）',
  },
  namchabarwa: {
    value_m: 7782,
    source_id: 'authority:sport-mountain-grade-standard',
    extraction_path: 'PDF mountain list: 南迦巴瓦峰（7782米）',
  },
  nianbaoyuze: {
    value_m: 5369,
    source_id: 'authority:qinghai-nianbaoyuze',
    extraction_path: 'HTML paragraph: 年保玉则...海拔5369米',
  },
  nyainqentanglha: {
    value_m: 7162,
    source_id: 'authority:sport-mountain-grade-standard',
    extraction_path: 'PDF mountain list: 念青唐古拉峰（7162米）',
  },
  'yading-xiannairi': {
    value_m: 6032,
    source_id: 'authority:sichuan-yading',
    extraction_path: 'HTML paragraph: 仙乃日（海拔6032米）',
  },
  'yading-yangmaiyong': {
    value_m: 5958,
    source_id: 'authority:sichuan-yading',
    extraction_path: 'HTML paragraph: 央迈勇（5958米）',
  },
  'yading-xianuoduoji': {
    value_m: 5958,
    source_id: 'authority:sichuan-yading',
    extraction_path: 'HTML paragraph: 夏诺多吉（5958米）',
  },
  'yulong-xueshan': {
    value_m: 5590.2,
    source_id: 'authority:yunnan-yulong-2025-survey',
    extraction_path: 'HTML title/body: 5590.2米！玉龙雪山高程这样测定',
  },
});

const LENGTH_OVERRIDES = Object.freeze({
  'helan-shan': {
    length_km: 12,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  'huanggang-shan': {
    length_km: 12,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  'lue-shan': {
    length_km: 10,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  taishan: {
    length_km: 10.5,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  'tiantang-zhai': {
    length_km: 10,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  'wugongshan-jiangxi': {
    length_km: 8,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  'wuling-shan': {
    length_km: 12,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
  wutaishan: {
    length_km: 20,
    route_semantic: 'round_trip',
    status: 'exact',
    resolution: 'claude_canonical_pick',
  },
});

const CURATED_COORDINATES = Object.freeze({
  nianbaoyuze: {
    target_name: '年保玉则',
    latitude: 33.28,
    longitude: 101.14,
    province: '青海省',
    bbox: BBOXES.qinghai,
  },
  'yading-xiannairi': {
    target_name: '仙乃日',
    latitude: 28.39,
    longitude: 100.33,
    province: '四川省',
    bbox: BBOXES.sichuan,
  },
  'yading-yangmaiyong': {
    target_name: '央迈勇',
    latitude: 28.33,
    longitude: 100.31,
    province: '四川省',
    bbox: BBOXES.sichuan,
  },
  'yading-xianuoduoji': {
    target_name: '夏诺多吉',
    latitude: 28.43,
    longitude: 100.36,
    province: '四川省',
    bbox: BBOXES.sichuan,
  },
  'yala-xueshan': {
    target_name: '雅拉雪山',
    latitude: 30.72,
    longitude: 101.47,
    province: '四川省',
    bbox: BBOXES.sichuan,
  },
  'yulong-xueshan': {
    target_name: '扇子陡',
    latitude: 27.1,
    longitude: 100.18,
    province: '云南省',
    bbox: BBOXES.yunnan,
  },
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function gnsUrl(target) {
  const params = new URLSearchParams({
    where: target.names.map((name) => `full_name=${sqlLiteral(name)}`).join(' OR '),
    outFields: OUT_FIELDS,
    returnGeometry: 'false',
    f: 'json',
  });
  return `${GNS_QUERY_URL}?${params}`;
}

async function fetchBytes(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '--http1.1',
        '--location',
        '--silent',
        '--show-error',
        '--max-time',
        '90',
        '--user-agent',
        'PeakTrekker-FU51-ledger-enrichment/1.0',
        '--write-out',
        '\n__PT_META__%{http_code}\t%{content_type}',
        url,
      ], {
        encoding: 'buffer',
        maxBuffer: 20 * 1024 * 1024,
      });
      const marker = Buffer.from('\n__PT_META__');
      const markerIndex = stdout.lastIndexOf(marker);
      assert(markerIndex >= 0, `curl metadata marker missing for ${url}`);
      const bytes = stdout.subarray(0, markerIndex);
      const [statusText, contentType = 'application/octet-stream'] =
        stdout.subarray(markerIndex + marker.length).toString('utf8').split('\t');
      const httpStatus = Number(statusText);
      if (httpStatus >= 200 && httpStatus < 300) {
        return {
          bytes,
          http_status: httpStatus,
          content_type: contentType,
          retrieved_at: new Date().toISOString(),
        };
      }
      lastError = new Error(`HTTP ${httpStatus} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 1000));
  }
  throw lastError;
}

function coordinatePrecision(value) {
  const text = String(value);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function uniqueGnsCandidates(features, target) {
  const byUfi = new Map();
  for (const feature of features) {
    const attributes = feature.attributes;
    if (!target.names.includes(attributes.full_name)) continue;
    if (!['PK', 'MT'].includes(attributes.desig_cd)) continue;
    const candidate = {
      ufi: attributes.ufi,
      uni: attributes.uni,
      full_name: attributes.full_name,
      all_names: attributes.all_names,
      desig_cd: attributes.desig_cd,
      adm1: attributes.adm1,
      cc_ft: attributes.cc_ft,
      latitude: attributes.lat_dd,
      longitude: attributes.long_dd,
      nt: attributes.nt,
      lang_cd: attributes.lang_cd,
      term_dt_f: attributes.term_dt_f,
      term_dt_n: attributes.term_dt_n,
      mod_dt_ft: attributes.mod_dt_ft,
      mod_dt_nm: attributes.mod_dt_nm,
      coordinate_precision: Math.max(
        coordinatePrecision(attributes.lat_dd),
        coordinatePrecision(attributes.long_dd),
      ),
    };
    const existing = byUfi.get(candidate.ufi);
    const candidateRank = target.names.indexOf(candidate.full_name);
    const existingRank = existing ? target.names.indexOf(existing.full_name) : Number.POSITIVE_INFINITY;
    if (!existing || candidateRank < existingRank) byUfi.set(candidate.ufi, candidate);
  }
  return [...byUfi.values()];
}

function inBbox(coordinate, bbox) {
  return coordinate.latitude >= bbox.minLat
    && coordinate.latitude <= bbox.maxLat
    && coordinate.longitude >= bbox.minLon
    && coordinate.longitude <= bbox.maxLon;
}

async function writeSnapshot(stageDir, bytes) {
  const hash = sha256(bytes);
  const relativePath = `enrichment/snapshots/sha256/${hash}`;
  const path = join(stageDir, 'snapshots/sha256', hash);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return { hash, relativePath };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function installStage(stageDir, manifestBody, overrideBody) {
  const snapshotStage = join(stageDir, 'snapshots');
  const snapshotTarget = join(ENRICHMENT_DIR, 'snapshots');
  const snapshotBackup = join(ENRICHMENT_DIR, `.snapshots-backup-${process.pid}`);
  await mkdir(ENRICHMENT_DIR, { recursive: true });
  let movedOld = false;
  try {
    if (await pathExists(snapshotTarget)) {
      await rename(snapshotTarget, snapshotBackup);
      movedOld = true;
    }
    await rename(snapshotStage, snapshotTarget);
    await writeFile(join(ENRICHMENT_DIR, 'source-manifest.json.tmp'), manifestBody);
    await rename(
      join(ENRICHMENT_DIR, 'source-manifest.json.tmp'),
      join(ENRICHMENT_DIR, 'source-manifest.json'),
    );
    const overridePath = join(ENRICHMENT_DIR, 'field-overrides.json');
    if (!await pathExists(overridePath)) {
      await writeFile(`${overridePath}.tmp`, overrideBody);
      await rename(`${overridePath}.tmp`, overridePath);
    }
    if (movedOld) await rm(snapshotBackup, { recursive: true, force: true });
  } catch (error) {
    await rm(snapshotTarget, { recursive: true, force: true }).catch(() => {});
    if (movedOld) await rename(snapshotBackup, snapshotTarget).catch(() => {});
    throw error;
  }
}

export async function collectLedgerEnrichmentSources() {
  const stageDir = join(ENRICHMENT_DIR, `.stage-${process.pid}`);
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  const sources = [];
  const coordinates = {};
  try {
    const curatedBody = Buffer.from(stableJson({
      schema_version: 1,
      source_id: 'curated:claude-canonical-six-v1',
      source_class: 'curated_canonical',
      note: 'claude_curated; GNS无峰顶候选; 低风险字段(不显示); 非verified',
      coordinates: Object.fromEntries(
        Object.entries(CURATED_COORDINATES)
          .map(([key, value]) => [key, {
            target_name: value.target_name,
            latitude: value.latitude,
            longitude: value.longitude,
          }])
          .sort(([left], [right]) => left.localeCompare(right, 'en')),
      ),
    }));
    const curatedSnapshot = await writeSnapshot(stageDir, curatedBody);
    sources.push({
      source_id: 'curated:claude-canonical-six-v1',
      source_class: 'curated_canonical',
      provider: 'Claude curated canonical',
      url: null,
      http_status: null,
      content_type: 'application/json',
      response_body_sha256: curatedSnapshot.hash,
      cas_path: curatedSnapshot.relativePath,
      retrieved_at: null,
      adapter_version: ADAPTER_VERSION,
      transport: 'controlled',
    });

    for (const target of GNS_TARGETS) {
      const url = gnsUrl(target);
      const response = await fetchBytes(url);
      const snapshot = await writeSnapshot(stageDir, response.bytes);
      const sourceId = `gns:${target.key}`;
      sources.push({
        source_id: sourceId,
        source_class: 'authority_reference',
        provider: 'NGA Geographic Names Server',
        url,
        http_status: response.http_status,
        content_type: response.content_type,
        response_body_sha256: snapshot.hash,
        cas_path: snapshot.relativePath,
        retrieved_at: response.retrieved_at,
        adapter_version: ADAPTER_VERSION,
      });
      const payload = JSON.parse(response.bytes.toString('utf8'));
      assert(!payload.error, `GNS error for ${target.key}: ${JSON.stringify(payload.error)}`);
      const candidates = uniqueGnsCandidates(payload.features || [], target);
      if (candidates.length === 0) {
        const curated = CURATED_COORDINATES[target.key];
        assert(curated, `GNS has no candidate and no approved curated coordinate for ${target.key}`);
        assert(inBbox(curated, curated.bbox), `curated coordinate outside bbox for ${target.key}`);
        coordinates[target.key] = {
          latitude: curated.latitude,
          longitude: curated.longitude,
          source_id: 'curated:claude-canonical-six-v1',
          extraction_path: `coordinates.${target.key}`,
          chosen_ufi: null,
          chosen_uni: null,
          chosen_name: curated.target_name,
          chosen_designation: null,
          selection_reason:
            'claude_curated; GNS无峰顶候选; 低风险字段(不显示); 非verified',
          multi_candidate: false,
          candidate_spread_m: 0,
          candidates: [],
          curated: true,
          gns_no_candidate_source_id: sourceId,
          province_bbox_sanity: {
            passed: true,
            matched_provinces: [curated.province],
            bbox_source_id: curated.bbox.source_id,
          },
        };
        continue;
      }
      const decision = chooseGnsCandidate({
        targetName: target.targetName,
        acceptedNames: target.names,
        allowedAdm1: target.allowedAdm1,
        bbox: target.bbox,
        knownLocation: target.knownLocation || null,
        candidates,
      });
      if (target.forcedUfi != null) {
        assert.equal(decision.chosen.ufi, target.forcedUfi, `${target.key} did not select forced UFI`);
      }
      const selectionReason = target.key === 'bogeda-feng'
        ? 'matches known summit ≈43.80N,88.34E/5445m; rejected -1899019 @15.9km east'
        : decision.selection_reason;
      coordinates[target.key] = {
        latitude: decision.chosen.latitude,
        longitude: decision.chosen.longitude,
        source_id: sourceId,
        extraction_path: `ArcGIS features grouped by UFI; chosen UFI ${decision.chosen.ufi}`,
        chosen_ufi: decision.chosen.ufi,
        chosen_uni: decision.chosen.uni,
        chosen_name: decision.chosen.full_name,
        chosen_designation: decision.chosen.desig_cd,
        selection_reason: selectionReason,
        multi_candidate: decision.multi_candidate,
        candidate_spread_m: decision.candidate_spread_m,
        candidates: decision.candidates,
        province_bbox_sanity: {
          passed: true,
          matched_provinces: [target.province],
          bbox_source_id: target.bbox.source_id,
        },
      };
    }

    for (const authority of AUTHORITY_SOURCES) {
      const response = await fetchBytes(authority.url);
      if (authority.expected_content_type) {
        assert(
          response.content_type.toLowerCase().includes(authority.expected_content_type),
          `${authority.source_id} content type mismatch: ${response.content_type}`,
        );
      }
      const text = response.bytes.toString('utf8');
      for (const token of authority.expected_tokens || []) {
        assert(text.includes(token), `${authority.source_id} missing expected token: ${token}`);
      }
      const snapshot = await writeSnapshot(stageDir, response.bytes);
      sources.push({
        source_id: authority.source_id,
        source_class: 'authority_reference',
        provider: authority.provider,
        url: authority.url,
        http_status: response.http_status,
        content_type: response.content_type,
        response_body_sha256: snapshot.hash,
        cas_path: snapshot.relativePath,
        retrieved_at: response.retrieved_at,
        adapter_version: ADAPTER_VERSION,
      });
    }

    sources.sort((left, right) => left.source_id.localeCompare(right.source_id, 'en'));
    const manifest = {
      schema_version: 1,
      adapter_version: ADAPTER_VERSION,
      sources,
    };
    const overrides = {
      schema_version: 1,
      frozen_inputs: {
        'ledger/effective_canonicals.jsonl':
          '5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294',
        'ledger/entity-semantics.jsonl':
          '45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a',
      },
      coordinates: Object.fromEntries(
        Object.entries(coordinates).sort(([left], [right]) => left.localeCompare(right, 'en')),
      ),
      lengths: LENGTH_OVERRIDES,
      altitudes: ALTITUDE_OVERRIDES,
    };
    await installStage(stageDir, stableJson(manifest), stableJson(overrides));
    await rm(stageDir, { recursive: true, force: true });
    return {
      sources: sources.length,
      coordinates: Object.keys(coordinates).length,
      altitudes: Object.keys(ALTITUDE_OVERRIDES).length,
    };
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

async function runCli() {
  assert(process.argv.length === 2, `unexpected arguments: ${process.argv.slice(2).join(' ')}`);
  const result = await collectLedgerEnrichmentSources();
  process.stdout.write(
    `collected: sources=${result.sources}, coordinates=${result.coordinates}, altitudes=${result.altitudes}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  } finally {
    clearInterval(keepAlive);
  }
}
