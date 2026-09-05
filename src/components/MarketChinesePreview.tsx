import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Languages, Loader2 } from "lucide-react";
import { DetailSheet } from "./DetailSheet";
import { SkillMarkdown } from "./SkillMarkdown";
import { Button } from "./ui/Button";
import { getErrorMessage } from "../lib/error";
import { queryKeys } from "../lib/queryKeys";
import styles from "./MarketChinesePreview.module.css";

export function MarketChinesePreview({ source, skillId }: { source: string; skillId: string }) {
  const [open, setOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  // enabled:false — generation only runs when the user asks. The result lives
  // in the query cache, so closing the sheet (or re-rendering the list) never
  // loses a finished preview, and an in-flight generation keeps going.
  const previewQuery = useQuery({
    queryKey: queryKeys.market.guidePreview(source, skillId),
    queryFn: () => invoke<string>("preview_market_guide", { source, skillId }),
    enabled: false,
    staleTime: Infinity,
    retry: 0,
  });
  const content = previewQuery.data ?? "";
  const busy = previewQuery.isFetching;
  const error = previewQuery.error ? getErrorMessage(previewQuery.error, "中文预览失败") : "";
  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setTimeout(() => setSlow(true), 60_000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  const scopeKey = `${source}${skillId}`;
  const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
  if (prevScopeKey !== scopeKey) {
    setPrevScopeKey(scopeKey);
    setSlow(false);
    setOpen(false);
  }
  function generate() {
    setOpen(true);
    if (content || busy) return;
    setSlow(false);
    void previewQuery.refetch();
  }
  return (
    <>
      <Button variant="ghost" className={styles.trigger} onClick={generate}>
        <Languages size={14} aria-hidden />
        {busy ? "查看生成进度" : "中文用法预览"}
      </Button>
      <DetailSheet
        open={open}
        title={`${skillId} · 中文用法`}
        description={
          <p>基于 {source} 的源文档由 AI 整理。生成可能需要联网；关闭窗口后仍会继续。</p>
        }
        onClose={() => setOpen(false)}
      >
        {busy &&
          (slow ? (
            <p role="status" className={styles.loading}>
              生成已超过一分钟，仍在后台继续；可以先做其他事，稍后重新打开查看结果。
            </p>
          ) : (
            <p role="status" className={styles.loading}>
              <Loader2 size={16} className={styles.spinner} aria-hidden />
              正在获取原文并整理中文说明，可能需要几分钟…
            </p>
          ))}
        {error && (
          <div role="alert" className={styles.error}>
            <p>{error}</p>
            <Button onClick={generate} disabled={busy}>
              重试中文预览
            </Button>
          </div>
        )}
        {content && (
          <>
            <p role="status" className={styles.meta}>
              中文说明已生成，请结合原文核对。
            </p>
            <SkillMarkdown content={content} className={styles.reading} />
          </>
        )}
      </DetailSheet>
    </>
  );
}
