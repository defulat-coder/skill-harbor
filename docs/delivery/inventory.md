# 全功能设计覆盖清单

审计日期：2026-09-05。依据 `src/main.tsx → App.tsx` 的静态 import 可达图、注册路由、页面事件处理器与组件实现。本文件是交付范围和待验收清单，**不是测试通过报告**。各域并行修改可能改变下述初始发现；完成后应由交付验收记录注明证据，不把静态存在当作实机通过。

## 所有页面共同契约

每个数据区域检查：初次加载、刷新、空数据、搜索无结果、错误与重试、成功、部分成功、请求中禁止重复操作。每个控件检查：鼠标、Tab/Enter/Space、可见焦点、禁用原因、文字状态，不能只靠颜色。每个浮层检查：入口、关闭按钮、取消、提交成功、Escape、外部点击、焦点回到触发者、滚动与窄窗口。

动效遵循公共 token：进入约 200ms / 退出约 140ms、ease-out；条件内容退出完成后卸载；折叠使用公共 grid 0fr/1fr；尊重 reduced-motion。点阵所有注册页面只挂载一份，不抢点击/键盘，输入、隐藏和静止时不持续计算。亮/暗主题、长中文、长路径、最小窗口都必须覆盖。外部账户、联网和破坏性分支如未执行须明确写未覆盖。

## 路由与操作矩阵

| 页面 / 注册路由 | 功能与逐项操作 | 主组件 / 特殊状态 |
| --- | --- | --- |
| 全局技能 `/` | 搜索名称/描述/标签；来源/标签筛选；排序；网格/列表；勾选单项/当前结果全选/取消；打开技能；单项/批量链接项目；跳添加/维护 | GlobalSkills、SkillLinkDialog、DetailSheet；多选跨筛选、目标项目/工具缺失、逐项结果、同名冲突不覆盖 |
| 全局技能详情（模态） | 中文/原文切换；中文读取/生成/编辑/取消/保存/重试；原文刷新失败重试；过期提示；人工修订后生成草稿/采用草稿；链接到项目 | ChineseGuide、SkillMarkdown；生成中、原文变更、长 Markdown 表格/代码、嵌套链接弹窗焦点 |
| 项目入口 `/projects` | 新建/导入项目；搜索；打开项目；侧栏新建 `?new=1`；项目列表/空/无结果；应保留项目移除与排序能力 | Workbench、内置项目向导；路径选择/手输、CLI 选择、技能筛选选择、下一步/返回/取消/提交、结果 |
| 项目工作台 `/project/:id` | 技能/运行记录标签；选择技能；搜索；中文/原文；删除引用确认/取消；添加技能；打开高级管理；切换运行记录；开始/刷新/取消 CLI 任务；展开诊断日志 | Workbench、ChineseGuide、TaskOutput；无效项目、无技能、无记录、CLI 缺失、忙碌、失败/取消/完成、部分部署结果 |
| 项目高级 `/project/:id/advanced` | 搜索/状态/标签筛选；刷新；网格/列表；多选/全选；单项/批量移除、启停、更新项目、更新中心、编辑标签；各工具开关；预设启停；打开添加技能；详情原文/中心/差异 | ProjectDetail、AddSkillsSheet、PresetBar、MultiSelectToolbar、BatchTagDialog、AgentToggleSection、ProjectAgentDots、ConfirmDialog、DocumentDiffViewer；本地独有/复制/链接差异、更新冲突、部分成功 |
| 维护与更新 `/my-skills` | 搜索/来源/状态/标签筛选；清空；检查全部/单项更新；应用可用更新；网格/列表；拖拽排序；多选；批量刷新/删除/标签/预设；单项工具/目标启停；来源重连/脱离；新增/删除标签；标签重命名/全局删除；详情与差异 | MySkills、CardActionMenu、SkillDetailPanel、SkillProjectsSection、SkillSourceDiffViewer、SyncDots、ToggleSwitch；更新删除审批、孤立来源、恢复技能、预设视角 |
| 工具目录 `/global-workspace`、`/:agentKey` | 工具总览/选择/返回全部；搜索/标签/无标签筛选；刷新；网格/列表；添加；预设启停；移除托管引用；上传本地到中心；删除本地；拉取中心；详情本地/中心/差异 | WorkspaceView(CODING)、AddSkillsSheet、PresetBar、DocumentDiffViewer、ConfirmDialog；无已装工具、无效 agentKey、托管/非托管/中心不一致 |
| 龙虾目录 `/lobster-workspace`、`/:agentKey` | 同工具目录完整操作；类别须有可发现入口 | WorkspaceView(LOBSTER)，不是另一份页面；初始侧栏缺入口，不可因路由存在称为用户可发现 |
| 发现技能 `/install` 市场 | 榜单全部/趋势/热门；搜索；中文转搜索词；来源筛选/更多来源搜索；分页/加载更多；中文预览/重试；打开来源网址；安装/取消；选择仅入库或目标项目；已安装技能链接项目 | InstallSkills、MarketChinesePreview；网络错、无结果、安装进度/重复/部分成功、翻译 CLI 未配置、预览失败 |
| 发现技能 本地 `/install?tab=local` | 手工绝对路径导入；选择文件夹/文件；批量目录导入；扫描；单个/全部导入发现技能；候选路径展开/切换 | InstallSkills；选择器取消、路径无效、无 SKILL.md、已导入、批量部分失败；所有入口均需 busy 锁 |
| 发现技能 Git | URL 输入；预览/取消；候选全选/取消全选/单选；确认安装；请求进度/取消/失败重试 | InstallSkills 内 Git DetailSheet；无候选、预览过期、多技能仓库、目标链接失败 |
| 备份 `/backup` | 刷新；自动备份开关；设备名编辑/保存/取消；连接/重连；设备码复制/打开/取消；PAT 模式；远程 URL 保存；初始化/克隆；立即备份；冲突保留本地/用远程/两份；版本刷新/恢复确认；恢复重克隆；断开/撤销授权/打开删除远程页面 | Backup、GitSetupDialog、GitRecoveryDialog、ConfirmDialog；无备份、认证超时、连接/同步/冲突/失败、历史无数据；外部授权不可擅自测试 |
| 设置 `/settings` 本地执行 | CLI 路径/模型/运行参数等配置读取、编辑、保存；运行环境说明 | RunnerSettings；校验、保存中、失败重试、不丢草稿 |
| 设置 工具与目录 | 刷新探测；全部启停/单工具启停；排序；展开更多工具；新增/移除自定义工具；全局目录编辑/浏览/保存/取消/重置；项目目录编辑/保存/取消/重置；中心库路径修改/重置/打开；兼容同步方式 | Settings、AgentIcon、ToggleSwitch；路径冲突、确认、探测失败、关闭分类后保留输入；项目普通添加必须仍为软链接 |
| 设置 外观与偏好 | 主题亮/暗/系统；文字大小；语言；窗口关闭方式；托盘开关 | Settings、ThemeContext；系统变化、持久化、读写失败；不修改用户真实偏好验收 |
| 设置 同步与更新 | 代理编辑保存；技能检查频率/更新方式；Git 远程保存/断开；跳备份 | Settings；错误提示、长地址、保存 busy |
| 设置 关于与诊断 | 应用检查更新/下载安装/取消或失败操作；帮助；报告问题；导出日志；崩溃记录处理；GitHub/网站外链 | Settings、HelpDialog；无更新/可更新/下载进度/错误；不得将未执行升级或联网操作标为通过 |

