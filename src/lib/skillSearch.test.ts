import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  answerSkillSearch,
  getSkillSearchStatus,
  indexSkillSearch,
  querySkillSearch,
  type SearchHit,
} from "./skillSearch";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

describe("skillSearch invoke wiring", () => {
  it("queries the status command with no arguments and returns its payload", async () => {
    const status = { root: "/central", available: true, ready: true, model: "m", files: 12 };
    invokeMock.mockResolvedValue(status);
    await expect(getSkillSearchStatus()).resolves.toBe(status);
    expect(invokeMock).toHaveBeenCalledWith("skill_search_status");
  });

  it("triggers indexing through the index command", async () => {
    invokeMock.mockResolvedValue({ root: "", available: true, ready: false, model: "m", files: 0 });
    await indexSkillSearch();
    expect(invokeMock).toHaveBeenCalledWith("skill_search_index");
  });

  it("forwards the query argument to the query command", async () => {
    const result = { query: "commit", hits: [] };
    invokeMock.mockResolvedValue(result);
    await expect(querySkillSearch("commit")).resolves.toBe(result);
    expect(invokeMock).toHaveBeenCalledWith("skill_search_query", { query: "commit" });
  });

  it("forwards query and hits to the answer command", async () => {
    const hits: SearchHit[] = [
      { skill_id: "s1", name: "S", path: "/p", line_start: 1, line_end: 2, text: "t", score: 0.9 },
    ];
    invokeMock.mockResolvedValue("the answer");
    await expect(answerSkillSearch("commit", hits)).resolves.toBe("the answer");
    expect(invokeMock).toHaveBeenCalledWith("skill_search_answer", { query: "commit", hits });
  });

  it("propagates backend rejections to the caller", async () => {
    const backendError = { kind: "internal", message: "model missing" };
    invokeMock.mockRejectedValue(backendError);
    await expect(getSkillSearchStatus()).rejects.toBe(backendError);
  });
});
