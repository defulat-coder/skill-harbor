import { CardActionMenu } from "../components/CardActionMenu";
import { Disclosure } from "../components/ui/Disclosure";
import { LoadingState } from "../components/ui/LoadingState";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import styles from "./WorkspaceView.module.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Navigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Download,
  FileText,
  Globe,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  CircleSlash,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../hooks/useApp";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PresetBar } from "../components/PresetBar";
import { AgentIcon } from "../components/AgentIcon";
import { DetailSheet } from "../components/DetailSheet";
import { SkillMarkdown } from "../components/SkillMarkdown";
import { DocumentDiffViewer } from "../components/DocumentDiffViewer";
import * as api from "../lib/tauri";
import { queryKeys } from "../lib/queryKeys";
import type { ManagedSkill, ProjectSkill } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import {
  getTagActiveColor,
  getTagColor,
  pruneStaleTagFilters,
  UNTAGGED_FILTER,
} from "../lib/skillTags";
import { getSyncStatusMeta } from "../lib/syncStatusMeta";
import { AddSkillsSheet } from "../components/AddSkillsSheet";
import type { WorkspaceConfig } from "./workspaceConfigs";

const EMPTY_LOCAL_SKILLS: ProjectSkill[] = [];

function compactHomePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

interface WorkspaceSkillCardTag {
  label: string;
  className: string;
}

interface WorkspaceSkillCardStatus {
  label: string;
  className: string;
}

function WorkspaceSkillCard({
  viewMode,
  title,
  description,
  tags = [],
  status,
  fileCount = 0,
  active = false,
  actions,
  actionsHover = false,
  onClick,
}: {
  viewMode: "grid" | "list";
  title: string;
  description?: string | null;
  tags?: WorkspaceSkillCardTag[];
  status: WorkspaceSkillCardStatus;
  fileCount?: number;
  active?: boolean;
  actions?: ReactNode;
  actionsHover?: boolean;
  onClick: () => void;
}) {
  // The whole card is clickable; nested controls (title button, action menu)
  // stop propagation, so only activate when the keydown lands on the card itself.
  const handleCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };
  if (viewMode === "list") {
    return (
      <div
        className={cn(
          styles.skillRow,
          "group relative flex cursor-pointer items-center gap-3.5 px-3.5 py-3",
        )}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={handleCardKeyDown}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              active
                ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                : "bg-surface-active",
            )}
          />
        </div>
        <h3
          className="w-[180px] shrink-0 truncate text-[14px] font-semibold text-secondary group-hover:text-primary"
          title={title}
        >
          <button
            className={styles.titleButton}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            {title}
          </button>
        </h3>
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">{description || "-"}</p>
        {tags.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  tag.className,
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", status.className)}
          >
            {status.label}
          </span>
          {fileCount > 0 && (
            <span className="flex items-center gap-1 text-[12px] text-faint">
              <FileText className="h-3.5 w-3.5" />
              {fileCount}
            </span>
          )}
        </div>
        {actions && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              actionsHover &&
                "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        styles.skillCard,
        "group relative flex h-full cursor-pointer flex-col overflow-hidden",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleCardKeyDown}
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-1.5">
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              active
                ? "bg-accent-light shadow-[0_0_0_3px_var(--color-accent-bg)]"
                : "bg-surface-active",
            )}
          />
        </div>
        <h3
          className="flex-1 truncate text-[14px] font-semibold text-primary group-hover:text-accent-light"
          title={title}
        >
          <button
            className={styles.titleButton}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            {title}
          </button>
        </h3>
        {fileCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] text-faint">
            <FileText className="h-3.5 w-3.5" />
            {fileCount}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-3">
        <p className="truncate text-[13px] leading-[18px] text-muted">{description || "-"}</p>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  tag.className,
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-faint px-3.5 py-2.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", status.className)}>
          {status.label}
        </span>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    </div>
  );
}

/* Colors come from src/lib/syncStatusMeta.ts; only the i18n labels stay local
   (this page uses the globalWorkspace.* key namespace). */
