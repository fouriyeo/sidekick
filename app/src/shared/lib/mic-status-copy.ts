export const MIC_STATUS_COPY = {
  inserted: "已输入",
  copied: "已复制到电脑",
  timeout: "电脑端没回应，再说一次？",
  busy: "电脑端正在处理上一段语音。",
  sessionError: "语音会话出了点问题，再试一次。",
  insertFailed: "电脑端没能输入，再试一次？",
  empty: "没听清，靠近一点再说一次。",
  checkSettings: "检查一下连接和麦克风权限。",
  copiedAccessibility: "已复制；电脑没开辅助功能，在电脑上点「去开启」就能自动输入。",
  copiedTargetChanged: "窗口变了，已复制到电脑。",
  copiedSecureInput: "当前是密码框，已复制。",
  copiedFallback: "已复制到电脑。",
  truncated: "太长了，只输入了前 2000 字。",
  warning: "快到 1 分钟了",
  cloudNotConfigured: "云端还没配置，去电脑「模型」页填百炼地址和 API Key。",
  cloudKeyInvalid: "百炼 API Key 无效或已过期，去电脑「模型」页重新保存。",
  cloudForbidden: "这个 Key 没有该模型或业务空间的权限。",
  cloudRateLimited: "百炼限流了，稍等一会儿再说。",
  cloudQuotaExceeded: "百炼额度不足，去控制台检查。",
  cloudModelNotFound: "模型不存在，或当前地域不可用。",
  cloudNetwork: "连不上百炼，检查电脑网络。",
  cloudTimeout: "百炼响应超时，这段没转完。",
  cloudTaskFailed: "百炼识别失败，再说一次试试。",
  cloudInternal: "云端会话异常结束，请重启 Sidekick 再试。",
  cloudKeyUnavailable: "读取不到电脑上保存的密钥，去电脑「模型」页重新保存。",
  keyEnter: "回车",
  keyClear: "清空",
  keyClearConfirm: "再点一次",
  keyWorking: "正在按…",
  keyEnterSent: "已按回车",
  keyClearSent: "已清空输入框",
  keyNoTarget: "没有可操作的输入，先按住说话。",
  keyTargetMismatch: "电脑焦点不在刚才的窗口，没按。",
  keySecureInput: "电脑当前是密码框，没按。",
  keyAccessibilityOff: "电脑辅助功能没开，按不了。去电脑设置开启。",
  keySendFailed: "按键没发出去，再试一次。",
  keyRateLimited: "按太快了，等一下。",
  keyNoResponse: "电脑端没回应，再试一次。",
  /** 桌面浮层/手机提示：电脑端人工取消了这次录音。 */
  cancelledByDesktop: "电脑端已取消录音。",
  /** 服务端看门狗兜底：手机停止消息丢失/卡死，录音已被自动中止。 */
  recordingTimeout: "录音超时，已自动停止。",
  /** 桌面浮层「取消录音」按钮与等待态。 */
  cancelMic: "取消录音",
  cancelMicPending: "取消中…",
  cancelMicFailed: "电脑端服务没连上，稍后再试。",
  /** 桌面浮层取消后的短状态。 */
  cancelledShort: "已取消",
} as const;

export function keyActionErrorText(code: string | null | undefined): string {
  switch (code) {
    case "no_target":
      return MIC_STATUS_COPY.keyNoTarget;
    case "session_mismatch":
      return MIC_STATUS_COPY.sessionError;
    case "target_mismatch":
      return MIC_STATUS_COPY.keyTargetMismatch;
    case "secure_input":
      return MIC_STATUS_COPY.keySecureInput;
    case "accessibility_off":
      return MIC_STATUS_COPY.keyAccessibilityOff;
    case "rate_limited":
      return MIC_STATUS_COPY.keyRateLimited;
    case "unsupported_platform":
      return MIC_STATUS_COPY.keySendFailed;
    case "send_failed":
    case "bad_request":
      return MIC_STATUS_COPY.keySendFailed;
    default:
      return MIC_STATUS_COPY.keyNoResponse;
  }
}

export function micReasonText(outcome: string, reason?: string | null): string {
  if (outcome === "inserted") return MIC_STATUS_COPY.inserted;
  if (outcome === "failed") return micErrorText(reason ?? "asr_failed");

  switch (reason) {
    case "accessibility_off":
      return MIC_STATUS_COPY.copiedAccessibility;
    case "target_mismatch":
      return MIC_STATUS_COPY.copiedTargetChanged;
    case "secure_input":
      return MIC_STATUS_COPY.copiedSecureInput;
    default:
      return MIC_STATUS_COPY.copiedFallback;
  }
}

export function micErrorText(code: string): string {
  switch (code) {
    case "session_busy":
      return MIC_STATUS_COPY.busy;
    case "asr_timeout":
      return MIC_STATUS_COPY.timeout;
    case "empty_transcript":
    case "asr_failed":
      return MIC_STATUS_COPY.empty;
    case "insert_failed":
      return MIC_STATUS_COPY.insertFailed;
    case "bad_request":
    case "session_mismatch":
      return MIC_STATUS_COPY.sessionError;
    case "cloud_not_configured":
      return MIC_STATUS_COPY.cloudNotConfigured;
    case "cloud_key_invalid":
      return MIC_STATUS_COPY.cloudKeyInvalid;
    case "cloud_forbidden":
      return MIC_STATUS_COPY.cloudForbidden;
    case "cloud_rate_limited":
      return MIC_STATUS_COPY.cloudRateLimited;
    case "cloud_quota_exceeded":
      return MIC_STATUS_COPY.cloudQuotaExceeded;
    case "cloud_model_not_found":
      return MIC_STATUS_COPY.cloudModelNotFound;
    case "cloud_network":
      return MIC_STATUS_COPY.cloudNetwork;
    case "cloud_timeout":
      return MIC_STATUS_COPY.cloudTimeout;
    case "cloud_task_failed":
      return MIC_STATUS_COPY.cloudTaskFailed;
    case "cloud_internal":
      return MIC_STATUS_COPY.cloudInternal;
    case "cloud_key_unavailable":
      return MIC_STATUS_COPY.cloudKeyUnavailable;
    default:
      return MIC_STATUS_COPY.empty;
  }
}

