import { useState } from "react";
import { DetailSheet } from "./DetailSheet";
import { Button } from "./ui/Button";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onCancel: () => void;
  onClose: (remember: boolean) => void;
  onHide: (remember: boolean) => void;
}

export function CloseActionDialog({ open, onCancel, onClose, onHide }: Props) {
  const { t } = useTranslation();
  const [remember, setRemember] = useState(false);

  const handleCancel = () => {
    setRemember(false);
    onCancel();
  };

  const handleClose = () => {
    onClose(remember);
    setRemember(false);
  };

  const handleHide = () => {
    onHide(remember);
    setRemember(false);
  };


  return <DetailSheet open={open} size="compact" title={t("closeAction.title")} description={t("closeAction.message")} onClose={handleCancel}>
    <label className="flex items-center gap-2 mb-5"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>{t("closeAction.remember")}</span></label>
    <div className="flex justify-end gap-2"><Button onClick={handleClose}>{t("closeAction.close")}</Button><Button variant="primary" onClick={handleHide}>{t("closeAction.hide")}</Button></div>
  </DetailSheet>;
}
