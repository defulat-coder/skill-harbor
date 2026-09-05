import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUp, BookOpen, Folder, Link2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { Disclosure } from "../components/ui/Disclosure";
import { SkillMarkdown } from "../components/SkillMarkdown";
import { SkillLinkDialog } from "../components/SkillLinkDialog";
import { getErrorMessage } from "../lib/error";
import { answerSkillSearch, querySkillSearch, type SkillSearchResult } from "../lib/skillSearch";
import { refreshSkillIndex, useSkillIndex } from "../hooks/useSkillIndex";
import styles from "./SearchHome.module.css";

// Preserve the current question when reading a skill and returning in this app session.
let recentSearch: { root?: string; query: string; result: SkillSearchResult | null; answer: string } | null = null;
export function SearchHome() {
  const index = useSkillIndex();
  return <SearchHomeContent key={index.status?.root ?? "pending"} index={index} />;
}
function SearchHomeContent({ index }: { index: ReturnType<typeof useSkillIndex> }) {
  const { managedSkills } = useApp();
  const { status, loading: statusLoading, building, error: statusError } = index;
  const saved = recentSearch?.root === status?.root ? recentSearch : null;
  const [query, setQuery] = useState(saved?.query ?? "");
  const [phase, setPhase] = useState<"idle" | "search" | "answer">("idle");
  const [result, setResult] = useState<SkillSearchResult | null>(saved?.result ?? null);
  const [answer, setAnswer] = useState(saved?.answer ?? "");
  const [error, setError] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);
  const request = useRef(0);
  const working = useRef(false);
  const mounted = useRef(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busy = phase !== "idle";
  const groups = Object.values((result?.hits ?? []).reduce<Record<string, { skillId: string; name: string; sources: { hit: SkillSearchResult["hits"][number]; index: number }[] }>>((all, hit, index) => {
    const group = all[hit.skill_id] ??= { skillId: hit.skill_id, name: hit.name, sources: [] };
    group.sources.push({ hit, index }); return all;
  }, {}));
  const linkSkill = managedSkills.find(skill => skill.id === linkId);

  useEffect(() => {
    mounted.current = true;
    const activeRequest = request;
    return () => { mounted.current = false; activeRequest.current++; };
  }, []);

  useEffect(() => { recentSearch = { root: status?.root, query, result, answer }; }, [status?.root, query, result, answer]);

  async function generateAnswer(found: SkillSearchResult, token: number) {
    if (!found.hits.length) return;
    setPhase("answer"); setAnswerError("");
    try {
      const text = await answerSkillSearch(found.query, found.hits);
      if (mounted.current && token === request.current) setAnswer(text);
    } catch (error) { if (mounted.current && token === request.current) setAnswerError(getErrorMessage(error, "中文回答生成失败，检索结果仍可查看")); }
  }
  async function search() {
    if (working.current || !query.trim() || !status?.ready || building) return;
    working.current = true;
    const token = ++request.current;
    setPhase("search"); setError(""); setAnswerError(""); setAnswer(""); setResult(null);
    try {
      const found = await querySkillSearch(query.trim());
      if (!mounted.current || token !== request.current) return;
      setResult(found);
      await generateAnswer(found, token);
    } catch (error) { if (mounted.current && token === request.current) setError(getErrorMessage(error, "技能检索失败，请重试")); }
    finally { if (mounted.current && token === request.current) { working.current = false; setPhase("idle"); } }
  }
  async function retryAnswer() {
    if (!result || working.current) return;
    working.current = true;
    const token = ++request.current;
    try { await generateAnswer(result, token); }
    finally { if (mounted.current && token === request.current) { working.current = false; setPhase("idle"); } }
  }

  return <div className={styles.page}>
    <section className={styles.hero} aria-labelledby="skill-question-title">
      <div className={styles.identity}><BookOpen size={24} strokeWidth={1.6} aria-hidden /><span>技能港</span></div>
      <h1 id="skill-question-title">想用技能做什么？</h1>
      <p className={styles.subtitle}>描述需求，找到技能和用法。</p>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void search(); }}>
        <label className={styles.inputLabel} htmlFor="skill-question">描述你的需求</label>
        <textarea ref={textarea} id="skill-question" maxLength={2000} value={query} onChange={event => setQuery(event.target.value)} placeholder="例如：有哪些技能能帮我检查代码？应该怎么使用？" rows={4} disabled={phase === "search"} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void search(); } }} />
        <div className={styles.composerActions}><span>⌘ / Ctrl + Enter 提问</span><Button type="submit" variant="primary" disabled={busy || !query.trim() || !status?.ready || building}><ArrowUp size={18} />{phase === "search" ? "检索中" : phase === "answer" ? "回答中" : "提问"}</Button></div>
        <div className={styles.directory}><Folder size={14} aria-hidden /><span title={status?.root}>全局技能库</span><Link to="/library">浏览技能库</Link></div>
      </form>
      <div className={styles.indexRow}>
        <span role="status">{building ? "索引正在构建…" : statusLoading ? "正在检查索引…" : status?.ready ? `索引就绪 · ${status.files} 个文件` : "尚未建立可用索引"}</span>
        <Link to="/search-index" className={styles.indexLink}>索引管理 <ArrowRight size={14} aria-hidden /></Link>
      </div>
      {!status?.ready && !statusLoading && !building && <p className={styles.hint}>请先到索引管理建立索引，再用中文提问。</p>}
      {(statusError || status?.error) && <div role="alert" className={styles.error}>{statusError || status?.error}<Button disabled={busy || statusLoading || building} onClick={() => void refreshSkillIndex()}>重新检查</Button></div>}
    </section>
    {phase === "search" && <LoadingState label="正在检索你的全局技能库…" />}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {result && <section className={styles.results} aria-label="技能检索结果">
      <header className={styles.resultsHeader}><div><h2>{result.query}</h2><p>{result.hits.length ? `找到 ${groups.length} 个技能` : "没有找到相关内容。试着描述具体任务，或更新技能索引后再提问。"}</p></div>{!result.hits.length && <Button onClick={() => textarea.current?.focus()}>修改问题</Button>}</header>
      {result.warning && <p role="status" className={styles.hint}>{result.warning}</p>}
      {phase === "answer" && <LoadingState label="已找到相关技能，正在整理中文回答…" />}
      {phase === "idle" && result.hits.length > 0 && !answer && !answerError && <Button onClick={() => void retryAnswer()}>整理中文回答</Button>}
      {answer && <article className={styles.answer}><h3>中文回答</h3><SkillMarkdown content={answer} /></article>}
      {answerError && <div role="alert" className={styles.error}><span>{answerError}。下方来源仍可阅读。</span><Button disabled={busy} onClick={() => void retryAnswer()}>重试回答</Button></div>}
      <div className={styles.hits}>{groups.map(group => <article className={styles.hit} key={group.skillId}>
        <header><h3><Link to={`/library?skill=${encodeURIComponent(group.skillId)}`}>{group.name}</Link></h3><Button variant="ghost" disabled={!managedSkills.some(skill => skill.id === group.skillId)} onClick={() => setLinkId(group.skillId)}><Link2 size={14} />加入项目</Button></header>
        <Disclosure title={`查看来源 · ${group.sources.length} 个片段`}>{group.sources.map(({ hit, index }) => <div key={index}><p className={styles.source}><span>[{index + 1}] 第 {hit.line_start}–{hit.line_end} 行</span><code>{hit.path}</code></p><pre className={styles.excerpt}>{hit.text}</pre></div>)}</Disclosure>
      </article>)}</div>
    </section>}
    {linkSkill && <SkillLinkDialog skills={[linkSkill]} onClose={() => setLinkId(null)} />}
  </div>;
}
