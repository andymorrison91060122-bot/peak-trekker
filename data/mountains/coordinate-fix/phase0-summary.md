# T13 R2 Phase 0 · Review Round 4

Status: STOP after Phase 0. No coordinate-provider collection, no production write, no migration, no app/runtime GPS verification change.

## Repository-Tree Artifacts

All Phase 0 artifacts live under `data/mountains/coordinate-fix/` in the mountain-data worktree. Nothing is stored only in `output/` or a transient evidence directory. They remain uncommitted/unpushed at this STOP checkpoint pending review.

- `gold-set.jsonl` + `gold-set.sha256`
- `legacy-regression-observations.jsonl`
- `legacy-regression-observations.sql`
- `production-zero-write-check.sql`
- `validation-policy.json`
- `t13-coordinate-sidecar.schema.json`
- `summit-target-proposal.schema.json`
- `summit-target-review.schema.json`
- `source-request-manifest.schema.json`
- `mechanical-evidence.schema.json`
- `phase0-contract.mjs`
- `phase0-contract.test.mjs`
- `phase0-schema-strict.test.mjs`
- `derived-value-audit.md`
- `refine-phase0-gold.mjs`

Repository-level reproducibility is now explicit:

- `package.json` pins `ajv=8.17.1` and `ajv-formats=3.0.1`.
- `package-lock.json` locks those versions.
- `npm run test:t13-phase0` runs both the executable contract tests and Ajv 2020 strict-schema tests.
- No temporary `ajv-cli`, external `node_modules` path, or one-off validation harness is counted as gate evidence.

## Gold Set Is Smoke/Regression Evidence, Not Accuracy

The 31 frozen rows remain mechanically separated:

| Frozen membership | Count | Current use |
| --- | ---: | --- |
| `catalog_accuracy_13` | 13 | Historical membership label only; connectivity smoke |
| `summit_accuracy_independent_summit_7` | 7 | Connectivity smoke only; list every case |
| `legacy_regression_18` | 18 | Historical compatibility and displacement review |

None of these groups is now a catalog-wide accuracy denominator.

The seven summit cases are 博格达峰、布洛阿特峰、卡瓦格博峰、公格尔九别峰、慕士塔格峰、南迦巴瓦峰、乔戈里峰（K2）. Every result/count that mentions these cases must carry this adjacent disclaimer:

> 样本为 7 座世界级高峰，不代表目录整体，尤其不代表低海拔小山。

A standalone `7/7` claim is forbidden. The other six authority cases retain `coordinate_target_role=none`; they remain catalog-connection smoke only.

## Accuracy Strategy

### DEM local-maximum gate

`resolved` now requires `dem_local_maximum_sanity=passed`. There is no caller-supplied boolean verifier: the calculation helper consumes a versioned mechanical-evidence bundle, scans its DEM samples, recomputes the gate, and requires the stored gate object to equal the computed result.

Phase 0 deliberately does **not** claim those samples came from a real Copernicus tile. The pinned GeoTIFF adapter is not implemented yet, so the effective validator always rejects `resolved` with an explicit adapter-blocked error after checking source adapters and before accepting DEM evidence. Phase 1 must implement and test that repository adapter; until then no effective summit coordinate can pass.

Selected dataset: Copernicus DEM GLO-30 (`COP-DEM_GLO-30-DGED`):

- global 30m digital surface model
- horizontal CRS WGS-84 G1150 / EPSG:4326
- vertical datum EGM2008 / EPSG:3855
- official access through Copernicus Data Space S3-compatible object storage or OData
- registered account and temporary credentials required

Local-maximum proposal:

- geodesic radius `R=300m`, roughly ten 30m samples from the candidate in each direction
- candidate must lie within `45m` of a maximum cell
- candidate DEM height must be no more than `8m` below the window maximum
- the separate ledger-altitude tolerance gate still applies
- a failed or unavailable DEM gate yields `needs_review`/`unresolved`; it is never waived for coverage

GLO-30 is a DSM, so vegetation and structures can affect low-elevation maxima. This is disclosed rather than hidden; the manual audit must inspect those cases.

### Stratified random manual audit

The accuracy source is a fixed-seed, approximately 30-row human audit sampled from all 359 rows before provider results are known.

- seed: `t13-stratified-audit-v1-2026-07-26`
- strata: difficulty, altitude band, province
- selection: proportional marginal targets across all three dimensions; deterministic SHA-256 tie-break
- blocked/missing/unresolved selections are retained, never replaced by famous or easy cases
- the selected JSONL and SHA must be frozen before Phase 1 provider requests
- evidence packet includes candidate/adopted coordinates, every source vote, name/elevation evidence, DEM local window/profile, terrain or satellite reference, and raw inputs/computations for every sanity gate

## P0 Distance Vulnerability Closed

`phase0-contract.mjs` now:

