import { Outlet } from "@tanstack/react-router";
import { CloseActionGuard } from "./components/CloseActionGuard";
import { FirstRunRestoreDialog } from "./components/FirstRunRestoreDialog";
import { HelpDialog } from "./components/HelpDialog";
import { WorkspaceView } from "./views/WorkspaceView";
import {
  CODING_WORKSPACE_CONFIG,
  LOBSTER_WORKSPACE_CONFIG,
} from "./views/workspaceConfigs";

export function RootComponent() {
  return (
    <>
      <Outlet />
      <HelpDialog />
      <CloseActionGuard />
      <FirstRunRestoreDialog />
    </>
  );
}

export function CodingWorkspace() {
  return <WorkspaceView config={CODING_WORKSPACE_CONFIG} />;
}

export function LobsterWorkspace() {
  return <WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />;
}
