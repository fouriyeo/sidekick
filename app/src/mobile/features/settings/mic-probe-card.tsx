import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clipSummary,
  decodePcm16Base64,
  levelFromRms,
  MIC_PROBE_AUTO,
  type MicProbeLabClip,
  micDeviceLabel,
  micDeviceSubtitle,
  playPcm16,
  readPreferredMic,
  sortMicDevices,
  writePreferredMic,
} from "@/mobile/features/mic/mic-probe";
import { recordDefaultClip } from "@/mobile/features/mic/mic-probe-default";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { primeMicrophone } from "@/mobile/features/mic/voice-recorder";
import { type MicProbeDevice, micProbeDevices, micProbeRecord } from "@/shared/lib/tauri";

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

function loadErrorText(error: unknown): string {
  const message = errorText(error);
  if (message.includes("不支持")) return "仅 Android 实验版可用；桌面端忽略此项。";
  return message;
}

const BUTTON_CLASS =
  "min-h-9 rounded-full border-[0.5px] border-border bg-card px-3 text-[13px] leading-[18px] text-foreground transition-colors disabled:opacity-40";

/** 设置页的实验卡片：自动（系统默认）与顶部/底部原生单麦各录 3 秒试听。 */
export function MicProbeCard() {
  const phase = useMicStore((state) => state.phase);
  const micBusy = phase === "arming" || phase === "listening" || phase === "processing";

  const [devices, setDevices] = useState<MicProbeDevice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [playingAddress, setPlayingAddress] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, MicProbeLabClip>>({});
  const [preferred, setPreferred] = useState(MIC_PROBE_AUTO);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setPreferred(readPreferredMic());
    let cancelled = false;
    void micProbeDevices()
      .then((list) => {
        if (!cancelled) setDevices(sortMicDevices(list));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(loadErrorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRecordDefault = useCallback(async () => {
    if (busyAddress !== null || micBusy) return;
    setBusyAddress(MIC_PROBE_AUTO);
    setNotice(null);
    try {
      const clip = await recordDefaultClip(3);
      setClips((previous) => ({ ...previous, [MIC_PROBE_AUTO]: clip }));
    } catch (error) {
      const message = errorText(error);
      setNotice(message);
      toast.error(message);
    } finally {
      setBusyAddress(null);
    }
  }, [busyAddress, micBusy]);

  const onRecord = useCallback(
    async (device: MicProbeDevice) => {
      if (busyAddress !== null || micBusy) return;
      setBusyAddress(device.address);
      setNotice(null);
      try {
        // 复用现有 WebView 授权链：首次使用会弹系统麦克风权限，随后立即释放。
        try {
          await primeMicrophone();
        } catch {
          throw new Error("需要麦克风权限：请先在宠物页按一次麦克风授权");
        }
        const clip = await micProbeRecord(device.id, 3);
        setClips((previous) => ({ ...previous, [device.address]: clip }));
        if (clip.routedAddress && clip.routedAddress !== device.address) {
          setNotice(
            `系统实际路由到 ${micDeviceLabel(clip.routedAddress)}（${clip.routedAddress}），不是本行标的 ${device.address}；本次结果仍可试听。`,
          );
        } else if (!clip.preferredApplied) {
          setNotice("没能锁定这只麦，系统按默认设备录的；本次结果仅供试听。");
        }
      } catch (error) {
        const message = errorText(error);
        setNotice(message);
        toast.error(message);
      } finally {
        setBusyAddress(null);
      }
    },
    [busyAddress, micBusy],
  );

  const onPlay = useCallback(
    async (key: string, clip: MicProbeLabClip) => {
      if (playingAddress !== null) return;
      setPlayingAddress(key);
      try {
        await playPcm16(decodePcm16Base64(clip.pcmBase64), clip.sampleRate);
      } catch (error) {
        toast.error(errorText(error));
      } finally {
        setPlayingAddress(null);
      }
    },
    [playingAddress],
  );

  const onSelect = useCallback((address: string) => {
    writePreferredMic(address);
    setPreferred(address);
    setNotice(
      address === MIC_PROBE_AUTO
        ? "已记录偏好：自动（默认）；按住说话仍走系统链路。"
        : `已记录偏好：${micDeviceLabel(address)}；接入「按住说话」后生效。`,
    );
  }, []);

  const autoClip = clips[MIC_PROBE_AUTO];
  const autoSelected = preferred === MIC_PROBE_AUTO;

  return (
    <section
      aria-label="麦克风选择（实验）"
      className="overflow-hidden rounded-2xl border-[0.5px] border-border bg-card"
    >
      <div className="px-4 pt-4 pb-3">
        <p className="m-0 text-[15px] leading-[21px] text-foreground">麦克风选择（实验）</p>
        <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
          默认走系统链路；只有手动选顶部/底部才走原生单麦。
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[15px] leading-[21px] text-foreground">
              {micDeviceLabel(MIC_PROBE_AUTO)}
            </p>
            <p className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">
              {micDeviceSubtitle(MIC_PROBE_AUTO)} · auto
            </p>
          </div>
          {autoSelected && (
            <span className="shrink-0 rounded-full border-[0.5px] border-primary px-2 py-0.5 text-[11px] leading-[16px] text-primary">
              已选
            </span>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={busyAddress !== null || micBusy}
            aria-label="试听默认 3 秒"
            onClick={() => void onRecordDefault()}
          >
            {busyAddress === MIC_PROBE_AUTO ? "录音中…" : "试听默认 3 秒"}
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={!autoClip || playingAddress !== null}
            aria-label="播放 自动（默认） 的试听"
            onClick={() => {
              if (autoClip) void onPlay(MIC_PROBE_AUTO, autoClip);
            }}
          >
            {playingAddress === MIC_PROBE_AUTO ? "播放中…" : "播放"}
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={autoSelected}
            aria-label="使用 自动（默认）"
            onClick={() => onSelect(MIC_PROBE_AUTO)}
          >
            {autoSelected ? "已选" : "用这个"}
          </button>
        </div>

        {autoClip && (
          <div className="mt-2.5">
            <p className="m-0 text-[12px] leading-[17px] text-muted-foreground">
              {clipSummary(autoClip)}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(levelFromRms(autoClip.rms) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div aria-hidden="true" className="ml-4 h-[0.5px] bg-border" />

      {loadError ? (
        <p className="px-4 py-3 text-[13px] leading-[19px] text-muted-foreground">{loadError}</p>
      ) : devices === null ? (
        <p className="px-4 py-3 text-[13px] leading-[19px] text-muted-foreground">
          正在读取麦克风…
        </p>
      ) : devices.length === 0 ? (
        <p className="px-4 py-3 text-[13px] leading-[19px] text-muted-foreground">
          没有找到内置麦克风。
        </p>
      ) : (
        devices.map((device, index) => {
          const clip = clips[device.address];
          const selected = preferred === device.address;
          const recordingThis = busyAddress === device.address;
          return (
            <Fragment key={device.id}>
              {index > 0 && <div aria-hidden="true" className="ml-4 h-[0.5px] bg-border" />}
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[15px] leading-[21px] text-foreground">
                      {micDeviceLabel(device.address)}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">
                      {micDeviceSubtitle(device.address)} · {device.address || "unknown"}
                    </p>
                  </div>
                  {selected && (
                    <span className="shrink-0 rounded-full border-[0.5px] border-primary px-2 py-0.5 text-[11px] leading-[16px] text-primary">
                      已选
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    disabled={busyAddress !== null || micBusy}
                    aria-label={`试录 ${micDeviceLabel(device.address)} 3 秒`}
                    onClick={() => void onRecord(device)}
                  >
                    {recordingThis ? "录音中…" : "试录 3 秒"}
                  </button>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    disabled={!clip || playingAddress !== null}
                    aria-label={`播放 ${micDeviceLabel(device.address)} 的试录`}
                    onClick={() => {
                      if (clip) void onPlay(device.address, clip);
                    }}
                  >
                    {playingAddress === device.address ? "播放中…" : "播放"}
                  </button>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    disabled={selected}
                    aria-label={`使用 ${micDeviceLabel(device.address)}`}
                    onClick={() => onSelect(device.address)}
                  >
                    {selected ? "已选" : "用这个"}
                  </button>
                </div>

                {clip && (
                  <div className="mt-2.5">
                    <p className="m-0 text-[12px] leading-[17px] text-muted-foreground">
                      {clipSummary(clip)}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(levelFromRms(clip.rms) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Fragment>
          );
        })
      )}

      {notice && (
        <p className="px-4 pb-3 text-[12px] leading-[17px] text-amber-600 dark:text-amber-400">
          {notice}
        </p>
      )}

      <p className="px-4 pb-4 text-[12px] leading-[17px] text-muted-foreground">
        自动保留系统的多麦/降噪处理；顶部/底部才走原生单麦。音频只在内存里试听，不保存、不上传。
      </p>
    </section>
  );
}
