import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTauriEventInvalidation, TAURI_EVENT_INVALIDATIONS } from "./useTauriEventInvalidation";
import { queryKeys } from "../lib/queryKeys";

type Handler = () => void;

const handlers = new Map<string, Handler[]>();
const unlistenMocks: ReturnType<typeof vi.fn>[] = [];

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    const unlisten = vi.fn(() => {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((h) => h !== handler),
      );
    });
    unlistenMocks.push(unlisten);
    return Promise.resolve(unlisten);
  }),
}));

function emit(event: string) {
  for (const handler of handlers.get(event) ?? []) handler();
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidateSpy, wrapper };
}

beforeEach(() => {
  handlers.clear();
  unlistenMocks.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTauriEventInvalidation", () => {
  it("subscribes to every event in the mapping", () => {
    const { wrapper } = setup();
    renderHook(() => useTauriEventInvalidation(), { wrapper });
    expect(
      vi
        .mocked(listen)
        .mock.calls.map(([event]) => event)
        .toSorted(),
    ).toEqual(TAURI_EVENT_INVALIDATIONS.map(({ event }) => event).toSorted());
  });

  it("invalidates the app-data domains on app-files-changed, debounced", () => {
    const { invalidateSpy, wrapper } = setup();
    renderHook(() => useTauriEventInvalidation(), { wrapper });

    // A burst of events inside the debounce window collapses into one round.
    emit("app-files-changed");
    emit("app-files-changed");
    emit("app-files-changed");
    expect(invalidateSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(queryKeys.skills.all);
    expect(keys).toContainEqual(queryKeys.projects.all);
    expect(keys).toContainEqual(queryKeys.presets.all);
    expect(keys).toContainEqual(queryKeys.tools.all);
    expect(keys).toContainEqual(queryKeys.settings.all);
    expect(keys).toContainEqual(queryKeys.backup.all);
    expect(keys).toContainEqual(queryKeys.workspace.all);
    expect(keys).toContainEqual(queryKeys.search.all);
    // One call per domain prefix, not per event in the burst.
    expect(keys.filter((key) => key === queryKeys.skills.all)).toHaveLength(1);
  });

  it("debounce window restarts on each event", () => {
    const { invalidateSpy, wrapper } = setup();
    renderHook(() => useTauriEventInvalidation(), { wrapper });

    emit("app-files-changed");
    vi.advanceTimersByTime(400);
    emit("app-files-changed");
    vi.advanceTimersByTime(400);
    expect(invalidateSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("invalidates only skills and projects on skills-auto-updated, without debounce", () => {
    const { invalidateSpy, wrapper } = setup();
    renderHook(() => useTauriEventInvalidation(), { wrapper });

    emit("skills-auto-updated");
    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(queryKeys.skills.all);
    expect(keys).toContainEqual(queryKeys.projects.all);
    expect(keys).toHaveLength(2);
  });

  it("unlistens and cancels pending debounce timers on unmount", async () => {
    const { invalidateSpy, wrapper } = setup();
    const { unmount } = renderHook(() => useTauriEventInvalidation(), { wrapper });

    emit("app-files-changed");
    unmount();
    // The unlisten functions resolve from promises; let them settle.
    await vi.advanceTimersByTimeAsync(0);
    expect(unlistenMocks.length).toBeGreaterThan(0);
    for (const unlisten of unlistenMocks) {
      expect(unlisten).toHaveBeenCalled();
    }

    vi.advanceTimersByTime(1000);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