1. validates every source vote coordinate and WGS-84 datum;
2. derives lineage from a registered `source_family` mapping, so Wikidata and Wikipedia cannot label themselves as independent;
3. mechanically computes Haversine distance for every different-lineage pair;
4. requires the minimum pair distance to be `<=150m`;
5. rounds the computed metric to millimetres and requires `best_pair_distance_m` to equal it exactly;
6. requires the adopted summit coordinate to equal one validated source vote that itself has a different-lineage partner within `150m`.
7. reruns the pinned Overpass/GNS adapter from original response bytes and binds source-vote names/coordinates/literals to that exact canonical adapter output, so padding a raw `30.1` into a claimed `30.1000` coordinate cannot pass.
8. applies the same raw binding to `catalog_coordinate`: provider coordinates must match a pinned adapter feature, while frozen seed coordinates must match the ledger row's `gps.raw` literals and canonical row SHA.

The validator rejects:

- different lineages thousands of kilometres apart with forged `best_pair_distance_m=15`;
- a close pair whose supplied distance is altered;
- two entries from one lineage;
- Wikidata/Wikipedia entries that forge separate lineage labels.

## Proposal → Review → Effective Boundary

The collector may only create standalone `summit-target-proposal` records with `proposal_status=pending_review` and `effective_sidecar_eligible=false`.

Before any proposal can enter the effective semantic path:

- `proposalSha256()` hashes canonical stable-key proposal bytes;
- `validateSummitTargetReviewBinding()` recomputes and compares that SHA;
- proposal id and canonical key must match;
- the decision must be approved;
- approved target role/name must match the proposal;
- proposal name must resolve to the frozen ledger's primary name, primary summit, or aliases;
- proposal elevation tolerance is derived from fixed altitude bands rather than accepted from the proposal;
- all four sanity gates are mechanically recomputed from the same evidence bundle;
- source features must exist byte-for-byte in output rederived by a pinned repository adapter;
- DEM evidence remains fail-closed until a pinned GeoTIFF adapter can rederive samples from original tile bytes;
- the effective `reviewed_semantic_override` must carry the same proposal id/SHA and the validator requires the exact bound proposal and review objects.

The review decision remains a separate artifact. A review-artifact id string by itself is insufficient and is rejected.

## Derived-Value Audit

The full itemized audit is in `derived-value-audit.md`.

Mechanically closed in Phase 0:

- independent lineage count from source votes
- Haversine best-pair distance and the 150m threshold
- proposal elevation delta/tolerance from bound source evidence and the frozen ledger
- normalized proposal name membership in the frozen ledger
- normalized request hash from request parameters
- response and parsed-output hashes plus deterministic adapter replay from original cached bytes
- proposal review SHA across proposal, review, and effective query target
- gold/evidence/query SHA from file bytes
- pseudo-precision grid classification from coordinates plus the frozen production precision snapshot
- province bbox, seed displacement, elevation-source, and DEM-window verdict computations
- exact decimal-expression proof from required coordinate literals

Phase 1 still has to collect the real provider/CAS bytes and implement the pinned Copernicus GeoTIFF adapter. Phase 0 closes Overpass/GNS response-to-feature derivation and effective proposal/review binding; because DEM derivation remains unimplemented, labels or self-consistent hashes still cannot make a record resolved.

## Legacy Regression Promotion Review

Production coordinates are historical state, not summit truth. Final Phase 0 promotion result remains **0 of 18 promoted**.

Observed grid signals remain:

- strong two-axis whole-arcminute signal: 6
- medium two-axis whole-arcsecond or mixed signal: 8
- weak single-axis whole-arcsecond signal: 4
- no grid signal: 0

Read-only production evidence remains non-diagnostic for promotion: zero stored distances are not proof, terminal session outcome ratios are not verification-attempt pass rates, several rows mix non-GPS sources, and semantic ambiguities remain.

The roughly 31.4km difference implied by 武夷山 → `huanggang-shan` remains explicitly excluded from coordinate-untrustworthiness evidence because it is a semantic scope difference.

## Network Manifest Contract

Every source request records normalized request parameters/hash, adapter version, HTTP status, response hash/CAS path, parsed-output hash/CAS path, fetch timestamp, cache-hit flag, source license, outcome, and reason.

`missing`, `blocked`, and `rate_limited` remain mechanically distinct. `validateSourceRequestEntry()` is now the combined artifact entry: it recomputes the response and parsed-output SHA values from their original byte buffers, verifies both CAS paths, reruns the pinned adapter from the response, requires byte-identical canonical output, and derives `missing` versus `complete` from that output rather than trusting the manifest label.

## Frozen Inputs Rechecked

- `data/mountains/ledger/effective_canonicals.jsonl`: `5fe0f8fcc4154f10c014cfee79c6b57b6582eed77f9b0445c72ddfd593da4294`
- `data/mountains/ledger/entity-semantics.jsonl`: `45e8685f42968cedfa6b3f7adbb998c5cdbe28af74b823b77975be838aa0cd8a`
- `data/mountains/ledger/effective-canonical-enrichment.jsonl`: `b3f43ef40e009c35ee1ca96aed9d55038afe4eb76a39b9c7bb37f2e4404cfee5`

All three remain 359 lines. The gold-set SHA remains `fdf2d6234d5acdeda9e2ab29051e15e05ca048dc9155e6578defd2608b25e2ff`.

## Boundaries

- No coordinate-source provider requests were made.
- Production access remained read-only; no new production query was required for this correction.
- No production row, schema, migration ledger, storage object, or auth record was written.
- No frozen ledger, app file, migration, or runtime verification helper was changed.
- Phase 1 has not started.
