# Auth Footer and Archive Heading Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale login inventory claim with the approved conservative `300+` copy and remove the redundant archive heading row without leaving layout space behind.

**Architecture:** Keep the authentication change as static presentation copy with no data dependency. Remove the archive heading as a complete layout and motion unit, then promote the existing identity block to the first archive entrance target while preserving the relative timing of all later motion targets.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, GSAP, Node test runner, Playwright.

---

## File Map

- `src/app/auth/login/page.tsx`: owns the login footer copy.
- `src/app/(main)/archive/ArchiveClient.tsx`: owns the archive heading markup and archive entrance timelines.
- `src/app/components.css`: owns the heading row's 44px layout reservation.
- `tests/copy-humanization-static.test.ts`: locks the approved login copy and prevents accidental registration-page expansion.
- `tests/navigation-closure-static.test.ts`: locks the archive page chrome contract.
- `tests/motion-nodes-static.test.ts`: locks the populated and true-empty archive motion schedules.
- `tests/e2e/fu76-p2iii-motion-evidence.spec.ts`: defines archive motion evidence selectors.

### Task 0: Establish the Isolated Implementation Environment

**Files:**
- Verify only: repository fingerprint and dependency manifests
- Local ignored prerequisite: `public/fonts/NotoSansSC-Regular.otf`
- Local ignored prerequisite: `public/fonts/NotoSansSC-Bold.otf`

- [ ] **Step 1: Verify the fixed branch and clean starting point**

```bash
pwd
git branch --show-current
git status --short --branch
git log -2 --oneline
```

Expected: `/private/tmp/peak-trekker-auth-archive-copy-spec`, branch `codex/auth-archive-copy-spec`, and no product-code changes before implementation starts.

- [ ] **Step 2: Install the locked dependencies without running prebuild**

```bash
npm ci --ignore-scripts
```

Expected: exit 0 with no `package.json` or `package-lock.json` change. Report audit findings without running an audit fix.

- [ ] **Step 3: Establish the existing gitignored font prerequisite mechanically**

Use the previously verified cache only if the candidate does not already contain valid files:

```bash
mkdir -p public/fonts
cp /private/tmp/peak-trekker-task1012-release-36ffc1c9/public/fonts/NotoSansSC-Regular.otf public/fonts/NotoSansSC-Regular.otf
cp /private/tmp/peak-trekker-task1012-release-36ffc1c9/public/fonts/NotoSansSC-Bold.otf public/fonts/NotoSansSC-Bold.otf
shasum -a 256 public/fonts/NotoSansSC-Regular.otf public/fonts/NotoSansSC-Bold.otf
git status --short
```

Expected hashes:

```text
2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b  public/fonts/NotoSansSC-Regular.otf
b5f0d1a190a7f9b43c310a8850630af12553df32c4c050543f9059732d9b4c0a  public/fonts/NotoSansSC-Bold.otf
```

Expected Git state: fonts remain ignored and no tracked file changes are introduced by this prerequisite.

### Task 1: Update the Login Inventory Claim

**Files:**
- Modify: `tests/copy-humanization-static.test.ts`
- Modify: `src/app/auth/login/page.tsx`

- [ ] **Step 1: Add the failing static copy contract**

Append this focused test after the existing registration-copy test in `tests/copy-humanization-static.test.ts`:

```ts
test('auth inventory copy uses the approved conservative count on login only', () => {
  assert.match(loginPage, /▲ 已收录 300\+ 座国内山峰/)
  assert.doesNotMatch(loginPage, /▲ 已收录 20 座国内山峰/)
  assert.doesNotMatch(registerPage, /已收录 \d+\+? 座国内山峰/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test --experimental-strip-types tests/copy-humanization-static.test.ts
```

Expected: one failure because `src/app/auth/login/page.tsx` still contains `▲ 已收录 20 座国内山峰`.

- [ ] **Step 3: Make the minimal copy change**

In `src/app/auth/login/page.tsx`, replace only the first footer line:

```tsx
<div>▲ 已收录 300+ 座国内山峰</div>
```

