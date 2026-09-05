import styles from "./SkillSourceDiffViewer.module.css";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { DocumentDiffViewer } from "./DocumentDiffViewer";
import type { SkillSourceDiffEntry } from "../lib/tauri";

interface Props {
  entries: SkillSourceDiffEntry[];
  className?: string;
}

const STATUS_TONE: Record<SkillSourceDiffEntry["status"], string> = {
  added:
    "border-[color-mix(in_srgb,var(--ds-success)_40%,transparent)] bg-[var(--ds-success-bg)] text-[color-mix(in_srgb,var(--ds-success)_55%,var(--ds-strong))]",
  removed:
    "border-[color-mix(in_srgb,var(--ds-danger)_40%,transparent)] bg-[var(--ds-danger-bg)] text-[var(--ds-danger)]",
  modified:
    "border-[color-mix(in_srgb,var(--ds-info)_40%,transparent)] bg-[var(--ds-info-bg)] text-[color-mix(in_srgb,var(--ds-info)_65%,var(--ds-strong))]",
};

export function SkillSourceDiffViewer({ entries, className }: Props) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border-subtle bg-bg-secondary px-4 py-6 text-center",
          className,
        )}
      >
        <div className="text-[13px] font-medium text-secondary">
          {t("mySkills.sourceDiff.noChanges")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {entries.map((entry) => (
        <div key={entry.relative_path} className={styles.file}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3 py-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[entry.status],
              )}
            >
              {t(`mySkills.sourceDiff.status.${entry.status}`)}
            </span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-secondary"
              title={entry.relative_path}
            >
              {entry.relative_path}
            </span>
            {entry.status === "modified" && entry.executable_before !== entry.executable_after && (
              <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 text-[11px] text-muted">
                {t("mySkills.sourceDiff.execBit", {
                  before: entry.executable_before ? "0755" : "0644",
                  after: entry.executable_after ? "0755" : "0644",
                })}
              </span>
            )}
          </div>

          {entry.content_kind === "text" ? (
            <DocumentDiffViewer
              original={entry.original_text ?? ""}
              updated={entry.updated_text ?? ""}
              className="!space-y-0 !rounded-none !border-0"
            />
          ) : (
            <div className="px-4 py-4 text-[12.5px] text-muted">
              {t(`mySkills.sourceDiff.summary.${entry.content_kind}`)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
