import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/LoadingState";
import { Disclosure } from "../components/ui/Disclosure";
import { buildSkillIndex, refreshSkillIndex, useSkillIndex } from "../hooks/useSkillIndex";
import styles from "./SearchIndex.module.css";

export function SearchIndex() {
  const { status, loading, building, error, completedAt } = useSkillIndex();
  return <div className={styles.page}>
    <PageHeader title="索引管理" description="为全局技能建立中文检索。" />
    <section className={styles.panel} aria-labelledby="index-state-title">
      <div className={styles.heading}><div><h2 id="index-state-title">检索状态</h2><p role="status">{building ? "正在构建索引" : loading ? "正在检查状态…" : status?.ready ? `索引就绪 · ${status.files} 个文件` : "尚未建立可用索引"}</p></div>
        <Button variant="primary" disabled={building || loading || !status?.available} onClick={() => void buildSkillIndex()}><RefreshCw size={16} />{building ? "构建中…" : status?.ready ? "更新索引" : "建立索引"}</Button></div>
      <dl className={styles.details}><dt>技能源目录</dt><dd>{status?.root || "未读取"}</dd></dl>
      {building && <><LoadingState label="正在处理文档，首次下载模型可能需要几分钟…" /><p>可以切换页面，构建会继续；退出应用会中止构建。</p></>}
      {completedAt && !building && <p role="status">本次构建完成：{completedAt}</p>}
      {(error || status?.error) && <p role="alert" className={styles.error}>{error || status?.error}<Button disabled={building || loading} onClick={() => void refreshSkillIndex()}>重试检查</Button></p>}
      <div className={styles.footer}><p>{building ? "完成后即可提问。" : status?.ready ? "技能变化会在下次检索前自动同步。" : "首次建立索引会下载本地模型。"}</p>{status?.ready && !building && <Link to="/" className={styles.footerLink}>开始提问 <ArrowRight size={14} aria-hidden /></Link>}</div>
    </section>
    <Disclosure title="索引范围与运行方式"><div className={styles.help}><Button disabled={building || loading} onClick={() => void refreshSkillIndex()}>重新检查环境</Button><p>索引当前目录内非隐藏、非软链接的 Markdown 文档，单个文件不超过 1 MiB。模型、文档缓存和索引保存在应用缓存中，不修改技能源文件。</p><p>本地模型：{status?.model || "local/multilingual-e5-small"}。已建立索引后，提问前会自动同步文档变化；你也可以独立运行更新。</p><p>构建索引不需要 Codex CLI。中文回答另由已配置的 Codex CLI 整理。</p></div></Disclosure>
  </div>;
}
