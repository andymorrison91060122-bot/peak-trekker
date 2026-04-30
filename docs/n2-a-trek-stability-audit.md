# N2-A · Trek verify_summit_checkin 稳定性诊断报告

诊断时间：2026-04-30T12:26:17Z
执行人：Codex
任务批次：N2-A（仅诊断，不修复）

## 总览

* `verify_summit_checkin` 当前稳定性评估：部分稳定
* P0 必修问题数量：3
* P1 后续修复数量：3
* P2 重构候选数量：3
* QA helper / 本地 session 风险等级：高
* 建议 N2-B 修复批次范围：优先收敛本地 session / server session 的边界与去重策略，补齐异常分支测试，再决定是否做事务化 RPC。

## 维度 1 · 入口与主链路

### 页面入口

`/trek` 的 server page 会先要求登录，未登录时 redirect 到登录页，并带上原始 `mountainId` 参数。登录后读取待审核照片记录队列和用户省份，再把数据交给 client。

代码上下文：

```tsx
// src/app/(main)/trek/page.tsx:13-36
const supabase = await createSupabaseServerClient()
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
  const search = mountainId ? `?mountainId=${encodeURIComponent(mountainId)}` : ''
  redirect(`/auth/login?from=${encodeURIComponent(buildAuthReturnTarget('/trek', search))}`)
}

const reviewQueueRecords = await listReviewQueueRecords({ supabase, userId: user.id })
```

### 客户端状态机

`TrekPageClient` 的状态包括：

| 状态 | 含义 | 进入路径 |
|---|---|---|
| `idle` | 已登录但未记录，或目标刚确认 | 初始 / `confirmTargetMountain` / reset |
| `locating` | 已创建 session，等待 GPS watch 首点 | `startTrek` 创建 session 后 |
| `tracking` | GPS 记录中，但尚未满足接近/峰顶确认条件 | watchPosition 更新 |
| `approach_alert` | 已接近目标山，显示确认登顶卡片 | `checkNearby` 判断 500m / 200m 内 |
| `summit_verified` | 服务端返回 checkinId，进入登顶成功态 | `handleGpsCheckin` 成功 |
| `card_preview` | 分享卡预览中 | `SharePosterButton` 回调 |
| `shared` | 分享流程完成 | `SharePosterButton` 回调 |

代码上下文：

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:20-34
type TrekStatus =
  | 'idle'
  | 'locating'
  | 'tracking'
  | 'approach_alert'
  | 'summit_verified'
  | 'card_preview'
  | 'shared'

const LOCAL_TREK_SESSION_PREFIX = 'local-trek-session:'
const INVALID_RECORD_SECONDS = 60
```

### `verify_summit_checkin` 触发点

主 UI 触发点只有一个：`approach_alert` 卡片中的“确认登顶”按钮。按钮启用条件为：最后距离目标不超过 `SUMMIT_RADIUS`，轨迹点数量满足 `TREK_RULES.minTrackPoints`，记录时长满足 `TREK_RULES.minSessionSeconds`。

代码上下文：

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:475-480
const hasMinimumVerificationEvidence =
  trackRef.current.length >= TREK_RULES.minTrackPoints && elapsedSeconds >= TREK_RULES.minSessionSeconds
const canConfirmSummit =
  distanceToTarget !== null && distanceToTarget <= SUMMIT_RADIUS && hasMinimumVerificationEvidence
const isTrackingActive = status === 'locating' || status === 'tracking' || status === 'approach_alert'
const isSummitFlow = status === 'summit_verified' || status === 'card_preview' || status === 'shared'
```

按钮区域：

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:739-749
<div style={{ display: 'flex', gap: 10 }}>
  <SecondaryButton style={{ flex: 1 }} onClick={() => setStatus('tracking')}>
    继续记录
  </SecondaryButton>
  <PrimaryButton
    style={{ flex: 2 }}
    onClick={handleGpsCheckin}
    disabled={checkinLoading || !canConfirmSummit}
  >
    {checkinLoading ? '确认中...' : '确认登顶'}
  </PrimaryButton>
</div>
```

### 客户端到服务端 action 的参数边界

`handleGpsCheckin` 发送：

* 必填：`action: 'verify_summit_checkin'`、`sessionId`
* 可选：`note`
* mountain：优先 `nearbyMountain.id`，其次 `targetMountain.id`，否则 `null`
* local session only：`trackPoints`、`startedAt`

代码上下文：

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:393-409
await appendPointToServer(
  sessionId,
  { lat: gps.lat, lng: gps.lng, ts: Date.now(), altitude: gps.altitude, accuracy: gps.accuracy },
  gps.accuracy
)
const data = await callTrekAction({
  action: 'verify_summit_checkin',
  sessionId,
  note: checkinNote,
  mountainId: nearbyMountain?.id ?? targetMountain?.id ?? null,
  ...(sessionId.startsWith(LOCAL_TREK_SESSION_PREFIX)
    ? {
        trackPoints: trackRef.current,
        startedAt: startTimeRef.current,
      }
    : {}),
})
```

### 失败重试 / 错误展示

客户端把后端 error string 映射成用户提示；失败后仅 `setCheckinLoading(false)`，保留 session、status、trackRef，用户可继续点击重试。

