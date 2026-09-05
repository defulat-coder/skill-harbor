//! Project-first orchestration. Existing skill store and sync engine remain authoritative.
use super::projects::{resolve_agent_skills_roots, slugify_skill_dir_name};
use crate::core::{
    error::AppError,
    repo_lock::RepoLock,
    skill_store::{ProjectRecord, SkillStore},
    sync_engine,
};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::State;

#[derive(Clone, Serialize, Deserialize)]
pub struct Binding {
    pub skill_id: String,
    pub agent: String,
    pub target_path: String,
    pub mode: String,
    pub status: String,
}
#[derive(Serialize)]
pub struct DeployResult {
    pub skill_id: String,
    pub ok: bool,
    pub error: Option<String>,
}
#[derive(Serialize)]
pub struct CreateResult {
    pub project_id: String,
    pub results: Vec<DeployResult>,
}

fn bindings_key(id: &str) -> String {
    format!("workbench_bindings:{id}")
}
fn read_bindings(store: &SkillStore, id: &str) -> Result<Vec<Binding>, AppError> {
    match store.get_setting(&bindings_key(id)).map_err(AppError::db)? {
        Some(s) => serde_json::from_str(&s).map_err(AppError::db),
        None => Ok(vec![]),
    }
}
fn mode(value: &str) -> Result<sync_engine::SyncMode, AppError> {
    match value {
        "symlink" => Ok(sync_engine::SyncMode::Symlink),
        "copy" => Ok(sync_engine::SyncMode::Copy),
        _ => Err(AppError::invalid_input("请选择链接或项目副本")),
    }
}

pub fn deploy(
    store: &SkillStore,
    project_id: &str,
    ids: &[String],
    agent: &str,
    deploy_mode: &str,
) -> Result<Vec<DeployResult>, AppError> {
    let requested_mode = mode(deploy_mode)?;
    let project = store
        .get_project_by_id(project_id)
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("项目不存在"))?;
    // Keep the old argument for API compatibility, but a normal project only
    // acquires shared references. Linked global workspaces retain their mode.
    let selected_mode = if project.workspace_type == "linked" {
        requested_mode
    } else {
        sync_engine::SyncMode::Symlink
    };
    let deploy_mode = selected_mode.as_str();
    let (root, disabled_root) = resolve_agent_skills_roots(store, &project, agent)
        .ok_or_else(|| AppError::invalid_input("不支持的执行工具"))?;
    super::projects::ensure_project_skills_root(&project, &root)?;
    let mut bindings = read_bindings(store, project_id)?;
    let mut results = vec![];
    let mut seen = std::collections::HashSet::new();
    for id in ids.iter().filter(|id| seen.insert((*id).clone())) {
        let result = (|| -> Result<(), AppError> {
            let skill = store
                .get_skill_by_id(id)
                .map_err(AppError::db)?
                .ok_or_else(|| AppError::not_found("技能不存在"))?;
            let name = slugify_skill_dir_name(&skill.name);
            super::projects::ensure_safe_skill_relative_path(&name)?;
            let target = root.join(&name);
            let source = PathBuf::from(&skill.central_path);
            if !source.is_dir() {
                return Err(AppError::not_found("技能源目录不存在"));
            }
            if disabled_root
                .as_ref()
                .is_some_and(|d| std::fs::symlink_metadata(d.join(&name)).is_ok())
            {
                return Err(AppError::invalid_input(
                    "项目中已有停用的同名技能，请先启用或移出",
                ));
            }
            if std::fs::symlink_metadata(&target).is_ok() {
                // Retry only counts as success for a previously recorded, still-correct link.
                let owned = bindings.iter().any(|b| {
                    b.skill_id == *id
                        && b.agent == agent
                        && b.mode == deploy_mode
                        && b.target_path == target.to_string_lossy()
                });
                if owned
                    && deploy_mode == "symlink"
                    && target.canonicalize().ok() == source.canonicalize().ok()
                {
                    return Ok(());
                }
                return Err(AppError::invalid_input(
                    "项目已有同名技能，未覆盖；请先查看现有内容",
                ));
            }
            std::fs::create_dir_all(&root)?;
            let actual_mode = if project.workspace_type != "linked" {
                sync_engine::link_project_skill(&source, &target).map_err(AppError::io)?
            } else {
                sync_engine::sync_skill(
                    &source,
                    &target,
                    selected_mode,
                    sync_engine::ReplacePolicy::NoClobber,
                )
                .map_err(AppError::io)?
            };
            bindings.retain(|b| !(b.skill_id == *id && b.agent == agent));
            bindings.push(Binding {
                skill_id: id.clone(),
                agent: agent.into(),
                target_path: target.to_string_lossy().into(),
                mode: actual_mode.as_str().into(),
                status: "ready".into(),
            });
            // Save after each item so partial success can be retried without losing ownership.
            store
                .set_setting(
                    &bindings_key(project_id),
                    &serde_json::to_string(&bindings).map_err(AppError::db)?,
                )
                .map_err(AppError::db)?;
            Ok(())
        })();
        results.push(DeployResult {
            skill_id: id.clone(),
            ok: result.is_ok(),
            error: result.err().map(|e| e.to_string()),
        });
    }
    store
        .set_setting(&format!("workbench_agent:{project_id}"), agent)
        .map_err(AppError::db)?;
    Ok(results)
}

