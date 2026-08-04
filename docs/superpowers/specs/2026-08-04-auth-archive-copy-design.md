# Auth Footer and Archive Heading Cleanup Design

## Context

At baseline `bdd05cec7b97382b73a2726c1eac4cab9ef48b16`, the login page shows `▲ 已收录 20 座国内山峰`. The archive page renders a separate `ArchiveContentHeading` containing `山行档案`; its `.archive-heading` CSS reserves a 44px row before the archive content.

The approved change updates the conservative inventory claim on login and removes the redundant archive heading row. This document defines a later implementation; it does not change or run the UI.

## Facts and Assumptions

**Facts**

- The login literal is in `src/app/auth/login/page.tsx`.
- `src/app/auth/register/page.tsx` does not contain this footer.
- `ArchiveContentHeading`, its render call, and `.archive-heading` styles form the complete heading block.
- Archive motion and evidence contracts currently require `data-archive-motion="header"` in `ArchiveClient.tsx`, `tests/motion-nodes-static.test.ts`, `tests/navigation-closure-static.test.ts`, and `tests/e2e/fu76-p2iii-motion-evidence.spec.ts`.

**Assumptions and unknowns**

- `300+` is approved static product copy, not a live inventory count. Its relationship to future inventory is intentionally approximate.
- Removing the 44px block should expose the existing hero padding as the page's top content spacing; no replacement spacer is wanted.
- Exact rendered spacing and wrapping remain implementation-phase unknowns and require bounded 375px browser evidence. No browser claim is made by this design-only task.

## Chosen Approach

1. In the login page only, replace `▲ 已收录 20 座国内山峰` with `▲ 已收录 300+ 座国内山峰`. Keep the footer static and leave registration unchanged.
2. Delete `ArchiveContentHeading`, its render call, and both `.archive-heading` CSS rules. Do not leave an empty wrapper, minimum height, margin, or substitute spacer.
3. Retire `header` as an archive motion target everywhere. For populated and true-empty archive entrances, make `identity` the first target at time zero, remove the header lookup/timeline step/pre-hidden selector, and preserve the relative ordering of the remaining targets.
4. Update focused contracts so tests assert the heading and header selector are absent rather than preserving the obsolete node. Remove `header` from the archive E2E evidence maps.

Rejected alternatives are a database-backed count, adding matching copy to registration, and hiding only the `山行档案` text. They add data coupling, expand product scope, or retain the unwanted 44px layout reservation.

## Exact Scope

**Later product implementation**

- `src/app/auth/login/page.tsx`: one literal copy replacement.
- `src/app/(main)/archive/ArchiveClient.tsx`: remove the heading component/render and all archive-header motion handling.
- `src/app/components.css`: remove `.archive-heading` and `.archive-heading h1`.
- `tests/copy-humanization-static.test.ts`: lock the new login literal, reject the old literal, and confirm registration did not gain the footer.
- `tests/navigation-closure-static.test.ts`: preserve Tier-1/no-back assertions while requiring no `ArchiveContentHeading` or archive `header` motion marker.
- `tests/motion-nodes-static.test.ts`: remove obsolete heading/header requirements and update populated and empty entrance contracts so `identity` is first.
- `tests/e2e/fu76-p2iii-motion-evidence.spec.ts`: remove the archive `header` visibility and motion targets.

**Excluded**

- Turnstile or CAPTCHA code/configuration.
- Screenshot recognition.
- Database queries or migrations.
- Registration copy additions.
- Deployment, unrelated copy, and unrelated refactors.

## Expected Layout Behavior

The login footer keeps its current placement, styling, and second line; only `20` becomes `300+`. On archive, the first existing content block follows the shared page chrome directly. The removed 44px row is not recreated, so populated content uses the existing `.archive-hero` top padding and the true-empty variant uses its existing `.archive-hero--empty` padding. Content moves upward through normal document flow, with no negative margins or absolute-position compensation.

## Testing and Evidence

During later implementation:

1. Run the focused static tests covering login copy, navigation closure, and motion contracts.
2. Run the affected archive motion E2E spec only if its normal prerequisites are available; report a blocked layer explicitly rather than substituting static evidence.
3. Capture bounded real-browser evidence at 375px for login and representative populated and true-empty archive states. Verify the exact login literal, no horizontal overflow, absence of the heading row, natural top spacing, visible first content, and terminal motion in normal and reduced-motion modes.

Static tests prove source contracts; they do not prove rendered layout. Browser evidence proves the inspected viewport and state only; it does not prove deployment or production behavior.

## Release Boundaries

This task commits only this design document. It does not edit product code, tests, configuration, or generated artifacts, and it does not run UI validation. Implementation, browser acceptance, PR/merge, deployment, and production verification are separate future phases requiring their own authorization and evidence.