Keep the footer wrapper, styling, animation classes, and second line unchanged. Do not add the footer to registration and do not query Supabase for a count.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test --experimental-strip-types tests/copy-humanization-static.test.ts
```

Expected: all subtests pass.

- [ ] **Step 5: Commit the auth copy change**

```bash
git add src/app/auth/login/page.tsx tests/copy-humanization-static.test.ts
git diff --cached --check
git commit -m "fix(auth): update mountain inventory copy"
```

Expected: commit contains exactly the login page and copy test.

### Task 2: Remove the Archive Heading as a Layout and Motion Unit

**Files:**
- Modify: `tests/navigation-closure-static.test.ts`
- Modify: `tests/motion-nodes-static.test.ts`
- Modify: `tests/e2e/fu76-p2iii-motion-evidence.spec.ts`
- Modify: `src/app/(main)/archive/ArchiveClient.tsx`
- Modify: `src/app/components.css`

- [ ] **Step 1: Change navigation and motion contracts to the desired state**

In the `archive is a tier-1 tab page without page-level back chrome` test in `tests/navigation-closure-static.test.ts`, replace the two positive heading assertions with:

```ts
assert.doesNotMatch(archiveClient, /function ArchiveContentHeading\(\)/)
assert.doesNotMatch(archiveClient, /data-archive-motion="header"/)
```

In `tests/motion-nodes-static.test.ts`:

1. Remove the positive `data-archive-motion="header"` assertion from the four-page marker test.
2. Replace the populated archive schedule assertion with:

```ts
assert.match(
  archiveClient,
  /const schedule = \{[\s\S]*identity: 0,[\s\S]*filters: 0\.22,[\s\S]*timeline: 0\.28,[\s\S]*trips: 0\.32,[\s\S]*footer: 0\.62/,
)
```

3. Replace the obsolete heading-component assertion with:

```ts
assert.doesNotMatch(archiveClient, /function ArchiveContentHeading\(\)/)
assert.doesNotMatch(archiveClient, /data-archive-motion="header"/)
```

4. Add an assertion that the true-empty sequence starts with identity and retains the shifted ordering:

```ts
assert.match(
  archiveClient,
  /if \(identity\)[\s\S]*\}, 0\)[\s\S]*if \(emptyState\)[\s\S]*\}, 0\.06\)[\s\S]*\}, 0\.2\)[\s\S]*\}, 0\.3\)[\s\S]*\}, 0\.38\)/,
)
```

In `tests/e2e/fu76-p2iii-motion-evidence.spec.ts`, remove the `header` entry from both the archive `visibility` and `motionTargets` maps. Keep `identity`, `filters`, `firstCard`, and `firstStat` unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test --experimental-strip-types tests/navigation-closure-static.test.ts tests/motion-nodes-static.test.ts
```

Expected: failures identify the still-present `ArchiveContentHeading`, archive header marker, old populated schedule, and old true-empty timing.

- [ ] **Step 3: Remove the archive heading component and render call**

Delete this function from `src/app/(main)/archive/ArchiveClient.tsx`:

```tsx
function ArchiveContentHeading() {
  return (
    <section data-archive-motion="header" className="archive-heading">
      <h1>山行档案</h1>
    </section>
  )
}
```

Delete the `<ArchiveContentHeading />` render call before the populated/empty branch.

- [ ] **Step 4: Remove the reserved CSS row**

Delete both rules from `src/app/components.css`:

```css
.archive-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--space-4);
}

.archive-heading h1 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: var(--font-label-m-size);
  line-height: var(--font-label-m-line);
  font-weight: 600;
  letter-spacing: 0;
}
```

Do not replace them with an empty wrapper, spacer, negative margin, or absolute positioning.

- [ ] **Step 5: Promote identity to the first true-empty motion target**

In the true-empty branch of `runMotion`:

1. Remove `const header = motionMap.get('header')`.
2. Change `emptyMotionTargets` to:

```ts
const emptyMotionTargets = [identity, emptyState, ...emptyActions, emptyCopy, footer].filter(
  (target): target is HTMLElement => Boolean(target),
)
```

3. Remove the `if (header)` timeline block.
4. Set the remaining positions to `identity: 0`, `emptyState: 0.06`, `emptyActions: 0.2`, `emptyCopy: 0.3`, and `footer: 0.38`.

In the inline pre-hidden selector, remove:

```css
[data-archive-empty-motion-pending] [data-archive-motion="header"],
```

- [ ] **Step 6: Promote identity to the first populated motion target**

Replace the populated schedule with:

```ts
const schedule = { identity: 0, filters: 0.22, timeline: 0.28, trips: 0.32, footer: 0.62 } as const
```

Delete:

```ts
addShell('header', 'header', schedule.header, 8, 1)
```

Keep the remaining calls, using the updated schedule:

```ts
addShell('identity', 'identity', schedule.identity, 14, 0.98)
addShell('filters', 'filters', schedule.filters, 8, 1)
```

