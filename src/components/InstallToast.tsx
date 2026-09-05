import styles from "./InstallToast.module.css";
import { Check, GitBranch, Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export type InstallPhase = "cloning" | "installing" | "syncing" | "done";

interface InstallToastProps {
  skillName: string;
  phase: InstallPhase;
}

const phaseConfig: Record<
  InstallPhase,
  { icon: typeof Loader2; i18nKey: string; spinning: boolean }
> = {
  cloning: { icon: GitBranch, i18nKey: "install.toast.cloning", spinning: true },
  installing: { icon: Download, i18nKey: "install.toast.installing", spinning: true },
  syncing: { icon: Loader2, i18nKey: "install.toast.syncing", spinning: true },
  done: { icon: Check, i18nKey: "install.toast.done", spinning: false },
};

export function InstallToast({ skillName, phase }: InstallToastProps) {
  const { t } = useTranslation();
  const config = phaseConfig[phase];
  const Icon = config.icon;

  return (
    <div className={styles.toast} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.icon} aria-hidden>
        {config.spinning ? (
          <Loader2 className={styles.spinner} />
        ) : (
          <Icon className={styles.complete} />
        )}
      </div>
      <span className={styles.text}>
        {t(config.i18nKey, { name: skillName })}
      </span>
    </div>
  );
}
