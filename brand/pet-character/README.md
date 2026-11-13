# 宠物角色形象（已退役）

> 2026-11-14（D136）：手机宠物已换成 **BoopFace** 原生 Web Component + 皮肤 201，本目录只保留历史记录。
> 现行方案见 [engineering/pet-runtime.md](../../docs/engineering/pet-runtime.md) 与 [decisions.md](../../docs/decisions.md) D136。

早期三轮角色探索（A 麻薯猫猫 / B 豆豆泥人 / C 口袋小怪兽），以及 A 路线的参数化 OpenPets 图集（`generate.py` + 四态 GIF），已于 2026-11-06 清理，不入库（D71 / [git.md](../../docs/standards/git.md)：设计过程素材默认不入库）。

2026-11-02 到 2026-11-14 期间，宠物是 DeepSeek 鲸鱼 OpenPets schema 2 图集（`assets/openpet/`，746KB WebP），因为原始 zip 没有 LICENSE（D127 例外资产），2026-11-14 按 D136 整体替换为 BoopFace。拆包检查与当时的接入记录留在 [openpet-review](./openpet-review/README.md)，仅作历史证据。

授权边界：BoopFace 代码 MIT、角色形象不随 MIT 转让；本项目只把它作为 App 内形象使用，不宣称原创，见 [NOTICE.md](../../NOTICE.md)。