代码上下文：

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:36-45
if (message.includes('insufficient_track_points')) return '轨迹点还不够，请继续记录一小段再确认登顶。'
if (message.includes('session_too_short')) return '记录时间还太短，请继续记录后再确认登顶。'
if (message.includes('outside_summit_radius')) return '你还没有进入峰顶核验范围，请继续靠近峰顶后再试。'
if (message.includes('invalid_session_start_time')) return '记录会话异常，请重新开始记录后再试。'
if (message.includes('no_active_mountains')) return '当前没有可核验的山峰，请稍后再试。'
if (message.includes('session not found')) return '本次记录会话已失效，请重新开始记录。'
```

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:415-423
setCreatedCheckinId(checkinId)
setStatus('summit_verified')
setSessionId(null)
clearTrackingRuntime()
showToast({ key: 'summit_verify_success' })
} catch (error) {
  showToast({ key: 'summit_verify_failure', message: normalizeTrekActionError(error) })
}
setCheckinLoading(false)
```

## 维度 2 · 服务端 action 分支

### 完整流程图

```text
POST /api/trek/actions
1. parse body.action
2. create user-scoped Supabase server client
3. require authenticated user
4. if action === verify_summit_checkin:
   4.1 require sessionId
   4.2 classify local session by prefix local-trek-session:
   4.3 server session path:
       - load trek_sessions by id
       - require session exists
       - require session.user_id === user.id
       - if status is summit_verified, return existing approved checkin by session_id
   4.4 choose points:
       - local: body.trackPoints
       - server: trek_sessions.track_points
   4.5 require min track points
   4.6 require valid startedAt
   4.7 require min duration
   4.8 resolve mountain:
       - explicit body.mountainId
       - serverSession.mountain_id
       - nearest active mountain to last point
   4.9 calculate haversine distance to summit coordinate
   4.10 reject if outside summit radius
   4.11 server session only: check duplicate approved checkin by session_id
   4.12 insert approved GPS checkin
   4.13 server session only: update trek_sessions to summit_verified
   4.14 best-effort increment stats RPCs
   4.15 return checkinId / verificationDistanceM / rankingWeight / mountain
```

### 分支详情

#### 1. 鉴权分支

输入条件：所有 action 都先经过 `supabase.auth.getUser()`。未登录返回 `401 unauthorized`。

副作用：无。

代码上下文：

```ts
// src/app/api/trek/actions/route.ts:162-178
const body = await request.json().catch(() => ({}))
const action = body?.action as ActionName | undefined

if (!action) {
  return NextResponse.json({ error: 'action required' }, { status: 400 })
}

const supabase = await createSupabaseServerClient()
const { data: { user }, error: authError } = await supabase.auth.getUser()

if (authError || !user) {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
```

#### 2. sessionId 必填分支

输入条件：`body.sessionId` 不是 string 或为空。

副作用：无。返回 `400 sessionId required`。

```ts
// src/app/api/trek/actions/route.ts:428-436
if (action === 'verify_summit_checkin') {
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const note = toSafeNote(body?.note)

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const isLocalSession = isLocalTrekSessionId(sessionId)
```

#### 3. local session vs server session 分支

输入条件：`sessionId.startsWith('local-trek-session:')`。

判定算法：local session 完全跳过 `trek_sessions` 读取与 owner 校验；server session 从 `trek_sessions` 读取 `id/user_id/mountain_id/status/started_at/track_points/...`。

副作用：local session 无 session row；server session 后续可能 update。local session 仍会插入 approved checkin。

```ts
// src/app/api/trek/actions/route.ts:436-456
const isLocalSession = isLocalTrekSessionId(sessionId)
const sessionResult = isLocalSession
  ? { data: null, error: null }
  : await supabase
      .from('trek_sessions')
      .select('id, user_id, mountain_id, status, started_at, track_points, distance_m, ascent_m, descent_m, max_altitude_m')
      .eq('id', sessionId)
      .single()

const serverSession = isLocalSession ? null : ((sessionResult.data as TrekVerifySessionRecord | null) ?? null)

if (!isLocalSession && (sessionResult.error || !serverSession)) {
  return NextResponse.json({ error: 'session not found' }, { status: 404 })
}

if (serverSession && serverSession.user_id !== user.id) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}
```

#### 4. 已 summit_verified 的重复分支

输入条件：server session 存在且 `status === 'summit_verified'`。

判定算法：按 `checkins.session_id = serverSession.id AND status = approved` 查询已有 checkin。

副作用：无；返回 `duplicated: true` 和可能为 null 的 `checkinId`。

```ts
// src/app/api/trek/actions/route.ts:458-470
if (serverSession?.status === 'summit_verified') {
  const { data: existing } = await supabase
    .from('checkins')
    .select('id')
    .eq('session_id', serverSession.id)
    .eq('status', 'approved')
    .maybeSingle()
  return NextResponse.json({
    ok: true,
    duplicated: true,
    checkinId: existing?.id ?? null,
  })
}
```

#### 5. 轨迹点数量分支

输入条件：`safeTrackPoints(...)` 后的点数小于 `TREK_RULES.minTrackPoints`。

判定算法：默认 8 点；如果 `NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS=true`，降为 2 点。

副作用：无。返回 `422 insufficient_track_points`。

```ts
// src/lib/trek-utils.ts:3-10
const QA_TREK_RULES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS === 'true'

export const TREK_RULES = {
  minTrackPoints: QA_TREK_RULES_ENABLED ? 2 : 8,
  minSessionSeconds: QA_TREK_RULES_ENABLED ? 1 : 90,
  defaultApproachRadiusM: 500,
  defaultSummitRadiusM: 200,
  maxDriftSpeedMps: 9.5,
} as const
```

