import styles from "./SkillPickerRow.module.css";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import type { ManagedSkill } from "../lib/tauri";
import type { PickerStatus } from "../lib/skillPickerStatus";
import { getTagColor } from "../lib/skillTags";

interface Props {
  skill: ManagedSkill;
  status: PickerStatus;
  allTags: string[];
  sourceLabel: string;
  selected: boolean;
  onToggle: () => void;
  busy?: boolean;
}

export function SkillPickerRow({
  skill,
  status,
  allTags,
  sourceLabel,
  selected,
  onToggle,
  busy,
}: Props) {
  const { t } = useTranslation();
  const selectable = status === "available" && !busy;

  const statusLabel: Record<PickerStatus, string> = {
    available: "",
    installed: t("addFromLibrary.status.installed"),
    conflict: t("addFromLibrary.status.conflict"),
    unavailable: t("addFromLibrary.status.unavailable"),
  };

  const tooltip =
    status === "conflict"
      ? t("addFromLibrary.tooltip.conflict")
      : status === "installed"
        ? t("addFromLibrary.tooltip.installed")
        : status === "unavailable"
          ? t("addFromLibrary.tooltip.unavailable")
          : undefined;

  return (
    <label className={cn(styles.row, !selectable && styles.unavailable)} title={tooltip}>
      <input type="checkbox" checked={selected} disabled={!selectable}
        onChange={onToggle} aria-label={`选择 ${skill.name}`} className={styles.checkbox} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-primary">{skill.name}</span>
          <span className="shrink-0 rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] font-medium text-muted">
            {sourceLabel}
          </span>
        </div>
        {skill.description && (
          <div className="mt-0.5 truncate text-[12px] text-muted">{skill.description}</div>
        )}
        {skill.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-medium",
                  getTagColor(tag, allTags),
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" />
      ) : status !== "available" ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            status === "installed" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            status === "conflict" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            status === "unavailable" && "bg-surface-hover text-muted",
          )}
        >
          {statusLabel[status]}
        </span>
      ) : null}
    </label>
  );
}
