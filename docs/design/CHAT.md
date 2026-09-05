# CLI 问答对话（/chat）

用户在首页提问框点"对话提问"后跳转独立对话页，用设置页选定的本机 agent CLI（claude / codex / kimi / opencode / qwen / cursor-agent）发起流式多轮对话。首页原有的"搜索技能"主流程不变，对话是新增的副入口。

## 来源

架构参考 OpenDesign 的 daemon runtime（源仓库快照见 `docs/design/upstream/`，本次另参考了源仓库实际实现并经用户授权）：

- CLI 适配器定义与 argv 组装：`apps/daemon/src/runtimes/defs/*.ts`
- 流式输出解析：`runtimes/claude-stream.ts`、`runtimes/json-event-stream.ts`
- GUI 下 PATH 补全：`packages/platform/src/toolchain.ts` 的 `wellKnownUserToolchainBins()`
- auth 判定：`runtimes/auth.ts`
- 配置界面形态：`upstream/apps/web/src/components/SettingsDialog.tsx` 的 execution 分区

本项目将其移植为 Rust 实现，不引入 Node daemon。

## 产品决策

- **不做会话持久化**（用户明确决定）：多轮对话直接使用 CLI 原生会话能力——claude 由我方铸 UUID 走 `--session-id`/`--resume`（specify 风格），codex 从流里抓 thread id 走 `exec resume`（capture 风格）。会话句柄只存 Rust 内存表与前端内存 store，应用退出即失效，没有历史会话列表。
- **技能库上下文可切换**：首页提问框的"技能库上下文"开关默认开；开启时 `chat_start` 内部先走现有 `skill_search_query` 混合检索，把命中片段按 `skill_search_answer` 的防注入模板拼进 prompt。检索失败降级为不带上下文，不阻塞对话。
- CLI 配置存后端 settings 表：`chat_agent_id`、`chat_agent_models`（JSON）、`chat_agent_env`（JSON，含 API key 等 secret，落盘加密，前端不回显已存值）。

## 实现与数据边界

- 前端：`src/views/ChatView.tsx`、`src/components/chat/`、`src/stores/useChatStore.ts`（内存 zustand）、`src/lib/chat.ts`（IPC 薄封装）、`src/components/ChatCliSettings.tsx`（设置页"对话 CLI"节，i18n `settings.chatCli.*`）。首页入口在 `SearchHome.tsx` composer 操作行。
- 后端：`src-tauri/src/core/agent_cli/`（`defs.rs` 适配器表、`detect.rs` 检测、`parse.rs` 统一 `ChatEvent` 流解析、`session.rs` 内存会话与进程组注册表）、`src-tauri/src/commands/chat.rs`（`chat_detect_agents` / `chat_start` / `chat_cancel`）。
- 流式通道为 Tauri `Channel<ChatEvent>`；事件词汇：Status / TextDelta / ThinkingDelta / ToolUse / ToolResult / Usage / Error / Done。
- prompt 一律经 stdin 传给 CLI，不进 argv；子进程带进程组，取消与应用退出时整组清理。
- 助手正文用 `SkillMarkdown`（streamdown）增量渲染；thinking 折叠块与工具调用卡片是简化实现，不追求 OpenDesign 的完整工具分类卡片体系。
- CLI 子进程 cwd 为 `local-workbench/chat` 专用目录，中央技能目录经 `--add-dir` 只读开放；对话能力等同对应 CLI 自身的权限配置；不声称对话过程离线。

## 验证边界

后端解析器、argv 组装、检测、会话表有单元测试；前端 store 事件处理有单测。真实 CLI 的端到端对话（spawn、流式、resume、取消）以 `#[ignore]` 手工测试与人工验收记录为准，常规 CI 不跑。
