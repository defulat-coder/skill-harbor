import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import styles from "./LoadingState.module.css";
/** Mount while loading. Slow feedback does not fabricate timeout or cancel work. */
export function LoadingState({
  label = "正在加载…",
  action,
}: {
  label?: string;
  action?: ReactNode;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <Loader2 size={18} className={styles.spinner} aria-hidden />
      <span>
        {label}
        {slow && <small>耗时比平时稍长，请检查本地工具或连接状态。</small>}
      </span>
      {action}
    </div>
  );
}
