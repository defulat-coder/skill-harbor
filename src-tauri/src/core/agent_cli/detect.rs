//! Agent CLI detection: PATH + user-toolchain scanning, `--version` probes,
//! `--help` capability probes, and concurrent auth probes. Results are cached
//! in memory; `force_rescan` rebuilds the snapshot.
//!
//! The toolchain directory list is ported from OpenDesign
//! `packages/platform/src/toolchain.ts` (`wellKnownUserToolchainBins`), the
//! auth classification from `runtimes/auth.ts`.
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    process::Stdio,
    sync::{Arc, OnceLock},
};

use serde::Serialize;
use tokio::sync::Mutex as AsyncMutex;

use super::defs::{defs, AgentDef, ModelOption};

const VERSION_TIMEOUT_SECS: u64 = 3;
const PROBE_TIMEOUT_SECS: u64 = 5;

/// User-configured environment overrides: agent id -> (key -> value). Backed
/// by the `chat_agent_env` setting; secrets never leave the backend.
pub type EnvOverrides = HashMap<String, HashMap<String, String>>;

#[derive(Clone, Serialize, specta::Type)]
pub struct DetectedAgent {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub available: bool,
    /// ok | missing | unknown | unchecked (no probe declared)
    pub auth_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_message: Option<String>,
    pub models: Vec<ModelOption>,
    pub reasoning_options: Vec<ModelOption>,
    pub supports_custom_model: bool,
}

/// One detected agent plus the spawn-time facts chat_start needs.
#[derive(Clone)]
pub struct AgentRuntime {
    pub detected: DetectedAgent,
    pub executable: Option<PathBuf>,
    pub capabilities: Vec<String>,
}

#[derive(Default)]
pub struct DetectionSnapshot {
    pub agents: HashMap<String, AgentRuntime>,
}

static SNAPSHOT: OnceLock<AsyncMutex<Option<Arc<DetectionSnapshot>>>> = OnceLock::new();

fn snapshot_slot() -> &'static AsyncMutex<Option<Arc<DetectionSnapshot>>> {
    SNAPSHOT.get_or_init(|| AsyncMutex::new(None))
}

/// GUI launches inherit a minimal PATH; these are the well-known user
/// toolchain bin directories where agent CLIs actually live (macOS-first,
/// with the Windows branches kept for parity).
pub fn well_known_user_toolchain_bins() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let home = match dirs::home_dir() {
        Some(home) => home,
        None => return dirs,
    };
    let env_var = |key: &str| std::env::var(key).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());

    // Vite+ global installs: explicit VP_HOME wins, then the default root.
    if let Some(vp_home) = env_var("VP_HOME").map(PathBuf::from).filter(|p| p.is_absolute()) {
        dirs.push(vp_home.join("bin"));
    }
    // An explicit npm prefix outranks every conventional location below.
    if let Some(prefix) = env_var("NPM_CONFIG_PREFIX").or_else(|| env_var("npm_config_prefix")) {
        dirs.push(PathBuf::from(&prefix).join("bin"));
        if cfg!(windows) {
            dirs.push(PathBuf::from(&prefix));
        }
    }
    #[cfg(windows)]
    dirs.push(home.join("AppData").join("Roaming").join("npm"));
    dirs.extend([
        home.join(".local/bin"),
        home.join(".vite-plus/bin"),
        home.join(".kimi-code/bin"),
        home.join(".opencode/bin"),
        home.join(".grok/bin"),
        home.join(".bun/bin"),
        home.join(".volta/bin"),
        home.join(".asdf/shims"),
        home.join("Library/pnpm"),
        home.join(".cargo/bin"),
        home.join(".npm-global/bin"),
        home.join(".npm-packages/bin"),
        home.join(".deno/bin"),
        home.join("go/bin"),
        home.join(".pyenv/shims"),
    ]);
    #[cfg(windows)]
    {
        dirs.push(home.join("scoop").join("shims"));
        if let Some(app_data) = env_var("APPDATA") {
            dirs.push(PathBuf::from(app_data).join("npm"));
        }
    }
    // Mise shims: MISE_DATA_DIR relocates the whole tree; legacy ~/.mise only
    // applies when no explicit override exists.
    let mise_override = env_var("MISE_DATA_DIR").map(PathBuf::from).filter(|p| p.is_absolute());
    let mise_data = mise_override.clone().unwrap_or_else(|| home.join(".local/share/mise"));
    dirs.push(mise_data.join("shims"));
    if mise_override.is_none() {
        dirs.push(home.join(".mise/shims"));
    }
    dirs.push(home.join(".nix-profile/bin"));
    if !cfg!(windows) {
        dirs.extend([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/run/current-system/sw/bin"),
            PathBuf::from("/nix/var/nix/profiles/default/bin"),
        ]);
    }
    // Per-version Node toolchains (mise installs, nvm, fnm).
    #[allow(unused_mut)] // mutated on Windows only
    let mut version_roots: Vec<(PathBuf, &[&str])> = vec![
        (mise_data.join("installs/node"), &["bin"]),
        (home.join(".nvm/versions/node"), &["bin"]),
        (home.join(".local/share/fnm/node-versions"), &["installation", "bin"]),
        (home.join(".fnm/node-versions"), &["installation", "bin"]),
    ];
    #[cfg(windows)]
    {
        let mut fnm_roots = Vec::new();
        if let Some(fnm_dir) = env_var("FNM_DIR") {
            fnm_roots.push(PathBuf::from(fnm_dir));
        }
        for key in ["LOCALAPPDATA", "APPDATA"] {
            if let Some(base) = env_var(key) {
                fnm_roots.push(PathBuf::from(base).join("fnm"));
            }
        }
        for root in fnm_roots {
            version_roots.push((root.join("node-versions"), &["installation"]));
        }
    }
    for (root, segments) in version_roots {
        dirs.extend(existing_child_bin_dirs(&root, segments));
    }
    // mise npm-packaged toolchains (e.g. npm-openai-codex).
    dirs.extend(existing_child_bin_dirs(&mise_data.join("installs/npm-openai-codex"), &["bin"]));
    dirs
}

