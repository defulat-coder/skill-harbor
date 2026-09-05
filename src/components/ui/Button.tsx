import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import styles from "./Button.module.css";

type ButtonVariant = "secondary" | "primary" | "ghost" | "danger" | "danger-ghost";
type ButtonSize = "default" | "sm";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  iconOnly?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  secondary: styles.secondary,
  primary: styles.primary,
  ghost: styles.ghost,
  danger: styles.danger,
  "danger-ghost": styles.dangerGhost,
};

/** Shared native button; styling follows OpenDesign's primitive contract. */
export function Button({
  variant = "secondary",
  size = "default",
  busy,
  iconOnly,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      className={`${styles.button} ${variantClasses[variant]} ${size === "sm" ? styles.sm : ""} ${iconOnly ? styles.icon : ""} ${className}`}
    >
      {busy && <Loader2 size={15} className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
}
