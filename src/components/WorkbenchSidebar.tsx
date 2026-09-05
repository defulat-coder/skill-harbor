import { useState } from "react";
import { PresetManager } from "./PresetManager";
import { Disclosure } from "./ui/Disclosure";
import { Link, useLocation } from "@tanstack/react-router";
import { Database, Home, Library, FolderOpen, Compass, Settings, Archive, Terminal, SlidersHorizontal, Layers } from "lucide-react";
import { useApp } from "../hooks/useApp";

const row = "ds-nav-row";
const activeRow = { className: "is-active" } as const;
const exactActive = { exact: true } as const;

export function WorkbenchSidebar() {
  const { projects, tools } = useApp();
  const { pathname } = useLocation();
  const [presetsOpen, setPresetsOpen] = useState(false);
  const managementActive = ["/my-skills", "/backup", "/global-workspace", "/lobster-workspace"].some(path => pathname.startsWith(path));
  const items = [
    { to: "/", label: "首页", Icon: Home },
    { to: "/library", label: "全局技能", Icon: Library },
    { to: "/projects", label: "项目", Icon: FolderOpen },
    { to: "/install", label: "发现技能", Icon: Compass },
  ] as const;
  const recent = projects.filter(p => p.workspace_type === "project").slice(0, 4);
  return <aside className="ds-sidebar" id="workspace-navigation" aria-label="工作台导航">
    <div className="ds-sidebar-panel">
      <div className="ds-sidebar-content">
        <div className="ds-workspace-identity"><Library size={21} /><div><strong>技能港</strong><span>全局管理，项目复用</span></div></div>
        <nav aria-label="主导航">{items.map(({ to, label, Icon }) => <Link key={to} to={to} activeOptions={exactActive} className={row} activeProps={activeRow}><Icon size={17} />{label}</Link>)}</nav>
        <div className="ds-nav-divider" />
        <Link to="/search-index" className={row} activeProps={activeRow}><Database size={17} />索引管理</Link>
        {recent.length > 0 && <Disclosure title="项目快捷入口" defaultOpen><nav aria-label="项目快捷入口">{recent.map(p => <Link key={p.id} to="/project/$id" params={{ id: p.id }} className={`${row} ds-nav-project`} activeProps={activeRow} title={p.path}><FolderOpen size={15} /><span>{p.name}</span></Link>)}</nav></Disclosure>}
        <Disclosure key={String(managementActive)} title="更多管理" defaultOpen={managementActive}>
          <nav aria-label="更多管理">
            <Link to="/my-skills" className={row} activeProps={activeRow}><SlidersHorizontal size={16} />维护与更新</Link>
            <button type="button" className="ds-nav-row" onClick={() => setPresetsOpen(true)}><Layers size={16} />预设管理</button>
            <Link to="/global-workspace" className={row} activeProps={activeRow}><Terminal size={16} />工具全局目录</Link>
            {tools.some(tool => tool.category === "lobster" && tool.installed && tool.enabled) && <Link to="/lobster-workspace" className={row} activeProps={activeRow}><Terminal size={16} />龙虾工具目录</Link>}
            <Link to="/backup" className={row} activeProps={activeRow}><Archive size={16} />备份与恢复</Link>
          </nav>
        </Disclosure>
      </div>
      <nav className="ds-sidebar-footer" aria-label="设置"><Link className={row} activeProps={activeRow} to="/settings"><Settings size={16} />设置</Link></nav>
    </div>
    <PresetManager open={presetsOpen} onClose={() => setPresetsOpen(false)} />
  </aside>;
}
