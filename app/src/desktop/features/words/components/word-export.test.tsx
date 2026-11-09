import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordSetNote: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordExportMarkdown: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { WordExportButton } from "./word-export";

const MARKDOWN = "# 英语角词库（1 个词）\n\n## resilient\n- 有韧性的\n";

const writeText = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  tauri.wordExportMarkdown.mockResolvedValue(MARKDOWN);
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => cleanup());

describe("WordExportButton 导出", () => {
  it("打开弹层显示只读 Markdown，复制成功提示已复制", async () => {
    render(<WordExportButton disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "导出" }));

    const dialog = await screen.findByRole("dialog");
    const textarea = await within(dialog).findByLabelText("Markdown 内容");
    expect(textarea).toHaveValue(MARKDOWN);
    expect(textarea).toHaveAttribute("readonly");

    fireEvent.click(within(dialog).getByRole("button", { name: "复制" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MARKDOWN));
    expect(await within(dialog).findByText("已复制")).toBeInTheDocument();
  });

  it("复制失败提示手动选择复制", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<WordExportButton disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText("Markdown 内容");
    fireEvent.click(within(dialog).getByRole("button", { name: "复制" }));

    expect(await within(dialog).findByText("请手动选择复制")).toBeInTheDocument();
  });

  it("空词库时按钮禁用", () => {
    render(<WordExportButton disabled />);
    expect(screen.getByRole("button", { name: "导出" })).toBeDisabled();
  });

  it("导出失败按错误码提示", async () => {
    tauri.wordExportMarkdown.mockRejectedValue(new Error("timeout"));
    render(<WordExportButton disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("请求超时");
    expect(within(dialog).getByRole("button", { name: "复制" })).toBeDisabled();
  });
});
