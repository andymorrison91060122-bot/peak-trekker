-- T13 Phase 0 read-only evidence query.
-- Produces aggregate-only legacy compatibility evidence; it does not expose user ids.
-- This query is not an accuracy oracle: terminal session outcomes are not a complete
-- log of all verification attempts.
with target_mountains(id) as (
  values
    ('9d7abd84-3eac-4472-8ba5-4c4ee6bab226'::uuid),
    ('216508c9-ffca-4164-8010-534d8650ee64'::uuid),
    ('5d3abbe4-7e4c-4a29-8257-ec8d6c2234b9'::uuid),
    ('f52bd0d3-2331-4404-b522-aaca38dff872'::uuid),
    ('c3455346-3f62-4d4b-9ccc-ac83e9babdfc'::uuid),
    ('44d40dcd-f1d0-47af-98bb-154505a72fa5'::uuid),
    ('1c250ea9-7c86-4322-9f10-f17e72430f4c'::uuid),
    ('39da9919-3efd-4523-b5a2-2bf9ba6a9eaa'::uuid),
    ('d5374798-ed2d-44b5-b338-b11cc8e207b7'::uuid),
    ('4d1a818b-8038-49d1-a173-a58e8c76801c'::uuid),
    ('11e9d0e9-8355-41b4-bc15-0b7e99d43c96'::uuid),
    ('a470ba81-6504-4f7f-b76b-fa01919197f3'::uuid),
    ('b733089f-cc28-43f1-a87a-d691f24134c8'::uuid),
    ('674b2a19-344e-4052-9ebf-62f4e6faeea9'::uuid),
    ('67bf0560-1e07-457b-9afa-b113d8b99661'::uuid),
    ('a82c819e-8f53-4a78-a58c-dd2242d87af2'::uuid),
    ('9c8848e9-6e18-4883-b8da-475699c7c856'::uuid),
    ('404add39-6b3f-4180-988e-4d67e09993b3'::uuid)
),
checkin_stats as (
  select
    mountain_id,
    count(*) as checkin_total,
    count(*) filter (where verified_at is not null) as verified_checkins,
    count(distinct user_id) filter (where verified_at is not null) as distinct_verified_users,
    count(*) filter (
      where verified_at is not null and verification_distance_m is not null
    ) as verified_with_distance,
    count(*) filter (
      where verified_at is not null and verification_distance_m = 0
    ) as zero_distance,
    count(*) filter (
      where verified_at is not null and verification_distance_m between 1 and 300
    ) as nonzero_within_300,
    count(*) filter (
      where verified_at is not null and verification_distance_m > 300
    ) as over_300,
    array_agg(distinct source order by source) filter (
      where verified_at is not null
    ) as verified_sources
  from public.checkins
  where mountain_id in (select id from target_mountains)
  group by mountain_id
),
session_stats as (
  select
    mountain_id,
    count(*) as session_total,
    count(*) filter (where status = 'summit_verified') as summit_verified_sessions,
    count(*) filter (
      where status in ('summit_verified', 'finished', 'aborted')
    ) as terminal_sessions
  from public.trek_sessions
  where mountain_id in (select id from target_mountains)
  group by mountain_id
)
select
  m.id,
  m.name,
  m.latitude,
  m.longitude,
  coalesce(c.checkin_total, 0) as checkin_total,
  coalesce(c.verified_checkins, 0) as verified_checkins,
  coalesce(c.distinct_verified_users, 0) as distinct_verified_users,
  coalesce(c.verified_with_distance, 0) as verified_with_distance,
  coalesce(c.zero_distance, 0) as zero_distance,
  coalesce(c.nonzero_within_300, 0) as nonzero_within_300,
  coalesce(c.over_300, 0) as over_300,
  coalesce(c.verified_sources, '{}'::text[]) as verified_sources,
  coalesce(s.session_total, 0) as session_total,
  coalesce(s.summit_verified_sessions, 0) as summit_verified_sessions,
  coalesce(s.terminal_sessions, 0) as terminal_sessions,
  case
    when coalesce(s.terminal_sessions, 0) = 0 then null
    else round(100.0 * s.summit_verified_sessions / s.terminal_sessions, 2)
  end as summit_verified_terminal_outcome_pct
from target_mountains target
join public.mountains m on m.id = target.id
left join checkin_stats c on c.mountain_id = m.id
left join session_stats s on s.mountain_id = m.id
order by m.id;
