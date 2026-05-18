export type ToastTone = 'success' | 'error' | 'info'
export type ToastAppearance = 'tone' | 'surface'

export const TOAST_REGISTRY = {
  trek_start_success: {
    tone: 'success',
    message: '开始记录成功，正在采集本次登山轨迹。',
  },
  action_blocked: {
    tone: 'info',
    message: '当前操作暂不可完成，请先补齐前置条件。',
  },
  device_location_unsupported: {
    tone: 'error',
    message: '当前设备不支持定位，请更换浏览器或设备后重试。',
  },
  location_error: {
    tone: 'error',
    message: '定位暂时异常，请调整位置或稍后重试。',
  },
  trek_session_create_failure: {
    tone: 'error',
    message: '创建记录会话失败，请稍后重试。',
  },
  mountain_target_confirmed: {
    tone: 'success',
    message: '目标山峰已锁定，可以开始记录。',
  },
  trek_record_too_short: {
    tone: 'info',
    message: '记录时间过短（不足 1 分钟），不是有效记录。',
  },
  trek_record_saved: {
    tone: 'success',
    message: '记录已保存到我的山行档案。',
  },
  trek_record_save_failure: {
    tone: 'error',
    message: '保存记录失败，请稍后重试。',
  },
  trek_pause_persist_failed: {
    tone: 'error',
    message: '暂停状态保存失败，请稍后重试。',
  },
  trek_manual_refresh_cooldown: {
    tone: 'info',
    message: '刷新太频繁，请稍等几秒。',
  },
  trek_resume_failed: {
    tone: 'error',
    message: '继续记录失败，请稍后重试。',
  },
  trek_start_too_far: {
    tone: 'error',
    message: '经校验，您并不在这个山峰的附近，请到山峰附近再开始记录。',
  },
  summit_evidence_insufficient: {
    tone: 'info',
    message: '登顶留证还缺少必要轨迹，请继续记录一小段再试。',
  },
  trek_gps_weak_retrying: {
    tone: 'info',
    message: 'GPS 信号较弱，正在重试...',
  },
  summit_verify_success: {
    tone: 'success',
    message: '登顶核验成功，已生成活动记录。',
  },
  summit_verify_failure: {
    tone: 'error',
    message: '登顶核验失败，请稍后重试。',
  },
  photo_checkin_success: {
    tone: 'success',
    message: '照片已提交，审核通过后将出现在记录中。',
  },
  image_upload_success: {
    tone: 'success',
    message: '图片素材已加入当前登山记录。',
  },
  image_upload_failure: {
    tone: 'error',
    message: '图片上传失败，请稍后重试。',
  },
  video_upload_success: {
    tone: 'success',
    message: '视频素材已加入当前登山记录。',
  },
  video_upload_failure: {
    tone: 'error',
    message: '视频上传失败，请稍后重试。',
  },
  storage_missing: {
    tone: 'error',
    message: '当前环境未配置图片存储，请联系管理员补齐存储配置。',
  },
  poster_generate_success: {
    tone: 'success',
    message: '海报生成成功，可以预览后再分享。',
  },
  poster_generate_failure: {
    tone: 'error',
    message: '生成分享图失败，请稍后重试。',
  },
  dynamic_link_copied: {
    tone: 'success',
    message: '链接已复制',
  },
  share_invoked: {
    tone: 'success',
    message: '分享已调起。',
  },
  share_unsupported: {
    tone: 'info',
    message: '分享失败，请稍后重试',
  },
  delete_success: {
    tone: 'success',
    message: '删除成功。',
  },
  delete_failure: {
    tone: 'error',
    message: '删除失败，请稍后重试。',
  },
  like_added: {
    tone: 'success',
    message: '点赞成功。',
  },
  like_removed: {
    tone: 'info',
    message: '已取消点赞。',
  },
  like_failure: {
    tone: 'error',
    message: '点赞失败，请稍后重试。',
  },
  likers_load_failure: {
    tone: 'error',
    message: '暂时无法加载点赞列表。',
  },
  report_submitted: {
    tone: 'success',
    message: '举报已提交，我们会尽快处理。',
  },
  report_failure: {
    tone: 'error',
    message: '举报失败，请稍后重试。',
  },
  avatar_upload_success: {
    tone: 'success',
    message: '头像已更新，个人主页和山友圈会同步展示。',
  },
  avatar_upload_failure: {
    tone: 'error',
    message: '头像上传失败，请稍后重试。',
  },
  publish_failure: {
    tone: 'error',
    message: '发布失败，请稍后重试。',
  },
  network_unstable: {
    tone: 'error',
    message: '当前网络不稳定，请在信号更稳定后重试。',
  },
} as const satisfies Record<string, { tone: ToastTone; message: string }>

export type ToastKey = keyof typeof TOAST_REGISTRY
