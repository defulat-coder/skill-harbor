import { LoadingState } from "./ui/LoadingState";
import { mapGitErrorMessage } from "../lib/gitErrors";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState } from "react";
import { Cloud, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";

interface Props {
  open: boolean;
  hasRemote: boolean;
  onClose: () => void;
  onClone: () => Promise<void>;
  onInit: () => Promise<void>;
}

type Choice = "clone" | "init";

export function GitSetupDialog({ open, hasRemote, onClose, onClone, onInit }: Props) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<Choice>("clone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const handleConfirm = async () => {
    if (!hasRemote || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (choice === "clone") {
        await onClone();
      } else {
        await onInit();
      }
      onClose();
    } catch (err) {
      setError(mapGitErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DetailSheet open={open} size="compact" title={t("settings.gitSetupTitle")} description={t("settings.gitSetupSubtitle")} closeDisabled={loading} onClose={onClose}>
        {loading && <LoadingState label={t("common.loading")} />}
        {error && <p role="alert" className="text-danger mb-4">{error}</p>}
        {!hasRemote && (
          <div className="mb-4 rounded-md border border-[color-mix(in_srgb,var(--ds-warning)_40%,transparent)] bg-[var(--ds-warning-bg)] px-3 py-2 text-[12px] text-[color-mix(in_srgb,var(--ds-warning)_55%,var(--ds-strong))]">
            {t("settings.gitSetupNeedRemote")}
          </div>
        )}

        <div className="space-y-2">
          <ChoiceCard
            icon={<Cloud className="h-4 w-4" />}
            active={choice === "clone"}
            disabled={!hasRemote || loading}
            badge={t("settings.gitSetupCardCloneBadge")}
            title={t("settings.gitSetupCardCloneTitle")}
            description={t("settings.gitSetupCardCloneDesc")}
            onClick={() => setChoice("clone")}
          />
          <ChoiceCard
            icon={<Upload className="h-4 w-4" />}
            active={choice === "init"}
            disabled={!hasRemote || loading}
            badge={t("settings.gitSetupCardInitBadge")}
            title={t("settings.gitSetupCardInitTitle")}
            description={t("settings.gitSetupCardInitDesc")}
            onClick={() => setChoice("init")}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            onClick={() => !loading && onClose()}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button variant="primary"
            onClick={handleConfirm}
            busy={loading}
            disabled={!hasRemote}
          >
            {loading ? t("common.loading") : t("settings.gitSetupConfirm")}
          </Button>
        </div>
    </DetailSheet>
  );
}

interface CardProps {
  icon: React.ReactNode;
  active: boolean;
  disabled: boolean;
  badge: string;
  title: string;
  description: string;
  onClick: () => void;
}

function ChoiceCard({ icon, active, disabled, badge, title, description, onClick }: CardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-md border px-3 py-3 transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-accent bg-accent-bg"
          : "border-border-subtle bg-bg-secondary hover:bg-surface-hover"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full p-1", active ? "bg-accent/20 text-accent-light" : "bg-surface text-muted")}>{icon}</span>
        <span className="text-[13px] font-semibold text-primary">{title}</span>
        <span className="ml-auto rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[11px] text-muted">
          {badge}
        </span>
      </div>
      <p className="mt-1.5 pl-7 text-[12px] text-tertiary leading-relaxed">{description}</p>
    </button>
  );
}
