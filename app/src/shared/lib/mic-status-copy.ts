export const MIC_STATUS_COPY = {
  inserted: "已输入",
  copied: "已复制到电脑",
  timeout: "电脑端没回应，再说一次？",
  noModel: "电脑端还没有语音模型，去电脑设置下载。",
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
    case "model_missing":
      return MIC_STATUS_COPY.noModel;
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
    default:
      return MIC_STATUS_COPY.empty;
  }
}
