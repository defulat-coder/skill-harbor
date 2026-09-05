import { LoadingState } from "./ui/LoadingState";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useEffect, useState } from "react";
import { CloudDownload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { mapGitErrorMessage } from "../lib/gitErrors";
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
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skillsLoading || checked) return;
    setChecked(true);
    if (managedSkills.length > 0) return;
    void (async () => {
      const dismissed = await api.getSettings(PROMPT_SETTING_KEY).catch(() => null);
      if (dismissed) return;
      const savedRemote = (await api.getSettings("git_backup_remote_url").catch(() => null))?.trim();
      if (savedRemote) return;
      const status = await api.gitBackupStatus().catch(() => null);
      if (!status || status.is_repo) return;
      setOpen(true);
    })();
  }, [skillsLoading, checked, managedSkills.length]);


  const dismiss = async () => {
    if (busy) return;
    setOpen(false);
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
      setOpen(false);
    } catch (err) {
      setError(mapGitErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return <DetailSheet open={open} size="compact" closeDisabled={busy} title={t("firstRun.title")} description={t("firstRun.subtitle")} onClose={() => void dismiss()}>
    <label htmlFor="restore-source" className="block text-[13px] mb-2">{t("firstRun.urlLabel")}</label>
    <input aria-describedby={error ? "restore-error" : undefined} id="restore-source" className="app-input w-full" value={url} onChange={e => { setUrl(e.target.value); setError(null); }} placeholder={t("settings.gitRemoteUrlPlaceholder")} disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    {error && <p id="restore-error" role="alert" className="text-danger mt-3">{error}</p>}
    {busy && <LoadingState label={t("firstRun.restoring")} />}
    <div className="mt-6 flex flex-wrap justify-end gap-2"><Button onClick={dismiss} disabled={busy}>{t("firstRun.startFresh")}</Button><Button variant="primary" onClick={handleRestore} busy={busy} disabled={!url.trim()}>{!busy && <CloudDownload size={15} />}{busy ? t("firstRun.restoring") : t("firstRun.restore")}</Button></div>
    <p className="mt-4 text-[12px] text-muted">{t("firstRun.hint")}</p>
  </DetailSheet>;
}