```ts
// src/app/api/trek/actions/route.ts:472-478
const points = isLocalSession ? safeTrackPoints(body?.trackPoints) : safeTrackPoints(serverSession?.track_points)
if (points.length < TREK_RULES.minTrackPoints) {
  return NextResponse.json(
    { error: 'insufficient_track_points', detail: `need at least ${TREK_RULES.minTrackPoints} points` },
    { status: 422 }
  )
}
```

#### 6. 时长分支

输入条件：local session 用 `body.startedAt`，server session 用 `serverSession.started_at`；无效返回 400，时长不足返回 422。

判定算法：`Math.floor((Date.now() - startedAt) / 1000)`；默认最小时长 90 秒，QA env 下 1 秒。

副作用：无。

```ts
// src/app/api/trek/actions/route.ts:480-490
const startedAt = isLocalSession ? Number(body?.startedAt) : new Date(serverSession?.started_at ?? '').getTime()
if (!Number.isFinite(startedAt)) {
  return NextResponse.json({ error: 'invalid_session_start_time' }, { status: 400 })
}
const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
if (durationSeconds < TREK_RULES.minSessionSeconds) {
  return NextResponse.json(
    { error: 'session_too_short', detail: `need at least ${TREK_RULES.minSessionSeconds}s` },
    { status: 422 }
  )
}
```

#### 7. mountain 解析分支

输入条件：`body.mountainId`、`serverSession.mountain_id` 或二者都缺失。

判定算法：有目标山则查该山；没有目标山则列出所有 active mountains，并按最后一个轨迹点到山峰坐标的 haversine 距离排序，取最近山。

副作用：无。若无 active mountains，返回 `500 no_active_mountains`。

```ts
// src/app/api/trek/actions/route.ts:492-516
const explicitMountainId = typeof body?.mountainId === 'string' ? body.mountainId : null
const targetMountainId = explicitMountainId ?? serverSession?.mountain_id ?? null
const targetMountain = isLocalSession
  ? targetMountainId
    ? (await fetchMountainForVerification(supabase, targetMountainId)).data
    : null
  : targetMountainId
    ? (await fetchMountainForVerification(supabase, targetMountainId)).data
    : null

let mountain = targetMountain
if (!mountain) {
  const { data: allMountains } = await listActiveMountainsForVerification(supabase)
  if (!allMountains?.length) {
    return NextResponse.json({ error: 'no_active_mountains' }, { status: 500 })
  }
```

#### 8. 峰顶半径分支

输入条件：最后轨迹点与 mountain 坐标距离大于 summit radius。

判定算法：`haversineMeters(lastPoint.lat, lastPoint.lng, mountain.latitude, mountain.longitude)`；半径优先 `mountain.summit_radius_m`，否则默认 200m。

副作用：无。返回 `422 outside_summit_radius`。

```ts
// src/app/api/trek/actions/route.ts:518-529
const lastPoint = points.at(-1)!
const verifyDistance = haversineMeters(lastPoint.lat, lastPoint.lng, mountain.latitude, mountain.longitude)
const summitRadius = mountain.summit_radius_m ?? TREK_RULES.defaultSummitRadiusM

if (verifyDistance > summitRadius) {
  return NextResponse.json(
    {
      error: 'outside_summit_radius',
      detail: `current distance ${Math.round(verifyDistance)}m > ${summitRadius}m`,
    },
    { status: 422 }
  )
}
```

#### 9. server session duplicate 分支

输入条件：server session 存在。

判定算法：按 `session_id` + `status=approved` 查重复。local session 不执行这段。

副作用：无。命中则返回既有 checkinId。

```ts
// src/app/api/trek/actions/route.ts:532-547
if (serverSession) {
  const { data: duplicateCheckin } = await supabase
    .from('checkins')
    .select('id')
    .eq('session_id', serverSession.id)
    .eq('status', 'approved')
    .maybeSingle()

  if (duplicateCheckin) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      checkinId: duplicateCheckin.id,
    })
  }
}
```

#### 10. 插入 approved GPS checkin 分支

输入条件：通过所有前置校验。

判定算法：difficulty 映射到 ranking weight：expert=80，advanced=40，intermediate=20，其余=10。

副作用：写入 `checkins`。server session 路径带 `session_id`；local session 不带。`insertCheckinWithFallback` 会在 schema compatibility error 时删除 optional columns 重试。

```ts
// src/app/api/trek/actions/route.ts:549-568
const rankingWeight = rankingWeightByDifficulty(mountain.difficulty)
const now = new Date().toISOString()
const { data: createdCheckin, error: createError } = await insertCheckinWithFallback(
  supabase,
  {
    user_id: user.id,
    mountain_id: mountain.id,
    type: 'gps',
    source: 'realtime_gps',
    status: 'approved',
    latitude: lastPoint.lat,
    longitude: lastPoint.lng,
    note,
    ...(serverSession ? { session_id: serverSession.id } : {}),
    verified_at: now,
    verification_distance_m: Math.round(verifyDistance),
    ranking_weight: rankingWeight,
  },
  'id'
)
```

#### 11. session 状态更新与统计 RPC 分支

输入条件：checkin 插入成功。

副作用：server session 更新为 `summit_verified` / `verify_state=verified`；随后 best-effort 调用三个统计 RPC，错误被吞掉。