const SYNC_STATUS_LABEL_KEYS: Record<ProjectSkill["sync_status"], string> = {
  in_sync: "globalWorkspace.localSkills.status.inSync",
  project_newer: "globalWorkspace.localSkills.status.localNewer",
  center_newer: "globalWorkspace.localSkills.status.centerNewer",
  diverged: "globalWorkspace.localSkills.status.diverged",
  project_only: "globalWorkspace.localSkills.status.localOnly",
};

export function WorkspaceView({ config }: { config: WorkspaceConfig }) {
  const { agentKey } = useParams({ strict: false });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { tools, managedSkills, presets, refreshManagedSkills, refreshTools } = useApp();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removingLocalSkillId, setRemovingLocalSkillId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [localActionKey, setLocalActionKey] = useState<string | null>(null);
  const [localDetailSkill, setLocalDetailSkill] = useState<ProjectSkill | null>(null);
  const [localContentTab, setLocalContentTab] = useState<"local" | "diff" | "center">("local");
  const [uploadConfirmSkill, setUploadConfirmSkill] = useState<ProjectSkill | null>(null);
  const [pullConfirmSkill, setPullConfirmSkill] = useState<ProjectSkill | null>(null);
  const [deleteLocalConfirmSkill, setDeleteLocalConfirmSkill] = useState<ProjectSkill | null>(null);

  // Cross-category redirect: a deep link like /global-workspace/openclaw should
  // land on /lobster-workspace/openclaw. Compute it before any filtering so a
  // category mismatch doesn't briefly render "agent not found".
  const requestedTool = useMemo(
    () => (agentKey ? (tools.find((t) => t.key === agentKey) ?? null) : null),
    [agentKey, tools],
  );
  const needsRedirect = !!agentKey && !!requestedTool && requestedTool.category !== config.category;

  const workspacePaths =
    config.category === "lobster"
      ? ({ overview: "/lobster-workspace", agent: "/lobster-workspace/$agentKey" } as const)
      : ({ overview: "/global-workspace", agent: "/global-workspace/$agentKey" } as const);

  const installedTools = useMemo(
    () => tools.filter((t) => t.installed && t.enabled && t.category === config.category),
    [tools, config.category],
  );

  const skillCountByAgent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tool of installedTools) {
      map[tool.key] = managedSkills.filter((s) =>
        s.targets.some((target) => target.tool === tool.key),
      ).length;
    }
    return map;
  }, [installedTools, managedSkills]);

  // Overview cards should reflect each agent's ACTUAL on-disk skill count —
  // including skills installed outside SkillHarbor — to match the per-agent
  // detail badge. The managed-only count above reads 0 for an agent whose
  // skills all live on disk but were never imported (#287). Filled from a
  // per-agent scan query that falls back to the managed count until it
  // resolves; scoped to the overview (currentToolKey === null).
  const currentTool = useMemo(
    () => (agentKey ? (installedTools.find((t) => t.key === agentKey) ?? null) : null),
    [agentKey, installedTools],
  );

  // Preset actions must target what is actually rendered: a single agent when
  // `currentTool` resolves, otherwise every installed agent in this category.
  // Falling back to the raw URL `agentKey` would let a stale deep link (a
  // bookmarked route for a since-disabled or uninstalled agent) mutate the
  // hidden agent while the overview is shown.
  const presetBarAgentKeys = useMemo(
    () => (currentTool ? [currentTool.key] : installedTools.map((t) => t.key)),
    [currentTool, installedTools],
  );
  const currentToolKey = currentTool?.key ?? null;

  const localSkillsQuery = useQuery({
    queryKey: queryKeys.workspace.localSkills(currentToolKey ?? ""),
    queryFn: () => api.getGlobalLocalSkills(currentToolKey!),
    enabled: !!currentToolKey,
  });
  const localSkills = localSkillsQuery.data ?? EMPTY_LOCAL_SKILLS;
  const localSkillsLoading = !!currentToolKey && localSkillsQuery.isLoading;
  const localSkillsError = localSkillsQuery.error
    ? getErrorMessage(localSkillsQuery.error, t("common.error"))
    : null;
  useEffect(() => {
    if (localSkillsQuery.error) {
      toast.error(getErrorMessage(localSkillsQuery.error, t("common.error")));
    }
  }, [localSkillsQuery.error, t]);

  const loadLocalSkills = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
  }, [queryClient]);

  // Depend on the managedSkills-driven invalidation chain (not just a length):
  // a target-only enable/disable or an externally added unmanaged skill changes
  // on-disk presence, and refreshManagedSkills / the file watcher invalidate
  // the workspace domain so the overview counts re-scan and stay accurate
  // (#287).
  const overviewCountsQuery = useQuery({
    queryKey: queryKeys.workspace.overviewCounts(installedTools.map((tool) => tool.key).join(",")),
    queryFn: async () => {
      const entries = await Promise.all(
        installedTools.map(async (tool) => {
          try {
            const skills = await api.getGlobalLocalSkills(tool.key);
            return [tool.key, skills.length] as const;
          } catch {
            // Keep the managed-count fallback for an agent that fails to scan.
            return [tool.key, null] as const;
          }
        }),
      );
      // Agents whose scan failed are omitted so they fall back to the managed
      // count rather than showing a stale value.
      const next: Record<string, number> = {};
      for (const [key, count] of entries) {
        if (count !== null) next[key] = count;
      }
      return next;
    },
    enabled: !currentToolKey && installedTools.length > 0,
  });
  const localCountByAgent = overviewCountsQuery.data ?? {};

  const [prevDetailKey, setPrevDetailKey] = useState(currentTool?.key);
  if (prevDetailKey !== currentTool?.key) {
    setPrevDetailKey(currentTool?.key);
    setLocalDetailSkill(null);
    setUploadConfirmSkill(null);
    setPullConfirmSkill(null);
    setDeleteLocalConfirmSkill(null);
    setTagFilters(new Set());
  }

  const agentSkills = useMemo(
    () =>
      agentKey
        ? managedSkills.filter((skill) => skill.targets.some((target) => target.tool === agentKey))
        : [],
    [agentKey, managedSkills],
  );

  const allLocalTags = useMemo(() => {
    const tags = new Set<string>();
    for (const skill of localSkills) {
      for (const tag of skill.tags) {
        if (tag.trim()) tags.add(tag);
      }
    }
    return Array.from(tags).toSorted((a, b) => a.localeCompare(b));
  }, [localSkills]);

  // Prune tag filters whose pill disappeared (e.g. its last skill was deleted),
  // otherwise a stale filter silently hides everything. An empty list is also
  // what a failed load and the overview leave behind (`setLocalSkills([])`), and
  // that says nothing about which tags are valid — wait for a real list.
  if (localSkills.length > 0) {
    const hasUntagged = localSkills.some((skill) => skill.tags.length === 0);
    setTagFilters((prev) => pruneStaleTagFilters(prev, allLocalTags, hasUntagged));
  }

  const visibleLocalSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localSkills
      .filter((skill) => {
        if (q) {
          const matchesQuery =
            skill.name.toLowerCase().includes(q) ||
            skill.dir_name.toLowerCase().includes(q) ||
            (skill.description || "").toLowerCase().includes(q);
          if (!matchesQuery) return false;
        }
        if (tagFilters.size > 0) {
          const wantUntagged = tagFilters.has(UNTAGGED_FILTER);
          const matchUntagged = wantUntagged && skill.tags.length === 0;
          const matchTag = skill.tags.some((tag) => tagFilters.has(tag));
          if (!matchUntagged && !matchTag) return false;
        }
        return true;
      })
      .toSorted((a, b) => {
        const priority: Record<ProjectSkill["sync_status"], number> = {
          project_only: 0,
          project_newer: 1,
          diverged: 2,
          center_newer: 3,
          in_sync: 4,
        };
        return priority[a.sync_status] - priority[b.sync_status] || a.name.localeCompare(b.name);
      });
  }, [localSkills, search, tagFilters]);

  const inSyncLocalCount = useMemo(
    () => localSkills.filter((skill) => skill.sync_status === "in_sync").length,
    [localSkills],
  );

  const installedIds = useMemo(() => new Set(agentSkills.map((s) => s.id)), [agentSkills]);

  const managedLocalIds = useMemo(
    () =>
      new Set(
        localSkills
          .map((skill) => skill.center_skill_id)
          .filter((id): id is string => !!id && installedIds.has(id)),
      ),
    [installedIds, localSkills],
  );

  const managedLocalCount = useMemo(
    () =>
      localSkills.filter(
        (skill) => !!skill.center_skill_id && managedLocalIds.has(skill.center_skill_id),
      ).length,
    [localSkills, managedLocalIds],
  );

  const handleRemoveLocalManagedSkill = async (skill: ProjectSkill) => {
    if (!agentKey || !skill.center_skill_id || !managedLocalIds.has(skill.center_skill_id)) return;
    setRemovingLocalSkillId(skill.relative_path);
    try {
      await api.unsyncSkillFromTool(skill.center_skill_id, agentKey);
      await Promise.all([refreshManagedSkills(), refreshTools(), loadLocalSkills()]);
      toast.success(t("globalWorkspace.removedToast", { name: skill.name }));
    } catch (e) {
      toast.error(getErrorMessage(e, t("common.error")));
    } finally {
      setRemovingLocalSkillId(null);
    }
  };

  const handleSheetInstalled = useCallback(async () => {
    await Promise.all([refreshManagedSkills(), refreshTools(), loadLocalSkills()]);
  }, [loadLocalSkills, refreshManagedSkills, refreshTools]);

  const handleUploadLocalSkill = useCallback(
    async (skill: ProjectSkill) => {
      if (!currentTool) return;
      const key = `upload:${skill.relative_path}`;
      setLocalActionKey(key);
      try {
        await api.importGlobalLocalSkillToCenter(currentTool.key, skill.relative_path);
        toast.success(
          t("globalWorkspace.localSkills.uploadedToast", {
            name: skill.name,
            agent: currentTool.display_name,
          }),
        );
        await Promise.all([loadLocalSkills(), refreshManagedSkills()]);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setLocalActionKey(null);
        setUploadConfirmSkill(null);
      }
    },
    [currentTool, loadLocalSkills, refreshManagedSkills, t],
  );

  const handleDeleteLocalSkill = useCallback(
    async (skill: ProjectSkill) => {
      if (!currentTool) return;
      const key = `delete:${skill.relative_path}`;
      setLocalActionKey(key);
      try {
        await api.deleteGlobalLocalSkill(currentTool.key, skill.relative_path);
        toast.success(
          t("globalWorkspace.localSkills.deletedLocalToast", {
            name: skill.name,
            agent: currentTool.display_name,
          }),
        );
        await loadLocalSkills();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setLocalActionKey(null);
        setDeleteLocalConfirmSkill(null);
      }
    },
    [currentTool, loadLocalSkills, t],
  );

  const handlePullLocalSkill = useCallback(
    async (skill: ProjectSkill) => {
      if (!currentTool) return;
      const key = `pull:${skill.relative_path}`;
      setLocalActionKey(key);
      try {
        await api.updateGlobalLocalSkillFromCenter(currentTool.key, skill.relative_path);
        toast.success(
          t("globalWorkspace.localSkills.pulledToast", {
            name: skill.name,
            agent: currentTool.display_name,
          }),
        );
        await loadLocalSkills();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
      } finally {
        setLocalActionKey(null);
        setPullConfirmSkill(null);
      }
    },
    [currentTool, loadLocalSkills, t],
  );

  const localDocQuery = useQuery({
    queryKey: queryKeys.workspace.localSkillDocument(
      currentTool?.key ?? "",
      localDetailSkill?.relative_path ?? "",
    ),
    queryFn: () =>
      api.getGlobalLocalSkillDocument(currentTool!.key, localDetailSkill!.relative_path),
    enabled: !!currentTool && !!localDetailSkill,
  });
  const localCenterDocQuery = useQuery({
    queryKey: queryKeys.skills.document(localDetailSkill?.center_skill_id ?? ""),
    queryFn: () => api.getSkillDocument(localDetailSkill!.center_skill_id!),
    enabled: !!localDetailSkill?.center_skill_id,
  });
  const localDocContent = localDocQuery.data?.content ?? null;
  const localDocLoading = localDocQuery.isLoading;
  const localCenterDocContent = localCenterDocQuery.data?.content ?? null;
  const localCenterDocLoading =
    !!localDetailSkill?.center_skill_id && localCenterDocQuery.isLoading;

  const openLocalDetail = useCallback(
    (skill: ProjectSkill) => {
      if (!currentTool) return;
      setLocalDetailSkill(skill);
      setLocalContentTab("local");
    },
    [currentTool],
  );

  const existsInGlobal = useCallback(
    (skill: ManagedSkill, agentK: string) => skill.targets.some((target) => target.tool === agentK),
    [],
  );

  const handlePresetAdd = useCallback(async (skill: ManagedSkill, agentK: string) => {
    await api.syncSkillToTool(skill.id, agentK);
  }, []);

  const handlePresetRemove = useCallback(async (skill: ManagedSkill, agentK: string) => {
    await api.unsyncSkillFromTool(skill.id, agentK);
  }, []);

  const handlePresetComplete = useCallback(async () => {
    await Promise.all([refreshManagedSkills(), refreshTools(), loadLocalSkills()]);
  }, [loadLocalSkills, refreshManagedSkills, refreshTools]);

  const renderLocalSkillActions = (skill: ProjectSkill) => {
    const uploadKey = `upload:${skill.relative_path}`;
    const pullKey = `pull:${skill.relative_path}`;
    const canPull = skill.sync_status === "center_newer" || skill.sync_status === "diverged";
    const isInSync = skill.sync_status === "in_sync";
    const isManaged = !!skill.center_skill_id && managedLocalIds.has(skill.center_skill_id);
    const canDeleteLocal = !isManaged && skill.sync_status === "project_only";
    const removing = removingLocalSkillId === skill.relative_path;
    const pulling = localActionKey === pullKey;
    const uploading = localActionKey === uploadKey;

    if (isInSync && !isManaged) return null;

    return (
      <>
        {!isInSync && canPull && (
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            busy={pulling}
            disabled={!!localActionKey}
            onClick={(e) => {
              e.stopPropagation();
              setPullConfirmSkill(skill);
            }}
            title={t("globalWorkspace.localSkills.pull")}
            aria-label={t("globalWorkspace.localSkills.pull")}
          >
            {!pulling && <Download className="h-3.5 w-3.5" aria-hidden />}
          </Button>
        )}

        {!isInSync && (
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            busy={uploading}
            disabled={!!localActionKey}
            onClick={(e) => {
              e.stopPropagation();
              if (skill.sync_status === "project_only") {
                void handleUploadLocalSkill(skill);
              } else {
                setUploadConfirmSkill(skill);
              }
            }}
            title={t("globalWorkspace.localSkills.upload")}
            aria-label={t("globalWorkspace.localSkills.upload")}
          >
            {!uploading && <Upload className="h-3.5 w-3.5" aria-hidden />}
          </Button>
        )}

        {(isManaged || canDeleteLocal) && (
          <CardActionMenu
            label={`管理 ${skill.name}`}
            actions={[
              {
                key: "remove",
                label: isManaged
                  ? t("globalWorkspace.localSkills.removeManaged")
                  : t("globalWorkspace.localSkills.deleteLocal"),
                icon: <Trash2 size={14} />,
                danger: true,
                disabled: removing || !!localActionKey,
                onSelect: () => {
                  if (isManaged) void handleRemoveLocalManagedSkill(skill);
                  else setDeleteLocalConfirmSkill(skill);
                },
              },
            ]}
          />
        )}
      </>
    );
  };

  if (needsRedirect && requestedTool) {
    const to =
      requestedTool.category === "lobster"
        ? "/lobster-workspace/$agentKey"
        : "/global-workspace/$agentKey";
    return <Navigate to={to} params={{ agentKey: requestedTool.key }} replace />;
  }

  if (installedTools.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title={t(config.i18nKeys.title)} description="管理 CLI 的全局技能目录。" />
        <div className="ds-empty">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover">
            <Globe className="h-5 w-5 text-muted" />
          </div>
          <p className="text-[13px] font-medium text-secondary">{t(config.i18nKeys.noAgents)}</p>
          <p className="mt-1 max-w-[260px] text-[12px] leading-relaxed text-muted">
            {t(config.i18nKeys.noAgentsHint)}
          </p>
          <Button onClick={() => navigate({ to: "/settings" })}>配置工具与目录</Button>
        </div>
      </div>
    );
  }

  if (!currentTool) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <PageHeader title={t(config.i18nKeys.title)} count={installedTools.length} />

          {presets.length > 0 && (
            <PresetBar
              presets={presets}
              managedSkills={managedSkills}
              agentKeys={presetBarAgentKeys}
              existsInWorkspace={existsInGlobal}
              onAddSkill={handlePresetAdd}
              onRemoveSkill={handlePresetRemove}
              onComplete={handlePresetComplete}
            />
          )}
        </div>

        <div className={styles.toolGrid}>
          {installedTools.map((tool) => {
            const count = localCountByAgent[tool.key] ?? skillCountByAgent[tool.key] ?? 0;
            return (
              <button
                key={tool.key}
                onClick={() =>
                  navigate({ to: workspacePaths.agent, params: { agentKey: tool.key } })
                }
                className={styles.toolCard}
              >
                <AgentIcon
                  agentKey={tool.key}
                  displayName={tool.display_name}
                  className="h-9 w-9 rounded-lg transition-colors group-hover:border-border"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-secondary">
                    {tool.display_name}
                  </p>
                  <p className="text-[12px] text-muted">
                    {t("globalWorkspace.skillCount", { count })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            title={currentTool.display_name}
            count={localSkills.length}
            description={`${compactHomePath(currentTool.skills_dir)} · ${t(
              "globalWorkspace.localSkills.summary",
              {
                total: localSkills.length,
                managed: managedLocalCount,
                synced: inSyncLocalCount,
              },
            )}`}
            actions={
              <Button onClick={() => navigate({ to: workspacePaths.overview })}>全部工具</Button>
            }
          />

          <div className={styles.toolbar}>
            <div className="relative w-full min-w-[220px] max-w-[320px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t("globalWorkspace.localSkills.searchPlaceholder")}
                placeholder={t("globalWorkspace.localSkills.searchPlaceholder")}
                className="app-input w-full pl-8 font-medium"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <Button
              iconOnly
              variant="ghost"
              busy={localSkillsQuery.isFetching}
              onClick={() => void loadLocalSkills()}
              title={t("settings.refresh")}
              aria-label={t("settings.refresh")}
            >
              {!localSkillsQuery.isFetching && <RefreshCw className="h-4 w-4" aria-hidden />}
            </Button>
            <div className="ds-view-toggle shrink-0" aria-label="视图切换">
              <button
                aria-label="网格视图"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                className={viewMode === "grid" ? "is-active" : ""}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
              <button
                aria-label="列表视图"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
                className={viewMode === "list" ? "is-active" : ""}
              >
                <List className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <Button onClick={() => setAddDialogOpen(true)} variant="primary">
              <Plus className="h-3.5 w-3.5" />
              {t("globalWorkspace.addSkill")}
            </Button>
          </div>
        </div>

        {allLocalTags.length > 0 && (
          <Disclosure title={`标签筛选${tagFilters.size ? ` · 已选 ${tagFilters.size}` : ""}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setTagFilters(new Set())}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                  tagFilters.size === 0
                    ? "bg-accent text-[var(--ds-on-accent)]"
                    : "bg-surface-hover text-muted hover:text-secondary",
                )}
              >
                {t("mySkills.tags.allTags")}
              </button>
              {localSkills.some((s) => s.tags.length === 0) &&
                (() => {
                  const isActive = tagFilters.has(UNTAGGED_FILTER);
                  return (
                    <button
                      onClick={() => {
                        setTagFilters((prev) => {
                          const next = new Set(prev);
                          if (next.has(UNTAGGED_FILTER)) next.delete(UNTAGGED_FILTER);
                          else next.add(UNTAGGED_FILTER);
                          return next;
                        });
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                        isActive
                          ? "bg-surface-active text-primary"
                          : "border border-dashed border-border text-muted hover:text-secondary",
                      )}
                      title={t("mySkills.tags.untagged")}
                    >
                      <CircleSlash className="h-3.5 w-3.5" />
                      {t("mySkills.tags.untagged")}
                    </button>
                  );
                })()}
              {allLocalTags.map((tag) => {
                const active = tagFilters.has(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      setTagFilters((prev) => {
                        const next = new Set(prev);
                        if (next.has(tag)) next.delete(tag);
                        else next.add(tag);
                        return next;
                      });
                    }}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors",
                      active
                        ? getTagActiveColor(tag, allLocalTags)
                        : getTagColor(tag, allLocalTags),
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </Disclosure>
        )}

        {/* Preset bar */}
        {presets.length > 0 && (
          <PresetBar
            presets={presets}
            managedSkills={managedSkills}
            agentKeys={presetBarAgentKeys}
            existsInWorkspace={existsInGlobal}
            onAddSkill={handlePresetAdd}
            onRemoveSkill={handlePresetRemove}
            onComplete={handlePresetComplete}
          />
        )}
      </div>

      {localSkillsLoading ? (
        <LoadingState label={t("common.loading")} />
      ) : localSkillsError ? (
        <div role="alert" className="ds-empty">
          <p>{localSkillsError}</p>
          <Button onClick={() => void loadLocalSkills()}>重新加载目录</Button>
        </div>
      ) : visibleLocalSkills.length === 0 ? (
        <div className="ds-empty">
          <Globe className="mb-4 h-12 w-12 text-faint" />
          <h2>
            {localSkills.length === 0
              ? t("globalWorkspace.localSkills.empty")
              : t("mySkills.noMatch")}
          </h2>
          {localSkills.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setTagFilters(new Set());
              }}
            >
              清除筛选
            </Button>
          )}
          {localSkills.length === 0 && (
            <Button variant="primary" className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("globalWorkspace.addSkill")}
            </Button>
          )}
        </div>
      ) : (
        <div
          className={cn("pb-8", viewMode === "grid" ? styles.toolGrid : "flex flex-col gap-0.5")}
        >
          {visibleLocalSkills.map((skill) => {
            const statusMeta = getSyncStatusMeta(
              t(SYNC_STATUS_LABEL_KEYS[skill.sync_status]),
              skill.sync_status,
            );
            const isManaged = !!skill.center_skill_id && managedLocalIds.has(skill.center_skill_id);

            return (
              <WorkspaceSkillCard
                key={`${skill.agent}:${skill.relative_path}`}
                viewMode={viewMode}
                title={skill.name}
                description={skill.description || skill.relative_path}
                tags={skill.tags.map((tag) => ({
                  label: tag,
                  className: getTagColor(tag, allLocalTags),
                }))}
                status={statusMeta}
                fileCount={skill.files.length}
                active={isManaged}
                actions={renderLocalSkillActions(skill)}
                actionsHover={viewMode === "list"}
                onClick={() => openLocalDetail(skill)}
              />
            );
          })}
        </div>
      )}

      {currentTool && (
        <AddSkillsSheet
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          target={{
            kind: "global",
            agentKey: currentTool.key,
            agentDisplayName: currentTool.display_name,
            installedSkillIds: installedIds,
          }}
          managedSkills={managedSkills}
          onInstalled={handleSheetInstalled}
        />
      )}

      <DetailSheet
        open={!!localDetailSkill}
        title={localDetailSkill?.name ?? ""}
        description={localDetailSkill?.description}
        meta={
          localDetailSkill ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-medium",
                  getSyncStatusMeta(
                    t(SYNC_STATUS_LABEL_KEYS[localDetailSkill.sync_status]),
                    localDetailSkill.sync_status,
                  ).className,
                )}
              >
                {
                  getSyncStatusMeta(
                    t(SYNC_STATUS_LABEL_KEYS[localDetailSkill.sync_status]),
                    localDetailSkill.sync_status,
                  ).label
                }
              </span>
              <span className="rounded-full bg-surface-hover px-2.5 py-1 text-[12px] text-muted">
                {localDetailSkill.relative_path}
              </span>
            </div>
          ) : null
        }
        onClose={() => setLocalDetailSkill(null)}
      >
        {localDetailSkill?.center_skill_id && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["local", "diff", "center"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={localContentTab === tab}
                onClick={() => setLocalContentTab(tab)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  localContentTab === tab
                    ? "bg-accent text-[var(--ds-on-accent)]"
                    : "bg-surface-hover text-muted hover:text-secondary",
                )}
                disabled={(tab === "diff" || tab === "center") && localCenterDocLoading}
              >
                {tab === "local"
                  ? t("mySkills.docTabs.local")
                  : tab === "diff"
                    ? t("mySkills.docTabs.diff")
                    : t("project.docTabs.center")}
              </button>
            ))}
          </div>
        )}

        {localDocLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : localContentTab === "diff" ? (
          localDocContent && localCenterDocContent ? (
            <DocumentDiffViewer original={localDocContent} updated={localCenterDocContent} />
          ) : localCenterDocLoading ? (
            <LoadingState label={t("common.loading")} />
          ) : (
            <div className="mt-12 text-center text-[13px] text-muted">
              {t("mySkills.sourceDiffUnavailable")}
            </div>
          )
        ) : localContentTab === "center" ? (
          localCenterDocLoading ? (
            <LoadingState label={t("common.loading")} />
          ) : localCenterDocContent ? (
            <SkillMarkdown content={localCenterDocContent} />
          ) : (
            <div className="mt-12 text-center text-[13px] text-muted">
              {t("mySkills.sourceDiffUnavailable")}
            </div>
          )
        ) : localDocContent ? (
          <SkillMarkdown content={localDocContent} />
        ) : (
          <div className="mt-12 text-center text-[13px] text-muted">
            {t("common.documentMissing")}
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!uploadConfirmSkill}
        title={t("globalWorkspace.localSkills.uploadConfirmTitle")}
        message={t("globalWorkspace.localSkills.uploadConfirmMessage", {
          name: uploadConfirmSkill?.name ?? "",
        })}
        tone="warning"
        confirmLabel={t("globalWorkspace.localSkills.upload")}
        onClose={() => setUploadConfirmSkill(null)}
        onConfirm={() =>
          uploadConfirmSkill ? handleUploadLocalSkill(uploadConfirmSkill) : Promise.resolve()
        }
      />
      <ConfirmDialog
        open={!!pullConfirmSkill}
        title={t("globalWorkspace.localSkills.pullConfirmTitle")}
        message={t("globalWorkspace.localSkills.pullConfirmMessage", {
          name: pullConfirmSkill?.name ?? "",
          agent: currentTool?.display_name ?? "",
        })}
        tone="danger"
        confirmLabel={t("globalWorkspace.localSkills.pull")}
        onClose={() => setPullConfirmSkill(null)}
        onConfirm={() =>
          pullConfirmSkill ? handlePullLocalSkill(pullConfirmSkill) : Promise.resolve()
        }
      />
      <ConfirmDialog
        open={!!deleteLocalConfirmSkill}
        title={t("globalWorkspace.localSkills.deleteLocalConfirmTitle")}
        message={t("globalWorkspace.localSkills.deleteLocalConfirmMessage", {
          name: deleteLocalConfirmSkill?.name ?? "",
          agent: currentTool?.display_name ?? "",
        })}
        tone="danger"
        confirmLabel={t("common.delete")}
        onClose={() => setDeleteLocalConfirmSkill(null)}
        onConfirm={() =>
          deleteLocalConfirmSkill
            ? handleDeleteLocalSkill(deleteLocalConfirmSkill)
            : Promise.resolve()
        }
      />
    </div>
  );
}
