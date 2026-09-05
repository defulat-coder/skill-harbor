//! Local skill-directory search, backed by the bundled zvec-grep runtime.
use crate::core::{central_repo, error::AppError, skill_store::SkillStore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, path::{Path, PathBuf}, process::Stdio, sync::{Arc, Mutex, OnceLock}};
use tauri::{Manager, State};
use tokio::io::AsyncWriteExt;

const MODEL: &str = "local/multilingual-e5-small";
static SEARCH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Default)]
struct ProcessState { closing: bool, pids: BTreeSet<u32> }
#[derive(Default)]
struct SearchProcesses { state: Mutex<ProcessState> }
struct SearchProcessGuard { registry: Arc<SearchProcesses>, pid: u32 }
static SEARCH_PROCESSES: OnceLock<Arc<SearchProcesses>> = OnceLock::new();

fn terminate_search_tree(pid: u32) {
    // Synchronous and reaped: application exit must not launch detached cleanup work.
    #[cfg(unix)]
    let _ = std::process::Command::new("/bin/kill").args(["-KILL", "--", &format!("-{pid}")])
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
    #[cfg(windows)]
    let _ = std::process::Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
}
impl SearchProcesses {
    fn spawn(self: &Arc<Self>, command: &mut tokio::process::Command) -> Result<(tokio::process::Child, SearchProcessGuard), AppError> {
        // Hold the same lock through spawn and registration, so shutdown cannot
        // miss a just-started process or race a late spawn after the exit hook.
        let mut state = self.state.lock().map_err(AppError::internal)?;
        if state.closing { return Err(AppError::cancelled("应用正在退出，未启动检索进程")); }
        #[cfg(unix)]
        { use std::os::unix::process::CommandExt; command.as_std_mut().process_group(0); }
        let child = command.spawn().map_err(AppError::io)?;
        let pid = child.id().ok_or_else(|| AppError::internal("无法获取检索进程标识"))?;
        state.pids.insert(pid);
        Ok((child, SearchProcessGuard { registry: self.clone(), pid }))
    }
    fn remove(&self, pid: u32, terminate: bool) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.pids.remove(&pid) && terminate { terminate_search_tree(pid); }
    }
    fn shutdown(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.closing = true;
        for pid in std::mem::take(&mut state.pids) { terminate_search_tree(pid); }
    }
}
impl SearchProcessGuard {
    fn finish(self) { self.registry.remove(self.pid, false); }
}
impl Drop for SearchProcessGuard {
    fn drop(&mut self) { self.registry.remove(self.pid, true); }
}
/// Call from both normal application exit and explicit replacement/restart exits.
pub fn shutdown() {
    SEARCH_PROCESSES.get_or_init(|| Arc::new(SearchProcesses::default())).shutdown();
}


#[derive(Serialize, Deserialize)]
pub struct SearchStatus {
    root: String, available: bool, ready: bool, model: String, files: usize,
    #[serde(skip_serializing_if = "Option::is_none")] error: Option<String>,
}
#[derive(Deserialize)]
struct RawHit { path: String, line_start: u32, line_end: u32, text: String, score: f64 }
#[derive(Serialize)]
pub struct SearchHit { skill_id: String, name: String, path: String, line_start: u32, line_end: u32, text: String, score: f64 }
#[derive(Serialize)]
pub struct SearchResult { query: String, hits: Vec<SearchHit>, warning: Option<String> }

