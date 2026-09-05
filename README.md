<p align="center">
  <img src="assets/icon.png" width="80" />
</p>

<h1 align="center">SkillHarbor 技能港</h1>

<p align="center">
  A Chinese-first personal library for AI agent skills.<br/>
  中文优先的个人技能库：全局统一维护技能 → 中文问答/阅读 → 软链接加入项目。
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文说明</a>
</p>

## What is SkillHarbor?

SkillHarbor (技能港) is a desktop app for keeping one personal, centrally maintained library of AI agent skills, finding the right skill by asking in Chinese, reading its usage notes, and linking it into your projects. Projects only ever hold references — skills are linked by symlink, never copied.

The core flow:

1. **Maintain globally** — All skills live in one central library, managed under 「全局技能」 (`/library`).
2. **Ask in Chinese** — The default home page (`/`) is a Chinese Q&A page over the central skill directory: describe what you need and get matching skills plus a Chinese answer.
3. **Read and link** — Open a skill to read its Chinese usage notes or the original text, then **link it into a project** via symlink. Projects manage references only.

## Q&A Home

On launch, describe your need in Chinese on the home page — e.g. “哪些技能能帮我检查代码，怎么使用？”. Search covers the app's current central skill directory (shown under the input box); the full skill list is maintained separately under 「全局技能」.

1. Open 「索引管理」 from the sidebar or home page and click 「建立索引」 the first time. The local `multilingual-e5-small` model downloads over the network; when done, the file count and index-ready status are shown.
2. Type your question and click 「提问」, or press Cmd/Ctrl+Enter. The page first lists the matching skills with their original paths, line numbers and hit snippets, then composes a Chinese answer.
3. From a hit you can open the skill to read the full documentation, or 「链接到项目」 — projects reference global skills through symlinks.
4. After adding or editing skills, update the index in 「索引管理」; queries also pick up document changes. If the Chinese answer fails, you can still read the sources and retry the answer separately.

Indexing uses `@zvec/zvec-grep@0.2.1` with the local `multilingual-e5-small` model; the standalone cache mirror never modifies skill source files. Chinese answers rely on a configured and signed-in Codex CLI and may call an online model; answer failures and local-retrieval failures are reported independently. The search scope does **not** include project source code, Git repositories, or public marketplaces — marketplace/Git installs are still done from 「发现技能」.

See [search-runtime/README.md](search-runtime/README.md) for the dev runtime, file scope and cache locations, and [docs/design/SEARCH-HOME.md](docs/design/SEARCH-HOME.md) for the home page design and sourcing boundaries.

## Inherited features

- **Presets（预设）** — Group skills into named presets and activate or deactivate all of a preset's skills for the current agent scope in one click.
- **Global Workspace** — Each agent gets its own page listing every skill in its global folder, so the view always reflects what the agent actually sees.
- **Project & Linked Workspaces** — Manage project-local skill folders, or point to any directory as a skills root.
- **Install from anywhere** — Install skills from the marketplace, Git repositories, local folders, or `.zip` / `.skill` archives.
- **Backup & multi-device Git sync** — Keep the library versioned in a Git repository; multiple devices connected to the same repository stay in sync automatically.
- **Update tracking** — Check for upstream updates on Git-based skills; re-import local ones.
- **Agent-drivable CLI (`skillharbor-cli`)** — Claude Code, Codex, Cursor and other agents can install, deploy, and report on skills by driving the CLI, so sources, presets, and update tracking stay intact.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Desktop | Tauri 2 |
| Backend | Rust |
| Storage | SQLite (`rusqlite`) |
| i18n | react-i18next |

## Development

Prerequisites: Node.js 20.19+ or 22.12+, Rust 1.77.2+, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install
pnpm run lint    # frontend lint
pnpm run build   # frontend build
pnpm run tauri:dev
```

Package the app with:

```bash
pnpm run workbench:build
```

## License

MIT
