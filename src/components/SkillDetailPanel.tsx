import { LoadingState } from "./ui/LoadingState";
import { Disclosure } from "./ui/Disclosure";
import { Button } from "./ui/Button";
import { ChineseGuide } from "./ChineseGuide";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Folder,
  HardDrive,
  Globe,
} from "lucide-react";
import { GithubIcon } from "./GithubIcon";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import {
  getSkillDocument,
  getSourceSkillDocument,
  getSkillSourceDiff,
  type ManagedSkill,
  type Project,
  type SkillToolToggle,
  type ToolInfo,
} from "../lib/tauri";
import { queryKeys } from "../lib/queryKeys";
import { SkillSourceDiffViewer } from "./SkillSourceDiffViewer";
import { DetailSheet } from "./DetailSheet";
import { SkillMarkdown } from "./SkillMarkdown";
import { AgentToggleSection, type AgentToggleItem } from "./AgentToggleSection";
import { SkillProjectsSection } from "./SkillProjectsSection";
import { SyncDots } from "./SyncDots";

interface Props {
  skill: ManagedSkill | null;
  onClose: () => void;
  tools?: ToolInfo[];
  toolToggles?: SkillToolToggle[] | null;
  togglingTool?: string | null;
  onToggleTool?: (tool: string, enabled: boolean) => void;
  projects?: Project[];
  onProjectsChanged?: () => void;
}

function sourceIcon(type: string) {
  switch (type) {
    case "git":
    case "skillssh":
      return <GithubIcon className="h-3.5 w-3.5" />;
    case "local":
    case "import":
      return <HardDrive className="h-3.5 w-3.5" />;
    default:
      return <Globe className="h-3.5 w-3.5" />;
  }
}

function sourceTypeLabel(type: string) {
  return type === "skillssh" ? "skills.sh" : type;
}

export function SkillDetailPanel({
  skill,
  onClose,
  tools,
  toolToggles,
  togglingTool,
  onToggleTool,
  projects,
  onProjectsChanged,
}: Props) {
  if (!skill) return null;

  const panelKey = [
    skill.id,
    skill.updated_at,
    skill.source_type,
    skill.source_ref ?? "",
    skill.source_revision ?? "",
    skill.remote_revision ?? "",
  ].join(":");

  return (
    <SkillDetailPanelContent
      key={panelKey}
      skill={skill}
      onClose={onClose}
      tools={tools}
      toolToggles={toolToggles}
      togglingTool={togglingTool}
      onToggleTool={onToggleTool}
      projects={projects}
      onProjectsChanged={onProjectsChanged}
    />
  );
}

