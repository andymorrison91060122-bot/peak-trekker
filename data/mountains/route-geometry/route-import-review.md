# Route Data Import Review

## Candidate closure

- Geometry candidates: 196 (map 192, trace-only 4)
- New route corridor content: 12 (ready 11, blocked 1)
- User-supplied cover plan: 16 images across 12 projects
- Existing entity association proposals: 2
- Incremental Base geometries: 122; product-approved missing-coordinate rows: 7
- Product distance, duration, ascent, difficulty, and route copy overwritten: 0

## Hard blocker

- `langta-ancient-trail-route` 狼塔古道: no reviewed WGS84 area coordinate and no track. It must not be imported until the coordinate is supplied.

## Existing entity proposals

- `gangrenboqi-cluster`: retain the existing key/id, represent the product as the mountain body, and bind 冈仁波齐转山环线. The existing 4000m value remains a product decision because the R1 proposal does not establish it as mountain altitude.
- `hutiaoxia-gaolu-route`: reuse the existing route corridor, retain 22km, and add only the R1 aliases/related-mountain proposal.

## Data boundaries

- Track geometry is a reviewed shape candidate, not navigation and not a source for product distance, duration, ascent, or route highpoint.
- Kanas-Hemu and Wusun use the center of the reviewed track bbox only as an area coordinate; it is neither a summit nor a trailhead.
- Aotai and Bogeda may proceed only as inactive, unreadable closed-warning rows without geometry.
- Langta remains the sole hard blocker.
- All new rows remain `is_active=false` and `is_readable=false`.
- Original track attachments are planned for a private `mountain-route-source` bucket; this package creates no bucket, object, or public URL.
- Product-approved canonical-coordinate gaps remain `geometry_review_status=pending`; their missing coordinate is not fabricated and their distance screen is recorded as not run.
