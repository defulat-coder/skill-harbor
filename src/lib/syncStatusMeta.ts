import type { ProjectSkill } from "./tauri";

export type SyncStatus = ProjectSkill["sync_status"];

export interface SyncStatusMeta {
  label: string;
  className: string;
}

/* Shared sync-status pill colors on the semantic token pairs; pages supply
   their own i18n labels (the two consumers use different key namespaces). */
const SYNC_STATUS_CLASSNAMES: Record<SyncStatus, string> = {
  in_sync: "bg-[var(--ds-success-bg)] text-[var(--ds-success)]",
  project_newer: "bg-[var(--ds-warning-bg)] text-[var(--ds-warning)]",
  center_newer: "bg-[var(--ds-info-bg)] text-[var(--ds-info)]",
  diverged: "bg-[var(--ds-danger-bg)] text-[var(--ds-danger)]",
  project_only: "bg-surface-hover text-muted",
};

export function getSyncStatusClassName(status: SyncStatus): string {
  return SYNC_STATUS_CLASSNAMES[status];
}

export function getSyncStatusMeta(label: string, status: SyncStatus): SyncStatusMeta {
  return { label, className: getSyncStatusClassName(status) };
}
