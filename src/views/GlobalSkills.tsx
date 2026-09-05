import { LoadingState } from "../components/ui/LoadingState";
import { Disclosure } from "../components/ui/Disclosure";
import { PageHeader } from "../components/ui/PageHeader";
import styles from "./GlobalSkills.module.css";
import { Button } from "../components/ui/Button";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Library, Plus, Search, Link2, FileText, LayoutGrid, List, ArrowUpRight, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { DetailSheet } from "../components/DetailSheet";
import { ChineseGuide } from "../components/ChineseGuide";
import { SkillMarkdown } from "../components/SkillMarkdown";
import { SkillLinkDialog } from "../components/SkillLinkDialog";
import { getSkillDocument, type ManagedSkill } from "../lib/tauri";

const sourceLabel = (source: string) => ({ local: "本地导入", import: "本地导入", skillssh: "技能市场", git: "Git 仓库", marketplace: "技能市场", skills_sh: "技能市场", manual: "手动创建" }[source] ?? source);

function GlobalSkillDetail({ skill, onClose, onLink }: { skill: ManagedSkill; onClose: () => void; onLink: () => void }) {
  const [tab, setTab] = useState<"guide" | "source">("guide");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getSkillDocument(skill.id).then(doc => { if (active) setSource(doc.content); })
      .catch(e => { if (active) setError(String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [skill.id, retry]);
  return <DetailSheet open title={skill.name} description={skill.description} onClose={onClose} meta={<div className="ds-detail-actions"><span className="ds-badge">{sourceLabel(skill.source_type)}</span><Button variant="primary" onClick={onLink}><Link2 size={15} />加入项目</Button></div>}>
    <div className="ds-detail-tabs" aria-label="技能文档视图"><button aria-pressed={tab === "guide"} className={tab === "guide" ? "is-active" : ""} onClick={() => setTab("guide")}>中文用法</button><button aria-pressed={tab === "source"} className={tab === "source" ? "is-active" : ""} onClick={() => setTab("source")}>原始文档</button></div>
    <div className="ds-reading-pane">{tab === "guide" ? <ChineseGuide skillId={skill.id} /> : loading ? <LoadingState label="正在读取原文…" /> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={() => { setLoading(true); setError(""); setRetry(n => n + 1); }}>重新读取</Button></div> : <SkillMarkdown content={source} />}</div>
    <Disclosure title="技能来源与路径"><dl><dt>本地路径</dt><dd>{skill.central_path}</dd><dt>来源</dt><dd>{skill.source_ref || "本地技能"}</dd></dl><p>全局维护此源文件，项目通过软链接复用。</p></Disclosure>
  </DetailSheet>;
}

export function GlobalSkills() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { managedSkills, loading, appError, refreshAppData } = useApp();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("workbench.libraryView") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const sources = [...new Set(managedSkills.map(s => s.source_type))];
  const tags = [...new Set(managedSkills.flatMap(s => s.tags))].sort();
  const needle = query.trim().toLowerCase();
  const filtered = managedSkills.filter(s => (!source || s.source_type === source) && (!tag || s.tags.includes(tag)) && `${s.name} ${s.description ?? ""} ${s.tags.join(" ")}`.toLowerCase().includes(needle))
    .sort((a, b) => sort === "updated" ? b.updated_at - a.updated_at : a.name.localeCompare(b.name, "zh-CN"));
  const selected = managedSkills.find(s => s.id === (searchParams.get("skill") ?? selectedId));
  const checked = managedSkills.filter(s => checkedIds.includes(s.id));
  const linked = managedSkills.filter(s => linkIds.includes(s.id));
  const allChecked = filtered.length > 0 && filtered.every(s => checkedIds.includes(s.id));
  const someChecked = filtered.some(s => checkedIds.includes(s.id)) && !allChecked;
  function toggle(id: string) { setCheckedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]); }
  function setLibraryView(value: "grid" | "list") {
    setView(value);
    try { localStorage.setItem("workbench.libraryView", value); } catch { /* Retain in-memory view. */ }
  }
  return <div className={styles.library}>
    <PageHeader title="全局技能" count={managedSkills.length} description="统一维护技能，阅读用法后加入项目。" actions={<><Link to="/install" className="ds-button ds-button-primary"><Plus size={16} />添加技能</Link></>} />
    <section className="ds-library-controls" aria-label="筛选全局技能">
      <label className="ds-search"><Search size={17} /><span className="sr-only">搜索全局技能</span><input placeholder="搜索技能名称、描述或标签" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="清空搜索" onClick={() => setQuery("")}><X size={14} /></button>}</label>
      <Button variant="ghost" aria-pressed={selectionMode} onClick={() => { setSelectionMode(value => !value); setCheckedIds([]); }}>{selectionMode ? "退出多选" : "多选"}</Button>
      <div className="ds-view-toggle" aria-label="技能视图"><button aria-label="网格视图" aria-pressed={view === "grid"} className={view === "grid" ? "is-active" : ""} onClick={() => setLibraryView("grid")}><LayoutGrid size={16} /></button><button aria-label="列表视图" aria-pressed={view === "list"} className={view === "list" ? "is-active" : ""} onClick={() => setLibraryView("list")}><List size={16} /></button></div>
    </section>
    <Disclosure title={`筛选与排序${source || tag ? " · 已筛选" : ""}`}><div className="ds-filters"><select aria-label="筛选来源" value={source} onChange={e => setSource(e.target.value)}><option value="">全部来源</option>{sources.map(s => <option key={s} value={s}>{sourceLabel(s)}</option>)}</select><select aria-label="筛选标签" value={tag} onChange={e => setTag(e.target.value)}><option value="">全部标签</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select><select aria-label="技能排序" value={sort} onChange={e => setSort(e.target.value)}><option value="name">按名称</option><option value="updated">最近更新</option></select></div></Disclosure>
    {selectionMode && <div className="ds-selection-bar"><label><input type="checkbox" aria-label="选择当前结果的全部技能" ref={element => { if (element) element.indeterminate = someChecked; }} aria-checked={someChecked ? "mixed" : allChecked} checked={allChecked} disabled={!filtered.length} onChange={() => setCheckedIds(ids => allChecked ? ids.filter(id => !filtered.some(s => s.id === id)) : [...new Set([...ids, ...filtered.map(s => s.id)])])} />{checked.length ? `已选 ${checked.length} 个` : `全部技能 · ${filtered.length} 个`}</label>{checked.length > 0 ? <div><Button variant="secondary" onClick={() => setCheckedIds([])}>取消选择</Button><Button variant="primary" onClick={() => setLinkIds(checked.map(s => s.id))}><Link2 size={14} />加入项目</Button></div> : <span>点击技能阅读用法 · 勾选后可批量链接</span>}</div>}
    {loading ? <LoadingState label="正在读取技能库…" /> : appError && !managedSkills.length ? <div className="ds-empty"><h2>技能库尚未读取完成</h2><p>加载出现问题，请重试后查看技能。</p><Button onClick={() => void refreshAppData()}>重新加载</Button></div> : !filtered.length ? <div className="ds-empty"><Library size={28} /><h2>{managedSkills.length ? "没有匹配的技能" : "添加你的第一个技能"}</h2><p>{managedSkills.length ? "试试其他关键词，或清除筛选条件。" : "导入本地技能或从市场安装，随后即可阅读中文用法。"}</p>{managedSkills.length ? <Button variant="secondary" onClick={() => { setQuery(""); setTag(""); setSource(""); }}>清除筛选</Button> : null}</div> : <section className={`ds-skills ds-skills-${view}`} aria-label="全局技能列表">{filtered.map(skill => <article className={`${styles.skill} ds-skill ${checkedIds.includes(skill.id) ? "is-checked" : ""}`} key={skill.id}>
      <div className="ds-skill-meta">{selectionMode && <input type="checkbox" checked={checkedIds.includes(skill.id)} aria-label={`选择 ${skill.name}`} onChange={() => toggle(skill.id)} />}<span>{sourceLabel(skill.source_type)}</span></div>
      <button className="ds-skill-open" onClick={() => { setSelectedId(skill.id); if (searchParams.has("skill")) { const next = new URLSearchParams(searchParams); next.set("skill", skill.id); setSearchParams(next, {replace:true}); } }} aria-label={`查看 ${skill.name} 的用法`}><span className="ds-skill-icon"><FileText size={22} /></span><div><h2>{skill.name}</h2><p>{skill.description || "查看此技能的中文说明与原始文档。"}</p></div><ArrowUpRight className="ds-skill-arrow" size={16} /></button>
      <footer><div>{skill.tags.slice(0, 2).map(t => <span key={t} className="ds-tag">{t}</span>)}</div></footer>
    </article>)}</section>}
    {selected && linked.length === 0 && <GlobalSkillDetail key={selected.id} skill={selected} onClose={() => { setSelectedId(null); if(searchParams.has("skill")) { const next = new URLSearchParams(searchParams); next.delete("skill"); setSearchParams(next, {replace:true}); } }} onLink={() => setLinkIds([selected.id])} />}
    {linked.length > 0 && <SkillLinkDialog key={linkIds.join(",")} skills={linked} onClose={() => setLinkIds([])} />}
  </div>;
}
