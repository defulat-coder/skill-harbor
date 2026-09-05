import { useState } from "react";
import { PresetManager } from "./PresetManager";
import { Disclosure } from "./ui/Disclosure";
import { NavLink, useLocation } from "react-router-dom";
import { Database, Home, Library, FolderOpen, Compass, Settings, Archive, Terminal, SlidersHorizontal, Layers } from "lucide-react";
import { useApp } from "../hooks/useApp";

const row = ({ isActive }: { isActive: boolean }) => `ds-nav-row ${isActive ? "is-active" : ""}`;

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
  ];
  const recent = projects.filter(p => p.workspace_type === "project").slice(0, 4);
  return <aside className="ds-sidebar" id="workspace-navigation" aria-label="工作台导航">
    <div className="ds-sidebar-panel">
      <div className="ds-sidebar-content">
        <div className="ds-workspace-identity"><Library size={21} /><div><strong>技能港</strong><span>全局管理，项目复用</span></div></div>
        <nav aria-label="主导航">{items.map(({ to, label, Icon }) => <NavLink key={to} to={to} end className={row}><Icon size={17} />{label}</NavLink>)}</nav>
        <div className="ds-nav-divider" />
        <NavLink to="/search-index" className={row}><Database size={17} />索引管理</NavLink>
        {recent.length > 0 && <Disclosure title="项目快捷入口" defaultOpen><nav aria-label="项目快捷入口">{recent.map(p => <NavLink key={p.id} to={`/project/${p.id}`} className={state => `${row(state)} ds-nav-project`} title={p.path}><FolderOpen size={15} /><span>{p.name}</span></NavLink>)}</nav></Disclosure>}
        <Disclosure key={String(managementActive)} title="更多管理" defaultOpen={managementActive}>
          <nav aria-label="更多管理">
            <NavLink to="/my-skills" className={row}><SlidersHorizontal size={16} />维护与更新</NavLink>
            <button type="button" className="ds-nav-row" onClick={() => setPresetsOpen(true)}><Layers size={16} />预设管理</button>
            <NavLink to="/global-workspace" className={row}><Terminal size={16} />工具全局目录</NavLink>
            {tools.some(tool => tool.category === "lobster" && tool.installed && tool.enabled) && <NavLink to="/lobster-workspace" className={row}><Terminal size={16} />龙虾工具目录</NavLink>}
            <NavLink to="/backup" className={row}><Archive size={16} />备份与恢复</NavLink>
          </nav>
        </Disclosure>
      </div>
      <nav className="ds-sidebar-footer" aria-label="设置"><NavLink className={row} to="/settings"><Settings size={16} />设置</NavLink></nav>
    </div>
    <PresetManager open={presetsOpen} onClose={() => setPresetsOpen(false)} />
  </aside>;
}
