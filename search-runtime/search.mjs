import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { format } from "node:util";

const MODEL = "local/multilingual-e5-small";
const MAX_FILE = 1024 * 1024;
const POLICY = {
  globs: ["**/*.md", "**/*.mdx"],
  follow: false,
  hidden: false,
  noIgnore: true,
  maxFileSizeBytes: MAX_FILE,
};
// Dependencies may log diagnostics; stdout is reserved for the final protocol line.
console.log = (...args) => process.stderr.write(`${format(...args)}\n`);
console.info = console.log;
console.warn = console.log;
const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
};

async function sourceFiles(root) {
  const files = new Map();
  async function walk(dir) {
    const dirStat = await fs.lstat(dir);
    if (dirStat.isSymbolicLink() || !inside(root, await fs.realpath(dir))) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !/\.(md|mdx)$/.test(entry.name)) continue;
      // O_NOFOLLOW also rejects a file changed into a link after directory enumeration.
      const handle = await fs.open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_FILE) continue;
        const canonical = await fs.realpath(absolute);
        if (!inside(root, canonical)) continue;
        const data = await handle.readFile();
        if (data.length <= MAX_FILE) files.set(path.relative(root, absolute), data);
      } finally {
        await handle.close();
      }
    }
  }
  await walk(root);
  return files;
}

async function synchronize(root, workspace) {
  const wanted = await sourceFiles(root);
  await fs.mkdir(workspace, { recursive: true });
  // Only our cache mirror is changed. Native index files stay in .zvec-grep.
  async function prune(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (dir === workspace && entry.name === ".zvec-grep") continue;
      const target = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await prune(target);
        if (!(await fs.readdir(target)).length) await fs.rmdir(target);
      } else if (!wanted.has(path.relative(workspace, target)) || entry.isSymbolicLink()) {
        await fs.unlink(target);
      }
    }
  }
  await prune(workspace);
  for (const [relative, bytes] of wanted) {
    const target = path.join(workspace, relative);
    const old = await fs.readFile(target).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (old?.equals(bytes)) continue; // Preserve unchanged mtimes for native incremental update.
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  return wanted.size;
}

async function run(request) {
  if (!["status", "index", "query"].includes(request.op)) throw new Error("未知检索操作");
  if (
    typeof request.root !== "string" ||
    !path.isAbsolute(request.root) ||
    typeof request.cacheDir !== "string" ||
    !path.isAbsolute(request.cacheDir)
  )
    throw new Error("root 和 cacheDir 必须为绝对路径");
  const root = await fs.realpath(request.root);
  if (!(await fs.stat(root)).isDirectory()) throw new Error("技能根路径不是目录");
  if (inside(root, path.resolve(request.cacheDir)) || inside(path.resolve(request.cacheDir), root))
    throw new Error("索引缓存必须与技能源目录分离");
  await fs.mkdir(request.cacheDir, { recursive: true });
  const cacheDir = await fs.realpath(request.cacheDir);
  if (inside(root, cacheDir) || inside(cacheDir, root))
    throw new Error("索引缓存必须与技能源目录分离");
  const workspace = path.join(cacheDir, "workspace");
  await fs.mkdir(workspace, { recursive: true });
  if ((await fs.lstat(workspace)).isSymbolicLink()) throw new Error("缓存工作区不能是软链接");
  const marker = path.join(cacheDir, "source-root.json");
  const priorRoot = await fs.readFile(marker, "utf8").catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (priorRoot && JSON.parse(priorRoot) !== root) throw new Error("此缓存已绑定其他技能目录");
  await fs.writeFile(marker, JSON.stringify(root));
  const { createZvecGrep } = await import("@zvec/zvec-grep");
  const service = await createZvecGrep({
    root: workspace,
    home: cacheDir,
    embedding: MODEL,
    device: "cpu",
    modelCacheDir: path.join(cacheDir, "models"),
  });
  try {
    const status = async () => {
      const info = await service.info({ includeStatus: true });
      const failed = info.status?.filesFailed ?? 0;
      const pending = info.status?.filesPending ?? 0;
      return {
        root,
        available: true,
        ready: info.indexed && failed === 0 && pending === 0,
        model: MODEL,
        files: info.status?.filesIndexed ?? 0,
        ...(failed || pending ? { error: `${failed} 个文件失败，${pending} 个文件待处理` } : {}),
      };
    };
    if (request.op === "status") return await status();
    if (
      request.op === "query" &&
      (typeof request.query !== "string" || !request.query.trim() || request.query.length > 4000)
    )
      throw new Error("请输入不超过 4000 字的检索问题");
    const files = await synchronize(root, workspace);
    const info = await service.info();
    if (request.op === "index" || !info.indexed) {
      const result = await service.index(POLICY);
      if (result.filesFailed || result.filesPending)
        throw new Error(
          `索引未完成：${result.filesFailed} 个文件失败，${result.filesPending} 个文件待处理`,
        );
    }
    if (request.op === "index") return { ...(await status()), files };
    const result = await service.context({
      ...POLICY,
      query: request.query.trim(),
      autoUpdate: true,
      limit: 12,
    });
    const refreshed = await status();
    if (!refreshed.ready) throw new Error(refreshed.error || "混合索引未就绪");
    if (result.source !== "index") throw new Error("检索未使用 Zvec 混合索引");
    const hits = [];
    for (const item of result.items) {
      const indexedPath = path.resolve(item.file.absolutePath);
      if (!inside(workspace, indexedPath)) continue;
      const original = path.resolve(root, path.relative(workspace, indexedPath));
      const stat = await fs.lstat(original).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE) continue;
      if (!inside(root, await fs.realpath(original))) continue;
      const range = item.excerptRange ?? item.range;
      hits.push({
        path: original,
        line_start: range.kind === "text" ? range.startLine : 1,
        line_end: range.kind === "text" ? range.endLine : 1,
        text: item.content,
        score: item.score ?? 0,
      });
    }
    return {
      query: request.query.trim(),
      hits,
      ...(!files ? { warning: "中央技能目录中没有可索引的 Markdown 文件" } : {}),
    };
  } finally {
    await service.close();
  }
}

let response;
try {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 32000) throw new Error("请求过大");
  }
  response = { ok: true, result: await run(JSON.parse(input)) };
} catch (error) {
  console.error(error?.stack ?? String(error));
  response = { ok: false, error: error instanceof Error ? error.message : String(error) };
}
// close() disposes models. Allow natural exit: forced process.exit can race native ONNX destructors.
process.exitCode = response.ok ? 0 : 1;
process.stdout.write(`${JSON.stringify(response)}\n`);
