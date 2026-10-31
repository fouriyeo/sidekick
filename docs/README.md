# Sidekick 文档索引（给人和 AI）

## 阅读顺序

1. `../AGENTS.md` — 最高优先级的上下文、约定与坑
2. `architecture.md` — 系统架构、组件、接口与限制（含当前实现）
3. `frontend-architecture.md` — 前端目标架构、目录、样式/组件/动画/性能规范
4. `status.md` — 当前进度、已验证内容、已知问题
5. `setup.md` — 环境、构建、无线调试、WebView 远程调试
6. `decisions.md` — 关键选型与取舍记录
7. `dependency-policy.md` — 开源依赖准入、许可证、体积预算、升级与审计
8. `ble-notes.md` — 蓝牙预研结论（当前非主线）

## 维护规则

- 改架构 / 协议 / 环境 / 前端规范时，同步更新本目录与 `protocol/README.md`；
- 新决策按日期追加到 `decisions.md`，不要改写历史结论；
- 易失信息（开发机 IP、临时脚本路径、进程 PID）可以示例形式出现，但不要当成固定事实写死；
- 面向 AI 写文档：命令可直接复制执行，接口用表格，坑点写清「现象 → 原因 → 处理」。
