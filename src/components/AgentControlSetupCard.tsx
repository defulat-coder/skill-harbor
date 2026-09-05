import { LoadingState } from "./ui/LoadingState";
import { Button } from "./ui/Button";
import { Disclosure } from "./ui/Disclosure";
import styles from "./AgentControlSetupCard.module.css";
import { useEffect, useMemo, useState } from "react";
import { Terminal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "../context/AppContext";
import { getErrorMessage } from "../lib/error";
import * as api from "../lib/tauri";
import { AgentIcon } from "./AgentIcon";

/** Dismissal flag, same shape as the backup first-run prompt. */
const PROMPT_SETTING_KEY = "agent_control_setup_prompt";

/** The library skill that teaches an agent to drive SkillHarbor. */
const SKILL_NAME = "manage-skills";
// Clone source for the manage-skills skill, as the GitHub shorthand the
// backend expands to a full URL. The old upstream path was dropped in the
// SkillHarbor rebrand; point this at the renamed repository once published.
const SKILL_SOURCE = "skillharbor/skillharbor";

/**
 * One-time pointer to a capability nothing else advertises: an agent can drive
 * the library itself. It exists only because the skill is undiscoverable, not
 * because managing it needs a home of its own — once the skill is in the
 * library, adding or removing agents is the agent badge row on its card, and
 * a second control for the same state would be a second signal for it.
 *
 * So this renders only while the skill is absent, and never again afterwards.
 */
export function AgentControlSetupCard() {
  const { t } = useTranslation();
  const { tools, managedSkills, loading, refreshManagedSkills } = useApp();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  /**
   * Deliberately empty: pre-ticking every installed agent would make one click
   * deploy this skill everywhere, which is the automatic full deployment the
   * product does not do — and it would put the same 267-line document into
   * every agent's context, in an app whose whole job is managing that context.
   */
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const alreadyInstalled = useMemo(
    () => managedSkills.some((skill) => skill.name === SKILL_NAME),
    [managedSkills],
  );

  const candidates = useMemo(
    () => tools.filter((tool) => tool.installed && tool.enabled),
    [tools],
  );

  useEffect(() => {
    void api
      .getSettings(PROMPT_SETTING_KEY)
      .catch(() => null)
      .then((flag) => setDismissed(Boolean(flag)));
  }, []);

  if (
    loading ||
    dismissed === null ||
    dismissed ||
    (alreadyInstalled && !error && !busy)
  )
    return null;

  const dismiss = async () => {
    if (busy) return;
    try {
      await api.setSettings(PROMPT_SETTING_KEY, "dismissed");
      setDismissed(true);
    } catch (e) {
      setError(getErrorMessage(e, "无法保存隐藏状态，请重试。"));
    }
  };

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );

  const enable = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);
    setError("");
    try {
      if (!alreadyInstalled) await api.installGit(SKILL_SOURCE);
      const skills = await api.getManagedSkills();
      const installed = skills.find((skill) => skill.name === SKILL_NAME);
      if (!installed) {
        throw new Error(t("agentControl.errorNotFound"));
      }
      const failures: string[] = [];
      const failedKeys: string[] = [];
      for (const key of selected) {
        try {
          await api.syncSkillToTool(installed.id, key);
        } catch (e) {
          failedKeys.push(key);
          failures.push(`${key}: ${getErrorMessage(e, "同步失败")}`);
        }
      }
      if (failures.length) {
        setSelected(failedKeys);
        throw new Error(
          `已完成 ${selected.length - failedKeys.length} 个工具，${failedKeys.length} 个失败。重试只处理失败项。${failures.join("；")}`,
        );
      }
      toast.success(t("agentControl.done", { count: selected.length }));
      await api.setSettings(PROMPT_SETTING_KEY, "installed").catch(() => {});
    } catch (e) {
      const message = getErrorMessage(e, t("agentControl.errorGeneric"));
      setError(message);
      toast.error(message);
    } finally {
      // Also on failure: the skill may already be in the library with only
      // some agents deployed, and leaving the card up would send the user
      // back through `installGit` on the next click.
      try {
        await refreshManagedSkills();
      } catch (e) {
        setError(
          getErrorMessage(e, "刷新技能列表失败，请重新打开页面查看结果。"),
        );
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div className={`ds-panel ${styles.panel}`}>
      <div className={styles.layout}>
        <div className="mt-0.5 rounded-md border border-border-subtle bg-accent-bg p-2 text-accent-light">
          <Terminal className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-primary">
            {t("agentControl.title")}
          </h3>
          <p className="mt-0.5 text-[12px] leading-5 text-muted">
            {t("agentControl.body")}
          </p>

          <Disclosure
            title={t("agentControl.pickAgents")}
            open={expanded}
            onOpenChange={setExpanded}
          >
            <div className="mt-3">
              {candidates.length === 0 && (
                <p className={styles.message}>
                  没有可用工具，请先在设置中启用已安装的工具。
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((tool) => {
                  const on = selected.includes(tool.key);
                  return (
                    <Button
                      key={tool.key}
                      aria-pressed={on}
                      onClick={() => toggle(tool.key)}
                      disabled={busy}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-150 disabled:opacity-50 ${
                        on
                          ? "border-accent bg-accent-bg text-accent"
                          : "border-border-subtle bg-surface-active text-muted"
                      }`}
                    >
                      <AgentIcon
                        agentKey={tool.key}
                        displayName={tool.display_name}
                        className="h-4 w-4 rounded-[4px]"
                      />
                      {tool.display_name}
                    </Button>
                  );
                })}
              </div>
            </div>
          </Disclosure>
          {busy && <LoadingState label="正在安装并同步技能…" />}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          {expanded ? (
            <Button
              onClick={enable}
              disabled={busy || selected.length === 0}
              className="app-button-primary h-[34px] disabled:opacity-50"
            >
              {selected.length === 0
                ? t("agentControl.confirmEmpty")
                : t("agentControl.confirm", { count: selected.length })}
            </Button>
          ) : (
            <Button
              onClick={() => setExpanded(true)}
              className="app-button-secondary h-[34px]"
            >
              {t("agentControl.cta")}
            </Button>
          )}
          <Button
            disabled={busy}
            aria-label={t("agentControl.dismiss")}
            onClick={dismiss}
            title={t("agentControl.dismiss")}
            className="rounded-md p-1.5 text-faint transition-colors duration-150 hover:bg-surface-active hover:text-muted"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
