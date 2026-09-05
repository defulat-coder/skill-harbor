# OpenDesign 设计规范符合性复查 · 五轮执行记录

目标：对照 `docs/design/upstream/` 快照与 `docs/design/` 规约，全面复查每个页面与组件（图标、按钮、输入框、下拉选择器等）。五轮「检查→修改→验证」，独立区域并行 SubAgent。约束：不删功能、不重置用户数据、不改 upstream 快照、修改先落共享 token/组件。

## 第1轮：五区并行审计（findings）

5 个 explore agent 并行审计（区域A 共享基座 / B 首页索引 / C 技能库 / D 工作区项目 / E 设置备份对话框），交叉验证后去重汇总如下。严重级：[阻断]=违反共享体系；[主要]=与上游契约明显不符；[次要]=细节偏差。

### 一、共享 token / CSS 层（第2轮修复）

1. [阻断] `src/index.css:9-57` 整套并行 `--color-*` 调色板（emerald 主色 #059669、zinc 中性色、独立 danger 红）。design-system.css:12-17 靠层叠压住大部分，但 `--color-danger-bg`、`--shadow-card*` 未被映射仍会渗出。→ 收敛为纯 `--ds-*` 映射块，删 emerald 字面量。
2. [阻断] `src/workbench.css:885-897` 暗色 `.dark .wb-*` 第三套配色（navy/periwinkle）；`--wb-danger-bg/line/text`、`--wb-empty-bg` 无桥接。→ design-system.css 补桥接到 ds 语义色。
3. [阻断] 缺语义 token：`--ds-warning(-bg)`、`--ds-success(-bg)`、`--ds-info(-bg)`（上游 tokens.css:76-89 有 green/amber/blue 语义对）。StatusBanner warning 用 muted 灰、全站状态徽标用 Tailwind 色相硬凑。→ 按上游值增补（含暗色）。
4. [主要] `src/workbench.css:253-258,838-842` wb 页面 input/select/textarea/button 焦点环硬编码紫 #aab5ff / #8797ee，特异性压过共享 focus 契约。→ 删除，回落 design-system.css:64。
5. [主要] `src/workbench.css:557-561` `.wb-danger` 硬编码红 #b85858，无暗色/hover/disabled。→ 桥接 `var(--ds-danger)` 或改消费共享 Button。
6. [主要] `src/design-system.css:44` `.ds-button` 内联 transition（100ms 默认 ease）压过同文件 :where() 的共享动效契约。→ 删除或改 `var(--ds-ease-out)`。
7. [主要] 全站无全局链接颜色规则 → `<Link>` 渲染 UA 默认蓝（第二主色）。→ design-system.css 增 `.ds-shell a` 契约（继承正文色+下划线）。
8. [主要] `src/design-system.css:48` `.ds-search:focus-within` 用 `--ds-subtle`（白底近不可见）→ 改 `--ds-accent`。
9. [次要] `src/design-system.css:45` 主按钮 hover 用 `filter:brightness(.92)` 而非 token，与 Button.module.css 的 `--ds-strong` 两套机制。→ 统一。
10. [次要] `src/design-system.css` 缺 `@media (prefers-color-scheme: dark)` token 回退（上游 tokens.css:237-297 有）；`src/hooks/useTheme.ts:29` 默认 light，system-dark 用户首启动浅色；`:40-47` system 模式切换不 setState，ThemedToaster 主题过期。→ 补回退 + 修 hook。
11. [次要] `tailwind.config.js:43-54` fontFamily.sans 为 SF Pro 栈，与 `--ds-font`（Albert Sans）并行；`src/index.css:75` body 负字距（CJK 禁止）。→ 对齐。
12. [次要] 阴影/遮罩硬编码：`DetailSheet.module.css:1,3`（#00000024/#20202059）、`CardActionMenu.module.css:2`（#0002）、`ToggleSwitch.module.css:5`（#0003）。→ 增 `--ds-shadow`/`--ds-scrim` token 并消费。
13. [次要] 两套页头并存：PageHeader 组件 vs `.ds-page-header`（无 tsx 消费）。→ 删 `.ds-page-header`，统一 PageHeader。
14. [次要] workbench.css 约 600 行死 CSS（.wb-sidebar/.wb-brand/.wb-logo/.wb-intro/.wb-nav/.wb-header/.wb-project-card/.wb-overlay/.wb-modal 等无引用）+ 离阶圆角（5/7/10px）与离网格间距。→ 死码删除，活面圆角收敛 4/8/12/16。
15. [次要] `.wb-console` 硬编码 #202839/#dce3f0（TaskOutput 用）——若属「控制台恒暗」产品决定，记录进 docs/design/README.md 差异表，否则映射 token。

### 二、共享组件 / 模块层（第2轮修复）

16. [阻断] `src/lib/skillTags.ts:26-46` 标签 8 色彩虹轮换色板（消费：MySkills、WorkspaceView、ProjectDetail、AddSkillsSheet、SkillPickerRow）。→ 收敛：中性 `.ds-tag` + 激活态 `--ds-brand`/`--ds-brand-bg`，改此一处。
17. [阻断] `src/components/MultiSelectToolbar.tsx:73-129` 七个裸 button 六套饱和实底色（sky/amber/violet/red/emerald + text-white），无 type="button"。→ 全部改消费共享 Button（一个 primary，其余 secondary/danger）。
18. [阻断] `src/lib/presetIcons.tsx:45-263` 预设图标 30 色个人色板（含 anti-ai-slop P0 禁令的 indigo；text-*-300 对比度约 1.5-2:1）。→ 统一 text-muted，激活态 `--ds-brand` 组。
19. [主要] 共享 Button 上的 Tailwind 覆盖类系统性静默失效（Vite CSS Module 无层样式 > @layer utilities）：Settings.tsx:1485/2176/2224/2252、1096-1260 图标着色、Backup.tsx:879/893/975-993 等。作者意图（红色上报、accent 主按钮）实际未生效。→ ui/Button 扩展受控 variant/size（如 danger-ghost、small），页面删覆盖类（页面侧在第3/4轮执行）。
20. [主要] `src/components/ui/Button.tsx:12-13` + module.css：busy 用 aria-busy（应删，disabled+live-region 已够）；spinner `spin 1s linear infinite` 无 60s 上限（对照 LoadingState 的 60 次封顶）；字号 13px（上游 14）、iconOnly 32px（上游 36）、disabled 用 opacity:.5（上游为 token 组）。→ 逐项对齐。
21. [主要] `src/components/StatusBanner.module.css:1,3,4` 圆角卡片+彩色左边条命中 anti-ai-slop P0；warning 无语义色。→ 去左边条改全边框+左侧语义图标；消费新 `--ds-warning`。
22. [主要] 同步状态徽标 meta 两处近乎重复且用 Tailwind 色相：`WorkspaceView.tsx:204-232`、`ProjectDetail.tsx:64-92`。→ 新建共享模块 `src/lib/syncStatusMeta.ts`（语义 token），页面在第4轮消费。
23. [主要] `src/components/ProjectAgentDots.tsx:73-75`、`SyncDots.tsx:82-84` 可交互点仅 16-18px（AA 下限 24×24）；`:89-93,154` stateTitle 硬编码英文进 aria-label；两文件近乎复制。→ 第4轮修：24px 热区、i18n、评估合并。
24. [次要] `src/index.css` / `src/lib/textScale.ts` 双重缩放（zoom + --app-scale 补偿）需实测，暂记录。
25. [死代码] `src/components/Sidebar.tsx`（774 行旧壳，全仓无 import）、`src/views/Dashboard.tsx`（无路由）、`src/components/AgentControlSetupCard.tsx`（仅 Dashboard 引用）、`src/components/InstallToast.tsx`+css（无消费，与 sonner 双体系）、`.ds-page-header`、SkillLinkDialog 的 `ds-feedback` 死类。→ 第2轮删除（git 历史可恢复）。

