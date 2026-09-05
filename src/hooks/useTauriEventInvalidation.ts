import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";

/**
 * Rust event → query invalidation mapping.
 *
 * `app-files-changed` fires when the central repo / config files change on disk
 * (CLI, watcher, git sync). It is debounced: bursts collapse into one
 * invalidation round per `DEBOUNCE_MS` window.
 *
 * `skills-auto-updated` fires after a background auto-update round (Rust
 * scheduler) or the tray "check for updates" action; only skill-derived caches
 * need refetching (project sync badges follow via the skills → projects chain
 * in AppContext).
 */
export const TAURI_EVENT_INVALIDATIONS: ReadonlyArray<{
  event: string;
  invalidate: (queryClient: QueryClient) => void;
  debounceMs?: number;
}> = [
  {
    event: "app-files-changed",
    debounceMs: 500,
    invalidate: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.presets.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tools.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.backup.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.search.all });
    },
  },
  {
    event: "skills-auto-updated",
    invalidate: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  },
];

/**
 * Subscribes to the Rust events in TAURI_EVENT_INVALIDATIONS and invalidates
 * the mapped query keys. Mounted once near the app root.
 */
export function useTauriEventInvalidation() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscriptions = TAURI_EVENT_INVALIDATIONS.map(({ event, invalidate, debounceMs }) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const handler = () => {
        if (!debounceMs) {
          invalidate(queryClient);
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          invalidate(queryClient);
        }, debounceMs);
      };
      const unlistenPromise = listen(event, handler);
      return () => {
        if (timer) clearTimeout(timer);
        unlistenPromise
          .then((unlisten) => unlisten())
          .catch((error) => {
            console.error(`Failed to unlisten ${event}:`, error);
          });
      };
    });

    return () => {
      subscriptions.forEach((teardown) => teardown());
    };
  }, [queryClient]);
}