/// Lists `<root>/<version>/<...segments>` directories, version-sorted so the
/// newest toolchain wins.
fn existing_child_bin_dirs(root: &std::path::Path, segments: &[&str]) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(root) else { return Vec::new() };
    let mut children: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|entry| entry.path())
        .collect();
    children.sort();
    children
        .into_iter()
        .rev()
        .map(|child| segments.iter().fold(child, |path, segment| path.join(segment)))
        .filter(|path| path.is_dir())
        .collect()
}

fn executable_names(base: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![format!("{base}.exe"), format!("{base}.cmd"), base.to_string()]
    } else {
        vec![base.to_string()]
    }
}

/// Candidate executables in resolution order: explicit env override (user
/// setting first, then process env), then PATH dirs, then toolchain dirs.
fn resolve_candidates(def: &AgentDef, overrides: Option<&HashMap<String, String>>) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut push = |path: PathBuf| {
        if seen.insert(path.clone()) {
            candidates.push(path);
        }
    };
    let configured = overrides
        .and_then(|env| env.get(def.bin_env_key))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| {
            std::env::var(def.bin_env_key).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
        });
    if let Some(path) = configured {
        push(PathBuf::from(path));
    }
    let mut search_dirs: Vec<PathBuf> = Vec::new();
    if let Some(paths) = std::env::var_os("PATH") {
        search_dirs.extend(std::env::split_paths(&paths));
    }
    search_dirs.extend(well_known_user_toolchain_bins());
    let bins: Vec<&str> = std::iter::once(def.bin).chain(def.fallback_bins.iter().copied()).collect();
    for dir in search_dirs {
        for bin in &bins {
            for name in executable_names(bin) {
                let path = dir.join(&name);
                if path.is_file() {
                    push(path);
                }
            }
        }
    }
    candidates
}

async fn run_probe(path: &std::path::Path, args: &[&str], timeout_secs: u64, env: Option<&HashMap<String, String>>) -> Result<(String, String, Option<i32>), String> {
    let mut command = tokio::process::Command::new(path);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // npm-installed CLIs use /usr/bin/env node; a GUI PATH may omit the
    // sibling runtime next to the resolved binary.
    if let Some(parent) = path.parent() {
        let mut paths = vec![parent.to_path_buf()];
        if let Some(path_var) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&path_var));
        }
        if let Ok(joined) = std::env::join_paths(paths) {
            command.env("PATH", joined);
        }
    }
    if let Some(env) = env {
        command.envs(env);
    }
    let work = async { command.output().await };
    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), work).await {
        Ok(Ok(output)) => Ok((
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).to_string(),
            output.status.code(),
        )),
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err("probe timeout".into()),
    }
}