### 三、页面级差异（第3/4轮修复）

**首页/索引（第3轮）**
- [主要] SearchHome.tsx:88 提交按钮 aria-label 不含可见文本「提问」（Label in Name）→ 删 aria-label。
- [主要] useSkillIndex.ts:6 初始 loading:false → 首帧误显示「尚未建立索引」空态闪烁 → 初始 loading:true。
- [次要] SearchHome.module.css:5 h1 30px 脱刻度（取 28 或 32）；:20 与 SearchIndex.module.css:9 错误面板两套样式 → 用共享危险面板（新 --ds-danger-bg）；:33 断点 640/560 与全局 1000/760 不一致；「索引管理 →」「开始提问 →」装饰箭头进读屏 → aria-hidden span 或 lucide。
- [次要] SearchHome/SearchIndex 全量硬编码中文，与 i18n 混用（记录，不强制改）。

**技能库与发现（第3轮）**
- [阻断] `text-white` 配 bg-accent/bg-accent-dark 暗色对比崩塌（≈1.1:1）：MySkills.tsx:1191、InstallSkills.tsx:868/1002/1124、AddProjectDialog.tsx:260、AddSkillsSheet.tsx:454/541/594、SkillDetailPanel.tsx:318 → 统一改共享 Button 或 `var(--ds-on-accent)`。
- [主要] 自创主/次按钮未用共享 Button：InstallSkills.tsx:850/863-895/994/1002/1124、MySkills.tsx:1136-1143 → 改消费；分页/加载更多模式重复，可在 ui/ 加小组件。
- [主要] 状态徽标 Tailwind 色相+对比不足：MySkills.tsx:987/1050-1063/1388…、SkillPickerRow.tsx:85-86、SkillProjectsSection.tsx:239/252/297-298、InstallSkills.tsx:1093 → 换第2轮新语义 token。
- [主要] AddProjectDialog.tsx:137-138 自创 inputClass（无 focus 环）→ 改 `.app-input`；MySkills.tsx:1145-1176 视图切换自创方形按钮 → 改 `.ds-view-toggle`（GlobalSkills:72 是范本）。
- [次要] 离阶圆角（InstallSkills 4/5/6px、内容面板 16px）、离标字号（10.5/12.5px）、图标漂移（GlobalSkills:72 16 vs 17px、:78 strokeWidth 1.5、MySkills:1285 空态 48px）、Tailwind transition-colors 默认缓动（共享层兜底）、MySkills.module.css:7 手抄贝塞尔、SkillMarkdown 正文 14 vs 13px 打架+font-mono 栈、AddSkillsSheet.tsx:438 ring 替代 outline 契约、:536 pill 缺 aria-pressed、InstallSkills 市场无结果空态缺「清除搜索」CTA、MySkills.tsx:1498-1505 标签 X 仅 10×10px、MarketChinesePreview.tsx:35 spinner 超 60s 无上限。

**工作区与项目（第4轮）**
- [主要] D-5 暗色 `bg-accent`+`text-white` 失效 7 处（WorkspaceView:835/921/1003、ProjectDetail:949/966/1088/1621）；`bg-accent-hover` 死类（无 hover 反馈）：WorkspaceView:921、ProjectDetail:949/1088 → 共享 Button。
- [主要] 大量自创原生按钮：WorkspaceView:632-634/784-815/919-925、ProjectDetail:905-953/1084-1092/1215-1266/1369-1421 → 共享 Button（含 iconOnly）。
- [主要] ProjectDetail.tsx:1069-1072 加载态纯文本 → LoadingState；AgentToggleSection.tsx:137 emerald 勾、ProjectDetail:1147/1298 amber 点+rgba 阴影、:1195/1337 red 徽章、:1262/1417 红色删除 hover、PresetBar:141/151 amber → 语义 token。
- [次要] PresetBar.tsx:127-155 预设 pill 缺 aria-pressed；ProjectAgentDots/SyncDots 8-9px 全大写负字距缩写（typography 规则）；Workbench.module.css:4 硬编码 150ms 贝塞尔；WorkspaceView/ProjectDetail 整卡 div onClick 嵌套交互（role=button+键盘或收敛入口）；Workbench.tsx:295/398 `↗`、:635 `＋` 字符 → lucide。
- [i18n] WorkspaceView:696/705/766/829/908/917、ProjectDetail:864/865/1082/1636 硬编码中文。

**设置/备份/对话框（第4轮）**
- [主要] Settings.tsx:1066-1087 状态徽章硬编码 sky/emerald/amber；Backup.tsx statusMeta(319-379)/879-897/931-938/1130/1250/1325-1339 整套 red/amber/emerald → 新语义 token + Button 新 variant。
- [主要] SkillSourceDiffViewer.tsx:12-16、DocumentDiffViewer.tsx:157-170 diff 文字色绕 token（背景已 token 化）→ `--diff-*` 补 ink 色。
- [主要] BatchTagDialog.tsx:121-122/150 chip 硬编码红/绿；Settings.tsx:1339-1371/1676-1693 按钮层级混乱（text-accent 充当主操作群）→ Button variant。
- [次要] CloseActionDialog 无可见取消按钮+checkbox 无样式；ConfirmDialog tone=warning 映射 primary 且默认文案仍「删除」；CommandPalette:249 中文组标签 font-mono uppercase；i18n 漏网（DetailSheet:53 aria-label、RunnerSettings 全文、CommandPalette:308/328、Backup:1269、BatchTagDialog:181 等）；ds-dialog-title 22px vs DetailSheet 20px 标题并存。

