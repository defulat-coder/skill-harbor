import { create } from "zustand";
import * as api from "../lib/tauri";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // localStorage may be unavailable; fall through to the default.
  }
  return "system";
}

interface ThemeState {
  theme: Theme;
  systemTheme: ResolvedTheme;
  /** User picks a theme: remember it locally and in the backend settings. */
  setTheme: (theme: Theme) => void;
  setSystemTheme: (resolved: ResolvedTheme) => void;
  /** Backend is the source of truth on startup: adopt its value without
   *  writing it back (setTheme would echo the same value to the backend). */
  hydrateTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: readInitialTheme(),
  systemTheme: getSystemTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage may be unavailable; the backend write still persists it.
    }
    void api.setSettings("theme", theme);
    set({ theme });
  },
  setSystemTheme: (systemTheme) => set({ systemTheme }),
  hydrateTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    set({ theme });
  },
}));