```ts
// src/app/api/trek/actions/route.ts:576-595
if (serverSession) {
  await supabase
    .from('trek_sessions')
    .update({
      mountain_id: mountain.id,
      status: 'summit_verified',
      verify_state: 'verified',
      ended_at: now,
    })
    .eq('id', serverSession.id)
    .eq('user_id', user.id)
}

try {
  await Promise.all([
    supabase.rpc('increment_checkin_count', { mid: mountain.id }),
    supabase.rpc('increment_user_stats', { uid: user.id, alt: mountain.altitude }),
    mountain.province ? supabase.rpc('increment_province_score', { pname: mountain.province }) : Promise.resolve(),
  ])
} catch {}
```

### 错误分类

| Error | 用户重试可恢复 | 人工/后端介入 | 说明 |
|---|---:|---:|---|
| `insufficient_track_points` | 是 | 否 | 继续记录即可。 |
| `session_too_short` | 是 | 否 | 继续记录即可。 |
| `outside_summit_radius` | 是 | 否 | 靠近目标后重试。 |
| `invalid_session_start_time` | 否 | 可能 | local session startedAt 异常或 server started_at 不可解析。 |
| `session not found` | 否 | 可能 | session 被清理、RLS 不可见或 id 不存在。 |
| `forbidden` | 否 | 是 | 用户/session 归属不一致。 |
| `no_active_mountains` | 否 | 是 | 山峰数据环境问题。 |
| `create checkin failed` | 否 | 是 | schema/RLS/DB 写入问题。 |

## 维度 3 · 数据依赖

### 直接读写表

| 表 | 操作 | 字段 |
|---|---|---|
| `mountains` | 读 | `id`, `name`, `altitude`, `latitude`, `longitude`, `difficulty`, `summit_radius_m`, `province`, `is_active` |
| `trek_sessions` | insert | `user_id`, `mountain_id`, `status`, `verify_state`, `started_at`, `track_points`, `track_summary`, `distance_m`, `ascent_m`, `descent_m`, `max_altitude_m` |
| `trek_sessions` | read/update | `id`, `user_id`, `status`, `started_at`, `track_points`, `distance_m`, `ascent_m`, `descent_m`, `max_altitude_m`, `ended_at` |
| `checkins` | insert/read | `id`, `user_id`, `mountain_id`, `type`, `source`, `status`, `latitude`, `longitude`, `note`, `session_id`, `verified_at`, `verification_distance_m`, `ranking_weight` |
| `profiles` | indirect | `increment_user_stats` RPC 更新用户统计 |
| `province_stats` | indirect | `increment_province_score` RPC 更新省域分数 |

### Client 类型与 RLS 影响

`/api/trek/actions` 使用 `createSupabaseServerClient()`，也就是 user-scoped server client，不是 service-role。它依赖当前登录用户的 RLS。

关键 RLS：

```sql
-- supabase-init.sql:196-203
CREATE POLICY "checkins_select" ON public.checkins FOR SELECT USING (status = 'approved' OR user_id = auth.uid());
CREATE POLICY "checkins_insert" ON public.checkins FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trek_sessions_select" ON public.trek_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trek_sessions_insert" ON public.trek_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trek_sessions_update" ON public.trek_sessions FOR UPDATE USING (auth.uid() = user_id);
```

N1-A 新增的 `checkins_update` 和 admin 分支主要服务 admin review，不是用户核验主链路的必需条件。用户核验主链路仍靠 `checkins_insert` 和 `trek_sessions_*` owner policy。

```sql
-- supabase/migrations/20260430052932_align_schema_with_code.sql:82-99
DROP POLICY IF EXISTS checkins_update ON public.checkins;
CREATE POLICY checkins_update ON public.checkins
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = TRUE
    )
  );
```

### trek_sessions 状态机

| 当前状态 | 转移 | 代码路径 |
|---|---|---|
| 无 session | `tracking` | `start_trek_session` insert |
| `tracking` | `finished` | 新建 session 前先 finish 旧 tracking；或用户 stop |
| `tracking` | `aborted` | GPS error 或短记录 stop |
| `tracking` | `summit_verified` | `verify_summit_checkin` 成功后 |
| `summit_verified` | 保持 | `finish_trek_session` 看到 summit_verified 时 ignored |

关键上下文：

```ts
// src/app/api/trek/actions/route.ts:212-247
const finishActiveSessions = await supabase
  .from('trek_sessions')
  .update({
    status: 'finished',
    ended_at: new Date().toISOString(),
  })
  .eq('user_id', user.id)
  .eq('status', 'tracking')

const { data: session, error } = await supabase
  .from('trek_sessions')
  .insert({
    user_id: user.id,
    mountain_id: mountainId,
    status: 'tracking',
    verify_state: 'pending',
    started_at: new Date().toISOString(),
```

## 维度 4 · 测试覆盖

### 已覆盖场景

| 测试文件 | 场景 | 覆盖分支 |
|---|---|---|
| `tests/e2e/community-acceptance.spec.ts` | UI 从 `/trek?mountainId=` 走到 summit success 并发布社区 | server session happy path，GPS mock，成功态 |
| `tests/e2e/province-rankings.spec.ts` | GPS summit success 后显示省份贡献 note | server session happy path + province note |
| `tests/e2e/community.helpers.ts` | `createGpsCheckinViaApi` 直接调用 local session | local session happy path，作为大量 community/share 测试 seed |
| `src/components/community/CommunityTestRecordSeeder.tsx` | QA 控台生成实时登顶记录 | local session happy path，手工验收入口 |
| `tests/e2e/trek-photo-checkin.spec.ts` | 照片补签流程 | 不覆盖 `verify_summit_checkin`，覆盖 `submit_historical_checkin` |

UI happy path 关键上下文：

