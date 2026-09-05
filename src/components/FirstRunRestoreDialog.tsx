import { LoadingState } from "./ui/LoadingState";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../hooks/useApp";
import { mapGitErrorMessage } from "../lib/gitErrors";
import { queryKeys } from "../lib/queryKeys";
import * as api from "../lib/tauri";

const PROMPT_SETTING_KEY = "backup_first_run_prompt";

/**
 * First-launch wizard (backup redesign §3.5): when the library is empty and
 * no backup is connected, ask up front whether to start fresh or restore from
 * an existing backup — the restore entry must not be buried in a toolbar
 * (#193/#140). Shown once; both choices persist the dismissal.
 */
export function FirstRunRestoreDialog() {
  const { t } = useTranslation();
  const { managedSkills, loading: skillsLoading, refreshManagedSkills, refreshPresets } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One-shot probe (staleTime Infinity): only relevant while the library is
  // empty, so the query stays disabled otherwise.
  const probeQuery = useQuery({
    queryKey: queryKeys.app.firstRunRestoreProbe(),
    queryFn: async () => {
      const dismissedSetting = await api.getSettings(PROMPT_SETTING_KEY).catch(() => null);
      if (dismissedSetting) return false;
      const savedRemote = (
        await api.getSettings("git_backup_remote_url").catch(() => null)
      )?.trim();
      if (savedRemote) return false;
      const status = await api.gitBackupStatus().catch(() => null);
      if (!status || status.is_repo) return false;
      return true;
    },
    enabled: !skillsLoading && managedSkills.length === 0,
    staleTime: Infinity,
  });
  const open = !!probeQuery.data && !dismissed;

  const dismiss = async () => {
    if (busy) return;
    setDismissed(true);
    await api.setSettings(PROMPT_SETTING_KEY, "fresh").catch(() => {});
  };

  const handleRestore = async () => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Same sanitize-first flow as the Backup page: embedded credentials go
      // to the OS keychain, only the clean URL is persisted (§3.7).
      const effective = await api.gitBackupSanitizeRemoteUrl(trimmed);
      await api.setSettings("git_backup_remote_url", effective);
      await api.gitBackupClone(effective);
      await api.setSettings(PROMPT_SETTING_KEY, "restored").catch(() => {});
      // Restore pulls skills AND presets/scenarios from metadata; refresh both
      // so the sidebar preset list isn't empty until a restart (#302).
      await Promise.all([refreshManagedSkills(), refreshPresets()]);
      toast.success(t("firstRun.restoreSuccess"));
      setDismissed(true);
    } catch (err) {
      setError(mapGitErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailSheet
      open={open}
      size="compact"
      closeDisabled={busy}
      title={t("firstRun.title")}
      description={t("firstRun.subtitle")}
      onClose={() => void dismiss()}
    >
      <label htmlFor="restore-source" className="block text-[13px] mb-2">
        {t("firstRun.urlLabel")}
      </label>
      <input
        aria-describedby={error ? "restore-error" : undefined}
        id="restore-source"
        className="app-input w-full"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        placeholder={t("settings.gitRemoteUrlPlaceholder")}
        disabled={busy}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {error && (
        <p id="restore-error" role="alert" className="text-danger mt-3">
          {error}
        </p>
      )}
      {busy && <LoadingState label={t("firstRun.restoring")} />}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button onClick={dismiss} disabled={busy}>
          {t("firstRun.startFresh")}
        </Button>
        <Button variant="primary" onClick={handleRestore} busy={busy} disabled={!url.trim()}>
          {!busy && <CloudDownload size={15} />}
          {busy ? t("firstRun.restoring") : t("firstRun.restore")}
        </Button>
      </div>
      <p className="mt-4 text-[12px] text-muted">{t("firstRun.hint")}</p>
    </DetailSheet>
  );
}
