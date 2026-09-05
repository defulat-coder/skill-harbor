import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Languages, Loader2 } from "lucide-react";
import { DetailSheet } from "./DetailSheet";
import { SkillMarkdown } from "./SkillMarkdown";
import { Button } from "./ui/Button";
import { getErrorMessage } from "../lib/error";
import styles from "./MarketChinesePreview.module.css";

export function MarketChinesePreview({ source, skillId }: { source: string; skillId: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    request.current += 1;
    setContent(""); setError(""); setBusy(false); setOpen(false);
    return () => { request.current += 1; };
  }, [source, skillId]);
  async function generate() {
    setOpen(true);
    if (content || busy) return;
    const version = ++request.current;
    setBusy(true); setError("");
    try {
      const result = await invoke<string>("preview_market_guide", { source, skillId });
      if (request.current === version) setContent(result);
    } catch (e) { if (request.current === version) setError(getErrorMessage(e, "中文预览失败")); }
    finally { if (request.current === version) setBusy(false); }
  }
  return <>
    <Button variant="ghost" className={styles.trigger} onClick={() => void generate()}><Languages size={14} aria-hidden />{busy ? "查看生成进度" : "中文用法预览"}</Button>
    <DetailSheet open={open} title={`${skillId} · 中文用法`} description={<p>基于 {source} 的源文档由 AI 整理。生成可能需要联网；关闭窗口后仍会继续。</p>} onClose={() => setOpen(false)}>
      {busy && <p role="status" className={styles.loading}><Loader2 size={16} className={styles.spinner} aria-hidden />正在获取原文并整理中文说明，可能需要几分钟…</p>}
      {error && <div role="alert" className={styles.error}><p>{error}</p><Button onClick={() => void generate()} disabled={busy}>重试中文预览</Button></div>}
      {content && <><p role="status" className={styles.meta}>中文说明已生成，请结合原文核对。</p><SkillMarkdown content={content} className={styles.reading} /></>}
    </DetailSheet>
  </>;
}
