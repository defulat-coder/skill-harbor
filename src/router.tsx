import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { Layout } from "./components/Layout";
import { queryKeys } from "./lib/queryKeys";
import {
  validateInstallSearch,
  validateNewFlagSearch,
  validateSkillPickerSearch,
} from "./lib/searchSchemas";
import * as api from "./lib/tauri";
import * as wb from "./lib/workbench";
import {
  CodingWorkspace,
  LobsterWorkspace,
  RootComponent,
} from "./routerComponents";
import { Backup } from "./views/Backup";
import { GlobalSkills } from "./views/GlobalSkills";
import { InstallSkills } from "./views/InstallSkills";
import { MySkills } from "./views/MySkills";
import { ProjectDetail } from "./views/ProjectDetail";
import { SearchHome } from "./views/SearchHome";
import { SearchIndex } from "./views/SearchIndex";
import { Settings } from "./views/Settings";
import { Workbench } from "./views/Workbench";

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_layout",
  component: Layout,
});

const homeRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  validateSearch: validateSkillPickerSearch,
  beforeLoad: ({ location }) => {
    // 旧 HomeEntry 行为：/?skill=xxx 重定向到 /library 并逐字保留 query。
    const rawSearch = location.search as Record<string, unknown>;
    if (rawSearch.skill !== undefined) {
      throw redirect({
        to: "/library",
        search: rawSearch as { skill?: string },
        replace: true,
      });
    }
  },
  component: SearchHome,
});

const searchIndexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/search-index",
  component: SearchIndex,
});

const libraryRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/library",
  validateSearch: validateSkillPickerSearch,
  component: GlobalSkills,
});

const projectsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/projects",
  validateSearch: validateNewFlagSearch,
  component: Workbench,
});

const mySkillsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/my-skills",
  component: MySkills,
});

const globalWorkspaceRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/global-workspace",
  component: CodingWorkspace,
});

const globalWorkspaceAgentRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/global-workspace/$agentKey",
  component: CodingWorkspace,
});

const lobsterWorkspaceRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/lobster-workspace",
  component: LobsterWorkspace,
});

const lobsterWorkspaceAgentRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/lobster-workspace/$agentKey",
  component: LobsterWorkspace,
});

const installRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/install",
  validateSearch: validateInstallSearch,
  component: InstallSkills,
});

const backupRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/backup",
  component: Backup,
});

const projectRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/project/$id",
  validateSearch: validateNewFlagSearch,
  loader: ({ context, params }) => {
    // 预热工作台首屏必需的两条查询；staleTime 内 ensureQueryData 命中缓存，
    // 组件里的 useQuery 复用同一 key，不会产生额外请求。错误交给组件的
    // useQuery 错误态呈现，这里不阻塞路由渲染。
    void context.queryClient
      .ensureQueryData({
        queryKey: queryKeys.projects.skills(params.id),
        queryFn: () => api.getProjectSkills(params.id),
      })
      .catch(() => {});
    void context.queryClient
      .ensureQueryData({
        queryKey: queryKeys.projects.bindings(params.id),
        queryFn: () => wb.projectBindings(params.id),
      })
      .catch(() => {});
  },
  component: Workbench,
});

const projectAdvancedRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/project/$id/advanced",
  component: ProjectDetail,
});

const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/settings",
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([
    homeRoute,
    searchIndexRoute,
    libraryRoute,
    projectsRoute,
    mySkillsRoute,
    globalWorkspaceRoute,
    globalWorkspaceAgentRoute,
    lobsterWorkspaceRoute,
    lobsterWorkspaceAgentRoute,
    installRoute,
    backupRoute,
    projectRoute,
    projectAdvancedRoute,
    settingsRoute,
  ]),
]);

export function createAppRouter(
  queryClient: QueryClient,
  options?: { history?: RouterHistory },
) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history: options?.history,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