### 合规确认（五区一致认可，无需改动）

PointerKineticGrid 参数与上游逐值一致且全站单实例；壳层几何 44/236/1080；Disclosure 0fr→1fr 教科书实现；LoadingState 四态+15s 降级+60 次 spinner 封顶；原生 dialog（DetailSheet）契约逐条吻合；native select 全局适配；图标统一 lucide 零 emoji；状态覆盖主干（加载/空/错误/成功）普遍到位。

### 第1轮 checks

5 个审计 agent 全部完成并交叉引用验证；未修改任何文件；需运行验证项已记录（暗色对比实测、Tailwind 透明度修饰符生效性、级联顺序、键盘走查）。

## 第2轮：共享基座修复

### 第2轮-A：token 与 CSS 基座

**changes（工作单 1-15）**

- 1 `src/index.css`：`:root`/`.dark` 两块并行调色板全部改为 `--ds-*` 映射（与 design-system.css 一致），补 `--color-danger-bg: var(--ds-danger-bg)`、`--shadow-card: var(--ds-shadow-sm)`、`--shadow-card-hover: var(--ds-shadow-md)`；emerald/zinc 字面量清零；空的 prefers-color-scheme 占位块删除（真正回退见第 10 项）；`@layer base` 与其余组件类不动。design-system.css 映射块同步补 `--color-danger-bg` 与 `--shadow-card*`。
- 2 design-system.css `:root`/`:root.dark` 补 `--wb-danger-bg/line/text`、`--wb-empty-bg` 桥接（danger 系指向 `--ds-danger*`，empty 用 `color-mix(in srgb, var(--ds-bg) 50%, transparent)` 保留原半透明空态）；workbench.css 尾部 `.dark .wb-*` 第三套 navy 配色块及 `.dark .wb-intro/.wb-brand/.wb-primary` 覆盖整体删除。
- 3 新增语义 token（明暗双值，取自 upstream tokens.css 的 amber/green/blue/red 语义对）：`--ds-warning(-bg)`、`--ds-success(-bg)`、`--ds-info(-bg)`、`--ds-danger-bg`。
- 4 删除 workbench.css 两处硬编码紫色焦点环（`.wb-page input/select/textarea:focus` 的 #aab5ff、`.wb-page button:focus-visible` 的 #8797ee），回落 design-system.css 共享 focus-visible 契约。
- 5 `.wb-danger` 改 `background: var(--ds-danger); color: var(--ds-bg); border-color: transparent`，补 hover（同 Button.module.css danger 的 brightness 反馈）与 disabled 态；暗色经 token 自动适配（#ff7777 底 + #202020 字），原 `.dark .wb-danger{color:white}` 随暗色块删除。
- 6 删除 `.ds-button` 内联 `transition: ... 100ms`，并把 `.app-btn-secondary` 加入共享动效 `:where()` 契约，140ms ease-out 真正生效。
- 7 新增 `.ds-shell` 链接契约：`:where(.ds-shell) a`/`a:visited` 颜色继承正文 + 保留下划线，`a:hover` 变 `--ds-strong`；`:where()` 零特异性保证 `.ds-nav-row` 等自带颜色/去下划线的类不受影响，UA 蓝/紫不再出现。
- 8 `.ds-search:focus-within` outline 色 `--ds-subtle` → `--ds-accent`。
- 9 `.ds-button-primary:hover` 的 `filter:brightness(.92)` 改为 `background/border-color: var(--ds-strong)`，与 Button.module.css 主按钮一致。
- 10 design-system.css 补 `@media (prefers-color-scheme: dark)` 回退块（值抄 `:root.dark`，含本轮全部新 token），选择器 `:root:not(.dark):not(.light)`。遗留依赖见风险节。
- 11 tailwind.config.js `fontFamily.sans` 对齐 `--ds-font`（Albert Sans → PingFang SC → Microsoft YaHei → sans-serif）；index.css body 的 `letter-spacing: -0.005em` 删除。
- 12 阴影/遮罩 token 化：`--ds-shadow-sm`（原 `--ds-shadow` 值，上游 shadow-sm）、`--ds-shadow`（上游 shadow-lg，对话框/详情形）、`--ds-shadow-md`（上游 shadow-md，卡片 hover/菜单）、`--ds-scrim`（明 `color-mix(#202020 35%)` ≈ 原 #20202059，暗 `color-mix(#000 55%)`），均明暗双值；侧栏面板改消费 `--ds-shadow-sm`，`.ds-dialog`、DetailSheet.module.css 的阴影/遮罩、CardActionMenu.module.css 菜单阴影、ToggleSwitch.module.css 旋钮阴影全部改 token 消费。
- 13 删除 design-system.css 的 `.ds-page-header` 系列（Grep 全 src/ 无 tsx 消费；PageHeader 组件用自带 module.css，不受影响）。同属死码的 `.ds-header-actions` 与 `.ds-shell .wb-header` 选择器一并删除，design-system.css 中对已死 wb 类（wb-primary/wb-project-card/wb-project-grid/wb-modal/wb-eyebrow/wb-library-link/wb-task-area）的桥接覆盖同步清理。
- 14 workbench.css 死 CSS 清理：Grep 确认无引用后删除 `.wb-sidebar/.wb-brand/.wb-logo/.wb-nav*/.wb-dot/.wb-header/.wb-eyebrow/.wb-intro*/.wb-project-grid/.wb-project-card/.wb-library-link/.wb-new/.wb-primary/.wb-overlay/.wb-modal*/.wb-icon-btn/.wb-mode-options/.wb-global-link*` 等规则，文件 917 → 约 500 行；活面离阶圆角收敛（wb-pill 5→4；wb-search/输入族/wb-error/wb-notice/wb-skill-row 7→8；wb-folder 9→8；wb-detail/wb-skill-list 10→8 对齐既有桥接；wb-empty/wb-run-* 10→12 对齐 ds-empty/ds-panel；wb-markdown pre 6→8）；`.wb-btn` 裸 `0.15s` 改 `var(--ds-duration-exit) var(--ds-ease-out)`；活规则中 `var(--wb-*, #字面量)` 兜底全部移除（桥接已在 :root 保证定义）。
- 15 `.wb-console` 保留恒深色 #202839/#dce3f0（控制台恒暗产品决定），原因已记录进 docs/design/README.md「必须继承的规则」表新增行。

**checks**

