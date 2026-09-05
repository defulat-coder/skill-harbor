import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const base = process.env.SEARCH_SMOKE_DIR || "/tmp/skills-zvec-smoke";
const root = path.join(base, "source");
const cacheDir = path.join(base, "cache");
const runtime = fileURLToPath(new URL("./search.mjs", import.meta.url));
const evidence = [];
function call(op, query) {
  const run = spawnSync(process.execPath, [runtime], {
    input: JSON.stringify({ op, query, root, cacheDir }),
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 4000000,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout.trim().split("\n").at(-1));
  assert.equal(result.ok, true, result.error);
  evidence.push({ op, query, result: result.result });
  return result.result;
}
await fs.rm(path.join(root, "audio"), { recursive: true, force: true });
await fs.mkdir(path.join(root, "frontend"), { recursive: true });
await fs.mkdir(path.join(root, "database"), { recursive: true });
await fs.writeFile(
  path.join(root, "frontend/SKILL.md"),
  "# Frontend interface design\nDesign beautiful responsive web pages and accessible React interfaces, navigation, buttons and polished visual layouts.\n",
);
await fs.writeFile(
  path.join(root, "database/SKILL.md"),
  "# PostgreSQL database optimization\nOptimize slow SQL queries and execution plans, create database indexes and reduce PostgreSQL query latency.\n",
);
await fs.writeFile(path.join(root, "oversized.md"), "ignored ".repeat(150000));
await fs.mkdir(path.join(root, ".private"), { recursive: true });
await fs.writeFile(path.join(root, ".private/SKILL.md"), "hidden ignored");
await fs.unlink(path.join(root, "alias.md")).catch(() => {});
await fs.symlink(path.join(root, "frontend/SKILL.md"), path.join(root, "alias.md"));
assert.equal(call("index").files, 2);
assert.equal(call("status").ready, true);
assert.match(call("query", "设计漂亮的网页界面").hits[0].path, /frontend\/SKILL.md$/);
assert.match(call("query", "怎么优化数据库查询速度").hits[0].path, /database\/SKILL.md$/);
const before = (await fs.stat(path.join(cacheDir, "workspace/frontend/SKILL.md"))).mtimeMs;
call("query", "网页设计");
assert.equal((await fs.stat(path.join(cacheDir, "workspace/frontend/SKILL.md"))).mtimeMs, before);
await fs.mkdir(path.join(root, "audio"), { recursive: true });
await fs.writeFile(
  path.join(root, "audio/SKILL.md"),
  "# Audio transcription\nConvert spoken audio recordings to written text transcripts. Transcribe meetings and identify speaker names.\n",
);
assert.match(call("query", "把会议录音转成文字").hits[0].path, /audio\/SKILL.md$/);
await fs.writeFile(
  path.join(root, "frontend/SKILL.md"),
  "# Image background removal\nRemove the background from photographs and export transparent PNG product images.\n",
);
assert.match(call("query", "去掉照片背景生成透明图片").hits[0].path, /frontend\/SKILL.md$/);
assert.match(
  call("query", "去掉照片背景").hits.find((h) => /frontend/.test(h.path)).text,
  /background removal/,
);
await fs.rm(path.join(root, "database"), { recursive: true });
assert.equal(
  call("query", "数据库查询优化").hits.some((h) => /database/.test(h.path)),
  false,
);
assert.equal(
  await fs.stat(path.join(root, ".zvec-grep")).then(
    () => true,
    () => false,
  ),
  false,
);
await fs.writeFile(path.join(base, "smoke-results.json"), JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify({ ok: true, checks: 11, evidence: path.join(base, "smoke-results.json") }),
);
