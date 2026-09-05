import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ManagedSkill, Preset, Project, ToolInfo } from "../lib/tauri";
import * as api from "../lib/tauri";
import i18n from "../i18n";
import { queryKeys } from "../lib/queryKeys";
import { resolveViewedPreset } from "../lib/viewedPreset";
import { useUIStore } from "../stores/useUIStore";

const EMPTY_SKILLS: ManagedSkill[] = [];
const EMPTY_PRESETS: Preset[] = [];
const EMPTY_TOOLS: ToolInfo[] = [];
const EMPTY_PROJECTS: Project[] = [];

/**
 * Read model for the app shell. Server state comes straight from TanStack
 * Query; client UI state comes from the zustand UI store. Same field surface
 * as the old AppContext, minus clearAppError (no consumers: the error is now
 * derived from query state, so a successful refetch clears it automatically).
 */
export function useApp() {
  const queryClient = useQueryClient();

  const presetsQuery = useQuery({
    queryKey: queryKeys.presets.list(),
    queryFn: api.getPresets,
  });
  const activePresetQuery = useQuery({
    queryKey: queryKeys.presets.active(),
    queryFn: api.getActivePreset,
  });
  const toolsQuery = useQuery({
    queryKey: queryKeys.tools.status(),
    queryFn: api.getToolStatus,
  });
  const managedSkillsQuery = useQuery({
    queryKey: queryKeys.skills.list(),
    queryFn: api.getManagedSkills,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: api.getProjects,
  });

  const presets = presetsQuery.data ?? EMPTY_PRESETS;
  const activePreset = activePresetQuery.data ?? null;
  const tools = toolsQuery.data ?? EMPTY_TOOLS;
  const managedSkills = managedSkillsQuery.data ?? EMPTY_SKILLS;
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  // True only while the initial round is in flight; background refetches
  // (invalidation, window focus) no longer flip the app back to "loading".
  const loading =
    presetsQuery.isLoading ||
    activePresetQuery.isLoading ||
    toolsQuery.isLoading ||
    managedSkillsQuery.isLoading ||
    projectsQuery.isLoading;

  // Surface query failures through the appError slot; a successful refetch
  // clears it again because the value is derived, not stored.
  const failedItemKey = presetsQuery.error
    ? "common.presets"
    : toolsQuery.error
      ? "common.agents"
      : managedSkillsQuery.error
        ? "common.skills"
        : null;
  const appError = failedItemKey
    ? i18n.t("common.loadFailed", { item: i18n.t(failedItemKey) })
    : null;

  const viewedPresetId = useUIStore((s) => s.viewedPresetId);
  const setViewedPresetId = useUIStore((s) => s.setViewedPresetId);
  const helpOpen = useUIStore((s) => s.helpOpen);
  const openHelp = useUIStore((s) => s.openHelp);
  const closeHelp = useUIStore((s) => s.closeHelp);
  const detailSkillId = useUIStore((s) => s.detailSkillId);
  const openSkillDetailById = useUIStore((s) => s.openSkillDetailById);
  const closeSkillDetail = useUIStore((s) => s.closeSkillDetail);
  const appUpdate = useUIStore((s) => s.appUpdate);
  const refreshAppUpdate = useUIStore((s) => s.refreshAppUpdate);

  const refreshPresets = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.presets.list() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.presets.active() }),
    ]);
  }, [queryClient]);

  const refreshTools = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.tools.status() });
  }, [queryClient]);

  const refreshProjects = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  }, [queryClient]);

  const refreshManagedSkills = useCallback(async () => {
    // Managed skill changes affect project sync health badges, the git/backup
    // sync indicator, the unresolved-conflict badges and per-agent on-disk
    // skill scans in the workspace views.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.backup.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all }),
    ]);
  }, [queryClient]);

  const refreshAppData = useCallback(async () => {
    await Promise.all([
      refreshPresets(),
      refreshTools(),
      refreshManagedSkills(),
      refreshProjects(),
    ]);
  }, [refreshManagedSkills, refreshProjects, refreshPresets, refreshTools]);

  const applyPresetToDefault = useCallback(
    async (id: string) => {
      await api.applyPresetToDefault(id);
      await Promise.all([refreshPresets(), refreshManagedSkills()]);
    },
    [refreshManagedSkills, refreshPresets],
  );

  const viewedPreset = resolveViewedPreset(viewedPresetId, presets, activePreset);

  return {
    presets,
    activePreset,
    viewedPreset,
    tools,
    managedSkills,
    projects,
    loading,
    appError,
    helpOpen,
    detailSkillId,
    appUpdate,
    refreshAppUpdate,
    refreshAppData,
    refreshPresets,
    refreshTools,
    refreshManagedSkills,
    refreshProjects,
    setViewedPresetId,
    applyPresetToDefault,
    openHelp,
    closeHelp,
    openSkillDetailById,
    closeSkillDetail,
  };
}
