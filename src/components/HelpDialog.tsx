import { DetailSheet } from "./DetailSheet";
import {
  BookOpen,
  FolderTree,
  Globe,
  Layers3,
  Map,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../hooks/useApp";

const GUIDE_ICONS = [Map, Layers3, BookOpen, Sparkles, Globe, FolderTree, RefreshCw, Settings2];

export function HelpDialog() {
  const { t } = useTranslation();
  const { helpOpen, closeHelp } = useApp();

  return (
    <DetailSheet
      open={helpOpen}
      title={t("help.title")}
      description={t("help.description")}
      onClose={closeHelp}
    >
      <div className="space-y-3">
        {" "}
        {(
          [
            "workflows",
            "presets",
            "install",
            "sync",
            "global",
            "projects",
            "backup",
            "settings",
          ] as const
        ).map((key, index) => {
          const Icon = GUIDE_ICONS[index];
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-secondary">
                  {t(`help.items.${key}.title`)}
                </h3>
                <p className="mt-1 text-[13px] leading-5 text-muted">
                  {t(`help.items.${key}.description`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </DetailSheet>
  );
}
