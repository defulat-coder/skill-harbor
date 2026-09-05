import { describe, expect, it } from "vitest";
import {
  ERROR_KINDS,
  getErrorKind,
  getErrorMessage,
  isAppError,
  type AppError,
} from "./error";

const appError: AppError = { kind: "git", message: "push failed" };

describe("isAppError", () => {
  it("accepts a well-formed AppError for every known kind", () => {
    for (const kind of ERROR_KINDS) {
      expect(isAppError({ kind, message: "x" })).toBe(true);
    }
  });

  it("rejects non-objects, null, and arrays", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError("git")).toBe(false);
    expect(isAppError(42)).toBe(false);
    expect(isAppError([{ kind: "git", message: "x" }])).toBe(false);
  });

  it("rejects objects with missing or mistyped fields", () => {
    expect(isAppError({ kind: "git" })).toBe(false);
    expect(isAppError({ message: "x" })).toBe(false);
    expect(isAppError({ kind: "git", message: 7 })).toBe(false);
    expect(isAppError({ kind: 7, message: "x" })).toBe(false);
  });

  it("rejects objects whose kind is not a known ErrorKind", () => {
    expect(isAppError({ kind: "unknown_kind", message: "x" })).toBe(false);
    expect(isAppError({ kind: "GIT", message: "x" })).toBe(false);
  });
});

describe("getErrorMessage", () => {
  it("returns the AppError message verbatim", () => {
    expect(getErrorMessage(appError, "fallback")).toBe("push failed");
  });

  it("uses the message of Error instances", () => {
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("passes through non-empty strings", () => {
    expect(getErrorMessage("plain failure", "fallback")).toBe("plain failure");
  });

  it("falls back for empty messages and unrelated shapes", () => {
    expect(getErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(getErrorMessage("", "fallback")).toBe("fallback");
    expect(getErrorMessage({ kind: "nope" }, "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("getErrorKind", () => {
  it("returns the kind for structured errors and undefined otherwise", () => {
    expect(getErrorKind(appError)).toBe("git");
    expect(getErrorKind(new Error("boom"))).toBeUndefined();
    expect(getErrorKind("git")).toBeUndefined();
  });
});
