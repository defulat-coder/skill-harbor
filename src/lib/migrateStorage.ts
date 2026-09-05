/**
 * One-time rename of localStorage keys from the old "skills-manager" prefix
 * to "skillharbor". Runs once at app startup, before any key is read: when
 * the new key is absent and the old one exists, the value is copied over and
 * the old key removed.
 */
const RENAMED_KEYS: [string, string][] = [
  ["skills-manager.viewedPresetId", "skillharbor.viewedPresetId"],
  ["skills-manager.viewedScenarioId", "skillharbor.viewedScenarioId"],
  ["skills-manager:tool-order", "skillharbor:tool-order"],
  ["skills-manager:lobster-tool-order", "skillharbor:lobster-tool-order"],
];

export function migrateStorage() {
  try {
    for (const [oldKey, newKey] of RENAMED_KEYS) {
      if (localStorage.getItem(newKey) !== null) continue;
      const value = localStorage.getItem(oldKey);
      if (value === null) continue;
      localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
    }
  } catch {
    // Storage may be unavailable; keys fall back to their defaults.
  }
}
