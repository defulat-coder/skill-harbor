import { useEffect, useSyncExternalStore } from "react";
import { getSkillSearchStatus, indexSkillSearch, type SkillSearchStatus } from "../lib/skillSearch";
import { getErrorMessage } from "../lib/error";

// Indexing belongs to the application: navigating away must not lose the job state.
// Initial loading is true so first paint shows the checking state instead of a false empty state.
let state = { status: null as SkillSearchStatus | null, loading: true, building: false, error: "", completedAt: "" };
const listeners = new Set<() => void>();
function publish(next: Partial<typeof state>) { state = { ...state, ...next }; listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const snapshot = () => state;
let refreshing = false;
export async function refreshSkillIndex() {
  if (refreshing || state.building) return;
  refreshing = true;
  publish({ loading: true, error: "" });
  try { publish({ status: await getSkillSearchStatus() }); }
  catch (error) { publish({ error: getErrorMessage(error, "无法读取索引状态") }); }
  finally { refreshing = false; publish({ loading: false }); }
}
export async function buildSkillIndex() {
  if (state.loading || state.building) return;
  publish({ building: true, error: "", completedAt: "" });
  try { publish({ status: await indexSkillSearch(), completedAt: new Date().toLocaleString("zh-CN") }); }
  catch (error) { publish({ error: getErrorMessage(error, "索引构建失败，请重试") }); }
  finally { publish({ building: false }); }
}
export function useSkillIndex() {
  const current = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => { void refreshSkillIndex(); }, []);
  return current;
}
