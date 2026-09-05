import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";
export function PageHeader({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <h1>
          {title}
          {count !== undefined && <span>{count}</span>}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
