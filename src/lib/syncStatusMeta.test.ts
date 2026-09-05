import { describe, expect, it } from "vitest";
import { getSyncStatusClassName, getSyncStatusMeta, type SyncStatus } from "./syncStatusMeta";

const ALL_STATUSES: SyncStatus[] = [
  "in_sync",
  "project_newer",
  "center_newer",
  "diverged",
  "project_only",
];

describe("getSyncStatusClassName", () => {
  it("maps every status to a distinct class pair", () => {
    const classNames = ALL_STATUSES.map(getSyncStatusClassName);
    expect(new Set(classNames).size).toBe(ALL_STATUSES.length);
  });

  it("uses the semantic token pair for each status", () => {
    expect(getSyncStatusClassName("in_sync")).toContain("--ds-success");
    expect(getSyncStatusClassName("project_newer")).toContain("--ds-warning");
    expect(getSyncStatusClassName("center_newer")).toContain("--ds-info");
    expect(getSyncStatusClassName("diverged")).toContain("--ds-danger");
    expect(getSyncStatusClassName("project_only")).toBe("bg-surface-hover text-muted");
  });
});

describe("getSyncStatusMeta", () => {
  it("combines the caller-supplied label with the status class pair", () => {
    const meta = getSyncStatusMeta("已同步", "in_sync");
    expect(meta.label).toBe("已同步");
    expect(meta.className).toBe(getSyncStatusClassName("in_sync"));
  });
});
