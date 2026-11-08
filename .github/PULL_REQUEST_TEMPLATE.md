## 改了什么

<!-- 一到三句话；涉及界面请附截图（浅/深、桌面/手机） -->

## 为什么

<!-- 对应 issue / 决策号（D#）/ 文档章节 -->

## 怎么验证

- [ ] `cd app && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] `node scripts/check-docs.mjs && node scripts/check-boundaries.mjs`
- [ ] 改 Rust：`cd app/src-tauri && cargo test --lib`
- [ ] 改界面：`scripts/qa-desktop-ios.mjs` / `scripts/qa-memo.mjs`（附截图或说明）
- [ ] 真机：型号 + 验证的路径（没有真机就写「未验证」）

## 影响面

- [ ] 改动协议 → 已同步 `protocol/README.md` + Rust + 两端解析
- [ ] 改动产品规则 → 已更新对应 `docs/prd/**`
- [ ] 新增依赖 → 已过 `docs/dependency-policy.md` 并更新 NOTICE
- [ ] 涉及隐私/权限/数据外发 → 已在描述里说明
