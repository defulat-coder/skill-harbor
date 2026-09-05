import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Disclosure.module.css";
interface Props {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export function Disclosure({
  title,
  children,
  open: controlled,
  defaultOpen = false,
  onOpenChange,
}: Props) {
  const id = useId();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlled ?? localOpen;
  const [settledOpen, setSettledOpen] = useState(false);
  useEffect(() => {
    const delay = open && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 200 : 0;
    const timer = window.setTimeout(() => setSettledOpen(open), delay);
    return () => window.clearTimeout(timer);
  }, [open]);
  return (
    <section className={styles.disclosure}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setLocalOpen(!open);
          onOpenChange?.(!open);
        }}
      >
        {title}
        <ChevronDown size={16} className={open ? styles.expanded : undefined} aria-hidden />
      </button>
      <div
        className={styles.collapse}
        data-open={open}
        data-settled={settledOpen}
        inert={!open}
        aria-hidden={!open}
        id={id}
      >
        <div className={styles.inner}>{children}</div>
      </div>
    </section>
  );
}
