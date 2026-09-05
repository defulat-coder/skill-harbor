import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import styles from "./Button.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "secondary" | "primary" | "ghost" | "danger";
  busy?: boolean;
  iconOnly?: boolean;
}
/** Shared native button; styling follows OpenDesign's primitive contract. */
export function Button({ variant = "secondary", busy, iconOnly, disabled, className = "", children, type = "button", ...props }: Props) {
  return <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={`${styles.button} ${styles[variant]} ${iconOnly ? styles.icon : ""} ${className}`}>
    {busy && <Loader2 size={15} className={styles.spinner} aria-hidden />}{children}
  </button>;
}
