use crate::core::{
    error::AppError,
    skill_store::SkillStore,
    task_runner::{self, RunnerStatus, TaskRun},
};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn start_task(
    store: State<'_, Arc<SkillStore>>,
    project_id: String,
    prompt: String,
    skill_ids: Vec<String>,
) -> Result<TaskRun, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || {
        task_runner::start_task(&store, project_id, prompt, skill_ids)
    })
    .await?
}
#[tauri::command]
pub async fn runner_status(store: State<'_, Arc<SkillStore>>) -> Result<RunnerStatus, AppError> {
    let store = store.inner().clone();
    tokio::task::spawn_blocking(move || task_runner::runner_status(&store)).await?
}
#[tauri::command]
pub async fn list_tasks(project_id: String) -> Result<Vec<TaskRun>, AppError> {
    tokio::task::spawn_blocking(move || task_runner::list_tasks(&project_id)).await?
}
#[tauri::command]
pub async fn cancel_task(run_id: String) -> Result<TaskRun, AppError> {
    tokio::task::spawn_blocking(move || task_runner::cancel_task(&run_id)).await?
}
#[tauri::command]
pub async fn get_task_log(run_id: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || task_runner::get_task_log(&run_id)).await?
}