/// First candidate that answers its version probe within the budget wins.
async fn probe_version(def: &AgentDef, candidates: &[PathBuf]) -> Option<(PathBuf, String)> {
    for candidate in candidates {
        if let Ok((stdout, stderr, code)) = run_probe(candidate, def.version_args, VERSION_TIMEOUT_SECS, None).await
            && code == Some(0)
        {
            let version = stdout
                .lines()
                .chain(stderr.lines())
                .map(str::trim)
                .find(|line| !line.is_empty())
                .unwrap_or("")
                .chars()
                .take(120)
                .collect::<String>();
            return Some((candidate.clone(), version));
        }
    }
    None
}

async fn probe_capabilities(def: &AgentDef, executable: &std::path::Path) -> Vec<String> {
    let Some(help_args) = def.help_args else { return Vec::new() };
    if def.capability_flags.is_empty() {
        return Vec::new();
    }
    let Ok((stdout, stderr, _)) = run_probe(executable, help_args, VERSION_TIMEOUT_SECS, None).await else {
        return Vec::new();
    };
    let help = format!("{stdout}\n{stderr}");
    def.capability_flags
        .iter()
        .filter(|(flag, _)| help.contains(flag))
        .map(|(_, key)| key.to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// Auth classification (ported from OpenDesign runtimes/auth.ts)
// ---------------------------------------------------------------------------

fn is_claude_auth_failure_text(text: &str) -> bool {
    if text.trim().is_empty() {
        return false;
    }
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(text) {
        if parsed.get("authenticated").and_then(serde_json::Value::as_bool) == Some(true)
            || parsed.get("loggedIn").and_then(serde_json::Value::as_bool) == Some(true)
        {
            return false;
        }
        if parsed.get("authenticated").and_then(serde_json::Value::as_bool) == Some(false)
            || parsed.get("loggedIn").and_then(serde_json::Value::as_bool) == Some(false)
        {
            return true;
        }
    }
    let lower = text.to_lowercase();
    if lower.contains("\"authenticated\":true") || lower.contains("\"loggedin\":true") {
        return false;
    }
    lower.contains("\"authenticated\":false")
        || lower.contains("\"loggedin\":false")
        || lower.contains("not authenticated")
        || lower.contains("authentication required")
        || regex::Regex::new(r"not logged[ _-]?in").is_ok_and(|re| re.is_match(&lower))
        || regex::Regex::new(r"please (sign|log)[ _-]?in").is_ok_and(|re| re.is_match(&lower))
}

fn is_cursor_auth_failure_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    if lower.trim().is_empty() {
        return false;
    }
    lower.contains("authentication required")
        || lower.contains("not authenticated")
        || lower.contains("not logged in")
        || lower.contains("unauthenticated")
        || lower.contains("agent login")
        || lower.contains("cursor_api_key")
}

/// Maps raw CLI output to a coarse failure class. Auth is checked before
/// rate/upstream so a `401` is never misread as a `5xx`.
pub fn classify_service_failure(text: &str) -> Option<&'static str> {
    if text.trim().is_empty() {
        return None;
    }
    // A bare status number is too noisy; require explicit HTTP-status context.
    const STATUS_CTX: &str = r"(?:\bhttp(?:[ /]?\d(?:\.\d)?)?\b|\b(?:status|error|response)(?:[ _-]?code)?\b|\bcode\s*[:=#]|\b(?:server|http)[ _-]?error\b)[\s:=#-]*";
    let auth = regex::Regex::new(&format!(
        r"(?i)(\b(unauthor(?:ized|ised)|authenticat(?:e|ed|ion)|invalid[ _-]?(?:api[ _-]?)?key|incorrect api key|no api key|x-api-key|missing[ _-]?credentials?|not (?:authenticated|logged[ _-]?in)|please (?:sign|log)[ _-]?in|oauth token (?:has )?expired|session expired|credentials? (?:are )?(?:missing|invalid|required))\b|/login\b|{STATUS_CTX}401\b)"
    ))
    .ok()?;
    if auth.is_match(text) {
        return Some("auth_required");
    }
    let rate = regex::Regex::new(&format!(
        r"(?i)(\b(rate[ _-]?limit|too many requests|quota|insufficient[ _-]?(?:quota|balance|credit|funds)|credit balance is too low|exceeded your current quota|usage limit|session limit|limit reached|billing (?:hard )?limit)\b|{STATUS_CTX}429\b)"
    ))
    .ok()?;
    if rate.is_match(text) {
        return Some("rate_limited");
    }
    let upstream = regex::Regex::new(&format!(
        r"(?i)(\b(overloaded(?:_error)?|service (?:is )?(?:temporarily )?unavailable|bad gateway|gateway timeout|internal server error|upstream (?:error|unavailable)|provider (?:error|unavailable)|temporarily unavailable|model is currently overloaded|5xx)\b|{STATUS_CTX}5\d\d\b|\b5\d\d\s+(?:bad gateway|service unavailable|internal server error|gateway timeout))"
    ))
    .ok()?;
    if upstream.is_match(text) {
        return Some("upstream_unavailable");
    }
    None
}

