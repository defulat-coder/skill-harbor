import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "../lib/tauri";
import { queryKeys } from "../lib/queryKeys";
import { resolveViewedPreset } from "../lib/viewedPreset";
import { useUIStore } from "../stores/useUIStore";

/**
 * Keeps the viewed preset (UI store) consistent with the preset queries.
 * Mount once at the app root.
 */
export function useActivePresetSync() {
  const presetsQuery = useQuery({
    queryKey: queryKeys.presets.list(),
    queryFn: api.getPresets,
  });
  const activePresetQuery = useQuery({
    queryKey: queryKeys.presets.active(),
    queryFn: api.getActivePreset,
  });
  const presets = presetsQuery.data;
  const activePreset = activePresetQuery.data ?? null;
  const viewedPresetId = useUIStore((s) => s.viewedPresetId);
  const lastActivePresetIdRef = useRef<string | null>(null);

  // Carry the viewed preset along when the active preset changes externally
  // (e.g. CLI switch): only if the user was viewing the old active preset, and
  // never on the initial load, so a persisted viewedPreset isn't clobbered.
  useEffect(() => {
    const nextActiveId = activePreset?.id ?? null;
    const previousActiveId = lastActivePresetIdRef.current;
    if (previousActiveId === nextActiveId) return;
    lastActivePresetIdRef.current = nextActiveId;
    if (nextActiveId && previousActiveId !== null) {
      const { viewedPresetId: current, setViewedPresetId } = useUIStore.getState();
      if (current === previousActiveId) setViewedPresetId(nextActiveId);
    }
  }, [activePreset]);

  // Persist the resolved fallback (see resolveViewedPreset) so subsequent
  // reads are stable and the next launch matches what the user saw.
  useEffect(() => {
    if (!presets) return;
    const resolved = resolveViewedPreset(viewedPresetId, presets, activePreset);
    if (resolved && resolved.id !== viewedPresetId) {
      useUIStore.getState().setViewedPresetId(resolved.id);
    }
  }, [presets, activePreset, viewedPresetId]);
}
