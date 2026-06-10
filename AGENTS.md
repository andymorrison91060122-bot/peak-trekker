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

## Binding Design Fidelity Gate

- A binding design source is the UI spec, not visual direction. UI work is not ready until every affected screen/state has a screen-by-screen design/build diff, including 375px evidence and disclosed approved deviations.
- Engineering state must not surface as user UI unless the design explicitly requires it: no segment ids, percentages, deltas, confidence/debug categories, or internal status labels.
- UI interaction changes require a real end-to-end self-test with real input and the happy path completed. Unit tests, lint, build, static screenshots, and design diffs do not substitute for this interaction proof.

## Interactive Flow Self-Test (UI)

Before reporting any UI work that has user interaction as ready, drive the REAL end-to-end flow with real input — not unit tests, not static screenshots. Perform the actual taps / drags / typing a user would, with a real uploaded input, and verify the core happy path completes end to end: e.g. open editor → tap to build → the point lands exactly under the input AND the line forms → confirm → reach the next step.

Record it (interaction video + a per-step pass/fail log). Unit tests + static screenshots + design diffs do NOT prove the flow works for a user. If any step cannot complete — mis-registered taps, the line won't form, a gate traps the user, can't reach the next step — the work is NOT ready. Fix it before handoff.
