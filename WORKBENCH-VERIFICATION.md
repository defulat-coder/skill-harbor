# 技能港交付验收

验收日期：2026-09-05。平台：macOS Apple Silicon。

## 交付目标与实现

根据目标修正，交付以全局技能库为中心的个人技能管理平台：默认查看全局技能，点击阅读中文用法/原文，再将技能通过软链接加入项目。项目保存引用，全局统一维护源文件。本地 CLI 运行是辅助能力。

保留 React + TypeScript + Vite 前端、Tauri 2 + Rust 桌面后端、SQLite 数据库和原 Git/技能同步机制。新增工作台导航、项目配置向导、中文说明缓存、市场中文辅助、CLI 任务管理。项目部署、中文说明、运行器与 UI 分工并行实现，最后统一集成和验收。

## 全局技能优先修正

- 首页为全局技能列表，默认展示所有中央库技能，不受项目或套装筛选。
- 详情提供中文用法、原文和“软链接到项目”，可选择项目及工具。
- 项目列表迁移到 `/projects`；创建/添加向导去掉副本选项。
- 项目软链接后端不再静默退化为复制；失败保留错误，已有同名内容不覆盖。
- 已有副本与旧高级维护能力保留兼容，不自动改写用户数据。
- 本次前端构建、ESLint、7 项项目部署回归测试通过。
- 实际启动修正版，首页显示全局技能与中文说明；从首页为新建的 `global-first-project` 添加技能成功，文件系统确认 `.codex/skills/project-note` 是指向中央库的软链接。也验证了重复链接不会覆盖已有内容。

## 原版首轮自动验证

| 验证 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 481 项通过，0 失败 |
| 开发版 macOS App 打包 | 通过，已实际启动并进行界面验收 |
| `npm run workbench:build` 发布版打包 | 通过，产出 Apple Silicon macOS App |

新增测试覆盖：项目目录与重复导入、链接/副本、已有文件冲突、部分成功、路径越界；中文说明源文变化、项目副本作用域、人工修订基准；CLI 参数与工作目录、模型选择、运行失败、重复启动限制、取消进程树、嵌套技能绑定和旧记录兼容。

完整测试日志：`/tmp/skillharbor-final-tests.log`。

## 真实端到端验证

应用数据隔离在 `/tmp/skillharbor-e2e/home`；项目在 `/tmp/skillharbor-e2e/demo-project`。未对用户已有项目批量部署技能。

1. 从界面输入本地路径，导入英文 `project-note/SKILL.md`，成功加入技能库。
2. 从新建项目向导创建 `demo-project`，选择 Codex 和链接方式。实际 `.codex/skills/project-note` 符号链接指向中央技能源，数据库保留项目与绑定记录。
3. 项目页从实际技能文件生成中文说明，展示用途、准备、中文示例和注意事项。通过编辑器保存个人中文用法，显示“人工修订”。
4. 从“用技能开始任务”提交中文任务，真实 Codex CLI 读取项目技能并生成 `PROJECT_NOTE.md`；文件内容为“这是用于验证技能港的测试项目”。运行记录状态 `completed`，退出码 0，使用模型 `gpt-5.6-sol`。运行 ID：`017f7e50-fe70-4a54-a7b4-ce19663596a1`。
5. 已验证失败任务能保留错误与日志：本机 CLI 0.144.1 不支持当前全局配置的 `gpt-6-astra`。在工作台设置单独指定可用模型后成功，不修改全局配置。
6. 重新启动打包应用后，项目、技能绑定与历史仍然可读。
7. 从项目进入市场，安装目标自动选择该项目；点击 `find-skills` 的中文预览，从公开 GitHub 原文生成并显示中文说明。预览不安装技能。
8. 实际检查了浅色和深色主题，修复暗色背景文字对比度问题。
9. 输入“前端设计”，中文转检索词得到 `frontend design`，实际市场返回对应技能结果。

发布版应用：`src-tauri/target/release/bundle/macos/SkillHarbor.app`。构建日志：`/tmp/skillharbor-release.log`。构建后补做本机 ad-hoc 签名，`codesign --verify --deep --strict` 验证通过。当前展示的开发版使用隔离验收数据；发布版默认读取本机中央技能库。

## 交付范围

当前本地任务执行器为 Codex CLI；其他工具沿用应用既有的技能部署能力。此版本未提供其他 CLI 执行适配器、内嵌交互式终端和会话续接。

中文生成和 CLI 模型运行可能联网，需要可用的 Codex 登录与模型。中文说明保留原文并允许人工修订。市场中文预览支持公开 GitHub 来源，未对所有市场仓库逐一验收。

Windows/Linux 尚未实际打包验收。本地 macOS 构建不是经过 Apple 公证的公开发行安装包。任务与中文缓存属于本机数据，不随原有技能 Git 备份自动恢复。异常崩溃后的残留 CLI 进程需人工检查；正常取消和退出会终止受管理进程树。

启动、打包和数据路径说明见 [WORKBENCH.md](WORKBENCH.md)。

## 2026-09-05 源码设计重构验收

按 OpenDesign 源码和其 impeccable-design-polish 技能完成前端重构，设计依据见 DESIGN.md，实际视觉与交互记录见 design-qa.md。新增全局库列表/网格、搜索筛选、批量软链接及分类设置。本轮通过界面导入第二个 readme-check 技能，批量链接2个技能到 demo-project，文件系统确认均为真实符号链接；中文/原文切换、空搜索、主题切换与重启偏好正常。当前构建日志为 `/tmp/skill-source-design-release.log` 和 `/tmp/skill-source-design-debug.log`；当前 lint 日志为 `/tmp/skill-source-design-lint.log`。此前CLI与后端验收属于前一轮，本轮未重复产生任务调用。

本轮发布版构建完成后已重新执行本机 ad-hoc 签名；`codesign --verify --deep --strict` 返回退出码0。

## 基于迁入规约的整站重设计交付

主要页面与常用弹窗迁入公共标题/按钮/原生模态组件；独有布局使用CSS Modules。实际页面及软链接回归记录见design-qa.md最新章节。最终发布版日志为/tmp/workbench-system-release.log，TypeScript/Vite及ESLint通过；发布包重新执行ad-hoc签名，codesign --verify --deep --strict退出码0。