```ts
// tests/e2e/community-acceptance.spec.ts:348-366
await page.goto(`${root}/trek?mountainId=${mountain.id}`)
await dismissActivationChecklistIfPresent(page)
await expect(page.getByText('确认今天要记录的山峰')).toBeVisible()
await confirmTargetButton.click()
await page.getByRole('button', { name: 'Start 开启记录' }).click()
await expect(page.getByText('已接近峰顶')).toBeVisible({ timeout: 15_000 })
await expect(page.getByRole('button', { name: '确认登顶' })).toBeEnabled({ timeout: 15_000 })
const verifyResponse = page.waitForResponse((response) => {
  if (!response.url().includes('/api/trek/actions') || response.request().method() !== 'POST') return false
  return response.request().postData()?.includes('"action":"verify_summit_checkin"') ?? false
})
await page.getByRole('button', { name: '确认登顶' }).click()
const verifyPayload = await (await verifyResponse).json().catch(() => ({}))
expect(String(verifyPayload?.checkinId ?? '')).not.toHaveLength(0)
```

Local session seed 关键上下文：

```ts
// tests/e2e/community.helpers.ts:221-231
const res = await fetch('/api/trek/actions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'verify_summit_checkin',
    sessionId: `local-trek-session:${crypto.randomUUID()}`,
    mountainId: currentMountain.id,
    note: currentNote,
    startedAt: currentStartedAt,
    trackPoints,
  }),
})
```

### 未覆盖或覆盖不足

| 分支 / 风险 | 当前覆盖 | 缺口 |
|---|---|---|
| `insufficient_track_points` | QA 清单里有手工项 | 无自动 API/E2E 断言 |
| `session_too_short` | QA 清单里有手工项 | 无自动 API/E2E 断言 |
| `outside_summit_radius` | UI disable 间接挡住 | 无服务端直接断言 |
| `invalid_session_start_time` | 无 | local session malformed startedAt 未测 |
| 缺 `mountainId` 后 nearest active mountain fallback | 无 | 容易把 checkin 归到最近山，缺断言 |
| server session duplicate | 无直接覆盖 | 成功后再次提交同 session 未测 |
| local session duplicate | 无 | 多次 local session 可重复创建 approved checkin |
| append point drift filter | 无 | `drift_filtered` 是否影响后续 verify 未测 |
| session update failure after checkin insert | 无 | 无事务/补偿测试 |
| stats RPC failure | 无 | 当前吞错，未验证影响范围 |

### 单元测试

未发现针对 `TREK_RULES`、`safeTrackPoints`、`haversineMeters`、`verify_summit_checkin` 分支的单元测试。现有覆盖主要是 Playwright e2e 与 QA helper。

## 维度 5 · QA helper / 本地 session

### QA helper 入口

* `/onboarding-qa`：管理员/白名单 QA 入口，展示 `TrekVerificationChecklist`。
* `/community-qa`：管理员/白名单 QA 入口，包含 `CommunityTestRecordSeeder`，可一键生成补签或实时 GPS 记录。
* `TREK_QA_SCENARIOS`：记录手工核验项，不直接执行自动测试。

访问控制上下文：

```tsx
// src/app/(main)/community-qa/page.tsx:18-30
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', user.id)
  .single()

const canAccess = canAccessOnboardingDebugTools({
  email: user.email,
  isAdmin: Boolean((profile as { is_admin?: boolean } | null)?.is_admin),
})

if (!canAccess) {
  redirect('/profile')
}
```

QA checklist 上下文：

```ts
// src/lib/qa-scenarios.ts:100-115
{
  id: 'insufficient-track-points',
  title: '异常：轨迹点不足/会话过短',
  startAt: '/trek',
  action: '开启记录后立即尝试确认登顶，或轨迹点较少时提交。',
  expect: '服务端拒绝并给出可恢复提示，继续记录后可再次提交。',
  type: 'failure',
},
{
  id: 'duplicate-summit-submit',
  title: '异常：重复登顶提交',
  startAt: '/trek',
  action: '一次核验成功后再次尝试提交同一会话。',
  expect: '不会新增重复 checkin，返回重复提交保护结果。',
  type: 'failure',
},
```

### QA helper 下 `verify_summit_checkin` 差异

`CommunityTestRecordSeeder` 不创建 `trek_sessions`，而是直接构造 `local-trek-session:community-qa:*`，附带 8 个 trackPoints 和 `startedAt = Date.now() - 120_000`，调用同一个 `verify_summit_checkin` action。

```tsx
// src/components/community/CommunityTestRecordSeeder.tsx:136-143
const result = await postTrekAction({
  action: 'verify_summit_checkin',
  sessionId: `local-trek-session:community-qa:${Date.now()}`,
  mountainId: selectedMountain.id,
  startedAt: Date.now() - 120_000,
  note: note.trim() || 'QA 即时发布测试记录',
  trackPoints: buildQaTrackPoints(selectedMountain),
})
```

### 本地 session 数据流

1. `start_trek_session` 只有在 `trek_sessions` schema compatibility error 时才返回 local session fallback。
2. 客户端若看到 local session id，会在 `verify_summit_checkin` 中携带 `trackPoints` 和 `startedAt`。
3. 服务端用前缀识别 local session，跳过 DB session 读取。
4. local session 仍插入 approved GPS checkin，但不会写 `checkins.session_id`，也不会更新 `trek_sessions`。

fallback 入口：