- `npm run lint` 通过（0 errors）；`npm run build` 通过（Vite 2150 modules，无新增警告）。
- Grep：src/index.css、src/workbench.css 除 `.wb-console` 两个有记录值外无 hex 字面量；`#aab5ff`、`#8797ee`、`#b85858`、`#059669`、`#10B981` 在 src/ 与 tailwind.config.js 清零。
- 构建产物确认：`prefers-color-scheme: dark` 回退块与 `--ds-warning/--ds-scrim` 等新 token 进入 dist CSS。
- 风险/遗留：①第 10 项回退块的 `:not(.light)` 退出依赖 useTheme 为显式 light 打标记——当前 `applyThemeClass` 只切换 `.dark`，「显式 light + OS 暗色」用户在 JS 挂载后仍会命中回退（hooks 归 B 侧/后续轮，建议在 applyThemeClass 同步 toggling `light` 类）；②`.wb-search input` 的 `outline:0 !important` 会压住共享焦点环（旧有行为，本轮未动）；③未做运行界面目视走查（无显示环境），暗色对比与链接下划线效果需桌面验证。

### 第2轮-B：共享组件与模块

**changes（工作单 16-23、25）**

- 16 `src/lib/skillTags.ts`：删除 8 色彩虹轮换色板；`getTagColor` 返回中性 pill（`bg-bg-secondary border border-border-faint text-muted`，对齐 design-system.css `.ds-tag`），`getTagActiveColor` 返回 brand 组（`border-[var(--ds-brand)] bg-[var(--ds-brand-bg)] text-[var(--ds-brand)]`）。导出 API 与签名不变，消费方（MySkills/WorkspaceView/ProjectDetail/AddSkillsSheet/SkillPickerRow）零改动。
- 17 `src/components/MultiSelectToolbar.tsx`：7 个裸 button 全部改消费共享 `ui/Button`——`update` 为唯一 primary（沿用原 accent 层级），updateProject/updateCenter/editTags/toggle/selectAll/cancel 为 secondary，删除为 danger variant；busy 态走 Button 契约（`busy={updating*}`，spinner 替代原 animate-spin 图标）；`type="button"` 由 Button 默认承担；sky/amber/violet/red/emerald 硬编码色类清零。36px/圆角由 Button 契约承担，工具条整体比原来（约 30px 按钮）略高。
- 18 `src/lib/presetIcons.tsx`：30 色个人色板删除；31 个预设项经 `presetIconOption()` 工厂统一为 `colorClass: "text-muted"`、`activeClass: "border-[var(--ds-brand)] bg-[var(--ds-brand-bg)]"`。图标集、key、label、关键词规则与导出 API 不变。indigo/fuchsia 等色相类清零。
- 19 `src/components/ui/Button.tsx` + module.css：新增受控 `size="sm"`（min-height 28px、13px 字号）与 `variant="danger-ghost"`（描边/文字 `--ds-danger`，hover 铺 `--ds-danger-bg` 浅底）。默认 props 渲染不变；页面迁移留给第 3/4 轮。
- 20 同文件对齐上游契约：删 busy 态 `aria-busy`（保留 `disabled || busy`）；spinner 改 `spin 1s linear 60`（60 次封顶，对齐 ui/LoadingState.module.css:3）；字号 13→14px；iconOnly 32→36px；disabled 从 `opacity:.5` 改为上游 token 组（`background:var(--ds-subtle); border-color:transparent; color:var(--ds-soft)`，对应 upstream button.module.css:109-114 的 bg-subtle/text-faint）。尺寸影响评估见文末报告。
- 21 `src/components/StatusBanner.tsx` + module.css：删除彩色左边条（anti-ai-slop P0 #5），保留全边框；左侧图标按 tone 分语义——warning 用 AlertTriangle + `var(--ds-warning)`，danger 用 OctagonAlert + `var(--ds-danger)`，默认中性 muted；加上游 entrance.css 的 fade-slide-down 220ms 进场并带 `prefers-reduced-motion` 回退。props API 不变（消费方 Layout、InstallSkills 4 处零改动）。
- 22 新建 `src/lib/syncStatusMeta.ts`：合并 WorkspaceView.tsx:204-232 与 ProjectDetail.tsx:64-92 两份同步状态 meta 的颜色半边——`getSyncStatusClassName(status)` / `getSyncStatusMeta(label, status)`，颜色映射 in_sync→success、project_newer→warning、center_newer→info、diverged→danger（均配 `-bg`），project_only→中性。两页 i18n key 命名空间不同，label 由页面侧第 4 轮接入时提供，本轮未改页面。
- 23 `src/hooks/useTheme.ts`：默认主题 light→system（system-dark 用户首启动不再闪浅色）；系统偏好改为 state 跟踪（`systemTheme`），OS 切换时 setState 驱动 resolvedTheme 重渲染，修复原 :40-47 只 applyThemeClass 不 setState 导致 ThemedToaster 主题过期的问题；监听器常驻以便用户切回 system 时立即拿到正确值。hook API 不变。
- 25 死代码删除：Grep 全 src/（含动态 import/字符串）确认 `Sidebar`、`Dashboard`、`AgentControlSetupCard`、`InstallToast` 无外部 import（仅 Dashboard→AgentControlSetupCard 内部引用）后删除 6 个文件。`src/lib/migrateStorage.ts` 中无 Sidebar 专属旧键（RENAMED_KEYS 均为旧壳时代的预设/工具顺序键，迁移目标仍有消费），按工作单保留不动。

**checks**

- `npx tsc -b` 通过；`npm run lint` 通过（0 errors）。
- Grep 确认 skillTags.ts / presetIcons.tsx / MultiSelectToolbar.tsx / syncStatusMeta.ts 中 Tailwind 色相类（sky/amber/violet/emerald/rose/cyan/orange/pink/indigo/fuchsia/red-/blue-/teal/lime/yellow/green/purple/slate/stone/neutral-/zinc-）清零。
- Grep 确认 6 个被删文件在 src/ 无任何残留 import 或字符串引用（i18n json 中的 `sidebar.dashboard` 等翻译键保留，属无害键值，不在本轮范围）。
- 依赖并行 agent 新增的 `--ds-warning(-bg)`、`--ds-success(-bg)`、`--ds-info(-bg)`、`--ds-danger-bg` token：StatusBanner、Button danger-ghost、syncStatusMeta 以 `var()` 引用，运行时定义由 design-system.css 半边保证；合并后需一次暗/明主题目视走查（预设 pill 激活态、标签 pill 激活态、StatusBanner warning、多选工具条）。

**第2轮收尾（主 agent）**：useTheme.ts 的 `applyThemeClass` 已补 `.light` 显式标记（`classList.toggle("dark"/"light", ...)`），与 design-system.css 回退块的 `:root:not(.dark):not(.light)` 选择器对齐，消除「显式 light + OS 暗色」用户被回退染暗的风险。`npx tsc -b`、ESLint 单文件均通过。

