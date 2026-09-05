# 中文问答首页交付验证（2026-09-05）

本记录对应用户将默认首页改为中央技能目录问答的最新要求，补充此前全站设计验收，不改写历史结果。

## 本次交付

- `/` 为 OpenDesign HomeHero 风格的问答框，继续使用共享设计 token、页面壳层及鼠标点阵动效。
- `/library` 保留全局技能列表和详情，旧 `/?skill=…` 地址重定向；侧栏、快捷查找、项目和维护页入口已调整。
- Tauri 读取实际 `central_repo::skills_dir()`，调用随应用打包的 Node / zvec-grep 0.2.1；不要求用户全局安装 zg。
- Markdown 缓存镜像、Zvec 索引与本地 multilingual-e5-small 模型位于技能目录外。查询自动同步文档增删改。
- 检索最多返回 8 条映射到真实技能记录的来源。中文回答使用现有 Codex CLI，按来源序号引用；回答失败保留检索结果。
- 检索进程串行处理，超时、取消与应用退出均清理进程树。

## 已执行

1. `npm run lint`、`npm run build` 通过。构建仍提示既有前端大 chunk 与 Browserslist 数据更新建议。
2. 真实 Zvec / ONNX 隔离烟测通过：中文网页设计问题命中英文网页技能；中文 SQL 优化问题命中英文数据库技能；不变文档 mtime 保留；新增、修改、删除同步；隐藏、超大、软链接文档过滤；源目录未生成 `.zvec-grep`。脚本 `search-runtime/smoke.mjs`，证据 `/tmp/skills-zvec-smoke/smoke-results.json`。
3. 新增 Rust 检索协议、路径边界、回答参数、提示资料封装及进程树清理共 8 项测试通过。检索进程树清理由独立临时进程验证。
4. 打包后的 debug macOS 应用在 `SKILLHARBOR_SANDBOX_DIR=/tmp/skillharbor-e2e/home` 启动，首页显示实际隔离中央目录；点击建立索引成功，显示 3 个文件就绪。
5. 首页输入“我想检查项目的 README，并用中文了解它的用途，有哪些技能可以用？”并用 Cmd+Enter 提交。真实检索返回 8 个片段，真实 CLI 生成中文回答，引用 readme-check 与 delivery-check 的路径和行号。
6. 从来源点击“链接到项目”，选择隔离 demo-project / Codex，显示“软链接已就绪”。文件系统确认 `.codex/skills/readme-check` 是指向中央技能目录的软链接。
7. 点击来源技能名进入 `/library?skill=…` 并打开正确技能的中文用法面板。
8. 实际检查首页截图：居中输入区、目录条、索引状态、折叠详情和侧栏正常，沿用已有灰阶样式及共享动效。

9. 最终 `npm run workbench:build` 成功；release 应用 `codesign --verify --deep --strict` 通过。最终包内 Node/Zvec/本地模型再次完成中文检索，安装包最低系统字段为 13.5。产物：`src-tauri/target/release/bundle/macos/SkillHarbor.app`。采用本地 ad-hoc 签名，未进行 Developer ID 公证。

## 使用与验证边界

首次索引需要下载约 144 MiB 的模型缓存；本地嵌入不上传技能源内容。中文回答通过用户配置的 Codex CLI，仍依赖登录及模型服务，不属于完全离线推理。安装包最低 macOS 版本已按 Node 二进制要求修正为 13.5（ONNX 要求 13.3）。仅验证本机 macOS arm64 / Node 24；其他平台需要各自的原生依赖构建与验收。本次没有改写真实用户技能或项目数据。
