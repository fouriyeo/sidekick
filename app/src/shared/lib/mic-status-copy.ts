export const MIC_STATUS_COPY = {
  inserted: "已输入",
  copied: "已复制到电脑",
  timeout: "电脑端没回应，再说一次？",
  busy: "电脑端正在处理上一段语音。",
  sessionError: "语音会话出了点问题，再试一次。",
  insertFailed: "电脑端没能输入，再试一次？",
  empty: "没听清，靠近一点再说一次。",
  checkSettings: "检查一下连接和麦克风权限。",
  copiedAccessibility: "已复制；在电脑设置里开启辅助功能可自动输入。",
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
} as const;

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
