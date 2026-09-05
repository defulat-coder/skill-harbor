import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { createAppRouter } from "./router";

async function loadAt(url: string) {
  const router = createAppRouter(new QueryClient(), {
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  return router;
}

describe("路由 search 解析与重定向（真实路由树）", () => {
  it("/?skill=abc 重定向到 /library，query 逐字保留", async () => {
    const router = await loadAt("/?skill=abc");
    expect(router.state.location.pathname).toBe("/library");
    expect(router.state.location.search).toEqual({ skill: "abc" });
    expect(router.state.location.href).toBe("/library?skill=abc");
  });

  it("/ 无 skill 时停留在首页", async () => {
    const router = await loadAt("/");
    expect(router.state.location.pathname).toBe("/");
  });

  it("/install?tab=local&project=p1 解析出合法 tab 与 project", async () => {
    const router = await loadAt("/install?tab=local&project=p1");
    const leaf = router.state.matches.at(-1);
    expect(leaf?.search).toEqual({ tab: "local", project: "p1" });
  });

  it("/install?tab=bogus 丢弃非法 tab", async () => {
    const router = await loadAt("/install?tab=bogus");
    const leaf = router.state.matches.at(-1);
    expect(leaf?.search).toEqual({ tab: undefined, project: undefined });
  });

  it("/projects?new=1 经 JSON.parse 后解析为 number flag", async () => {
    const router = await loadAt("/projects?new=1");
    const leaf = router.state.matches.at(-1);
    expect(leaf?.search).toEqual({ new: 1 });
  });

  it("/project/:id 提取 params", async () => {
    const router = await loadAt("/project/proj-9/advanced");
    const leaf = router.state.matches.at(-1);
    expect(leaf?.params).toEqual({ id: "proj-9" });
  });
});
