import { CardActionMenu } from "./CardActionMenu";
import { Disclosure } from "./ui/Disclosure";
import { Button } from "./ui/Button";
import styles from "./ChineseGuide.module.css";
import { useEffect, useRef, useState } from "react";
import { Loader2, Languages, Pencil, RefreshCw } from "lucide-react";
import { SkillMarkdown } from "./SkillMarkdown";
import { getErrorMessage } from "../lib/error";
import { generateSkillGuide, getSkillGuide, saveSkillGuide, type SkillGuide, type GuideScope } from "../lib/skillGuides";

export function ChineseGuide({ skillId, projectId, skillRelativePath, agent }: { skillId: string } & GuideScope) {
  const [guide, setGuide] = useState<SkillGuide | null>(null);
  const [busy, setBusy] = useState<"load" | "generate" | "save" | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftSourceHash, setDraftSourceHash] = useState<string | undefined>();
  const request = useRef(0);
  const lastAction = useRef<"load" | "generate" | "save">("load");

  const scopeKey = `${skillId}${projectId ?? ""}${skillRelativePath ?? ""}${agent ?? ""}`;
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
  if (prevScopeKey !== scopeKey) {
    setPrevScopeKey(scopeKey);
    setGuide(null); setEditing(false); setDraft(""); setError(null); setBusy("load");
  }

  useEffect(() => {
    const version = ++request.current;
    lastAction.current = "load";
    getSkillGuide(skillId, { projectId, skillRelativePath, agent }).then((value) => { if (request.current === version) setGuide(value); })
      .catch((e: unknown) => { if (request.current === version) setError(getErrorMessage(e, "读取中文说明失败")); })
      .finally(() => { if (request.current === version) setBusy(null); });
    return () => { request.current += 1; };
  }, [skillId, projectId, skillRelativePath, agent]);

  const run = async (kind: "load" | "generate" | "save", content?: string) => {
    const version = ++request.current;
    lastAction.current = kind;
    setBusy(kind); setError(null);
    try {
      const value = kind === "generate" ? await generateSkillGuide(skillId, { projectId, skillRelativePath, agent })
        : kind === "save" ? await saveSkillGuide(skillId, content ?? draft, draftSourceHash, { projectId, skillRelativePath, agent }) : await getSkillGuide(skillId, { projectId, skillRelativePath, agent });
      if (request.current === version) { setGuide(value); setEditing(false); }
    } catch (e) { if (request.current === version) setError(getErrorMessage(e, "操作失败，请重试")); }
    finally { if (request.current === version) setBusy(null); }
  };

  return <section aria-label="中文用法说明" className={styles.guide}>
    <div className={styles.header}>
      <div><h3 className={styles.title}>中文用法</h3>
        <p className={styles.meta}>{guide?.manually_edited ? "人工修订" : guide?.content ? "AI 整理 · 请结合原文核对" : "从原文生成中文用法"}</p>
      </div>
      <div className={styles.actions}>
        {guide?.content ? <Button type="button" variant="ghost" disabled={!!busy || editing} onClick={() => { setDraft(guide.content ?? ""); setDraftSourceHash(guide.guide_source_hash ?? guide.source_hash); setEditing(true); }}><Pencil size={13} />编辑</Button> : <Button type="button" disabled={!!busy || editing} onClick={() => void run("generate")}><Languages size={13} />生成中文用法</Button>}
        <CardActionMenu label="中文说明选项" actions={[{ key: "guide-option", label: guide?.content ? "重新生成" : "手动编写", icon: guide?.content ? <Languages size={14} /> : <Pencil size={14} />, disabled: !!busy || editing, onSelect: () => { if (guide?.content) void run("generate"); else { setDraft(""); setDraftSourceHash(guide?.source_hash); setEditing(true); } } }]} />
      </div>
    </div>
    {guide?.stale && <div role="status" className={styles.notice}>技能原文已更新，这份中文说明可能过期。重新生成会保留你的人工修订，并提供新草稿供你采用。</div>}
    {error && <div role="alert" className={styles.error}><span>{error}</span><Button type="button" variant="ghost" disabled={!!busy} onClick={() => void run(lastAction.current)}>重试</Button></div>}
    {busy === "load" && <p role="status" className={styles.loading}><Loader2 size={16} className={styles.spinner} />读取说明…</p>}
    {busy === "generate" && <p role="status" className={styles.notice}>正在通过本地 Codex CLI 整理原文，最多等待 3 分钟。模型调用可能需要联网；生成结果会保存在本机。</p>}
    {editing ? <div className={styles.editor}>
      <label htmlFor={`guide-${skillId}`} className="text-xs text-secondary">中文说明（支持 Markdown）</label>
      <textarea id={`guide-${skillId}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} className={styles.textarea} disabled={busy === "save"} aria-describedby={`guide-help-${skillId}`} />
      <p id={`guide-help-${skillId}`} className={styles.meta}>保存为人工修订；如果原文已变化，仍会保留过期提示。</p>
      <div className={styles.actions}><Button type="button" disabled={!!busy} onClick={() => setEditing(false)}>取消</Button><Button type="button" variant="primary" busy={busy === "save"} disabled={!!busy || !draft.trim()} onClick={() => void run("save")}>{busy === "save" ? "保存中…" : "保存说明"}</Button></div>
    </div> : guide?.content ? <SkillMarkdown content={guide.content} className={styles.reading} /> : !busy && !error ? <div className={styles.empty}>还没有中文用法。点击上方生成，也可在说明选项中手动编写。</div> : null}
    {guide?.generated_content && !editing && <div className={styles.draft}><Disclosure title="查看新生成的草稿（人工说明尚未改动）">
      <div className="mt-4"><SkillMarkdown content={guide.generated_content} className={styles.reading} /></div>
      <Button type="button" className={styles.adopt} disabled={!!busy} onClick={() => { setDraft(guide.generated_content ?? ""); setDraftSourceHash(guide.generated_source_hash ?? undefined); setEditing(true); }}><RefreshCw size={13} />编辑并采用草稿</Button>
    </Disclosure></div>}
  </section>;
}
