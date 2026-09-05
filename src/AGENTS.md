# 前端设计规则

继承根 AGENTS.md。此文件把 OpenDesign 根 AGENTS.md 的三个界面章节映射到本项目路径。逐字原文在 `../docs/design/OPEN-DESIGN-RULES.md`，通用规则在 `../docs/design/upstream/craft/`。

## CSS 归属（来自 Web CSS ownership）

- 共享全局 CSS 只负责设计 token、基础规则、公共控件、应用壳层及暂不能安全隔离的旧选择器。本项目现有入口为 design-system.css；不要新增第二套 token。
- 新组件独有样式默认放在组件旁的 Component.module.css。面板、菜单、抽屉、工具栏、卡片、表单局部样式不继续扩大全局文件。
- 修改旧组件时，如果迁移量小且可验证，可以将局部选择器一起转为 CSS Module；不要把大规模机械搬迁和行为变化混在一起。
- 全局类只用于明确共享契约：公共控件、主题、第三方内容、跨组件布局和确需级联的选择器。注明归属。
- CSS 重构必须保持导入顺序和级联语义；验证受影响界面。
- 路径适配：原 apps/web/src/index.css 是只含 import 的入口；本项目现存 index.css 含旧样式，不在文档迁移中强制搬动。以后若拆分入口，遵循原规则，不再往入口堆新选择器。

## 公共组件复用（来自 Web component reuse）

- 存在公共组件时先复用，不在页面重新制作按钮、隐藏辅助文本或模态框。
- 缺少控件时，在 components 中增加小而专注的公共控件及配套 CSS Module，再由页面消费；业务流程、项目布局不进入基础控件。
- 内容标记或未被公共组件覆盖的特殊控件保留语义化原生 HTML，不为了统一包装而隐藏浏览器原生行为。
- 原 @open-design/components 在本项目没有安装，不能直接写无效 import；它的源码快照仅作实现参考。本项目已有 DetailSheet、SkillLinkDialog 等应继续复用。
- 原文禁止新建旧原始样式类。本项目现有 ds-* 和旧 app-/wb-* 是兼容契约；新组件避免继续添加一套并行的基础类。

## UI 动效（来自 UI animation philosophy）

- 默认缓出 cubic-bezier(0.23, 1, 0.32, 1)，不用 ease-in。
- 进入约200ms，退出约140ms。
- 折叠区使用 grid-template-rows: 0fr → 1fr，配合透明度和上述缓动；实现为公共组件，避免每页重复。
- 不从 scale(0) 开始，最低从 scale(0.9) 配合 opacity: 0 开始。
- 需要退出动画的条件元素在退出完成前保持挂载，通过类控制状态，避免 React 立即卸载跳过退出动画。
- 配合 craft 的减少动态效果、焦点与键盘规则。本项目用户指定的全页点阵共用 Layout 中的一份实现。

## 按场景阅读原规则

任何视觉修改读 typography、color；带交互读 accessibility-baseline 和 state-coverage；改表单读 form-validation；改动效读 animation-discipline；长文阅读读 typography-hierarchy 与 typography-hierarchy-editorial。其余 craft 按场景应用，不把面向生成作品的品牌包当成工作台自身风格。

## 检查

代码修改运行项目已有 npm run lint、npm run build，并实际检查受影响界面。纯规约文档修改检查来源、链接和差异即可，不需要重新构建应用。
