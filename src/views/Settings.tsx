import { Disclosure } from "../components/ui/Disclosure";
import { LoadingState } from "../components/ui/LoadingState";
import { Button } from "../components/ui/Button";
import { DetailSheet } from "../components/DetailSheet";
import styles from "./Settings.module.css";
import { PageHeader } from "../components/ui/PageHeader";
import { RunnerSettings } from "../components/RunnerSettings";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  FolderOpen,
  RefreshCw,
  Link as LinkIcon,
  Unlink,
  Copy,
  Settings2,
  Terminal,
  Palette,
  Info,
  Loader2,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  AlertTriangle,
  BookOpen,
  Bug,
  Download,
  FileArchive,
  Type,
  Pencil,
  RotateCcw,
  Plus,
  Trash2,
  X,
  Check,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { check as checkUpdater } from "@tauri-apps/plugin-updater";
import { open as dialogOpen, confirm as dialogConfirm } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "../utils";
import { useApp } from "../hooks/useApp";
import { useTheme, type Theme } from "../hooks/useTheme";
import { AgentIcon } from "../components/AgentIcon";
import { ToggleSwitch } from "../components/ToggleSwitch";
import * as api from "../lib/tauri";
import { queryKeys } from "../lib/queryKeys";
import { applyTextSize } from "../lib/textScale";
import { getErrorMessage } from "../lib/error";

const SETTINGS_BUNDLE_KEYS = [
  "sync_mode",
  "proxy_url",
  "close_action",
  "show_tray_icon",
  "text_size",
  "auto_update_check_interval",
  "auto_update_apply",
  "auto_update_last_run_at",
  "git_backup_remote_url",
  "git_backup_engine",
  "merge_engine",
] as const;

interface SettingsBundle {
  values: Record<string, string | null>;
  centralRepoPath: string | null;
  centralRepoPathOverride: string | null;
  loadError: string;
}

// One round trip for every preference the page edits. Individual keys keep
// their per-read error mapping from the old hand-rolled loader; the last
// failure wins, matching the previous overwrite order (override > central >
// key).
async function loadSettingsBundle(): Promise<SettingsBundle> {
  let loadError = "";
  const values: Record<string, string | null> = {};
  await Promise.all(
    SETTINGS_BUNDLE_KEYS.map(async (key) => {
      try {
        values[key] = await api.getSettings(key);
      } catch (e) {
        values[key] = null;
        loadError = getErrorMessage(e, "部分设置读取失败，请重试后再修改。");
      }
    }),
  );
  let centralRepoPath: string | null = null;
  try {
    centralRepoPath = await api.getCentralRepoPath();
  } catch (e) {
    loadError = getErrorMessage(e, "技能库目录读取失败，请重试。");
  }
  let centralRepoPathOverride: string | null = null;
  try {
    centralRepoPathOverride = await api.getCentralRepoPathOverride();
  } catch (e) {
    loadError = getErrorMessage(e, "自定义目录读取失败，请重试。");
  }
  return { values, centralRepoPath, centralRepoPathOverride, loadError };
}

const IS_WINDOWS = navigator.userAgent.includes("Windows");
const IS_MACOS = navigator.userAgent.includes("Mac");

/** Platforms whose updater artifact can replace the running install.
 *
 *  Linux is excluded on purpose: only the AppImage can be updated in place,
 *  and a .deb/.rpm install is indistinguishable from it here, so those users
 *  keep the download link rather than a button that fails for half of them. */
const CAN_INSTALL_IN_APP = IS_WINDOWS || IS_MACOS;

const RESTART_TOAST_ID = "app-update-restart";

function compactHomePath(path: string) {
  return path
    .replace(/\/Users\/[^/]+/, "~")
    .replace(/\/home\/[^/]+/, "~")
    .replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
}

interface SortableAgentCardProps {
  agentKey: string;
  dragLabel: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

function SortableAgentCard({ agentKey, dragLabel, children }: SortableAgentCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agentKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5 flex min-h-6 min-w-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-faint transition-colors hover:text-muted active:cursor-grabbing"
      title={dragLabel}
      aria-label={dragLabel}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      {children(handle)}
    </div>
  );
}

interface AgentGroupDndProps {
  items: api.ToolInfo[];
  sensors: ReturnType<typeof useSensors>;
  dragLabel: string;
  onDragEnd: (event: DragEndEvent, groupKeys: string[]) => void;
  renderAgentCard: (agent: api.ToolInfo, dragHandle?: React.ReactNode) => React.ReactNode;
}

