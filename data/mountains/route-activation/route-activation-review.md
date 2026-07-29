# Route Activation Candidate Review

- Status: candidate only; no production write, no activation, no commit.
- Baseline: `9599933b191448c5fca3f8f91f1ec30960bf2cbb`
- Activation rows: 11
- Production guard-ready rows: 11/11
- Active delta: +11
- Readable delta: +11
- Langta: excluded from v1 activation.

## Activation Targets

- `aotai-traverse-route` 鳌太线: closed, missing, target `active/readable=true`.
- `bogeda-grand-loop-route` 博格达大环线: closed, missing, target `active/readable=true`.
- `everest-east-kama-valley-route` 珠峰东坡嘎玛沟: unknown, trace_only, target `active/readable=true`.
- `genie-south-route` 格聂南线: unknown, map, target `active/readable=true`.
- `gongga-grand-loop-route` 贡嘎大环线: unknown, trace_only, target `active/readable=true`.
- `kanas-hemu-traverse-route` 喀纳斯—禾木穿越线: unknown, trace_only, target `active/readable=true`.
- `kulagangri-trek-route` 库拉岗日徒步线: restricted, map, target `active/readable=true`.
- `luoke-route` 洛克线: unknown, map, target `active/readable=true`.
- `motuo-trek-route` 墨脱徒步线: unknown, map, target `active/readable=true`.
- `siguniang-changping-bipeng-route` 四姑娘山长坪沟—毕棚沟穿越线: unknown, map, target `active/readable=true`.
- `wusun-ancient-trail-route` 乌孙古道: closed, trace_only, target `active/readable=true`.

## Gangrenboqi Correction

- Current production name: `冈仁波齐周边山峰`
- Current production altitude: 4000m
- Candidate product name: `冈仁波齐`
- Candidate mountain altitude: 6656m
- Estimated ascent display: hidden (pilgrimage_only_no_verified_route_ascent)
- Selected authority source: 阿里地区普兰县人民政府
- Cross-check source count: 1
- Bound route geometry display mode: `map`

## Excluded This Round

- `langta-ancient-trail-route`: missing_reliable_wgs84_area_coordinate_and_track; held covers=1.
