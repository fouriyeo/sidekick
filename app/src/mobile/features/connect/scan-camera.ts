/**
 * 手机扫码：开后置相机 + 循环解码二维码。
 *
 * 解码用 `jsqr`（纯 JS），不走 `BarcodeDetector`——后者在 Android 依赖 Google Play Services
 * 的 ML Kit，设备缺 GMS 时会静默失效。库按需动态加载，不进首屏包。
 *
 * 相机权限链：`getUserMedia({video})` → WebView 触发 `onPermissionRequest` →
 * Rust `on_permission_request` 返回 Allow → wry 自动 `activity.requestPermissions(CAMERA)`。
 */

export type ScanError = "permission_denied" | "camera_unavailable" | "decoder_unavailable";

export type ScanSession = {
  /** 停解码循环并释放相机。可重复调用。 */
  stop: () => void;
};

export type StartScanOptions = {
  video: HTMLVideoElement;
  onResult: (text: string) => void;
  onError: (error: ScanError) => void;
};

/** 解码用的最长边；相机原始分辨率通常 1080p 以上，降采样能显著降低单帧解码耗时。 */
const MAX_DECODE_EDGE = 640;
/** 每 N 帧解一次：30fps 相机按 3 帧一次约 10 次/秒，够快也不占满 CPU。 */
const DECODE_FRAME_STEP = 3;

function toScanError(error: unknown): ScanError {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission_denied";
  return "camera_unavailable";
}

/** 打开后置相机并开始解码；失败时返回 null（具体原因走 onError）。 */
export async function startScan({
  video,
  onResult,
  onError,
}: StartScanOptions): Promise<ScanSession | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    onError("camera_unavailable");
    return null;
  }

  let decoder: typeof import("jsqr").default;
  try {
    decoder = (await import("jsqr")).default;
  } catch {
    onError("decoder_unavailable");
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (error) {
    onError(toScanError(error));
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    for (const track of stream.getTracks()) track.stop();
    onError("camera_unavailable");
    return null;
  }

  let stopped = false;
  let frameId = 0;
  let frameCount = 0;

  const release = () => {
    if (stopped) return;
    stopped = true;
    if (frameId !== 0) cancelAnimationFrame(frameId);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const tick = () => {
    if (stopped) return;
    frameId = requestAnimationFrame(tick);
    if (video.readyState < video.HAVE_CURRENT_DATA) return;

    frameCount += 1;
    if (frameCount % DECODE_FRAME_STEP !== 0) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return;

    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = decoder(image.data, image.width, image.height, {
      inversionAttempts: "dontInvert",
    });
    if (found?.data) onResult(found.data);
  };

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    release();
    onError("camera_unavailable");
    return null;
  }

  frameId = requestAnimationFrame(tick);

  return { stop: release };
}
