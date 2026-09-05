import { invoke } from "@tauri-apps/api/core";

export interface SkillSearchStatus { root: string; available: boolean; ready: boolean; model: string; files: number; error?: string; }
export interface SearchHit { skill_id: string; name: string; path: string; line_start: number; line_end: number; text: string; score: number; }
export interface SkillSearchResult { query: string; hits: SearchHit[]; warning?: string; }
export const getSkillSearchStatus = () => invoke<SkillSearchStatus>("skill_search_status");
export const indexSkillSearch = () => invoke<SkillSearchStatus>("skill_search_index");
export const querySkillSearch = (query: string) => invoke<SkillSearchResult>("skill_search_query", { query });
export const answerSkillSearch = (query: string, hits: SearchHit[]) => invoke<string>("skill_search_answer", { query, hits });
