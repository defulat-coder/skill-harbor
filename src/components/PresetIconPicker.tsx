import { useTranslation } from "react-i18next";
import { PRESET_ICON_OPTIONS } from "../lib/presetIcons";
import styles from "./PresetIconPicker.module.css";

const labels: Record<string, [string, string]> = {
  briefcase: ["工作", "工作"],
  "book-open": ["学习", "學習"],
  "folder-git-2": ["开源", "開源"],
  plane: ["旅行", "旅行"],
  "code-2": ["开发", "開發"],
  rocket: ["发布", "發布"],
  bot: ["智能体", "智慧代理"],
  brain: ["思考", "思考"],
  terminal: ["命令行", "命令列"],
  database: ["数据", "資料"],
  "chart-bar": ["分析", "分析"],
  search: ["调研", "研究"],
  sparkles: ["创意", "創意"],
  lightbulb: ["灵感", "靈感"],
  target: ["目标", "目標"],
  calendar: ["计划", "計畫"],
  home: ["个人", "個人"],
  heart: ["健康", "健康"],
  star: ["收藏", "收藏"],
  zap: ["自动化", "自動化"],
  bug: ["调试", "除錯"],
  shield: ["安全", "安全"],
  lock: ["私密", "私密"],
  cloud: ["云端", "雲端"],
  server: ["基础设施", "基礎設施"],
  cpu: ["工程", "工程"],
  "flask-conical": ["实验", "實驗"],
  "notebook-pen": ["笔记", "筆記"],
  blocks: ["系统", "系統"],
  palette: ["设计", "設計"],
  wrench: ["运维", "維運"],
};
export function PresetIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const chinese = language.toLowerCase().startsWith("zh");
  const traditional = /tw|hk|hant/i.test(language);
  return (
    <div className={styles.grid} role="group" aria-label={t("preset.icon")}>
      {PRESET_ICON_OPTIONS.map((option) => {
        const Icon = option.icon;
        const label = chinese
          ? (labels[option.key]?.[traditional ? 1 : 0] ?? option.label)
          : option.label;
        return (
          <button
            type="button"
            key={option.key}
            className={styles.option}
            aria-pressed={option.key === value}
            title={label}
            onClick={() => onChange(option.key)}
          >
            <Icon size={16} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