This shifts the existing sequence forward by the removed header's 0.06s offset without changing later relative gaps.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
node --test --experimental-strip-types tests/navigation-closure-static.test.ts tests/motion-nodes-static.test.ts
```

Expected: all subtests pass.

- [ ] **Step 8: Run a residue check**

Run:

```bash
! rg -n 'ArchiveContentHeading|archive-heading|data-archive-motion="header"' \
  'src/app/(main)/archive/ArchiveClient.tsx' \
  src/app/components.css \
  tests/navigation-closure-static.test.ts \
  tests/motion-nodes-static.test.ts \
  tests/e2e/fu76-p2iii-motion-evidence.spec.ts
! rg -n 'const schedule = \{ header:' 'src/app/(main)/archive/ArchiveClient.tsx'
```

Expected: no matches and exit code 0.

- [ ] **Step 9: Commit the archive cleanup**

```bash
git add 'src/app/(main)/archive/ArchiveClient.tsx' src/app/components.css \
  tests/navigation-closure-static.test.ts tests/motion-nodes-static.test.ts \
  tests/e2e/fu76-p2iii-motion-evidence.spec.ts
git diff --cached --check
git commit -m "fix(archive): remove redundant archive heading"
```

Expected: commit contains exactly the five archive source/test files.

### Task 3: Verify the Local Candidate and Prepare Visual Evidence

**Files:**
- Verify only: all files changed in Tasks 1 and 2
- Evidence output: `output/auth-archive-copy/` (gitignored; do not commit)

- [ ] **Step 1: Run the combined focused static suite**

```bash
node --test --experimental-strip-types \
  tests/copy-humanization-static.test.ts \
  tests/navigation-closure-static.test.ts \
  tests/motion-nodes-static.test.ts
```

Expected: all subtests pass.

- [ ] **Step 2: Run lint and the normal Next build**

```bash
npm run lint
npm run build
```

Expected: both commands exit 0. Existing warnings must be reported separately; no new warning may point to a changed file.

- [ ] **Step 3: Run one existing real-browser archive evidence flow**

```bash
set -a
source /Users/liuhongyuan/Desktop/peak-trekker/.env.local
set +a
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' \
  npx playwright test tests/e2e/fu87-archive-reinvention.spec.ts \
  --grep 'FU-87 archive reinvention production evidence'
```

Expected: one focused test passes, its established synthetic user and seeded records are deleted in `finally`, and it produces the existing populated and true-empty 375px archive screenshots. Do not run a second archive evidence test or create an additional user. If the command fails before creating its one user because credentials are unavailable, report this visual layer as `BLOCKED`; do not substitute production data.

- [ ] **Step 4: Capture the unauthenticated login state and collect the archive images**

Start the local application in one persistent terminal with CAPTCHA still disabled:

```bash
set -a
source /Users/liuhongyuan/Desktop/peak-trekker/.env.local
set +a
NEXT_PUBLIC_TURNSTILE_SITE_KEY='' npm run dev
```

After the server reports ready, run from a second terminal:

```bash
mkdir -p output/auth-archive-copy
npx playwright screenshot \
  --viewport-size="375,812" \
  http://localhost:3000/auth/login \
  output/auth-archive-copy/login-375x812.png
cp output/fu87-archive-acceptance/archive-normal-hero-timeline-375x812.png \
  output/auth-archive-copy/archive-populated-375x812.png
cp output/fu87-archive-acceptance/archive-true-empty-375.png \
  output/auth-archive-copy/archive-empty-375.png
```

Stop the local server after capture. The expected review set is:

```text
output/auth-archive-copy/login-375x812.png
output/auth-archive-copy/archive-populated-375x812.png
output/auth-archive-copy/archive-empty-375.png
```

The login capture must show `▲ 已收录 300+ 座国内山峰`, unchanged second-line copy, and no horizontal overflow. Archive captures must show no `山行档案` title row, no blank 44px reservation, visible first content, natural existing hero padding, and terminal motion. Do not self-declare visual PASS; report these artifacts as ready for user review.

- [ ] **Step 5: Verify final Git hygiene and closure**

```bash
git diff --check
git status --short --branch
git log --oneline --decorate -5
```

Expected: clean worktree, the design/plan commits followed by the two implementation commits, no generated output staged, and no unrelated file changes.

## Release Boundary

Stop after the local candidate and visual-review artifacts are ready. Do not push, open or merge a PR, deploy Cloudflare/Vercel, change Supabase/Turnstile/CAPTCHA, or modify build-time public environment values. Any later Cloudflare build during the current test period must preserve an empty `NEXT_PUBLIC_TURNSTILE_SITE_KEY` unless the user separately authorizes re-enabling CAPTCHA.
