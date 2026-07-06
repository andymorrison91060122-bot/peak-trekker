import { isFeatureEnabled } from '@/lib/feature-flags'

export type FaqQuestion = {
  id: string
  anchor: string
  q: string
  a: string
  contactEmail?: string
  long?: boolean
}

export type FaqGroup = {
  id: string
  title: string
  questions: FaqQuestion[]
}

export const BASE_FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'start',
    title: '开始一次山行',
    questions: [
      {
        id: 'how-to-record',
        anchor: 'start.how-to-record',
        q: '如何开始一次记录',
        a: '在底部「出发」点开，选好这次要去的山，Peak Trekker 会做一次 GPS 检查。通过后按下开始就进入记录。\n\n记录过程中请让屏幕保持点亮，避免手机休眠打断定位。',
      },
      {
        id: 'already-walked',
        anchor: 'start.already-walked',
        q: '我已经走过了,现在怎么办',
        a: '有两条路可走，选最贴近你这次实际情况的那一条：\n\n· 导入轨迹文件 —— 你当时用了别的工具（手表、Garmin、两步路、健康），手里有 GPX/FIT 文件\n· 上传 App 截图 —— 你在两步路、六只脚、行者等其他 App 完成了记录，现在只有截图\n\n如果手里只有一张登顶照片、或既没照片也没轨迹，这两种补录方式我们还在做，暂时还没开放。',
        long: true,
      },
      {
        id: 'mountain-not-listed',
        anchor: 'start.mountain-not-listed',
        q: '没有我想去的山怎么办',
        a: '当前我们优先覆盖热门和资料完整的山峰。如果你想去的山暂时没找到,可以先用「导入轨迹文件」或「上传 App 截图」把这次记录留下,我们持续扩充山峰库。',
      },
    ],
  },
  {
    id: 'import',
    title: '导入轨迹',
    questions: [
      {
        id: 'export-gpx',
        anchor: 'import.export-gpx',
        q: '怎么从手表或 App 导出 GPX 轨迹？',
        a: '推荐导出 GPX 格式，数据最完整。各主流平台导出路径：\n\n· 高驰 COROS — App → 训练详情 → 右上角 ⋯ → 导出 → 选 GPX\n· 佳明 Garmin — Connect App → 活动 → ⋯ → 导出原始数据 / 导出 GPX\n· 两步路 — 详情页 → 分享 → 下载数据 → 选 GPX\n· 苹果健康 — 通过第三方 App 如 HealthFit 导出\n· Strava — 活动详情 → 右上角菜单 → 导出 GPX\n· 咕咚 / Keep — 详情 → 设置 / 分享 → 导出 GPX\n\nKML / FIT 也可上传，但部分平台导出的 KML 不包含时间数据，需要你在导入时补填。',
        long: true,
      },
    ],
  },
  {
    id: 'record',
    title: '记录与留证',
    questions: [
      {
        id: 'gps-weak',
        anchor: 'record.gps-weak',
        q: 'GPS 信号弱了会怎样',
        a: '山里树林密、谷地深,GPS 偶尔会跟丢。这种情况下海拔会继续跟踪当前位置。\n\n距离和地图会暂停更新,等信号回来会自动续上。这次记录不会因为信号弱被作废。',
      },
      {
        id: 'summit-window',
        anchor: 'record.summit-window',
        q: '接近峰顶的「留证」是什么',
        a: '走到距离峰顶足够近的时候,Peak Trekker 会提示你可以确认登顶。GPS 到达峰顶范围即视为登顶,照片和备注都可选,也可以下山之后再补。\n\n如果你没有手动点确认,结束记录时系统也会根据整段 GPS 轨迹做核验。',
        long: true,
      },
      {
        id: 'summit-rules',
        anchor: 'record.summit-rules',
        q: '怎样才算登顶 / 系统如何判定登顶',
        a: 'Peak Trekker 的核验依据是 GPS 轨迹是否到达目标山峰的峰顶范围。到达范围即视为登顶,峰顶无需额外操作。\n\n手动「我已登顶」会保留仪式感,但不是必要条件。照片、备注和细节都可以下山后补。',
        long: true,
      },
      {
        id: 'data-loss',
        anchor: 'record.data-loss',
        q: '记录失败了,数据会丢吗',
        a: '记录中的轨迹会持续同步。App 闪退或手机重启后，下次打开 Peak Trekker 时，系统会尽量帮你恢复这条还没结束的记录，接着往下记。\n\n网络断开时新采集的点要等信号恢复才会同步，极端情况下可能丢失最后没传上去的一小段。',
      },
      {
        id: 'source-label',
        anchor: 'record.source-label',
        q: 'GPS VERIFIED 和 UPLOADED 是什么意思',
        a: '这是 Peak Trekker 的来源标签,标在每条山行上,看的人能一眼判断这条记录的数据来源。\n\n· GPS VERIFIED —— 通过 Peak Trekker 实时记录,且 GPS 轨迹到达峰顶范围的山行;照片不是必要条件\n· UPLOADED —— 从其他工具导入轨迹文件、或从其他 App 截图识别得来的山行\n\n两种都是真实记录,标签只是说明数据来源不同。',
      },
    ],
  },
  {
    id: 'review',
    title: '发布与资格',
    questions: [
      {
        id: 'what-is-review',
        anchor: 'review.what-is-review',
        q: '什么是「登顶留证」',
        a: '登顶留证是为「走过、但当时没用 Peak Trekker 记录」的山行准备的补登记方式 —— 提交一张登顶照和几行说明，把它补进你的档案，我们会清楚标明这是事后补充、不判定真伪。\n\n这条补登记目前还在搭建中，我们正在做；现在能用的是实时记录、导入轨迹和上传截图。',
        long: true,
      },
      {
        id: 'community-eligibility',
        anchor: 'review.community-eligibility',
        q: '什么样的山行能发到山友圈',
        a: '需要满足两个条件：\n\n· 这次山行已经有可发布的活动记录，并且关联到山峰\n· 在活动详情页点了「发布到山友圈」\n\nGPS 实录会标记为 GPS VERIFIED；轨迹导入和截图识别会标记为 UPLOADED —— 看的人能区分。',
      },
      {
        id: 'community-scope',
        anchor: 'review.community-scope',
        q: '山友圈现在能做什么',
        a: '山友圈现在先聚焦真实山行的浏览和点赞。你可以看看别人走过的路线、照片和记录，也可以给喜欢的山行点个赞。\n\n评论、关注和消息会后续再加。',
      },
    ],
  },
  {
    id: 'privacy',
    title: '分享与隐私',
    questions: [
      {
        id: 'share-content',
        anchor: 'privacy.share-content',
        q: '分享图里都包含什么信息',
        a: '只有你在分享编辑里勾选保留的字段会出现在图上 —— 山名、海拔、距离、爬升、时长、配速、日期、地点。\n\n原始 GPS 轨迹、照片定位信息、设备信息都不会出现在分享图里。',
      },
      {
        id: 'visibility',
        anchor: 'privacy.visibility',
        q: '「所有人可见」和「仅自己可见」有什么区别',
        a: '可见性有两个选项，都在「发布到山友圈」里选：\n\n所有人可见 —— 登录的 Peak Trekker 用户在山友圈里能看到这条山行。\n\n仅自己可见 —— 只有你自己能看到，不会出现在山友圈里。\n\n两个选项都需要登录才能查看，都不会暴露你的原始轨迹，只显示你勾选的字段和写的话。',
      },
      {
        id: 'delete-published',
        anchor: 'privacy.delete-published',
        q: '我可以删除已发布的内容吗',
        a: '可以。在山友圈里打开自己发的山行,右上角更多 — 删除。删除之后这次发布的图、文字和点赞都会一起消失。\n\n你的山行档案不会受影响 —— 档案是档案,发布是发布。',
      },
      {
        id: 'who-sees-track',
        anchor: 'privacy.who-sees-track',
        q: '我的轨迹数据谁能看到',
        a: '只有你自己。\n\n哪怕你把这次山行发到山友圈,也只是一张分享图,不包含原始轨迹。我们不会把你的 GPS 数据卖给第三方,也不会用来训练别的什么。',
      },
      {
        id: 'altitude-priority',
        anchor: 'privacy.altitude-priority',
        q: '为什么海拔在 Peak Trekker 里被特别放大',
        a: '海拔是登山这件事最实在的产物。它既是目标,也是过程,更是结果证明 —— 你站到了多高,这件事很难被伪造。\n\n所以海拔在找山、记录、分享、回看这四段里都被优先看见,字号、颜色、位置都给它最重的权重。',
      },
    ],
  },
  {
    id: 'map',
    title: '地图与天气',
    questions: [
      {
        id: 'map-no-nav',
        anchor: 'map.map-no-nav',
        q: '地图为什么不能导航',
        a: 'Peak Trekker 不是导航工具，我们刻意没做实时导航。\n\n我们提供的是路线参考 —— 关键点位和它们的海拔 —— 帮你大致判断要不要去、心里有个分段概念。决策靠你自己，不是靠箭头。\n\n目前只有部分山峰带离线参考底图，其余以文字分段说明为主；实时定位和轨迹叠加都不在地图上。',
      },
      {
        id: 'weather-lag',
        anchor: 'map.weather-lag',
        q: '天气更新有时差是怎么回事',
        a: '山区气象点稀疏，天气数据来自第三方气象服务，有几分钟到几小时的延迟。\n\n出发前请通过其他渠道复核当前状况。我们在天气卡上标了更新时间，就是希望你看了之后心里有数。',
        long: true,
      },
      {
        id: 'weather-tier',
        anchor: 'map.weather-tier',
        q: '不同山的天气更新频率为什么不同',
        a: '热门山和数据更完整的山会更新得更勤，偏远或数据较少的山更新会慢一些。\n\n山峰详情页会显示最近一次天气更新时间，出发前请再通过其他渠道复核。',
      },
    ],
  },
  {
    id: 'license',
    title: '山峰与执照',
    questions: [
      {
        id: 'license-tiers',
        anchor: 'license.license-tiers',
        q: '执照等级是什么意思',
        a: '执照分无执照、初级、中级、高级四档。它不是用来炫耀的徽章,而是帮助你理解自己的 GPS 实录经验。\n\n山峰会显示难度建议；难度高于当前执照时会给出提醒,但不会阻止你浏览或开始记录。',
      },
      {
        id: 'license-upgrade',
        anchor: 'license.license-upgrade',
        q: '怎么提升执照等级',
        a: '你的执照等级由你完成的 GPS 有效登山记录数 + 山峰难度决定。\n\n- 无执照 → 初级: 完成 3 座入门线（含进阶线 / 高阶线 / 专家线）山的有效 GPS 记录\n- 初级 → 中级: 完成 3 座进阶线（含高阶线 / 专家线）山的有效 GPS 记录\n- 中级 → 高级: 完成 3 座高阶线（含专家线）山的有效 GPS 记录\n\n执照只是经验信号，不限制你登任何山。',
      },
      {
        id: 'season-window',
        anchor: 'license.season-window',
        q: '什么是季节性提示',
        a: '山峰详情页会按海拔和当前月份给一个季节提示：高海拔山（约 4000m 以上）通常 10–11 月更稳，中低海拔山通常 4–10 月更适合，并标注当前是否在这个建议窗口里。\n\n这是粗略建议，不是逐座山的精确攀登季，也不是禁止 —— 我们仍会让你看到全部山峰资料，只是当前不在建议窗口时，会在详情页提醒你出发前自行复核天气。',
      },
    ],
  },
  {
    id: 'account',
    title: '账号与反馈',
    questions: [
      {
        id: 'edit-profile',
        anchor: 'account.edit-profile',
        q: '怎么修改头像和昵称',
        a: '在「我的」点头像可以更换头像，昵称也可以在「我的」页面编辑。\n\n所在省份暂不支持修改；执照等级和山行档案也不能手动改 —— 它们由你已经完成的山行决定。',
      },
      {
        id: 'feedback',
        anchor: 'account.feedback',
        q: '问题反馈和联系我们',
        a: 'Peak Trekker 想做的事很简单：帮喜欢登山的人记录自己的山行经历，也帮你把这些经历更好地分享出去。\n\n我们也希望和热爱登山的人像朋友一样交流，一起把这个产品慢慢做好。如果你有任何想法、建议、使用中的问题，或者只是想聊聊哪里还能更好，都可以发邮件给我们。',
        contactEmail: 'isabella6bnb61lltavee5n@gmail.com',
        long: true,
      },
    ],
  },
]

