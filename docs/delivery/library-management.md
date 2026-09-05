# 技能维护与目录交付审查

依据：根/src AGENTS、SOURCE-DISCOVERY、设计README、DESIGN、craft typography/color/accessibility/state-coverage/form-validation，来源控件 Button 与公共 Disclosure/DetailSheet。范围包含 MySkills、WorkspaceView、SkillDetailPanel、SkillProjectsSection、SkillPickerRow、AddSkillsSheet，以及两种差异阅读器。

## 操作清单与处理

| 入口 | 状态/风险审查 | 本轮处理与保留 |
|---|---|---|
| 维护搜索、状态/来源/标签筛选 | 空库与筛选无结果区分；名称可读 | 搜索有显式无障碍名称；筛选增加pressed；现有组合筛选保留；空结果清除筛选保留 |
| 网格/列表 | 选中、键盘、窄窗口 | 模式标签与pressed，平面卡片/CSS Module，标题原生按钮，行内内容可换行 |
| 拖动排序 | 只在允许条件可拖，拖动与点击冲突 | 保留DndKit传感器及已有禁用判定，无改数据排序接口；未原生实测拖动 |
| 多选、全选、取消 | 全选作用于当前筛选，操作反馈 | 原有选择逻辑和批量操作面板保留 |
| 单个/批量检查更新 | 忙碌、错误、刷新失败 | 检查全部加重复调用guard；刷新失败也解除checking状态；原toast保留 |
| 单个/批量更新、来源重新定位/分离 | 本地修改/删除确认、部分成功 | 原有pendingRemoval批准机制保留；批量更新加guard、finally必解锁；保留成功/无变化/保留/失败分项反馈 |
| 单个预设启停 | API失败原本可成为未捕获拒绝 | 增加异常反馈与提交锁；保留原预设归属逻辑 |
| 批量预设启停 | 逐项容错、成功/失败计数 | 增加批量提交锁及finally解除；保留逐项捕获与计数；未在本轮真实更改多工具启用配置 |
| 新增/移除标签 | 快速重复保存、保留输入 | 增加保存锁、输入禁用、移除按钮可读名称；失败保留输入 |
| 标签重命名/删除、标签菜单 | 原右键菜单无焦点约束，键盘发现性差 | 每个筛选标签旁增加共享CardActionMenu；保留右键入口但打开共享compact DetailSheet；确认与命名弹窗复用公共实现 |
| 标签建议 | 原生按钮选择、输入Enter/blur提交 | 保留原按钮列表与输入提交方式；不是ARIA combobox，不声称方向键建议导航 |
| 技能详情中文/本地/来源/差异 | 默认中文、请求失败无法重试 | 保留中文优先；原文/来源/差异增加重试；差异保持懒加载；共用LoadingState提供慢反馈 |
| 来源元数据折叠 | 立即卸载无退出动效 | 使用公共Disclosure，继承grid-rows与减少动画规则 |
| 详情工具开关 | 全局未安装/禁用工具不可开 | 保留AgentToggleSection公共控件与可用性判定；该共享组件由主任务负责 |
| 详情项目引用 | 初始加载、目录冲突、不可用工具、扫描失败 | 扫描错误行内显示并提供重试；写入期间锁其他目标避免并发覆盖状态 |
| 详情移除引用 | 已安装按钮原为无说明即删除 | 增加共享ConfirmDialog，明确项目/工具/技能和全局保留；失败仍留确认框 |
| 工具目录总览/返回 | 空工具、真实扫描数 | PageHeader及CSS Module；无工具提供设置入口，工具详情返回全部工具 |
| 工具目录搜索/标签/视图 | 空目录、无匹配、加载失败原混为空 | 显式搜索名称、网格/列表pressed、无匹配清除；扫描失败独立错误与重试；LoadingState慢反馈 |
| 工具技能阅读/本地-中心差异 | 模态焦点与键盘阅读 | 共享DetailSheet；技能标题原生按钮，内容与差异原有流程保留 |
| 工具上推/拉取/移除 | 忙碌、覆盖确认、失败 | 原确认逻辑与toast保留；任一目录动作忙碌时禁用其他同步/删除入口 |
| 从库添加：目标/搜索/来源/标签 | 原自制抽屉无模态焦点，背景Escape监听干扰嵌套 | 迁为共享DetailSheet，删除页面级Escape和遮罩实现，关闭/焦点/进入退出走公共组件 |
| 从库添加：选择、批量提交 | 原div模拟选择，忙碌仍能改选择；部分失败清空全部选择 | 原生checkbox及label；整个fieldset忙碌禁用；只移除成功选择、失败留待重试；逐项错误行内可读 |
| 项目添加模式 | 发现legacy export读取sync_mode可能复制 | 已向主任务报告后端不变量缺口；本范围不改后端，不将页面文案当作软链接已验证证据 |
| 差异阅读两侧与文件列表 | 明暗主题硬编码浅底造成低对比 | DocumentDiffViewer改用随主题token混色背景；左右表格caption标识原文/更新与增删符号；文件级原有文本状态保留 |

## 动效与样式

页面独有布局位于CSS Module，未修改来源快照。模态复用DetailSheet、按钮复用Button、来源折叠复用Disclosure、慢加载复用LoadingState。全页点阵仍由公共Layout处理，未新增页面鼠标监听。差异不再使用硬编码浅色背景；它仍使用语义增删文字颜色。旧预设栏、批量面板、工具开关、菜单公共组件由主任务统一负责。

## 验证边界

本分工最终8个TSX定向ESLint、`npx tsc -b`均退出0，`git diff --check`通过；主任务之后的共享组件变更需其最终合并验证。没有在用户真实技能目录写入数据、没有执行联网更新或备份、没有自行宣称原生鼠标/键盘/动效已验收。需要主任务在隔离目录覆盖：筛选与列表切换、菜单键盘、复选框空格、多目标部分失败重试、项目链接/移除、工具同步确认、差异明暗主题、慢请求和减少动画。源代码审查通过不等于这些运行场景通过。

## 原生验收反馈修复：排序容器吞并操作语义

主任务原生AX检查发现维护卡片仅暴露一个sortable按钮，内部标题、菜单、开关不可分别到达。定位为MySkills内SortableSkillItem将useSortable的role/button/tabIndex等attributes放在整个卡片外层，而listeners位于无语义div把手。

已将attributes与listeners集中绑定到独立原生button拖拽把手，卡片外层恢复普通div；把手有技能名、至少24px目标及focus-visible显示，保留activatorRef、KeyboardSensor与sortableKeyboardCoordinates。定向ESLint、TypeScript、差异检查通过；修复后的AX与键盘排序待主任务原生复验。WorkspaceSkillCard无此外层DnD角色，未作无关变更。