```ts
// src/app/api/trek/actions/route.ts:249-256
if (error || !session) {
  if (isSchemaCompatibilityErrorMessage(error?.message)) {
    return NextResponse.json({
      ok: true,
      sessionId: `${LOCAL_TREK_SESSION_PREFIX}${crypto.randomUUID()}`,
      startedAt: new Date().toISOString(),
      fallback: 'client',
    })
  }
```

local session append/finish：

```ts
// src/app/api/trek/actions/route.ts:281-283, 386-388
if (isLocalTrekSessionId(sessionId)) {
  return NextResponse.json({ ok: true, fallback: 'client' })
}

if (isLocalTrekSessionId(sessionId)) {
  return NextResponse.json({ ok: true, fallback: 'client', status: finalStatus })
}
```

### QA / 本地 session 风险点

* local session 是生产 route 的正式分支，不只在 test env 生效。
* local session 没有 session row、没有 server-side owner record、没有 session_id 去重。
* 大量社区/share/province 测试用 local session seed approved GPS checkin，容易让测试通过但绕过真实 server session 状态机。
* `NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS=true` 会同时降低服务端最小点数和最小时长，因为 `TREK_RULES` 是同一模块常量；需要确认生产 env 永不启用。

## 维度 6 · 已知问题清单

### P0

#### P0-1：local session 可直接创建 approved GPS checkin，且缺少 session_id 去重

涉及文件：`src/app/api/trek/actions/route.ts:436-472`, `src/app/api/trek/actions/route.ts:532-568`

问题概述：任何已登录用户只要传入 `local-trek-session:` 前缀、合法 trackPoints、startedAt 和 mountainId，就会绕过 `trek_sessions` 读取与 owner 校验，最终创建 approved GPS checkin。duplicate 查询只在 `serverSession` 存在时执行，local session 没有等价去重键。

代码上下文：

```ts
// src/app/api/trek/actions/route.ts:436-448
const isLocalSession = isLocalTrekSessionId(sessionId)
const sessionResult = isLocalSession
  ? {
      data: null,
      error: null,
    }
  : await supabase
      .from('trek_sessions')
      .select('id, user_id, mountain_id, status, started_at, track_points, distance_m, ascent_m, descent_m, max_altitude_m')
      .eq('id', sessionId)
      .single()

const serverSession = isLocalSession ? null : ((sessionResult.data as TrekVerifySessionRecord | null) ?? null)
```

```ts
// src/app/api/trek/actions/route.ts:532-568
if (serverSession) {
  const { data: duplicateCheckin } = await supabase
    .from('checkins')
    .select('id')
    .eq('session_id', serverSession.id)
    .eq('status', 'approved')
    .maybeSingle()

  if (duplicateCheckin) {
    return NextResponse.json({
      ok: true,
      duplicated: true,
      checkinId: duplicateCheckin.id,
    })
  }
}

const { data: createdCheckin, error: createError } = await insertCheckinWithFallback(
  supabase,
  {
    user_id: user.id,
    mountain_id: mountain.id,
```

建议修法概要：N2-B 应把 local session 限定为明确的 schema fallback 或 QA-only 路径，而不是默认生产可用路径。至少需要 server-side 防重复策略，例如 local session nonce 持久化、幂等 key、或禁用生产 local verify。需要新增 API 分支测试覆盖 local session 重复提交。

是否需要新测试：需要。建议覆盖同一 local session 重复提交、不同 local session 同一 track payload 重复提交、生产 env local session 是否被拒绝。

#### P0-2：测试与 QA seeder 大量依赖 local session，绕过真实 server session 状态机

涉及文件：`tests/e2e/community.helpers.ts:180-253`, `src/components/community/CommunityTestRecordSeeder.tsx:122-160`

问题概述：`createGpsCheckinViaApi` 和 QA seeder 都直接调用 `verify_summit_checkin` 的 local session 分支创建 approved GPS checkin。这样可以快速 seed 数据，但无法验证 `start_trek_session`、`append_trek_point`、`trek_sessions.status` 转移、server session duplicate 等主链路。

代码上下文：

```ts
// tests/e2e/community.helpers.ts:221-231
const res = await fetch('/api/trek/actions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'verify_summit_checkin',
    sessionId: `local-trek-session:${crypto.randomUUID()}`,
    mountainId: currentMountain.id,
    note: currentNote,
    startedAt: currentStartedAt,
    trackPoints,
  }),
})
```

```tsx
// src/components/community/CommunityTestRecordSeeder.tsx:136-143
const result = await postTrekAction({
  action: 'verify_summit_checkin',
  sessionId: `local-trek-session:community-qa:${Date.now()}`,
  mountainId: selectedMountain.id,
  startedAt: Date.now() - 120_000,
  note: note.trim() || 'QA 即时发布测试记录',
  trackPoints: buildQaTrackPoints(selectedMountain),
})
```

建议修法概要：N2-B 应增加至少一条 server session API helper 或 UI helper，让主链路测试通过 `start_trek_session -> append_trek_point -> verify_summit_checkin` 造数。local session seed 可以保留为 legacy/fast seed，但不能作为主链路稳定性证据。

是否需要新测试：需要。建议新增 server session happy path API smoke，以及把至少一个 community seed 改成 server session helper。

#### P0-3：checkin 插入、session 更新、统计 RPC 不在同一事务，可能产生部分成功

涉及文件：`src/app/api/trek/actions/route.ts:551-595`

问题概述：成功插入 `checkins` 后，`trek_sessions` 更新没有检查错误，统计 RPC 也吞错。若 session update 失败，用户会得到成功 checkinId，但原 session 仍可能保持 tracking；若 RPC 失败，计数/省份贡献可能缺失且无告警。

