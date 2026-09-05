import { CardActionMenu } from "../components/CardActionMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailSheet } from "../components/DetailSheet";
import styles from "./Workbench.module.css";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { TaskOutput } from "../components/TaskOutput";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  ArrowUpRight,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  Search,
  Terminal,
} from "lucide-react";
import { cjk } from "@streamdown/cjk";
import { Streamdown, type Components } from "streamdown";
import { cn } from "../utils";
import { useApp } from "../hooks/useApp";
import * as api from "../lib/tauri";
import { queryKeys } from "../lib/queryKeys";
import type { ProjectSkill } from "../lib/tauri";
import * as wb from "../lib/workbench";
import { ChineseGuide } from "../components/ChineseGuide";

const errText = (error: unknown) => (error instanceof Error ? error.message : String(error));
// Streamdown renders strong as a span by default; keep semantic bold in the
// workbench palette (color inherits --wb-ink from .wb-markdown).
const documentComponents: Components = {
  strong: ({ className, node: _node, ...props }) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
};
const statusLabels: Record<wb.TaskRun["status"], string> = {
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

export function Workbench() {
  const navigate = useNavigate();
  const { id } = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const { projects, managedSkills, loading, refreshAppData, refreshProjects } = useApp();
  const project = projects.find((p) => p.id === id);
  const [query, setQuery] = useState("");
  const [projectToRemove, setProjectToRemove] = useState<{ id: string; name: string } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [tab, setTab] = useState<"skills" | "runs">("skills");
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({
    queryKey: queryKeys.projects.skills(id ?? ""),
    queryFn: () => api.getProjectSkills(id!),
    enabled: !!id,
  });
  const bindingsQuery = useQuery({
    queryKey: queryKeys.projects.bindings(id ?? ""),
    queryFn: () => wb.projectBindings(id!),
    enabled: !!id,
  });
  const skills = skillsQuery.data ?? [];
  const bindings = bindingsQuery.data ?? [];
  const [selected, setSelected] = useState<ProjectSkill | null>(null);
  const [mutationError, setMutationError] = useState("");
  const queryError = skillsQuery.error ?? bindingsQuery.error;
  const error = mutationError || (queryError ? errText(queryError) : "");
  const setError = setMutationError;
  const [mutating, setMutating] = useState(false);
  const busy = mutating || skillsQuery.isFetching || bindingsQuery.isFetching;
  const [removing, setRemoving] = useState(false);
  const [detailTab, setDetailTab] = useState<"guide" | "source">("guide");
  // Keep the selection pointing at a live skill: the same one if it still
  // exists after a refetch, otherwise the first of the list.
  if (id) {
    const nextSelected = skills.find((v) => v.path === selected?.path) ?? skills[0] ?? null;
    if (nextSelected !== selected) setSelected(nextSelected);
  }
  const documentQuery = useQuery({
    queryKey: queryKeys.projects.skillDocument(
      id ?? "",
      selected ? `${selected.agent}:${selected.relative_path}` : "",
    ),
    queryFn: () => api.getProjectSkillDocument(id!, selected!.relative_path, selected!.agent),
    enabled: !!id && !!selected,
  });
  const document = selected ? (documentQuery.data?.content ?? "") : "";
  const documentError = documentQuery.error ? errText(documentQuery.error) : "";
  const refreshProject = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    // A completed refresh clears prior mutation errors; a failed refetch
    // surfaces through the query error instead.
    setMutationError("");
  }, [queryClient]);
  const wantsWizard = search.new;
  const [prevWantsWizard, setPrevWantsWizard] = useState(wantsWizard);
  if (prevWantsWizard !== wantsWizard) {
    setPrevWantsWizard(wantsWizard);
    if (wantsWizard) setWizard(true);
  }
  useEffect(() => {
    if (search.new) {
      void navigate({ to: ".", search: {}, replace: true });
    }
  }, [search, navigate]);
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setTab("skills");
    setSelected(null);
    setQuery("");
    setError("");
  }
  useEffect(() => {
    if (id)
      try {
        localStorage.setItem("workbench.recentProject", id);
        const recent = JSON.parse(localStorage.getItem("workbench.projectOpened") || "{}");
        recent[id] = Date.now();
        localStorage.setItem("workbench.projectOpened", JSON.stringify(recent));
        window.dispatchEvent(new Event("workbench-project-opened"));
      } catch {
        /* optional preference */
      }
  }, [id]);
  async function removeSelected() {
    if (!selected || !id) return;
    setMutating(true);
    try {
      await api.deleteProjectSkill(id, selected.relative_path, selected.agent);
      setRemoving(false);
      await refreshProject();
      await refreshAppData();
    } catch (e) {
      setError(errText(e));
    } finally {
      setMutating(false);
    }
  }
  async function moveProject(projectId: string, direction: -1 | 1) {
    if (reordering) return;
    const projectSlots = projects
      .map((item, index) => (item.workspace_type === "project" ? index : -1))
      .filter((index) => index >= 0);
    const current = projectSlots.findIndex((index) => projects[index].id === projectId);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= projectSlots.length) return;
    const order = projects.map((item) => item.id);
    const from = projectSlots[current],
      to = projectSlots[target];
    [order[from], order[to]] = [order[to], order[from]];
    setReordering(true);
    setError("");
    try {
      await api.reorderProjects(order);
      await refreshProjects();
    } catch (error) {
      setError(errText(error));
    } finally {
      setReordering(false);
    }
  }
  const filteredProjects = projects.filter(
    (p) =>
      p.workspace_type === "project" &&
      `${p.name} ${p.path}`.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredSkills = skills.filter((s) =>
    `${s.name} ${s.description || ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const binding = selected
    ? bindings.find((b) => b.skill_id === selected.center_skill_id && b.agent === selected.agent)
    : null;
  return (
    <div className={`wb-page ${styles.page}`}>
      <PageHeader
        title={id ? project?.name || "项目工作台" : "项目"}
        description={id ? project?.path : "选择项目，添加需要的全局技能。"}
        count={id ? skills.length : projects.filter((p) => p.workspace_type === "project").length}
        actions={
          <Button variant="primary" onClick={() => setWizard(true)}>
            <Plus size={16} />
            {id ? "从技能库添加" : "新建 / 导入项目"}
          </Button>
        }
      />
      {error && (
        <div className="wb-error" role="alert">
          {error}
          <Button
            onClick={() => {
              if (id) void refreshProject();
              else
                void refreshProjects()
                  .then(() => setError(""))
                  .catch((error) => setError(errText(error)));
            }}
          >
            重新读取
          </Button>
        </div>
      )}
      {loading ? (
        <div className="wb-empty">
          <Loader2 className="animate-spin" />
          正在读取项目…
        </div>
      ) : id && !project ? (
        <div className="wb-empty">
          未找到此项目。<Link to="/projects">返回我的项目</Link>
        </div>
      ) : !id ? (
        <>
          <div className="wb-section-heading">
            <h2 className="sr-only">项目列表</h2>
            <label className="wb-search">
              <Search size={16} />
              <input
                aria-label="搜索项目"
                placeholder="搜索项目或路径"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          {!filteredProjects.length ? (
            <div className="wb-empty">
              <FolderOpen size={36} />
              <h3>{query ? "没有匹配的项目" : "创建你的第一个项目"}</h3>
              <p>
                {query
                  ? "尝试其他项目名称，或清除搜索查看全部项目。"
                  : "选择工作目录，再从全局技能库添加需要的技能。"}
              </p>
              {query && <Button onClick={() => setQuery("")}>清除搜索</Button>}
            </div>
          ) : (
            <div className={styles.projectGrid}>
              {filteredProjects.map((p) => (
                <article className={styles.projectCard} key={p.id}>
                  <div className="wb-card-top">
                    <span className="wb-folder">
                      <Folder size={22} />
                    </span>
                    <CardActionMenu
                      label={`管理 ${p.name}`}
                      actions={[
                        {
                          key: "up",
                          label: "上移",
                          icon: <ArrowUp size={14} />,
                          disabled:
                            reordering ||
                            projects.filter((item) => item.workspace_type === "project")[0]?.id ===
                              p.id,
                          onSelect: () => void moveProject(p.id, -1),
                        },
                        {
                          key: "down",
                          label: "下移",
                          icon: <ArrowDown size={14} />,
                          disabled:
                            reordering ||
                            projects.filter((item) => item.workspace_type === "project").at(-1)
                              ?.id === p.id,
                          onSelect: () => void moveProject(p.id, 1),
                        },
                        {
                          key: "remove",
                          label: "移除项目登记",
                          icon: <Trash2 size={14} />,
                          danger: true,
                          disabled: reordering,
                          onSelect: () => setProjectToRemove(p),
                        },
                      ]}
                    />
                  </div>
                  <Link className={styles.projectOpen} to="/project/$id" params={{ id: p.id }}>
                    <h3>{p.name}</h3>
                    <p title={p.path}>{p.path}</p>
                    <footer>
                      <span>{p.skill_count} 个项目技能</span>
                      <span>
                        打开项目 <ChevronRight size={14} />
                      </span>
                    </footer>
                  </Link>
                </article>
              ))}
            </div>
          )}
          <p className={styles.libraryHint}>
            技能在全局统一维护。
            <Link to="/library">
              查看 {managedSkills.length} 个全局技能 <ArrowUpRight size={14} />
            </Link>
          </p>
        </>
      ) : (
        <>
          <div className="wb-project-tools">
            <Link to="/projects" className="wb-muted wb-back">
              <ArrowLeft size={15} />
              所有项目
            </Link>
            <CardActionMenu
              label="项目更多操作"
              actions={[
                {
                  key: "discover",
                  label: "发现技能",
                  icon: <Search size={14} />,
                  onSelect: () => navigate({ to: "/install", search: { project: id } }),
                },
                {
                  key: "advanced",
                  label: "高级管理",
                  icon: <Folder size={14} />,
                  onSelect: () => navigate({ to: "/project/$id/advanced", params: { id } }),
                },
              ]}
            />
          </div>
          <div className="wb-tabs">
            <button
              aria-pressed={tab === "skills"}
              className={tab === "skills" ? "active" : ""}
              onClick={() => setTab("skills")}
            >
              项目技能 <span>{skills.length}</span>
            </button>
            <button
              aria-pressed={tab === "runs"}
              className={tab === "runs" ? "active" : ""}
              onClick={() => setTab("runs")}
            >
              运行记录
            </button>
          </div>
          {tab === "runs" ? (
            <RunPanel
              key={id}
              projectId={id}
              skills={skills}
              initialSkillId={selected?.agent === "codex" ? selected?.center_skill_id : null}
            />
          ) : (
            <>
              <div className="wb-notice">
                这里展示项目目录中的技能。CLI 还可能发现全局环境技能。
                <Link to="/global-workspace">
                  查看全局环境{" "}
                  <ArrowUpRight size={14} aria-hidden className="inline align-[-2px]" />
                </Link>
              </div>
              <div className={`wb-workspace ${styles.workspace}`}>
                <section className="wb-skill-list">
                  <label className="wb-search">
                    <Search size={16} />
                    <input
                      aria-label="搜索项目技能"
                      placeholder="搜索项目技能"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  {busy && <p className="wb-muted">正在读取…</p>}
                  {!busy && !filteredSkills.length && (
                    <div className="wb-empty">
                      <Plus size={28} />
                      <h3>{query ? "没有匹配的技能" : "为项目添加技能"}</h3>
                      <p>
                        {query
                          ? "试试其他关键词，或清除搜索。"
                          : "从全局技能库选择，原文件持续统一维护。"}
                      </p>
                      {query && <Button onClick={() => setQuery("")}>清除搜索</Button>}
                    </div>
                  )}
                  {filteredSkills.map((s) => (
                    <button
                      aria-pressed={selected?.path === s.path}
                      className={`wb-skill-row ${selected?.path === s.path ? "selected" : ""}`}
                      key={s.path}
                      onClick={() => {
                        setSelected(s);
                        setRemoving(false);
                      }}
                    >
                      <div>
                        <strong>{s.name}</strong>
                        <span>{s.description || "打开查看中文用法和原始文档"}</span>
                        <small>
                          {s.agent_display_name} ·{" "}
                          {bindings.find(
                            (b) => b.skill_id === s.center_skill_id && b.agent === s.agent,
                          )?.mode === "symlink"
                            ? "链接自技能库"
                            : s.in_center
                              ? "技能库关联"
                              : "项目本地技能"}
                        </small>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </section>
                <section className="wb-detail">
                  {!selected ? (
                    <div className="wb-empty">选中技能，查看它的用途与使用方式。</div>
                  ) : (
                    <>
                      <div className={`wb-detail-heading ${styles.detailHeading}`}>
                        <span className="wb-pill">
                          {binding?.mode === "symlink"
                            ? "共享链接"
                            : binding?.mode === "copy"
                              ? "项目副本"
                              : selected.agent_display_name}
                        </span>
                        <h2>{selected.name}</h2>
                        <p className="wb-muted">{selected.description}</p>
                        <button
                          className="ds-button ds-button-secondary"
                          onClick={() => setTab("runs")}
                        >
                          <Play size={15} />
                          使用此技能运行
                        </button>
                      </div>
                      <div className="wb-tabs">
                        <button
                          aria-pressed={detailTab === "guide"}
                          className={detailTab === "guide" ? "active" : ""}
                          onClick={() => setDetailTab("guide")}
                        >
                          中文用法
                        </button>
                        <button
                          aria-pressed={detailTab === "source"}
                          className={detailTab === "source" ? "active" : ""}
                          onClick={() => setDetailTab("source")}
                        >
                          原始文档
                        </button>
                      </div>
                      <div className="wb-detail-content">
                        {detailTab === "guide" ? (
                          selected.center_skill_id ? (
                            <ChineseGuide
                              skillId={selected.center_skill_id}
                              projectId={id}
                              skillRelativePath={selected.relative_path}
                              agent={selected.agent}
                            />
                          ) : (
                            <div className="wb-notice">
                              这是项目本地技能。请先在高级管理中导入技能库，再生成中文说明。
                              <Link to="/project/$id/advanced" params={{ id }}>
                                打开高级管理{" "}
                                <ArrowUpRight
                                  size={14}
                                  aria-hidden
                                  className="inline align-[-2px]"
                                />
                              </Link>
                            </div>
                          )
                        ) : documentError ? (
                          <p className="wb-error">{documentError}</p>
                        ) : document ? (
                          <div className="wb-markdown">
                            <Streamdown plugins={{ cjk }} components={documentComponents}>
                              {document}
                            </Streamdown>
                          </div>
                        ) : (
                          <p className="wb-muted">正在读取文档…</p>
                        )}
                      </div>
                      <footer className="wb-detail-footer">
                        <span className="wb-small wb-muted">
                          {binding?.mode === "symlink"
                            ? "链接内容随技能库更新。"
                            : "项目目录中的技能文件。"}
                        </span>
                        {!removing ? (
                          <button className="wb-text-danger" onClick={() => setRemoving(true)}>
                            移出项目
                          </button>
                        ) : (
                          <div className="wb-remove-confirm" role="alert">
                            <p>
                              {binding?.mode === "symlink"
                                ? "仅移除项目链接，保留技能库原文件。确认继续？"
                                : "将删除这个项目中的技能副本或本地文件，技能库原文件保留。确认继续？"}
                            </p>
                            <button className="wb-btn" onClick={() => setRemoving(false)}>
                              取消
                            </button>
                            <button
                              className="wb-btn wb-danger"
                              disabled={busy}
                              onClick={() => void removeSelected()}
                            >
                              确认移出
                            </button>
                          </div>
                        )}
                      </footer>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!projectToRemove}
        title="移除项目登记"
        message={`将从工作台移除“${projectToRemove?.name || ""}”的登记。实际项目目录、技能文件及全局技能库均保留。`}
        confirmLabel="移除登记"
        onClose={() => setProjectToRemove(null)}
        onConfirm={async () => {
          if (!projectToRemove) return;
          await api.removeProject(projectToRemove.id);
          await refreshProjects();
        }}
      />
      {wizard && (
        <ProjectWizard
          projectId={id}
          onClose={() => setWizard(false)}
          onDone={async () => {
            await refreshAppData();
            await refreshProject();
          }}
        />
      )}
    </div>
  );
}

function ProjectWizard({
  projectId,
  onClose,
  onDone,
}: {
  projectId?: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { managedSkills, presets, tools } = useApp();
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  const [createDirectory, setCreateDirectory] = useState(false);
  const [agent, setAgent] = useState("codex");
  const mode = "symlink";
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    projectId: string;
    results: wb.DeployResult[];
  } | null>(null);
  async function browse() {
    try {
      const p = await open({
        directory: true,
        multiple: false,
        title: "选择项目目录",
      });
      if (typeof p === "string") setPath(p);
    } catch (e) {
      setError(errText(e));
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = projectId
        ? {
            project_id: projectId,
            results: await wb.deployWorkbenchSkills(projectId, selected, agent, mode),
          }
        : await wb.createWorkbenchProject(path.trim(), createDirectory, selected, agent, mode);
      await onDone();
      if (res.results.some((r) => !r.ok))
        setResult({ projectId: res.project_id, results: res.results });
      else {
        onClose();
        void navigate({ to: "/project/$id", params: { id: res.project_id } });
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <DetailSheet
      open
      title={projectId ? "添加项目技能" : "准备一个新项目"}
      description="选择全局技能，通过软链接加入项目。"
      closeDisabled={busy}
      onClose={onClose}
    >
      <div className={styles.wizard}>
        {error && (
          <div role="alert" className="wb-error">
            {error}
          </div>
        )}
        {result ? (
          <div>
            <h3>项目已保存，部分技能未添加</h3>
            {result.results.map((r) => (
              <p className={r.ok ? "wb-muted" : "wb-error"} key={r.skill_id}>
                {managedSkills.find((s) => s.id === r.skill_id)?.name || r.skill_id}：
                {r.ok ? "已添加" : r.error || "添加失败"}
              </p>
            ))}
          </div>
        ) : (
          <>
            {!projectId && (
              <fieldset disabled={busy}>
                <legend>01 · 项目位置</legend>
                <label htmlFor="project-path">项目目录</label>
                <div className="wb-input-row">
                  <input
                    id="project-path"
                    autoFocus
                    placeholder="输入绝对路径，或选择已有目录"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                  />
                  <button className="wb-btn" onClick={() => void browse()}>
                    <FolderOpen size={16} />
                    选择目录
                  </button>
                </div>
                <label className="wb-check">
                  <input
                    type="checkbox"
                    checked={createDirectory}
                    onChange={(e) => setCreateDirectory(e.target.checked)}
                  />
                  目录不存在时创建新目录
                </label>
              </fieldset>
            )}
            <fieldset disabled={busy}>
              <legend>{projectId ? "01" : "02"} · 执行工具与部署方式</legend>
              <label htmlFor="project-agent">技能将被添加到此工具的项目目录</label>
              <select id="project-agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
                <option value="codex">Codex（推荐）</option>
                {tools
                  .filter((t) => t.key !== "codex" && t.project_relative_skills_dir)
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.display_name}
                    </option>
                  ))}
              </select>
              <p className="wb-muted">
                通过软链接引用全局技能，不创建副本。全局更新会同步体现到项目；移出项目不会删除全局源文件。
              </p>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>
                {projectId ? "02" : "03"} · 选择技能{" "}
                <span className="wb-muted">已选 {selected.length} 个</span>
              </legend>
              {presets.length > 0 && (
                <div className="wb-presets">
                  {presets.map((p) => (
                    <button
                      className="wb-btn"
                      key={p.id}
                      onClick={() =>
                        setSelected((prev) => [
                          ...new Set([
                            ...prev,
                            ...managedSkills
                              .filter((s) => s.preset_ids.includes(p.id))
                              .map((s) => s.id),
                          ]),
                        ])
                      }
                    >
                      <Plus size={14} aria-hidden /> {p.name}
                    </button>
                  ))}
                </div>
              )}
              <label className="wb-search">
                <Search size={16} />
                <input
                  aria-label="筛选技能库"
                  placeholder="搜索技能库"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="wb-pick-skills">
                {managedSkills
                  .filter((s) =>
                    `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((s) => (
                    <label className="wb-pick-row" key={s.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((v) => v !== s.id),
                          )
                        }
                      />
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.description || "暂无用途说明"}</small>
                      </span>
                    </label>
                  ))}
                {!managedSkills.length && (
                  <p className="wb-muted">技能库为空。可以先创建项目，再前往技能库导入。</p>
                )}
              </div>
            </fieldset>
          </>
        )}
        <footer className={styles.wizardFooter}>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          {result ? (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                void navigate({ to: "/project/$id", params: { id: result.projectId } });
              }}
            >
              查看项目
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                busy || (!projectId && !path.trim()) || Boolean(projectId && !selected.length)
              }
              onClick={() => void submit()}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{" "}
              {busy ? "正在配置…" : projectId ? "添加所选技能" : "创建并配置项目"}
            </Button>
          )}
        </footer>
      </div>
    </DetailSheet>
  );
}