function SkillDetailPanelContent({
  skill,
  onClose,
  tools,
  toolToggles,
  togglingTool,
  onToggleTool,
  projects,
  onProjectsChanged,
}: {
  skill: ManagedSkill;
  onClose: () => void;
  tools?: ToolInfo[];
  toolToggles?: SkillToolToggle[] | null;
  togglingTool?: string | null;
  onToggleTool?: (tool: string, enabled: boolean) => void;
  projects?: Project[];
  onProjectsChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
  const [contentTab, setContentTab] = useState<"zh" | "local" | "diff" | "source">("zh");
  const skillId = skill.id;
  const supportsSourceDiff =
    skill.source_type === "git"
    || skill.source_type === "skillssh"
    || ((skill.source_type === "local" || skill.source_type === "import") && !!skill.source_ref);

  const docQuery = useQuery({
    queryKey: queryKeys.skills.document(skillId),
    queryFn: () => getSkillDocument(skillId),
  });
  const sourceDocQuery = useQuery({
    queryKey: queryKeys.skills.sourceDocument(skillId),
    queryFn: () => getSourceSkillDocument(skillId),
    enabled: supportsSourceDiff,
  });
  // Lazily load the whole-directory diff only when the user opens the Diff
  // tab. For git/skills.sh skills this clones the repo, so we avoid paying
  // that cost (and a second clone alongside the source doc) up front.
  const sourceDiffQuery = useQuery({
    queryKey: queryKeys.skills.sourceDiff(skillId),
    queryFn: () => getSkillSourceDiff(skillId),
    enabled: contentTab === "diff" && supportsSourceDiff,
  });

  const doc = docQuery.data ?? null;
  const loading = docQuery.isLoading;
  const sourceDoc = sourceDocQuery.data ?? null;
  const sourceLoading = supportsSourceDiff && sourceDocQuery.isLoading;
  const sourceDiff = sourceDiffQuery.data ?? null;
  const sourceDiffFailed = !!sourceDiffQuery.error;

  const metadataItems = [
    { label: t("mySkills.sourceType"), value: sourceTypeLabel(skill.source_type) },
    { label: t("mySkills.sourceRef"), value: skill.source_ref },
    { label: t("mySkills.sourceResolved"), value: skill.source_ref_resolved },
    { label: t("mySkills.sourceBranch"), value: skill.source_branch },
    { label: t("mySkills.sourceSubpath"), value: skill.source_subpath },
    { label: t("mySkills.sourceRevision"), value: skill.source_revision },
  ].filter((item) => Boolean(item.value));

  const activeDoc = doc?.skill_id === skill.id ? doc : null;
  const activeSourceDoc = sourceDoc?.skill_id === skill.id ? sourceDoc : null;
  const activeSourceDiff = sourceDiff?.skill_id === skill.id ? sourceDiff : null;
  const sourceDiffLoading =
    contentTab === "diff" && supportsSourceDiff && !activeSourceDiff && !sourceDiffFailed;
  const toggleItems: AgentToggleItem[] = (toolToggles ?? []).map((toggle) => ({
    key: toggle.tool,
    displayName: toggle.display_name,
    enabled: toggle.enabled,
    isAvailable: toggle.installed && toggle.globally_enabled,
    disabled: !toggle.installed || !toggle.globally_enabled,
    badgeLabel: !toggle.installed
      ? t("mySkills.agentToggleNotInstalled")
      : !toggle.globally_enabled
        ? t("mySkills.agentToggleDisabledGlobally")
        : null,
  }));

  const meta = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {tools && <SyncDots skill={skill} tools={tools} size="sm" includeOrphan />}
        {skill.tags.length > 0 && (
          <>
            {tools && <span className="mx-0.5 h-3 w-px bg-border-subtle" />}
            {skill.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-secondary"
              >
                {tag}
              </span>
            ))}
          </>
        )}
      </div>
      <div className="mt-3 flex min-w-0 items-center gap-2 text-[13px] text-muted">
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono truncate" title={skill.central_path}>
          {skill.central_path}
        </span>
      </div>
      {metadataItems.length > 0 && (
        <Disclosure open={isMetadataExpanded} onOpenChange={setIsMetadataExpanded}
          title={<span className="flex items-center gap-2">{sourceIcon(skill.source_type)}{t("mySkills.sourceType")} · {sourceTypeLabel(skill.source_type)}</span>}>

            <div id="skill-source-metadata" className="border-t border-border-subtle px-4 py-3">
              <div className="grid gap-2 md:grid-cols-2">
                {metadataItems.map((item) => (
                  <div key={item.label} className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                      {item.label}
                    </div>
                    <div
                      className="mt-0.5 truncate font-mono text-[12px] text-secondary"
                      title={item.value ?? undefined}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </Disclosure>
      )}
    </>
  );

  return (
    <DetailSheet
      open={true}
      title={skill.name}
      description={skill.description ? <p className="line-clamp-3">{skill.description}</p> : undefined}
      meta={meta}
      onClose={onClose}
    >
      {toolToggles && onToggleTool && (
        <AgentToggleSection
          items={toggleItems}
          togglingKey={togglingTool}
          onToggle={onToggleTool}
          className="mb-4"
        />
      )}

      {projects && projects.length > 0 && (
        <SkillProjectsSection
          skill={skill}
          projects={projects}
          onChanged={onProjectsChanged}
        />
      )}

      {(
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["zh", "local", ...(supportsSourceDiff ? ["diff", "source"] as const : [])] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={contentTab === tab}
              onClick={() => setContentTab(tab)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                contentTab === tab
                  ? "bg-accent text-[var(--ds-on-accent)]"
                  : "bg-surface-hover text-muted hover:text-secondary"
              )}
              disabled={tab === "source" && sourceLoading}
            >
              {tab === "zh" ? "中文用法" : tab === "local"
                ? t("mySkills.docTabs.local")
                : tab === "diff"
                  ? t("mySkills.docTabs.diff")
                  : t("mySkills.docTabs.source")}
            </button>
          ))}
          {activeSourceDoc && (
            <span className="rounded-full border border-border-subtle bg-surface px-2 py-1 text-[12px] text-muted">
              {activeSourceDoc.source_label} · {activeSourceDoc.revision.slice(0, 7)}
            </span>
          )}
        </div>
      )}

      {contentTab === "zh" ? <ChineseGuide skillId={skill.id} /> : loading ? (
        <LoadingState label={t("common.loading")} />
      ) : contentTab === "diff" ? (
        sourceDiffLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : activeSourceDiff ? (
          <SkillSourceDiffViewer entries={activeSourceDiff.entries} />
        ) : sourceDiffFailed ? (
          <div className="mt-8 space-y-3 text-center text-[13px] text-muted" role="alert"><p>{t("mySkills.sourceDiffUnavailable")}</p><Button onClick={() => { if (contentTab === "diff") { void sourceDiffQuery.refetch(); } else { void sourceDocQuery.refetch(); } }}>重新加载</Button></div>
        ) : (
          <LoadingState label={t("common.loading")} />
        )
      ) : contentTab === "source" ? (
        sourceLoading ? (
          <LoadingState label={t("common.loading")} />
        ) : activeSourceDoc ? (
          <SkillMarkdown content={activeSourceDoc.content} />
        ) : (
          <div className="mt-8 space-y-3 text-center text-[13px] text-muted" role="alert"><p>{t("mySkills.sourceDiffUnavailable")}</p><Button onClick={() => void sourceDocQuery.refetch()}>重新加载</Button></div>
        )
      ) : activeDoc ? (
        <SkillMarkdown content={activeDoc.content} />
      ) : (
        <div className="mt-8 space-y-3 text-center text-[13px] text-muted" role="alert"><p>{t("common.documentMissing")}</p><Button onClick={() => void docQuery.refetch()}>重新加载</Button></div>
      )}
    </DetailSheet>
  );
}
