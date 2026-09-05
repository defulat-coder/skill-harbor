# 项目技能链接契约

## 目标与范围

普通项目仅引用全局技能库：从全局技能库或项目内执行“添加 / 链接到项目”，必须创建指向中央技能源目录的软链接。全局的 `sync_mode=copy`、旧版调用方传入的 `mode=copy` 都不能使普通项目添加生成新副本。链接失败返回错误，不降级为复制，也不调整用户配置。

此次只调整 Rust 部署入口与隔离测试，不改前端、用户数据库或真实项目。既有副本保留读取兼容，不自动迁移或删除。

## 入口审计与处理

| Rust 入口 | 场景 | 处理 |
| --- | --- | --- |
| `commands::projects::export_skill_to_project` | AddSkillsSheet 项目模式、SkillProjectsSection 等普通添加 | 普通项目统一调用严格软链接方法，忽略全局复制偏好 |
| `commands::workbench::deploy` / `create` | 工作台添加、项目创建时批量部署 | 普通项目旧 `copy` 参数按软链接处理；成功绑定记录实际为 `symlink` |
| `commands::projects::update_project_skill_from_center` | 明确刷新已有项目技能 | 旧副本保持副本；已有链接保持链接，不因全局配置变成副本 |
| 上述入口中的 `workspace_type=linked` | 关联的工具全局技能目录 | 保留原同步模式和全局平台回退行为 |
| `commands::agent_workspace`、普通全局部署 | 工具全局目录维护 | 不修改 |
| CLI `export --dest` | 明确导出独立文件到任意指定目录 | 不是“项目添加”入口，保留原明确复制导出及冲突保护 |

## 共享实现

`core::sync_engine::link_project_skill` 负责普通项目引用：

- 验证技能源目录存在，使用源目录的绝对真实路径建立链接。
- 复用 `NoClobber` 分类保护，同名真实目录、真实文件、其他来源或悬空链接均不覆盖。
- 正确指向同一源的现有链接可以安全复用。
- 新链接直接通过系统 symlink API 创建；另一个进程抢先占用路径时，创建失败，不先删除目标。
- Windows 使用 `symlink_dir`。缺少创建权限时明确报错，不降级为 junction 或复制；工具全局目录仍由旧 `sync_skill` 处理。
- 拒绝源目标目录互相包含，防止在技能库内部创建递归引用。

项目添加入口还校验技能根目录的已有祖先不能通过中间软链接指向项目之外。移除引用沿用原有不跟随链接删除源内容的实现。

## 验收方法

测试目录和 SQLite 文件均由 `tempfile` 创建。没有写入用户技能目录，没有执行真实模型任务。

重点覆盖：

1. 全局配置为 copy 时，普通添加仍创建真实软链接；修改中央 `SKILL.md` 后项目立即读取到新内容，原配置仍为 copy。
2. 工作台旧 copy 参数仍得到 symlink 绑定。
3. 同名真实目录内的定制内容不被覆盖，也不自动转换。
4. 悬空链接保持原指向；源目录不存在时不创建项目目标。
5. 项目中间目录链接不能把部署转移到项目之外。
6. linked 全局工作区继续遵守 copy 配置，内容保持独立。
7. 原有批量部分成功、重试、移除不删除源文件等测试继续执行。

实际执行结果（macOS，全部通过，共 69 项）：

```text
cargo test --lib commands::projects::tests --manifest-path src-tauri/Cargo.toml
17 passed; 0 failed

cargo test --lib commands::workbench::tests --manifest-path src-tauri/Cargo.toml
8 passed; 0 failed

cargo test --lib core::sync_engine::tests --manifest-path src-tauri/Cargo.toml
44 passed; 0 failed
```

这些是 Rust 入口共用逻辑与文件操作测试，未把 Tauri 命令可注册或源码存在当作前端交互已验收。前端整体验收由主任务单独记录。

随后完成全量 Rust library 回归：

```text
cargo test --lib --manifest-path src-tauri/Cargo.toml
487 passed; 0 failed; 0 ignored; 0 filtered out
测试运行时间：37.61 秒

git diff --check -- src-tauri
退出码 0，无输出（Rust 范围已跟踪改动无空白格式问题）
```

全量回归通过；本轮只补充验证记录，没有进一步修改实现。


## 未覆盖项

此次在 macOS 上运行 Rust 测试。Windows 创建权限失败分支及 Linux 平台没有实机执行；没有将静态分支存在当作平台验收。共享软链接并不提供文件内容隔离：修改项目链接下的文件仍会修改中央源，这是产品契约。

## 项目引用的中文说明继承

原生验收发现：全局已有中文说明，但同一技能源的项目软链接因为缓存作用域不同而显示“还没有中文说明”。读取规则现调整为：

1. 项目作用域已有说明时优先使用，包括人工修订；不会被全局说明覆盖。
2. 项目没有独立说明，且项目技能目录的实际 canonical 路径与该技能登记的中央源目录完全相同时，读取全局已有说明。
3. 回退只读，不复制成项目缓存；后续全局说明更新不会被旧缓存遮挡。
4. 仍使用当前实际原文的哈希判断过期，不能因继承而把旧说明标成最新。
5. 真实项目副本不继承全局缓存，即使当前文字相同；它有独立的说明作用域。

只修改说明读取和来源识别，没有调整中文生成的 CLI、沙箱、工具开关或文档读取边界。新增隔离测试覆盖软链接回退与过期、项目人工说明优先、真实副本隔离。

本次继承修复的实际验证：

```text
cargo test --lib commands::skill_guides::tests --manifest-path src-tauri/Cargo.toml
10 passed; 0 failed（包括 3 项新增真实文件/软链接测试）

git diff --check -- src-tauri/src/commands/skill_guides.rs docs/delivery/project-link-contract.md
退出码 0，无输出
```

继承后源文更新会显示过期，全局说明再次更新后项目直接读取新内容；上述传播也通过测试。本轮未执行真实模型生成，也未更改用户缓存。前述 487 项全量回归发生在该继承修复之前；本次执行的是中文说明模块定向回归。
