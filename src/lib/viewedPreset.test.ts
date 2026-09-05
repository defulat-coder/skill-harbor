import { describe, it, expect } from "vitest";
import type { Preset } from "../lib/tauri";
import { resolveViewedPreset } from "./viewedPreset";

function preset(id: string): Preset {
  return {
    id,
    name: id,
    description: null,
    icon: null,
    sort_order: 0,
    skill_count: 0,
    created_at: 0,
    updated_at: 0,
  };
}

const presets = [preset("a"), preset("b")];
const active = preset("active");

describe("resolveViewedPreset", () => {
  it("returns the preset matching the persisted id", () => {
    expect(resolveViewedPreset("b", presets, active)?.id).toBe("b");
  });

  it("falls back to the active preset when the persisted id is gone", () => {
    expect(resolveViewedPreset("deleted", presets, active)?.id).toBe("active");
  });

  it("falls back to the active preset when no id is persisted", () => {
    expect(resolveViewedPreset(null, presets, active)?.id).toBe("active");
  });

  it("falls back to the first preset when there is no active preset", () => {
    expect(resolveViewedPreset(null, presets, null)?.id).toBe("a");
  });

  it("returns null when there is nothing to view", () => {
    expect(resolveViewedPreset(null, [], null)).toBeNull();
  });
});