export const COMMUNITY_FAQ_ANCHORS = new Set([
  'review.community-eligibility',
  'review.community-scope',
  'privacy.visibility',
  'privacy.delete-published',
])

const TRACK_PRIVACY_NON_COMMUNITY_ANSWER =
  '只有你自己。\n\n生成分享图时，只会包含你在分享编辑里选择展示的字段，不包含原始轨迹。我们不会把你的 GPS 数据卖给第三方，也不会用来训练别的什么。'

function getFlagAwareQuestion(question: FaqQuestion): FaqQuestion {
  if (isFeatureEnabled('COMMUNITY_ENABLED')) return question
  if (question.anchor !== 'privacy.who-sees-track') return question

  return {
    ...question,
    a: TRACK_PRIVACY_NON_COMMUNITY_ANSWER,
  }
}

export const FAQ_GROUPS: FaqGroup[] = BASE_FAQ_GROUPS.map((group) => ({
  ...group,
  questions: group.questions
    .filter((question) => isFeatureEnabled('COMMUNITY_ENABLED') || !COMMUNITY_FAQ_ANCHORS.has(question.anchor))
    .map(getFlagAwareQuestion),
})).filter((group) => group.questions.length > 0)

export const FAQ_BY_ANCHOR = (() => {
  const m: Record<string, FaqQuestion & { group: FaqGroup }> = {}
  FAQ_GROUPS.forEach((group) => {
    group.questions.forEach((question) => {
      m[question.anchor] = { ...question, group }
    })
  })
  return m
})()
