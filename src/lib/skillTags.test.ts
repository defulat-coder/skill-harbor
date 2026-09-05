import { describe, expect, it } from "vitest";
import { pruneStaleTagFilters, UNTAGGED_FILTER } from "./skillTags";

describe("pruneStaleTagFilters", () => {
  it("returns the same reference for an empty selection", () => {
    const prev = new Set<string>();
    expect(pruneStaleTagFilters(prev, ["a"], false)).toBe(prev);
  });

  it("returns the same reference when every filter is still available", () => {
    const prev = new Set(["a", "b"]);
    expect(pruneStaleTagFilters(prev, ["a", "b", "c"], false)).toBe(prev);
  });

  it("drops filters whose tag no longer exists", () => {
    const prev = new Set(["a", "gone"]);
    const next = pruneStaleTagFilters(prev, ["a"], false);
    expect(next).not.toBe(prev);
    expect([...next]).toEqual(["a"]);
  });

  it("keeps the untagged sentinel only while untagged skills exist", () => {
    const prev = new Set([UNTAGGED_FILTER, "a"]);
    expect([...pruneStaleTagFilters(prev, ["a"], true)].toSorted()).toEqual([UNTAGGED_FILTER, "a"]);
    expect([...pruneStaleTagFilters(prev, ["a"], false)]).toEqual(["a"]);
  });

  it("can empty the selection when every filter went stale", () => {
    const prev = new Set(["gone"]);
    const next = pruneStaleTagFilters(prev, [], false);
    expect(next.size).toBe(0);
    expect(next).not.toBe(prev);
  });
});
