---
doc: engineering/asr-model
title: 本机语音模型管理
status: active
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 本机语音模型管理

> 回答“模型从哪来、放哪、怎么选、怎么保证不落盘”。产品规则见 [mic PRD](../prd/mic/PRD.md)；链路见 [audio-pipeline.md](./audio-pipeline.md)；云端引擎见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)。

## 1. 结论

- ASR 使用 **whisper-rs 0.16 + whisper.cpp（Metal）**，在桌面进程内转写。
- 模型文件保存在电脑；手机不下载、不持有模型。
- 音频只在内存和局域网中，转写结束立即释放；不再生成临时 WAV。
- 模型可以用桌面「设置 → 语音识别 → 本机」下载、取消、删除、切换。
- 云端百炼是另一种引擎：不需要下载模型，也不在手机或桌面存模型文件；默认仍用本机。

## 2. 模型与体积

| id | 文件 | 约体积 | 说明 |
| --- | --- | --- | --- |
| `tiny` | `ggml-tiny.bin` | 74 MB | 最快，准确率最低 |
| `base` | `ggml-base.bin` | 141 MB | 平衡，默认推荐起点 |
| `small` | `ggml-small.bin` | 465 MB | 更准，中英混说与术语更好 |
| `medium` | `ggml-medium.bin` | 1.4 GB | 最准，占用与内存更高 |

- 现有 spike 的 `ggml-base.bin` 会直接被识别，无需重新下载。
- 许可证：whisper.cpp / whisper-rs 为 MIT/Unlicense 兼容；模型权重按 whisper.cpp 仓库的 MIT 条款使用，分发前复核。
- 模型不入 APK、不入 Git；只存在桌面数据目录。

## 3. 目录与选择

```text
~/Library/Application Support/Sidekick/
├─ models/
│  ├─ ggml-base.bin
│  ├─ ggml-small.bin.part   # 下载中的临时文件，失败/取消自动清理
│  └─ selected.json         # {"id":"base"}
└─ clipboard.json           # 剪贴板历史，见 clipboard-manager.md
```

- 可用 `SIDEKICK_MODEL_DIR` 覆盖模型目录（测试/排障）。
- 选择顺序：`selected.json` 有效项 → 已存在的 `base` → `small` → `tiny` → `medium`。
- 删除当前模型后自动选择下一个已下载模型；没有则回到“无模型”状态。

## 4. 下载

- 优先 `https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-<id>.bin`，失败回退 `huggingface.co`。
- 先写 `*.part`，校验 HTTP 状态与 `Content-Length` 后原子 rename；取消/失败删除临时文件。
- 每约 200ms 或 1MB 发 `model-progress`：`{ modelId, received, total, state, message? }`；`state` 为 `downloading | done | error | cancelled`。
- 同一时间只允许一个下载；下载中不阻塞录音，但无模型时录音会明确提示“去电脑设置下载”。
- 设置页重新打开时通过 `asr_status()` 恢复进度；关闭设置不影响后台下载。

## 5. 内存转写

- `WhisperContext` 常驻缓存；启动时后台 prewarm 当前模型，避免首句等待模型加载。
- 转写：PCM16 → f32（16k）→ `WhisperState::full` → 取 segment 文本。
- 参数：`language=zh`、简体中文 prompt、贪心解码、关闭打印、4 线程、Metal GPU。
- 文本处理：换行/回车替换为空格，压缩空白，最多 2000 字并标记 `truncated`；空文本视为失败。
- 单次转写 10 秒超时；超时后置取消标记，禁止后续粘贴。
- 日志只记录耗时、字数、结果类型；不记录全文、音频或目标应用名。

## 6. 设置页

桌面「设置 → 语音识别 → 本机」显示：

- 当前模型与存储目录；
- 四个模型的状态、体积、下载/取消/删除/使用；
- 下载进度条；
- 目录复制与 Finder 入口。

没有模型时，连接面板与语音结果会提示先下载；模型下载完成后可直接切换。云端引擎的地址/Key/模型/热词/测试连接在同页「百炼云端」标签，见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)。

## 7. 验收

- 设置页能识别现有 base 模型，并显示真实大小；
- tiny 下载可看到进度、可取消、完成后可切换/删除；
- 断开网络时下载给出人话错误，不留下 `.part`；
- 选中模型后 prewarm，首句转写 p95 ≤3s（10 秒语音）；
- 检查 `models/` 无音频文件；检查日志无转写全文。

## 8. P1 / 已知限制

- 云端引擎不下载模型；切换云端不要求本机有模型，但云端失败时只有本机有模型才会回退。
- 不做模型哈希校验（只校验长度）；后续可读取 Hugging Face ETag 做 SHA256。
- 不做多语言 UI 选择；当前中文优先，英文混说依赖模型。
- 不做“删除时保留缓存”，切换模型会重新加载。
- 大模型（medium）在 8GB 内存机器上卡顿时，应提示用户换 small/base。
