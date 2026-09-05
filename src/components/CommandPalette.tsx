import { DetailSheet } from "./DetailSheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Search,
  Layers,
  Download,
  Settings as SettingsIcon,
  FolderOpen,
  Folder,
  Home,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { getPresetIconOption } from "../lib/presetIcons";
import { cn } from "../utils";

type ItemKind = "skill" | "preset" | "project" | "action";

interface PaletteItem {
  id: string;
  kind: ItemKind;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    managedSkills,
    presets,
    projects,
    viewedPreset,
    setViewedPresetId,
  } = useApp();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (typing && !open) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    const show = () => setOpen(true);
    window.addEventListener("workbench:search", show);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("workbench:search", show); };
  }, [open, close]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setActiveIndex(0);
  }

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    const skillItems: PaletteItem[] = managedSkills
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q),
      )
      .slice(0, 8)
      .map((s) => ({
        id: `skill:${s.id}`,
        kind: "skill",
        label: s.name,
        sublabel: s.description || undefined,
        icon: <Layers className="h-3.5 w-3.5" />,
        run: () => {
          void navigate({ to: "/library", search: { skill: s.id } });
        },
      }));

    const presetItems: PaletteItem[] = presets
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((s) => {
        const option = getPresetIconOption(s);
        const Icon = option.icon;
        return {
          id: `preset:${s.id}`,
          kind: "preset",
          label: s.name,
          sublabel: s.description || `${s.skill_count} skills`,
          icon: <Icon className="h-3.5 w-3.5" />,
          run: () => {
            if (viewedPreset?.id !== s.id) {
              setViewedPresetId(s.id);
            }
            if (!window.location.pathname.endsWith("/my-skills")) {
              void navigate({ to: "/my-skills" });
            }
          },
        };
      });

    const projectItems: PaletteItem[] = projects
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q),
      )
      .slice(0, 5)
      .map((p) => ({
        id: `proj:${p.id}`,
        kind: "project",
        label: p.name,
        sublabel: p.path,
        icon: <Folder className="h-3.5 w-3.5" />,
        run: () => navigate({ to: "/project/$id", params: { id: p.id } }),
      }));

    const actionDefs: PaletteItem[] = [
      { id: "action:search-index", kind: "action", label: "索引管理", icon: <Layers className="h-3.5 w-3.5" />, run: () => navigate({ to: "/search-index" }) },
      { id: "action:search-home", kind: "action", label: "问答检索", icon: <Home className="h-3.5 w-3.5" />, run: () => navigate({ to: "/" }) },
      {
        id: "action:dashboard",
        kind: "action",
        label: "全局技能",
        icon: <Home className="h-3.5 w-3.5" />,
        run: () => navigate({ to: "/library" }),
      },
      {
        id: "action:my-skills",
        kind: "action",
        label: "维护与更新",
        icon: <Layers className="h-3.5 w-3.5" />,
        run: () => navigate({ to: "/my-skills" }),
      },
      {
        id: "action:install",
        kind: "action",
        label: t("sidebar.installSkills"),
        icon: <Download className="h-3.5 w-3.5" />,
        run: () => navigate({ to: "/install" }),
      },
      {
        id: "action:install-local",
        kind: "action",
        label: t("commandPalette.scanImport"),
        icon: <FolderOpen className="h-3.5 w-3.5" />,
        run: () => navigate({ to: "/install", search: { tab: "local" } }),
      },
      {
        id: "action:settings",
        kind: "action",
        label: t("sidebar.settings"),
        icon: <SettingsIcon className="h-3.5 w-3.5" />,
        shortcut: "⌘,",
        run: () => navigate({ to: "/settings" }),
      },
    ];
    const actions = actionDefs.filter((a) => !q || a.label.toLowerCase().includes(q));

    return [...skillItems, ...presetItems, ...projectItems, ...actions];
  }, [
    query,
    managedSkills,
    presets,
    projects,
    viewedPreset?.id,
    setViewedPresetId,
    navigate,
    t,
  ]);

  if (activeIndex > 0 && activeIndex >= items.length) setActiveIndex(0);

  // Scroll active item into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLDivElement>(
      `[data-palette-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);



  const groups: { kind: ItemKind; label: string }[] = [
    { kind: "skill", label: t("commandPalette.skills") },
    { kind: "preset", label: t("commandPalette.presets") },
    { kind: "project", label: t("commandPalette.projects") },
    { kind: "action", label: t("commandPalette.actions") },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) {
        item.run();
        close();
      }
    }
  };

  // Build render order by group, with flat index for keyboard nav
  let flatIndex = 0;
  const rendered = groups
    .map((g) => {
      const groupItems = items.filter((it) => it.kind === g.kind);
      if (groupItems.length === 0) return null;
      return (
        <div key={g.kind}>
          <div className="px-4 pt-3 pb-1 text-[12px] font-medium text-faint">
            {g.label} · {groupItems.length}
          </div>
          {groupItems.map((item) => {
            const idx = flatIndex++;
            const active = idx === activeIndex;
            return (
              <div
                key={item.id}
                data-palette-index={idx}
                id={`palette-option-${idx}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  item.run();
                  close();
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-2 text-[13px]",
                  active ? "bg-surface-hover" : "hover:bg-surface-hover/60",
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface text-muted">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "truncate",
                      item.kind === "skill" ? "font-mono" : "",
                      active ? "text-primary" : "text-secondary",
                    )}
                  >
                    {item.label}
                  </div>
                  {item.sublabel && (
                    <div className="truncate text-[12px] text-muted">
                      {item.sublabel}
                    </div>
                  )}
                </div>
                {item.shortcut && (
                  <span className="rounded-sm border border-border-subtle bg-surface-hover px-1.5 py-0.5 font-mono text-[12px] text-faint">
                    {item.shortcut}
                  </span>
                )}
                {active && (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                )}
              </div>
            );
          })}
        </div>
      );
    })
    .filter(Boolean);

  return (
    <DetailSheet open={open} title="快速查找" description="查找全局技能、预设、项目和操作" onClose={close}>
      <div onKeyDown={handleKeyDown}>
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            role="combobox" aria-label={t("commandPalette.placeholder")} aria-expanded={open} aria-controls="palette-results" aria-autocomplete="list" aria-activedescendant={items.length ? `palette-option-${activeIndex}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPalette.placeholder")}
            className="flex-1 bg-transparent text-[14px] text-primary placeholder:text-faint"
          />
          <span className="rounded-sm border border-border-subtle bg-surface-hover px-1.5 py-0.5 font-mono text-[12px] text-faint">
            ESC
          </span>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto pb-2"
          role="listbox" id="palette-results" aria-label="查找结果"
        >
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-muted">
              {t("commandPalette.empty")}
            </div>
          ) : (
            rendered
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border-subtle bg-bg-secondary px-4 py-2 text-[12px] text-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-border-subtle bg-surface px-1 font-mono text-[12px]">
              ↑↓
            </kbd>
            {t("commandPalette.hints.navigate")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded-sm border border-border-subtle bg-surface px-1 font-mono text-[12px]">
              ↵
            </kbd>
            {t("commandPalette.hints.open")}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded-sm border border-border-subtle bg-surface px-1 font-mono text-[12px]">
              ⌘K
            </kbd>
            {t("commandPalette.hints.toggle")}
          </span>
        </div>
      </div>
    </DetailSheet>
  );
}
