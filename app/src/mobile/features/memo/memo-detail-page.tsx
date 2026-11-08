import { convertFileSrc } from "@tauri-apps/api/core";
import { cn } from "cn";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatBytes, formatClock, formatDuration } from "@/mobile/features/memo/format";
import { useMemoStore } from "@/mobile/features/memo/memo-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { type MemoType, memoStatusLabel, memoTypeLabel } from "@/protocol/memo";
import { normalizeError } from "@/shared/lib/tauri";

const CARD = "rounded-2xl border-[0.5px] border-border bg-card px-4 py-4";
const TYPES: ReadonlyArray<{ value: MemoType; label: string }> = [
  { value: "memo", label: "备忘" },
  { value: "todo", label: "待办" },
  { value: "idea", label: "灵感" },
];

/**
 * 备忘录详情：标题/类型可改，其余只读；播放走 Tauri asset 协议。
 * 删除是墓碑，桌面镜像同步删除；音频可单独清理。
 */
export function MemoDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const detail = useMemoStore((state) => state.detail);
  const loading = useMemoStore((state) => state.detailLoading);
  const loadDetail = useMemoStore((state) => state.loadDetail);
  const clearDetail = useMemoStore((state) => state.clearDetail);
  const updateMeta = useMemoStore((state) => state.updateMeta);
  const remove = useMemoStore((state) => state.remove);
  const removeAudio = useMemoStore((state) => state.removeAudio);
  const retry = useMemoStore((state) => state.retry);

  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmAudio, setConfirmAudio] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadDetail(id);
    return () => clearDetail();
  }, [clearDetail, id, loadDetail]);

  useEffect(
    () =>
      pushBackHandler(() => {
        onBack();
        return true;
      }),
    [onBack],
  );

  const current = detail?.id === id ? detail : null;

  useEffect(() => {
    if (current) setTitle(current.title);
  }, [current?.id, current?.title, current]);

  const commitTitle = async () => {
    if (!current) return;
    const next = title.trim();
    if (!next || next === current.title) {
      setTitle(current.title);
      return;
    }
    try {
      await updateMeta(id, { title: next });
    } catch (error) {
      setTitle(current.title);
      toast.error(normalizeError(error));
    }
  };

  const changeType = async (memoType: MemoType) => {
    if (!current || current.memoType === memoType) return;
    try {
      await updateMeta(id, { memoType });
    } catch (error) {
      toast.error(normalizeError(error));
    }
  };

  const audioSrc = current?.audioPath ? convertFileSrc(current.audioPath) : null;

  return (
    <MobilePage aria-label="备忘录详情">
      <PageHeader title="备忘详情" onBack={onBack} backLabel="返回备忘录" />
      <PageScroll className="px-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        {!current && (
          <div className="mt-16 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            正在读取…
          </div>
        )}

        {current && (
          <>
            <p className="m-0 mt-2 px-1 text-[12px] leading-[17px] text-muted-foreground">
              {memoTypeLabel(current.memoType)} · {formatClock(current.createdAt)} ·{" "}
              {formatDuration(current.durationMs)}
              {current.status !== "done" && ` · ${memoStatusLabel(current.status)}`}
            </p>

            <input
              ref={inputRef}
              aria-label="标题"
              className="mt-2 w-full border-0 bg-transparent px-1 text-[22px] leading-[28px] font-semibold text-foreground outline-none placeholder:text-muted-foreground"
              value={title}
              placeholder="未命名备忘"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  inputRef.current?.blur();
                }
              }}
            />

            <div className="mt-3 flex gap-2">
              {TYPES.map((option) => {
                const active = current.memoType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "min-h-9 rounded-full px-4 text-[13px] leading-[18px] transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                    onClick={() => void changeType(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {current.status === "failed" && (
              <div className="mt-4 rounded-2xl border-[0.5px] border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="m-0 text-[13px] leading-[19px] text-foreground">
                  {current.lastError ?? "整理失败了，可以重试。"}
                </p>
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-destructive"
                  onClick={() => {
                    void retry(id)
                      .then(() => toast.success("已重新排队"))
                      .catch((error: unknown) => toast.error(normalizeError(error)));
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  重试
                </button>
              </div>
            )}

            {current.status === "offline" && (
              <div className="mt-4 rounded-2xl border-[0.5px] border-decide/40 bg-decide/10 px-4 py-3">
                <p className="m-0 text-[13px] leading-[19px] text-foreground">
                  {current.lastError ?? "等待网络，联网后会自动继续。"}
                </p>
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-decide"
                  onClick={() => {
                    void retry(id).catch((error: unknown) => toast.error(normalizeError(error)));
                  }}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  立即重试
                </button>
              </div>
            )}

            {current.summary && (
              <section aria-label="摘要" className={cn(CARD, "mt-5")}>
                <p className="m-0 text-[14px] leading-[22px] text-foreground">{current.summary}</p>
              </section>
            )}

            {current.todos.length > 0 && (
              <section aria-label="待办" className="mt-3">
                <h2 className="mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
                  待办
                </h2>
                <div className={CARD}>
                  {current.todos.map((todo, index) => (
                    <div key={todo}>
                      {index > 0 && <div aria-hidden="true" className="ml-9 h-[0.5px] bg-border" />}
                      <div className="flex min-h-11 items-center gap-3 py-1.5">
                        <span
                          aria-hidden="true"
                          className="size-[18px] shrink-0 rounded-full border-[1.5px] border-muted-foreground/50"
                        />
                        <span className="min-w-0 flex-1 text-[14px] leading-[21px] text-foreground">
                          {todo}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-label="全文" className="mt-5">
              <h2 className="mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
                全文
              </h2>
              <div className={CARD}>
                {current.transcript ? (
                  <p className="m-0 whitespace-pre-wrap text-[14px] leading-[23px] text-foreground">
                    {current.transcript}
                  </p>
                ) : (
                  <p className="m-0 text-[13px] leading-[19px] text-muted-foreground">
                    {current.status === "done" ? "没有识别到文字。" : "整理完成后这里会出现全文。"}
                  </p>
                )}
              </div>
            </section>

            {audioSrc && (
              <section aria-label="录音" className="mt-5">
                <h2 className="mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
                  录音 · {formatBytes(current.audioBytes)}
                </h2>
                {/* biome-ignore lint/a11y/useMediaCaption: 用户自己的录音，没有字幕轨。 */}
                <audio controls preload="metadata" src={audioSrc} className="w-full" />
              </section>
            )}

            <section aria-label="操作" className={cn(CARD, "mt-6 flex flex-col gap-1 p-1")}>
              {current.hasAudio && (
                <button
                  type="button"
                  className="flex min-h-12 items-center justify-between rounded-xl px-3 text-[14px] text-foreground active:bg-wash"
                  onClick={() => {
                    if (!confirmAudio) {
                      setConfirmAudio(true);
                      return;
                    }
                    setConfirmAudio(false);
                    void removeAudio(id)
                      .then(() => toast.success("已删除录音"))
                      .catch((error: unknown) => toast.error(normalizeError(error)));
                  }}
                >
                  <span>{confirmAudio ? "再点一次删除录音" : "删除录音"}</span>
                  <span className="text-[12px] text-muted-foreground">保留文字</span>
                </button>
              )}
              <button
                type="button"
                className="flex min-h-12 items-center justify-between rounded-xl px-3 text-[14px] text-destructive active:bg-wash"
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  setConfirmDelete(false);
                  void remove(id)
                    .then(() => {
                      toast.success("已删除");
                      onBack();
                    })
                    .catch((error: unknown) => toast.error(normalizeError(error)));
                }}
              >
                <span>{confirmDelete ? "再点一次删除这条备忘" : "删除这条备忘"}</span>
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </section>

            {loading && (
              <p className="mt-3 text-center text-[12px] text-muted-foreground">正在刷新…</p>
            )}
          </>
        )}
      </PageScroll>
    </MobilePage>
  );
}