function RunPanel({
  projectId,
  skills,
  initialSkillId,
}: {
  projectId: string;
  skills: ProjectSkill[];
  initialSkillId: string | null;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>(initialSkillId ? [initialSkillId] : []);
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const tasksQuery = useQuery({
    queryKey: queryKeys.projects.tasks(projectId),
    queryFn: () => wb.listTasks(projectId),
    // Poll only while a run is active — same 1.5s cadence as the old interval.
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "running") ? 1500 : false,
  });
  const runs = tasksQuery.data ?? [];
  const runnerQuery = useQuery({
    queryKey: queryKeys.workbench.runnerStatus(),
    queryFn: wb.runnerStatus,
  });
  const runner = runnerQuery.data ?? null;
  // Default to the newest run once the history arrives.
  if (!selected && runs.length > 0) setSelected(runs[0].id);
  const active = runs.some((r) => r.status === "running");
  const logQuery = useQuery({
    queryKey: queryKeys.workbench.taskLog(selected ?? ""),
    queryFn: () => wb.getTaskLog(selected!),
    enabled: !!selected,
    refetchInterval: active ? 1500 : false,
  });
  const log = logQuery.data ?? "";
  const logLoading = !!selected && logQuery.isLoading;
  const historyLoading = tasksQuery.isLoading;
  const queryError = tasksQuery.error ?? runnerQuery.error ?? logQuery.error;
  const error = mutationError || (queryError ? errText(queryError) : "");
  const setError = setMutationError;
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.tasks(projectId) });
  }, [queryClient, projectId]);
  async function start() {
    if (busy || active || !prompt.trim() || !runner?.available) return;
    setBusy(true);
    setError("");
    try {
      const run = await wb.startTask(projectId, prompt, skillIds);
      setSelected(run.id);
      await refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!selected || busy) return;
    setError("");
    setBusy(true);
    try {
      await wb.cancelTask(selected);
      await refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  const current = runs.find((r) => r.id === selected);
  const availableSkills = skills.filter(
    (s, i, a) =>
      s.center_skill_id &&
      s.agent === "codex" &&
      a.findIndex((x) => x.center_skill_id === s.center_skill_id && x.agent === "codex") === i,
  );
  return (
    <div className="wb-run-layout">
      <section className="wb-run-compose">
        <div className="wb-section-heading">
          <h2>开始任务</h2>
          <span className="wb-pill">Codex CLI</span>
        </div>
        <p className="wb-muted">任务在当前项目目录运行。选中的技能作为本次任务的使用要求。</p>
        {runner && !runner.available && (
          <div className="wb-error">
            {runner.error || "未找到 Codex CLI。请先安装并登录 Codex，或在设置中指定路径。"}
            <Link to="/settings">
              打开设置 <ArrowUpRight size={14} aria-hidden className="inline align-[-2px]" />
            </Link>
          </div>
        )}
        {runner?.available && (
          <p className="wb-small wb-muted">已连接 {runner.version || runner.executable}</p>
        )}
        {error && (
          <p role="alert" className="wb-error">
            {error}
          </p>
        )}
        <label className="wb-label" htmlFor="task-prompt">
          你想完成什么？
        </label>
        <textarea
          disabled={busy}
          id="task-prompt"
          placeholder="例如：阅读这个项目，帮我检查最近修改中的潜在问题，并给出中文说明。"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
        />
        <p className="wb-label">本次请求使用的技能（可选）</p>
        <div className="wb-run-skills">
          {availableSkills.map((s) => (
            <label className="wb-check" key={s.path}>
              <input
                disabled={busy}
                type="checkbox"
                checked={skillIds.includes(s.center_skill_id!)}
                onChange={(e) =>
                  setSkillIds((prev) =>
                    e.target.checked
                      ? [...prev, s.center_skill_id!]
                      : prev.filter((v) => v !== s.center_skill_id),
                  )
                }
              />
              {s.name}
            </label>
          ))}
          {!availableSkills.length && (
            <p className="wb-muted wb-small">
              暂未发现关联到技能库的 Codex 项目技能。可先添加技能或直接提交任务。
            </p>
          )}
        </div>
        <Button
          variant="primary"
          busy={busy}
          disabled={busy || active || !prompt.trim() || !runner?.available}
          onClick={() => void start()}
        >
          <Play size={15} />
          {busy ? "正在处理…" : active ? "当前项目任务运行中" : "开始任务"}
        </Button>
        <p className="wb-small wb-muted">
          CLI 可能调用在线模型。实际技能使用情况请以运行输出为准。
        </p>
      </section>
      <section className="wb-run-output">
        <div className="wb-section-heading">
          <h2>运行记录</h2>
          <Button
            busy={historyLoading}
            onClick={() => void refresh().catch((e) => setError(errText(e)))}
          >
            刷新
          </Button>
        </div>
        {historyLoading && !runs.length ? (
          <p role="status" className="wb-muted">
            正在读取运行记录…
          </p>
        ) : !runs.length ? (
          <div className="wb-empty">
            <Terminal size={28} />
            <p>提交任务后，输出和运行记录将显示在这里。</p>
          </div>
        ) : (
          <>
            <select
              aria-label="选择运行记录"
              value={selected || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {runs.map((r) => (
                <option value={r.id} key={r.id}>
                  {statusLabels[r.status]} · {r.prompt.slice(0, 44)}
                </option>
              ))}
            </select>
            <div className="wb-run-status" role="status">
              <span className="wb-pill">{current && statusLabels[current.status]}</span>
              {current && (
                <span className="wb-small wb-muted">
                  {new Date(
                    current.created_at < 1e12 ? current.created_at * 1000 : current.created_at,
                  ).toLocaleString("zh-CN")}
                </span>
              )}
              {current?.status === "running" && (
                <button className="wb-text-danger" disabled={busy} onClick={() => void cancel()}>
                  停止任务
                </button>
              )}
            </div>
            {current?.error && <p className="wb-error">{current.error}</p>}
            <TaskOutput
              key={current?.id}
              log={log}
              loading={logLoading}
              running={current?.status === "running"}
              createdAt={current?.created_at}
              stopping={busy}
              onStop={current?.status === "running" ? () => void cancel() : undefined}
            />
          </>
        )}
      </section>
    </div>
  );
}
