//! Static adapter definitions for the supported agent CLIs.
//!
//! Ported from OpenDesign `apps/daemon/src/runtimes/defs/` (claude, codex,
//! kimi, opencode, qwen, cursor-agent). Each definition knows how to detect
//! its binary, assemble argv (the prompt never travels in argv — it is
//! written to stdin), resume a CLI-native session, and which stream parser
//! its stdout conforms to.
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Which JSONL event dialect a `json-event-stream` agent speaks. Mirrors the
/// `kind` dispatch in OpenDesign `json-event-stream.ts`.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    Codex,
    Kimi,
    OpenCode,
    Gemini,
    Cursor,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StreamFormat {
    ClaudeStreamJson,
    JsonEventStream(EventKind),
    Plain,
}

/// How the prompt is delivered on stdin.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PromptInput {
    /// Plain text written once, then stdin is closed.
    Text,
    /// One JSONL `user` message per line; stdin stays open until the turn's
    /// terminal `result` frame arrives (claude stream-json contract).
    StreamJson,
}

/// CLI-native session resume strategy.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ResumeStyle {
    /// We mint the session id (UUID) and pass it on both create and resume
    /// (claude `--session-id` / `--resume`).
    Specify,
    /// The CLI mints its own id; we capture it from the stream and replay it
    /// on resume (codex `exec resume`, opencode `-s`, kimi `--resume`).
    Capture,
    /// No CLI resume support wired up.
    None,
}

pub struct AuthProbe {
    pub args: &'static [&'static str],
    /// Environment variables that, when set (process env or user-configured
    /// overrides), short-circuit the probe to `ok`.
    pub env_keys: &'static [&'static str],
}

#[derive(Clone, Serialize, Deserialize, specta::Type)]
pub struct ModelOption {
    pub id: String,
    pub label: String,
}

pub struct AgentDef {
    pub id: &'static str,
    pub name: &'static str,
    pub bin: &'static str,
    /// Drop-in forks tried in order when `bin` is not found.
    pub fallback_bins: &'static [&'static str],
    /// Environment variable (process env or user-configured) holding an
    /// explicit executable path; wins over PATH scanning.
    pub bin_env_key: &'static str,
    pub version_args: &'static [&'static str],
    /// Help command probed for capability flags; None = no capability probe.
    pub help_args: Option<&'static [&'static str]>,
    /// (help output substring, capability key) pairs.
    pub capability_flags: &'static [(&'static str, &'static str)],
    pub stream_format: StreamFormat,
    pub prompt_input: PromptInput,
    pub resume_style: ResumeStyle,
    pub auth_probe: Option<AuthProbe>,
    pub fallback_models: &'static [(&'static str, &'static str)],
    pub reasoning_options: &'static [(&'static str, &'static str)],
    pub supports_custom_model: bool,
}

const DEFAULT_MODEL: (&str, &str) = ("default", "默认");

