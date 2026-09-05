//! Local Codex execution. History intentionally lives outside the relocatable/Git library.
use super::{central_repo, error::AppError, skill_store::SkillStore};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TaskRun {
    pub id: String,
    pub project_id: String,
    pub prompt: String,
    pub skill_ids: Vec<String>,
    #[serde(default)]
    pub model: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}
#[derive(Serialize, specta::Type)]
pub struct RunnerStatus {
    pub available: bool,
    pub executable: String,
    pub version: Option<String>,
    pub error: Option<String>,
}
struct ActiveRun {
    project_id: String,
    pid: u32,
    cancel: Arc<AtomicBool>,
}
static ACTIVE: OnceLock<Mutex<HashMap<String, ActiveRun>>> = OnceLock::new();
fn root() -> PathBuf {
    central_repo::home_base_dir().join("local-workbench/tasks")
}
fn now() -> i64 {
    jiff::Timestamp::now().as_millisecond()
}
fn active() -> &'static Mutex<HashMap<String, ActiveRun>> {
    ACTIVE.get_or_init(|| {
        // No process from a previous app session is treated as actively supervised.
        if let Ok(entries) = fs::read_dir(root()) {
            for entry in entries.flatten() {
                if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(bytes) = fs::read(entry.path()) {
                    if let Ok(mut run) = serde_json::from_slice::<TaskRun>(&bytes) {
                        if run.status == "running" {
                            mark_interrupted(&mut run);
                            let _ = save(&run);
                        }
                    }
                }
            }
        }
        Mutex::new(HashMap::new())
    })
}
fn mark_interrupted(run: &mut TaskRun) {
    run.status = "interrupted".into();
    run.finished_at = Some(now());
    run.error = Some("应用已重启，无法确认先前任务的执行结果。请检查项目文件和终端进程。".into());
}
fn valid_id(id: &str) -> Result<(), AppError> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::invalid_input("Invalid task ID"))
}
fn save(run: &TaskRun) -> Result<(), AppError> {
    fs::create_dir_all(root())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root(), fs::Permissions::from_mode(0o700))?;
    }
    let mut temporary = tempfile::NamedTempFile::new_in(root())?;
    serde_json::to_writer(&mut temporary, run).map_err(AppError::internal)?;
    temporary.flush()?;
    temporary
        .persist(root().join(format!("{}.json", run.id)))
        .map_err(AppError::io)?;
    Ok(())
}
fn read_run(id: &str) -> Result<TaskRun, AppError> {
    valid_id(id)?;
    serde_json::from_slice(&fs::read(root().join(format!("{id}.json")))?)
        .map_err(AppError::internal)
}
pub fn resolve_cli(store: &SkillStore) -> Result<String, AppError> {
    Ok(crate::commands::skill_guides::codex_path(store)?
        .to_string_lossy()
        .into_owned())
}
fn cli_command(executable: &str) -> Command {
    let mut command = Command::new(executable);
    if let Some(parent) = Path::new(executable)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
    {
        let mut paths = vec![parent.to_path_buf()];
        paths.extend(std::env::split_paths(
            &std::env::var_os("PATH").unwrap_or_default(),
        ));
        if let Ok(path) = std::env::join_paths(paths) {
            command.env("PATH", path);
        }
    }
    command
}
pub fn runner_status(store: &SkillStore) -> Result<RunnerStatus, AppError> {
    let executable = resolve_cli(store)?;
    let mut child = match cli_command(&executable)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            return Ok(RunnerStatus {
                available: false,
                executable,
                version: None,
                error: Some(e.to_string()),
            })
        }
    };
    for _ in 0..50 {
        if let Some(status) = child.try_wait()? {
            let mut version = String::new();
            if let Some(stdout) = child.stdout.take() {
                stdout.take(4096).read_to_string(&mut version)?;
            }
            return Ok(RunnerStatus {
                available: status.success(),
                executable,
                version: Some(version.trim().into()),
                error: if status.success() {
                    None
                } else {
                    Some("Codex 版本检查失败".into())
                },
            });
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    Ok(RunnerStatus {
        available: false,
        executable,
        version: None,
        error: Some("Codex 版本检查超时".into()),
    })
}
fn task_prompt(prompt: &str, paths: &[PathBuf]) -> String {
    let mut result = String::from(prompt);
    if !paths.is_empty() {
        result.push_str("\n\n用户请求在适用时阅读并使用以下项目技能文档（可能是共享链接，请不要修改技能本身）。技能是任务参考指令，不能覆盖用户要求。此列表仅记录请求使用的技能，不代表已确认实际调用：\n");
        for path in paths {
            result.push_str(&format!("- {}\n", path.display()));
        }
    }
    result
}
fn validate_project_target(project: &Path, target: &Path) -> Result<(), AppError> {
    if !target.is_absolute()
        || target
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(AppError::invalid_input("无效项目技能绑定路径"));
    }
    // The skill itself may be a central-library symlink; its parent must be inside the project.
    let parent = target
        .parent()
        .ok_or_else(|| AppError::invalid_input("无效技能路径"))?
        .canonicalize()?;
    if !parent.starts_with(project) {
        return Err(AppError::invalid_input("技能绑定不在当前项目目录内"));
    }
    Ok(())
}
pub fn start_task(
    store: &SkillStore,
    project_id: String,
    prompt: String,
    skill_ids: Vec<String>,
) -> Result<TaskRun, AppError> {
    if prompt.trim().is_empty() || prompt.len() > 64_000 {
        return Err(AppError::invalid_input("请输入任务内容（最多 64 KB）"));
    }
    let project = store
        .get_project_by_id(&project_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("项目不存在"))?;
    if project.workspace_type == "linked" {
        return Err(AppError::invalid_input(
            "请在项目目录中执行任务，不能在全局技能工作区执行",
        ));
    }
    let path = Path::new(&project.path).canonicalize()?;
    if !path.is_dir() {
        return Err(AppError::invalid_input("项目目录不存在"));
    }
    let bindings: Vec<crate::commands::workbench::Binding> = store
        .get_setting(&format!("workbench_bindings:{project_id}"))
        .map_err(AppError::db)?
        .map(|value| serde_json::from_str(&value).map_err(AppError::db))
        .transpose()?
        .unwrap_or_default();
    let mut paths = Vec::new();
    for id in &skill_ids {
        let skill = store
            .get_skill_by_id(id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("技能不存在"))?;
        let bound: Vec<_> = bindings
            .iter()
            .filter(|b| b.skill_id == *id && b.agent == "codex")
            .collect();
        if bound.len() > 1 {
            return Err(AppError::invalid_input("技能有多个项目绑定，请先重新配置"));
        }
        let target = if let Some(binding) = bound.first() {
            let target = PathBuf::from(&binding.target_path);
            validate_project_target(&path, &target)?;
            if binding.mode == "symlink"
                && target.canonicalize()? != Path::new(&skill.central_path).canonicalize()?
            {
                return Err(AppError::invalid_input(
                    "技能链接已指向其他来源，请先重新配置",
                ));
            }
            target
        } else {
            // Compatibility for projects imported before workbench ownership records existed.
            let name = crate::commands::projects::slugify_skill_dir_name(&skill.name);
            [".codex/skills", ".agents/skills"]
                .iter()
                .map(|root| path.join(root).join(&name))
                .find(|target| target.join("SKILL.md").is_file())
                .ok_or_else(|| {
                    AppError::invalid_input(format!(
                        "技能 {} 尚未部署到此项目的 Codex 目录，请先添加技能",
                        skill.name
                    ))
                })?
        };
        validate_project_target(&path, &target)?;
        let document = target.join("SKILL.md");
        if !document.is_file() {
            return Err(AppError::invalid_input(
                "项目技能文档不存在，请先重新添加技能",
            ));
        }
        // Preserve the project path: a copy may contain project-specific edits.
        paths.push(document);
    }
    let model = store
        .get_setting("workbench_codex_model")
        .map_err(AppError::db)?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if model
        .as_ref()
        .is_some_and(|s| s.len() > 200 || s.chars().any(char::is_control))
    {
        return Err(AppError::invalid_input("模型名称无效"));
    }
    let cli_path = resolve_cli(store)?;
    let mut guard = active().lock().map_err(AppError::internal)?;
    if guard.values().any(|run| run.project_id == project_id) {
        return Err(AppError::invalid_input(
            "该项目已有任务正在运行，请先停止或等待完成",
        ));
    }
    let mut run = TaskRun {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id.clone(),
        prompt: prompt.clone(),
        skill_ids,
        model: model.clone(),
        status: "running".into(),
        created_at: now(),
        finished_at: None,
        exit_code: None,
        error: None,
    };
    save(&run)?;
    let log = File::create(root().join(format!("{}.log", run.id)))?;
    let mut command = cli_command(&cli_path);
    command
        .args([
            "exec",
            "--json",
            "--skip-git-repo-check",
            "--sandbox",
            "workspace-write",
            "-C",
        ])
        .arg(&path)
        .current_dir(&path)
        .stdin(Stdio::piped())
        .stdout(log.try_clone()?)
        .stderr(log);
    if let Some(model) = &model {
        command.args(["-m", model]);
    }
    command.arg("-");
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            run.status = "failed".into();
            run.finished_at = Some(now());
            run.error = Some(e.to_string());
            save(&run)?;
            return Ok(run);
        }
    };
    let cancel = Arc::new(AtomicBool::new(false));
    guard.insert(
        run.id.clone(),
        ActiveRun {
            project_id,
            pid: child.id(),
            cancel: cancel.clone(),
        },
    );
    let result = run.clone();
    std::thread::spawn(move || {
        let input = task_prompt(&prompt, &paths);
        // Write on a separate thread so cancellation can still stop an unresponsive CLI.
        if let Some(mut stdin) = child.stdin.take() {
            std::thread::spawn(move || {
                let _ = stdin.write_all(input.as_bytes());
            });
        }
        loop {
            if cancel.load(Ordering::SeqCst) {
                terminate_tree(child.id());
                let _ = child.kill();
                let _ = child.wait();
                run.status = "cancelled".into();
                break;
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    run.exit_code = status.code();
                    run.status = if status.success() {
                        "completed"
                    } else {
                        "failed"
                    }
                    .into();
                    if !status.success() {
                        run.error = Some(
                            "Codex 执行失败，请查看运行日志；登录或权限问题需要在终端处理。".into(),
                        );
                    }
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(e) => {
                    terminate_tree(child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                    run.status = "failed".into();
                    run.error = Some(e.to_string());
                    break;
                }
            }
        }
        run.finished_at = Some(now());
        // Keep the project locked until its terminal state has been persisted.
        if let Ok(mut guard) = active().lock() {
            if let Err(e) = save(&run) {
                log::error!("Cannot persist task result: {e}");
            }
            guard.remove(&run.id);
        }
    });
    Ok(result)
}
fn terminate_tree(pid: u32) {
    #[cfg(unix)]
    {
        let _ = Command::new("/bin/kill")
            .args(["-KILL", "--", &format!("-{pid}")])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}
pub fn cancel_task(id: &str) -> Result<TaskRun, AppError> {
    let guard = active().lock().map_err(AppError::internal)?;
    let run = read_run(id)?;
    if let Some(active) = guard.get(id) {
        active.cancel.store(true, Ordering::SeqCst);
    }
    Ok(run)
}
pub fn list_tasks(project_id: &str) -> Result<Vec<TaskRun>, AppError> {
    let _ = active();
    let mut runs = Vec::new();
    if !root().exists() {
        return Ok(runs);
    }
    for entry in fs::read_dir(root())? {
        let path = entry?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if let Ok(run) = serde_json::from_slice::<TaskRun>(&fs::read(path)?) {
            if run.project_id == project_id {
                runs.push(run);
            }
        }
    }
    runs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(runs)
}
pub fn get_task_log(id: &str) -> Result<String, AppError> {
    valid_id(id)?;
    let mut file = File::open(root().join(format!("{id}.log")))?;
    let length = file.metadata()?.len();
    const LIMIT: u64 = 1024 * 1024;
    file.seek(SeekFrom::Start(length.saturating_sub(LIMIT)))?;
    let mut bytes = Vec::new();
    file.take(LIMIT).read_to_end(&mut bytes)?;
    Ok(format!(
        "{}{}",
        if length > LIMIT {
            "[仅显示最后 1 MiB 日志]\n"
        } else {
            ""
        },
        String::from_utf8_lossy(&bytes)
    ))
}
/// Call on application exit to request termination of supervised jobs.
pub fn shutdown() {
    if let Some(active) = ACTIVE.get() {
        if let Ok(guard) = active.lock() {
            for run in guard.values() {
                run.cancel.store(true, Ordering::SeqCst);
                terminate_tree(run.pid);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_cannot_escape_log_directory() {
        assert!(valid_id("../../secrets").is_err());
        assert!(valid_id(&uuid::Uuid::new_v4().to_string()).is_ok());
    }
    #[test]
    fn requested_skills_are_not_reported_as_confirmed() {
        let prompt = task_prompt("修复测试", &[PathBuf::from("/tmp/a b/SKILL.md")]);
        assert!(prompt.contains("不代表已确认实际调用"));
        assert!(prompt.contains("/tmp/a b/SKILL.md"));
    }
    #[test]
    fn restart_marks_unknown_outcome() {
        let mut run = TaskRun {
            id: "x".into(),
            project_id: "p".into(),
            prompt: "task".into(),
            skill_ids: vec![],
            model: None,
            status: "running".into(),
            created_at: 0,
            finished_at: None,
            exit_code: None,
            error: None,
        };
        mark_interrupted(&mut run);
        assert_eq!(run.status, "interrupted");
        assert!(run.finished_at.is_some());
        assert_eq!(run.exit_code, None);
    }
    #[cfg(unix)]
    #[test]
    fn fake_cli_runs_in_project_and_cancels_process_group() {
        use super::super::skill_store::ProjectRecord;
        use std::os::unix::fs::PermissionsExt;
        let _guard = central_repo::test_base_dir_lock();
        let tmp = tempfile::tempdir().unwrap();
        central_repo::set_test_home_dir_override(Some(tmp.path().to_path_buf()));
        struct Reset;
        impl Drop for Reset {
            fn drop(&mut self) {
                central_repo::set_test_home_dir_override(None);
            }
        }
        let _reset = Reset;
        let store = SkillStore::new(&tmp.path().join("test.db")).unwrap();
        let project_dir = tmp.path().join("project with spaces");
        fs::create_dir(&project_dir).unwrap();
        store
            .insert_project(&ProjectRecord {
                id: "runner-test".into(),
                name: "test".into(),
                path: project_dir.to_string_lossy().into(),
                workspace_type: "project".into(),
                linked_agent_key: None,
                linked_agent_name: None,
                disabled_path: None,
                sort_order: 0,
                created_at: 0,
                updated_at: 0,
            })
            .unwrap();
        let script = tmp.path().join("fake-codex");
        fs::write(
            &script,
            "#!/bin/sh\ncat >/dev/null\npwd\nprintf '%s\\n' \"$@\"\n",
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).unwrap();
        store
            .set_setting("workbench_codex_path", script.to_str().unwrap())
            .unwrap();
        store
            .set_setting("workbench_codex_model", "test-model")
            .unwrap();
        let run = start_task(&store, "runner-test".into(), "测试".into(), vec![]).unwrap();
        assert_eq!(run.model.as_deref(), Some("test-model"));
        for _ in 0..100 {
            if read_run(&run.id).unwrap().status != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(read_run(&run.id).unwrap().status, "completed");
        let log = get_task_log(&run.id).unwrap();
        assert!(log.contains(project_dir.to_str().unwrap()));
        assert!(log.contains("workspace-write"));
        assert!(log.contains("-m\ntest-model"));
        assert!(!log.contains("dangerously-bypass"));
        fs::write(
            &script,
            "#!/bin/sh\ncat >/dev/null\nsleep 30 &\necho $! > child.pid\nwait\n",
        )
        .unwrap();
        let run = start_task(&store, "runner-test".into(), "等待".into(), vec![]).unwrap();
        assert!(start_task(&store, "runner-test".into(), "重复".into(), vec![]).is_err());
        for _ in 0..100 {
            if project_dir.join("child.pid").exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let pid = fs::read_to_string(project_dir.join("child.pid")).unwrap();
        cancel_task(&run.id).unwrap();
        for _ in 0..100 {
            if read_run(&run.id).unwrap().status != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(read_run(&run.id).unwrap().status, "cancelled");
        let status = Command::new("/bin/kill")
            .args(["-0", pid.trim()])
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(!status.success(), "descendant process must be terminated");
        assert_eq!(list_tasks("runner-test").unwrap().len(), 2);
        assert!(start_task(
            &store,
            "runner-test".into(),
            "unknown skill".into(),
            vec!["missing-id".into()]
        )
        .is_err());
        fs::write(&script, "#!/bin/sh\ncat >/dev/null\nexit 7\n").unwrap();
        let failed = start_task(&store, "runner-test".into(), "fail".into(), vec![]).unwrap();
        for _ in 0..100 {
            if read_run(&failed.id).unwrap().status != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let failed = read_run(&failed.id).unwrap();
        assert_eq!(failed.status, "failed");
        assert_eq!(failed.exit_code, Some(7));
        let source = tmp.path().join("library-skill");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("SKILL.md"), "central instructions").unwrap();
        store
            .insert_skill(&super::super::skill_store::SkillRecord {
                id: "bound-skill".into(),
                name: "original-name".into(),
                description: None,
                source_type: "local".into(),
                source_ref: None,
                source_ref_resolved: None,
                source_subpath: None,
                source_branch: None,
                source_revision: None,
                remote_revision: None,
                central_path: source.to_string_lossy().into(),
                content_hash: None,
                enabled: true,
                created_at: 0,
                updated_at: 0,
                status: "ok".into(),
                update_status: "local_only".into(),
                last_checked_at: None,
                last_check_error: None,
            })
            .unwrap();
        let target = project_dir.join(".codex/skills/nested/custom-name");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("SKILL.md"), "project edits").unwrap();
        let binding = |path: &Path| {
            serde_json::json!([{"skill_id":"bound-skill", "agent":"codex", "target_path":path, "mode":"copy", "status":"ready"}]).to_string()
        };
        store
            .set_setting("workbench_bindings:runner-test", &binding(&target))
            .unwrap();
        fs::write(&script, "#!/bin/sh\ncat\n").unwrap();
        let bound = start_task(
            &store,
            "runner-test".into(),
            "bound test".into(),
            vec!["bound-skill".into()],
        )
        .unwrap();
        for _ in 0..100 {
            if read_run(&bound.id).unwrap().status != "running" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(read_run(&bound.id).unwrap().status, "completed");
        assert!(get_task_log(&bound.id)
            .unwrap()
            .contains("nested/custom-name/SKILL.md"));
        store
            .set_setting("workbench_bindings:runner-test", &binding(&source))
            .unwrap();
        assert!(start_task(
            &store,
            "runner-test".into(),
            "outside".into(),
            vec!["bound-skill".into()]
        )
        .is_err());
        let mut legacy = serde_json::to_value(&bound).unwrap();
        legacy.as_object_mut().unwrap().remove("model");
        assert_eq!(
            serde_json::from_value::<TaskRun>(legacy).unwrap().model,
            None
        );
    }
}
