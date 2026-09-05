import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThemeStore } from "./useThemeStore";
import { useTheme } from "../hooks/useTheme";

const setSettings = vi.fn();

vi.mock("../lib/tauri", () => ({
  setSettings: (...args: unknown[]) => setSettings(...args),
  getSettings: vi.fn().mockResolvedValue(null),
}));

function resetStore() {
  useThemeStore.setState({ theme: "system", systemTheme: "light" });
}

beforeEach(() => {
  localStorage.clear();
  setSettings.mockReset();
  resetStore();
});

describe("useThemeStore", () => {
  it("defaults to system when nothing is stored", async () => {
    vi.resetModules();
    const mod = await import("./useThemeStore");
    expect(mod.useThemeStore.getState().theme).toBe("system");
  });

  it("reads a stored theme on init", async () => {
    localStorage.setItem("theme", "dark");
    vi.resetModules();
    const mod = await import("./useThemeStore");
    expect(mod.useThemeStore.getState().theme).toBe("dark");
  });

  it("ignores an invalid stored value on init", async () => {
    localStorage.setItem("theme", "neon");
    vi.resetModules();
    const mod = await import("./useThemeStore");
    expect(mod.useThemeStore.getState().theme).toBe("system");
  });

  it("setTheme updates state, persists locally and writes backend settings", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(setSettings).toHaveBeenCalledWith("theme", "dark");
  });

  it("hydrateTheme adopts the backend value without writing it back", () => {
    useThemeStore.getState().hydrateTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(setSettings).not.toHaveBeenCalled();
  });

  it("setSystemTheme tracks the OS preference", () => {
    useThemeStore.getState().setSystemTheme("dark");
    expect(useThemeStore.getState().systemTheme).toBe("dark");
  });
});

describe("useTheme", () => {
  it("resolves system mode through the tracked OS preference", () => {
    useThemeStore.setState({ theme: "system", systemTheme: "dark" });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("resolves an explicit theme directly", () => {
    useThemeStore.setState({ theme: "light", systemTheme: "dark" });
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe("light");
  });
});
