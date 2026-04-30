# Peak Trekker

Peak Trekker is a mountain check-in app built with Next.js and Supabase.  
The current product direction is a dark, map-first outdoor experience with verified summit records and Strava-style share cards.

## Development

Run the app locally:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run lint
npx next build --webpack
```

## Supabase setup

Initialize schema and seed data:

```sql
-- in Supabase SQL Editor
-- run the full file
\i supabase-init.sql
```

If your project already has an existing `profiles` table, make sure onboarding fields are present:

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_version TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
```

If your project was created before the server-side verification flow, also ensure `trek_sessions` and `checkins` extension fields are applied by running the latest `supabase-init.sql`.

## Server verification actions

The check-in flow now runs through server-side actions:

- `start_trek_session`
- `append_trek_point`
- `verify_summit_checkin`
- `submit_historical_checkin`
- `generate_share_card`

Endpoint: `POST /api/trek/actions`

## Onboarding flow (v2)

The app now uses a two-phase onboarding:

- `Phase A`: three-scene intro preview
- `Province anchor`: province selection and blank license handoff
- `Phase B`: real-page activation checklist (`find_peak -> open_start -> learn_share`)

Client progress keys:

- `peak_trekker_intro_seen`
- `peak_trekker_province_draft`
- `peak_trekker_activation_done`
- `peak_trekker_activation_tasks`

Debug access:

- `ONBOARDING_ADMIN_EMAILS` supports a comma-separated allowlist in production.
- In non-production environments, onboarding debug tools are always visible.

## QA reset shortcuts

In Profile page, use `新手引导设置` card to:

- Replay the full three-scene intro
- Reset only the activation checklist

Regression demo page:

- `/onboarding-qa` (dev/admin/allowlist only)

This avoids manual localStorage edits when validating onboarding branches.
