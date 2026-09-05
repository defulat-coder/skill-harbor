import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateStorage } from "./migrateStorage";

const OLD_KEY = "skills-manager:tool-order";
const NEW_KEY = "skillharbor:tool-order";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("migrateStorage", () => {
  it("moves an old-prefixed value to the new key and removes the old key", () => {
    localStorage.setItem(OLD_KEY, '["claude_code","codex"]');
    migrateStorage();
    expect(localStorage.getItem(NEW_KEY)).toBe('["claude_code","codex"]');
    expect(localStorage.getItem(OLD_KEY)).toBeNull();
  });

  it("migrates every renamed key in one pass", () => {
    localStorage.setItem("skills-manager.viewedPresetId", "preset-1");
    localStorage.setItem("skills-manager.viewedScenarioId", "scenario-2");
    migrateStorage();
    expect(localStorage.getItem("skillharbor.viewedPresetId")).toBe("preset-1");
    expect(localStorage.getItem("skillharbor.viewedScenarioId")).toBe("scenario-2");
  });

  it("keeps an existing new value and leaves the old key untouched", () => {
    localStorage.setItem(NEW_KEY, "new-value");
    localStorage.setItem(OLD_KEY, "old-value");
    migrateStorage();
    expect(localStorage.getItem(NEW_KEY)).toBe("new-value");
    expect(localStorage.getItem(OLD_KEY)).toBe("old-value");
  });

  it("is a no-op when no old keys exist", () => {
    migrateStorage();
    expect(localStorage.length).toBe(0);
  });

  it("swallows storage failures so startup never crashes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => migrateStorage()).not.toThrow();
  });
});
