# T13 Closeout Report

Date: 2026-07-27

## Boundary

- No production database write was performed.
- No migration was applied.
- No mountain row was imported or activated.
- No GPS verification logic or user-facing copy was changed.
- No commit or push was performed.

## 1. Final External Coordinate Decisions

| Key | Submitted coordinate | Source reachability | Entity and coordinate check | Seed displacement | Decision |
| --- | --- | --- | --- | ---: | --- |
| `zijin-shan-jiangsu` | 32.07251, 118.84057 | PASS: PeakWiki `pid=355` is reachable | PASS: page identifies 紫金山 / 钟山 / 北高峰, 448.9m, and the submitted coordinate; coordinate is independently identical to OSM `node/2600810866` | 1.099km | Adopt as `summit` |
| `xiang-shan` | 39.99006, 116.17157 | PASS: PeakWiki `pid=479` is reachable | PASS: page identifies 香炉峰, 575m, and the submitted coordinate; ledger route and intro independently identify 香炉峰 as the target within 北京香山 | 2.930km | Adopt as `summit` |
| `mogan-shan` | 30.61158, 119.85513 | PASS: PeakWiki `pid=697` is reachable | PASS: page identifies 莫干山 / 塔山, 720m, and the submitted coordinate; ledger route targets 塔山主峰; national survey elevation is 719.0m | 1.378km | Adopt as `summit` |
| `pan-shan` | 40.10394, 117.26868 | FAIL: cited 517户外 page returned HTTP 503 | Coordinate is 0.138km from the existing GNS area point, but the cited page and its coordinate text could not be verified | 3.516km | Discard submission; keep existing `area` coordinate |

The external channel ends with these decisions. No further external batches are
scheduled.

## 2. Xuedou Shan Elevation

The correction is verified.

- Existing ledger value: 800m.
- Official surveyed summit: 雪窦山黄泥浆岗, 971.7m.
- Import override:
  - `altitude_m_exact = 971.7`
  - integer display column using the approved half-up rule: `altitude = 972`
- The 800m value describes the scenic mountain area rather than the surveyed
  Huangnijianggang summit.

The frozen enrichment file was not edited. The correction is recorded in
`t13-final-import-overrides.json` for the eventual importer.

## 3. Final Radius Classification

| Bucket | Expected | Final | Delta |
| --- | ---: | ---: | ---: |
| Resolved summit, precision >=4dp -> 300m | 157 | 160 | +3 |
| Resolved area -> 2000m | 69 | 67 | -2 |
| Unresolved seed >=3dp -> 300m | 8 | 7 | -1 |
| Unresolved seed 2dp -> 2000m | 26 | 26 | 0 |
| Unresolved seed 1dp -> 15000m | 82 | 82 | 0 |
| Unresolved seed 0dp -> NULL radius, inactive | 17 | 17 | 0 |
| Total | 359 | 359 | 0 |

Difference explanation:

- 紫金山 and 莫干山 moved from resolved `area` to verified `summit`: summit
  `+2`, area `-2`.
- 香山 moved from unresolved seed `>=3dp` to verified `summit`: summit `+1`,
  unresolved high-precision seed `-1`.
- 盘山's unverified submission was discarded, so its existing `area`
  classification remains.

All 359 staged rows explicitly carry `is_active=false` and
`is_readable=false`. This is import staging only; the approved legacy
reconciliation must subsequently restore legacy readability without replacing
the 18 production coordinates.

The 17 zero-radius keys are:

1. `baima-xueshan-zhalaqueni-feng`
2. `baizhang-ling`
3. `dangling-xiaqiangla`
4. `dangling-xiaqiangniea`
5. `danxiashan-bazhai`
6. `duri-feng`
7. `gaoligongshan-gawagapu-feng`
8. `gongga-baihaizi-shan`
9. `gongga-tianhaizi-shan`
10. `hutiaoxia-gaolu-route`
11. `putuoshan-foding-shan`
12. `sanao-aotaiji`
13. `sanao-aotaimei`
14. `sanao-aotaina`
15. `wanfo-shan-anhui`
16. `wumeng-shan`
17. `zhangjiajie-qixing-shan`

## 4. S3-A Import Status: Blocked Before Production Write

The requested apply/import/reconciliation chain was not run because the local
source-of-truth package is incomplete and the current Migration A cannot safely
run in the requested order.

Hard blockers:

1. Frozen canonical ledger missing:
   `data/mountains/ledger/effective_canonicals.jsonl`.
   Expected SHA-256:
   `5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294`.
2. Source inputs needed to reproduce that exact frozen file are also absent:
   `README.md`, `seed-catalog.md`, `seed-distance.md`,
   `disposition-ledger.json`, and `overrides.json`.
3. The repository contains a report/preflight generator but no executable,
   production-ready importer for all 359 rows.
4. Migration A currently creates the activation trigger only after a legacy
   precheck. Applied before import, that precheck fails because current active
   legacy rows do not yet have the imported cover/risk fields. The migration
   comments themselves require it to run at the tail of the import transaction,
   which conflicts with the requested order "apply Migration A -> import".

Running production writes under these conditions would either fail partway or
force reconstruction of a frozen input, both of which violate the approved
data discipline. Therefore the operation stopped before the first Supabase
write.

To unblock:

- Restore the exact frozen canonical file (preferred) or an independently
  verified byte-identical backup.
- Restore or provide the reviewed 359-row importer.
- Split Migration A into:
  - schema/RLS additive pre-import portion; and
  - post-import precheck/activation-trigger portion,
  or execute the already-reviewed equivalent as one explicit transaction whose
  ordering is import-before-trigger.

## 5. Deferred Work

1. Resolve the 17 `0dp` / approximately 111km seed coordinates. They remain
   radius `NULL` and must remain inactive.
2. Evaluate 两步路 / 六只脚 / 8264 real GPS summit tracks as a future coordinate
   source. This is a separate acquisition and provenance project.

## Artifacts

- `t13-final-coordinate.jsonl`
  - 359 rows
  - SHA-256:
    `eada39739bc96daeee2352df81b3eaac5896b424a27ea17e8bef507579b78375`
- `t13-final-radius-summary.json`
- `t13-final-import-overrides.json`
- `build-t13-closeout.mjs`

The builder was run twice; the three generated artifact hashes were identical
across both runs.
