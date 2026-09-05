import { invoke } from "@tauri-apps/api/core";

export interface SkillGuide {
  skill_id: string;
  content: string | null;
  source_hash: string;
  stale: boolean;
  manually_edited: boolean;
  updated_at: number | null;
  generated_content: string | null;
  guide_source_hash: string | null;
  generated_source_hash: string | null;
}
export interface GuideScope {
  projectId?: string;
  skillRelativePath?: string;
  agent?: string;
}
export const getSkillGuide = (skillId: string, scope: GuideScope = {}) => invoke<SkillGuide>("get_skill_guide", { skillId, ...scope });
export const saveSkillGuide = (skillId: string, content: string, reviewedSourceHash?: string, scope: GuideScope = {}) => invoke<SkillGuide>("save_skill_guide", { skillId, content, reviewedSourceHash, ...scope });
export const generateSkillGuide = (skillId: string, scope: GuideScope = {}) => invoke<SkillGuide>("generate_skill_guide", { skillId, ...scope });
