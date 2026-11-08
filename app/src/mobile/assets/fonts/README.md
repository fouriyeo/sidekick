# 手机端随包字体

- 文件：`HarmonyOS_SansSC_Regular.ttf`（约 8.1 MB，未做任何改动）
- 来源：华为官方 HarmonyOS Sans v2 字体包 <https://developer.huawei.com/images/download/next/HarmonyOS-Sans-v2.zip>（解压后取 `HarmonyOS_SansSC/HarmonyOS_SansSC_Regular.ttf`）
- 许可：全文见同目录 [LICENSE_Fonts](./LICENSE_Fonts)（《HarmonyOS Sans Fonts License Agreement》，版权归 Huawei Device Co., Ltd.）
- 许可要点：允许免费商用、嵌入与随软件分发，条件：
  1. 在软件中注明使用了 HarmonyOS Sans 字体；
  2. 不得修改字体文件本身；
  3. 不得单独再分发或销售字体；
  4. 保留版权声明与本协议。
  协议原文见 <https://gitcode.com/openharmony/global_system_resources/blob/master/LICENSE_Fonts>
- 用途：手机端 UI 字体（Android OEM 的 OPPO Sans Regular 字形偏宽、笔画偏厚，16/400 会显笨重）。
- 注意：
  - **不要转 WOFF2、不要 subset**——许可禁止修改字体文件，这里直接引用原始 TTF；
  - 不要改成系统 `sans-serif` 的唯一来源，保留系统字体作为缺字回退；
  - 软件内注明位置：手机「设置 › 数据与关于 › 字体」一行。