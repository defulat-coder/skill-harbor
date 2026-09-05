import i18next, { type TFunction } from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { mapGitErrorMessage } from "./gitErrors";

// A freshly initialized i18next instance has no resources, so `t` echoes the
// key back and each assertion names the exact i18n slot that fired.
let t: TFunction;

beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init();
  t = instance.t;
});

describe("mapGitErrorMessage", () => {
  it("short-circuits on a network error kind regardless of message", () => {
    const error = { kind: "network", message: "unrelated histories" };
    expect(mapGitErrorMessage(error, t)).toBe("settings.gitErrorNetwork");
  });

  it("maps authentication failures to the auth copy", () => {
    for (const message of [
      "remote: Authentication failed for 'https://example.com/x.git'",
      "git@github.com: Permission denied (publickey).",
      "fatal: could not read Username for 'https://github.com'",
    ]) {
      expect(mapGitErrorMessage(new Error(message), t)).toBe("settings.gitErrorAuth");
    }
  });

  it("maps connectivity failures in the message to the network copy", () => {
    for (const message of [
      "fatal: unable to access '...': Could not resolve host: github.com",
      "fatal: Failed to connect to github.com port 443",
      "fatal: Connection timed out after 30000 milliseconds",
      "ssh: connect to host port 22: Connection refused",
    ]) {
      expect(mapGitErrorMessage(new Error(message), t)).toBe("settings.gitErrorNetwork");
    }
  });

  it("maps unrelated-history rejections to their dedicated copy", () => {
    expect(mapGitErrorMessage(new Error("fatal: refusing to merge unrelated histories"), t)).toBe(
      "settings.gitErrorUnrelatedHistories"
    );
  });

  it("maps non-fast-forward push rejections to the rejected copy", () => {
    for (const message of [
      " ! [rejected]        main -> main (non-fast-forward)",
      "hint: Updates were rejected because the tip of your current branch is behind. fetch first",
      "error: failed to push some refs to 'origin'",
    ]) {
      expect(mapGitErrorMessage(new Error(message), t)).toBe("settings.gitErrorRejected");
    }
  });

  it("maps missing upstream, conflicts, and non-repos to their copies", () => {
    expect(mapGitErrorMessage(new Error("The current branch main has no upstream branch"), t)).toBe(
      "settings.gitErrorNoUpstream"
    );
    expect(mapGitErrorMessage(new Error("CONFLICT (content): Merge conflict in SKILL.md"), t)).toBe(
      "settings.gitErrorConflict"
    );
    expect(mapGitErrorMessage(new Error("fatal: not a git repository (or any of the parent directories)"), t)).toBe(
      "settings.gitErrorNotRepo"
    );
  });

  it("appends the detail to the generic copy, except for a bare 'Error'", () => {
    expect(mapGitErrorMessage(new Error("something odd happened"), t)).toBe(
      "settings.gitErrorGeneric (something odd happened)"
    );
    expect(mapGitErrorMessage(new Error("Error"), t)).toBe("settings.gitErrorGeneric");
    expect(mapGitErrorMessage(undefined, t)).toBe("settings.gitErrorGeneric");
  });
});