## 第3轮：页面修复第一批（首页/索引 + 技能库）

### 第3轮-A：首页与索引

**changes（工作单 1-7）**

- 1 `SearchHome.tsx` 提交按钮删除 `aria-label="检索技能并生成中文回答"`：可见文本「提问/检索中/回答中」即合格标签，aria-label 覆盖它违反 Label in Name。
- 2 `useSkillIndex.ts` 初始 `loading:false → true`，首帧渲染「正在检查索引…」而非错误的「尚未建立可用索引」空态。连带修复：原防重入守卫 `if (state.loading || state.building) return;` 会把初始 loading:true 的首次 `refreshSkillIndex()` 永久挡掉，改为模块级 `refreshing` 在飞标记与展示态 `state.loading` 分离（`buildSkillIndex` 守卫不动，检查在飞时仍禁止构建）。SearchHome/SearchIndex 分支逻辑回归：状态行 `building → loading → ready → 空` 顺序不变；`SearchHome` 的 `key={status?.root ?? "pending"}`、错误/提示分支均以 `!statusLoading` 为条件，初始 true 下行为正确（提交按钮与「重新检查」在首次检查期间禁用，恢复后可用）。
- 3 `SearchHome.module.css` h1 30px → 28px：取 4px 网格上 24（移动端）与 32 之间的刻度点，页面层级为单一问答 hero 无需 32px 的 H1 上限。
- 4 错误面板统一（两处参数逐值一致）：`border:1px solid var(--ds-danger)` + `background:var(--ds-danger-bg)` + `color:var(--ds-danger)`，flex 布局 gap 12 / padding 14px 16px / radius `--ds-radius` / 13px 1.7。SearchHome 侧仅把底色 `var(--ds-bg)` 换成 `--ds-danger-bg`；SearchIndex 侧从纯红文字升级为同参数面板（选择器保持 `.panel .error` 以压住 `.panel p` 的 14px/1.8/margin）。两处均保留 `role="alert"`。
- 5 断点对齐全局 760px：`SearchHome.module.css`、`SearchIndex.module.css` 的 640px、`StatusBanner.module.css` 的 560px（仅此一行，组件其余不动）。
- 6 装饰箭头图标化：SearchHome「索引管理」、SearchIndex「开始提问」链接内的「→」文本节点改为 lucide `ArrowRight size={14} aria-hidden`，与全站 lucide 体系一致；链接新增 `.indexLink`/`.footerLink`（inline-flex + gap 4px，不设颜色）。
- 7 回归确认：两页链接均不设颜色（`.directory > a` 仅 underline 参数、`.hit h3 a:hover` 仅 underline），继承第2轮 `.ds-shell a` 契约；全部按钮消费共享 Button；PointerKineticGrid 与布局未动。

**checks**

- `npx tsc -b` 通过（exit 0）；`npx eslint src/views/SearchHome.tsx src/views/SearchIndex.tsx src/hooks/useSkillIndex.ts` 通过（exit 0）。未跑全仓 build（并行 agent 工作中，留主 agent 统一回归）。
- Grep 自查：两个 module.css 无 hex 字面量；两 tsx 无 `text-white`、无「→」文本节点、无 aria-label 与可见文本不一致（残留 aria-label/labelledby 均为 section 区域标签）。
- 未做桌面目视走查（无显示环境）：危险面板暗色对比、760px 断点换行效果需桌面验证。

**豁免项**

- SearchHome/SearchIndex 全量硬编码中文未改 i18n：属大范围重构，按工作单本轮豁免，仅记录。

### 第3轮-B：技能库与发现

**changes（工作单 1-5）**

- 1 [阻断] `text-white` 7 处全部清除：MySkills.tsx 来源筛选 pill、InstallSkills.tsx 分页当前页/全部导入/单个导入、AddProjectDialog.tsx 扫描结果勾选框、AddSkillsSheet.tsx 代理勾选角标/「全部标签」pill/来源 pill、SkillDetailPanel.tsx 文档 tab pill。主操作类（全部导入、单个导入、分页当前页）改消费共享 Button（primary 用 `--ds-on-accent`）；pill/checkbox 角标类改 `text-[var(--ds-on-accent)]`，明暗主题随 token 翻转。全区域 Grep `text-white` 兜底清零。
- 2 [主要] 自创按钮改共享 Button：InstallSkills.tsx 分页上一页/页码/下一页/加载更多（`size="sm"`，页码当前页 `variant="primary"` + `aria-pressed` + `aria-label="第 N 页"`）、重新扫描（`busy={scanLoading}`）、全部导入（primary + `busy={importingAll}`）、单个导入（primary sm + `busy={isImporting}`）；MySkills.tsx「更新可用」改 `variant="ghost"` + `busy={batchUpdating}`。手写 Loader2/animate-spin 全部由 Button busy 契约接管。
- 3 [主要] 状态徽标色相→语义 token：MySkills.tsx git 工具条 needs_fix（`--ds-danger`）/pending（`--ds-warning`）、statusBadge 三态（warning-bg/warning、danger-bg/danger）、卡片与列表的更新 pill/冲突「需要处理」按钮（warning 组，hover 用 `color-mix(var(--ds-warning) 16%)`）、预设名（`--ds-warning`）；SkillPickerRow.tsx installed/conflict（success 组/danger 组）；SkillProjectsSection.tsx 已安装卡片边框+底（success 35% 边框 + success-bg）、错误文本（`--ds-danger`）、agent 已安装/冲突按钮（success 组/danger 组）；InstallSkills.tsx 已导入徽标（success 组）。文字色直接用 token 全值，不再自调透明度。
- 4 [主要] AddProjectDialog.tsx 自创 inputClass 删除，三处输入改 `.app-input`（36px/8px/focus 契约由 ds-shell + 共享 focus-visible 承担）；MySkills.tsx 视图切换两个自创方形按钮改 `.ds-view-toggle`（GlobalSkills 范本），多选切换按钮并入同组（补 `aria-label` + `aria-pressed`），组内图标统一 16px。
- 5 [次要] 逐项：
  - 圆角收敛：InstallSkills.tsx 安装数徽标 5px→4、工具名 chip rounded-[4px]→rounded（值不变、去 arbitrary）、市场无结果面板与图标盒 rounded-2xl→rounded-xl（12）；分页/导入按钮的 6px 随共享 Button 收敛到 8px 契约。
  - 字号：SkillPickerRow.tsx 标签 10.5→12；SkillDetailPanel.tsx meta 行与 metadata 值 12.5→12；SkillProjectsSection.tsx 卡片 12.5→12。
  - 图标：GlobalSkills.tsx List 17→16（与 LayoutGrid 一致）、FileText 去掉 strokeWidth=1.5；MySkills.tsx 空态 Layers 48→32。
  - 动效：MySkills.module.css skillCard 手抄贝塞尔→`var(--ds-duration-exit) var(--ds-ease-out)`；InstallSkills.module.css enter keyframes 缓动数值改消费 `var(--ds-duration-enter) var(--ds-ease-out)`（与原 200ms/同一曲线一致）。
  - SkillMarkdown.tsx 段落 13px/leading-6→14px/leading-7，与 article 正文一致（中文阅读）。
  - AddSkillsSheet.tsx 代理 pill 删 `focus-visible:ring-2 ring-accent` 自写法，回落共享 outline 契约（design-system.css:100）；「全部标签」pill 补 `aria-pressed`。
  - InstallSkills.tsx 市场无结果空态补「清除搜索」CTA（有搜索词或来源筛选时出现，清 query + sourceFilter，对齐 GlobalSkills 清除筛选写法）。
  - MySkills.tsx 标签移除 X：`p-[7px] -m-[7px]` 透明热区，触控目标 10→24×24，视觉尺寸不变。
  - MarketChinesePreview.tsx 生成中 spinner 加 60s 上限：超时停动画并升级为静态说明条（沿用 styles.loading 静态呈现，参照 ChineseGuide 生成中静态 notice 的合规写法）；计时器在完成/切换技能/卸载时清理。
  - SkillLinkDialog.tsx 死类 `ds-feedback` 删除，保留有定义的 `is-error`。
