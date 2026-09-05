# OpenDesign 设计规约 · 本项目执行入口

用户要求系统迁移 OpenDesign 的设计规约和交互逻辑。此目录是持续执行的设计依据，不是一次性截图参考。产品目标为：在问答首页查找当前中央技能目录，或直接浏览全局库 → 中文阅读 → 项目软链接。最新首页决定见 [SEARCH-HOME.md](SEARCH-HOME.md)。

## 原文规则入口

- [探索结果](SOURCE-DISCOVERY.md)：哪些是原应用自身规约、哪些是生成作品用的品牌包。
- [原文设计章节](OPEN-DESIGN-RULES.md)：根 AGENTS.md 的三个界面章节逐字摘录。
- [前端适配规则](../../src/AGENTS.md)：本项目中应执行的目录与控件映射。
- 根 CLAUDE.md 与原项目一样通过 `@AGENTS.md` 读取统一约定。

## 来源与优先级

1. 用户明确要求优先。本项目明确采用全页面鼠标点阵，覆盖源项目的“仅首页 hero”限制。
2. 本文件和根 DESIGN.md 负责产品映射、执行范围和有理由的差异。
3. `upstream/` 保留参考源码中的完整原文：craft 全部规则、tokens/布局/材质/动效/控件、共享组件和设置、鼠标动效。manifest.json 记录源提交与每个文件的 SHA-256；保留来源文件，不直接修改快照。
4. craft 是通用指导；应用实际 token 是品牌事实。冲突时以应用源码为准，例如通用 craft 建议浅灰底，实际 OpenDesign 用白底。

`upstream/AGENTS.md` 与 `upstream/apps/AGENTS.md` 是来源证据，里面的 pnpm、Electron、daemon 和发布指令适用于原仓库。本项目执行 npm/Vite/Tauri 的命令，不能把原仓库工程架构当成视觉迁移的一部分。

## 必须继承的规则

| 维度 | 本项目约束 | 来源 |
| --- | --- | --- |
| 信息结构 | 公共壳层、折叠导航、页标题、操作区、内容区；问答首页为默认页（`/`），全局技能独立在 `/library` | entry-layout、shell |
| 布局 | 44px 顶栏、236px 侧栏、1080px 内容宽度、4px 间距基准；页面内容独立滚动 | entry-layout、recent-projects |
| 配色 | 中性灰占主导；单一语义主色；成功/警告/失败按语义；明暗主题使用同一组 token | tokens、color |
| 字体 | Albert Sans + 中文系统回退；中文不压字距；标题、正文、说明、元数据有层级；长中文有阅读行距 | base、typography 三份规则 |
| 控件 | 复用公共控件契约；输入/选择36px；按钮、卡片、对话框圆角有分级；状态不能只靠颜色 | primitives、packages/components |
| 材质 | 内容卡片实色；浮层才使用功能性模糊；减少透明度和不支持滤镜时退回实色；禁止整页大面积 blur | material |
| 动效 | ease-out 为 cubic-bezier(0.23,1,0.32,1)；进入约200ms，退出约140ms；禁止 scale(0) 和 ease-in；优先 opacity/transform；减少动态效果时静态呈现 | animation-discipline、源 AGENTS |
| 鼠标背景 | 所有路由共用一个点阵；间距25、半径203、强度2，弹簧0.08、阻尼0.82；不拦截点击；输入时停止跟随；静止/隐藏时不持续重绘 | AppWashKineticGrid + 用户扩展 |
| 表单 | 明确标签、保留输入、提交中避免重复提交、错误靠近字段或明确展示、可重试；不用 placeholder 替代标签 | form-validation |
| 状态 | 每个数据视图考虑加载、空、筛选无结果、成功、失败、部分成功；不要用假数据填充完成态 | state-coverage |
| 可访问性 | 原生语义、可见焦点、键盘、模态焦点和 Escape、状态播报；文字对比度按规则审核；触摸不依赖悬停 | accessibility-baseline |
| 国际化 | 保留中文阅读体验；路径和命令保持原文；RTL/bidi 原规约完整保存，当前中文界面不据此声明已支持RTL | rtl-and-bidi |
| 认知与文案 | 主动作明确、就近展示相关信息、渐进披露高级配置、实际内容优先、避免无意义装饰 | laws-of-ux、anti-ai-slop |

## 执行位置与迁移状态

- `src/design-system.css`：运行时视觉 token、布局、控件及旧页面兼容桥。`--color-*`、`--wb-*` 统一映射到 `--ds-*`，不能再添加并行配色。
- `Layout` / `WorkbenchSidebar`：所有注册页面的公共壳层。
- `PointerKineticGrid`：全局动效运行时，由源实现适配；不在各页面复制监听器。
- `DetailSheet` / `SkillLinkDialog`：模态阅读和统一项目链接流程。
- `SearchIndex`：独立索引管理页面（`/search-index`），应用共享构建状态，侧栏及首页均可进入。
- `SearchHome`：HomeHero 居中问答，当前中央技能目录索引/混合检索，保留出处的中文回答；边界见 SEARCH-HOME.md。
- `GlobalSkills`：`/library` 全局浏览、筛选、多选与阅读。
- `Settings`：分类导航、切换不丢输入。
- 市场、维护、工具目录、备份、项目高级页：接入共享壳层和token，保留现有业务控件。本轮已按 docs/delivery/inventory.md 对可达操作逐项审查，消费本项目公共控件；不能据此宣称逐个复制了既有全部业务逻辑。
- 原组件源码快照保留在 upstream/packages/components；运行时采用本项目的 components/ui/Button、PageHeader 和组件旁 CSS Module。DetailSheet 负责统一模态层；各主要页面和常用弹窗已消费共享组件，复杂业务内部仍保留必要的原生控件。

## 每次前端修改的工作流

先读本文件与相关 craft；从快照找到对应行为/组件，再修改共享实现并消费它。新增差异必须在本文件说明产品原因。不要在页面底部叠加一次性样式补丁。

完成后执行 `npm run lint`、`npm run build`；界面验证覆盖受影响页面及共享组件至少两个使用位置。交互涉及数据时使用隔离测试目录。验收记录写入 design-qa.md，明确已检查和未检查场景。

更新参考时比较 manifest 的文件哈希，先审查规则变化，再更新运行时映射和快照。不自动覆盖本项目产品流程。

## 本轮完整交付索引

目标与分工见 [完整交付目标](../delivery/GOAL.md)，逐项功能盘点见 [inventory.md](../delivery/inventory.md)，实际桌面流程、检查结果和外部服务边界见 [verification.md](../delivery/verification.md)。

最新简化规则与五轮复审见 [五轮目标](../delivery/impeccable-five-rounds/GOAL.md) 和 [执行记录](../delivery/impeccable-five-rounds/ROUNDS.md)。保留原有功能，以单一主要动作、按需管理和连续任务流程作为约束。
