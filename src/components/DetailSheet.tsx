import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/Button";
import styles from "./DetailSheet.module.css";

interface DetailSheetProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "compact";
  closeDisabled?: boolean;
}
const easing = 'cubic-bezier(0.23,1,0.32,1)';
export function DetailSheet({ open, title, description, meta, onClose, children, size = "default", closeDisabled = false }: DetailSheetProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRequested = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    let cancelled = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      closeRequested.current = false;
      if (!dialog.open) {
        dialog.showModal();
        if (!reduced) dialog.animate([{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 200, easing });
      }
    } else if (dialog.open) {
      if (reduced) dialog.close();
      else void dialog.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.98)' }], { duration: 140, easing }).finished.then(() => { if (!cancelled) dialog.close(); }).catch(() => {});
    }
    return () => { cancelled = true; dialog.getAnimations().forEach(animation => animation.cancel()); };
  }, [open]);
  // Callers keep controlled dialogs mounted so all close paths share the exit.
  // Conditional callers still get an exit when using the close button or Escape.
  async function dismiss() {
    if (closeDisabled || closeRequested.current) return;
    closeRequested.current = true;
    const dialog = ref.current;
    if (dialog && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try { await dialog.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.98)' }], { duration: 140, easing }).finished; } catch { closeRequested.current = false; return; }
    }
    dialog?.close();
    closeRequested.current = false;
    onClose();
  }
  return createPortal(<dialog ref={ref} data-workbench-dialog className={`${styles.dialog} ${size === 'compact' ? styles.compact : ''}`} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); void dismiss(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) void dismiss(); } }}>
    <header className={styles.header}><Button variant="ghost" iconOnly disabled={closeDisabled} onClick={() => void dismiss()} className={styles.close} aria-label={t("common.close")}><X size={18} /></Button><h2 id={titleId}>{title}</h2>{description && <div className={styles.description}>{description}</div>}{meta}</header>
    <div className={styles.body}>{children}</div>
  </dialog>, document.body);
}
