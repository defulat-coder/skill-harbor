import { LoadingState } from "./ui/LoadingState";
import { mapGitErrorMessage } from "../lib/gitErrors";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState } from "react";
import { RotateCcw, GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import type { GitUpstreamHealth } from "../lib/tauri";

type RecoveryReason = GitUpstreamHealth | "conflict";

interface Props {
  open: boolean;
  reason: RecoveryReason;
  onClose: () => void;
  onReclone: () => Promise<void>;
}

export function GitRecoveryDialog({ open, reason, onClose, onReclone }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<"reclone" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A conflict is already aborted by the backend; re-cloning is the only safe
  // in-app fix, so we hide the "keep local" path for it.
  const isConflict = reason === "conflict";
  const subtitleKey =
    reason === "conflict"
      ? "settings.gitRecoverySubtitleConflict"
      : reason === "unrelated_histories"
        ? "settings.gitRecoverySubtitleUnrelated"
        : reason === "no_upstream"
          ? "settings.gitRecoverySubtitleNoUpstream"
          : "settings.gitRecoverySubtitleDetached";

  const handleReclone = async () => {
    if (loading) return;
    setLoading("reclone");
    setError(null);
    try {
      await onReclone();
      onClose();
    } catch (err) {
      setError(mapGitErrorMessage(err, t));
    } finally {
      setLoading(null);
    }
  };

  return (
    <DetailSheet
      open={open}
      size="compact"
      title={t("settings.gitRecoveryTitle")}
      description={t(subtitleKey)}
      closeDisabled={!!loading}
      onClose={onClose}
    >
      {loading && <LoadingState label={t("common.loading")} />}
      {error && (
        <p role="alert" className="text-danger mb-4">
          {error}
        </p>
      )}
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleReclone}
          disabled={!!loading}
          className={cn(
            "w-full text-left rounded-md border border-accent bg-accent-bg px-3 py-3 transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-60 hover:bg-accent-bg/80",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent/20 p-1 text-accent-light">
              <RotateCcw className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-semibold text-primary">
              {loading === "reclone"
                ? t("settings.gitRecoveryRecloning")
                : t("settings.gitRecoveryCardRecloneTitle")}
            </span>
          </div>
          <p className="mt-1.5 pl-7 text-[12px] text-tertiary leading-relaxed">
            {t("settings.gitRecoveryCardRecloneDesc")}
          </p>
        </button>

        {!isConflict && (
          <button
            type="button"
            onClick={() => toast.info(t("settings.gitRecoveryFallbackHint"))}
            disabled={!!loading}
            className="w-full text-left rounded-md border border-border-subtle bg-bg-secondary px-3 py-3 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-surface p-1 text-muted">
                <GitBranch className="h-4 w-4" />
              </span>
              <span className="text-[13px] font-semibold text-primary">
                {t("settings.gitRecoveryCardKeepLocalTitle")}
              </span>
            </div>
            <p className="mt-1.5 pl-7 text-[12px] text-tertiary leading-relaxed">
              {t("settings.gitRecoveryCardKeepLocalDesc")}
            </p>
          </button>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => !loading && onClose()} disabled={!!loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </DetailSheet>
  );
}
