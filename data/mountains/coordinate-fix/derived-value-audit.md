# T13 Phase 0 · Derived-Value Trust Audit

Purpose: identify every current Phase 0 check that claims to validate a computed quantity and state whether it recomputes from raw inputs or trusts a supplied label.

| Quantity / claim | Raw input | Current mechanical check | Status |
| --- | --- | --- | --- |
| Source independence count | `source_votes[].source_family` | Known source family maps to a fixed lineage; distinct lineages are counted; supplied `source_lineage` and `independent_source_count` must match | Closed |
| Best independent-source distance | source-vote latitude/longitude | Haversine is recomputed for every different-lineage pair; minimum is rounded to 0.001m, must be `<=150m`, and must equal the supplied field | Closed |
| Source vote datum/range/literals | original provider response bytes | Pinned Overpass/GNS adapters are rerun from response bytes with lexical number capture; canonical output must equal parsed-output bytes, then the vote must equal the resulting feature | Closed for implemented adapters; unknown adapters fail |
| Adopted summit coordinate | adopted latitude/longitude + source votes | Adopted coordinate must equal one validated source vote and that vote must have a different-lineage partner within 150m; it cannot select an unrelated outlier | Closed |
| Proposal elevation delta and tolerance | frozen-ledger altitude + bound source feature elevation | Absolute delta is recomputed to 0.001m; supplied delta must match; tolerance is selected mechanically from fixed `100/150/250/400m` altitude bands and must equal the selected value | Closed |
| Proposal name match | candidate name + frozen-ledger primary/primary summit/aliases | Names are NFKC-normalized, case-folded, punctuation/space stripped; `matched_ledger_name` must exist in the frozen ledger and `match_type` must agree with primary-vs-alias membership | Closed for lexical identity; human review still decides semantic equivalence |
| Proposal review binding at effective entry | full proposal + review + effective query target | Canonical stable-key proposal SHA-256 is recomputed; review id/key/SHA/role/name must match; reviewed sidecar targets must also carry the same proposal id/SHA and the validator requires the bound proposal+review objects | Closed |
| Normalized request hash | normalized request parameters | Stable-key JSON is SHA-256 hashed and compared | Closed |
| Cached response and parsed-output derivation | original response bytes + canonical adapter-output bytes | The combined manifest entry validator recomputes both hashes/CAS paths, reruns a pinned repository adapter, requires byte-identical canonical output, and derives complete/missing from feature count | Closed for Overpass/GNS; unknown adapter versions fail |
| Gold/evidence/query hashes | repository file bytes | Tests recompute SHA-256 from bytes and compare policy/SHA files | Closed |
| Pseudo-precision grid signal | coordinate values + frozen production precision snapshot | Arcminute/arcsecond deltas are recomputed with storage-rounding tolerance | Closed for the frozen legacy snapshot; it is a warning only, never positive coordinate evidence |
| Production terminal ratio | aggregate counts | SQL computes numerator/denominator; report explicitly labels it terminal-outcome ratio, not attempt pass rate | Closed as descriptive evidence only |
| Province bbox sanity | candidate coordinate + sourced bbox bounds in the mechanical evidence bundle | Validator computes point-in-bounds and requires the output gate object to byte-equivalent canonical JSON | Contract closed; real bbox artifact population begins only in Phase 1 |
| Source elevation sanity | adopted bound source feature elevation + frozen-ledger altitude | Validator selects a fixed tolerance band, computes delta, and requires the output gate to equal the result | Contract closed; real source artifact population begins only in Phase 1 |
| Seed displacement sanity | candidate coordinate + frozen seed coordinate | Haversine displacement and the fixed review threshold are recomputed; a forged `passed` label is rejected | Contract closed; candidates do not yet exist |
| DEM local maximum | candidate + GLO-30 source tile bytes | The local-window calculation is implemented, but no pinned GeoTIFF decoder currently proves samples derive from tile bytes | Blocked fail-closed: effective `resolved` always rejects until Phase 1 adds the adapter |
| `precision_decimals` expression | provider response numeric lexemes | Overpass/GNS adapters preserve the original JSON number token; the minimum lexical decimal count is recomputed and must equal `precision_decimals` | Closed for implemented adapters; unknown adapters fail |
| Catalog-coordinate precision | provider feature or frozen ledger `gps.raw` | `source_binding` requires either adapter-replayed provider coordinates/literals or an exact `gps.raw` parse plus canonical ledger-row SHA; padded caller literals are rejected | Closed |
| Source license | provider response/license metadata | Stored as provenance fact, not a derived metric | Manual/source-adapter evidence |

Fail-closed effective-entry rule:

- There is no boolean sanity callback. `validateT13CoordinateRecord()` requires a versioned mechanical evidence bundle, reruns implemented source adapters from original response bytes, binds every vote/name/literal to their canonical output, and recomputes gate values.
- A `reviewed_semantic_override` cannot pass on `review_status` plus an artifact-id string alone. The effective validator requires the exact proposal and review objects, reruns proposal validation, recomputes the proposal SHA, and compares the id/SHA/artifact/role/name across all three objects.
- `validateSourceRequestEntry()` is the combined artifact entry: any cached response requires original response bytes; `complete`/`missing` additionally rerun the pinned adapter and require byte-identical canonical output.
- The Copernicus GeoTIFF adapter is intentionally absent in Phase 0. That absence is a hard stop in the effective validator, not a caller-supplied override. Phase 1 must implement it before any `resolved` record can exist.
