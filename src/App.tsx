import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useActivePresetSync } from "./hooks/useActivePresetSync";
import { useTheme, useThemeEffects } from "./hooks/useTheme";
import type { AppRouter } from "./router";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        },
      }}
    />
  );
}

function App({ router }: { router: AppRouter }) {
  useAppBootstrap();
  useActivePresetSync();
  useThemeEffects();

  return (
    <>
      <RouterProvider router={router} />
      <ThemedToaster />
    </>
  );
}

export default App;