代码上下文：

```ts
// src/app/api/trek/actions/route.ts:570-595
if (createError || !createdCheckin) {
  return NextResponse.json({ error: createError?.message ?? 'create checkin failed' }, { status: 500 })
}

const verifiedCheckin = createdCheckin as unknown as { id: string }

if (serverSession) {
  await supabase
    .from('trek_sessions')
    .update({
      mountain_id: mountain.id,
      status: 'summit_verified',
      verify_state: 'verified',
      ended_at: now,
    })
```

```ts
// src/app/api/trek/actions/route.ts:589-595
try {
  await Promise.all([
    supabase.rpc('increment_checkin_count', { mid: mountain.id }),
    supabase.rpc('increment_user_stats', { uid: user.id, alt: mountain.altitude }),
    mountain.province ? supabase.rpc('increment_province_score', { pname: mountain.province }) : Promise.resolve(),
  ])
} catch {}
```

建议修法概要：N2-B 应至少检查 session update error 并记录/返回可恢复状态；更稳妥是把核验写入、session 状态转移、统计增量封装为单个 SQL RPC 或事务化 server function。统计 RPC 可保持 best-effort，但需要明确不会影响主链路，且最好有日志。

是否需要新测试：需要。建议用 mock/DB 约束场景覆盖 session update failure，或在集成测试中断言成功核验后 session 状态一定变为 `summit_verified`。

### P1

#### P1-1：nearest active mountain fallback 可能把缺 mountainId 的请求归到错误山峰

涉及文件：`src/app/api/trek/actions/route.ts:492-516`

问题概述：当 `body.mountainId` 和 `serverSession.mountain_id` 都缺失时，后端会按最后轨迹点自动选最近 active mountain。这个分支让缺参请求仍能成功，适合兜底，但也可能在坐标数据异常或两座山接近时归错山。

代码上下文：

```ts
// src/app/api/trek/actions/route.ts:502-516
let mountain = targetMountain
if (!mountain) {
  const { data: allMountains } = await listActiveMountainsForVerification(supabase)

  if (!allMountains?.length) {
    return NextResponse.json({ error: 'no_active_mountains' }, { status: 500 })
  }

  const last = points.at(-1)!
  mountain = [...allMountains].sort(
    (a, b) =>
      haversineMeters(last.lat, last.lng, a.latitude, a.longitude) -
      haversineMeters(last.lat, last.lng, b.latitude, b.longitude)
  )[0] as Mountain & { summit_radius_m?: number | null }
}
```

建议修法概要：N2-B 可考虑 server session 必须有 `mountain_id`，local/QA 路径必须显式传 `mountainId`，nearest fallback 降级为错误提示或只用于受控迁移。需要测试缺 mountainId 的行为。

是否需要新测试：需要。

#### P1-2：客户端最后一个点 append 与 verify 并发，server session 可能使用较旧 track_points

涉及文件：`src/app/(main)/trek/TrekPageClient.tsx:217-239`, `src/app/(main)/trek/TrekPageClient.tsx:393-409`

问题概述：`handleGpsCheckin` 会先 await `appendPointToServer`，但 `appendPointToServer` 内部有 `syncingPointRef` guard；如果已有后台同步正在进行，它会直接 return。随后 server session verify 从 DB 读取 track_points，可能还没有包含最新 GPS 点。

