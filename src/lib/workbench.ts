import { invoke } from "@tauri-apps/api/core";
export interface Binding {
  skill_id: string;
  agent: string;
  target_path: string;
  mode: string;
  status: string;
}
export interface DeployResult {
  skill_id: string;
  ok: boolean;
  error?: string;
}
export interface TaskRun {
  model: string | null;
  id: string;
  project_id: string;
  prompt: string;
  skill_ids: string[];
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  created_at: number;
  finished_at: number | null;
  exit_code: number | null;
  error: string | null;
}
export const createWorkbenchProject = (
  path: string,
  createDirectory: boolean,
  skillIds: string[],
  agent: string,
  mode: string,
) =>
  invoke<{ project_id: string; results: DeployResult[] }>(
    "workbench_create_project",
    { path, createDirectory, skillIds, agent, mode },
  );
export const deployWorkbenchSkills = (
  projectId: string,
  skillIds: string[],
  agent: string,
  mode: string,
) =>
  invoke<DeployResult[]>("workbench_deploy_skills", {
    projectId,
    skillIds,
    agent,
    mode,
  });
export const projectBindings = (projectId: string) =>
  invoke<Binding[]>("workbench_project_bindings", { projectId });
export const startTask = (
  projectId: string,
  prompt: string,
  skillIds: string[],
) => invoke<TaskRun>("start_task", { projectId, prompt, skillIds });
export const listTasks = (projectId: string) =>
  invoke<TaskRun[]>("list_tasks", { projectId });
export const cancelTask = (runId: string) =>
  invoke<TaskRun>("cancel_task", { runId });
export const getTaskLog = (runId: string) =>
  invoke<string>("get_task_log", { runId });
export const runnerStatus = () =>
  invoke<{
    available: boolean;
    executable: string;
    version: string | null;
    error: string | null;
  }>("runner_status");
