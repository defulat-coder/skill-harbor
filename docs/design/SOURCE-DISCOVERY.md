# 原项目设计规则探索结果

参考目录：`/Users/xbjt/Documents/myself/open-design`。搜索包含隐藏目录，覆盖命名变体、规则文件以及 AGENTS 的引用。以下结论针对当前本地源码。

| 文件/位置 | 实际作用 | 本项目迁入方式 |
| --- | --- | --- |
| 根 CLAUDE.md | 内容只有 `@AGENTS.md`，让 Claude 读取统一规则 | 根 CLAUDE.md 使用相同入口；原文也保存到 upstream |
| 根 AGENTS.md | 全仓库开发规则，其中 Web CSS ownership、Web component reuse、UI animation philosophy 直接约束应用界面 | 三章逐字保存在 OPEN-DESIGN-RULES.md；src/AGENTS.md 作路径适配并生效 |
| apps/AGENTS.md | 应用工程边界和命令，未发现另一套界面设计章程 | 保留来源参考，不套用其工程命令 |
| packages/AGENTS.md | 规定公共 React 控件与业务布局分离 | 原文保留，组件边界适配进入 src/AGENTS.md |
| craft/*.md | 字体、色彩、层级、动效、表单、状态、可访问性、RTL、UX等通用指导 | 已完整保留，前端规则按场景指向它们 |
| skills/impeccable-design-polish/SKILL.md | 设计审查与打磨流程 | 已保存原文，作为可选工作方法 |
| design-systems/*/DESIGN.md | 用户可选的品牌/风格包，作用于生成作品 | 不批量设为工作台约束；保存其 README 以说明用途 |
| .claude/skills/od-contribute、docs/design-systems.md | 贡献流程、品牌包格式与校验 | 属于设计内容包创作规则，不是应用界面规范 |
| apps/web/src/styles、packages/components/src | 实际设计 token 和共享控件，是规约对应的实现证据 | 上一轮已保留源码快照 |

根目录未发现 DESIGN.md，也未发现名为 Cloud.md/CLOUD.md 或 Agent.md/AGENT.md 的独立规则文件；实际名称是 CLAUDE.md 和 AGENTS.md。组件 Theater 下还有局部 AGENTS.md，适用场景是原产品 Theater，不是全局界面设计入口。

本项目已有 DESIGN.md 是针对技能平台编写的映射方案，不是从原项目根目录复制而来。OPEN-DESIGN-RULES.md 明确保存原文，src/AGENTS.md 明确列出适配，避免把新编写的建议说成原项目规则。

本轮只迁入规则文件和读取关系，不把文档复制声称为全部现有页面已符合每条规则。