代码上下文：

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:217-239
const appendPointToServer = useCallback(
  async (
    sid: string,
    point: { lat: number; lng: number; ts: number; altitude?: number | null; accuracy: number },
    accuracy: number
  ) => {
    if (syncingPointRef.current) return
    syncingPointRef.current = true
    try {
      await callTrekAction({
        action: 'append_trek_point',
        sessionId: sid,
        point: {
```

```tsx
// src/app/(main)/trek/TrekPageClient.tsx:393-409
await appendPointToServer(
  sessionId,
  { lat: gps.lat, lng: gps.lng, ts: Date.now(), altitude: gps.altitude, accuracy: gps.accuracy },
  gps.accuracy
)
const data = await callTrekAction({
  action: 'verify_summit_checkin',
  sessionId,
  note: checkinNote,
```

建议修法概要：N2-B 可让 verify request 对 server session 也携带 finalPoint，由后端在同一 action 内 append-and-verify，或让 append queue 返回真实完成状态。需要测试“最后一点进入 200m，之前点在 200m 外”的边界。

是否需要新测试：需要。

#### P1-3：前端和后端规则同源但 env 命名是 public，生产误开会降低核验门槛

涉及文件：`src/lib/trek-utils.ts:3-10`

问题概述：`TREK_RULES` 同时服务客户端和服务端，且用 `NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS` 决定最小点数/时长。这个 public env 如果在生产误设，会把服务端核验门槛从 8 点/90 秒降到 2 点/1 秒。

代码上下文：

```ts
// src/lib/trek-utils.ts:3-10
const QA_TREK_RULES_ENABLED = process.env.NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS === 'true'

export const TREK_RULES = {
  minTrackPoints: QA_TREK_RULES_ENABLED ? 2 : 8,
  minSessionSeconds: QA_TREK_RULES_ENABLED ? 1 : 90,
  defaultApproachRadiusM: 500,
  defaultSummitRadiusM: 200,
  maxDriftSpeedMps: 9.5,
} as const
```

建议修法概要：N2-B 可拆分 client display rules 与 server enforcement rules，server 只接受 non-public env 或固定生产阈值。需要测试 env 开关对 server 核验阈值的影响，至少加文档/检查项确认生产不启用。

是否需要新测试：建议需要。

### P2

#### P2-1：`insertCheckinWithFallback` 继续保留 schema compatibility fallback，N1-A 后可能掩盖真实 schema 问题

涉及文件：`src/app/api/trek/actions/route.ts:114-160`

问题概述：N1-A 已补齐相关字段，但插入 checkin 仍会按 optional columns 逐个删除并重试。这对旧 schema 友好，但上线后可能把字段缺失、迁移未完整应用等 P0 环境问题降级成 silent compatibility。

代码上下文：

```ts
// src/app/api/trek/actions/route.ts:114-160
const OPTIONAL_CHECKIN_COLUMNS = [
  'source',
  'session_id',
  'verified_at',
  'verification_distance_m',
  'ranking_weight',
  'review_note',
  'admin_note',
] as const

async function insertCheckinWithFallback(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  payload: Record<string, unknown>,
  selectClause: string
) {
```

建议修法概要：N2-B 可先保留 fallback，但增加日志和测试；N1-B 完成并稳定后再单独清理。这个不应阻塞 N2-B 的 P0 修复。

是否需要新测试：可选。

#### P2-2：`verify_state='failed'` 未被使用

涉及文件：`supabase-init.sql:300-314`, `src/app/api/trek/actions/route.ts:576-584`

问题概述：schema 支持 `verify_state` 为 `pending/verified/failed`，但失败分支只返回错误，不写 `trek_sessions.verify_state='failed'`。这会让后台或诊断看不到失败原因。

代码上下文：

```sql
-- supabase-init.sql:300-314
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS verify_state TEXT DEFAULT 'pending';
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS track_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS track_summary JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS distance_m NUMERIC DEFAULT 0;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS ascent_m INTEGER DEFAULT 0;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS descent_m INTEGER DEFAULT 0;
ALTER TABLE public.trek_sessions ADD COLUMN IF NOT EXISTS max_altitude_m INTEGER DEFAULT 0;

ALTER TABLE public.trek_sessions DROP CONSTRAINT IF EXISTS trek_sessions_verify_state_check;
ALTER TABLE public.trek_sessions
  ADD CONSTRAINT trek_sessions_verify_state_check CHECK (verify_state IN ('pending','verified','failed'));
```

```ts
// src/app/api/trek/actions/route.ts:576-584
await supabase
  .from('trek_sessions')
  .update({
    mountain_id: mountain.id,
    status: 'summit_verified',
    verify_state: 'verified',
    ended_at: now,
  })
```

建议修法概要：N2-B 若需要可记录失败原因和 verify_state，但这属于可观测性增强，不应压过幂等和 local session 风险。

是否需要新测试：可选。

#### P2-3：主 route 多 action 复用，verify 分支可读性与测试隔离较弱

涉及文件：`src/app/api/trek/actions/route.ts:13-20`, `src/app/api/trek/actions/route.ts:197-752`

问题概述：一个 POST route multiplex 了 list/start/append/finish/verify/photo/share 六类动作。`verify_summit_checkin` 夹在多个动作中，helper 与 branch 状态共享，专项测试不容易只针对 verify 逻辑。

代码上下文：

```ts
// src/app/api/trek/actions/route.ts:13-20
type ActionName =
  | 'list_active_mountains'
  | 'start_trek_session'
  | 'finish_trek_session'
  | 'append_trek_point'
  | 'verify_summit_checkin'
  | 'submit_historical_checkin'
  | 'generate_share_card'
```

建议修法概要：N2-B 可以先不拆 route；如要小重构，优先抽出 pure helpers（resolve session, validate points, resolve mountain, create verified checkin）并配单元测试。避免在 N2-B 同时做路由拆分。

是否需要新测试：建议配合 helper 抽出时新增。

## 维度 7 · 修复优先级建议

### N2-B 范围草案

1. P0 第一批：local session 安全边界与幂等
   * 明确 local session 在生产的允许条件。
   * 为 local session 增加拒绝/幂等/去重策略。
   * 新增 API 测试覆盖 local session 重复提交。

2. P0 第二批：server session 主链路完整性
   * 增加 server session API helper，覆盖 `start -> append -> verify`。
   * 断言成功后 `checkins.session_id` 存在，`trek_sessions.status=summit_verified`，重复同 session 不新增 checkin。
   * 覆盖短时长、轨迹点不足、边界半径外、缺 mountainId。

3. P0/P1 第三批：一致性与 race
   * 处理 final point append 与 verify 的并发窗口。
   * 对 session update error 至少返回可诊断错误，不要静默成功。
   * 评估是否需要 SQL RPC 事务化。

4. P2 后置：结构清理
   * `insertCheckinWithFallback` 清理或加日志。
   * `verify_state='failed'` 和失败原因记录。
   * 将 verify 纯逻辑抽 helper，便于单元测试。

## 本次诊断中未能确认的事项

* 未运行 Playwright 或 API 测试；本批次按要求只读代码并生成诊断报告。
* 未连接生产 Supabase 验证实际 env 是否启用 `NEXT_PUBLIC_ENABLE_QA_TEST_HELPERS`；风险按代码路径记录。
* 未确认统计 RPC `increment_checkin_count` / `increment_user_stats` / `increment_province_score` 的 SQL 定义是否事务安全；当前报告只基于调用方式判断 best-effort 风险。
* 未确认线上是否仍可能触发 `start_trek_session` schema fallback；N1-A/N1-B 后理论上不应触发，但代码仍保留 local session fallback。
