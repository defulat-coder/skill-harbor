# 技能港开发约定

## 产品不变量

默认入口是针对当前中央技能目录的中文问答首页（`/`）；全局技能库在 `/library` 独立浏览维护。首页流程与设计依据见 `docs/design/SEARCH-HOME.md`。首页另有"对话提问"副入口跳转 `/chat`，用本机 agent CLI 流式对话，设计见 `docs/design/CHAT.md`。产品主线为全局统一维护 → 提问查找或直接阅读中文用法/原文 → 通过软链接加入项目。首页不搜索 Git 仓库、项目源码或市场。项目只管理引用。不得把普通添加默认改成复制，不得因界面改造重置用户配置或技能数据。

## 设计规约（所有前端修改必读）

先读 `docs/design/SOURCE-DISCOVERY.md` 了解原规则的实际来源，再读 `docs/design/README.md` 和 `DESIGN.md`。前端目录的具体规则见 `src/AGENTS.md`；原文摘录见 `docs/design/OPEN-DESIGN-RULES.md`。OpenDesign 的完整设计来源保存在 `docs/design/upstream/`，源路径及哈希见 manifest.json。按相关维度阅读 craft 和组件实现；不能仅凭截图或单个效果临时设计。

视觉和交互修改应先落到共享 token/组件，再由各页面使用。所有页面沿用公共布局和鼠标动效；不要复制页面级监听器、另立配色或随意改动公共间距。新增设计差异在设计规约中记录原因。

来源快照只用于参考，不要编辑它来伪造与源项目一致。来源快照所属原仓库的工程命令（含其 pnpm 脚本、Electron 和 daemon）不适用于本项目。

## 验证

前端运行 `pnpm run lint` 和 `pnpm run build`；实际检查受影响交互及共享组件的其他使用位置。打包用 `pnpm run workbench:build`。数据写入验收使用隔离开发目录，参见 WORKBENCH.md。记录实际覆盖和未覆盖项，不把源码存在等同于已验收。
