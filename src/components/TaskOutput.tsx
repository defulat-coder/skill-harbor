import { Disclosure } from "./ui/Disclosure";
import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { SkillMarkdown } from "./SkillMarkdown";

/** Keep human-readable agent messages separate from the diagnostic JSONL stream. */
export function TaskOutput({ log, running, loading = false, createdAt, onStop, stopping = false }: { log: string; running: boolean; loading?: boolean; createdAt?: number; onStop?: () => void; stopping?: boolean }) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const startedAt = createdAt === undefined ? mountedAt : createdAt < 1e12 ? createdAt * 1000 : createdAt;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, startedAt + 60_000 - Date.now()));
    return () => clearTimeout(timer);
  }, [running, startedAt]);
  const waitingLong = running && now - startedAt >= 60_000;
  const messages = useMemo(() => {
    const found: string[] = [];
    for (const line of log.split("\n")) {
      try {
        const event = JSON.parse(line);
        if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") found.push(event.item.text);
      } catch { /* stderr may share this stream; it remains available below. */ }
    }
    return found.slice(-20);
  }, [log]);
  return <section aria-label="运行输出" aria-busy={loading} className="space-y-4">
    {loading ? <p role="status" className="wb-muted">正在读取运行输出…</p> : messages.length ? messages.map((text, i) => <div className="rounded-lg border border-border p-4" key={i}><SkillMarkdown content={text} /></div>) : waitingLong ? <div className="space-y-3">
      <p role="status" className="wb-muted">任务已运行超过一分钟，尚未收到文字结果。可以展开下方执行日志查看进展；若长时间没有新日志，可停止任务后检查 CLI 或连接状态，再重新提交。</p>
      {onStop && <Button variant="danger" busy={stopping} onClick={onStop}>停止当前任务</Button>}
    </div> : <p className="wb-muted">{running ? "Codex 正在处理，文字结果会显示在这里。" : "本次任务没有返回文字结果，请查看详细日志。"}</p>}
    <Disclosure title="查看执行日志（诊断信息）"><pre className="wb-console mt-3">{log || (running ? "等待 CLI 输出…" : "本次运行没有日志。") }</pre></Disclosure>
  </section>;
}