fn runtime_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let bundled = app.path().resource_dir().map_err(AppError::internal)?.join("search-runtime");
    if bundled.join("search.mjs").is_file() { return Ok(bundled); }
    #[cfg(debug_assertions)]
    {
        let development = Path::new(env!("CARGO_MANIFEST_DIR")).join("../search-runtime");
        if development.join("search.mjs").is_file() { return Ok(development); }
    }
    Err(AppError::not_found("检索组件缺失，请重新构建或安装完整应用"))
}
fn search_root() -> Result<PathBuf, AppError> { central_repo::skills_dir().canonicalize().map_err(AppError::io) }
fn cache_for(root: &Path) -> PathBuf {
    let key = hex::encode(Sha256::digest(root.to_string_lossy().as_bytes()));
    central_repo::home_base_dir().join("local-workbench/search").join(key)
}
fn parse_response(stdout: &[u8]) -> Result<Value, AppError> {
    // Native libraries may emit initialization diagnostics before our JSON line.
    let text = String::from_utf8_lossy(stdout);
    let envelope = text.lines().rev().filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|value| value.get("ok").is_some()).ok_or_else(|| AppError::internal("检索组件没有返回有效结果"))?;
    if envelope["ok"] != true { return Err(AppError::internal(envelope["error"].as_str().unwrap_or("本地检索失败"))); }
    envelope.get("result").cloned().ok_or_else(|| AppError::internal("检索结果不完整"))
}
async fn execute(app: &tauri::AppHandle, root: &Path, op: &str, query: Option<&str>) -> Result<Value, AppError> {
    let runtime = runtime_path(app)?;
    let executable = runtime.join("bin").join(if cfg!(windows) { "node.exe" } else { "node" });
    if !executable.is_file() { return Err(AppError::not_found("本地检索运行环境缺失，请运行 pnpm run search:prepare 后重新构建")); }
    let mut command = tokio::process::Command::new(executable);
    command.arg(runtime.join("search.mjs")).current_dir(&runtime)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    let registry = SEARCH_PROCESSES.get_or_init(|| Arc::new(SearchProcesses::default()));
    let (mut child, process_guard) = registry.spawn(&mut command)?;
    let input = serde_json::to_vec(&json!({"op":op,"root":root,"cacheDir":cache_for(root),"query":query})).map_err(AppError::internal)?;
    let mut stdin = child.stdin.take().ok_or_else(|| AppError::internal("无法打开检索输入"))?;
    let work = async move { stdin.write_all(&input).await?; stdin.shutdown().await?; drop(stdin); child.wait_with_output().await };
    let seconds = if op == "index" { 1800 } else if op == "status" { 30 } else { 300 };
    let output = match tokio::time::timeout(std::time::Duration::from_secs(seconds), work).await {
        Ok(result) => result.map_err(AppError::io)?,
        Err(_) => {
            return Err(AppError::internal("本地检索等待超时，请检查模型下载或索引状态后重试"));
        }
    };
    // wait_with_output has reaped a normally completed process. Remove its PID
    // immediately, avoiding a later cleanup attempt against a recycled PID.
    process_guard.finish();
    if output.stdout.len() > 4 * 1024 * 1024 { return Err(AppError::internal("检索结果过大")); }
    let result = parse_response(&output.stdout);
    if !output.status.success() && result.is_ok() { return Err(AppError::internal("检索进程异常退出")); }
    result
}
#[tauri::command]
pub async fn skill_search_status(app: tauri::AppHandle) -> Result<SearchStatus, AppError> {
    let _lock = SEARCH_LOCK.lock().await;
    let root = search_root()?;
    match execute(&app, &root, "status", None).await {
        Ok(value) => serde_json::from_value(value).map_err(AppError::internal),
        Err(error) => Ok(SearchStatus { root: root.to_string_lossy().into(), available: false, ready: false, model: MODEL.into(), files: 0, error: Some(error.to_string()) }),
    }
}
#[tauri::command]
pub async fn skill_search_index(app: tauri::AppHandle) -> Result<SearchStatus, AppError> {
    let _lock = SEARCH_LOCK.try_lock().map_err(|_| AppError::invalid_input("技能索引正在处理，请稍后再试"))?;
    let root = search_root()?;
    serde_json::from_value(execute(&app, &root, "index", None).await?).map_err(AppError::internal)
}
fn safe_document(root: &Path, path: &str) -> Option<PathBuf> {
    let root = root.canonicalize().ok()?;
    let resolved = Path::new(path).canonicalize().ok()?;
    if !resolved.starts_with(&root) || !resolved.is_file() { return None; }
    match resolved.extension()?.to_str()?.to_ascii_lowercase().as_str() { "md" | "mdx" => Some(resolved), _ => None }
}
#[tauri::command]
pub async fn skill_search_query(app: tauri::AppHandle, query: String, store: State<'_, Arc<SkillStore>>) -> Result<SearchResult, AppError> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 2000 { return Err(AppError::invalid_input("请输入1到2000字的问题")); }
    let _lock = SEARCH_LOCK.try_lock().map_err(|_| AppError::invalid_input("技能索引正在处理，请稍后再试"))?;
    let root = search_root()?;
    let result = execute(&app, &root, "query", Some(query)).await?;
    let raw: Vec<RawHit> = serde_json::from_value(result["hits"].clone()).map_err(AppError::internal)?;
    let skills = store.get_all_skills().map_err(AppError::internal)?;
    let mut hits = Vec::new();
    for hit in raw.into_iter().take(24) {
        let Some(path) = safe_document(&root, &hit.path) else { continue; };
        let Some(skill) = skills.iter().filter_map(|skill| Path::new(&skill.central_path).canonicalize().ok().map(|directory|(skill,directory)))
            .filter(|(_,directory)| path.starts_with(directory)).max_by_key(|(_,directory)| directory.components().count()).map(|(skill,_)|skill) else { continue; };
        if !hit.score.is_finite() { continue; }
        hits.push(SearchHit {skill_id:skill.id.clone(),name:skill.name.clone(),path:path.to_string_lossy().into(),line_start:hit.line_start.max(1),line_end:hit.line_end.max(hit.line_start).max(1),text:hit.text.chars().take(1400).collect(),score:hit.score});
        if hits.len()==8 { break; }
    }
    Ok(SearchResult { query:query.into(),hits,warning:result["warning"].as_str().map(String::from) })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    async fn process_fixture(registry: &Arc<SearchProcesses>) -> (tempfile::TempDir, tokio::process::Child, SearchProcessGuard, String) {
        let dir = tempfile::tempdir().unwrap();
        let mut command = tokio::process::Command::new("/bin/sh");
        command.args(["-c", "sleep 60 & echo $! > child.pid; wait"]).current_dir(dir.path());
        let (child, guard) = registry.spawn(&mut command).unwrap();
        for _ in 0..100 {
            if std::fs::read_to_string(dir.path().join("child.pid")).ok().and_then(|s| s.trim().parse::<u32>().ok()).is_some() { break; }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        let pid = std::fs::read_to_string(dir.path().join("child.pid")).unwrap();
        assert!(pid.trim().parse::<u32>().is_ok());
        (dir, child, guard, pid)
    }
    #[cfg(unix)]
    fn process_exists(pid: &str) -> bool {
        std::process::Command::new("/bin/kill").args(["-0", pid.trim()]).stderr(Stdio::null()).status().unwrap().success()
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn shutdown_terminates_registered_tree_and_rejects_new_spawn() {
        let registry = Arc::new(SearchProcesses::default());
        let (_dir, mut child, guard, descendant) = process_fixture(&registry).await;
        registry.shutdown();
        tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await.unwrap().unwrap();
        assert!(!process_exists(&descendant));
        assert!(registry.state.lock().unwrap().pids.is_empty());
        assert!(registry.spawn(&mut tokio::process::Command::new("/bin/sh")).is_err());
        drop(guard); // Idempotent: shutdown already removed the registration.
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn dropping_cancelled_operation_terminates_registered_tree() {
        let registry = Arc::new(SearchProcesses::default());
        let (_dir, mut child, guard, descendant) = process_fixture(&registry).await;
        drop(guard);
        tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await.unwrap().unwrap();
        assert!(!process_exists(&descendant));
        assert!(registry.state.lock().unwrap().pids.is_empty());
        assert!(!registry.state.lock().unwrap().closing);
    }
    #[test] fn protocol_ignores_native_noise_but_not_failure() {
        assert_eq!(parse_response(b"native log\n{\"ok\":true,\"result\":{\"files\":2}}\n").unwrap()["files"],2);
        assert!(parse_response(b"{\"ok\":false,\"error\":\"download failed\"}").is_err());
        assert!(parse_response(b"garbage").is_err());
    }
    #[test] fn source_boundary_rejects_outside_and_non_markdown() {
        let root=tempfile::tempdir().unwrap();let outside=tempfile::NamedTempFile::new().unwrap();
        let document=root.path().join("SKILL.md");std::fs::write(&document,"hello").unwrap();
        assert!(safe_document(root.path(),document.to_str().unwrap()).is_some());
        assert!(safe_document(root.path(),outside.path().to_str().unwrap()).is_none());
        #[cfg(unix)] {let link=root.path().join("escape.md");std::os::unix::fs::symlink(outside.path(),&link).unwrap();assert!(safe_document(root.path(),link.to_str().unwrap()).is_none());}
    }
}
