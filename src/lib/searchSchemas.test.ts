import { describe, expect, it } from "vitest";
import {
  validateInstallSearch,
  validateNewFlagSearch,
  validateSkillPickerSearch,
} from "./searchSchemas";

describe("validateSkillPickerSearch", () => {
  it("保留字符串 skill，并把 JSON 解析出的标量归一化回字符串", () => {
    expect(validateSkillPickerSearch({ skill: "abc-123" })).toEqual({ skill: "abc-123" });
    // `?skill=` 空值也要保留（旧代码用 has("skill") 判定存在性）。
    expect(validateSkillPickerSearch({ skill: "" })).toEqual({ skill: "" });
    expect(validateSkillPickerSearch({ skill: 42 })).toEqual({ skill: "42" });
    expect(validateSkillPickerSearch({})).toEqual({ skill: undefined });
    expect(validateSkillPickerSearch({ skill: ["x"] })).toEqual({ skill: undefined });
  });
});

describe("validateInstallSearch", () => {
  it("只接受合法 tab，非法值丢弃，project 原样透传", () => {
    expect(validateInstallSearch({ tab: "local" })).toEqual({ tab: "local", project: undefined });
    expect(validateInstallSearch({ tab: "bogus", project: "p1" })).toEqual({
      tab: undefined,
      project: "p1",
    });
    expect(validateInstallSearch({})).toEqual({ tab: undefined, project: undefined });
  });
});

describe("validateNewFlagSearch", () => {
  it("?new=1 经 JSON.parse 后为 number，保留；其他值丢弃", () => {
    expect(validateNewFlagSearch({ new: 1 })).toEqual({ new: 1 });
    expect(validateNewFlagSearch({ new: "1" })).toEqual({ new: undefined });
    expect(validateNewFlagSearch({})).toEqual({ new: undefined });
  });
});