## 共享交互与跨页功能

| 面 | 入口和操作 | 设计/验证重点 |
| --- | --- | --- |
| 应用壳 | 侧栏展开/收起及持久化；Home/面包屑；主/项目/管理导航；跳到主内容；顶栏拖窗；Cmd+, 设置；Cmd+R 刷新 | Layout、WorkbenchSidebar、PointerKineticGrid；隐藏侧栏 inert；刷新失败 StatusBanner；路由焦点/滚动；错误路由状态 |
| 命令面板 | Cmd/Ctrl+K 开关；输入搜索；↑↓定位；Enter执行；点击结果；Escape/外点关闭；技能/预设/项目/操作分组 | CommandPalette；真正模态焦点、combobox/listbox关联、无结果、滚动选中项、快捷键不穿透已开模态、关闭焦点/退出动画 |
| 预设 | 创建/命名/描述/图标；重命名；删除确认；排序；查看预设技能；单项/批量加入移出；项目和工具预设启停 | CreatePresetDialog、RenamePresetDialog、PresetBar、MySkills；空/部分/全应用、批量失败；初始管理入口不可达必须恢复 |
| 菜单 | 卡片更多；维护标签右键菜单；新增标签建议；市场更多来源；项目添加提示 | 统一键盘/focus/outside/退出；边缘定位、防裁剪；与详情弹窗叠层不能被页面 z-index 覆盖 |
| 技能挑选 | 工具目标勾选；隐藏/显示未激活工具；技能/标签/来源筛选；全选；提交 | AddSkillsSheet、SkillPickerRow；初始手工 drawer，需公共模态契约，busy 禁止关闭，部分结果和重试 |
| 差异阅读 | 维护源文件新增/修改/删除、二进制/非文本/权限变化；项目/工具本地与中心文本差异；无变化 | DocumentDiffViewer、SkillSourceDiffViewer；两侧名称/表格语义；+/- 除颜色外区分；中文空态；暗色对比；长行滚动 |
| 帮助 | 设置→帮助；关闭/Escape/外点；长文滚动 | HelpDialog；文案须符合全局库→中文→软链接顺序，不沿用旧预设优先模型 |
| 应用关闭 | 原生窗口关闭事件；询问/退出/隐藏托盘；记住选择；取消 | CloseActionGuard、CloseActionDialog；异步错误/busy；关闭动画与真实退出协调；托盘关闭时退出路径 |
| 首次恢复 | 全新配置触发；URL；恢复；开始新用法/跳过；错误重试 | FirstRunRestoreDialog；仅隔离新目录测试，不能重置真实数据 |
| 公共反馈 | Button、PageHeader、ToggleSwitch、ConfirmDialog、TagRenameDialog、BatchTagDialog、DetailSheet、StatusBanner、sonner Toast | 按钮全部关闭路径、提交busy、错误播报、主题、焦点；portal 浮层与 reduced-motion CSS 范围 |