pub fn create(
    store: &SkillStore,
    path: &str,
    create_directory: bool,
    ids: &[String],
    agent: &str,
    deploy_mode: &str,
) -> Result<CreateResult, AppError> {
    mode(deploy_mode)?;
    if !crate::core::tool_adapters::all_tool_adapters(store)
        .iter()
        .any(|a| a.key == agent)
    {
        return Err(AppError::invalid_input("不支持的执行工具"));
    }
    let path = Path::new(path.trim());
    if !path.is_absolute() {
        return Err(AppError::invalid_input("请输入绝对路径"));
    }
    if create_directory {
        std::fs::create_dir_all(path)?;
    }
    if !path.is_dir() {
        return Err(AppError::invalid_input(
            "目录不存在，请选择创建目录或导入已有目录",
        ));
    }
    let canonical = path.canonicalize()?;
    let existing = store
        .get_all_projects()
        .map_err(AppError::db)?
        .into_iter()
        .find(|p| Path::new(&p.path).canonicalize().ok().as_ref() == Some(&canonical));
    let id = if let Some(p) = existing {
        p.id
    } else {
        let now = jiff::Timestamp::now().as_millisecond();
        let record = ProjectRecord {
            id: uuid::Uuid::new_v4().to_string(),
            name: canonical
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            path: canonical.to_string_lossy().into(),
            workspace_type: "project".into(),
            linked_agent_key: None,
            linked_agent_name: None,
            disabled_path: None,
            sort_order: 0,
            created_at: now,
            updated_at: now,
        };
        store.insert_project(&record).map_err(AppError::db)?;
        record.id
    };
    let results = deploy(store, &id, ids, agent, deploy_mode)?;
    Ok(CreateResult {
        project_id: id,
        results,
    })
}

#[tauri::command]
pub async fn workbench_create_project(
    store: State<'_, Arc<SkillStore>>,
    path: String,
    create_directory: bool,
    skill_ids: Vec<String>,
    agent: String,
    mode: String,
) -> Result<CreateResult, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = RepoLock::acquire_foreground("create project").map_err(AppError::io)?;
        create(&store, &path, create_directory, &skill_ids, &agent, &mode)
    })
    .await?
}

#[tauri::command]
pub async fn workbench_deploy_skills(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    skill_ids: Vec<String>,
    agent: String,
    mode: String,
) -> Result<Vec<DeployResult>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = RepoLock::acquire_foreground("deploy project skills").map_err(AppError::io)?;
        deploy(&store, &project_id, &skill_ids, &agent, &mode)
    })
    .await?
}

