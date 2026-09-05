import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/Button";
import { Disclosure } from "./ui/Disclosure";
import { AgentIcon } from "./AgentIcon";
import { getSettings, setSettings } from "../lib/tauri";
import {
  chatDetectAgents,
  CHAT_AGENT_ID_KEY,
  CHAT_AGENT_MODELS_KEY,
  type DetectedAgent,
} from "../lib/chat";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";
import styles from "./ChatCliSettings.module.css";

const CHAT_AGENT_ENV_KEY = "chat_agent_env";
const CUSTOM_MODEL_VALUE = "__custom__";

type AgentModelChoice = { model?: string; reasoning?: string };
type ModelsMap = Record<string, AgentModelChoice>;
type EnvMap = Record<string, Record<string, string>>;

type EnvHint = "bin" | "baseUrl" | "key";
interface EnvFieldDef {
  key: string;
  secret: boolean;
  hint: EnvHint;
}

// 与后端 src-tauri/src/core/agent_cli/defs.rs 的 bin_env_key / auth env_keys 对应。
const ENV_FIELDS: Record<string, EnvFieldDef[]> = {
  claude: [
    { key: "CLAUDE_BIN", secret: false, hint: "bin" },
    { key: "ANTHROPIC_BASE_URL", secret: false, hint: "baseUrl" },
    { key: "ANTHROPIC_API_KEY", secret: true, hint: "key" },
  ],
  codex: [
    { key: "CODEX_BIN", secret: false, hint: "bin" },
    { key: "OPENAI_BASE_URL", secret: false, hint: "baseUrl" },
    { key: "CODEX_API_KEY", secret: true, hint: "key" },
  ],
  kimi: [
    { key: "KIMI_BIN", secret: false, hint: "bin" },
    { key: "MOONSHOT_API_KEY", secret: true, hint: "key" },
  ],
  opencode: [{ key: "OPENCODE_BIN", secret: false, hint: "bin" }],
  qwen: [
    { key: "QWEN_BIN", secret: false, hint: "bin" },
    { key: "OPENAI_API_KEY", secret: true, hint: "key" },
  ],
  "cursor-agent": [
    { key: "CURSOR_AGENT_BIN", secret: false, hint: "bin" },
    { key: "CURSOR_API_KEY", secret: true, hint: "key" },
  ],
};

// 对话 CLI 的 id 与全局 agent 图标库键名不一致，做个映射。
const AGENT_ICON_KEYS: Record<string, string> = {
  claude: "claude_code",
  qwen: "qwen_code",
  "cursor-agent": "cursor",
};

function jsonEntries(raw: string | null): [string, unknown][] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Reflect.ownKeys(parsed)
      .filter((key): key is string => typeof key === "string")
      .map((key) => {
        const value: unknown = Reflect.get(parsed, key);
        return [key, value];
      });
  } catch {
    return [];
  }
}

function stringProp(obj: object, key: string): string | undefined {
  const value: unknown = Reflect.get(obj, key);
  return typeof value === "string" && value ? value : undefined;
}

function parseModelsMap(raw: string | null): ModelsMap {
  const result: ModelsMap = {};
  for (const [agentId, value] of jsonEntries(raw)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const entry: AgentModelChoice = {};
      const model = stringProp(value, "model");
      const reasoning = stringProp(value, "reasoning");
      if (model) entry.model = model;
      if (reasoning) entry.reasoning = reasoning;
      result[agentId] = entry;
    }
  }
  return result;
}

function parseEnvMap(raw: string | null): EnvMap {
  const result: EnvMap = {};
  for (const [agentId, value] of jsonEntries(raw)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const env: Record<string, string> = {};
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") continue;
        const item: unknown = Reflect.get(value, key);
        if (typeof item === "string" && item) env[key] = item;
      }
      result[agentId] = env;
    }
  }
  return result;
}

