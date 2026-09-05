<p align="center">
  <img src="assets/icon.png" width="80" />
</p>

<h1 align="center">SkillHarbor 技能港</h1>

<p align="center">
  中文优先的个人技能库：全局统一维护技能 → 中文问答/阅读 → 软链接加入项目。
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

## SkillHarbor 是什么？

SkillHarbor（技能港）是一个桌面应用：把所有 AI Agent 技能集中在一个个人技能库里统一维护，用中文提问找到需要的技能，阅读中文用法或原文，再通过软链接把技能加入项目。项目只管理引用——技能一律软链接，绝不复制。

核心流程：

1. **全局统一维护** — 所有技能集中在一个中央技能库，在「全局技能」（`/library`）页面统一浏览和维护。
2. **中文问答查找** — 默认入口是中文问答首页（`/`），针对当前中央技能目录提问，找到匹配的技能。
3. **阅读并链接** — 打开技能阅读中文用法或原文，然后「链接到项目」，通过软链接引用；项目只管理引用，绝不复制。

## 问答首页

启动后在首页用中文描述需求，例如“哪些技能能帮我检查代码，怎么使用？”。检索范围是应用当前的中央技能目录，以输入框下方路径为准；全局技能列表在「全局技能」入口独立维护。

1. 从侧栏或首页打开「索引管理」，首次点击「建立索引」。本地 `multilingual-e5-small` 模型需要联网下载，完成后显示文件数及索引就绪状态。
2. 输入问题并点击「提问」，或按 Cmd/Ctrl+Enter。页面先列出命中技能、原路径、行号及片段，再整理中文回答。
3. 可打开技能阅读完整说明，或「链接到项目」——项目仍通过软链接引用全局技能。
4. 添加或修改技能后可以在「索引管理」更新索引；查询也会同步文档变更。若中文回答失败，可继续阅读来源并单独重试回答。

索引使用 `@zvec/zvec-grep@0.2.1` 与本地 `multilingual-e5-small` 模型，独立缓存镜像不修改技能源文件。中文回答依赖已配置并登录的 Codex CLI，可能调用在线模型；它和本地检索分别报告失败。检索范围不包含项目源码、Git 仓库或公开市场；市场/Git 安装仍从「发现技能」使用。

开发运行时、文件范围和缓存位置见 [search-runtime/README.md](search-runtime/README.md)；首页设计与来源边界见 [docs/design/SEARCH-HOME.md](docs/design/SEARCH-HOME.md)。

## 既有功能

- **Preset（预设）** — 将技能分组为命名预设，在任意工作区点击预设即可一键为当前 Agent 范围激活或停用其全部技能。
- **全局工作区（Global Workspace）** — 每个 Agent 都有自己的页面，列出其全局目录里的所有技能，始终反映 Agent 实际看到的内容。
- **项目 / 关联工作区** — 管理项目本地技能目录，或将任意目录指定为技能根目录。
- **多种安装方式** — 从市场、Git 仓库、本地目录或 `.zip` / `.skill` 压缩包安装技能。
- **备份与多设备 Git 同步** — 把技能库托管在 Git 仓库里，多台设备连接同一仓库时自动保持一致。
- **更新跟踪** — 为 Git 类技能检查远端更新，本地技能支持重新导入。
- **可被 Agent 驱动的 CLI（`skillharbor-cli`）** — Claude Code、Codex、Cursor 等 Agent 可以通过驱动 CLI 安装、部署、盘点技能，来源、预设和更新追踪都不会丢。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS |
| 桌面 | Tauri 2 |
| 后端 | Rust |
| 存储 | SQLite（`rusqlite`） |
| 国际化 | react-i18next |

## 开发

前置依赖：Node.js 20.19+ 或 22.12+、Rust 1.77.2 或更高，以及当前系统的 [Tauri 依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run lint    # 前端 lint
npm run build   # 前端构建
npm run tauri:dev
```

打包应用：

```bash
npm run workbench:build
```

## License

MIT