#[tauri::command]
pub async fn workbench_project_bindings(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
) -> Result<Vec<Binding>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut bindings = read_bindings(&store, &project_id)?;
        for binding in &mut bindings {
            let path = Path::new(&binding.target_path);
            binding.status = match std::fs::symlink_metadata(path) {
                Err(_) => "missing",
                Ok(meta) if meta.file_type().is_symlink() && !path.exists() => "broken",
                Ok(meta) if binding.mode == "symlink" && !meta.file_type().is_symlink() => {
                    "changed"
                }
                Ok(_) => "ready",
            }
            .into();
            if binding.mode == "symlink" && binding.status == "ready" {
                let skill = store
                    .get_skill_by_id(&binding.skill_id)
                    .map_err(AppError::db)?;
                if skill.map_or(true, |s| {
                    path.canonicalize().ok() != Path::new(&s.central_path).canonicalize().ok()
                }) {
                    binding.status = "changed".into();
                }
            }
        }
        Ok(bindings)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::skill_store::SkillRecord;
    use std::fs;
    use tempfile::{tempdir, TempDir};

    fn fixture() -> (TempDir, SkillStore) {
        let dir = tempdir().unwrap();
        let store = SkillStore::new(&dir.path().join("skills.db")).unwrap();
        (dir, store)
    }

    fn add_skill(store: &SkillStore, base: &Path, id: &str, name: &str) -> PathBuf {
        let source = base.join("library").join(id);
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("SKILL.md"), "original instructions").unwrap();
        store
            .insert_skill(&SkillRecord {
                id: id.into(),
                name: name.into(),
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
        source
    }

    fn project(store: &SkillStore, base: &Path) -> String {
        create(
            store,
            base.join("project").to_str().unwrap(),
            true,
            &[],
            "codex",
            "symlink",
        )
        .unwrap()
        .project_id
    }

    #[test]
    fn rejects_relative_project_path_without_registering_project() {
        let (_dir, store) = fixture();
        assert!(create(&store, "relative/project", true, &[], "codex", "symlink").is_err());
        assert!(store.get_all_projects().unwrap().is_empty());
    }

    #[test]
    fn importing_equivalent_paths_reuses_project() {
        let (dir, store) = fixture();
        let id = project(&store, dir.path());
        let imported = create(
            &store,
            dir.path().join("project/.").to_str().unwrap(),
            false,
            &[],
            "codex",
            "symlink",
        )
        .unwrap();
        assert_eq!(imported.project_id, id);
        assert_eq!(store.get_all_projects().unwrap().len(), 1);
    }

    #[test]
    fn existing_project_copy_is_preserved_when_adding_again() {
        let (dir, store) = fixture();
        let source = add_skill(&store, dir.path(), "s1", "example");
        let id = project(&store, dir.path());
        let target = dir.path().join("project/.codex/skills/example");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("SKILL.md"), "project customization").unwrap();
        let result = deploy(&store, &id, &["s1".into()], "codex", "copy").unwrap();
        assert!(!result[0].ok);
        assert!(!fs::symlink_metadata(&target)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "project customization"
        );
        assert_eq!(
            fs::read_to_string(source.join("SKILL.md")).unwrap(),
            "original instructions"
        );
    }

    #[cfg(unix)]
    #[test]
    fn project_add_ignores_legacy_copy_argument_and_global_copy_setting() {
        let (dir, store) = fixture();
        store.set_setting("sync_mode", "copy").unwrap();
        let source = add_skill(&store, dir.path(), "s1", "example");
        let id = project(&store, dir.path());
        assert!(deploy(&store, &id, &["s1".into()], "codex", "copy").unwrap()[0].ok);
        let bindings = read_bindings(&store, &id).unwrap();
        assert_eq!(bindings[0].mode, "symlink");
        let target = Path::new(&bindings[0].target_path);
        assert!(fs::symlink_metadata(target)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            target.canonicalize().unwrap(),
            source.canonicalize().unwrap()
        );
        fs::write(source.join("SKILL.md"), "global revision").unwrap();
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "global revision"
        );
        assert_eq!(
            store.get_setting("sync_mode").unwrap().as_deref(),
            Some("copy")
        );
    }

    #[test]
    fn same_name_conflict_does_not_overwrite_existing_files() {
        let (dir, store) = fixture();
        add_skill(&store, dir.path(), "s1", "example");
        let id = project(&store, dir.path());
        let target = dir.path().join("project/.codex/skills/example");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("SKILL.md"), "existing project content").unwrap();
        let result = deploy(&store, &id, &["s1".into()], "codex", "copy").unwrap();
        assert!(!result[0].ok);
        assert!(result[0].error.is_some());
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "existing project content"
        );
        assert!(read_bindings(&store, &id).unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn partial_deployment_keeps_successful_items_and_reports_each_failure() {
        let (dir, store) = fixture();
        add_skill(&store, dir.path(), "first", "first");
        add_skill(&store, dir.path(), "last", "last");
        let created = create(
            &store,
            dir.path().join("project").to_str().unwrap(),
            true,
            &[
                "first".into(),
                "missing".into(),
                "last".into(),
                "first".into(),
            ],
            "codex",
            "copy",
        )
        .unwrap();
        assert_eq!(
            created
                .results
                .iter()
                .map(|r| (r.skill_id.as_str(), r.ok))
                .collect::<Vec<_>>(),
            vec![("first", true), ("missing", false), ("last", true)]
        );
        assert!(created.results[1].error.is_some());
        let bindings = read_bindings(&store, &created.project_id).unwrap();
        assert_eq!(bindings.len(), 2);
        assert!(bindings
            .iter()
            .all(|b| Path::new(&b.target_path).join("SKILL.md").exists()));
        let reopened = SkillStore::new(&dir.path().join("skills.db")).unwrap();
        assert_eq!(
            read_bindings(&reopened, &created.project_id).unwrap().len(),
            2
        );
    }

    #[cfg(unix)]
    #[test]
    fn linked_deployment_is_retryable_and_removal_preserves_source() {
        let (dir, store) = fixture();
        let source = add_skill(&store, dir.path(), "s1", "example");
        let id = project(&store, dir.path());
        for _ in 0..2 {
            assert!(deploy(&store, &id, &["s1".into()], "codex", "symlink").unwrap()[0].ok);
        }
        let bindings = read_bindings(&store, &id).unwrap();
        assert_eq!(bindings.len(), 1);
        let target = Path::new(&bindings[0].target_path);
        assert!(fs::symlink_metadata(target)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            target.canonicalize().unwrap(),
            source.canonicalize().unwrap()
        );
        assert!(sync_engine::remove_recorded_target(target, "symlink").unwrap());
        assert!(fs::symlink_metadata(target).is_err());
        assert_eq!(
            fs::read_to_string(source.join("SKILL.md")).unwrap(),
            "original instructions"
        );
    }

    #[cfg(unix)]
    #[test]
    fn intermediate_symlink_cannot_redirect_deployment_outside_project() {
        let (dir, store) = fixture();
        add_skill(&store, dir.path(), "s1", "example");
        let id = project(&store, dir.path());
        let outside = dir.path().join("outside");
        fs::create_dir(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, dir.path().join("project/.codex")).unwrap();
        assert!(deploy(&store, &id, &["s1".into()], "codex", "copy").is_err());
        assert!(!outside.join("skills").exists());
        assert!(read_bindings(&store, &id).unwrap().is_empty());
    }
}
