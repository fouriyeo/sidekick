---
doc: engineering/mic-selection
title: 手机麦克风选择（spike）
status: spike
updated: 2026-11-15
load: on-demand
owner: engineering
---

# 手机麦克风选择（spike）

> 回答：Android 能不能列出「顶部/底部」麦克风、能不能指定一只录；2026-11-14 在 RMX3370 上验到了什么、本轮代码怎么落。
> 不包含：最终设置页信息架构、ASR 链路替换、备忘录录音改造；按住说话仍走 [audio-pipeline.md](./audio-pipeline.md) 的 WebView 链路。

## 1. 结论

- RMX3370（Realme GT Neo 2，Android 13）是双麦；Android 只暴露 2 个 `TYPE_BUILTIN_MIC`：
  - `address=bottom`：底部主麦；
  - `address=back`：系统叫「背部/摄像头麦」，按 `CAMCORDER → back` 推断就是顶部那颗。
- 没有第三颗可选麦；`getDevices(GET_DEVICES_INPUTS)` 里另外几个是 FM / Telephony / Remote submix，不是麦克风。
- 原生 `AudioRecord` + `setPreferredDevice` 可精确命中；WebView `getUserMedia` 不能可靠选麦。
- 默认策略：**自动（不指定设备）**，走现有 WebView/系统链路；只有用户显式选顶部/底部才走原生单麦。默认链路是否多麦融合由系统/HAL 决定，不承诺固定「两麦合成」。
- 本轮只在设置页做「自动/顶部/底部试听 3 秒 + 播放 A/B + 记录偏好」，**不接 ASR、不改按住说话**。

## 2. 探针矩阵

2026-11-14 用临时探针 APK（已卸载）在 RMX3370 上实测：

| 采集方式 | 实际路由 |
| --- | --- |
| WebView 默认（AEC 开，= 现在按住说话） | `back` + `VOICE_COMMUNICATION` |
| WebView 选 deviceId `Headset earpiece` | `bottom` |
| WebView 关 AEC（CAMCORDER） | `back` |
| 原生 MIC / VOICE_RECOGNITION / UNPROCESSED（不指定设备） | `bottom` |
| 原生 CAMCORDER | `back` |
| 原生 `setPreferredDevice(back)` + 任意源 | `back`，确定命中 |
| 原生 `setPreferredDevice(bottom)` + 任意源 | `bottom`，确定命中 |
| 原生 `CHANNEL_IN_STEREO` | 2ch，第二路语义未公开，不依赖 |

补充：原生 `VOICE_COMMUNICATION` 两次跑分别落到 `back` / `bottom`，说明只靠 `AudioSource` 不稳定；选麦必须显式 `setPreferredDevice`。

## 3. 本轮实现

- Android 采集：`app/src-tauri/mobile/android/MicProbePlugin.kt`
  - `listInputs`：枚举 `TYPE_BUILTIN_MIC`，返回 `id/address/productName/channelCounts/sampleRates`；
  - `record`：`UNPROCESSED → VOICE_RECOGNITION → MIC` 回退，`build → setPreferredDevice → startRecording`，16k/单声道/PCM16，后台线程读满 1–5 秒后 base64 返回；
  - 权限拒绝、无法初始化、读不到数据都返回中文原因，不静默降级。
- Rust 桥：`app/src-tauri/src/mic_probe.rs`
  - 插件 setup 只注册 Android 插件并保存 `PluginHandle`；
  - 两个**应用命令** `mic_probe_devices` / `mic_probe_record`，不走 `plugin:` 命名空间，因此不用改 capability/ACL；
  - 音频只在内存里转 base64 给 WebView，不落盘、不经过局域网。
- 前端：`app/src/mobile/features/mic/mic-probe.ts` + `app/src/mobile/features/settings/mic-probe-card.tsx`
  - 顶部优先排序，地址映射中文；
  - 试录前先 `primeMicrophone()` 触发现有 WebView 授权链；
  - 显示实际路由 / 采集源 / RMS 电平；`routedAddress` 与所选不一致时明确提示；
  - 「自动（默认）」试听走 `recordDefaultClip`（复用 `startVoiceRecording` 的 `getUserMedia`，与按住说话同一条系统链路）；顶部/底部试听才走原生；
  - 「用这个」只写 `sidekick:mic-probe:preferred:v2` 偏好，默认 `auto`，接入按住说话前不生效。
- 构建：`scripts/patch-android-manifest.mjs` 在 build 前把 Kotlin 源从 `app/src-tauri/mobile/android/` 拷进 `gen/`（`gen/` 不入库）。

## 4. 怎么验

```bash
scripts/build-android.sh
scripts/install-android.sh
adb logcat -s MicProbe
```

真机：设置 → 麦克风选择（实验）→ 自动/顶部/底部各试听一次 → 自动显示「系统默认（未单独指定）」，顶部/底部分别显示 `back` / `bottom`；`logcat` 中 `record ... routed=back|bottom` 可复核原生两项。

2026-11-14/15 真机结果：顶部试录 → `routed=back`（约 3.1s），底部试录 → `routed=bottom`（约 3.1s）；自动试听 → 系统默认 3.0s；「用这个」在自动/顶部之间切换并持久化，杀进程重开仍选中；logcat 原生记录与 UI 一致。

## 5. 边界与风险

- 默认「自动」不碰设备选择，保留系统处理链；只有显式选顶部/底部才进原生单麦。原生路径尚未接入 ASR。
- `UNPROCESSED` 可能偏小/偏干；本轮不做 AGC，听感对比是目的。
- 地址映射目前按 RMX3370 的 `bottom/back`；其他机型地址不同则回退「麦克风 N」，不假装是顶部/底部。
- 3 秒固定时长、页面卸载不取消录音；spike 可接受，正式接入要改成可停止的流式会话。
- 若试听发现 `back` 实际是底部，只改 `micDeviceLabel`，采集代码不动。

## 6. 下一步

1. 用真机 A/B 确认 `back` 的物理位置与听感；默认保持「自动」。
2. 若采纳：只给显式选顶部/底部的用户接原生采集（`mic_frame` 流式会话），自动用户继续走 `voice-recorder.ts` 的 `getUserMedia`；需要流式回调、停止/取消、与现有会话串行化对齐。
3. 原生失败不静默换麦：明确报错并给「改回自动」入口；默认链路参数（AEC/NS/AGC）不动，避免改变 ASR 准确率。
