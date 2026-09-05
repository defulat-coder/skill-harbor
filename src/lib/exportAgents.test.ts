import { describe, expect, it } from "vitest";
import { enabledInstalledAgentKeys, getDefaultExportAgents } from "./exportAgents";
import type { ProjectAgentTarget } from "./tauri";

function makeTarget(key: string, overrides: Partial<ProjectAgentTarget> = {}): ProjectAgentTarget {
  return {
    key,
    display_name: key,
    enabled: true,
    installed: true,
    is_custom: false,
    ...overrides,
  };
}

describe("enabledInstalledAgentKeys", () => {
  it("keeps only agents that are both installed and enabled", () => {
    const targets = [
      makeTarget("claude_code"),
      makeTarget("codex", { installed: false }),
      makeTarget("cursor", { enabled: false }),
      makeTarget("pi", { installed: false, enabled: false }),
    ];
    expect(enabledInstalledAgentKeys(targets)).toEqual(["claude_code"]);
  });

  it("preserves the detected order", () => {
    const targets = [makeTarget("pi"), makeTarget("codex"), makeTarget("claude_code")];
    expect(enabledInstalledAgentKeys(targets)).toEqual(["pi", "codex", "claude_code"]);
  });
});

describe("getDefaultExportAgents", () => {
  it("puts priority agents first, then the rest in detected order", () => {
    const targets = [
      makeTarget("pi"),
      makeTarget("cursor"),
      makeTarget("windsurf"),
      makeTarget("claude_code"),
    ];
    expect(getDefaultExportAgents(targets)).toEqual([
      "claude_code",
      "cursor",
      "pi",
      "windsurf",
    ]);
  });

  it("excludes disabled or uninstalled agents from the defaults", () => {
    const targets = [
      makeTarget("claude_code", { enabled: false }),
      makeTarget("codex", { installed: false }),
      makeTarget("cursor"),
    ];
    expect(getDefaultExportAgents(targets)).toEqual(["cursor"]);
  });

  it("returns every enabled agent even when no priority agent is present", () => {
    const targets = [makeTarget("pi"), makeTarget("windsurf")];
    expect(getDefaultExportAgents(targets)).toEqual(["pi", "windsurf"]);
  });

  it("returns an empty list when nothing is usable", () => {
    expect(getDefaultExportAgents([])).toEqual([]);
    expect(getDefaultExportAgents([makeTarget("pi", { enabled: false })])).toEqual([]);
  });
});
