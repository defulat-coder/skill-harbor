import { create } from "zustand";
import type { AppUpdateInfo } from "../lib/tauri";
import * as api from "../lib/tauri";
import { migrateStorage } from "../lib/migrateStorage";

export const VIEWED_PRESET_LS_KEY = "skillharbor.viewedPresetId";
export const LEGACY_VIEWED_PRESET_LS_KEY = "skillharbor.viewedScenarioId";

// Runs before the initial state below reads any key (same contract the old
// AppContext module had).
migrateStorage();

function readInitialViewedPresetId(): string | null {
  try {
    return localStorage.getItem(VIEWED_PRESET_LS_KEY) || localStorage.getItem(LEGACY_VIEWED_PRESET_LS_KEY);
  } catch {
    return null;
  }
}

interface UIState {
  /** Frontend-only "currently being viewed/edited" preset id. Persisted to
   *  localStorage as a raw string (pre-zustand format, kept on purpose; the
   *  persist middleware's JSON envelope would orphan existing values). */
  viewedPresetId: string | null;
  helpOpen: boolean;
  detailSkillId: string | null;
  /** Result of the last app-version check. Notification only: installing an
   *  update is always started by the user from Settings. */
  appUpdate: AppUpdateInfo | null;
  setViewedPresetId: (id: string) => void;
  openHelp: () => void;
  closeHelp: () => void;
  openSkillDetailById: (skillId: string) => void;
  closeSkillDetail: () => void;
  refreshAppUpdate: () => Promise<AppUpdateInfo>;
}

export const useUIStore = create<UIState>()((set) => ({
  viewedPresetId: readInitialViewedPresetId(),
  helpOpen: false,
  detailSkillId: null,
  appUpdate: null,
  setViewedPresetId: (id) => {
    try {
      localStorage.setItem(VIEWED_PRESET_LS_KEY, id);
    } catch {
      // localStorage may be unavailable; selection is still tracked in memory.
    }
    set({ viewedPresetId: id });
  },
  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  openSkillDetailById: (skillId) => set({ detailSkillId: skillId }),
  closeSkillDetail: () => set({ detailSkillId: null }),
  refreshAppUpdate: async () => {
    const info = await api.checkAppUpdate();
    set({ appUpdate: info });
    return info;
  },
}));
