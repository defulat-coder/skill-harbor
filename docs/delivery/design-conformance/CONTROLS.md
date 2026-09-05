# 控件重设计执行记录（composer + 输入框/选择器/按钮/图标全项目统一）

起因：用户目验打包后反馈——首页输入框有边框、没有桌面应用感。本次以本机 OpenDesign 源仓库（`/Users/xbjt/Documents/myself/open-design`）为直接参考重设计。

## 参考标准（读源结论）

- **首页 composer**（`apps/web/src/styles/home/home-hero.css:507-624`）：外层是**无边框中性灰托盘**（`background: var(--bg-subtle)`，radius 20px，padding 4px/8px），托盘内嵌**白色输入卡**（idle 无边框、radius 16px，与外托盘同心圆）；**聚焦时输入卡才出现描边**，且用最浅一级灰（`--border-soft`）。分组靠底色而非边框——这是「桌面感」的来源。
- **通用表单控件**（`apps/web/src/styles/primitives.css:154-211`）：`input/textarea/select` = 面板底（`--bg-panel`）+ 1px `--border` 细边框 + 小圆角；**聚焦 = 边框加深（`--selected`），无光圈**；native select 去原生外观、自绘 chevron（明暗双 SVG）。
- 项目 token 映射：`--bg-subtle → --ds-subtle`、`--bg-panel → --ds-panel`、`--border → --ds-border`、`--selected → --ds-accent`、`--border-soft → --ds-border-soft`。

## 第 1 步：共享契约 + 首页输入区（主 agent 亲自执行）

**changes**
- `src/views/SearchHome.tsx`：composer 内层包出 `.inputCard`（label + textarea + 操作行），目录行留在灰托盘底部（对应上游 workdir-row）。
- `src/views/SearchHome.module.css`：`.composer` 改无边框灰托盘（`--ds-subtle`、radius 20、padding 4/8、去阴影去边框）；新增 `.inputCard`（白卡、idle 透明边框、radius 16，`:focus-within` 描边 `--ds-border-soft`）；`.directory` 去白底去分隔线，改为托盘内裸文本行；textarea 聚焦不再内缩 outline。
- `src/design-system.css` 共享控件契约：
  - 表单控件聚焦改为「边框加深无光圈」（`:is(input,select,textarea):focus { border-color: var(--ds-accent); outline: none }`，checkbox/radio 除外）；2px 光圈只留给 button/a/summary。
  - `.app-input`、`.ds-filters select`、`.ds-link-form select` 底色 → `--ds-panel`（对齐上游 `--bg-panel`）。
  - `.ds-search:focus-within` 去掉重复的 2px outline（只留边框加深）。

**checks**：`npx tsc -b` 通过；ESLint 单文件通过；`npm run build` 通过。

## 第 2 步：全项目控件统一（并行 agent）

### 技能库与发现

**changes**
- `src/views/MySkills.tsx`：标签行内编辑输入框去掉 `outline-none focus:border-accent`（焦点边框加深交由共享规则）；空态「清除筛选」由裸 `app-button-secondary` 收敛为 `Button variant="secondary"`。
- `src/views/InstallSkills.tsx`：扫描重命名行内输入框删除 `focus:ring-1 focus:ring-accent outline-none`，idle 边框由 accent 改为中性 `border-border`（焦点 = 边框加深 accent，由共享规则承担）；市场搜索 / Git 仓库地址 / Git 预览技能名三处 `app-input` 去掉 `bg-background` 覆盖，回归契约底色 `--ds-panel`。
- `src/views/GlobalSkills.tsx`：搜索图标 17→16、技能卡 FileText 22→16（契约 14-16px）。
- `src/components/SkillLinkDialog.module.css`：`.form select` 底色 `--ds-bg` → `--ds-panel`（对齐 `--bg-panel` 契约，chevron/聚焦依赖全局 native-select 适配）。
- `src/components/ChineseGuide.module.css`：`.textarea` 底色 `--ds-bg` → `--ds-panel`；保留 `resize: vertical` 与行高契约，聚焦无光圈。

**checks**：`npx tsc -b` 通过；`npx eslint`（GlobalSkills/MySkills/InstallSkills）通过；范围内 `focus:ring` / `focus-visible:ring` grep 清零；全 src 无 emoji 图标。

**豁免与说明**
- 行内紧凑编辑器（MySkills 标签 pill 输入 h-5、InstallSkills 重命名输入）保留自定义尺寸，不套 36px `app-input`，仅移除自绘焦点写法，焦点由全局 `:is(input,select,textarea):focus` 规则承担。
- 空态/插画图标保留原尺寸：GlobalSkills `Library 28`、MySkills `Layers 32`、InstallSkills 无结果面板 `Search 20`（48px 托盘内）与功能区块 `FolderSearch/Github 20`（40px 托盘内），均在 32px 上限内；MySkills 卡片 `Loader2 20` 为加载态占位，未动。
- 契约类按钮（`ds-view-toggle`、`app-segmented-button`、`ds-search` 清除钮、标签筛选 pill、拖拽手柄、Disclosure 行等）保持不变。
- 遗留（不属本范围）：`src/index.css` 的 `.app-input` 基类仍带 `outline-none focus:border-border`（中性灰焦点），其 Tailwind 优先级高于 design-system.css 的 `:where()` 焦点规则，可能使 app-input 焦点不是 accent 加深，需主 agent 在第 1/3 步裁决。