export function ChatCliSettings() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modelsMap, setModelsMap] = useState<ModelsMap>({});
  const [envMap, setEnvMap] = useState<EnvMap>({});
  const [envDrafts, setEnvDrafts] = useState<Record<string, Record<string, string>>>({});
  const [customModelDrafts, setCustomModelDrafts] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [actionError, setActionError] = useState("");
  const [envStatus, setEnvStatus] = useState("");
  const [envBusy, setEnvBusy] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["settings", "chat-cli"],
    queryFn: async () => {
      const [id, models, env] = await Promise.all([
        getSettings(CHAT_AGENT_ID_KEY),
        getSettings(CHAT_AGENT_MODELS_KEY),
        getSettings(CHAT_AGENT_ENV_KEY),
      ]);
      return { id, models, env };
    },
  });
  if (settingsQuery.data && !loaded) {
    setLoaded(true);
    setSelectedId(settingsQuery.data.id?.trim() || null);
    setModelsMap(parseModelsMap(settingsQuery.data.models));
    setEnvMap(parseEnvMap(settingsQuery.data.env));
  }

  const agentsQuery = useQuery({
    queryKey: ["settings", "chat-cli-agents"],
    queryFn: () => chatDetectAgents(false),
  });
  const agents = agentsQuery.data ?? [];
  const installed = agents.filter((a) => a.available);
  const notInstalled = agents.filter((a) => !a.available);
  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;
  const initialScanning = agentsQuery.isLoading && !agentsQuery.data;

  const loadError = settingsQuery.error
    ? getErrorMessage(settingsQuery.error, t("settings.chatCli.loadFailed"))
    : "";
  const detectError = agentsQuery.error
    ? getErrorMessage(agentsQuery.error, t("settings.chatCli.detectFailed"))
    : "";
  const error = actionError || loadError || detectError;

  async function rescan() {
    if (rescanning) return;
    setRescanning(true);
    setActionError("");
    try {
      // 先强制刷新 lib/chat 的共享缓存，refetch 随即读到新结果。
      await chatDetectAgents(true);
      await agentsQuery.refetch();
    } catch (e) {
      setActionError(getErrorMessage(e, t("settings.chatCli.detectFailed")));
    } finally {
      setRescanning(false);
    }
  }

  async function selectAgent(id: string) {
    setSelectedId(id);
    setActionError("");
    try {
      await setSettings(CHAT_AGENT_ID_KEY, id);
    } catch (e) {
      setActionError(getErrorMessage(e, t("settings.chatCli.saveFailed")));
    }
  }

  async function saveModelChoice(agentId: string, patch: AgentModelChoice) {
    const next: ModelsMap = {
      ...modelsMap,
      [agentId]: { ...modelsMap[agentId], ...patch },
    };
    setModelsMap(next);
    setActionError("");
    try {
      await setSettings(CHAT_AGENT_MODELS_KEY, JSON.stringify(next));
    } catch (e) {
      setActionError(getErrorMessage(e, t("settings.chatCli.saveFailed")));
    }
  }

  function setEnvDraft(agentId: string, key: string, value: string) {
    setEnvDrafts((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [key]: value },
    }));
  }

  async function saveEnv(agentId: string) {
    if (envBusy) return;
    const drafts = envDrafts[agentId] ?? {};
    const agentEnv = { ...envMap[agentId] };
    for (const [key, value] of Object.entries(drafts)) {
      const trimmed = value.trim();
      if (trimmed) agentEnv[key] = trimmed;
    }
    setEnvBusy(true);
    setEnvStatus(t("settings.chatCli.envSaving"));
    setActionError("");
    try {
      const next: EnvMap = { ...envMap, [agentId]: agentEnv };
      await setSettings(CHAT_AGENT_ENV_KEY, JSON.stringify(next));
      setEnvMap(next);
      setEnvDrafts((prev) => ({ ...prev, [agentId]: {} }));
      // env 变化可能影响路径与登录探测，保存后强制重新检测。
      await chatDetectAgents(true);
      await agentsQuery.refetch();
      setEnvStatus(t("settings.chatCli.envSaved"));
    } catch (e) {
      setEnvStatus("");
      setActionError(getErrorMessage(e, t("settings.chatCli.saveFailed")));
    } finally {
      setEnvBusy(false);
    }
  }

  function authBadge(agent: DetectedAgent) {
    if (!agent.available)
      return <span className={styles.badge}>{t("settings.chatCli.notInstalled")}</span>;
    if (agent.auth_status === "ok")
      return (
        <span className={cn(styles.badge, styles.badgeOk)}>{t("settings.chatCli.authOk")}</span>
      );
    if (agent.auth_status === "missing")
      return (
        <span className={cn(styles.badge, styles.badgeMissing)}>
          {t("settings.chatCli.authMissing")}
        </span>
      );
    return (
      <span className={cn(styles.badge, styles.badgeUnknown)}>
        {t("settings.chatCli.authUnknown")}
      </span>
    );
  }

  function renderCard(agent: DetectedAgent) {
    const selected = agent.id === selectedId;
    return (
      <div
        key={agent.id}
        className={cn(
          styles.card,
          selected && styles.cardActive,
          !agent.available && styles.cardUnavailable,
        )}
      >
        <button
          type="button"
          className={styles.cardSelect}
          aria-pressed={selected}
          onClick={() => void selectAgent(agent.id)}
        >
          <AgentIcon
            agentKey={AGENT_ICON_KEYS[agent.id] ?? agent.id}
            displayName={agent.name}
            className="h-8 w-8"
          />
          <span className={styles.cardBody}>
            <span className={styles.cardTitleRow}>
              <span className={styles.cardName}>{agent.name}</span>
              {authBadge(agent)}
              {selected && (
                <span className={cn(styles.badge, styles.badgeSelected)}>
                  {t("settings.chatCli.selectedBadge")}
                </span>
              )}
            </span>
            <span className={styles.cardMeta}>
              {agent.available
                ? [agent.version, agent.path].filter(Boolean).join(" · ")
                : t("settings.chatCli.notInstalled")}
            </span>
          </span>
        </button>
        {selected && renderConfig(agent)}
      </div>
    );
  }

  function renderConfig(agent: DetectedAgent) {
    const choice = modelsMap[agent.id] ?? {};
    const modelIds = new Set(agent.models.map((m) => m.id));
    const currentModel = choice.model ?? "default";
    const isCustomModel = !modelIds.has(currentModel) && agent.supports_custom_model;
    const selectValue = isCustomModel ? CUSTOM_MODEL_VALUE : currentModel;
    const customDraft = customModelDrafts[agent.id] ?? (isCustomModel ? currentModel : "");
    const envFields = ENV_FIELDS[agent.id] ?? [];
    const agentDrafts = envDrafts[agent.id] ?? {};
    const hasEnvDraft = envFields.some((f) => (agentDrafts[f.key] ?? "").trim() !== "");
    const needsAttention = !agent.available || agent.auth_status === "missing";
    return (
      <div className={styles.config}>
        {needsAttention && (
          <p role="alert" className={styles.warning}>
            {agent.auth_message ||
              (agent.available
                ? t("settings.chatCli.authMissingHint")
                : t("settings.chatCli.notInstalledHint"))}
          </p>
        )}
        <div className={styles.field}>
          <label htmlFor={`chat-model-${agent.id}`}>{t("settings.chatCli.modelLabel")}</label>
          <select
            id={`chat-model-${agent.id}`}
            value={selectValue}
            onChange={(e) => {
              const value = e.target.value;
              if (value === CUSTOM_MODEL_VALUE) {
                setCustomModelDrafts((prev) => ({
                  ...prev,
                  [agent.id]: isCustomModel ? currentModel : "",
                }));
              } else {
                void saveModelChoice(agent.id, { model: value });
              }
            }}
          >
            {agent.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {!modelIds.has(currentModel) && !agent.supports_custom_model && (
              <option value={currentModel}>{currentModel}</option>
            )}
            {agent.supports_custom_model && (
              <option value={CUSTOM_MODEL_VALUE}>{t("settings.chatCli.modelCustom")}</option>
            )}
          </select>
          {agent.supports_custom_model && selectValue === CUSTOM_MODEL_VALUE && (
            <input
              value={customDraft}
              onChange={(e) =>
                setCustomModelDrafts((prev) => ({ ...prev, [agent.id]: e.target.value }))
              }
              onBlur={() => {
                const value = customDraft.trim();
                if (value && value !== currentModel)
                  void saveModelChoice(agent.id, { model: value });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder={t("settings.chatCli.modelCustomPlaceholder")}
              className="app-input w-full"
              autoCapitalize="none"
              spellCheck={false}
              aria-label={t("settings.chatCli.modelCustomPlaceholder")}
            />
          )}
          <p className={styles.help}>{t("settings.chatCli.modelHelp")}</p>
        </div>
        {agent.reasoning_options.length > 0 && (
          <div className={styles.field}>
            <label htmlFor={`chat-reasoning-${agent.id}`}>
              {t("settings.chatCli.reasoningLabel")}
            </label>
            <select
              id={`chat-reasoning-${agent.id}`}
              value={choice.reasoning ?? "default"}
              onChange={(e) => void saveModelChoice(agent.id, { reasoning: e.target.value })}
            >
              {agent.reasoning_options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {envFields.length > 0 && (
          <Disclosure title={t("settings.chatCli.advancedTitle")}>
            <div className={styles.envFields}>
              <p className={styles.help}>{t("settings.chatCli.advancedHelp")}</p>
              {envFields.map((field) => {
                const saved = Boolean(envMap[agent.id]?.[field.key]);
                return (
                  <div key={field.key} className={styles.field}>
                    <label htmlFor={`chat-env-${agent.id}-${field.key}`}>{field.key}</label>
                    <input
                      id={`chat-env-${agent.id}-${field.key}`}
                      type={field.secret ? "password" : "text"}
                      value={agentDrafts[field.key] ?? ""}
                      onChange={(e) => setEnvDraft(agent.id, field.key, e.target.value)}
                      placeholder={
                        saved
                          ? t("settings.chatCli.envSavedPlaceholder")
                          : t(`settings.chatCli.envPlaceholder_${field.hint}`)
                      }
                      className="app-input w-full"
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className={styles.help}>{t(`settings.chatCli.envHint_${field.hint}`)}</p>
                  </div>
                );
              })}
              <div className={styles.envActions}>
                <Button
                  variant="primary"
                  disabled={!hasEnvDraft || envBusy}
                  onClick={() => void saveEnv(agent.id)}
                >
                  {envBusy ? t("settings.chatCli.envSaving") : t("settings.chatCli.saveEnv")}
                </Button>
              </div>
            </div>
          </Disclosure>
        )}
      </div>
    );
  }

  return (
    <section className={`ds-panel ${styles.panel}`} aria-label={t("settings.chatCli.title")}>
      <div className={styles.head}>
        <div>
          <h3>{t("settings.chatCli.title")}</h3>
          <p className={styles.help}>{t("settings.chatCli.help")}</p>
        </div>
        <Button onClick={() => void rescan()} disabled={rescanning || initialScanning}>
          <RefreshCw className={cn("h-3.5 w-3.5", rescanning && "animate-spin")} aria-hidden />
          {rescanning ? t("settings.chatCli.rescanning") : t("settings.chatCli.rescan")}
        </Button>
      </div>
      {initialScanning ? (
        <div className={styles.grid} role="status" aria-label={t("settings.chatCli.detecting")}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeletonCard} aria-hidden />
          ))}
          <span className={styles.visuallyHidden}>{t("settings.chatCli.detecting")}</span>
        </div>
      ) : agents.length === 0 && !detectError ? (
        <p className={styles.help}>{t("settings.chatCli.empty")}</p>
      ) : (
        <>
          {installed.length > 0 && (
            <div>
              <h4 className={styles.groupTitle}>
                {t("settings.chatCli.groupInstalled", { count: installed.length })}
              </h4>
              <div className={styles.grid}>{installed.map(renderCard)}</div>
            </div>
          )}
          {notInstalled.length > 0 && (
            <div>
              <h4 className={styles.groupTitle}>
                {t("settings.chatCli.groupNotInstalled", { count: notInstalled.length })}
              </h4>
              <div className={styles.grid}>{notInstalled.map(renderCard)}</div>
            </div>
          )}
        </>
      )}
      {selectedAgent === null && loaded && !initialScanning && (
        <p className={styles.help}>{t("settings.chatCli.noSelection")}</p>
      )}
      {!envBusy && (
        <p role="status" className={styles.help}>
          {envStatus}
        </p>
      )}
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <Button
            onClick={() => {
              setLoaded(false);
              void settingsQuery.refetch();
              void agentsQuery.refetch();
            }}
          >
            {t("settings.chatCli.retry")}
          </Button>
        </div>
      )}
    </section>
  );
}
