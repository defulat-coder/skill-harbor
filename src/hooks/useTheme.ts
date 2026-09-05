import { useState, useEffect, useCallback } from "react";
import * as api from "../lib/tauri";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  // Mark both states explicitly: design-system.css has a prefers-color-scheme
  // fallback that applies to :root without either class (pre-JS paint), so an
  // explicit light choice must be detectable to keep OS-dark users light.
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
    return "system";
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? systemTheme : theme;

  // Apply class on mount and theme change
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  // Track the OS preference so system mode re-renders on OS theme switches.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Load from Tauri settings on mount
  useEffect(() => {
    void api.getSettings("theme").then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        setThemeState(v);
        localStorage.setItem(STORAGE_KEY, v);
      }
    });
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    void api.setSettings("theme", next);
  }, []);

  return { theme, setTheme, resolvedTheme };
}
