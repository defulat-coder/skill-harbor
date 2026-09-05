import { LoadingState } from "./ui/LoadingState";
import { Button } from "./ui/Button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getSettings, setSettings } from "../lib/tauri";
import { queryKeys } from "../lib/queryKeys";
import { getErrorMessage } from "../lib/error";
import styles from "./RunnerSettings.module.css";

export function RunnerSettings() {
  const [path, setPath] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.value("workbench_runner"),
    queryFn: async () => {
      const [p, m] = await Promise.all([
        getSettings("workbench_codex_path"),
        getSettings("workbench_codex_model"),
      ]);
      return { path: p ?? "", model: m ?? "" };
    },
  });
  const [loaded, setLoaded] = useState(false);
  if (settingsQuery.data && !loaded) {
    setLoaded(true);
    setPath(settingsQuery.data.path);
    setModel(settingsQuery.data.model);
  }
  const loading = settingsQuery.isLoading;
  const loadError = settingsQuery.error
    ? getErrorMessage(settingsQuery.error, "设置读取失败，请重试。")
    : "";
  const error = saveError || loadError;
  const reload = () => {
    setLoaded(false);
    void settingsQuery.refetch();
  };
  async function save() {
    if (busy || !loaded) return;
    setBusy(true);
    setStatus("正在保存并检查 Codex CLI…");
    setSaveError("");
    try {
      await setSettings("workbench_codex_path", path.trim());
      await setSettings("workbench_codex_model", model.trim());
      const result = await invoke<{
        available: boolean;
        version: string | null;
        error: string | null;
      }>("runner_status");
      if (result.available)
        setStatus(
          `设置已保存，已连接 ${result.version ?? "Codex CLI"}。登录状态请在终端运行 codex login status 检查。`,
        );
      else {
        setStatus("");
        setSaveError(`设置已保存，但无法连接：${result.error ?? "未找到 Codex CLI，请检查路径。"}`);
      }
    } catch (e) {
      setStatus("");
      setSaveError(getErrorMessage(e, "保存或连接失败，请检查设置后重试。"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`ds-panel ${styles.panel}`} aria-label="本地执行与中文说明设置">
      <div>
        <h3>Codex CLI</h3>
        <p className={styles.help}>
          使用本机 CLI 执行项目任务和生成中文用法。沿用 CLI 的登录；模型调用可能联网。
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || loading || !loaded} className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="codex-path">可执行文件路径</label>
            <input
              id="codex-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="留空自动查找，或输入 /绝对路径/bin/codex"
              className="app-input w-full"
              aria-describedby="codex-path-help"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p id="codex-path-help" className={styles.help}>
              填写可执行文件的完整路径；留空时从本机环境自动查找。
            </p>
          </div>
          <div className={styles.field}>
            <label htmlFor="codex-model">项目任务模型（可选）</label>
            <input
              id="codex-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="留空沿用 CLI 配置"
              className="app-input w-full"
              aria-describedby="codex-model-help"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p id="codex-model-help" className={styles.help}>
              仅影响工作台的新任务，不修改全局 Codex 配置。中文说明使用 CLI
              默认模型。模型不兼容时，可升级 CLI 或填写兼容模型标识。
            </p>
          </div>
          <Button type="submit" variant="primary">
            {busy ? "正在检查…" : "保存并检查"}
          </Button>
        </fieldset>
      </form>
      {(loading || busy) && (
        <LoadingState label={loading ? "正在读取本地执行设置…" : "正在保存并检查 Codex CLI…"} />
      )}
      {!loading && !busy && (
        <p role="status" className={styles.help}>
          {status}
        </p>
      )}
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {!loading && !loaded && <Button onClick={reload}>重新读取设置</Button>}
      <p className={styles.help}>
        运行记录和中文说明保存在本机。CLI 自身决定可见的全局技能，项目技能列表不代表隔离环境。
      </p>
    </section>
  );
}
