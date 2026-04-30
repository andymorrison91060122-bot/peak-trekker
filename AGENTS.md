# AGENTS.md

## Working mode
- Always read and follow:
  - docs/target-prd.md
  - docs/ui-interaction-spec.md
  - docs/acceptance-checklist.md
- For non-trivial work, plan first before editing code.
- Do not claim completion unless acceptance checklist items are satisfied.

## Product rules
- Mobile-first. All key pages must work at 375px width.
- No horizontal scroll, no broken modal layout, no action area wrapping.
- Explore is for finding mountains and making decisions. Do not add favorites or "want to go".
- Mountain Detail is a decision page. Use static route reference only, no heavy map dependency.
- Activity record and community post are two separate objects and must not be merged.
- Sharing assets should be simple and clean, closer to Strava than decorative poster style.
- Global base layout reference: AllTrails.
- Community feed and sharing asset reference: Strava.

## UI rules
- High-frequency generic actions must use icon buttons:
  back, close, share, edit, more, delete, report, download.
- Text buttons are for primary/secondary CTA only.
- Reuse shared components wherever possible.
- Do not create one-off visual patterns when a shared pattern already exists.

## Delivery rules
- Before coding, output:
  1. impacted pages
  2. impacted components
  3. implementation phases
  4. acceptance mapping
  5. likely regression risks
- After each phase, output:
  1. files changed
  2. checklist items passed
  3. checklist items not yet passed
  4. risks / follow-ups