/**
 * 桌面顶部 HUD（快捷键流程）的文案。
 *
 * 与手机侧 `MIC_COPY` 分开：那边是「手机上操作」，这边是「人看着电脑、不看手机」，
 * 所以每句话都要回答「现在到底在不在录 / 为什么没反应」。
 */
export const REMOTE_HUD_COPY = {
  noPhone: "未连接手机麦克风",
  noPhoneHint: "让手机留在小跟班页面并保持亮屏，再按一次",
  multiPhone: "检测到多台手机",
  multiPhoneHint: "只保留一台手机在待命",
  connecting: "正在连接手机…",
  connectingHint: "第一次连接会慢半拍",
  listening: "正在听",
  listeningHint: "再按一次结束 · Esc 取消",
  processing: "识别中…",
  processingHint: "说完的文字马上进当前窗口",
  delivered: "已输入到当前窗口",
  copied: "已复制到剪贴板",
  cancelled: "已取消",
  cancelledHint: "这段录音不会转写",
  ackTimeout: "手机没有响应",
  ackTimeoutHint: "确认手机还在小跟班页面、和电脑在同一网络",
  disconnected: "连接断了",
  remoteDisabled: "手机没开「电脑遥控录音」",
  remoteDisabledHint: "手机上 更多 › 麦克风 打开即可",
  notPetPage: "手机不在小跟班页面",
  notPetPageHint: "解锁手机、回到宠物页再试",
  busy: "手机正在处理上一段语音",
  permissionDenied: "手机没给麦克风权限",
  permissionDeniedHint: "在手机上点一次麦克风，允许录音",
  audioBlocked: "手机需要先点一下屏幕",
  audioBlockedHint: "安卓要求先有触摸才能开麦",
  hintFallback: "再按一次快捷键重试",
} as const;

/** HUD 状态 → 标题 + 提示；`reason` 用协议里的稳定错误码。 */
export function remoteHudText(payload: { state: string; reason?: string | null }): {
  title: string;
  hint?: string;
} {
  const reason = payload.reason ?? null;

  switch (payload.state) {
    case "unavailable":
      if (reason === "multi_phone") {
        return { title: REMOTE_HUD_COPY.multiPhone, hint: REMOTE_HUD_COPY.multiPhoneHint };
      }
      if (reason === "remote_disabled") {
        return {
          title: REMOTE_HUD_COPY.remoteDisabled,
          hint: REMOTE_HUD_COPY.remoteDisabledHint,
        };
      }
      if (reason === "not_pet_page") {
        return { title: REMOTE_HUD_COPY.notPetPage, hint: REMOTE_HUD_COPY.notPetPageHint };
      }
      if (reason === "busy") {
        return { title: REMOTE_HUD_COPY.busy, hint: REMOTE_HUD_COPY.hintFallback };
      }
      if (reason === "permission_denied") {
        return {
          title: REMOTE_HUD_COPY.permissionDenied,
          hint: REMOTE_HUD_COPY.permissionDeniedHint,
        };
      }
      if (reason === "audio_blocked") {
        return { title: REMOTE_HUD_COPY.audioBlocked, hint: REMOTE_HUD_COPY.audioBlockedHint };
      }
      return { title: REMOTE_HUD_COPY.noPhone, hint: REMOTE_HUD_COPY.noPhoneHint };
    case "connecting":
      return { title: REMOTE_HUD_COPY.connecting, hint: REMOTE_HUD_COPY.connectingHint };
    case "listening":
      // 计时由 HUD 自己拼在标题后面，这里只给「正在听」。
      return { title: REMOTE_HUD_COPY.listening, hint: REMOTE_HUD_COPY.listeningHint };
    case "processing":
      return { title: REMOTE_HUD_COPY.processing, hint: REMOTE_HUD_COPY.processingHint };
    case "delivered":
      return { title: REMOTE_HUD_COPY.delivered };
    case "copied":
      return { title: micReasonText("copied", reason) };
    case "failed":
      if (reason === "ack_timeout") {
        return { title: REMOTE_HUD_COPY.ackTimeout, hint: REMOTE_HUD_COPY.ackTimeoutHint };
      }
      if (reason === "disconnected") {
        return { title: REMOTE_HUD_COPY.disconnected, hint: REMOTE_HUD_COPY.noPhoneHint };
      }
      return { title: micReasonText("failed", reason), hint: REMOTE_HUD_COPY.hintFallback };
    case "cancelled":
      return { title: REMOTE_HUD_COPY.cancelled, hint: REMOTE_HUD_COPY.cancelledHint };
    default:
      return { title: REMOTE_HUD_COPY.noPhone, hint: REMOTE_HUD_COPY.noPhoneHint };
  }
}
