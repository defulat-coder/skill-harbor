import { getErrorMessage } from "../lib/error";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PresetIconPicker } from "./PresetIconPicker";
import { PRESET_ICON_OPTIONS } from "../lib/presetIcons";

interface Props {
  open: boolean;
  currentName: string;
  currentIcon?: string | null;
  onClose: () => void;
  onRename: (newName: string, icon?: string) => Promise<void>;
}

export function RenamePresetDialog({ open, currentName, currentIcon, onClose, onRename }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [icon, setIcon] = useState(currentIcon || PRESET_ICON_OPTIONS[0].key);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  const [prevProps, setPrevProps] = useState({ open, currentName, currentIcon });
  if (
    prevProps.open !== open ||
    prevProps.currentName !== currentName ||
    prevProps.currentIcon !== currentIcon
  ) {
    setPrevProps({ open, currentName, currentIcon });
    if (open) {
      setName(currentName);
      setIcon(currentIcon || PRESET_ICON_OPTIONS[0].key);
    }
  }

  const handleRename = async () => {
    if (
      pending.current ||
      !name.trim() ||
      (name.trim() === currentName && icon === (currentIcon || PRESET_ICON_OPTIONS[0].key))
    ) {
      return;
    }
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      await onRename(name.trim(), icon);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, t("common.error")));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const inputClass = "app-input w-full";

  return (
    <DetailSheet
      open={open}
      title={t("common.rename")}
      onClose={() => {
        if (!pending.current) {
          setError("");
          onClose();
        }
      }}
      size="compact"
      closeDisabled={loading}
    >
      {error && (
        <p role="alert" className="text-danger mb-3">
          {error}
        </p>
      )}
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0">
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1">
              {t("preset.name")}
            </label>
            <input
              type="text"
              aria-label={t("preset.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("preset.namePlaceholder")}
              className={inputClass}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleRename();
              }}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1.5">
              {t("preset.icon")}
            </label>
            <PresetIconPicker value={icon} onChange={setIcon} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              onClick={() => {
                if (!pending.current) {
                  setError("");
                  onClose();
                }
              }}
              variant="ghost"
              disabled={loading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleRename}
              disabled={
                !name.trim() ||
                (name.trim() === currentName &&
                  icon === (currentIcon || PRESET_ICON_OPTIONS[0].key)) ||
                loading
              }
              variant="primary"
              busy={loading}
            >
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>
      </fieldset>
    </DetailSheet>
  );
}
