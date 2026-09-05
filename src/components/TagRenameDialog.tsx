import { getErrorMessage } from "../lib/error";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onRename: (newName: string) => Promise<void>;
}

export function TagRenameDialog({ open, currentName, onClose, onRename }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);



  const canSave = name.trim().length > 0 && name.trim() !== currentName;

  const handleRename = async () => {
    if (!canSave || pending.current) return;
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      await onRename(name.trim());
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
    <DetailSheet open={open} title={t("mySkills.tags.renameTag")} onClose={() => { if (!pending.current) { setError(""); onClose(); } }} size="compact" closeDisabled={loading}>
      {error && <p role="alert" className="text-danger mb-3">{error}</p>}
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0">
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1">
              {t("mySkills.tags.tagName")}
            </label>
            <input
              type="text"
              aria-label={t("mySkills.tags.tagName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleRename(); }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              onClick={() => { if (!pending.current) { setError(""); onClose(); } }}
              variant="ghost" disabled={loading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleRename}
              disabled={!canSave || loading}
              variant="primary" busy={loading}
            >
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </div>
      </fieldset>
    </DetailSheet>
  );
}
