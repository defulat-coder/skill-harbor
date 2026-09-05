/**
 * Centralized TanStack Query key registry.
 *
 * Conventions:
 * - Top-level domains: skills / projects / presets / tools / settings / backup / search / workspace.
 * - Detail keys append segments: ["skills", "document", skillId].
 * - Invalidation usually targets a whole domain prefix (e.g. queryKeys.skills.all)
 *   so list + detail caches stay consistent after mutations and Rust events.
 */
export const queryKeys = {
  skills: {
    all: ["skills"] as const,
    list: () => ["skills", "list"] as const,
    document: (skillId: string) => ["skills", "document", skillId] as const,
    sourceDocument: (skillId: string) => ["skills", "source-document", skillId] as const,
    sourceDiff: (skillId: string) => ["skills", "source-diff", skillId] as const,
    guide: (skillId: string, projectId: string, skillRelativePath: string, agent: string) =>
      ["skills", "guide", skillId, projectId, skillRelativePath, agent] as const,
    tags: () => ["skills", "tags"] as const,
    toolToggles: (skillId: string, presetId: string) =>
      ["skills", "tool-toggles", skillId, presetId] as const,
    presetSkills: (presetId: string) => ["skills", "preset-skills", presetId] as const,
    presetSkillOrder: (presetId: string) => ["skills", "preset-skill-order", presetId] as const,
  },
  projects: {
    all: ["projects"] as const,
    list: () => ["projects", "list"] as const,
    skills: (projectId: string) => ["projects", projectId, "skills"] as const,
    skillDocument: (projectId: string, skillName: string) =>
      ["projects", projectId, "skill-document", skillName] as const,
    agentTargets: (projectId: string) => ["projects", projectId, "agent-targets"] as const,
    bindings: (projectId: string) => ["projects", projectId, "bindings"] as const,
    tasks: (projectId: string) => ["projects", projectId, "tasks"] as const,
  },
  presets: {
    all: ["presets"] as const,
    list: () => ["presets", "list"] as const,
    active: () => ["presets", "active"] as const,
  },
  tools: {
    all: ["tools"] as const,
    status: () => ["tools", "status"] as const,
    order: () => ["tools", "order"] as const,
  },
  settings: {
    all: ["settings"] as const,
    value: (key: string) => ["settings", key] as const,
    bundle: () => ["settings", "bundle"] as const,
    lastPanic: () => ["settings", "last-panic"] as const,
    centralRepoPath: () => ["settings", "central-repo-path"] as const,
    centralRepoWarnings: () => ["settings", "central-repo-warnings"] as const,
  },
  app: {
    update: () => ["app", "update"] as const,
    firstRunRestoreProbe: () => ["first-run", "restore-probe"] as const,
  },
  backup: {
    all: ["backup"] as const,
    status: () => ["backup", "status"] as const,
    deviceName: () => ["backup", "device-name"] as const,
    versions: (limit?: number) => ["backup", "versions", limit ?? null] as const,
    pendingConflicts: () => ["backup", "pending-conflicts"] as const,
    sizeReport: () => ["backup", "size-report"] as const,
  },
  search: {
    all: ["search"] as const,
    status: () => ["search", "status"] as const,
  },
  workspace: {
    all: ["workspace"] as const,
    localSkills: (agent: string) => ["workspace", "local-skills", agent] as const,
    localSkillDocument: (agent: string, skillName: string) =>
      ["workspace", "local-skills", agent, "document", skillName] as const,
    overviewCounts: (agentKeys: string) => ["workspace", "overview-counts", agentKeys] as const,
  },
  workbench: {
    runnerStatus: () => ["workbench", "runner-status"] as const,
    taskLog: (runId: string) => ["workbench", "task-log", runId] as const,
  },
  market: {
    all: ["market"] as const,
    leaderboard: (board: string) => ["market", "leaderboard", board] as const,
    search: (query: string, limit: number) => ["market", "search", query, limit] as const,
    guidePreview: (source: string, skillId: string) =>
      ["market", "guide-preview", source, skillId] as const,
  },
} as const;
