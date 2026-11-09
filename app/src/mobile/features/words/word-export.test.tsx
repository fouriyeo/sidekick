import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordExportMarkdown: vi.fn(),
  wordSetNote: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordSyncNow: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  ...api,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { WordExport } from "./word-export";

const MARKDOWN = "# 生词本\n\n## throughput\n\n- 吞吐量；处理量\n";

beforeEach(() => {
  vi.clearAllMocks();
  clearBackHandlers();
  api.wordExportMarkdown.mockResolvedValue(MARKDOWN);
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("导出 Markdown 页", () => {
  it("显示只读全文，复制调用 navigator.clipboard.writeText", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<WordExport onBack={() => undefined} />);

    const markdown = await screen.findByRole("region", { name: "导出的 Markdown" });
    expect(markdown).toHaveTextContent("吞吐量；处理量");
    fireEvent.click(screen.getByRole("button", { name: "复制 Markdown" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MARKDOWN));
  });

  it("剪贴板不可用时提示长按复制，不显示死按钮", async () => {
    render(<WordExport onBack={() => undefined} />);

    await screen.findByRole("region", { name: "导出的 Markdown" });
    fireEvent.click(screen.getByRole("button", { name: "复制 Markdown" }));

    expect(await screen.findByText(/长按选择复制/)).toBeInTheDocument();
  });

  it("写剪贴板失败时也回退到长按复制提示", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });

    render(<WordExport onBack={() => undefined} />);
    await screen.findByRole("region", { name: "导出的 Markdown" });
    fireEvent.click(screen.getByRole("button", { name: "复制 Markdown" }));

    expect(await screen.findByText(/复制失败，长按选择复制/)).toBeInTheDocument();
  });

  it("生成失败显示中文错误并可重试", async () => {
    api.wordExportMarkdown.mockRejectedValueOnce(new Error("timeout"));
    render(<WordExport onBack={() => undefined} />);

    expect(await screen.findByText(/等太久没有回应/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("region", { name: "导出的 Markdown" })).toBeInTheDocument();
    expect(api.wordExportMarkdown).toHaveBeenCalledTimes(2);
  });

  it("返回键回列表", async () => {
    const onBack = vi.fn();
    render(<WordExport onBack={onBack} />);
    await screen.findByRole("region", { name: "导出的 Markdown" });

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
