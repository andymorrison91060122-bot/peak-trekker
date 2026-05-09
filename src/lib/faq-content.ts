export type FaqQuestion = {
  id: string
  anchor: string
  q: string
  a: string
  long?: boolean
}

export type FaqGroup = {
  id: string
  title: string
  questions: FaqQuestion[]
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'start',
    title: '开始一次山行',
    questions: [
      {
        id: 'how-to-record',
        anchor: 'start.how-to-record',
        q: '如何开始一次记录',
        a: '在底部「出发」点开,选好这次要去的山,Peak Trekker 会做一次 GPS 检查。通过后按下开始,屏幕会保持常亮直到你停下来。',
      },
      {
        id: 'already-walked',
        anchor: 'start.already-walked',
        q: '我已经走过了,现在怎么办',
        a: '有四条路可走,选最贴近你这次实际情况的那一条:\n\n· 导入轨迹文件 —— 你当时用了别的工具(手表、Garmin、两步路、健康),手里有 GPX/FIT 文件\n· 上传 App 截图 —— 你在两步路、六只脚、行者等其他 App 完成了记录,现在只有截图\n· 登顶留证 —— 你当时没记录,但有一张登顶照片或途中照片\n· 手动补签 —— 你只想把这次山行作为一条记录留下,没有照片也没有轨迹',
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
        a: '走到距离峰顶足够近的时候,Peak Trekker 会提示你拍一张照作为登顶留证。这是为了让留证和登顶时间能对得上。\n\n错过窗口也没关系,可以下山之后用「登顶留证」补一张。',
      },
      {
        id: 'unattributed',
        anchor: 'record.unattributed',
        q: '什么是「未归属」山行',
        a: '记录开始时如果没有选具体的山,这次记录会先标记为「未归属」存进档案。\n\n之后随时可以打开这条记录,把它认领到一座具体的山上。',
      },
      {
        id: 'data-loss',
        anchor: 'record.data-loss',
        q: '记录失败了,数据会丢吗',
        a: '记录中所有数据都先写在本地。哪怕 App 闪退、手机重启、信号断了,这次山行的轨迹和海拔也都还在。\n\n下一次打开 Peak Trekker,会提示你处理这条未结束的记录。',
      },
      {
        id: 'source-label',
        anchor: 'record.source-label',
        q: 'GPS VERIFIED 和 UPLOADED 是什么意思',
        a: '这是 Peak Trekker 的来源标签,标在每条山行上,看的人能一眼判断这条记录的数据来源。\n\n· GPS VERIFIED —— 通过 Peak Trekker 实时记录的 GPS 山行,或通过登顶留证审核的山行\n· UPLOADED —— 从其他工具导入轨迹文件、或从其他 App 截图识别得来的山行\n\n两种都是真实记录,标签只是说明数据来源不同。',
      },
    ],
  },
  {
    id: 'review',
    title: '审核与发布',
    questions: [
      {
        id: 'what-is-review',
        anchor: 'review.what-is-review',
        q: '什么是「审核中」',
        a: '补签和登顶留证需要核验后才会进入档案。如果有需要补充的信息,会通过站内消息告诉你。',
        long: true,
      },
      {
        id: 'review-failed',
        anchor: 'review.review-failed',
        q: '为什么我的山行没通过',
        a: '常见的几种情况:\n\n· 照片里没有可识别的峰顶或路标\n· 时间和位置和已有信息对不上\n· 同一段轨迹已经被另一条记录用过\n\n站内消息里会写明具体原因。修一下重新提交就行。',
      },
      {
        id: 'community-eligibility',
        anchor: 'review.community-eligibility',
        q: '什么样的山行能发到山友圈',
        a: '需要满足两个条件:\n\n· 这次山行已经通过核验,出现在你的档案里\n· 你在「分享」里选择了「发布到山友圈」\n\nGPS 实录和登顶留证会标记为 GPS VERIFIED;轨迹导入和截图识别会标记为 UPLOADED — 看的人能区分。',
      },
      {
        id: 'community-scope',
        anchor: 'review.community-scope',
        q: '山友圈现在能做什么',
        a: '现在能做的事不多:看走过同一座山的人发的山行,给他们点个赞。\n\n评论、关注、消息这些会陆续加进来。我们没急着把它做成又一个朋友圈。',
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
        q: '「仅山友圈可见」和「公开」的区别',
        a: '仅山友圈可见 —— 只有 Peak Trekker 用户、登录之后能看到。\n\n公开 —— 链接发给谁谁就能看,不需要登录。\n\n两个选项都不会暴露你的原始轨迹,只显示已经勾选的字段和你写的话。',
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
        a: 'Peak Trekker 不是导航工具,我们刻意没做实时导航。\n\n我们提供的是路线参考 —— 历史路径、关键点位、海拔剖面 —— 帮你判断要不要去、走到哪一段了。决策靠你自己,不是靠箭头。',
      },
      {
        id: 'weather-lag',
        anchor: 'map.weather-lag',
        q: '天气更新有时差是怎么回事',
        a: '山区气象点稀疏,数据来自最近的气象站和高分卫星合成,有几分钟到几小时的延迟。\n\n出发前请通过其他渠道复核当前状况。我们标了「更新于 X 分钟前」,就是希望你看了之后心里有数。',
        long: true,
      },
      {
        id: 'weather-tier',
        anchor: 'map.weather-tier',
        q: '不同山的天气更新频率为什么不同',
        a: '山按数据丰富度分四档 —— S 级(每小时更新)、A 级(每 6 小时)、B 级(每天一次)、C 级(访问时按需)。\n\n大众线和热门高山多为 S/A,偏远山和小众线多为 B/C。山峰详情页的更新时间能直接看到。',
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
        a: '执照分无执照、初级、中级、高级四档。它不是用来炫耀的徽章,是为了让你不要去明显超出能力范围的山。\n\n每座山在详情页都标了对应等级。低于这座山要求的等级,就不能开始 GPS 实时记录。',
      },
      {
        id: 'license-upgrade',
        anchor: 'license.license-upgrade',
        q: '怎么提升执照等级',
        a: '完成对应等级的山行就会自动升一级,具体路径写在「我的 — 执照」里。\n\n升级路径以已经完成的真实山行为依据,不能靠答题或买课程跳级。',
      },
      {
        id: 'season-window',
        anchor: 'license.season-window',
        q: '什么是季节性提示',
        a: '高海拔山有明确的攀登季节,山峰详情页会标注当前是否处于建议出发的窗口期。\n\n这是建议,不是禁止 —— 我们仍然会让你看到山峰资料,但如果当前条件不适合,会在详情页中提醒你。',
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
        a: '在「我的」点头像,进入个人资料页,头像、昵称、所在省份都可以改。\n\n执照等级和山行档案不能手动改 —— 它们由你已经完成的山行决定。',
      },
      {
        id: 'feedback',
        anchor: 'account.feedback',
        q: '问题反馈和联系我们',
        a: '在「我的 — 设置 — 反馈」里写一句话发给我们。如果是 bug,带上当时在做什么、什么山,我们会尽快回复。\n\n我们不大,所以反馈基本上由真人在看。',
      },
    ],
  },
]

export const FAQ_BY_ANCHOR = (() => {
  const m: Record<string, FaqQuestion & { group: FaqGroup }> = {}
  FAQ_GROUPS.forEach((group) => {
    group.questions.forEach((question) => {
      m[question.anchor] = { ...question, group }
    })
  })
  return m
})()