fn claude_auth_guidance() -> String {
    "Claude Code 已安装但未登录。请在终端运行 `claude auth login` 或打开 `claude` 完成登录，然后重新扫描。如果应用不是从终端启动的，shell 配置文件（如 ~/.zshrc）中的环境变量可能未加载。".into()
}

fn cursor_auth_guidance() -> String {
    "Cursor Agent 未登录。请运行 `cursor-agent login`，然后 `cursor-agent status` 确认后重试；自动化场景可在应用环境中配置 CURSOR_API_KEY。".into()
}

fn generic_auth_guidance(agent_name: &str) -> String {
    format!("{agent_name} 已安装但似乎未登录。请在终端中用该 CLI 完成登录，然后重新扫描。")
}

/// Classify a probe's combined output; None = looks authenticated.
fn classify_probe_failure(agent_id: &str, agent_name: &str, text: &str) -> Option<(String, String)> {
    match agent_id {
        "claude" if is_claude_auth_failure_text(text) => Some(("missing".into(), claude_auth_guidance())),
        "cursor-agent" if is_cursor_auth_failure_text(text) => {
            Some(("missing".into(), cursor_auth_guidance()))
        }
        "claude" | "cursor-agent" => None,
        _ => {
            if classify_service_failure(text) == Some("auth_required") {
                Some(("missing".into(), generic_auth_guidance(agent_name)))
            } else {
                None
            }
        }
    }
}

fn env_has(env: &HashMap<String, String>, keys: &[&str]) -> bool {
    keys.iter().any(|key| {
        env.get(*key).map(|v| !v.trim().is_empty()).unwrap_or(false)
            || std::env::var(key).map(|v| !v.trim().is_empty()).unwrap_or(false)
    })
}

async fn probe_auth(def: &AgentDef, executable: &std::path::Path, env: &HashMap<String, String>) -> (String, Option<String>) {
    let Some(probe) = &def.auth_probe else {
        return ("unchecked".into(), None);
    };
    // Environment short-circuit: an explicit API key/token satisfies auth
    // without running the probe. Claude enterprise providers count too.
    if env_has(env, probe.env_keys) {
        return ("ok".into(), None);
    }
    if def.id == "claude"
        && (env.get("CLAUDE_CODE_USE_BEDROCK").map(String::as_str) == Some("1")
            || std::env::var("CLAUDE_CODE_USE_BEDROCK").ok().as_deref() == Some("1")
            || env.get("CLAUDE_CODE_USE_VERTEX").map(String::as_str) == Some("1")
            || std::env::var("CLAUDE_CODE_USE_VERTEX").ok().as_deref() == Some("1"))
    {
        return ("ok".into(), None);
    }
    match run_probe(executable, probe.args, PROBE_TIMEOUT_SECS, Some(env)).await {
        Ok((stdout, stderr, _)) => {
            let output = format!("{stdout}\n{stderr}");
            match classify_probe_failure(def.id, def.name, &output) {
                Some((status, message)) => (status, Some(message)),
                None => ("ok".into(), None),
            }
        }
        Err(error) => {
            let output = error.clone();
            match classify_probe_failure(def.id, def.name, &output) {
                Some((status, message)) => (status, Some(message)),
                None => (
                    "unknown".into(),
                    Some(format!(
                        "无法通过 `{} {}` 验证 {} 的登录状态",
                        def.id,
                        probe.args.join(" "),
                        def.name
                    )),
                ),
            }
        }
    }
}

