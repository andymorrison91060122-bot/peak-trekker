# Stage 4 Route Ingest Dry-Run Review

## Decision

- Status: dry-run package only; no migration, database, Storage, Feishu, activation, or publication action was executed.
- Stage 2 migration is a required but unapplied prerequisite.
- Collision policy: an existing object may be reused only when its SHA-256 matches; a different SHA is a hard failure. Every planned upload uses `upsert=false`.

## Planned Closure

| Operation | Count |
|---|---:|
| New inactive route corridor rows | 11 |
| Approved geometry rows | 74 |
| Private KML source objects | 74 |
| Ready cover originals | 15 |
| Runtime thumbnails (960x520 WebP q78) | 15 |
| Existing entity updates ready | 1 |
| Blocked content rows | 1 |
| Held covers | 1 |
| Held existing semantic updates | 1 |

## Product Truth Boundaries

- Tracks supply reviewed display geometry only. They do not overwrite distance, duration, ascent, difficulty, or route copy.
- The 11 new rows remain `is_active=false` and `is_readable=false`.
- Route altitude columns remain null; only explicit candidate `route_highpoint_m` values are planned.
- Route distance and duration ranges remain inside `route_reference`; `length_km` and `estimated_duration_minutes` stay null.
- Raw KML is planned for the private `mountain-route-source` bucket and has no public URL.
- Langta content and its cover remain held. Aotai and Bogeda are valid closed-warning rows without geometry.
- Gangrenboqi geometry may be inserted, but its name, entity semantics, route binding, and existing altitude remain held for a separate product decision.
- Hutiaoxia is limited to an add-only alias merge; related mountain keys remain provenance only and the existing 22 km value is unchanged. A future apply must compare the current id, key, aliases, and length against a freshly captured production snapshot and fail on drift.

## Preconditions Before Any Future Apply

1. Independently review this plan and blockers.
2. Review and apply the Stage 2 route-corridor migration in a separate authorized task.
3. Capture the required read-only production target snapshot for existing geometry parents, absent new ids/keys, Hutiaoxia compare-and-swap fields, migration/schema state, and both buckets' collision sets.
4. Preserve all new rows as inactive and unreadable until a later activation review.
5. Never expose the raw attachment object path to the public frontend.