function AgentGroupDnd({
  items,
  sensors,
  dragLabel,
  onDragEnd,
  renderAgentCard,
}: AgentGroupDndProps) {
  const groupKeys = items.map((t) => t.key);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => onDragEnd(e, groupKeys)}
    >
      <SortableContext items={groupKeys} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((agent) => (
            <SortableAgentCard key={agent.key} agentKey={agent.key} dragLabel={dragLabel}>
              {(handle) => renderAgentCard(agent, handle)}
            </SortableAgentCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

async function handleBrowsePath(setter: (v: string) => void) {
  try {
    const selected = await dialogOpen({ directory: true, multiple: false });
    if (selected && typeof selected === "string") setter(selected);
  } catch (e) {
    toast.error(getErrorMessage(e, "无法打开目录选择器，请直接输入路径。"));
  }
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("runner");
  const sections = [
    {
      id: "runner",
      label: "本地执行",
      description: "连接 Codex CLI，用于项目任务和中文用法说明。",
      icon: Terminal,
    },
    {
      id: "tools",
      label: "工具与目录",
      description: "管理技能库位置，以及各个工具的技能目录。",
      icon: Folder,
    },
    {
      id: "appearance",
      label: "外观与偏好",
      description: "调整显示、语言和窗口行为。",
      icon: Palette,
    },
    {
      id: "sync",
      label: "同步与更新",
      description: "配置网络代理、技能更新与 Git 同步。",
      icon: RefreshCw,
    },
    {
      id: "about",
      label: "关于与诊断",
      description: "查看应用版本，获取帮助和导出诊断日志。",
      icon: Info,
    },
  ];
  const currentSection = sections.find((section) => section.id === activeSection)!;
  const { tools, refreshTools, openHelp, appUpdate, refreshAppUpdate } = useApp();
  const [togglingTools, setTogglingTools] = useState<Set<string>>(new Set());
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.bundle(),
    queryFn: loadSettingsBundle,
  });
  const lastPanicQuery = useQuery({
    queryKey: queryKeys.settings.lastPanic(),
    queryFn: api.checkLastPanic,
  });
  const repoWarningsQuery = useQuery({
    queryKey: queryKeys.settings.centralRepoWarnings(),
    queryFn: api.getCentralRepoWarnings,
  });
  const lastPanic = lastPanicQuery.data ?? null;
  const repoWarnings = repoWarningsQuery.data ?? [];
  const [syncMode, setSyncMode] = useState("symlink");
  const [closeAction, setCloseAction] = useState("");
  const [showTrayIcon, setShowTrayIcon] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingRepo, setOpeningRepo] = useState(false);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [centralRepoPath, setCentralRepoPath] = useState("");
  const [centralRepoPathOverride, setCentralRepoPathOverride] = useState<string | null>(null);
  const [editingCentralRepoPath, setEditingCentralRepoPath] = useState(false);
  const [centralRepoPathInput, setCentralRepoPathInput] = useState("");
  const [savingCentralRepoPath, setSavingCentralRepoPath] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [gitRemoteInput, setGitRemoteInput] = useState("");
  const [gitRemoteSaving, setGitRemoteSaving] = useState(false);
  const [gitRemoteDisconnecting, setGitRemoteDisconnecting] = useState(false);
  const [gitEngineGit2, setGitEngineGit2] = useState(false);
  // Object merge is the default since 3d-β; "system" is the opt-out.
  const [gitMergeEngineObject, setGitMergeEngineObject] = useState(true);
  const [proxyInput, setProxyInput] = useState("");
  const [proxySaving, setProxySaving] = useState(false);
  const [textSize, setTextSize] = useState("default");
  const [autoUpdateInterval, setAutoUpdateInterval] = useState("off");
  const [autoUpdateApply, setAutoUpdateApply] = useState("off");
  const [autoUpdateLastRun, setAutoUpdateLastRun] = useState<string | null>(null);
  // Agent path editing
  const [editingPathKey, setEditingPathKey] = useState<string | null>(null);
  const [editingPathValue, setEditingPathValue] = useState("");
  // Project path editing (custom agents only)
  const [editingProjectPathKey, setEditingProjectPathKey] = useState<string | null>(null);
  const [editingProjectPathValue, setEditingProjectPathValue] = useState("");
  // Custom agent dialog
  const [bulkBusy, setBulkBusy] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [pathSaving, setPathSaving] = useState(false);
  const [customError, setCustomError] = useState("");
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [customProjectPath, setCustomProjectPath] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [showMoreAgents, setShowMoreAgents] = useState(false);

  const startEditPath = useCallback((key: string, currentPath: string) => {
    setEditingPathKey(key);
    setEditingPathValue(currentPath);
  }, []);

  const handleSavePath = async () => {
    if (pathSaving || !editingPathKey || !editingPathValue.trim()) return;
    setPathSaving(true);
    try {
      await api.setCustomToolPath(editingPathKey, editingPathValue.trim());
      await refreshTools();
      toast.success(t("settings.pathSaved"));
      setEditingPathKey(null);
    } catch (e) {
      toast.error(getErrorMessage(e, "目录保存失败，请检查后重试。"));
    } finally {
      setPathSaving(false);
    }
  };

  const startEditProjectPath = useCallback((key: string, currentPath: string | null) => {
    setEditingProjectPathKey(key);
    setEditingProjectPathValue(currentPath ?? "");
  }, []);

  const handleSaveProjectPath = async () => {
    if (pathSaving || !editingProjectPathKey) return;
    setPathSaving(true);
    const trimmed = editingProjectPathValue.trim();
    try {
      await api.setCustomToolProjectPath(editingProjectPathKey, trimmed || null);
      await refreshTools();
      toast.success(t("settings.pathSaved"));
      setEditingProjectPathKey(null);
    } catch (e) {
      toast.error(getErrorMessage(e, "目录保存失败，请检查后重试。"));
    } finally {
      setPathSaving(false);
    }
  };

  const handleResetProjectPath = async (key: string) => {
    try {
      await api.resetCustomToolProjectPath(key);
      await refreshTools();
      toast.success(t("settings.projectPathReset"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleResetPath = async (key: string) => {
    try {
      await api.resetCustomToolPath(key);
      await refreshTools();
      toast.success(t("settings.pathReset"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const generateCustomAgentKey = useCallback(
    (name: string) => {
      const base = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const seed = base || "agent";
      const existingKeys = new Set(tools.map((tool) => tool.key));
      if (!existingKeys.has(seed)) return seed;
      let n = 2;
      while (existingKeys.has(`${seed}_${n}`)) n += 1;
      return `${seed}_${n}`;
    },
    [tools],
  );

  const handleAddCustomAgent = async () => {
    const trimName = customName.trim();
    const trimPath = customPath.trim();
    const trimProjectPath = customProjectPath.trim();
    if (addingCustom) return;
    if (!trimName || !trimPath) {
      setCustomError("请填写工具名称和技能目录。");
      return;
    }
    setCustomError("");
    const trimKey = generateCustomAgentKey(trimName);
    setAddingCustom(true);
    try {
      await api.addCustomTool(trimKey, trimName, trimPath, trimProjectPath || undefined);
      await refreshTools();
      setCustomError("");
      toast.success(t("settings.customAgentAdded"));
      setShowAddCustom(false);
      setCustomName("");
      setCustomPath("");
      setCustomProjectPath("");
    } catch (e) {
      setCustomError(getErrorMessage(e, "添加失败，请检查名称和路径后重试。"));
    } finally {
      setAddingCustom(false);
    }
  };

  const handleRemoveCustomAgent = async (key: string, name: string) => {
    const shouldRemove = await dialogConfirm(t("settings.removeCustomAgentConfirm", { name }));
    if (!shouldRemove) return;
    try {
      await api.removeCustomTool(key);
      await refreshTools();
      toast.success(t("settings.customAgentRemoved"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  // Initialize the editable form state once from the settings bundle query.
  // Later refetches (invalidation) must not clobber in-progress edits, so
  // this stays a one-shot.
  const [settingsInitialized, setSettingsInitialized] = useState(false);
  const bundle = settingsQuery.data;
  if (bundle && !settingsInitialized) {
    setSettingsInitialized(true);
    const v = bundle.values;
    if (v.sync_mode) setSyncMode(v.sync_mode);
    setProxyInput(v.proxy_url ?? "");
    setCloseAction(v.close_action ?? "");
    const trayNormalized = (v.show_tray_icon ?? "true").trim().toLowerCase();
    setShowTrayIcon(
      !(
        trayNormalized === "false" ||
        trayNormalized === "0" ||
        trayNormalized === "no" ||
        trayNormalized === "off"
      ),
    );
    if (v.text_size) {
      setTextSize(v.text_size);
      applyTextSize(v.text_size);
    }
    if (v.auto_update_check_interval) setAutoUpdateInterval(v.auto_update_check_interval);
    if (v.auto_update_apply) setAutoUpdateApply(v.auto_update_apply);
    if (v.auto_update_last_run_at) setAutoUpdateLastRun(v.auto_update_last_run_at);
    if (bundle.centralRepoPath) {
      setCentralRepoPath(bundle.centralRepoPath);
      setCentralRepoPathInput(bundle.centralRepoPath);
    }
    setCentralRepoPathOverride(bundle.centralRepoPathOverride);
    // The saved setting is the single source of truth. Do not backfill from
    // `.git/config` — that made a cleared URL reappear on reopen (#260).
    setGitRemoteInput(v.git_backup_remote_url?.trim() || "");
    setGitEngineGit2(v.git_backup_engine?.trim() === "git2");
    setGitMergeEngineObject((v.merge_engine ?? "").trim() !== "system");
  }
  const settingsLoading = !settingsInitialized && !settingsQuery.error;
  const settingsLoadError =
    bundle?.loadError ||
    (settingsQuery.error
      ? getErrorMessage(settingsQuery.error, "部分设置读取失败，请重试后再修改。")
      : "");
  const retrySettingsLoad = () => {
    setSettingsInitialized(false);
    void settingsQuery.refetch();
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshTools();
      toast.success(t("common.success"));
    } catch (e) {
      toast.error(getErrorMessage(e, "刷新失败，请重试。"));
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleTool = async (key: string, enabled: boolean) => {
    setTogglingTools((prev) => new Set(prev).add(key));
    try {
      await api.setToolEnabled(key, enabled);
      await refreshTools();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setTogglingTools((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleToggleAllTools = async (enabled: boolean) => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      await api.setAllToolsEnabled(enabled);
      await refreshTools();
      toast.success(t("common.success"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBulkBusy(false);
    }
  };

  const savePreference = async (operation: () => Promise<void>) => {
    if (preferenceBusy || settingsLoading || settingsLoadError) return;
    setPreferenceBusy(true);
    try {
      await operation();
      toast.success(t("common.success"));
    } catch (e) {
      toast.error(getErrorMessage(e, "保存失败，请重试。"));
    } finally {
      setPreferenceBusy(false);
    }
  };
  const handleSyncModeChange = (mode: string) =>
    savePreference(async () => {
      await api.setSettings("sync_mode", mode);
      setSyncMode(mode);
    });
  const handleCloseActionChange = (action: string) =>
    savePreference(async () => {
      if (action === "hide" && !showTrayIcon) return;
      await api.setSettings("close_action", action);
      setCloseAction(action);
    });
  const handleShowTrayIconChange = (enabled: boolean) =>
    savePreference(async () => {
      await api.setSettings("show_tray_icon", enabled ? "true" : "false");
      setShowTrayIcon(enabled);
      if (!enabled && closeAction === "hide") {
        await api.setSettings("close_action", "close");
        setCloseAction("close");
      }
    });
  const handleLanguageChange = (lng: string) =>
    savePreference(async () => {
      await api.setSettings("language", lng);
      localStorage.setItem("language", lng);
      await i18n.changeLanguage(lng);
    });
  const handleTextSizeChange = (size: string) =>
    savePreference(async () => {
      await api.setSettings("text_size", size);
      setTextSize(size);
      applyTextSize(size);
    });
  const handleAutoUpdateIntervalChange = (value: string) =>
    savePreference(async () => {
      await api.setSettings("auto_update_check_interval", value);
      setAutoUpdateInterval(value);
    });
  const handleAutoUpdateApplyChange = (value: string) =>
    savePreference(async () => {
      await api.setSettings("auto_update_apply", value);
      setAutoUpdateApply(value);
    });

  // Keep the last-run timestamp in sync with both the background scheduler
  // and the tray's manual "Check for skill updates" so the user doesn't see
  // a stale value if Settings is open. Backend always persists `last_run_at`
  // first and then emits with the same `ran_at`, so reading from the payload
  // avoids a follow-up DB roundtrip.
  useEffect(() => {
    type AutoUpdatedPayload = { ran_at?: string };
    const unlistenPromise = listen<AutoUpdatedPayload>("skills-auto-updated", (event) => {
      const ranAt = event.payload?.ran_at;
      if (ranAt) {
        setAutoUpdateLastRun(ranAt);
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  const handleOpenRepoInFinder = async () => {
    try {
      setOpeningRepo(true);
      await api.openCentralRepoFolder();
    } catch (error) {
      console.error("Failed to open central repository folder", error);
      toast.error(t("common.error"));
    } finally {
      setOpeningRepo(false);
    }
  };

  const handleStartEditCentralRepoPath = () => {
    setCentralRepoPathInput(centralRepoPathOverride ?? centralRepoPath);
    setEditingCentralRepoPath(true);
  };

  const handleSaveCentralRepoPath = async () => {
    const trimmed = centralRepoPathInput.trim();
    if (!trimmed) {
      toast.error(t("settings.repoPathEmpty"));
      return;
    }
    setSavingCentralRepoPath(true);
    try {
      const nextPath = await api.setCentralRepoPath(trimmed);
      setCentralRepoPath(nextPath);
      setCentralRepoPathOverride(nextPath);
      setEditingCentralRepoPath(false);
      toast.success(t("settings.repoPathSaved"));
      toast.info(t("settings.repoPathRestartNotice"));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSavingCentralRepoPath(false);
    }
  };

  const handleResetCentralRepoPath = async () => {
    setSavingCentralRepoPath(true);
    try {
      const nextPath = await api.setCentralRepoPath(null);
      setCentralRepoPath(nextPath);
      setCentralRepoPathOverride(null);
      setCentralRepoPathInput(nextPath);
      setEditingCentralRepoPath(false);
      toast.success(t("settings.repoPathReset"));
      toast.info(t("settings.repoPathRestartNotice"));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSavingCentralRepoPath(false);
    }
  };

  const handleExportLogs = async () => {
    setExportingLogs(true);
    try {
      const result = await api.exportLogsZip();
      toast.success(t("settings.exportLogsDone", { count: result.file_count }), {
        description: result.zip_path,
      });
    } catch (error) {
      console.error("Failed to export logs", error);
      toast.error(t("settings.exportLogsFailed"));
    } finally {
      setExportingLogs(false);
    }
  };

  const handleDismissPanic = async () => {
    try {
      await api.clearLastPanic();
    } catch (err) {
      console.warn("Failed to clear last_panic.log", err);
    }
    queryClient.setQueryData(queryKeys.settings.lastPanic(), null);
  };

  const handleReportIssue = async () => {
    setReportingIssue(true);
    try {
      const [info, logExcerpt, panicInfo] = await Promise.all([
        api.getDiagnosticInfo(),
        api.getRecentLogExcerpt().catch((err) => {
          console.warn("Failed to read log excerpt", err);
          return null;
        }),
        api.checkLastPanic().catch(() => null),
      ]);
      const enabledBuiltin = enabledTools.filter((tool) => !tool.is_custom).map((tool) => tool.key);
      const enabledCustomCount = enabledTools.filter((tool) => tool.is_custom).length;
      const agentsLine =
        enabledBuiltin.length === 0 && enabledCustomCount === 0
          ? "(none)"
          : [
              enabledBuiltin.join(", "),
              enabledCustomCount > 0 ? `${enabledCustomCount} custom` : "",
            ]
              .filter(Boolean)
              .join(", ");
      const parts = [
        "**Diagnostics** (auto-collected by SkillHarbor)",
        "",
        `- App version: \`${info.app_version}\``,
        `- OS: \`${info.os} ${info.os_version} (${info.arch})\``,
        `- UI locale: \`${i18n.language}\``,
        `- Enabled agents: ${agentsLine}`,
        `- Central repo: \`${info.central_repo_path}\`${info.central_repo_path_overridden ? " (custom path)" : ""}`,
      ];
      if (panicInfo) {
        parts.push(
          "",
          `**Last panic** (${panicInfo.timestamp})`,
          "",
          "```",
          panicInfo.message,
          "```",
        );
      }
      if (logExcerpt) {
        parts.push(
          "",
          `**Recent log** (\`${logExcerpt.log_path}\`, ${logExcerpt.line_count} lines${logExcerpt.has_warnings ? ", includes warnings/errors" : ""})`,
          "",
          "```log",
          logExcerpt.excerpt,
          "```",
          "",
          `> ${t("settings.reportIssueExportHint")}`,
        );
      }
      const md = parts.join("\n");
      let copied = false;
      try {
        await clipboardWriteText(md);
        copied = true;
      } catch (err) {
        console.error("Clipboard write failed", err);
        try {
          await navigator.clipboard.writeText(md);
          copied = true;
        } catch (err2) {
          console.error("Browser clipboard fallback also failed", err2);
        }
      }
      if (copied) {
        toast.success(t("settings.diagnosticsCopied"));
        if (panicInfo) {
          try {
            await api.clearLastPanic();
          } catch (err) {
            console.warn("Failed to clear last_panic.log", err);
          }
          queryClient.setQueryData(queryKeys.settings.lastPanic(), null);
        }
      } else {
        toast.message(t("settings.diagnosticsCopyManual"), { description: md });
      }
    } catch (error) {
      console.error("Failed to prepare diagnostics", error);
      toast.error(t("common.error"));
    } finally {
      setReportingIssue(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await refreshAppUpdate();
      if (info.has_update) {
        toast.info(t("settings.updateAvailable", { version: info.latest_version }));
      } else {
        toast.success(t("settings.noUpdate"));
      }
    } catch {
      toast.error(t("settings.updateError"));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleAutoUpdate = async () => {
    setInstalling(true);
    try {
      // Read-only image or Gatekeeper-translocated copy: the updater would
      // download the whole bundle and only then fail to swap it, so stop first
      // and say what to do instead.
      const blocker = await api.updateInstallBlocker();
      if (blocker) {
        toast.error(t("settings.updateRelocate"));
        return;
      }
      // The updater plugin does not inherit the app's proxy setting the way
      // `check_app_update` does. Without this, a user behind a proxy is told a
      // new version exists and then cannot install it. The proxy given to
      // check() is carried through to the download.
      const proxy = (await api.getSettings("proxy_url")) || undefined;
      const update = await checkUpdater(proxy ? { proxy } : undefined);
      if (!update) {
        toast.success(t("settings.noUpdate"));
        return;
      }
      toast.info(t("settings.installing"));
      await update.downloadAndInstall();
      // Installing was the user's choice; restarting is a second one. Offered
      // as a toast action rather than a modal so a stray keypress cannot end
      // the session mid-task, and it stays up until acted on.
      toast.success(t("settings.restartToApply"), {
        id: RESTART_TOAST_ID,
        duration: Infinity,
        action: {
          label: t("settings.restartNow"),
          onClick: () => {
            api.restartApp().catch((err) => {
              toast.error(getErrorMessage(err, t("common.error")));
            });
          },
        },
      });
    } catch (err) {
      console.error("In-app update failed:", err);
      toast.error(t("settings.updateError"));
      if (appUpdate?.release_url) {
        await openUrl(appUpdate.release_url);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleSaveGitRemote = async () => {
    setGitRemoteSaving(true);
    try {
      // Credentials embedded in the URL go to the OS keychain; only the
      // sanitized URL is persisted (backup redesign §3.7).
      const trimmed = gitRemoteInput.trim();
      const effective = trimmed ? await api.gitBackupSanitizeRemoteUrl(trimmed) : "";
      await api.setSettings("git_backup_remote_url", effective);
      setGitRemoteInput(effective);
      toast.success(t("settings.gitConfigSaved"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setGitRemoteSaving(false);
    }
  };

  const handleDisconnectGitRemote = async () => {
    setGitRemoteDisconnecting(true);
    try {
      await api.gitBackupRemoveRemote();
      setGitRemoteInput("");
      toast.success(t("settings.gitDisconnected"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setGitRemoteDisconnecting(false);
    }
  };

  const handleSaveProxy = async () => {
    const trimmed = proxyInput.trim();
    if (trimmed && !/^(https?|socks5):\/\//i.test(trimmed)) {
      toast.error(t("settings.proxyUrlInvalid"));
      return;
    }
    setProxySaving(true);
    try {
      await api.setSettings("proxy_url", trimmed);
      toast.success(t("settings.proxyUrlSaved"));
    } catch {
      toast.error(t("common.error"));
    } finally {
      setProxySaving(false);
    }
  };

  // Compose the shared control classes from index.css rather than a parallel
  // set — bg-background keeps fields readable against the surface-colored panel.
  const fieldClass = "app-input";
  const actionButtonClass = "ds-button ds-button-secondary gap-1.5";
  const segmentedButtonClass = "app-segmented-button flex items-center gap-1.5";

  const themeOptions: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: t("settings.themeLight"), icon: Sun },
    { value: "dark", label: t("settings.themeDark"), icon: Moon },
    { value: "system", label: t("settings.themeSystem"), icon: Monitor },
  ];
  const installedTools = useMemo(() => tools.filter((tool) => tool.installed), [tools]);
  // No manual memoization here: the compiler could not preserve this useMemo,
  // and it memoizes the filter itself.
  const enabledTools = installedTools.filter((tool) => tool.enabled);
  const autoUpdateIntervalOptions = [
    { value: "off", label: t("settings.autoUpdate.intervalOff") },
    { value: "1h", label: t("settings.autoUpdate.interval1h") },
    { value: "6h", label: t("settings.autoUpdate.interval6h") },
    { value: "24h", label: t("settings.autoUpdate.interval24h") },
  ] as const;
  const autoUpdateApplyOptions = [
    { value: "off", label: t("settings.autoUpdate.applyOff") },
    { value: "on", label: t("settings.autoUpdate.applyOn") },
  ] as const;
  const customTools = useMemo(() => tools.filter((tool) => tool.is_custom), [tools]);
  const builtInTools = useMemo(() => tools.filter((tool) => !tool.is_custom), [tools]);
  // Grouped by what is actually on this machine rather than by a hand-kept
  // "mainstream" list. A settings page reader cares about the agents they have,
  // and that list stays correct without anyone re-curating it as products rise
  // and fall. Both groups keep the backend's order, which is ranked by how
  // widely used each agent is (see DEFAULT_PRIORITY_ORDER) and overridden by
  // whatever the user has dragged.
  const detectedTools = useMemo(
    () => builtInTools.filter((tool) => tool.installed),
    [builtInTools],
  );
  const undetectedTools = useMemo(
    () => builtInTools.filter((tool) => !tool.installed),
    [builtInTools],
  );

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleAgentDragEnd = useCallback(
    async (event: DragEndEvent, groupKeys: string[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = groupKeys.indexOf(String(active.id));
      const newIdx = groupKeys.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return;

      const newGroupKeys = arrayMove(groupKeys, oldIdx, newIdx);
      const fullOrder = tools.map((t) => t.key);
      const groupKeySet = new Set(groupKeys);
      let cursor = 0;
      const newFullOrder = fullOrder.map((k) => (groupKeySet.has(k) ? newGroupKeys[cursor++] : k));

      try {
        await api.setToolOrder(newFullOrder);
        await refreshTools();
      } catch (e) {
        toast.error(getErrorMessage(e, t("common.error")));
      }
    },
    [tools, refreshTools, t],
  );
  const displayedRepoPath = centralRepoPath
    ? compactHomePath(centralRepoPath)
    : t("common.loading");

  const renderAgentCard = (agent: (typeof tools)[number], dragHandle?: React.ReactNode) => (
    <div
      className={cn(
        "group relative flex h-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 transition-colors",
        agent.installed && agent.enabled
          ? "border-border bg-surface"
          : agent.installed
            ? "border-border-subtle bg-surface"
            : "border-border-subtle bg-bg-secondary",
      )}
    >
      <div className="flex items-start gap-2.5">
        {dragHandle}
        <AgentIcon
          agentKey={agent.key}
          displayName={agent.display_name}
          className="mt-px h-6 w-6 shrink-0 rounded-md"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "truncate text-[14px] font-semibold",
                agent.installed ? "text-primary" : "text-muted",
              )}
            >
              {agent.display_name}
            </h3>
            {/* Enabled/disabled is carried by the switch; only "not installed" adds info. */}
            {!agent.installed && (
              <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted">
                {t("settings.notInstalled")}
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {agent.is_custom && (
              <span className="rounded-full bg-[var(--ds-info-bg)] px-2 py-0.5 text-[10px] font-medium text-[color-mix(in_srgb,var(--ds-info)_65%,var(--ds-strong))]">
                {t("settings.customAgent")}
              </span>
            )}
            {agent.is_custom && agent.project_relative_skills_dir && (
              <span className="rounded-full bg-[var(--ds-success-bg)] px-2 py-0.5 text-[10px] font-medium text-[color-mix(in_srgb,var(--ds-success)_55%,var(--ds-strong))]">
                {t("settings.projectAgentSupported")}
              </span>
            )}
            {agent.has_path_override && !agent.is_custom && (
              <span className="rounded-full bg-[var(--ds-warning-bg)] px-2 py-0.5 text-[10px] font-medium text-[color-mix(in_srgb,var(--ds-warning)_55%,var(--ds-strong))]">
                {t("settings.pathOverridden")}
              </span>
            )}
          </div>
        </div>

        {agent.is_custom && (
          <Button
            onClick={() => handleRemoveCustomAgent(agent.key, agent.display_name)}
            className="mt-0.5 shrink-0 text-muted transition-opacity hover:text-[var(--ds-danger)]"
            title={t("settings.removeCustomAgent")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}

        <ToggleSwitch
          className="mt-0.5"
          checked={agent.installed && agent.enabled}
          disabled={!agent.installed}
          loading={togglingTools.has(agent.key)}
          onChange={() => handleToggleTool(agent.key, !agent.enabled)}
          title={
            !agent.installed
              ? t("settings.notInstalled")
              : agent.enabled
                ? t("settings.disableAgent")
                : t("settings.enableAgent")
          }
        />
      </div>

      <div className="space-y-1">
        {/* Global skills path */}
        {editingPathKey === agent.key ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              aria-label={t("settings.skillsPath")}
              disabled={pathSaving}
              value={editingPathValue}
              onChange={(e) => setEditingPathValue(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded-sm border border-border-subtle bg-background px-1.5 text-[12px] font-mono text-secondary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSavePath();
                if (e.key === "Escape") setEditingPathKey(null);
              }}
            />
            <Button
              onClick={() => handleBrowsePath(setEditingPathValue)}
              className="shrink-0 text-muted hover:text-accent"
              title={t("settings.selectFolder")}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
            <Button
              aria-label={t("common.save")}
              disabled={pathSaving}
              onClick={handleSavePath}
              className="shrink-0 text-[var(--ds-success)]"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              aria-label={t("common.cancel")}
              disabled={pathSaving}
              onClick={() => setEditingPathKey(null)}
              className="shrink-0 text-muted hover:text-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p
              className="min-w-0 flex-1 truncate text-[12px] font-mono leading-tight text-muted"
              title={agent.skills_dir}
            >
              {compactHomePath(agent.skills_dir)}
            </p>
            <Button
              type="button"
              onClick={() => startEditPath(agent.key, agent.skills_dir)}
              className="shrink-0 text-muted hover:text-accent transition-opacity"
              title={t("settings.editPath")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {agent.has_path_override && !agent.is_custom && (
              <Button
                type="button"
                onClick={() => handleResetPath(agent.key)}
                className="shrink-0 text-muted transition-opacity hover:text-[var(--ds-warning)]"
                title={t("settings.resetPath")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        {/* Project-relative skills path — always rendered so every card is the
            same height, installed or not. */}
        {editingProjectPathKey === agent.key ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              aria-label={t("settings.projectSkillsPath")}
              disabled={pathSaving}
              value={editingProjectPathValue}
              onChange={(e) => setEditingProjectPathValue(e.target.value)}
              placeholder={t("settings.projectSkillsPathPlaceholder")}
              className="h-7 min-w-0 flex-1 rounded-sm border border-border-subtle bg-background px-1.5 text-[12px] font-mono text-secondary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveProjectPath();
                if (e.key === "Escape") setEditingProjectPathKey(null);
              }}
            />
            <Button
              aria-label={t("common.save")}
              disabled={pathSaving}
              onClick={handleSaveProjectPath}
              className="shrink-0 text-[var(--ds-success)]"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              aria-label={t("common.cancel")}
              disabled={pathSaving}
              onClick={() => setEditingProjectPathKey(null)}
              className="shrink-0 text-muted hover:text-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p
              className="min-w-0 flex-1 truncate text-[12px] font-mono leading-tight text-muted"
              title={agent.project_relative_skills_dir ?? t("settings.projectSkillsPathDesc")}
            >
              {agent.project_relative_skills_dir
                ? !agent.is_custom && !agent.has_project_path_override
                  ? t("settings.projectSkillsPathDefault", {
                      path: agent.project_relative_skills_dir,
                    })
                  : t("settings.projectSkillsPathValue", {
                      path: agent.project_relative_skills_dir,
                    })
                : t("settings.projectSkillsPathEmpty")}
            </p>
            <Button
              type="button"
              onClick={() => startEditProjectPath(agent.key, agent.project_relative_skills_dir)}
              className="shrink-0 text-muted hover:text-accent transition-opacity"
              title={t("settings.editPath")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {!agent.is_custom && agent.has_project_path_override && (
              <Button
                type="button"
                onClick={() => handleResetProjectPath(agent.key)}
                className="shrink-0 text-muted transition-opacity hover:text-[var(--ds-warning)]"
                title={t("settings.resetPath")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`app-page ${styles.page}`}>
      <PageHeader title={t("settings.title")} />

      <div className="ds-settings-layout">
        <nav className="ds-settings-nav" aria-label="设置分类">
          {sections.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              className={cn("ds-button", activeSection === id && "is-active")}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => setActiveSection(id)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="ds-settings-content space-y-6" aria-labelledby="settings-section-title">
          <div>
            <h2 id="settings-section-title" className="text-lg font-semibold text-primary">
              {currentSection.label}
            </h2>
            <p className="mt-1 text-sm text-muted">{currentSection.description}</p>
          </div>
          <div hidden={activeSection !== "runner"}>
            <RunnerSettings />
          </div>
          {activeSection !== "runner" && settingsLoading && <LoadingState label="正在读取设置…" />}
          {activeSection !== "runner" && settingsLoadError && (
            <div role="alert" className={styles.error}>
              {settingsLoadError}
              <Button onClick={retrySettingsLoad}>重新读取</Button>
            </div>
          )}
          {preferenceBusy && <LoadingState label="正在保存设置…" />}
          <fieldset
            className={styles.settingsFields}
            disabled={settingsLoading || Boolean(settingsLoadError) || preferenceBusy}
          >
            {/* Agent status */}
            <section hidden={activeSection !== "tools"}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="app-section-title">
                    {t("settings.supportedAgents")} ({installedTools.length}/{tools.length})
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" onClick={() => setShowAddCustom(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    {t("settings.addCustomAgent")}
                  </Button>
                  <Button disabled={bulkBusy} onClick={() => handleToggleAllTools(true)}>
                    {t("settings.enableAll")}
                  </Button>
                  <Button disabled={bulkBusy} onClick={() => handleToggleAllTools(false)}>
                    {t("settings.disableAll")}
                  </Button>
                  <Button onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {t("settings.refresh")}
                  </Button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
                <span>
                  {t("settings.detectedAgents")}{" "}
                  <span className="font-medium text-secondary">{installedTools.length}</span>
                </span>
                <span>
                  {t("settings.enabledAgents")}{" "}
                  <span className="font-medium text-secondary">{enabledTools.length}</span>
                </span>
                <span>
                  {t("settings.customAgents")}{" "}
                  <span className="font-medium text-secondary">{customTools.length}</span>
                </span>
              </div>

              {/* Add custom agent form */}
              <DetailSheet
                open={showAddCustom}
                title={t("settings.addCustomAgent")}
                size="compact"
                closeDisabled={addingCustom}
                onClose={() => setShowAddCustom(false)}
              >
                <form
                  className={styles.customForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAddCustomAgent();
                  }}
                >
                  <div>
                    <label htmlFor="customName" className="text-[12px] text-muted mb-1 block">
                      {t("settings.agentName")}
                    </label>
                    <input
                      type="text"
                      aria-label={t("settings.agentName")}
                      id="customName"
                      disabled={addingCustom}
                      required
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder={t("settings.agentNamePlaceholder")}
                      className={`${fieldClass} w-full`}
                    />
                  </div>
                  <div>
                    <label htmlFor="customPath" className="text-[12px] text-muted mb-1 block">
                      {t("settings.skillsPath")}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        aria-label={t("settings.skillsPath")}
                        id="customPath"
                        disabled={addingCustom}
                        required
                        value={customPath}
                        onChange={(e) => setCustomPath(e.target.value)}
                        placeholder={t("settings.skillsPathPlaceholder")}
                        className={`${fieldClass} min-w-0 flex-1 font-mono`}
                      />
                      <Button
                        disabled={addingCustom}
                        onClick={() => handleBrowsePath(setCustomPath)}
                        className={actionButtonClass}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {t("settings.selectFolder")}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="customProjectPath"
                      className="text-[12px] text-muted mb-1 block"
                    >
                      {t("settings.projectSkillsPath")}
                    </label>
                    <input
                      type="text"
                      aria-label={t("settings.projectSkillsPath")}
                      id="customProjectPath"
                      disabled={addingCustom}
                      value={customProjectPath}
                      onChange={(e) => setCustomProjectPath(e.target.value)}
                      placeholder={t("settings.projectSkillsPathPlaceholder")}
                      className={`${fieldClass} w-full font-mono`}
                    />
                    <p className="mt-1 text-[12px] text-muted">
                      {t("settings.projectSkillsPathDesc")}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="primary" disabled={addingCustom}>
                      {addingCustom ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      {t("settings.addAgent")}
                    </Button>
                  </div>

                  {customError && (
                    <p role="alert" className={styles.error}>
                      {customError}
                    </p>
                  )}
                  {addingCustom && <LoadingState label="正在添加工具…" />}
                </form>
              </DetailSheet>

              <div className="space-y-4">
                {detectedTools.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-medium text-secondary">
                        {t("settings.detectedAgentsSection")}
                      </h3>
                      <span className="text-[12px] text-muted tabular-nums">
                        {detectedTools.length}
                      </span>
                    </div>
                    <AgentGroupDnd
                      items={detectedTools}
                      sensors={dragSensors}
                      dragLabel={t("settings.dragToReorder")}
                      onDragEnd={handleAgentDragEnd}
                      renderAgentCard={renderAgentCard}
                    />
                  </div>
                )}

                {undetectedTools.length > 0 && (
                  <Disclosure
                    title={t("settings.otherAgentsSection", {
                      count: undetectedTools.length,
                    })}
                    open={showMoreAgents}
                    onOpenChange={setShowMoreAgents}
                  >
                    <AgentGroupDnd
                      items={undetectedTools}
                      sensors={dragSensors}
                      dragLabel={t("settings.dragToReorder")}
                      onDragEnd={handleAgentDragEnd}
                      renderAgentCard={renderAgentCard}
                    />
                  </Disclosure>
                )}

                {customTools.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-medium text-secondary">
                        {t("settings.customAgentsSection")}
                      </h3>
                      <span className="text-[12px] text-muted">{customTools.length}</span>
                    </div>
                    <AgentGroupDnd
                      items={customTools}
                      sensors={dragSensors}
                      dragLabel={t("settings.dragToReorder")}
                      onDragEnd={handleAgentDragEnd}
                      renderAgentCard={renderAgentCard}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Global config */}
            <section hidden={activeSection !== "tools"}>
              <h2 className="app-section-title mb-3">{t("settings.globalConfig")}</h2>
              <div className="ds-panel overflow-hidden divide-y divide-border-faint">
                {/* Repo path */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.repoPath")}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-muted">{t("settings.repoPathDesc")}</p>
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-2">
                    {editingCentralRepoPath ? (
                      <div className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:w-auto">
                        <input
                          type="text"
                          aria-label={t("settings.repoPath")}
                          value={centralRepoPathInput}
                          onChange={(e) => setCentralRepoPathInput(e.target.value)}
                          className={`${fieldClass} min-w-0 flex-1 font-mono`}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveCentralRepoPath();
                            if (e.key === "Escape") {
                              setCentralRepoPathInput(centralRepoPathOverride ?? centralRepoPath);
                              setEditingCentralRepoPath(false);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          onClick={() => handleBrowsePath(setCentralRepoPathInput)}
                          disabled={savingCentralRepoPath}
                          className={actionButtonClass}
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          {t("settings.selectFolder")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleSaveCentralRepoPath()}
                          disabled={savingCentralRepoPath}
                          className={actionButtonClass}
                        >
                          {savingCentralRepoPath ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          {t("common.save")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            setCentralRepoPathInput(centralRepoPathOverride ?? centralRepoPath);
                            setEditingCentralRepoPath(false);
                          }}
                          disabled={savingCentralRepoPath}
                          className={actionButtonClass}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-background px-3 py-2">
                        <Folder className="w-3.5 h-3.5 text-muted" />
                        <span className="truncate text-[13px] font-mono text-tertiary">
                          {displayedRepoPath}
                        </span>
                      </div>
                    )}
                    {!editingCentralRepoPath && (
                      <Button
                        type="button"
                        onClick={handleStartEditCentralRepoPath}
                        className={actionButtonClass}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {t("settings.changeDir")}
                      </Button>
                    )}
                    {!editingCentralRepoPath && centralRepoPathOverride && (
                      <Button
                        type="button"
                        onClick={() => void handleResetCentralRepoPath()}
                        disabled={savingCentralRepoPath}
                        className={actionButtonClass}
                      >
                        {savingCentralRepoPath ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        {t("settings.resetPath")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={handleOpenRepoInFinder}
                      disabled={openingRepo}
                      className={actionButtonClass}
                    >
                      {openingRepo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      {t("settings.openInFinder")}
                    </Button>
                  </div>
                  <div className="w-full text-[12px] text-muted">
                    {centralRepoPathOverride
                      ? t("settings.repoPathCustomHint")
                      : t("settings.repoPathDefaultHint")}
                  </div>
                </div>

                {/* Sync mode */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.syncMode")}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {t("settings.syncModeDesc")} 项目添加始终使用软链接；此选项用于旧同步流程。
                    </p>
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    <Button
                      aria-pressed={syncMode === "symlink"}
                      onClick={() => handleSyncModeChange("symlink")}
                      className={cn(
                        segmentedButtonClass,
                        syncMode === "symlink"
                          ? "bg-surface-active text-secondary"
                          : "text-muted hover:text-tertiary",
                      )}
                    >
                      <LinkIcon className="w-3.5 h-3.5" /> {t("settings.symlink")}
                    </Button>
                    <Button
                      aria-pressed={syncMode === "copy"}
                      onClick={() => handleSyncModeChange("copy")}
                      className={cn(
                        segmentedButtonClass,
                        syncMode === "copy"
                          ? "bg-surface-active text-secondary"
                          : "text-muted hover:text-tertiary",
                      )}
                    >
                      <Copy className="w-3.5 h-3.5" /> {t("settings.copy")}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
            <section hidden={activeSection !== "appearance"}>
              <div className="ds-panel overflow-hidden divide-y divide-border-faint">
                {/* Theme */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.theme")}
                    </h3>
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    {themeOptions.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <Button
                          key={opt.value}
                          aria-pressed={theme === opt.value}
                          onClick={() => setTheme(opt.value)}
                          className={cn(
                            segmentedButtonClass,
                            theme === opt.value
                              ? "bg-surface-active text-secondary"
                              : "text-muted hover:text-tertiary",
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" /> {opt.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Text size */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.textSize")}
                    </h3>
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    {(
                      [
                        { value: "small", label: t("settings.textSizeSmall") },
                        {
                          value: "default",
                          label: t("settings.textSizeDefault"),
                        },
                        { value: "large", label: t("settings.textSizeLarge") },
                        {
                          value: "xlarge",
                          label: t("settings.textSizeXLarge"),
                        },
                      ] as const
                    ).map((opt) => (
                      <Button
                        key={opt.value}
                        aria-pressed={textSize === opt.value}
                        onClick={() => handleTextSizeChange(opt.value)}
                        className={cn(
                          segmentedButtonClass,
                          textSize === opt.value
                            ? "bg-surface-active text-secondary"
                            : "text-muted hover:text-tertiary",
                        )}
                      >
                        {opt.value === "small" && <Type className="w-2.5 h-2.5" />}
                        {opt.value === "default" && <Type className="w-3 h-3" />}
                        {opt.value === "large" && <Type className="w-3.5 h-3.5" />}
                        {opt.value === "xlarge" && <Type className="w-4 h-4" />}
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.language")}
                    </h3>
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    {(
                      [
                        { value: "zh", label: "简体中文" },
                        { value: "zh-TW", label: "繁體中文" },
                        { value: "en", label: "English" },
                      ] as const
                    ).map((opt) => (
                      <Button
                        key={opt.value}
                        aria-pressed={i18n.language === opt.value}
                        onClick={() => handleLanguageChange(opt.value)}
                        className={cn(
                          segmentedButtonClass,
                          i18n.language === opt.value
                            ? "bg-surface-active text-secondary"
                            : "text-muted hover:text-tertiary",
                        )}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Close action */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.closeAction")}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-muted">{t("settings.closeActionDesc")}</p>
                    {!showTrayIcon && (
                      <p className="text-[12px] text-muted mt-1">{t("settings.trayIconOffHint")}</p>
                    )}
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    {(["", "hide", "close"] as const).map((val) => (
                      <Button
                        key={val}
                        aria-pressed={closeAction === val}
                        onClick={() => handleCloseActionChange(val)}
                        disabled={val === "hide" && !showTrayIcon}
                        className={cn(
                          segmentedButtonClass,
                          closeAction === val
                            ? "bg-surface-active text-secondary"
                            : "text-muted hover:text-tertiary",
                          val === "hide" &&
                            !showTrayIcon &&
                            "opacity-50 cursor-not-allowed hover:text-muted",
                        )}
                      >
                        {t(`settings.closeAction_${val || "ask"}`)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Tray icon */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.trayIcon")}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-muted">{t("settings.trayIconDesc")}</p>
                  </div>
                  <ToggleSwitch
                    className="mt-1"
                    checked={showTrayIcon}
                    onChange={() => handleShowTrayIconChange(!showTrayIcon)}
                    title={showTrayIcon ? t("settings.trayIcon_on") : t("settings.trayIcon_off")}
                  />
                </div>
              </div>
            </section>

            {/* Proxy config */}
            <section hidden={activeSection !== "sync"}>
              <h2 className="app-section-title mb-3">{t("settings.proxyConfig")}</h2>
              <div className="ds-panel overflow-hidden divide-y divide-border-faint">
                <div className="px-4 py-3">
                  <h3 className="text-[14px] font-semibold text-primary">
                    {t("settings.proxyUrl")}
                  </h3>
                  <p className="mt-0.5 mb-2 text-[12px] text-muted">{t("settings.proxyUrlDesc")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      aria-label={t("settings.proxyUrl")}
                      value={proxyInput}
                      onChange={(e) => setProxyInput(e.target.value)}
                      placeholder={t("settings.proxyUrlPlaceholder")}
                      className={`${fieldClass} min-w-0 flex-1 font-mono`}
                    />
                    <Button
                      onClick={handleSaveProxy}
                      disabled={proxySaving}
                      className={actionButtonClass}
                    >
                      {proxySaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LinkIcon className="w-3.5 h-3.5" />
                      )}
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* Skill auto-update */}
            <section hidden={activeSection !== "sync"}>
              <h2 className="app-section-title mb-3">{t("settings.autoUpdate.title")}</h2>
              <div className="ds-panel overflow-hidden divide-y divide-border-faint">
                <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.autoUpdate.intervalLabel")}
                    </h3>
                    <p className="text-[12px] text-muted">
                      {t("settings.autoUpdate.intervalDesc")}
                      {autoUpdateLastRun
                        ? ` · ${t("settings.autoUpdate.lastRun", {
                            time: new Date(autoUpdateLastRun).toLocaleString(),
                          })}`
                        : ""}
                    </p>
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    {autoUpdateIntervalOptions.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        aria-pressed={autoUpdateInterval === option.value}
                        onClick={() => handleAutoUpdateIntervalChange(option.value)}
                        className={cn(
                          segmentedButtonClass,
                          autoUpdateInterval === option.value
                            ? "bg-surface-active text-secondary"
                            : "text-muted hover:text-tertiary",
                        )}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-primary">
                      {t("settings.autoUpdate.applyLabel")}
                    </h3>
                    <p className="text-[12px] text-muted">{t("settings.autoUpdate.applyDesc")}</p>
                  </div>
                  <div className="app-segmented flex-wrap bg-background">
                    {autoUpdateApplyOptions.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        aria-pressed={autoUpdateApply === option.value}
                        onClick={() => handleAutoUpdateApplyChange(option.value)}
                        className={cn(
                          segmentedButtonClass,
                          autoUpdateApply === option.value
                            ? "bg-surface-active text-secondary"
                            : "text-muted hover:text-tertiary",
                        )}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Git sync config */}
            <section hidden={activeSection !== "sync"}>
              <h2 className="app-section-title mb-3">{t("settings.gitSyncConfig")}</h2>
              <div className="ds-panel overflow-hidden divide-y divide-border-faint">
                <div className="px-4 py-3">
                  <h3 className="text-[14px] font-semibold text-primary">
                    {t("settings.gitRemoteUrl")}
                  </h3>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="mt-0.5 text-[12px] text-muted">
                      {t("settings.gitSyncConfigDesc")}
                    </p>
                    <Button
                      type="button"
                      onClick={() => navigate({ to: "/backup" })}
                      className={actionButtonClass}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t("settings.openBackupPage")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      aria-label={t("settings.gitRemoteUrl")}
                      value={gitRemoteInput}
                      onChange={(e) => setGitRemoteInput(e.target.value)}
                      placeholder={t("settings.gitRemoteUrlPlaceholder")}
                      className={`${fieldClass} min-w-0 flex-1 font-mono`}
                    />
                    <Button
                      onClick={handleSaveGitRemote}
                      disabled={gitRemoteSaving}
                      className={actionButtonClass}
                    >
                      {gitRemoteSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LinkIcon className="w-3.5 h-3.5" />
                      )}
                      {t("common.save")}
                    </Button>
                    <Button
                      onClick={handleDisconnectGitRemote}
                      disabled={gitRemoteDisconnecting}
                      className={actionButtonClass}
                    >
                      {gitRemoteDisconnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Unlink className="w-3.5 h-3.5" />
                      )}
                      {t("settings.gitDisconnect")}
                    </Button>
                  </div>
                  <p className="text-[12px] text-muted mt-2">{t("settings.gitDisconnectHint")}</p>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-primary">
                        {t("settings.gitEngineGit2")}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {t("settings.gitEngineGit2Desc")}
                      </p>
                    </div>
                    <ToggleSwitch
                      className="mt-1"
                      checked={gitEngineGit2}
                      title={t("settings.gitEngineGit2")}
                      onChange={async () => {
                        const next = !gitEngineGit2;
                        setGitEngineGit2(next);
                        try {
                          await api.setSettings("git_backup_engine", next ? "git2" : "system");
                          toast.success(t("common.success"));
                        } catch {
                          setGitEngineGit2(!next);
                          toast.error(t("common.error"));
                        }
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-primary">
                        {t("settings.gitMergeEngineObject")}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {t("settings.gitMergeEngineObjectDesc")}
                      </p>
                    </div>
                    <ToggleSwitch
                      className="mt-1"
                      checked={gitMergeEngineObject}
                      title={t("settings.gitMergeEngineObject")}
                      onChange={async () => {
                        const next = !gitMergeEngineObject;
                        setGitMergeEngineObject(next);
                        try {
                          await api.setSettings("merge_engine", next ? "object" : "system");
                          toast.success(t("common.success"));
                        } catch {
                          setGitMergeEngineObject(!next);
                          toast.error(t("common.error"));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* About */}
            <section hidden={activeSection !== "about"} className="space-y-2">
              {repoWarnings.length > 0 && (
                <div className="ds-panel flex flex-wrap items-start gap-2 p-3 border border-[color-mix(in_srgb,var(--ds-warning)_40%,transparent)] bg-[var(--ds-warning-bg)]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--ds-warning)]" />
                  <div className="min-w-0 flex-1 space-y-1 text-[13px] text-[color-mix(in_srgb,var(--ds-warning)_55%,var(--ds-strong))]">
                    {repoWarnings.map((code) => (
                      <p key={code}>{t(`settings.repoWarning_${code}`)}</p>
                    ))}
                  </div>
                </div>
              )}
              {lastPanic && (
                <div className="ds-panel flex flex-wrap items-center justify-between gap-2 p-3 border border-[color-mix(in_srgb,var(--ds-danger)_40%,transparent)] bg-[var(--ds-danger-bg)]">
                  <div className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--ds-danger)]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{t("settings.panicBanner", { time: lastPanic.timestamp })}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={handleReportIssue}
                      disabled={reportingIssue}
                    >
                      {reportingIssue ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bug className="w-3.5 h-3.5" />
                      )}
                      {t("settings.reportIssue")}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleDismissPanic}
                      className={actionButtonClass}
                    >
                      {t("settings.panicDismiss")}
                    </Button>
                  </div>
                </div>
              )}
              <div className="ds-panel flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-hover border border-border flex items-center justify-center">
                    <Settings2 className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-primary">
                      {t("settings.version")}
                    </h3>
                    <p className="text-muted text-[13px]">
                      {t("settings.tagline")}
                      {appUpdate?.has_update && (
                        <span className="ml-2 font-medium text-[var(--ds-warning)]">
                          {t("settings.updateAvailable", {
                            version: appUpdate.latest_version,
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appUpdate?.has_update ? (
                    CAN_INSTALL_IN_APP ? (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={handleAutoUpdate}
                          disabled={installing}
                        >
                          {installing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          {installing ? t("settings.installing") : t("settings.installUpdate")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            openUrl(appUpdate.release_url).catch(() => {});
                          }}
                          className={actionButtonClass}
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {t("settings.download")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => {
                          openUrl(appUpdate.release_url).catch(() => {});
                        }}
                      >
                        <Download className="w-3.5 h-3.5" /> {t("settings.download")}
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                      className={actionButtonClass}
                    >
                      {checkingUpdate ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {checkingUpdate ? t("settings.checking") : t("settings.checkUpdate")}
                    </Button>
                  )}
                  <Button type="button" onClick={openHelp} className={actionButtonClass}>
                    <BookOpen className="w-3.5 h-3.5" /> {t("settings.help")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleReportIssue}
                    disabled={reportingIssue}
                    title={t("settings.reportIssueHint")}
                    className={actionButtonClass}
                  >
                    {reportingIssue ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bug className="w-3.5 h-3.5" />
                    )}
                    {t("settings.reportIssue")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleExportLogs}
                    disabled={exportingLogs}
                    title={t("settings.exportLogsHint")}
                    className={actionButtonClass}
                  >
                    {exportingLogs ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileArchive className="w-3.5 h-3.5" />
                    )}
                    {t("settings.exportLogs")}
                  </Button>
                </div>
              </div>
            </section>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
