import { describe, expect, it } from "vitest";
import { computePresetStatus } from "./presetStatus";
import type { ManagedSkill, Preset } from "./tauri";

function makePreset(id: string): Preset {
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

function makeSkill(id: string, presetIds: string[]): ManagedSkill {
  return {
    id,
    name: id,
    description: null,
    source_type: "local",
    source_ref: null,
    source_ref_resolved: null,
    source_subpath: null,
    source_branch: null,
    source_revision: null,
    remote_revision: null,
    update_status: "unknown",
    last_checked_at: null,
    last_check_error: null,
    central_path: `/central/${id}`,
    enabled: true,
    created_at: 0,
    updated_at: 0,
    status: "ok",
    targets: [],
    preset_ids: presetIds,
    tags: [],
  };
}

describe("computePresetStatus", () => {
  it("reports empty when the preset has no skills", () => {
    const result = computePresetStatus(
      makePreset("p"),
      [makeSkill("s", ["other"])],
      ["claude_code"],
      () => true,
    );
    expect(result).toEqual({ status: "empty", installed: 0, total: 0 });
  });

  it("reports empty when there are no agent keys, even with skills", () => {
    const result = computePresetStatus(makePreset("p"), [makeSkill("s", ["p"])], [], () => true);
    expect(result).toEqual({ status: "empty", installed: 0, total: 0 });
  });

  it("reports active when every skill is installed for every agent", () => {
    const skills = [makeSkill("a", ["p"]), makeSkill("b", ["p"])];
    const result = computePresetStatus(
      makePreset("p"),
      skills,
      ["claude_code", "codex"],
      () => true,
    );
    expect(result).toEqual({ status: "active", installed: 4, total: 4 });
  });

  it("reports inactive when nothing is installed", () => {
    const skills = [makeSkill("a", ["p"]), makeSkill("b", ["p"])];
    const result = computePresetStatus(makePreset("p"), skills, ["claude_code"], () => false);
    expect(result).toEqual({ status: "inactive", installed: 0, total: 2 });
  });

  it("reports partial with exact counts for a mixed install", () => {
    const skills = [makeSkill("a", ["p"]), makeSkill("b", ["p"]), makeSkill("c", ["p"])];
    const agents = ["claude_code", "codex"];
    const installed = new Set(["a:claude_code", "b:codex", "c:claude_code", "c:codex"]);
    const result = computePresetStatus(makePreset("p"), skills, agents, (skill, agentKey) =>
      installed.has(`${skill.id}:${agentKey}`),
    );
    expect(result).toEqual({ status: "partial", installed: 4, total: 6 });
  });

  it("only counts skills that carry the preset id", () => {
    const skills = [makeSkill("in", ["p"]), makeSkill("out", ["other"])];
    const result = computePresetStatus(makePreset("p"), skills, ["claude_code"], () => true);
    expect(result).toEqual({ status: "active", installed: 1, total: 1 });
  });
});