async fn detect_one(def: &'static AgentDef, env: HashMap<String, String>) -> AgentRuntime {
    let candidates = resolve_candidates(def, Some(&env));
    let Some((executable, version)) = probe_version(def, &candidates).await else {
        return AgentRuntime {
            detected: DetectedAgent {
                id: def.id.into(),
                name: def.name.into(),
                path: None,
                version: None,
                available: false,
                auth_status: "unchecked".into(),
                auth_message: None,
                models: def.fallback_models(),
                reasoning_options: def.reasoning_options(),
                supports_custom_model: def.supports_custom_model,
            },
            executable: None,
            capabilities: Vec::new(),
        };
    };
    let capabilities = probe_capabilities(def, &executable).await;
    let (auth_status, auth_message) = probe_auth(def, &executable, &env).await;
    AgentRuntime {
        detected: DetectedAgent {
            id: def.id.into(),
            name: def.name.into(),
            path: Some(executable.to_string_lossy().into_owned()),
            version: Some(version),
            available: true,
            auth_status,
            auth_message,
            models: def.fallback_models(),
            reasoning_options: def.reasoning_options(),
            supports_custom_model: def.supports_custom_model,
        },
        executable: Some(executable),
        capabilities,
    }
}

/// Full detection pass; concurrent across agents. Cached until `force` or the
/// first call of the session.
pub async fn detect(force: bool, overrides: &EnvOverrides) -> Arc<DetectionSnapshot> {
    let mut slot = snapshot_slot().lock().await;
    if !force
        && let Some(snapshot) = slot.as_ref()
    {
        return snapshot.clone();
    }
    let mut tasks = Vec::new();
    for def in defs() {
        let env = overrides.get(def.id).cloned().unwrap_or_default();
        tasks.push(tokio::spawn(detect_one(def, env)));
    }
    let mut agents = HashMap::new();
    for task in tasks {
        if let Ok(runtime) = task.await {
            agents.insert(runtime.detected.id.clone(), runtime);
        }
    }
    let snapshot = Arc::new(DetectionSnapshot { agents });
    *slot = Some(snapshot.clone());
    snapshot
}

/// Snapshot entry used by chat_start; runs detection on first use.
pub async fn resolve_agent(agent_id: &str, overrides: &EnvOverrides) -> Option<AgentRuntime> {
    let snapshot = detect(false, overrides).await;
    snapshot.agents.get(agent_id).cloned()
}

/// Drop the cached snapshot (e.g. when the user edits chat_agent_env).
pub async fn invalidate() {
    *snapshot_slot().lock().await = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_failure_classification_prefers_auth_over_rate_over_upstream() {
        assert_eq!(classify_service_failure("Error: 401 Unauthorized"), Some("auth_required"));
        assert_eq!(classify_service_failure("HTTP 429 too many requests"), Some("rate_limited"));
        assert_eq!(classify_service_failure("status 503 service unavailable"), Some("upstream_unavailable"));
        // Bare numbers without status context are not signals ("code" alone
        // does not count — it would match process-exit lines).
        assert_eq!(classify_service_failure("process exited with code 429"), None);
        assert_eq!(classify_service_failure("read 502 bytes, line 500"), None);
        assert_eq!(classify_service_failure("some random failure"), None);
        assert_eq!(classify_service_failure(""), None);
    }

    #[test]
    fn claude_auth_text_handles_json_and_plain() {
        assert!(is_claude_auth_failure_text(r#"{"authenticated":false}"#));
        assert!(!is_claude_auth_failure_text(r#"{"authenticated":true}"#));
        assert!(is_claude_auth_failure_text("Not logged in. Please run /login"));
        assert!(!is_claude_auth_failure_text(""));
    }

    #[test]
    fn cursor_auth_text_matches_canonical_phrases() {
        assert!(is_cursor_auth_failure_text("Authentication required. Run cursor-agent login."));
        assert!(is_cursor_auth_failure_text("not authenticated"));
        assert!(!is_cursor_auth_failure_text("Logged in as user@example.com"));
    }

    #[test]
    fn toolchain_bins_are_absolute_and_dedup_free() {
        let dirs = well_known_user_toolchain_bins();
        assert!(dirs.iter().all(|d| d.is_absolute()));
        let unique: HashSet<_> = dirs.iter().collect();
        assert_eq!(unique.len(), dirs.len());
    }
}

#[cfg(test)]
mod manual_probe {
    use super::*;
    #[tokio::test]
    #[ignore = "manual: probes real CLIs on this machine"]
    async fn detect_real_agents() {
        let snapshot = detect(true, &EnvOverrides::new()).await;
        for runtime in snapshot.agents.values() {
            let d = &runtime.detected;
            eprintln!(
                "{}: available={} path={:?} version={:?} auth={} caps={:?}",
                d.id, d.available, d.path, d.version, d.auth_status, runtime.capabilities
            );
        }
    }
}