- 范围外/不做：硬编码中文 i18n 重构（豁免，第1轮已记录）；MySkills.tsx 标签右键菜单坐标未使用（已知豁免，键盘路径由 CardActionMenu 兜底）；font-mono 未改 token——design-system.css 无 `--ds-mono` token，按工作单约定保留 Tailwind 默认 font-mono 并记为豁免。

**checks**

- `npx tsc -b` 通过；`npx eslint` 本轮全部 12 个改动 tsx 通过（0 errors）。未跑全仓 build（并行 agent 同时工作，主 agent 统一回归）。
- Grep 自查（本区域 3 视图 + 9 组件及其 module.css）：`text-white` 清零；Tailwind 色相类（amber/emerald/rose/red/sky/violet 等带数字色阶）清零；hex 字面量与手抄 cubic-bezier 清零。
- 依赖第2轮 token：`--ds-on-accent`、`--ds-warning(-bg)`、`--ds-success(-bg)`、`--ds-danger(-bg)`、`--ds-ease-out`、`--ds-duration-enter/exit`，均以 var() 消费；合并后需一次明/暗主题目视走查（重点：分页当前页、更新 pill、标签 X 热区、60s 超时文案、清除搜索 CTA）。

（第3轮完成：A、B 两个并行 agent 的小节见上。）

## 第4轮：页面修复第二批（工作区/项目 + 设置/备份/对话框）

### 第4轮-A：工作区与项目

**changes（工作单 1-9）**

- 1 [主要] 暗色 `bg-accent`+`text-white` 7 处与 `bg-accent-hover` 死类 3 处全部清除：WorkspaceView 空态 CTA（原 :921）与 ProjectDetail 添加技能（原 :949）、空态 CTA（原 :1088）改消费共享 Button `variant="primary"`（`--ds-on-accent` 由 Button 契约承担，死类随之消失）；四处激活 pill（两页「全部标签」、两页 DetailSheet 文档 tab）改 `bg-accent text-[var(--ds-on-accent)]` 并删冗余 `dark:` 前缀。
- 2 [主要] 自创原生按钮全部改共享控件：WorkspaceView 卡片拉取/上传与 ProjectDetail 网格+列表卡片的更新至中心/更新至项目按钮改 `Button iconOnly size="sm" variant="ghost"`（`busy` 走 Button 契约，busy 时只渲染 spinner 不占 36px 盒）；两处删除按钮改 `Button iconOnly variant="danger-ghost"`（同时覆盖工作单 4 的红色 hover 项）；两页刷新按钮改 `Button iconOnly variant="ghost" busy={loading}`；两页视图切换（ProjectDetail 含多选切换）改 `.ds-view-toggle`（GlobalSkills/第3轮 MySkills 范本）；WorkspaceView 空态 CTA、ProjectDetail 添加技能/空态 CTA 改 Button primary。`renderLocalSkillActions` 的 grid/list 双 className 与 `Loader2` 手写 spinner 随之删除（两页 `Loader2` import 清零）。
- 3 [主要] 同步状态 meta 合并：删除 WorkspaceView 的 `getLocalStatusMeta` 与 ProjectDetail 的 `getSyncStatusMeta` 本地实现，改消费 `src/lib/syncStatusMeta.ts` 的 `getSyncStatusMeta(label, status)`；两页各自保留 `SYNC_STATUS_LABEL_KEYS` 映射表（globalWorkspace.localSkills.status.* 与 project.syncStatus.* 两个命名空间的文案不变）。
- 4 [主要] 语义色替换：AgentToggleSection 勾选图标 `text-emerald-500`→`text-[var(--ds-success)]`；ProjectDetail 部分启用点 `bg-amber-500`+rgba 阴影→`bg-[var(--ds-warning)]`+`shadow-[0_0_0_3px_color-mix(in_srgb,var(--ds-warning)_15%,transparent)]`（网格+列表两处）；「已禁用」徽章 `red-500/10`/`red-600`→`--ds-danger-bg`/`--ds-danger`（两处）；PresetBar 部分激活 pill amber 组→`--ds-warning` 组（hover 用 color-mix 16%，计数徽章底色 color-mix 20%）；ProjectAgentDots/SyncDots orphan 态 amber 组→`--ds-warning` 组（顺手项，属同文件色类清零）。
- 5 [主要] ProjectDetail 加载态纯文本→共享 `LoadingState`（与 WorkspaceView 用法一致）。
- 6 [次要] PresetBar 预设 pill 补 `aria-pressed`：active→true、partial→"mixed"（三态开关语义）、其余 false；激活态文字/图标沿用第2轮 muted+brand 收敛，未再改。
- 7 [次要] ProjectAgentDots/SyncDots（两文件同步修改，未提取共用子组件——数据推导半边不同且新建共享文件超出本轮文件范围，渲染半边已逐行对齐）：可交互点改 24×24 热区（button 外壳 `h-6 w-6 -m-1`，视觉尺寸 16/18px 不变，布局足迹不变）；缩写文字 8/9px→11px、删 `tracking-tight` 负字距、按 typography 规则给全大写加 `tracking-[0.06em]`；stateTitle 与「+N more agents」英文硬编码改中文字符串（i18n 资源文件不在本轮文件范围内，沿用页面硬编码中文豁免口径，代码内已注释注明）。
- 8 [次要] Workbench.module.css `.projectCard` 的 `150ms cubic-bezier(.23,1,.32,1)`→`var(--ds-duration-exit) var(--ds-ease-out)`；Workbench.tsx 三处 `↗`（:295/:398 及同类的 :846「打开设置」）改 lucide `ArrowUpRight size={13} aria-hidden`，:635 `＋` 改 lucide `Plus size={14} aria-hidden`。
- 9 [次要] 整卡 div onClick 键盘化（选改动小的方案，保留 div 结构）：WorkspaceView `WorkspaceSkillCard` 两种视图与 ProjectDetail 网格/列表卡片均补 `role="button" tabIndex={0}` 与 Enter/Space 处理，`event.target !== event.currentTarget` 守卫避免嵌套标题按钮/操作按钮触发时重复激活；ProjectDetail 列表行 hover 操作组顺手补 `group-focus-within:opacity-100`（与 WorkspaceView 列表行既有口径一致，键盘聚焦可见）。另 WorkspaceView 文档 tab pill 顺手补 `aria-pressed`（与 ProjectDetail 同款 pill 对齐）。
- 范围外不做：页面硬编码中文 i18n 重构（豁免，沿用第3轮约定）；`.wb-search input` 的 `outline:0 !important`（workbench.css 属共享层，仅记录）；Workbench.tsx:441 `.wb-danger` 已由第2轮桥接 token，未改；TaskOutput.tsx、PresetManager.tsx、PresetIconPicker.tsx 及各自 module.css 检查后无本轮工作单项，未改。

