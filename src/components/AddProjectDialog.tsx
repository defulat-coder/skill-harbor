import { getErrorMessage } from "../lib/error";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState } from "react";
import { FolderOpen, Search, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { cn } from "../utils";
import * as api from "../lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => Promise<void>;
}

export function AddProjectDialog({ open, onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"manual" | "scan" | "linked">("manual");
  const [scanRoot, setScanRoot] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [linkedName, setLinkedName] = useState("");
  const [linkedPath, setLinkedPath] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setError("");
      setTab("manual");
      setScanRoot("");
      setScanning(false);
      setScanResults([]);
      setSelected(new Set());
      setAdding(false);
      setScanned(false);
      setLinkedName("");
      setLinkedPath("");
    }
  }


  const handleSelectFolder = async () => {
    if (adding) return;
    setError("");
    setAdding(true);
    try {
      const dir = await dialogOpen({ directory: true, multiple: false });
      if (!dir) return;
      await api.addProject(dir);
      await onAdded();
      onClose();
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
    } finally {
      setAdding(false);
    }
  };

  const handleScan = async () => {
    if (!scanRoot.trim() || scanning || adding) return;
    setError("");
    setScanning(true);
    setScanned(false);
    setScanResults([]);
    setSelected(new Set());
    try {
      const results = await api.scanProjects(scanRoot.trim());
      setScanResults(results);
      setSelected(new Set(results));
      setScanned(true);
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
    } finally {
      setScanning(false);
    }
  };

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selected.size === 0 || adding) return;
    setError("");
    setAdding(true);
    try {
      const failed: string[] = [];
      for (const path of selected) {
        try {
          await api.addProject(path);
        } catch {
          failed.push(path);
        }
      }
      await onAdded();
      if (failed.length) {
        setSelected(new Set(failed));
        setError(`已处理所选项目，${failed.length} 个目录未能添加。请检查目录或是否已经存在，再重试。`);
      } else onClose();
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
    } finally {
      setAdding(false);
    }
  };

  const handleSelectBrowse = async () => {
    try {
      const dir = await dialogOpen({ directory: true, multiple: false });
      if (dir) setScanRoot(dir);
    } catch (error) { setError(getErrorMessage(error, t("common.error"))); }
  };

  const handleAddLinkedWorkspace = async () => {
    if (!linkedName.trim() || !linkedPath.trim() || adding) return;
    setError("");
    setAdding(true);
    try {
      await api.addLinkedWorkspace(linkedName.trim(), linkedPath.trim());
      await onAdded();
      onClose();
    } catch (error) {
      setError(getErrorMessage(error, t("common.error")));
    } finally {
      setAdding(false);
    }
  };

  return (
    <DetailSheet open={open} size="compact" title={t("project.addProjectTitle")} closeDisabled={adding || scanning} onClose={onClose}>
        {error && <p role="alert" className="wb-error mb-4">{error}</p>}
        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-0.5 bg-background rounded-lg border border-border-subtle">
          {(["manual", "scan", "linked"] as const).map((key) => (
            <button
              key={key}
              disabled={adding || scanning}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all",
                tab === key
                  ? "bg-surface text-primary shadow-xs"
                  : "text-muted hover:text-secondary"
              )}
            >
              {t(
                key === "manual"
                  ? "project.tabManual"
                  : key === "scan"
                    ? "project.tabScan"
                    : "project.tabLinked"
              )}
            </button>
          ))}
        </div>

        {tab === "manual" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-tertiary">
              {t("project.addManual")}
            </p>
            <Button
              onClick={handleSelectFolder}
              busy={adding}
            >
              <FolderOpen className="w-4 h-4 text-muted" />
              {adding ? t("common.loading") : t("project.addManual")}
            </Button>
          </div>
        ) : tab === "scan" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                disabled={scanning || adding}
                aria-label={t("project.scanDir")}
                value={scanRoot}
                onChange={(e) => setScanRoot(e.target.value)}
                placeholder={t("project.scanDirPlaceholder")}
                className="app-input flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
              />
              <Button
                onClick={handleSelectBrowse}
                disabled={scanning || adding}
                iconOnly aria-label={t("project.scanDir")} title={t("project.scanDir")}
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
              <Button variant="primary"
                aria-label={t("project.tabScan")}
                onClick={handleScan}
                busy={scanning}
                disabled={!scanRoot.trim() || adding}
              >
                {scanning ? (
                  t("project.scanning")
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>

            {scanned && scanResults.length === 0 && (
              <p className="text-[13px] text-muted py-4 text-center">
                {t("project.scanNoResult")}
              </p>
            )}

            {scanResults.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-tertiary">
                    {t("project.scanResult", { count: scanResults.length })}
                  </span>
                  <Button
                    onClick={() =>
                      setSelected((prev) =>
                        prev.size === scanResults.length
                          ? new Set()
                          : new Set(scanResults)
                      )
                    }
                  >
                    {selected.size === scanResults.length
                      ? t("project.deselectAll")
                      : t("project.selectAll")}
                  </Button>
                </div>
                <div className="max-h-[240px] overflow-y-auto space-y-1">
                  {scanResults.map((path) => (
                    <button
                      key={path}
                      disabled={adding}
                      aria-pressed={selected.has(path)}
                      onClick={() => toggleSelect(path)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-[13px] transition-all",
                        selected.has(path)
                          ? "bg-accent-bg/50 text-primary border border-accent-border/30"
                          : "bg-background text-tertiary border border-border-subtle hover:border-border"
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded-sm border flex items-center justify-center shrink-0",
                          selected.has(path)
                            ? "bg-accent-dark border-accent-border text-[var(--ds-on-accent)]"
                            : "border-border-subtle"
                        )}
                      >
                        {selected.has(path) && <Check className="w-3 h-3" />}
                      </div>
                      <span className="truncate">{path}</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end pt-1">
                  <Button variant="primary"
                    onClick={handleAddSelected}
                    busy={adding}
                    disabled={selected.size === 0}
                  >
                    {adding
                      ? t("common.loading")
                      : t("project.addSelected", { count: selected.size })}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-tertiary">
              {t("project.addLinkedHint")}
            </p>
            <input
              type="text"
              aria-label={t("project.linkedNamePlaceholder")}
              value={linkedName}
              onChange={(e) => setLinkedName(e.target.value)}
              placeholder={t("project.linkedNamePlaceholder")}
              className="app-input w-full"
            />
            <div className="flex gap-2">
              <input
                type="text"
                aria-label={t("project.linkedPathPlaceholder")}
                value={linkedPath}
                onChange={(e) => setLinkedPath(e.target.value)}
                placeholder={t("project.linkedPathPlaceholder")}
                className="app-input flex-1"
              />
              <Button
                onClick={async () => {
                  try {
                    const dir = await dialogOpen({ directory: true, multiple: false });
                    if (dir) setLinkedPath(dir);
                  } catch (error) { setError(getErrorMessage(error, t("common.error"))); }
                }}
                iconOnly aria-label={t("project.selectSkillsDir")} title={t("project.selectSkillsDir")}
              >
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[12px] leading-5 text-muted">
              {t("project.linkedDisabledPathHint")}
            </p>
            <Button
              onClick={handleAddLinkedWorkspace}
              busy={adding}
              disabled={!linkedName.trim() || !linkedPath.trim()}
            >
              <FolderOpen className="w-4 h-4 text-muted" />
              {adding ? t("common.loading") : t("project.addLinkedWorkspace")}
            </Button>
          </div>
        )}
    </DetailSheet>
  );
}
