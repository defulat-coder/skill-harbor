import { Disclosure } from "../components/ui/Disclosure";
import { CardActionMenu } from "../components/CardActionMenu";
import { LoadingState } from "../components/ui/LoadingState";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import styles from "./InstallSkills.module.css";
import { DetailSheet } from "../components/DetailSheet";
import { deployWorkbenchSkills } from "../lib/workbench";
import { invoke } from "@tauri-apps/api/core";
import { MarketChinesePreview } from "../components/MarketChinesePreview";
import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from "react";
import {
  DownloadCloud,
  UploadCloud,
  Github,
  Box,
  Plus,
  FolderUp,
  Loader2,
  RefreshCw,
  FolderSearch,
  FolderInput,
  ExternalLink,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Pencil,
  Calendar,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import type { ScanResult, SkillsShSkill, BatchImportResult, GitPreviewResult } from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSearchParams, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { StatusBanner } from "../components/StatusBanner";
import { getErrorMessage, getErrorKind } from "../lib/error";

const MARKET_PAGE_SIZE = 24;
const MARKET_SEARCH_STEP = 60;
const MARKET_SEARCH_DEBOUNCE_MS = 450;
const MARKET_SEARCH_CACHE_TTL_MS = 120_000;
const MARKET_SEARCH_CACHE_MAX_ENTRIES = 150;

export function InstallSkills() {
  const { t } = useTranslation();
  const { refreshPresets, refreshManagedSkills, refreshProjects, managedSkills, projects, openSkillDetailById } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [targetProject, setTargetProject] = useState(searchParams.get("project") ?? "");
  const [addingToProject, setAddingToProject] = useState<string | null>(null);
  const addMarketSkillToProject = async (skill: SkillsShSkill) => {
    if (!targetProject) return;
    setAddingToProject(skill.id);
    try {
      const library = await api.getManagedSkills();
      const installed = library.find(s => s.source_type === "skillssh" && s.source_ref === `${skill.source}/${skill.skill_id}`);
      if (!installed) throw new Error("已安装，但未能匹配来源，请从项目技能选择器添加。");
      const results = await deployWorkbenchSkills(targetProject, [installed.id], "codex", "symlink");
      const failed = results.find(r => !r.ok);
      if (failed) throw new Error(failed.error || "部署失败");
      await refreshProjects();
      toast.success("已链接到所选项目");
    } catch (e) { toast.error(getErrorMessage(e, "添加到项目失败")); } finally { setAddingToProject(null); }
  };
  const [activeTab, setActiveTab] = useState<"market" | "local" | "git">("market");
  const [marketTab, setMarketTab] = useState<"hot" | "trending" | "alltime">("alltime");
  const [marketQuery, setMarketQuery] = useState("");
  const [translatingQuery, setTranslatingQuery] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const queryVersion = useRef(0);
  const translateQuery = async () => {
    if (translatingQuery || !marketQuery.trim()) return;
    const version = ++queryVersion.current;
    setTranslationError(null);
    setTranslatingQuery(true);
    try { const translated = await invoke<string>("translate_market_query", { query: marketQuery }); if (version === queryVersion.current) { setMarketQuery(translated); setMarketSearchLimit(MARKET_SEARCH_STEP); } }
    catch (e) { if (version === queryVersion.current) setTranslationError(getErrorMessage(e, "关键词转换失败")); }
    finally { setTranslatingQuery(false); }
  };
  const [marketSourceFilter, setMarketSourceFilter] = useState("all");
  const [marketSkills, setMarketSkills] = useState<SkillsShSkill[]>([]);
  const [marketPage, setMarketPage] = useState(1);
  const [marketSearchLimit, setMarketSearchLimit] = useState(MARKET_SEARCH_STEP);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketLoadingMore, setMarketLoadingMore] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketReloadKey, setMarketReloadKey] = useState(0);
  const [installing, setInstalling] = useState<string | null>(null);
  const [marketInstall, setMarketInstall] = useState<{ name: string; cancelKey: string; target: string; cancellable: boolean } | null>(null);
  const marketInstallLock = useRef(false);
  const [gitUrl, setGitUrl] = useState("");
  const [localSourcePath, setLocalSourcePath] = useState("");
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitCancelKey, setGitCancelKey] = useState<string | null>(null);
  const [gitPreview, setGitPreview] = useState<GitPreviewResult | null>(null);
  const [gitPreviewRepoUrl, setGitPreviewRepoUrl] = useState<string | null>(null);
  const [gitSelections, setGitSelections] = useState<{ rel_path: string; name: string; description: string | null; selected: boolean }[]>([]);
  const [gitConfirmLoading, setGitConfirmLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInstalling, setLocalInstalling] = useState(false);
  const localInstallLock = useRef(false);
  const initialScanAttempted = useRef(false);
  const localRetry = useRef<(() => void) | null>(null);
  const [importingPaths, setImportingPaths] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const [renameEditing, setRenameEditing] = useState<Record<string, string>>({});
  const marketListRef = useRef<HTMLDivElement | null>(null);
  const marketSearchCacheRef = useRef<Map<string, { timestamp: number; data: SkillsShSkill[] }>>(new Map());
  const marketSkillsLengthRef = useRef(0);
  const [debouncedMarketQuery, setDebouncedMarketQuery] = useState("");
  const deferredMarketQuery = useDeferredValue(marketQuery);
  const managedSkillsRef = useRef(managedSkills);
  managedSkillsRef.current = managedSkills;

  const goToSkill = useCallback((skillName: string) => {
    // Use ref to get the latest managedSkills after refresh
    const skills = managedSkillsRef.current;
    const skill = skills.find(
      (s) => s.name === skillName || s.source_ref === skillName
    );
    if (skill) {
      openSkillDetailById(skill.id);
    }
    navigate("/my-skills");
  }, [navigate, openSkillDetailById]);

  const pruneMarketSearchCache = useCallback(() => {
    const now = Date.now();
    const entries = Array.from(marketSearchCacheRef.current.entries());

    for (const [key, value] of entries) {
      if (now - value.timestamp >= MARKET_SEARCH_CACHE_TTL_MS) {
        marketSearchCacheRef.current.delete(key);
      }
    }

    if (marketSearchCacheRef.current.size <= MARKET_SEARCH_CACHE_MAX_ENTRIES) {
      return;
    }

    const sorted = Array.from(marketSearchCacheRef.current.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const removeCount = marketSearchCacheRef.current.size - MARKET_SEARCH_CACHE_MAX_ENTRIES;
    for (const [key] of sorted.slice(0, removeCount)) {
      marketSearchCacheRef.current.delete(key);
    }
  }, []);

  const installedSourceRefs = useMemo(() => {
    const set = new Set<string>();
    for (const skill of managedSkills) {
      if (skill.source_type === "skillssh" && skill.source_ref) {
        set.add(skill.source_ref);
      }
    }
    return set;
  }, [managedSkills]);

  const findInstalledByGitUrl = useCallback((url: string) => {
    const trimmed = url.trim().replace(/\.git$/, "").toLowerCase();
    return managedSkills.find((s) => {
      if (!s.source_ref) return false;
      const ref = s.source_ref.replace(/\.git$/, "").toLowerCase();
      return ref === trimmed || ref.endsWith("/" + trimmed.split("/").slice(-2).join("/"));
    });
  }, [managedSkills]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMarketQuery(deferredMarketQuery);
    }, MARKET_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [deferredMarketQuery]);

  useEffect(() => {
    marketSkillsLengthRef.current = marketSkills.length;
  }, [marketSkills.length]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "market" || tab === "local" || tab === "git") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const switchTab = (tab: "market" | "local" | "git") => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const runScan = useCallback(async () => {
    setScanLoading(true);
    localRetry.current = null;
    setLocalError(null);
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
    } catch (error: unknown) {
      console.error(error);
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    } finally {
      setScanLoading(false);
    }
  }, [t]);

  // Silent variant used after install/import. Never surfaces a toast or
  // new error state — failure here must not mask the install success.
  // Clears any stale localError on success so successful operations don't
  // leave previous error banners behind.
  const runScanSilent = useCallback(async () => {
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
      setLocalError(null);
    } catch (error: unknown) {
      console.warn("silent scan failed:", error);
    }
  }, []);

  const warnRejected = (results: PromiseSettledResult<unknown>[], label: string) => {
    for (const r of results) {
      if (r.status === "rejected") console.warn(`${label} failed:`, r.reason);
    }
  };

  useEffect(() => {
    if (activeTab !== "market") return;

    const query = debouncedMarketQuery.trim();
    const loadingMore =
      query.length > 0 &&
      marketSkillsLengthRef.current > 0 &&
      marketSearchLimit > marketSkillsLengthRef.current;

    if (query.length > 0 && !loadingMore) {
      const cacheKey = `${query.toLowerCase()}|${marketSearchLimit}`;
      const cached = marketSearchCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < MARKET_SEARCH_CACHE_TTL_MS) {
        setMarketSkills(cached.data);
        setMarketLoading(false);
        setMarketLoadingMore(false);
        setMarketPage(1);
        setMarketError(null);
        return;
      }
    }

    setMarketLoadingMore(loadingMore);
    setMarketLoading(true);
    if (!loadingMore) {
      setMarketPage(1);
    }
    setMarketError(null);

    let stale = false;
    const request = query
      ? api.searchSkillssh(query, marketSearchLimit)
      : api.fetchLeaderboard(marketTab);

    request
      .then((result) => {
        if (stale) return;
        setMarketSkills(result);
        if (query.length > 0 && !loadingMore) {
          const cacheKey = `${query.toLowerCase()}|${marketSearchLimit}`;
          marketSearchCacheRef.current.set(cacheKey, { timestamp: Date.now(), data: result });
          pruneMarketSearchCache();
        }
        if (!loadingMore) {
          setMarketSourceFilter("all");
        }
      })
      .catch((e) => {
        if (stale) return;
        console.error(e);
        const message = e?.toString?.() || t("common.error");
        setMarketError(message);
        toast.error(message);
      })
      .finally(() => {
        if (stale) return;
        setMarketLoading(false);
        setMarketLoadingMore(false);
      });

    return () => { stale = true; };
  }, [activeTab, debouncedMarketQuery, marketReloadKey, marketSearchLimit, marketTab, pruneMarketSearchCache, t]);

  useEffect(() => {
    if (activeTab === "local" && !initialScanAttempted.current && !scanResult && !scanLoading) {
      initialScanAttempted.current = true;
      runScan();
    }
  }, [activeTab, scanLoading, scanResult, runScan]);

  const performLocalSourceInstall = async (sourcePath: string) => {
    const name = sourcePath.split("/").pop() || sourcePath;
    const toastId = toast.loading(t("install.toast.installing", { name }));
    try {
      await api.installLocal(sourcePath);
    } catch (e) {
      const message = getErrorMessage(e, t("common.error"));
      setLocalError(message);
      toast.error(message, { id: toastId });
      return;
    }
    // Install succeeded — post-install refresh is best-effort and must not
    // surface as an install failure.
    const results = await Promise.allSettled([
      refreshPresets(),
      refreshManagedSkills(),
      runScanSilent(),
    ]);
    warnRejected(results, "post-install refresh");
    toast.success(t("install.toast.success", { name }), {
      id: toastId,
      action: {
        label: t("install.toast.view"),
        onClick: () => goToSkill(name),
      },
    });
  };

  const installLocalSource = async (sourcePath: string) => {
    if (localInstallLock.current) return;
    localInstallLock.current = true;
    setLocalInstalling(true); setLocalError(null);
    localRetry.current = () => { void installLocalSource(sourcePath); };
    try { await performLocalSourceInstall(sourcePath); }
    finally { localInstallLock.current = false; setLocalInstalling(false); }
  };

  const handleLocalFolderInstall = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (!selected) return;
      installLocalSource(selected as string);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    }
  };

  const handleLocalFileInstall = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Skills", extensions: ["zip", "skill"] }],
      });
      if (!selected) return;
      installLocalSource(selected as string);
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    }
  };

  const handleBatchImportFolder = async () => {
    if (localInstallLock.current) return;
    localInstallLock.current = true; setLocalInstalling(true); setLocalError(null);
    localRetry.current = () => { void handleBatchImportFolder(); };
    let unlisten: (() => void) | null = null;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (!selected) return;

      const toastId = toast.loading(t("install.local.batchImporting"));

      unlisten = await listen<{ current: number; total: number; name: string }>(
        "batch-import-progress",
        (event) => {
          const { current, total, name } = event.payload;
          toast.loading(
            t("install.local.batchProgress", { current, total, name }),
            { id: toastId }
          );
        }
      );

      const result: BatchImportResult = await api.batchImportFolder(
        selected as string
      );

      if (result.errors.length > 0) {
        const previewErrors = result.errors.slice(0, 3).join("; ");
        const remaining = result.errors.length - 3;
        const detail = remaining > 0 ? `${previewErrors}; +${remaining} more` : previewErrors;
        toast.error(
          `${t("install.local.batchErrors", { count: result.errors.length })}: ${detail}`,
          { id: toastId }
        );
      } else if (result.imported === 0) {
        toast.info(
          t("install.local.batchAllSkipped", { skipped: result.skipped }),
          { id: toastId }
        );
      } else {
        toast.success(
          t("install.local.batchSuccess", {
            imported: result.imported,
            skipped: result.skipped,
          }),
          { id: toastId }
        );
      }

      await Promise.all([refreshPresets(), refreshManagedSkills()]);
      runScan();
    } catch (error: unknown) {
      const message = getErrorMessage(error, t("common.error"));
      setLocalError(message);
      toast.error(message);
    } finally {
      unlisten?.();
      localInstallLock.current = false; setLocalInstalling(false);
    }
  };

  const handleInstallSkillssh = async (skill: SkillsShSkill) => {
    if (marketInstallLock.current) return;
    marketInstallLock.current = true;
    const displayName = skill.name || skill.skill_id;
    const cancelKey = `${skill.source}/${skill.skill_id}`;
    setInstalling(skill.id);
    setMarketInstall({ name: displayName, cancelKey, target: targetProject ? projects.find(p => p.id === targetProject)?.name || "所选项目" : "全局技能库", cancellable: true });

    const toastId = toast.loading(t("install.toast.cloning"));
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await listen<{ skill_id: string; phase: string; detail?: string }>(
        "install-progress",
        (event) => {
          if (event.payload.skill_id !== cancelKey) return;
          if (event.payload.phase === "cloning") {
            const detail = event.payload.detail?.trim();
            const msg = detail
              ? `${t("install.toast.cloning")}\n${detail}`
              : t("install.toast.cloning");
            toast.loading(msg, { id: toastId });
          } else if (event.payload.phase === "installing") {
            toast.loading(t("install.toast.installing", { name: displayName }), { id: toastId });
          }
        }
      );
      await api.installFromSkillssh(skill.source, skill.skill_id);
      setMarketInstall(previous => previous ? { ...previous, cancellable: false } : null);
      await Promise.all([refreshPresets(), refreshManagedSkills()]);
      if (targetProject) await addMarketSkillToProject(skill);
      toast.success(t("install.toast.success", { name: displayName }), {
        id: toastId,
        action: {
          label: t("install.toast.view"),
          onClick: () => goToSkill(displayName),
        },
      });
    } catch (error: unknown) {
      if (getErrorKind(error) === "cancelled") {
        toast.info(t("install.toast.cancelled"), { id: toastId });
      } else {
        toast.error(getErrorMessage(error, t("common.error")), { id: toastId });
      }
    } finally {
      setInstalling(null);
      setMarketInstall(null);
      marketInstallLock.current = false;
      unlisten?.();
    }
  };

  const handleCancelInstall = (cancelKey: string) => {
    api.cancelInstall(cancelKey).catch(() => {
      // Ignore race: install may have completed before cancel request arrives.
    });
  };

  const handleGitPreview = async () => {
    if (!gitUrl.trim() || gitLoading) return;
    setGitError(null);
    setGitLoading(true);
    const url = gitUrl.trim();
    setGitCancelKey(url);

    const toastId = toast.loading(t("install.toast.cloning"));
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await listen<{ skill_id: string; phase: string; detail?: string }>(
        "install-progress",
        (event) => {
          if (event.payload.skill_id !== url) return;
          if (event.payload.phase === "cloning") {
            const detail = event.payload.detail?.trim();
            const msg = detail
              ? `${t("install.toast.cloning")}\n${detail}`
              : t("install.toast.cloning");
            toast.loading(msg, { id: toastId });
          }
        }
      );
      const preview = await api.previewGitInstall(url);
      toast.dismiss(toastId);
      setGitPreview(preview);
      setGitPreviewRepoUrl(url);
      setGitSelections(preview.skills.map((s) => ({
        rel_path: s.rel_path,
        name: s.name,
        description: s.description,
        selected: true,
      })));
    } catch (error: unknown) {
      if (getErrorKind(error) === "cancelled") {
        toast.info(t("install.toast.cancelled"), { id: toastId });
      } else {
        const message = getErrorMessage(error, t("common.error"));
        setGitError(message);
        toast.error(message, { id: toastId });
      }
    } finally {
      setGitLoading(false);
      setGitCancelKey(null);
      unlisten?.();
    }
  };

  const handleGitPreviewClose = () => {
    if (gitConfirmLoading) return;
    if (gitPreview) {
      api.cancelGitPreview(gitPreview.temp_dir).catch(() => {});
    }
    setGitPreview(null);
    setGitPreviewRepoUrl(null);
    setGitSelections([]);
  };

  const handleGitConfirm = async () => {
    if (!gitPreview) return;
    const repoUrl = gitPreviewRepoUrl ?? gitUrl.trim();
    if (!repoUrl) return;
    const selected = gitSelections.filter((s) => s.selected);
    if (selected.length === 0) return;
    setGitConfirmLoading(true);
    try {
      await api.confirmGitInstall(
        repoUrl,
        gitPreview.temp_dir,
        selected.map((s) => ({ rel_path: s.rel_path, name: s.name }))
      );
      await Promise.all([refreshPresets(), refreshManagedSkills()]);
      toast.success(t("install.toast.success", { name: selected.map((s) => s.name).join(", ") }));
      setGitUrl("");
      setGitPreview(null);
      setGitPreviewRepoUrl(null);
      setGitSelections([]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setGitConfirmLoading(false);
    }
  };

  const handleImportDiscovered = async (sourcePath: string, name: string) => {
    setImportingPaths((prev) => new Set(prev).add(sourcePath));
    try {
      try {
        await api.importExistingSkill(sourcePath, name);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
        return;
      }
      toast.success(t("install.scan.importedOne", { name }));
      const results = await Promise.allSettled([
        refreshPresets(),
        refreshManagedSkills(),
        runScanSilent(),
      ]);
      warnRejected(results, "post-import refresh");
    } finally {
      setImportingPaths((prev) => {
        const next = new Set(prev);
        next.delete(sourcePath);
        return next;
      });
    }
  };

  const handleImportAllDiscovered = async () => {
    setImportingAll(true);
    try {
      try {
        await api.importAllDiscovered();
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, t("common.error")));
        return;
      }
      toast.success(t("install.scan.importedAll"));
      const results = await Promise.allSettled([
        refreshPresets(),
        refreshManagedSkills(),
        runScanSilent(),
      ]);
      warnRejected(results, "post-import refresh");
    } finally {
      setImportingAll(false);
    }
  };

  const scrollMarketListToTop = () => {
    marketListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const changeMarketPage = (page: number) => {
    setMarketPage(page);
    scrollMarketListToTop();
  };

  const scanGroups = scanResult?.groups ?? [];
  const pendingGroups = scanGroups.filter((group) => !group.imported);
  const sourceOptions = useMemo(
    () => Array.from(new Set(marketSkills.map((skill) => skill.source))),
    [marketSkills]
  );

  const filteredMarketSkills = useMemo(() => {
    const filtered = marketSourceFilter === "all"
      ? marketSkills
      : marketSkills.filter((skill) => skill.source === marketSourceFilter);
    if (debouncedMarketQuery.trim().length > 0) {
      return [...filtered].sort((a, b) => b.installs - a.installs);
    }
    return filtered;
  }, [marketSkills, marketSourceFilter, debouncedMarketQuery]);

  const totalMarketPages = Math.max(1, Math.ceil(filteredMarketSkills.length / MARKET_PAGE_SIZE));
  const currentMarketPage = Math.min(marketPage, totalMarketPages);
  const marketPageStart = (currentMarketPage - 1) * MARKET_PAGE_SIZE;
  const paginatedMarketSkills = filteredMarketSkills.slice(
    marketPageStart,
    marketPageStart + MARKET_PAGE_SIZE
  );
  const visibleMarketPages = Array.from(
    { length: totalMarketPages },
    (_, index) => index + 1
  ).filter((page) => {
    if (totalMarketPages <= 7) return true;
    if (page === 1 || page === totalMarketPages) return true;
    return Math.abs(page - currentMarketPage) <= 1;
  });
  const hasMarketQuery = debouncedMarketQuery.trim().length > 0;
  const canLoadMoreSearch = hasMarketQuery && marketSkills.length >= marketSearchLimit;
  const isLoadingMoreSearch = hasMarketQuery && marketLoadingMore;
  return (
    <div className={`app-page ds-market ${styles.page}`}>
      <div className="app-page-header border-b-0 pb-0">
        <PageHeader title="发现技能" description="从市场、本地目录或 Git 仓库补充全局技能库，先阅读中文用法，再链接到项目。" />
        <nav className={styles.sources} aria-label="技能来源">
          {[
            { id: "market" as const, label: t("install.browseMarket"), icon: Box },
            { id: "local" as const, label: t("install.localInstall"), icon: UploadCloud },
            { id: "git" as const, label: t("install.gitInstall"), icon: Github },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                aria-pressed={isActive}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  styles.sourceButton,
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-tertiary"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {marketInstall && <div className={styles.activeInstall}>
        <p role="status"><strong>{marketInstall.name}</strong><span>{marketInstall.cancellable ? "正在安装" : "已安装，正在更新记录或链接项目"} · 目标：{marketInstall.target}</span></p>
        {marketInstall.cancellable && <Button variant="danger" onClick={() => handleCancelInstall(marketInstall.cancelKey)}>取消安装</Button>}
      </div>}
      {activeTab === "market" && (
        <div className={styles.sourceContent}>
          <div className={styles.toolbar}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <div className={styles.searchRow}>
                  <div className={styles.searchField}>
                    <label htmlFor="market-skill-query" className={styles.searchLabel}>搜索市场技能</label>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      id="market-skill-query"
                      aria-describedby="market-search-help"
                      value={marketQuery}
                      onChange={(event) => {
                        queryVersion.current += 1;
                        setTranslationError(null);
                        setMarketQuery(event.target.value);
                        setMarketSearchLimit(MARKET_SEARCH_STEP);
                      }}
                      placeholder="输入技能名或中文需求，再点击转换关键词"
                      className="app-input w-full bg-background pl-9"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>

                  <Button busy={translatingQuery} disabled={!marketQuery.trim()} onClick={() => void translateQuery()}>中文转检索词</Button>
                </div>
              </div>

              <p id="market-search-help" className={styles.help}>输入后自动搜索；中文转换会调用本地 Codex 整理英文检索词。</p>
              {translationError && <div role="alert"><StatusBanner compact tone="danger" title="关键词转换失败" description={translationError} actionLabel="重试转换" onAction={translateQuery} /></div>}
              <div className={styles.filters}>
                <label>榜单<select className="app-input" aria-label="市场榜单" value={marketTab} disabled={hasMarketQuery} onChange={e => setMarketTab(e.target.value as "alltime" | "trending" | "hot")}><option value="alltime">{t("install.all")}</option><option value="trending">{t("install.trending")}</option><option value="hot">{t("install.hot")}</option></select></label>
                <label>来源<select className="app-input" aria-label="筛选技能来源" value={marketSourceFilter} onChange={e => { setMarketSourceFilter(e.target.value); setMarketPage(1); }}><option value="all">{t("install.filters.allSources")}</option>{sourceOptions.map(source => <option key={source} value={source}>@{source}</option>)}</select></label>
                {hasMarketQuery && <span className={styles.help}>正在显示搜索结果，清空搜索可返回榜单。</span>}
              </div>
              <Disclosure title={targetProject ? `安装后同时链接到：${projects.find(p => p.id === targetProject)?.name || "所选项目"}` : "安装到全局技能库 · 更改目标"}>
                <div className={styles.destination}><label htmlFor="market-destination">安装后</label><select disabled={installing !== null || addingToProject !== null} id="market-destination" aria-label="市场安装目标" className="app-input" value={targetProject} onChange={e => setTargetProject(e.target.value)}><option value="">仅加入全局技能库</option>{projects.filter(p => p.workspace_type === "project").map(p => <option key={p.id} value={p.id}>同时链接到 {p.name} · Codex</option>)}</select><span>原文件在技能库统一维护</span></div>
              </Disclosure>
            </div>
          </div>

          {marketError ? (
            <div className="mb-4">
              <StatusBanner
                compact
                title={t("common.requestFailed")}
                description={marketError}
                actionLabel={t("common.retry")}
                onAction={() => setMarketReloadKey((value) => value + 1)}
                tone="danger"
              />
            </div>
          ) : null}

          {marketLoading && !marketLoadingMore ? (
            <LoadingState label="正在加载市场技能…" />
          ) : (
            <div className="pb-8">
              <div ref={marketListRef} className="scroll-mt-4" />

              {filteredMarketSkills.length === 0 ? (
                <div className="app-panel flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted">
                    <Search className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[14px] font-semibold text-secondary">
                    {t("install.noResults.title")}
                  </h3>
                  <p className="mt-1 max-w-md text-[13px] text-muted">
                    {t("install.noResults.description")}
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.cards}>
                    {paginatedMarketSkills.map((skill) => {
                      const displayName = skill.name || skill.skill_id;
                      const showSkillId = skill.skill_id.trim() !== displayName.trim();
                      const owner = skill.source.split("/")[0];
                      const avatarUrl = `https://github.com/${owner}.png?size=32`;
                      const sourceRef = `${skill.source}/${skill.skill_id}`;
                      const isInstalled = installedSourceRefs.has(sourceRef);

                      return (
                      <div
                        key={skill.id}
                        className={styles.card}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <img
                              src={avatarUrl}
                              alt={owner}
                              className="h-6 w-6 shrink-0 rounded-full border border-border-subtle"
                              loading="lazy"
                            />
                            <div className="min-w-0">
                              <h3 className={styles.skillName}>
                                {displayName}
                              </h3>
                              {showSkillId ? (
                                <p className="truncate text-[13px] leading-4 text-muted">{skill.skill_id}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <CardActionMenu label={`更多操作：${displayName}`} actions={[{ key: "website", label: t("install.viewOnWeb"), icon: <ExternalLink size={14} />, onSelect: () => { void openUrl(`https://skills.sh/${skill.source}/${skill.skill_id}`); } }]} />
                          </div>
                        </div>

                        <div className={styles.cardActions}><MarketChinesePreview source={skill.source} skillId={skill.skill_id} />
                          {isInstalled ? (targetProject ? <Button busy={addingToProject === skill.id} disabled={addingToProject !== null} onClick={() => void addMarketSkillToProject(skill)}>链接到项目</Button> : <span className={styles.installed}><Check size={14}/>{t("install.installed")}</span>) : installing === skill.id ? <span className={styles.installed}>正在安装…</span> : <Button disabled={installing !== null} onClick={() => void handleInstallSkillssh(skill)}><Plus size={14}/>加入</Button>}
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          <span className={styles.contributor}>@{skill.source}</span>
                          {marketTab === "alltime" && skill.installs > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-[5px] border border-border-subtle bg-background px-1.5 py-0.5 text-[13px] leading-4 text-muted">
                              <DownloadCloud className="h-3 w-3" />
                              {skill.installs >= 1_000_000
                                ? `${(skill.installs / 1_000_000).toFixed(1)}M`
                                : skill.installs >= 1_000
                                  ? `${(skill.installs / 1_000).toFixed(1)}K`
                                  : skill.installs}
                            </span>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>

                  {totalMarketPages > 1 ? (
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                      <button
                        onClick={() => changeMarketPage(Math.max(1, currentMarketPage - 1))}
                        disabled={currentMarketPage === 1}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {t("install.pagination.previous")}
                      </button>

                      {visibleMarketPages.map((page, index) => {
                        const previousPage = visibleMarketPages[index - 1];
                        const showGap = previousPage && page - previousPage > 1;

                        return (
                          <div key={page} className="flex items-center gap-1.5">
                            {showGap ? <span className="px-1 text-[13px] text-faint">...</span> : null}
                            <button
                              onClick={() => changeMarketPage(page)}
                              className={cn(
                                "min-w-8 rounded-[6px] border px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
                                page === currentMarketPage
                                  ? "border-accent-border bg-accent-dark text-white"
                                  : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover"
                              )}
                            >
                              {page}
                            </button>
                          </div>
                        );
                      })}

                      <button
                        onClick={() => changeMarketPage(Math.min(totalMarketPages, currentMarketPage + 1))}
                        disabled={currentMarketPage === totalMarketPages}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        {t("install.pagination.next")}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}

                  {hasMarketQuery ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setMarketSearchLimit((value) => value + MARKET_SEARCH_STEP)}
                        disabled={!canLoadMoreSearch || marketLoading}
                        className="inline-flex items-center gap-2 rounded-[6px] border border-border-subtle bg-surface px-3.5 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {marketLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Search className="h-3.5 w-3.5" />
                        )}
                        {isLoadingMoreSearch
                          ? t("install.loadingMore")
                          : t("install.loadMoreSearch")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "local" && (
        <div className={`${styles.sourceContent} space-y-4 pb-8`}>
          <section className="app-panel overflow-hidden">
            <div className="border-b border-border-subtle px-4 py-3.5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <h2 className="text-[14px] font-semibold text-secondary">
                    {t("install.local.title")}
                  </h2>
                  <p className="mt-1 text-[13px] leading-5 text-muted">
                    {t("install.local.description")}
                  </p>

                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={localInstalling}
                    onClick={handleLocalFolderInstall}
                    variant="primary"
                  >
                    <FolderUp className="h-4 w-4" />
                    {t("install.local.selectFolder")}
                  </Button>
                </div>
              </div>
            </div>

            <div className={styles.alternatives}><Disclosure title="其他导入方式"><div className={styles.alternativeButtons}>                  <Button
                    type="button"
                    disabled={localInstalling}
                    onClick={handleLocalFileInstall}

                  >
                    <UploadCloud className="h-4 w-4" />
                    {t("install.local.selectArchive")}
                  </Button>
                  <Button
                    type="button"
                    disabled={localInstalling}
                    onClick={handleBatchImportFolder}

                  >
                    <FolderInput className="h-4 w-4" />
                    {t("install.local.batchImport")}
                  </Button>
</div>                  <label htmlFor="local-skill-path" className="mt-4 block text-[13px] text-secondary">本地技能源路径</label><div className="mt-2 flex gap-2"><input disabled={localInstalling} id="local-skill-path" aria-label="本地技能源路径" className="app-input min-w-0 flex-1" value={localSourcePath} onChange={e => setLocalSourcePath(e.target.value)} placeholder="或直接输入包含 SKILL.md 的绝对路径" /><Button  disabled={localInstalling || !localSourcePath.trim()} onClick={() => { void installLocalSource(localSourcePath.trim()); }}>{localInstalling ? "导入中…" : "导入路径"}</Button></div></Disclosure></div>
          </section>

          {localError ? (
            <StatusBanner
              compact
              title={t("common.requestFailed")}
              description={localError}
              actionLabel={t("common.retry")}
              onAction={() => { if (!localInstalling && !scanLoading) { if (localRetry.current) localRetry.current(); else void runScan(); } }}
              tone="danger"
            />
          ) : null}

          <section className="app-panel overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-3.5">
              <div>
                <h2 className="text-[13px] font-semibold text-secondary">{t("install.scan.title")}</h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  {scanResult
                    ? t("install.scan.summary", {
                        tools: scanResult.tools_scanned,
                        skills: scanResult.skills_found,
                      })
                    : t("install.scan.initial")}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={runScan}
                  disabled={scanLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-hover px-3 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", scanLoading && "animate-spin")} />
                  {t("install.scan.rescan")}
                </button>
                <button
                  onClick={handleImportAllDiscovered}
                  disabled={scanLoading || importingAll || pendingGroups.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent-border bg-accent-dark px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {importingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="h-3.5 w-3.5" />
                  )}
                  {t("install.scan.importAll")}
                </button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              {scanLoading ? (
                <LoadingState label={t("install.scan.scanning")} />
              ) : scanResult && scanGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
                    <FolderSearch className="h-5 w-5 text-muted" />
                  </div>
                  <h3 className="mb-1 text-[13px] font-semibold text-tertiary">
                    {t("install.scan.noResults")}
                  </h3>
                  <p className="text-[13px] text-muted">{t("install.scan.noResultsHint")}</p>
                </div>
              ) : (
                <>
                  <div className="app-panel-muted overflow-hidden">
                    {scanGroups.map((group) => {
                      const [primaryLocation, ...otherLocations] = group.locations;
                      const primaryPath = primaryLocation?.found_path;
                      const isImporting = !!primaryPath && importingPaths.has(primaryPath);
                      const isRenaming = group.name in renameEditing;
                      const importName = renameEditing[group.name] ?? group.name;
                      const foundDate = new Date(group.found_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      });

                      return (
                        <article key={group.name} className="border-b border-border-subtle last:border-b-0">
                          <div className="flex items-start justify-between gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex min-w-0 items-center gap-2">
                                {isRenaming ? (
                                  <input
                                    autoFocus
                                    value={renameEditing[group.name]}
                                    onChange={(e) =>
                                      setRenameEditing((prev) => ({ ...prev, [group.name]: e.target.value }))
                                    }
                                    onBlur={() => {
                                      if (!renameEditing[group.name]?.trim()) {
                                        setRenameEditing((prev) => {
                                          const next = { ...prev };
                                          delete next[group.name];
                                          return next;
                                        });
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        setRenameEditing((prev) => {
                                          const next = { ...prev };
                                          delete next[group.name];
                                          return next;
                                        });
                                      } else if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    className="min-w-0 max-w-[220px] rounded border border-accent-border bg-surface px-1.5 py-0.5 text-[13px] font-semibold text-secondary outline-none focus:ring-1 focus:ring-accent"
                                  />
                                ) : (
                                  <h3 className="truncate text-[13px] font-semibold text-secondary">
                                    {group.name}
                                  </h3>
                                )}
                                {!group.imported && !isRenaming ? (
                                  <button
                                    onClick={() =>
                                      setRenameEditing((prev) => ({ ...prev, [group.name]: group.name }))
                                    }
                                    className="shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
                                    title={t("install.scan.rename")}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                ) : null}
                                {group.imported ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[13px] font-semibold text-emerald-400">
                                    <Check className="h-3 w-3" />
                                    {t("install.scan.imported")}
                                  </span>
                                ) : null}
                                <span className="shrink-0 rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[13px] text-muted">
                                  {t("install.scan.locations", { count: group.locations.length })}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted">
                                  <Calendar className="h-3 w-3" />
                                  {foundDate}
                                </span>
                              </div>

                              {primaryLocation ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="inline-flex shrink-0 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-px text-[13px] font-medium text-tertiary">
                                    {primaryLocation.tool}
                                  </span>
                                  <code className="block min-w-0 truncate text-[13px] text-tertiary">
                                    {primaryLocation.found_path}
                                  </code>
                                </div>
                              ) : null}
                            </div>

                            <div className="flex shrink-0 items-start justify-end">
                              {group.imported ? null : (
                                <button
                                  onClick={() => primaryPath && handleImportDiscovered(primaryPath, importName)}
                                  disabled={!primaryPath || isImporting}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-accent-border bg-accent-dark px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
                                >
                                  {isImporting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <DownloadCloud className="h-3 w-3" />
                                  )}
                                  {t("install.scan.importOne")}
                                </button>
                              )}
                            </div>
                          </div>

                          {otherLocations.length > 0 ? (
                            <div className="border-t border-border-subtle bg-surface/40 px-3 py-1.5">
                              <div className="space-y-1">
                                {otherLocations.map((location) => (
                                  <div key={location.id} className="flex min-w-0 items-center gap-2">
                                    <span className="inline-flex shrink-0 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-px text-[13px] font-medium text-tertiary">
                                      {location.tool}
                                    </span>
                                    <code className="block min-w-0 truncate text-[13px] text-muted">
                                      {location.found_path}
                                    </code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "git" && (
        <div className={styles.sourceContent}>
          <div className={`app-panel p-5 ${styles.gitForm}`}>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover">
              <Github className="h-5 w-5 text-tertiary" />
            </div>
            <h2 className="mb-1 text-[14px] font-semibold text-primary">{t("install.gitTitle")}</h2>
            <p className="mb-4 text-[13px] text-muted">{t("install.gitDesc")}</p>

            <div className="space-y-3">
              <div>
                <label htmlFor="git-repository-url" className="mb-1 block text-[13px] font-medium text-tertiary">
                  {t("install.repoUrl")}
                </label>
                <input
                  type="text"
                  id="git-repository-url"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !gitLoading && gitUrl.trim()) handleGitPreview(); }}
                  placeholder={t("install.repoUrlPlaceholder")}
                  disabled={gitLoading}
                  className="app-input w-full bg-background"
                />
              </div>
              {gitError && <div role="alert"><StatusBanner compact tone="danger" title="Git 预览失败" description={gitError} actionLabel="重试预览" onAction={handleGitPreview} /></div>}
              {gitUrl.trim() && findInstalledByGitUrl(gitUrl) && (
                <div role="status" className={styles.notice}>
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t("install.gitAlreadyInstalled", { name: findInstalledByGitUrl(gitUrl)!.name })}
                  </span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {gitLoading ? (
                  <Button variant="danger"
                    onClick={() => gitCancelKey && handleCancelInstall(gitCancelKey)}

                    disabled={!gitCancelKey}
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("install.cancel")}
                  </Button>
                ) : (
                  <Button
                    onClick={handleGitPreview}
                    disabled={!gitUrl.trim()}
                    className="w-full"
                    variant={findInstalledByGitUrl(gitUrl) ? "secondary" : "primary"}
                  >
                    <DownloadCloud className="h-3.5 w-3.5" />
                    {gitUrl.trim() && findInstalledByGitUrl(gitUrl)
                      ? t("install.gitReinstall")
                      : t("install.installClone")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Git preview / selection dialog */}
      {gitPreview && (
        <DetailSheet open closeDisabled={gitConfirmLoading} size="compact" title={t("install.gitPreview.title")} description={t("install.gitPreview.description")} onClose={() => { if (!gitConfirmLoading) handleGitPreviewClose(); }}>
          <div className={styles.gitPreview}>
            {/* Select all / deselect all */}
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setGitSelections((prev) => prev.map((s) => ({ ...s, selected: true })))}
                disabled={gitConfirmLoading}
                className="text-[13px] text-accent-light hover:underline"
              >
                {t("install.gitPreview.selectAll")}
              </button>
              <span className="text-faint">·</span>
              <button
                type="button"
                onClick={() => setGitSelections((prev) => prev.map((s) => ({ ...s, selected: false })))}
                disabled={gitConfirmLoading}
                className="text-[13px] text-muted hover:underline"
              >
                {t("install.gitPreview.deselectAll")}
              </button>
            </div>

            {gitSelections.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">{t("install.gitPreview.empty")}</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-hide pr-1">
                {gitSelections.map((item, idx) => (
                  <div
                    key={item.rel_path}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                      item.selected
                        ? "border-accent-border bg-accent-bg/40"
                        : "border-border-subtle bg-background opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`选择 ${item.name}`}
                      checked={item.selected}
                      disabled={gitConfirmLoading}
                      onChange={(e) =>
                        setGitSelections((prev) =>
                          prev.map((s, i) => i === idx ? { ...s, selected: e.target.checked } : s)
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        aria-label="技能名称"
                        value={item.name}
                        onChange={(e) =>
                          setGitSelections((prev) =>
                            prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s)
                          )
                        }
                        disabled={!item.selected || gitConfirmLoading}
                        placeholder={t("install.gitPreview.namePlaceholder")}
                        className="app-input w-full bg-background py-1 text-[13px]"
                      />
                      {item.description ? (
                        <p className="mt-1 truncate text-[12px] text-muted">{item.description}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                onClick={handleGitPreviewClose}
                disabled={gitConfirmLoading}

              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" busy={gitConfirmLoading}
                type="button"
                onClick={handleGitConfirm}
                disabled={gitConfirmLoading || gitSelections.every((s) => !s.selected)}

              >
                {!gitConfirmLoading && (
                  <DownloadCloud className="h-3.5 w-3.5" />
                )}
                {t("install.gitPreview.confirm")}
              </Button>
            </div>
          </div>
        </DetailSheet>
      )}
    </div>
  );
}
