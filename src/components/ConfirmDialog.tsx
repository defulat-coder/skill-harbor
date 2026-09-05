import { useState } from "react";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  tone?: "danger" | "warning";
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel,
  tone = "danger",
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DetailSheet
      open={open}
      size="compact"
      title={title || t("common.confirm")}
      description={message}
      onClose={() => {
        setError("");
        onClose();
      }}
      closeDisabled={loading}
    >
      {error && (
        <p role="alert" className="text-danger mb-4">
          {error}
        </p>
      )}
      {details && details.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {details.map((detail) => (
            <span key={detail} className="ds-tag">
              {detail}
            </span>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            setError("");
            onClose();
          }}
          disabled={loading}
        >
          {t("common.cancel")}
        </Button>
        <Button
          variant={tone === "warning" ? "danger-ghost" : "danger"}
          onClick={handleConfirm}
          busy={loading}
        >
          {loading
            ? t("common.loading")
            : confirmLabel || (tone === "warning" ? t("common.confirm") : t("common.delete"))}
        </Button>
      </div>
    </DetailSheet>
  );
}