**checks**

- `npx tsc -b` 通过（exit 0）；`npx eslint` 本轮全部 10 个 tsx（WorkspaceView/ProjectDetail/Workbench/TaskOutput/AgentToggleSection/PresetBar/PresetManager/PresetIconPicker/ProjectAgentDots/SyncDots）通过（0 errors）。未跑全仓 build（并行 agent 同时工作，主 agent 统一回归）。
- Grep 自查（本区域 3 视图 + 7 组件及 module.css）：`text-white`、`bg-accent-hover` 清零；Tailwind 色相类（emerald/amber/red/sky/violet 等带数字色阶）清零；hex 字面量仅剩注释中的 issue 编号（#287/#400）；`↗`/`＋` 字符与手抄 cubic-bezier/`150ms` 清零。
- 依赖第2轮 token（`--ds-on-accent`、`--ds-warning(-bg)`、`--ds-success`、`--ds-danger(-bg)`、`--ds-duration-exit`、`--ds-ease-out`）均以 var() 消费；合并后需一次明/暗主题目视走查，重点：激活 pill 暗色对比、卡片 36px iconOnly 按钮的页脚排布、点阵 24px 热区在 2px 间距下的相邻命中重叠（设计折衷，视觉不变）、danger-ghost 删除按钮在卡片页脚的视觉权重、ds-view-toggle 与 36px 刷新按钮的高度混排。

### 第4轮-B：设置、备份与对话框

**changes（工作单 1-8）**

- 1 [主要] 共享 Button 失效覆盖类清理（Settings/Backup 全区域）：Settings.tsx 原 :1485（添加工具提交）、:2224/:2252（安装更新/下载）确认 `variant="primary"` 并删 `bg-accent text-white border-accent` 冗余类；原 :2176 红色上报按钮改 `variant="danger"`；原 :1339-1371 工具区操作群层级整理——「添加自定义工具」为该区唯一 primary，全部启用/停用/刷新改默认 secondary（`text-accent` 充当主操作的写法清零）；原 :1682-1684 自造 accent 描边「在 Finder 打开」改普通 secondary；原 :1620 emerald 保存按钮、`${actionButtonClass} bg-surface-hover/text-tertiary/text-muted` 系列 15 处追加覆盖类全删（均静默失效，视觉零变化）；图标着色只留语义 token：删除键 `hover:text-red-500`→`hover:text-[var(--ds-danger)]`，行内保存勾 `text-emerald-500`→`text-[var(--ds-success)]`，重置 `hover:text-amber-500`→`hover:text-[var(--ds-warning)]`，编辑/浏览的 `text-accent` 保留（语义 token），附带的 dead 间距类（p-0.5/p-1）一并删除。Backup.tsx 设备名保存/重命名两个图标按钮删 dead 类并补 `iconOnly`+`aria-label`（36px 契约）；设备流复制/取消、PAT 提示/切换、历史刷新等 ghost 按钮删 dead className，需要小尺寸的补 `size="sm"`。
- 2 [主要] Settings.tsx 状态徽章语义化（原 :1066-1087）：自定义工具 sky→`--ds-info-bg`+info 55% 混 strong 文字、项目目录支持 emerald→`--ds-success-bg`+success 55% 混 strong、路径已覆盖 amber→`--ds-warning-bg`+warning 55% 混 strong（小字号文字用 color-mix 向 `--ds-strong` 加深保 4.5:1，暗色下混色方向自动变亮，两主题对比同向改善）。
- 3 [主要] Backup.tsx 状态系统去硬编码：statusMeta 失败/需修复（red）→danger 组、待同步（amber）→warning 组、已同步（emerald）→success 组（边框均 color-mix 35-40%）；重连按钮（amber 自造）改默认 secondary、修复按钮（red 自造）与删除远端仓库按钮改 `variant="danger-ghost"`；冲突面板/计数 chip/体积警告（amber）→warning 组、GitHub 错误条/删除远端面板（red）→danger 组、范围勾选勾（emerald）→success token；三个冲突解决按钮与版本恢复按钮（ghost+全套 border/px/py 失效类）改默认 secondary `size="sm"`。
- 4 [主要] diff 配色：DocumentDiffViewer.module.css 的 `.viewer` 新增 `--diff-remove-ink(-soft)`（danger 30%/55% 混 strong）与 `--diff-add-ink(-soft)`（brand 32%/60% 混 strong），cellTone 的 red-950/emerald-950 等文字色改消费 ink var，marker 用 `var(--ds-danger)`/`var(--ds-brand)` 全值（与既有 inset 边条同族），`dark:` 双写清零；SkillSourceDiffViewer STATUS_TONE 的 emerald/red/sky 三态改 success/danger/info 语义组（border color-mix 40% + `-bg` + 文字按需混 strong）。
- 5 [主要] BatchTagDialog chip：标记移除态 `bg-red-500/15 text-red-500` 与 hover→danger 组；待添加 chip emerald→success 组（文字 55% 混 strong），X 的 hover 深绿类删除（原生 button 继承 chip 色即可）。
- 6 [次要] CloseActionDialog 补可见「取消」按钮（ghost，置左），checkbox 补 `h-3.5 w-3.5 [accent-color:var(--ds-accent)]`（复用 `.ds-selection-bar input` 的 accent-color 口径）；ConfirmDialog `tone="warning"` 的确认按钮 primary→`danger-ghost`，默认 confirmLabel 在 warning 时由「删除」改 `common.confirm`（已核全部 5 处 warning 调用方——Backup×3、MySkills、WorkspaceView——均显式传 confirmLabel，默认值仅兜底）；CommandPalette 中文组标签去 `font-mono uppercase tracking-[0.12em]`，改 `text-[12px] font-medium text-faint`（CJK 无大写/字距语义）；GitSetupDialog 缺远端提示条 amber→warning 组。
- 7 [单行例外] DetailSheet.tsx 关闭按钮 `aria-label="关闭详情"`→`t("common.close")`（i18n 三语言已有该 key，组件补 useTranslation）；design-system.css `.ds-dialog-title` 22px→20px（仅此一行，与 DetailSheet 标题统一）。
- 8 [i18n 漏网] 豁免并记录（i18n 资源文件不在本轮文件范围，无可复用 key 的不新造）：Settings.tsx:1279 `aria-label="设置分类"`、:1312「正在读取设置…」、:1318「重新读取」、:1710 同步模式说明句；RunnerSettings.tsx 全文硬编码中文；CommandPalette.tsx:308 标题/描述「快速查找…」、:328 `aria-label="查找结果"`；Backup.tsx:1269 Disclosure「备份设置与连接管理」；BatchTagDialog.tsx:181 `aria-label="建议标签"`。

