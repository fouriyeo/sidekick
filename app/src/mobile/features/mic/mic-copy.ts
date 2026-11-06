import { formatDuration } from "@/shared/lib/format";
import {
  keyActionErrorText,
  MIC_STATUS_COPY,
  micErrorText,
  micReasonText,
} from "@/shared/lib/mic-status-copy";

export { formatDuration, keyActionErrorText, micErrorText, micReasonText };

export const MIC_COPY = {
  ...MIC_STATUS_COPY,
  idle: "按住说话",
  idleDisconnected: "先连接电脑",
  arming: "准备中…",
  listening: "正在听",
  cloudConnecting: "云端连接中…",
  audioUploading: "音频上传中",
  engineCloud: "百炼",
  cancelHint: "上滑取消",
  releaseToCancel: "松手取消",
  cancelled: "已取消，没有发送。",
  tooShort: "按住说话。",
  disconnected: "连接断了，这段没有发送。",
  background: "已取消（App 进入后台）。",
  micLost: "麦克风被其他应用占用了。",
  permissionDenied: "需要麦克风权限才能说话。去系统设置打开。",
  permissionPrimerTitle: "用手机当麦克风",
  permissionPrimerLines: ["只在按住时录音", "松手就停", "音频不保存；识别时发送到阿里云百炼"],
  permissionPrimerContinue: "继续",
  permissionPrimerLater: "先不用",
  permissionReady: "准备好啦，按住说话",
  permissionGuideTitle: "需要麦克风权限",
  permissionGuideSteps: ["打开系统设置", "应用 → Sidekick → 权限", "把「麦克风」设为允许"],
  permissionGuideClose: "知道了",
  retry: "再说一次",
  copy: "复制",
  copiedAction: "已复制",
} as const;

export function micLocalErrorText(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (name === "NotAllowedError") return MIC_COPY.permissionDenied;
    if (name === "NotFoundError") return "没有找到麦克风。";
    if (name === "NotReadableError") return MIC_COPY.micLost;
  }
  return "麦克风启动失败，再试一次。";
}
