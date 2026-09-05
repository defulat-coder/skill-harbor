import { Loader2 } from "lucide-react";
import styles from "./ToggleSwitch.module.css";

interface Props {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** Shows a spinner in the knob while the backing operation is in flight. */
  loading?: boolean;
  title?: string;
  className?: string;
}

/** Shared 34x20 switch with theme-aware thumb and transform-only motion. */
export function ToggleSwitch({ checked, onChange, disabled, loading, title, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      aria-busy={loading || undefined}
      title={title}
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`${styles.switch} ${className ?? ""}`}
    >
      <span className={styles.knob}>
        {loading && <Loader2 className="h-2.5 w-2.5 animate-spin text-muted" />}
      </span>
    </button>
  );
}