static CLAUDE: AgentDef = AgentDef {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    fallback_bins: &["openclaude"],
    bin_env_key: "CLAUDE_BIN",
    version_args: &["--version"],
    // `--add-dir` / `--include-partial-messages` live under `claude -p`, so
    // the probe targets the `-p` help text, not the global one.
    help_args: Some(&["-p", "--help"]),
    capability_flags: &[
        ("--include-partial-messages", "partial_messages"),
        ("--add-dir", "add_dir"),
    ],
    stream_format: StreamFormat::ClaudeStreamJson,
    prompt_input: PromptInput::StreamJson,
    resume_style: ResumeStyle::Specify,
    auth_probe: Some(AuthProbe {
        args: &["auth", "status"],
        env_keys: &["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    }),
    fallback_models: &[
        DEFAULT_MODEL,
        ("sonnet", "Sonnet (alias)"),
        ("opus", "Opus (alias)"),
        ("haiku", "Haiku (alias)"),
        ("claude-opus-4-5", "claude-opus-4-5"),
        ("claude-sonnet-4-5", "claude-sonnet-4-5"),
        ("claude-haiku-4-5", "claude-haiku-4-5"),
    ],
    reasoning_options: &[],
    supports_custom_model: true,
};

static CODEX: AgentDef = AgentDef {
    id: "codex",
    name: "Codex CLI",
    bin: "codex",
    fallback_bins: &[],
    bin_env_key: "CODEX_BIN",
    version_args: &["--version"],
    help_args: None,
    capability_flags: &[],
    stream_format: StreamFormat::JsonEventStream(EventKind::Codex),
    prompt_input: PromptInput::Text,
    resume_style: ResumeStyle::Capture,
    auth_probe: Some(AuthProbe {
        args: &["login", "status"],
        env_keys: &["CODEX_API_KEY", "OPENAI_API_KEY"],
    }),
    fallback_models: &[
        DEFAULT_MODEL,
        ("gpt-5.5", "gpt-5.5"),
        ("gpt-5.4", "gpt-5.4"),
        ("gpt-5.4-mini", "gpt-5.4-mini"),
        ("gpt-5.3-codex", "gpt-5.3-codex"),
        ("gpt-5.1", "gpt-5.1"),
        ("gpt-5.1-codex-mini", "gpt-5.1-codex-mini"),
        ("gpt-5-codex", "gpt-5-codex"),
        ("gpt-5", "gpt-5"),
        ("o3", "o3"),
        ("o4-mini", "o4-mini"),
    ],
    reasoning_options: &[
        ("default", "默认"),
        ("none", "None"),
        ("minimal", "Minimal"),
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("xhigh", "XHigh"),
    ],
    supports_custom_model: true,
};

static KIMI: AgentDef = AgentDef {
    id: "kimi",
    name: "Kimi CLI",
    bin: "kimi",
    fallback_bins: &[],
    bin_env_key: "KIMI_BIN",
    version_args: &["--version"],
    help_args: None,
    capability_flags: &[],
    stream_format: StreamFormat::JsonEventStream(EventKind::Kimi),
    prompt_input: PromptInput::Text,
    resume_style: ResumeStyle::Capture,
    // Kimi authenticates against its own account; env keys short-circuit.
    auth_probe: Some(AuthProbe {
        args: &["--version"],
        env_keys: &["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    }),
    fallback_models: &[
        DEFAULT_MODEL,
        ("kimi-k2-turbo-preview", "kimi-k2-turbo-preview"),
        ("moonshot-v1-8k", "moonshot-v1-8k"),
        ("moonshot-v1-32k", "moonshot-v1-32k"),
    ],
    reasoning_options: &[],
    supports_custom_model: true,
};

static OPENCODE: AgentDef = AgentDef {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode-cli",
    fallback_bins: &["opencode"],
    bin_env_key: "OPENCODE_BIN",
    version_args: &["--version"],
    help_args: Some(&["run", "--help"]),
    capability_flags: &[("--dangerously-skip-permissions", "skip_permissions")],
    stream_format: StreamFormat::JsonEventStream(EventKind::OpenCode),
    prompt_input: PromptInput::Text,
    resume_style: ResumeStyle::Capture,
    auth_probe: None,
    fallback_models: &[
        DEFAULT_MODEL,
        ("anthropic/claude-sonnet-4-5", "anthropic/claude-sonnet-4-5"),
        ("openai/gpt-5", "openai/gpt-5"),
        ("google/gemini-2.5-pro", "google/gemini-2.5-pro"),
    ],
    reasoning_options: &[],
    supports_custom_model: true,
};

static QWEN: AgentDef = AgentDef {
    id: "qwen",
    name: "Qwen Code",
    bin: "qwen",
    fallback_bins: &[],
    bin_env_key: "QWEN_BIN",
    version_args: &["--version"],
    help_args: None,
    capability_flags: &[],
    stream_format: StreamFormat::JsonEventStream(EventKind::Gemini),
    prompt_input: PromptInput::Text,
    resume_style: ResumeStyle::None,
    auth_probe: None,
    fallback_models: &[
        DEFAULT_MODEL,
        ("qwen3-coder-plus", "qwen3-coder-plus"),
        ("qwen3-coder-flash", "qwen3-coder-flash"),
    ],
    reasoning_options: &[],
    supports_custom_model: true,
};

static CURSOR: AgentDef = AgentDef {
    id: "cursor-agent",
    name: "Cursor Agent",
    bin: "cursor-agent",
    fallback_bins: &[],
    bin_env_key: "CURSOR_AGENT_BIN",
    version_args: &["--version"],
    help_args: Some(&["--help"]),
    capability_flags: &[("--trust", "trust")],
    stream_format: StreamFormat::JsonEventStream(EventKind::Cursor),
    prompt_input: PromptInput::Text,
    resume_style: ResumeStyle::None,
    auth_probe: Some(AuthProbe {
        args: &["status"],
        env_keys: &["CURSOR_API_KEY"],
    }),
    fallback_models: &[
        DEFAULT_MODEL,
        ("auto", "auto"),
        ("sonnet-4", "sonnet-4"),
        ("sonnet-4-thinking", "sonnet-4-thinking"),
        ("gpt-5", "gpt-5"),
    ],
    reasoning_options: &[],
    supports_custom_model: true,
};

static DEFS: [&AgentDef; 6] = [&CLAUDE, &CODEX, &KIMI, &OPENCODE, &QWEN, &CURSOR];

pub fn defs() -> &'static [&'static AgentDef] {
    &DEFS
}

pub fn get_def(id: &str) -> Option<&'static AgentDef> {
    DEFS.iter().copied().find(|def| def.id == id)
}

impl AgentDef {
    pub fn fallback_models(&self) -> Vec<ModelOption> {
        self.fallback_models
            .iter()
            .map(|&(id, label)| ModelOption { id: id.into(), label: label.into() })
            .collect()
    }

    pub fn reasoning_options(&self) -> Vec<ModelOption> {
        self.reasoning_options
            .iter()
            .map(|&(id, label)| ModelOption { id: id.into(), label: label.into() })
            .collect()
    }
}

/// Per-turn model/reasoning choices (`None` / "default" = CLI default).
#[derive(Default)]
pub struct ChatOptions<'a> {
    pub model: Option<&'a str>,
    pub reasoning: Option<&'a str>,
}

/// Spawn context shared by every adapter.
pub struct ChatContext<'a> {
    pub cwd: Option<&'a Path>,
    pub resume_session_id: Option<&'a str>,
    pub new_session_id: Option<&'a str>,
    pub extra_dirs: &'a [PathBuf],
    /// Capability keys detected from the agent's `--help` output.
    pub capabilities: &'a [String],
}

fn model_arg(model: Option<&str>) -> Option<&str> {
    model.filter(|m| !m.is_empty() && *m != "default")
}

/// Codex accepts `-c model_reasoning_effort=...`; some model families clamp
/// the effort ladder. Ported from OpenDesign `defs/shared.ts`.
fn clamp_codex_reasoning<'a>(model: Option<&'a str>, effort: &'a str) -> &'a str {
    let raw = model.unwrap_or("").trim();
    let id = raw.rsplit('/').next().unwrap_or(raw);
    let is_gpt5_late_family = id.is_empty()
        || id == "default"
        || id.starts_with("gpt-5.2")
        || id.starts_with("gpt-5.3")
        || id.starts_with("gpt-5.4")
        || id.starts_with("gpt-5.5");
    if is_gpt5_late_family && effort == "minimal" {
        return "low";
    }
    if id == "gpt-5.1" && effort == "xhigh" {
        return "high";
    }
    if id == "gpt-5.1-codex-mini" {
        return if effort == "high" || effort == "xhigh" { "high" } else { "medium" };
    }
    effort
}

/// Codex's `workspace-write` sandbox has no working OS-level enforcement on
/// Windows/WSL, so those platforms fall back to `danger-full-access`.
fn codex_needs_danger_full_access() -> bool {
    if std::env::var("SKILLHARBOR_CODEX_SANDBOX").ok().as_deref() == Some("danger-full-access") {
        return true;
    }
    if cfg!(windows) {
        return true;
    }
    std::env::var_os("WSL_DISTRO_NAME").is_some_and(|v| !v.is_empty())
}

/// Assemble the argv for one turn. The prompt is never part of argv.
pub fn build_args(def: &AgentDef, options: &ChatOptions, context: &ChatContext) -> Vec<String> {
    let has_cap = |key: &str| context.capabilities.iter().any(|c| c == key);
    match def.id {
        "claude" => {
            let mut args: Vec<String> = [
                "-p",
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--verbose",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect();
            // Only exists on newer Claude Code builds; older ones exit 1 on
            // unknown flags, so gate on the `-p --help` probe.
            if has_cap("partial_messages") {
                args.push("--include-partial-messages".into());
            }
            if let Some(model) = model_arg(options.model) {
                args.extend(["--model".into(), model.into()]);
            }
            if !context.extra_dirs.is_empty() && has_cap("add_dir") {
                args.push("--add-dir".into());
                args.extend(context.extra_dirs.iter().map(|d| d.to_string_lossy().into_owned()));
            }
            // `--resume <id>` continues a stored session; `--session-id <uuid>`
            // starts a new one with an id we control.
            if let Some(id) = context.resume_session_id.filter(|id| !id.is_empty()) {
                args.extend(["--resume".into(), id.into()]);
            } else if let Some(id) = context.new_session_id.filter(|id| !id.is_empty()) {
                args.extend(["--session-id".into(), id.into()]);
            }
            args.extend(["--permission-mode".into(), "bypassPermissions".into()]);
            args
        }
        "codex" => {
            let resume_id = context.resume_session_id.filter(|id| !id.is_empty());
            // `codex exec resume` rejects `--sandbox` (create-only); the mode
            // goes through a `-c sandbox_mode=...` override instead, mirroring
            // the create turn's effective policy so turn_context byte-matches
            // and the prefix cache survives the resume.
            let sandbox_args: Vec<String> = match (codex_needs_danger_full_access(), resume_id) {
                (true, Some(_)) => vec!["-c".into(), "sandbox_mode=\"danger-full-access\"".into()],
                (true, None) => vec!["--sandbox".into(), "danger-full-access".into()],
                (false, Some(_)) => vec![
                    "-c".into(),
                    "sandbox_mode=\"workspace-write\"".into(),
                    "-c".into(),
                    "sandbox_workspace_write.network_access=true".into(),
                ],
                (false, None) => vec![
                    "--sandbox".into(),
                    "workspace-write".into(),
                    "-c".into(),
                    "sandbox_workspace_write.network_access=true".into(),
                ],
            };
            let mut args: Vec<String> = if resume_id.is_some() {
                ["exec", "resume", "--json", "--skip-git-repo-check"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            } else {
                ["exec", "--json", "--skip-git-repo-check"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            };
            args.extend(sandbox_args);
            // `-C` / `--add-dir` are create-only; a resumed session already
            // carries its workspace and granted dirs.
            if resume_id.is_none() {
                if let Some(cwd) = context.cwd {
                    args.extend(["-C".into(), cwd.to_string_lossy().into_owned()]);
                }
                for dir in context.extra_dirs {
                    args.extend(["--add-dir".into(), dir.to_string_lossy().into_owned()]);
                }
            }
            if let Some(model) = model_arg(options.model) {
                args.extend(["--model".into(), model.into()]);
            }
            if let Some(effort) = options.reasoning.filter(|r| !r.is_empty() && *r != "default") {
                let effort = clamp_codex_reasoning(options.model, effort);
                args.extend(["-c".into(), format!("model_reasoning_effort=\"{effort}\"")]);
            }
            // The resume thread id is the positional SESSION_ID argument and
            // must come last (the prompt arrives via stdin).
            if let Some(id) = resume_id {
                args.push(id.into());
            }
            args
        }
        "kimi" => {
            let mut args: Vec<String> = ["--print", "--output-format", "stream-json", "--yolo"]
                .iter()
                .map(|s| s.to_string())
                .collect();
            if let Some(id) = context.resume_session_id.filter(|id| !id.is_empty()) {
                args.extend(["--resume".into(), id.into()]);
            }
            if let Some(model) = model_arg(options.model) {
                args.extend(["--model".into(), model.into()]);
            }
            args
        }
        "opencode" => {
            let mut args: Vec<String> = ["run", "--format", "json"].iter().map(|s| s.to_string()).collect();
            if has_cap("skip_permissions") {
                args.push("--dangerously-skip-permissions".into());
            }
            // OpenCode walks up to the nearest git root instead of honoring
            // the process cwd; pin the workspace explicitly.
            if let Some(cwd) = context.cwd {
                args.extend(["--dir".into(), cwd.to_string_lossy().into_owned()]);
            }
            if let Some(id) = context.resume_session_id.filter(|id| !id.is_empty()) {
                args.extend(["-s".into(), id.into()]);
            }
            if let Some(model) = model_arg(options.model) {
                args.extend(["-m".into(), model.into()]);
            }
            args
        }
        "qwen" => {
            // Gemini-CLI fork: `--yolo` non-interactive, stream-json output,
            // prompt from piped stdin when no positional prompt is given.
            let mut args: Vec<String> =
                ["--yolo", "--output-format", "stream-json"].iter().map(|s| s.to_string()).collect();
            if let Some(model) = model_arg(options.model) {
                args.extend(["--model".into(), model.into()]);
            }
            args
        }
        "cursor-agent" => {
            let mut args: Vec<String> =
                ["--print", "--output-format", "stream-json", "--stream-partial-output", "--force"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect();
            if has_cap("trust") {
                args.push("--trust".into());
            }
            if let Some(cwd) = context.cwd {
                args.extend(["--workspace".into(), cwd.to_string_lossy().into_owned()]);
            }
            if let Some(model) = model_arg(options.model) {
                args.extend(["--model".into(), model.into()]);
            }
            args
        }
        _ => Vec::new(),
    }
}

/// Wrap a prompt as one claude stream-json input line (Anthropic user
/// message). Stdin stays open after this write until the terminal `result`
/// frame, so further turns could be streamed into the same process.
pub fn claude_stream_json_user_message(prompt: &str) -> String {
    serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [{ "type": "text", "text": prompt }],
        },
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caps(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|s| s.to_string()).collect()
    }

    fn context<'a>(caps: &'a [String]) -> ChatContext<'a> {
        ChatContext {
            cwd: None,
            resume_session_id: None,
            new_session_id: None,
            extra_dirs: &[],
            capabilities: caps,
        }
    }

    #[test]
    fn claude_new_session_with_partial_messages() {
        let caps = caps(&["partial_messages", "add_dir"]);
        let dir = PathBuf::from("/skills");
        let mut ctx = context(&caps);
        ctx.new_session_id = Some("uuid-1");
        ctx.extra_dirs = std::slice::from_ref(&dir);
        let args = build_args(&CLAUDE, &ChatOptions::default(), &ctx);
        assert_eq!(
            args,
            [
                "-p", "--input-format", "stream-json", "--output-format", "stream-json",
                "--verbose", "--include-partial-messages", "--add-dir", "/skills",
                "--session-id", "uuid-1", "--permission-mode", "bypassPermissions",
            ]
        );
    }

    #[test]
    fn claude_resume_omits_session_id_and_old_build_omits_gated_flags() {
        let caps = caps(&[]);
        let mut ctx = context(&caps);
        ctx.resume_session_id = Some("uuid-1");
        let args = build_args(&CLAUDE, &ChatOptions { model: Some("sonnet"), reasoning: None }, &ctx);
        assert_eq!(
            args,
            [
                "-p", "--input-format", "stream-json", "--output-format", "stream-json",
                "--verbose", "--model", "sonnet", "--resume", "uuid-1",
                "--permission-mode", "bypassPermissions",
            ]
        );
    }

    #[test]
    fn codex_fresh_exec_then_resume_shape() {
        let caps = caps(&[]);
        let cwd = PathBuf::from("/work");
        let dir = PathBuf::from("/skills");
        let mut ctx = context(&caps);
        ctx.cwd = Some(&cwd);
        ctx.extra_dirs = std::slice::from_ref(&dir);
        let fresh = build_args(
            &CODEX,
            &ChatOptions { model: Some("gpt-5.1"), reasoning: Some("xhigh") },
            &ctx,
        );
        assert!(fresh[..3] == ["exec", "--json", "--skip-git-repo-check"]);
        assert!(fresh.windows(2).any(|w| w == ["-C", "/work"]));
        assert!(fresh.windows(2).any(|w| w == ["--add-dir", "/skills"]));
        assert!(fresh.windows(2).any(|w| w == ["--model", "gpt-5.1"]));
        // gpt-5.1 clamps xhigh -> high.
        assert!(fresh.iter().any(|a| a == "model_reasoning_effort=\"high\""));

        ctx.resume_session_id = Some("thread-1");
        let resumed = build_args(&CODEX, &ChatOptions::default(), &ctx);
        assert!(resumed[..4] == ["exec", "resume", "--json", "--skip-git-repo-check"]);
        assert!(resumed.windows(2).any(|w| w == ["-c", "sandbox_mode=\"workspace-write\""])
            || resumed.iter().any(|a| a.contains("danger-full-access")));
        assert!(!resumed.iter().any(|a| a == "-C" || a == "--add-dir"));
        assert_eq!(resumed.last().map(String::as_str), Some("thread-1"));
    }

    #[test]
    fn kimi_and_opencode_and_cursor_shapes() {
        let caps = caps(&[]);
        let mut ctx = context(&caps);
        ctx.resume_session_id = Some("ses-1");
        assert_eq!(
            build_args(&KIMI, &ChatOptions::default(), &ctx),
            ["--print", "--output-format", "stream-json", "--yolo", "--resume", "ses-1"]
        );

        let cwd = PathBuf::from("/work");
        ctx.cwd = Some(&cwd);
        let opencode = build_args(&OPENCODE, &ChatOptions { model: Some("openai/gpt-5"), reasoning: None }, &ctx);
        assert_eq!(
            opencode,
            ["run", "--format", "json", "--dir", "/work", "-s", "ses-1", "-m", "openai/gpt-5"]
        );

        ctx.resume_session_id = None;
        let cursor = build_args(&CURSOR, &ChatOptions::default(), &ctx);
        assert_eq!(
            cursor,
            ["--print", "--output-format", "stream-json", "--stream-partial-output", "--force", "--workspace", "/work"]
        );
    }

    #[test]
    fn stream_json_user_message_is_single_line_json() {
        let line = claude_stream_json_user_message("你好\n世界");
        assert!(!line.contains('\n'));
        let value: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["message"]["content"][0]["text"], "你好\n世界");
    }
}
