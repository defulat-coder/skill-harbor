import styles from "./Layout.module.css";
import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { PanelLeft, Home, ChevronRight, Search } from "lucide-react";
import "../workbench.css";
import "../design-system.css";
import { PointerKineticGrid } from "./PointerKineticGrid";
import { WorkbenchSidebar } from "./WorkbenchSidebar";
import { StatusBanner } from "./StatusBanner";
import { CommandPalette } from "./CommandPalette";
import { useApp } from "../hooks/useApp";
import { useTranslation } from "react-i18next";
import { useDragWindow } from "../hooks/useDragWindow";

export function Layout() {
  const { t } = useTranslation();
  const { appError, refreshAppData } = useApp();
  const onDrag = useDragWindow();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("workbench.sidebarOpen") === "true"; } catch { return false; }
  });
  function toggleSidebar() {
    setSidebarOpen(value => {
      try { localStorage.setItem("workbench.sidebarOpen", String(!value)); } catch { /* Storage may be unavailable. */ }
      return !value;
    });
  }
  const pageTitle = pathname.startsWith("/project/") ? "项目工作台" : ({ "/": "首页", "/library": "全局技能", "/search-index": "索引管理", "/projects": "项目", "/install": "发现技能", "/settings": "设置", "/backup": "备份与恢复", "/my-skills": "维护与更新" }[pathname] ?? "工具全局目录");

  // Cmd+, to open Settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        const target = e.target;
        if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        e.preventDefault();
        void navigate("/settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        const target = e.target;
        if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
        e.preventDefault();
        void refreshAppData();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, refreshAppData]);

  return (
    <div className="ds-shell">
      <PointerKineticGrid />
      <a className={styles.skip} href="#main-content">跳到页面内容</a>
      <header className="ds-titlebar" onMouseDown={e => { if (e.target === e.currentTarget) onDrag(e); }}>
        <button type="button" className="ds-icon-button" aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"} aria-expanded={sidebarOpen} aria-controls="workspace-navigation" onClick={toggleSidebar}><PanelLeft size={17} /></button>
        <Link to="/" className="ds-icon-button" aria-label="回到首页"><Home size={16} /></Link>
        <ChevronRight size={12} className="ds-titlebar-separator" /><span>{pageTitle}</span>
        <span className="ds-titlebar-caption">技能港</span>
        <button type="button" className="ds-icon-button" aria-label="快速查找（⌘K）" onClick={() => window.dispatchEvent(new Event("workbench:search"))}><Search size={16} /></button>
      </header>
      <div className={`ds-layout-body ${sidebarOpen ? "is-sidebar-open" : ""}`}>
        <div className={styles.navigation} data-open={sidebarOpen} inert={!sidebarOpen} aria-hidden={!sidebarOpen}><WorkbenchSidebar /></div>
        <main className="ds-main" id="main-content" tabIndex={-1} key={pathname}>
          <div className="ds-page-container">
            {appError && <StatusBanner compact title={t("common.dataOutOfDate")} description={appError} actionLabel={t("common.retry")} onAction={refreshAppData} tone="danger" />}
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
