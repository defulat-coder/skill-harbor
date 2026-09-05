import { getErrorMessage } from "../lib/error";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PresetIconPicker } from "./PresetIconPicker";
import { PRESET_ICON_OPTIONS } from "../lib/presetIcons";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string, icon?: string) => Promise<void>;
}

export function CreatePresetDialog({ open, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(PRESET_ICON_OPTIONS[0].key);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);



  const handleCreate = async () => {
    if (!name.trim() || pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      await onCreate(name.trim(), description.trim() || undefined, icon);
      setName("");
      setDescription("");
      setIcon(PRESET_ICON_OPTIONS[0].key);
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, t("common.error")));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-background border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-secondary focus:outline-none focus:border-border transition-all placeholder-faint";

  return (
    <DetailSheet open={open} title={t("preset.create")} onClose={() => { if (!pending.current) { setError(""); onClose(); } }} size="compact" closeDisabled={loading}>
      {error && <p role="alert" className="text-danger mb-3">{error}</p>}
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0">
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1">{t("preset.name")}</label>
            <input
              type="text"
              aria-label={t("preset.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("preset.namePlaceholder")}
              className={inputClass}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleCreate(); }}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1">{t("preset.description")}</label>
            <input
              type="text"
              aria-label={t("preset.description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("preset.descPlaceholder")}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1.5">{t("preset.icon")}</label>
            <PresetIconPicker value={icon} onChange={setIcon} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              onClick={() => { if (!pending.current) { setError(""); onClose(); } }}
              variant="ghost" disabled={loading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || loading}
              variant="primary" busy={loading}
            >
              {loading ? t("common.loading") : t("common.create")}
            </Button>
          </div>
        </div>
      </fieldset>
    </DetailSheet>
  );
}