### 工作区与项目

**changes**
- `src/views/WorkspaceView.tsx`：工具技能搜索框收敛为纯 `.app-input` 契约（去掉与 `.ds-shell .app-input` 重复/冲突的 `h-9`、`rounded-md`）；FileText、CircleSlash 图标 12px → 14px（3 处）。
- `src/views/ProjectDetail.tsx`：项目技能搜索框同上收敛为 `.app-input`；标签筛选 CircleSlash 12px → 14px。
- `src/views/Workbench.tsx`：行内链接 ArrowUpRight 13px → 14px（3 处），与 `libraryHint` 的 14px 对齐。wb-search / wb-btn / wb-tabs / ds-button / wb-text-danger 均为既有兼容契约类，保持不变。
- `src/views/Workbench.module.css`：`.wizard` 的 input/select 底色 `--ds-bg` → `--ds-panel`（对齐面板底契约）；新增 `.page/.wizard :global(.wb-search):focus-within { border-color: var(--ds-accent) }`，搜索框焦点改为托盘边框加深（此前 `outline:0 !important` 下无任何焦点反馈）。
- `src/components/PresetBar.tsx`：预设 pill 内 Loader2 / preset 图标 / Check 12px → 14px，同组同尺寸。
- `src/components/ProjectAgentDots.tsx`、`src/components/SyncDots.tsx`：点阵切换按钮删除 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`（自绘焦点光圈），焦点反馈由共享规则（button 2px outline 光圈）承担；`hover:ring-1` 保留。

**checks**：`npx tsc -b` 通过；`npx eslint`（WorkspaceView/ProjectDetail/Workbench/PresetBar/ProjectAgentDots/SyncDots）通过；范围内 grep `focus:ring` / `focus-visible:ring` / `focus:outline-none` / `focus-visible:outline-none` 清零；范围内无 emoji。

**豁免与遗留**
- 每个 input/select/textarea 的契约归属：WorkspaceView/ProjectDetail 搜索框 = `.app-input`；Workbench 三处搜索 = `.wb-search`（兼容契约，已补 focus-within）；向导 input/select = `.wizard` 模块规则（已对齐面板底/细边框/8px/36px）；RunPanel textarea/select 与复选框 = workbench.css `.wb-page` 旧契约 + design-system 全局 focus / native-select 适配（chevron 由全局承担，无自绘）。
- 遗留（不属本范围）：workbench.css 的 `.wb-page input/select/textarea` 底色仍为 `--wb-surface`（白），未对齐 `--ds-panel`；`.wb-search:focus-within` 全局缺失（本次只在 Workbench 模块内补）。两处归主 agent 在 workbench.css 统一。
- 关于「技能库与发现」提到的 `.app-input` 焦点优先级：design-system.css 焦点规则实际为 `:where(...) :is(input:not(...)×4,select,textarea):focus`， specificity (0,5,1) 高于 `.app-input:focus` 的 (0,2,0)，accent 加深生效，`focus:border-border` 已被压过；供主 agent 裁决时参考。
- ProjectAgentDots/SyncDots 内 Loader2 保持 12px：容器为 16-18px 点阵，等比缩放指示器，不适用 14-16 行内图标标准。
- PresetManager 行首预设图标 19px、Workbench 卡片 Folder 22px、空态插图图标 28-36px：身份/插图图标，非行内动作图标，保留。
- PresetIconPicker `.option:focus-visible`（2px outline、offset 1px）：button 光圈为契约允许，密集网格 1px offset 为有意局部覆写，保留。
- 标签筛选 pill、文档 tab pill、ds-view-toggle、app-segmented 等为状态/分段控件，非标准按钮，不收敛到 ui/Button；Workbench 内裸 `<button>` 均带 wb-*/ds-* 契约类，无需收敛。
- i18n 沿用既有豁免（硬编码中文不动）。

### 设置、备份与对话框

**changes**
- `src/views/Settings.tsx`：`fieldClass` 去掉死代码 `bg-background`；两处行内路径编辑输入删除冗余 `focus:border-accent`；12px lucide 图标统一升为 14px（`h-3.5 w-3.5`）。
- `src/views/Backup.tsx`：4 个自创输入框（设备名、GitHub 仓库名、Token、远程地址）收敛到 `.app-input` 契约（面板底/细边框/8px 圆角/36px），删除 `outline-none focus:border-border`；12px 图标升 14px。
- `src/components/CreatePresetDialog.tsx`、`RenamePresetDialog.tsx`、`TagRenameDialog.tsx`：自创 `inputClass`（含 `focus:outline-none focus:border-border`）收敛为 `app-input w-full`。
- `src/components/BatchTagDialog.tsx`：加标签输入收敛为 `app-input w-40 px-2 text-[12px]`；标签内 10px/12px 图标升 14px。
- `src/components/CommandPalette.tsx`：大输入框保持**简洁契约**（无边框透明输入，移除 `outline-none` 后由共享规则兜底）。上游 OpenDesign 无命令面板样式，命令面板通例（Raycast 式）为顶部裸输入而非灰托盘+白内卡，故不套 tray 模式。

**checks**
- `npx tsc -b` 通过；`npx eslint`（7 个改动文件）通过。
- Grep 自查：范围内 `focus:ring`/`focus-visible:ring`/`focus:outline-none`/`focus:border-*`/裸 `outline-none` 清零；每个 input 有明确契约归属（`.app-input` 或记录豁免）；范围内无 `<select>`/`<textarea>`。

**豁免**
- `Settings.tsx` 两处行内路径编辑输入保留 h-7 紧凑尺寸（嵌在 12px 文本行内，36px 会破坏行高）；边框/底色 token 与契约一致，焦点由共享规则承担。
- `Settings.tsx` 字号选择器的 `Type` 图标为有意尺寸梯度（2.5/3/3.5/4 对应 small→xlarge），不统一。
- 展示型图标保留原尺寸：`Settings.tsx` AgentIcon 24px 头像、`Backup.tsx` StatusIcon 20px（36px 托盘内）、`HelpDialog` 40px 托盘内 16px 图标。
- `CommandPalette.tsx` 的 `↑↓`/`↵` 为 kbd 键盘提示字符，非 emoji。
- 裸 `<button>`（Settings 拖拽把手、BatchTagDialog 标签 pill/建议行、GitSetupDialog/GitRecoveryDialog 选择卡片）为公共 Button 未覆盖的语义化特殊控件，按 src/AGENTS.md 保留原生 HTML；共享 2px 光圈规则已覆盖。
- `CloseActionDialog.tsx` checkbox 的 2px 光圈按契约保留。
- i18n 沿用既有豁免，未动。

**主 agent 收尾（级联清理）**
- `src/index.css` `.app-input` 基类删除 `outline-none focus:border-border`（与新焦点契约冲突的死写法；两 agent 独立确认共享规则经非分层+高特异性实际生效）。
- `src/workbench.css`：`.wb-page input/select/textarea` 底色 `--wb-surface` → `--ds-panel`；`.wb-search` 底色 → `--wb-soft`（panel）并补全局 `:focus-within { border-color: var(--ds-accent) }`（此前 `outline:0 !important` 导致完全无焦点反馈，工作区 agent 的模块级补丁随之冗余但无害）。

## 第 3 步：验证与打包

- `npm run lint` 通过（exit 0）；`npm run build` 通过（exit 0）。
- 全仓自查：`focus:ring*`/裸 `outline-none`/自绘 chevron 清零；input/textarea/select 全部有契约归属（`.app-input`/`.ds-search`/`.wb-search`/`.wizard`/module 契约，紧凑行内编辑器与 CommandPalette 裸输入为记录在案的豁免）。
- 已重新打包 `SkillHarbor.app`（workbench:build）供用户目验。
- 未做桌面目视走查（无显示环境）：首页 composer 的托盘/内卡视觉、暗色主题下聚焦描边、`.wb-search` 新焦点反馈需用户目验确认。

## 第 4 步：composer 聚焦光束与发送按钮精确复刻（用户目验后追加）

用户目验后要求：把 OpenDesign 首页 composer 的**交互与选中样式**原样复刻到首页输入框。参考源：`open-design/apps/web/src/styles/home/composer-beam.css`（光束机制）、`home-hero.css:2833-2892`（发送按钮）、`HomeHero.tsx:422-485, 1631-1645, 2300-2336`（状态机与测量）。

**changes（`src/views/SearchHome.tsx` + `SearchHome.module.css`）**
- **边框光束**：聚焦时一团绿（#00ff08）→青（#00fbff）的光沿输入卡边框绕行（280px 光斑、8s 一圈），聚焦 0.6s 淡入、失焦 0.5s 淡出后卸载。机制与上游逐行对应：border-box XOR padding-box 的环形 mask、`offset-path` 由 JS 用 ResizeObserver 测量写入 `--beam-path`、相位状态机 idle→active→fading→idle（失焦时 relatedTarget 包含检查忽略卡片内部焦点移动，淡出动画结束才卸载）。`prefers-reduced-motion` 下光束整体隐藏。
- **发送按钮**：改复刻上游 `.home-hero__submit`——36×36 近黑（#202020）超椭圆（radius = 36×14/32）+ 绿色箭头图标；禁用态（未输入）与可用态**外观完全一致**（不褪色），hover 仅轻微加亮；检索/回答中显示 60 次封顶的 spinner；保留 `aria-label="提问"` 与原 disabled 逻辑，键盘 focus-visible 仍享共享 2px 光圈。
- 保留上一轮 tray 模式（灰托盘+白内卡+聚焦浅描边），光束叠加在内卡描边之上，与上游一致。

**checks**：`npx tsc -b`、ESLint 单文件、`npm run build` 通过；已重新打包并启动供目验。待用户确认：光束在明暗两主题下的观感（绿/青为上游品牌色，如需换成中性色可调 `--beam-color` 两个值）、发送按钮 busy 态 spinner。
