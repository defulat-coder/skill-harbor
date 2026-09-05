import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Bug,
  Calendar,
  ChartBar,
  Cloud,
  Code2,
  Cpu,
  Database,
  FlaskConical,
  FolderGit2,
  Heart,
  Home,
  Lightbulb,
  Lock,
  NotebookPen,
  Palette,
  Plane,
  Rocket,
  Search,
  Server,
  Shield,
  Sparkles,
  Star,
  Target,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react";
import type { Preset } from "./tauri";

export interface PresetIconOption {
  key: string;
  label: string;
  icon: LucideIcon;
  colorClass: string;
  activeClass: string;
}

/* Preset icons stay neutral; only the active pill carries the brand pair. */
const PRESET_ICON_COLOR_CLASS = "text-muted";
const PRESET_ICON_ACTIVE_CLASS = "border-[var(--ds-brand)] bg-[var(--ds-brand-bg)]";

function presetIconOption(key: string, label: string, icon: LucideIcon): PresetIconOption {
  return { key, label, icon, colorClass: PRESET_ICON_COLOR_CLASS, activeClass: PRESET_ICON_ACTIVE_CLASS };
}

export const PRESET_ICON_OPTIONS: PresetIconOption[] = [
  presetIconOption("briefcase", "Work", Briefcase),
  presetIconOption("book-open", "Study", BookOpen),
  presetIconOption("folder-git-2", "Open Source", FolderGit2),
  presetIconOption("plane", "Travel", Plane),
  presetIconOption("code-2", "Build", Code2),
  presetIconOption("rocket", "Launch", Rocket),
  presetIconOption("bot", "Agents", Bot),
  presetIconOption("brain", "Thinking", Brain),
  presetIconOption("terminal", "CLI", Terminal),
  presetIconOption("database", "Data", Database),
  presetIconOption("chart-bar", "Analytics", ChartBar),
  presetIconOption("search", "Research", Search),
  presetIconOption("sparkles", "Creative", Sparkles),
  presetIconOption("lightbulb", "Ideas", Lightbulb),
  presetIconOption("target", "Goals", Target),
  presetIconOption("calendar", "Planning", Calendar),
  presetIconOption("home", "Personal", Home),
  presetIconOption("heart", "Health", Heart),
  presetIconOption("star", "Favorites", Star),
  presetIconOption("zap", "Automation", Zap),
  presetIconOption("bug", "Debug", Bug),
  presetIconOption("shield", "Security", Shield),
  presetIconOption("lock", "Private", Lock),
  presetIconOption("cloud", "Cloud", Cloud),
  presetIconOption("server", "Infrastructure", Server),
  presetIconOption("cpu", "Engineering", Cpu),
  presetIconOption("flask-conical", "Experiment", FlaskConical),
  presetIconOption("notebook-pen", "Notes", NotebookPen),
  presetIconOption("blocks", "Systems", Blocks),
  presetIconOption("palette", "Design", Palette),
  presetIconOption("wrench", "Ops", Wrench),
];

const PRESET_ICON_MAP = new Map(
  PRESET_ICON_OPTIONS.map((option) => [option.key, option] as const)
);

const PRESET_KEYWORD_RULES: Array<{ key: string; keywords: string[] }> = [
  { key: "briefcase", keywords: ["工作", "work", "office", "client"] },
  { key: "book-open", keywords: ["学习", "study", "learn", "course", "research"] },
  { key: "folder-git-2", keywords: ["开源", "opensource", "open source", "github"] },
  { key: "plane", keywords: ["旅行", "travel", "trip", "holiday"] },
  { key: "code-2", keywords: ["开发", "code", "build", "app"] },
  { key: "bot", keywords: ["agent", "agents", "ai", "assistant", "机器人"] },
  { key: "brain", keywords: ["thinking", "reason", "brainstorm", "思考"] },
  { key: "terminal", keywords: ["cli", "terminal", "shell", "command", "命令行"] },
  { key: "database", keywords: ["data", "database", "sql", "数据"] },
  { key: "chart-bar", keywords: ["analytics", "metric", "report", "dashboard", "分析"] },
  { key: "search", keywords: ["research", "search", "调查", "检索"] },
  { key: "sparkles", keywords: ["creative", "content", "copy", "创意"] },
  { key: "target", keywords: ["goal", "target", "okr", "目标"] },
  { key: "calendar", keywords: ["plan", "planning", "schedule", "calendar", "计划"] },
  { key: "home", keywords: ["personal", "home", "life", "个人"] },
  { key: "heart", keywords: ["health", "fitness", "wellness", "健康"] },
  { key: "zap", keywords: ["automation", "automate", "workflow", "自动化"] },
  { key: "bug", keywords: ["debug", "bug", "fix", "修复"] },
  { key: "shield", keywords: ["security", "secure", "安全"] },
  { key: "cloud", keywords: ["cloud", "deploy", "云"] },
  { key: "server", keywords: ["infra", "infrastructure", "server", "ops", "运维"] },
  { key: "flask-conical", keywords: ["experiment", "lab", "test", "实验"] },
  { key: "notebook-pen", keywords: ["笔记", "note", "write", "journal"] },
  { key: "palette", keywords: ["设计", "design", "brand", "ui"] },
];

export function inferPresetIconKey(preset?: Pick<Preset, "name" | "description" | "icon"> | null) {
  if (preset?.icon && PRESET_ICON_MAP.has(preset.icon)) {
    return preset.icon;
  }

  const haystack = `${preset?.name || ""} ${preset?.description || ""}`.toLowerCase();
  const matched = PRESET_KEYWORD_RULES.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword))
  );

  return matched?.key || "briefcase";
}

export function getPresetIconOption(
  preset?: Pick<Preset, "name" | "description" | "icon"> | string | null
) {
  const key =
    typeof preset === "string"
      ? preset
      : inferPresetIconKey(preset);
  return PRESET_ICON_MAP.get(key) || PRESET_ICON_OPTIONS[0];
}
