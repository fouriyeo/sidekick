/**
 * 复制文本：优先 Clipboard API，失败/不可用时回退到 textarea + execCommand。
 *
 * Android WebView 的安全上下文不保证有 `navigator.clipboard`，所以两端
 * （手机详情、桌面详情）都走这一个入口，避免各写一份。
 */
export async function copyText(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // 落到 execCommand 回退。
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("复制失败");
  } finally {
    area.remove();
  }
}
