import { useRef, useState } from "react";
import { AlertTriangle, OctagonAlert, RefreshCw } from "lucide-react";
import { getErrorMessage } from "../lib/error";
import { Button } from "./ui/Button";
import styles from "./StatusBanner.module.css";

interface StatusBannerProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  tone?: "warning" | "danger";
  compact?: boolean;
}

export function StatusBanner({
  title,
  description,
  actionLabel,
  onAction,
  tone = "warning",
  compact = false,
}: StatusBannerProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const Icon = tone === "danger" ? OctagonAlert : AlertTriangle;
  async function act() {
    if (!onAction || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onAction();
    } catch (failure) {
      setError(getErrorMessage(failure, "操作未完成，请重试。"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className={`${styles.banner} ${styles[tone]} ${compact ? styles.compact : ""}`}
      aria-label={title}
    >
      <Icon className={styles.icon} size={18} aria-hidden />
      <div className={styles.content}>
        <p className={styles.title}>{title}</p>
        {description && <p className={styles.description}>{description}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className={styles.description}>
            正在处理…
          </p>
        )}
      </div>
      {actionLabel && onAction && (
        <Button onClick={() => void act()} busy={busy} className={styles.action}>
          {!busy && <RefreshCw size={14} aria-hidden />}
          {actionLabel}
        </Button>
      )}
    </section>
  );
}
