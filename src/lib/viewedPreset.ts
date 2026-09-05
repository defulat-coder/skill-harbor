import type { Preset } from "./tauri";

/**
 * Resolve the viewed preset: persisted id > activePreset > first preset.
 * Shared by useApp (what consumers render) and useActivePresetSync (which
 * persists the resolved fallback so the next launch matches what the user saw).
 */
export function resolveViewedPreset(
  viewedPresetId: string | null,
  presets: Preset[],
  activePreset: Preset | null,
): Preset | null {
  if (viewedPresetId) {
    const found = presets.find((p) => p.id === viewedPresetId);
    if (found) return found;
  }
  return activePreset ?? presets[0] ?? null;
}
