import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { i18nReady } from "./i18n";
import { logStartupEvent } from "./lib/tauri";
import { createAppRouter } from "./router";
import "./index.css";
import App from "./App.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Desktop app: Tauri window focus is a meaningful "user came back" signal,
      // so refetching stale queries on focus keeps data fresh without polling.
      refetchOnWindowFocus: true,
    },
  },
});

await i18nReady;
logStartupEvent("i18n_ready", performance.now()).catch(() => {});

const router = createAppRouter(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App router={router} />
    </QueryClientProvider>
  </StrictMode>
);
logStartupEvent("root_rendered", performance.now()).catch(() => {});
