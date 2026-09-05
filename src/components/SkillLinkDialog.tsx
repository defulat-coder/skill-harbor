import { LoadingState } from "./ui/LoadingState";
import styles from "./SkillLinkDialog.module.css";
import { Button } from "./ui/Button";
import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Link2, Check, AlertCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { DetailSheet } from "./DetailSheet";
import { deployWorkbenchSkills, type DeployResult } from "../lib/workbench";
import type { ManagedSkill } from "../lib/tauri";

export function SkillLinkDialog({ skills, onClose }: { skills: ManagedSkill[]; onClose: () => void }) {
  const { projects, tools, refreshAppData } = useApp();
  const normalProjects = projects.filter(p => p.workspace_type === "project");
  const [projectId, setProjectId] = useState(normalProjects[0]?.id ?? "");
  const [agent, setAgent] = useState("codex");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [results, setResults] = useState<DeployResult[] | null>(null);
  const [error, setError] = useState("");
  const target = normalProjects.find(p => p.id === projectId);
  const pendingSkills = skills.filter(skill => !results?.some(result => result.skill_id === skill.id && result.ok));
  async function deploy() {
    if (!target || submitting.current || !pendingSkills.length) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const next = await deployWorkbenchSkills(target.id, pendingSkills.map(s => s.id), agent, "symlink");
      setResults(previous => skills.flatMap(skill => { const result = next.find(item => item.skill_id === skill.id) ?? previous?.find(item => item.skill_id === skill.id); return result ? [result] : []; }));
      await refreshAppData();
    } catch (e) { setError(String(e)); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <DetailSheet open size="compact" closeDisabled={busy} title="加入项目" description={`已选 ${skills.length} 个技能，通过软链接引用全局源文件。`} onClose={() => { if (!busy) onClose(); }}>
    <div className={styles.form}>
      <div className={styles.selected}>{skills.map(s => <span key={s.id}><Link2 size={13} />{s.name}</span>)}</div>
      {normalProjects.length ? <>
        <label htmlFor="link-project">目标项目</label><select id="link-project" disabled={busy} value={projectId} onChange={e => { setProjectId(e.target.value); setResults(null); setError(""); }}>
          {normalProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select><p className="ds-path">{target?.path}</p>
        <label htmlFor="link-agent">使用工具</label><select id="link-agent" disabled={busy} value={agent} onChange={e => { setAgent(e.target.value); setResults(null); setError(""); }}><option value="codex">Codex</option>{tools.filter(t => t.key !== "codex" && t.project_relative_skills_dir).map(t => <option key={t.key} value={t.key}>{t.display_name}</option>)}</select>
        <p className="ds-note">全局技能更新后，项目引用会使用新内容。移出项目只解除链接，已有同名文件不会被覆盖。</p>
      </> : <div className="ds-empty"><p>还没有登记项目目录。</p><Link to="/projects?new=1" className="ds-button ds-button-secondary" onClick={onClose}>新建 / 导入项目</Link></div>}
      {busy && <LoadingState label="正在创建项目软链接…" />}
      {error && <p role="alert" className="ds-feedback is-error">{error}</p>}
      {results && <div className="ds-deploy-results" role="status">{results.map(r => <div key={r.skill_id} className={r.ok ? "is-success" : "is-error"}>{r.ok ? <Check size={16} /> : <AlertCircle size={16} />}<span><strong>{skills.find(s => s.id === r.skill_id)?.name}</strong><small>{r.ok ? "软链接已就绪" : r.error}</small></span></div>)}</div>}
      <footer className="ds-dialog-actions"><Button disabled={busy} variant="secondary" onClick={event => event.currentTarget.closest("dialog")?.dispatchEvent(new Event("cancel", {cancelable:true}))}>{results?.length && results.every(r => r.ok) ? "完成" : "取消"}</Button>{!busy && target && results?.length && !pendingSkills.length ? <Link className="ds-button ds-button-primary" to={`/project/${target.id}`} onClick={onClose}>打开项目</Link> : <Button variant="primary" disabled={busy || !target || !pendingSkills.length} busy={busy} onClick={() => void deploy()}><Link2 size={15} />{busy ? "正在链接…" : results?.some(r => !r.ok) ? "重试失败项" : !pendingSkills.length ? "全部已链接" : "加入项目"}</Button>}</footer>
    </div>
  </DetailSheet>;
}
