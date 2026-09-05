import { useEffect } from "react";
import * as api from "../lib/tauri";
import {
  getSystemTheme,
  useThemeStore,
  type Theme,
  type ResolvedTheme,
} from "../stores/useThemeStore";

export type { Theme, ResolvedTheme };

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  // Mark both states explicitly: design-system.css has a prefers-color-scheme
  // fallback that applies to :root without either class (pre-JS paint), so an
  // explicit light choice must be detectable to keep OS-dark users light.
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const systemTheme = useThemeStore((s) => s.systemTheme);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  return { theme, setTheme, resolvedTheme };
}

/**
 * Global theme side effects (document class, OS preference tracking, backend
 * settings sync). Mount once at the app root; consumers only need useTheme().
 */
export function useThemeEffects() {
  const resolvedTheme = useThemeStore((s) => (s.theme === "system" ? s.systemTheme : s.theme));

  // Apply class on mount and theme change
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  // Track the OS preference so system mode re-renders on OS theme switches.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => useThemeStore.getState().setSystemTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Load from Tauri settings on mount
  useEffect(() => {
    void api.getSettings("theme").then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        useThemeStore.getState().hydrateTheme(v);
      }
    });
  }, []);
}
