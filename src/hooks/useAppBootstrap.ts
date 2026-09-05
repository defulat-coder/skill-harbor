import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ManagedSkill } from "../lib/tauri";
import * as api from "../lib/tauri";
import i18n from "../i18n";
import { applyTextSize } from "../lib/textScale";
import { queryKeys } from "../lib/queryKeys";
import { useUIStore } from "../stores/useUIStore";
import { useTauriEventInvalidation } from "./useTauriEventInvalidation";

const SKILL_UPDATE_TOAST_ID = "skill-update-available";
const APP_UPDATE_TOAST_ID = "app-update-available";
const EMPTY_SKILLS: ManagedSkill[] = [];

function navigateTo(path: string) {
  useUIStore.getState().closeSkillDetail();
  if (!window.location.pathname.endsWith(path)) {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

let lastUpdateNotification: string | null = null;

function notifyUpdatableSkills(skills: ManagedSkill[]) {
  const updatable = skills
    .filter((s) => s.update_status === "update_available")
    .toSorted((a, b) => a.id.localeCompare(b.id));

  if (updatable.length === 0) {
    lastUpdateNotification = null;
    toast.dismiss(SKILL_UPDATE_TOAST_ID);
    return;
  }

  const notificationSignature = updatable.map((skill) => skill.id).join("|");
  if (lastUpdateNotification === notificationSignature) {
    return;
  }

  lastUpdateNotification = notificationSignature;
  toast.info(
    i18n.t("mySkills.updateNotification", { count: updatable.length }),
    {
      id: SKILL_UPDATE_TOAST_ID,
      duration: 8000,
      action: {
        label: i18n.t("mySkills.viewUpdates"),
        onClick: () => navigateTo("/my-skills"),
      },
    }
  );
}

/**
 * Startup orchestration previously hosted by AppProvider: startup logging,
 * text-size restore, tray listener, app/skill update rounds and the toast
 * notifications they produce. Mount once at the app root.
 */
export function useAppBootstrap() {
  const queryClient = useQueryClient();

  const presetsQuery = useQuery({
    queryKey: queryKeys.presets.list(),
    queryFn: api.getPresets,
  });
  const activePresetQuery = useQuery({
    queryKey: queryKeys.presets.active(),
    queryFn: api.getActivePreset,
  });
  const toolsQuery = useQuery({
    queryKey: queryKeys.tools.status(),
    queryFn: api.getToolStatus,
  });
  const managedSkillsQuery = useQuery({
    queryKey: queryKeys.skills.list(),
    queryFn: api.getManagedSkills,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: api.getProjects,
  });

  const managedSkills = managedSkillsQuery.data ?? EMPTY_SKILLS;
  const loading =
    presetsQuery.isLoading ||
    activePresetQuery.isLoading ||
    toolsQuery.isLoading ||
    managedSkillsQuery.isLoading ||
    projectsQuery.isLoading;

  const autoCheckInFlightRef = useRef(false);
  const appUpdateCheckedRef = useRef(false);
  const skillUpdateRoundDoneRef = useRef(false);
  const startupDoneLoggedRef = useRef(false);

  // Rust filesystem / scheduler events → query invalidation.
  useTauriEventInvalidation();

  useEffect(() => {
    // Both events log performance.now() (ms since timeOrigin) so the reader
    // can compute duration as done - start. The done mark fires once the
    // initial query round settles (see startupDoneLoggedRef effect below).
    api.logStartupEvent("refresh_app_data_start", performance.now()).catch(() => {});
    // Apply saved text size on startup
    api.getSettings("text_size")
      .then((savedSize) => {
        if (savedSize) applyTextSize(savedSize);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || startupDoneLoggedRef.current) return;
    startupDoneLoggedRef.current = true;
    api.logStartupEvent("refresh_app_data_done", performance.now()).catch(() => {});
  }, [loading]);

  useEffect(() => {
    const unlistenPromise = listen("tray-open-updates", () => {
      navigateTo("/my-skills");
    });

    return () => {
      unlistenPromise
        .then((unlisten) => unlisten())
        .catch((error) => {
          console.error("Failed to unlisten tray-open-updates:", error);
        });
    };
  }, []);

  // Check for a newer app version on startup. This only ever *notifies* — the
  // download and install stay behind the button in Settings, so the user
  // decides whether to take an update. Deliberately unlike the skill
  // auto-update below, which has an opt-in "apply automatically" setting.
  //
  // Failures are logged, never toasted: this runs unprompted on every launch,
  // and users who cannot reach GitHub would otherwise get an error every time
  // they open the app.
  //
  // The ref makes it once per process. With query-driven loading, `loading`
  // no longer flips on file-change refetches, so the timer survives to fire.
  useEffect(() => {
    if (loading || appUpdateCheckedRef.current) return undefined;
    const timer = setTimeout(() => {
      appUpdateCheckedRef.current = true;
      useUIStore.getState().refreshAppUpdate()
        .then((info) => {
          if (!info.has_update) return;
          toast.info(
            i18n.t("settings.updateAvailable", { version: info.latest_version }),
            {
              id: APP_UPDATE_TOAST_ID,
              duration: 8000,
              action: {
                label: i18n.t("settings.viewUpdate"),
                onClick: () => {
                  if (!window.location.pathname.endsWith("/settings")) {
                    window.history.pushState(null, "", "/settings");
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }
                },
              },
            }
          );
        })
        .catch((err) => {
          console.error("Startup app update check failed:", err);
        });
    }, 3000);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once when initial loading finishes
  }, [loading]);

  // Check skill updates on startup (non-blocking, silent). When the user has
  // opted in via the Settings toggle, also apply any available updates.
  useEffect(() => {
    if (loading || managedSkills.length === 0 || skillUpdateRoundDoneRef.current) return undefined;
    const hasGitSkills = managedSkills.some(
      (s) => s.source_type === "git" || s.source_type === "skillssh"
    );
    if (!hasGitSkills || autoCheckInFlightRef.current) return undefined;

    // Delay to avoid slowing down initial render
    const timer = setTimeout(() => {
      skillUpdateRoundDoneRef.current = true;
      autoCheckInFlightRef.current = true;
      void (async () => {
        try {
          await api.checkAllSkillUpdates(false);
          let skills = await api.getManagedSkills();

          const autoUpdate = await api
            .getSettings("auto_update_apply")
            .catch(() => null);
          if (autoUpdate === "on") {
            const ids = skills
              .filter(
                (s) =>
                  s.update_status === "update_available" &&
                  (s.source_type === "git" || s.source_type === "skillssh")
              )
              .map((s) => s.id);
            if (ids.length > 0) {
              const result = await api.batchUpdateSkills(ids);
              skills = await api.getManagedSkills();
              if (result.refreshed > 0) {
                toast.success(
                  i18n.t("mySkills.autoUpdated", { count: result.refreshed })
                );
              }
              // Held back rather than applied: updating would have removed
              // files the new version does not have, and nobody was here to ask.
              if (result.held_back.length > 0) {
                toast.warning(
                  i18n.t("mySkills.batchHeldBack", {
                    count: result.held_back.length,
                    names: result.held_back.slice(0, 3).join("、"),
                  })
                );
              }
              if (result.failed.length > 0) {
                console.warn("Auto-update failures:", result.failed);
                toast.error(
                  i18n.t("mySkills.autoUpdateFailed", {
                    count: result.failed.length,
                  })
                );
              }
            }
          }

          // Publish the fresh skills through the cache so every consumer
          // updates without a second fetch, then run the notification dedup.
          queryClient.setQueryData(queryKeys.skills.list(), skills);
          await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
          notifyUpdatableSkills(skills);
          api.setSettings("auto_update_last_run_at", new Date().toISOString())
            .catch(() => {});
        } catch (err) {
          // Startup round is non-blocking and does not toast on failure, but
          // log so a broken check/update is still diagnosable.
          console.error("Startup skill update round failed:", err);
        } finally {
          autoCheckInFlightRef.current = false;
        }
      })();
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading, managedSkills, queryClient]);

  // After a background auto-update round (Rust scheduler) or the tray "check
  // for updates" action, the invalidation hook refetches the skills query;
  // this listener waits for that refetch and runs the toast notification.
  useEffect(() => {
    const unlistenPromise = listen("skills-auto-updated", () => {
      queryClient
        .refetchQueries({ queryKey: queryKeys.skills.list() })
        .then(() => {
          const skills = queryClient.getQueryData<ManagedSkill[]>(queryKeys.skills.list());
          if (skills) notifyUpdatableSkills(skills);
        })
        .catch((error) => {
          console.error("Failed to refresh after skills-auto-updated:", error);
        });
    });
    return () => {
      unlistenPromise
        .then((unlisten) => unlisten())
        .catch((error) => {
          console.error("Failed to unlisten skills-auto-updated:", error);
        });
    };
  }, [queryClient]);
}
