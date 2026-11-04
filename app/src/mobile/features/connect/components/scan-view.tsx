import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { useConnectionStore } from "../connection-store";
import { type ScanError, type ScanSession, startScan } from "../scan-camera";
import { parseScanPayload } from "../scan-payload";

type ScanViewProps = {
  open: boolean;
  onClose: () => void;
};

const ERROR_HINTS: Record<ScanError, string> = {
  permission_denied: "需要相机权限才能扫码。可在系统设置里允许后重试，或手动输入电脑地址。",
  camera_unavailable: "相机打不开，可能被其他应用占用。请重试或手动输入地址。",
  decoder_unavailable: "扫码组件加载失败，请手动输入电脑地址。",
};

const MISMATCH_HINT = "这不是 Sidekick 的电脑二维码，请对准电脑窗口里的二维码。";

/** 全屏扫码页：后置相机取景，扫到电脑二维码后直接发起连接。 */
export function ScanView({ open, onClose }: ScanViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<ScanSession | null>(null);
  const handledRef = useRef(false);
  const [hint, setHint] = useState<string | null>(null);
  /** 相机类致命错误：不再自动重启，避免反复弹权限框。 */
  const [fatal, setFatal] = useState(false);

  const connect = useConnectionStore((state) => state.connect);

  const stopCamera = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const startCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    stopCamera();
    handledRef.current = false;
    setHint(null);

    void startScan({
      video,
      onResult: (text) => {
        if (handledRef.current) return;
        const addr = parseScanPayload(text);
        if (!addr) {
          setHint(MISMATCH_HINT);
          return;
        }
        handledRef.current = true;
        stopCamera();
        void connect(addr).then(() => onClose());
      },
      onError: (error) => {
        setFatal(true);
        setHint(ERROR_HINTS[error]);
      },
    }).then((session) => {
      // 启动期间页面可能已被关掉，此时直接释放，避免相机泄漏。
      if (!session) return;
      if (!open) {
        session.stop();
        return;
      }
      sessionRef.current = session;
    });
  }, [connect, onClose, open, stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    setFatal(false);
    startCamera();
    return stopCamera;
  }, [open, startCamera, stopCamera]);

  // 切后台时释放相机（隐私指示灯不该常亮），回前台且没出致命错误就自动重开。
  useEffect(() => {
    if (!open) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopCamera();
        return;
      }
      if (!fatal && !sessionRef.current) startCamera();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [open, fatal, startCamera, stopCamera]);

  if (!open) return null;

  return (
    <section
      className="fixed inset-0 z-[70] flex h-dvh flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="扫电脑上的二维码"
    >
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-2">
        <p className="text-base font-medium">扫电脑上的二维码</p>
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-3 text-sm text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          关闭
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
        />
        <div
          aria-hidden="true"
          className="relative h-[min(62vw,240px)] w-[min(62vw,240px)] rounded-[16px] border-2 border-white/80"
        />
      </div>

      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p className="text-center text-sm leading-relaxed text-white/85">
          {hint ?? "在电脑端打开「手机连接」，把手机对准二维码"}
        </p>
        {hint && !fatal ? (
          <p className="mt-2 text-center text-xs text-white/50">继续对准二维码即可</p>
        ) : null}
      </div>
    </section>
  );
}