## 初始不可达旧文件与遗失能力

静态 import 图（以 main.tsx 为根）中不可达：`views/Dashboard.tsx`、`components/Sidebar.tsx`、`AddProjectDialog.tsx`、`AgentControlSetupCard.tsx`、`CreatePresetDialog.tsx`、`RenamePresetDialog.tsx`、`InstallToast.tsx`。这些文件存在不代表产品功能还可用。旧 AddProjectDialog 已有 Workbench 项目向导替代；旧 Dashboard 应保持全局库默认入口而非恢复旧看板。

旧 Sidebar 独占的预设创建/改名/删除/排序、项目移除/排序、龙虾目录导航需由新布局或管理页接续。PresetBar 和 CommandPalette 已消费预设，故不能简单将预设管理当成废弃功能。AgentControlSetupCard 若由设置替代需记录覆盖关系。InstallToast 已被 sonner 调用替代，不需要仅为“全文件”机械复活。

## 初始具体遗漏风险（给域负责人）

1. **共享层**：CommandPalette 是手工 fixed dialog，初始没有焦点约束/退出动画；CardActionMenu 缺 aria-expanded/haspopup 与键盘导航；AddSkillsSheet 是非模态 div drawer。
2. **壳/维护**：恢复预设管理与项目移除/排序；为 lobster 已注册路由提供入口；不要重新挂旧 Sidebar 造成两套导航。
3. **阅读层**：DocumentDiffViewer 硬编码浅色背景却叠 dark 浅色文字；无变化显示英文；应共享语义 diff token 与中文文案。
4. **维护/市场/高级**：MySkills 的标签右键和建议菜单、InstallSkills 更多来源列表、ProjectDetail 的添加提示不消费公共浮层，容易遗漏键盘和退出逻辑。
5. **模态生命周期**：初始 DetailSheet 只有其 dismiss() 播退出；业务取消直接 onClose 或父组件条件卸载跳过退出。必须处理所有关闭来源，不能只验右上角 X。
6. **CSS 层叠**：main.tsx 引 index.css，Layout 引 workbench.css 后 design-system.css，另有模块样式。公共 token 有 --color/--wb 桥，旧 utility 和内联色值仍可覆盖。初始 reduced-motion 选择器 `.ds-shell *,.ds-dialog *` 不覆盖 portal 的 CSS Module dialog（没有 ds-dialog 类）；弹窗内部 spinner 是具体风险。
7. **请求锁**：InstallSkills 手输本地路径按钮初始仅按路径为空禁用，installLocalSource 没有独立 busy 状态；要与文件/目录入口一起防重复导入。
8. **版本验收**：上述为读取时静态发现，可在并行实施中被修复；最终统一复查而非把本清单缺口当作最终未完成结论。

## 交付验收记录要求

以本清单逐行记录“实现检查 / 实际交互 / 未覆盖”，关联隔离目录、构建版本和实际证据。至少有一条完整链路：本地导入 → 全局查找与中文说明 → 两项批量软链接 → 项目阅读 → CLI 输出 → 移除引用但原技能保留。再覆盖共享浮层至少两处、明暗主题、最小窗口、键盘、菜单、设置草稿保留及失败状态。联网备份/升级/首次恢复等不能安全或无条件运行的分支明确列出实际限制。
