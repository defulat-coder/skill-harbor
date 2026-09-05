import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppUpdateInfo } from "../lib/tauri";
import { useUIStore, VIEWED_PRESET_LS_KEY, LEGACY_VIEWED_PRESET_LS_KEY } from "./useUIStore";

const checkAppUpdate = vi.fn();

vi.mock("../lib/tauri", () => ({
  checkAppUpdate: (...args: unknown[]) => checkAppUpdate(...args),
}));

const UPDATE_INFO: AppUpdateInfo = {
  has_update: true,
  current_version: "1.0.0",
  latest_version: "1.1.0",
  release_url: "https://example.com/release",
};

function resetStore() {
  useUIStore.setState({
    viewedPresetId: null,
    helpOpen: false,
    detailSkillId: null,
    appUpdate: null,
  });
}

beforeEach(() => {
  localStorage.clear();
  checkAppUpdate.mockReset();
  resetStore();
});

describe("useUIStore", () => {
  it("starts with closed dialogs and no app update", () => {
    const state = useUIStore.getState();
    expect(state.helpOpen).toBe(false);
    expect(state.detailSkillId).toBeNull();
    expect(state.appUpdate).toBeNull();
  });

  it("setViewedPresetId updates state and persists the raw id to localStorage", () => {
    useUIStore.getState().setViewedPresetId("preset-1");
    expect(useUIStore.getState().viewedPresetId).toBe("preset-1");
    expect(localStorage.getItem(VIEWED_PRESET_LS_KEY)).toBe("preset-1");
  });

  it("reads the persisted viewed preset id on init", async () => {
    localStorage.setItem(VIEWED_PRESET_LS_KEY, "preset-saved");
    vi.resetModules();
    const mod = await import("./useUIStore");
    expect(mod.useUIStore.getState().viewedPresetId).toBe("preset-saved");
  });

  it("falls back to the legacy viewed-scenario key on init", async () => {
    localStorage.setItem(LEGACY_VIEWED_PRESET_LS_KEY, "scenario-legacy");
    vi.resetModules();
    const mod = await import("./useUIStore");
    expect(mod.useUIStore.getState().viewedPresetId).toBe("scenario-legacy");
  });

  it("prefers the current key over the legacy key on init", async () => {
    localStorage.setItem(VIEWED_PRESET_LS_KEY, "preset-new");
    localStorage.setItem(LEGACY_VIEWED_PRESET_LS_KEY, "scenario-legacy");
    vi.resetModules();
    const mod = await import("./useUIStore");
    expect(mod.useUIStore.getState().viewedPresetId).toBe("preset-new");
  });

  it("openHelp/closeHelp toggle helpOpen", () => {
    useUIStore.getState().openHelp();
    expect(useUIStore.getState().helpOpen).toBe(true);
    useUIStore.getState().closeHelp();
    expect(useUIStore.getState().helpOpen).toBe(false);
  });

  it("openSkillDetailById/closeSkillDetail track the detail skill", () => {
    useUIStore.getState().openSkillDetailById("skill-42");
    expect(useUIStore.getState().detailSkillId).toBe("skill-42");
    useUIStore.getState().closeSkillDetail();
    expect(useUIStore.getState().detailSkillId).toBeNull();
  });

  it("refreshAppUpdate stores the check result and returns it", async () => {
    checkAppUpdate.mockResolvedValue(UPDATE_INFO);
    const info = await useUIStore.getState().refreshAppUpdate();
    expect(info).toEqual(UPDATE_INFO);
    expect(useUIStore.getState().appUpdate).toEqual(UPDATE_INFO);
    expect(checkAppUpdate).toHaveBeenCalledTimes(1);
  });
});