**checks**

- `npx tsc -b` 通过（exit 0）；`npx eslint` 本轮全部 10 个改动 tsx（Settings/Backup/DocumentDiffViewer/SkillSourceDiffViewer/BatchTagDialog/ConfirmDialog/CloseActionDialog/CommandPalette/GitSetupDialog/DetailSheet）通过（0 errors）。未跑全仓 build（并行 agent 同时工作，主 agent 统一回归）。
- Grep 自查（本区域 2 视图 + 15 组件及 module.css）：Tailwind 色相类（带数字色阶）清零、`text-white` 清零；共享 Button 上不再有色相/间距覆盖类（残留 className 仅 `actionButtonClass`/`ds-button` 契约类与语义 token 图标着色）。
- 依赖第2轮 token（`--ds-warning(-bg)`、`--ds-success(-bg)`、`--ds-info(-bg)`、`--ds-danger(-bg)`、`--ds-on-accent`）均以 var()/color-mix 消费；合并后需一次明/暗主题目视走查，重点：Backup 状态卡四态（danger/warning/success/中性）、冲突面板与 warning 小字（55% 混 strong）的实际对比、diff 增删行 ink 色与 `--diff-*-bg` 的搭配、danger-ghost 按钮在状态卡/危险区中的视觉权重、设置页工具区唯一 primary 的层级感受。

## 第5轮：最终回归与复核

**复核方式**：一个独立 explore agent 只读交叉复核——逐条对照第1轮工作单在当前代码中取证（不凭文档采信），外加全仓兜底 Grep。

**复核结论**：第1轮工作单 1-25 全部验证为「已修复」或「已豁免且文档有记录」，无漏项；页面级抽查覆盖各区域全部 [阻断] 与 [主要] 条目及 10+ 次要条目，均与代码现状吻合。全仓兜底：`#059669`/`#aab5ff`/`#8797ee`/`#b85858`、Tailwind 色相类（含 indigo/fuchsia）、emoji 功能图标、module.css 中 6 位 hex 均零命中。

**复核后收尾（主 agent）**：
- 复核发现 `src/index.css` 死类 `.app-button-primary`（含 `text-white`，全仓 tsx 零消费）——已删除该规则；保留有消费的 `.app-button-secondary`/`.app-segmented*`。
- 删除文档两处过期「（进行中）」标记。
- 复核另记两处 640px 断点（Backup.module.css:10、InstallSkills.module.css:17-18）不在第1轮工作单内，列为已知次要不一致（豁免记录于此）。

**checks**：
- `npm run lint` 通过（exit 0）；`npm run build` 通过（exit 0，仅既存 chunk >500kB 警告）。
- 收尾改动（index.css 死类删除）后复跑 lint/build 见下方「最终验证」。

## 最终报告

**覆盖（实际验证过）**
- 五区审计覆盖 src/ 全部视图与共享组件（60+ 文件）：共享基座、首页/索引、技能库/发现、工作区/项目、设置/备份/对话框。
- 修复验证：`npx tsc -b`、分区 ESLint、全仓 `npm run lint`、`npm run build`、逐条 Grep 取证、独立 agent 交叉复核。
- token 体系：`--color-*`/`--wb-*` 全部映射 `--ds-*`，新增 warning/success/info/danger-bg/shadow/scrim 语义 token（明暗双值 + prefers-color-scheme 回退）；无第二套 token。
- 组件契约：Button（14px/36px iconOnly/disabled token 组/spinner 60 次封顶/size=sm/danger-ghost）、StatusBanner（去 P0 形状）、native select、原生 dialog、Disclosure、LoadingState、ds-view-toggle、链接契约、焦点契约全部对齐上游。

**未覆盖 / 豁免（逐条已记录）**
- 桌面运行目视走查未做（无显示环境）：暗色对比实测、键盘 Tab 走查、断点换行观感——各轮 checks 均列出需桌面确认的重点清单。
- i18n 重构豁免：页面硬编码中文与漏网点（Settings/RunnerSettings/CommandPalette/Backup/BatchTagDialog 等）逐条记录于第3/4轮豁免节。
- font-mono 保留 Tailwind 默认（无 `--ds-mono` token）；`.wb-search input` 的 `outline:0 !important`（旧有行为）；`.wb-console` 恒深色（产品决定，已记录 docs/design/README.md）；点阵两文件不合并（数据推导不同）；MySkills 右键菜单坐标未使用；textScale 双重缩放待实测；Backup/InstallSkills 两处 640px 断点。
- i18n json 中 `sidebar.dashboard` 等无消费翻译键保留（无害）。

**约束遵守**：未删除任何可达功能（删除的 Sidebar/Dashboard/AgentControlSetupCard/InstallToast 均为零引用死代码）；未重置用户配置或技能数据；`docs/design/upstream/` 快照零改动。
