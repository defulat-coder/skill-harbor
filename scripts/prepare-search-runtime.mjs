import { chmod, copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = join(root, "search-runtime");
if (Number(process.versions.node.split(".")[0]) < 22)
  throw new Error("Local search requires Node.js 22 or later to build.");
const lock = await readFile(join(runtime, "pnpm-lock.yaml"));
const fingerprint = `${process.platform}-${process.arch}-hoisted-${createHash("sha256").update(lock).digest("hex")}`;
const marker = join(runtime, "node_modules/.workbench-runtime");
let installed = false;
try {
  installed = (await readFile(marker, "utf8")) === fingerprint;
} catch {
  /* First preparation. */
}
if (!installed) {
  const install = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["install", "--frozen-lockfile", "--ignore-scripts"],
    { cwd: runtime, stdio: "inherit" },
  );
  if (install.status !== 0) throw new Error("Could not install the local search runtime.");
  await writeFile(marker, fingerprint);
}
await access(join(runtime, "node_modules/@zvec/zvec-grep/dist/index.js"));
await mkdir(join(runtime, "bin"), { recursive: true });
const node = join(runtime, "bin", process.platform === "win32" ? "node.exe" : "node");
await copyFile(process.execPath, node);
await chmod(node, 0o755);
await copyFile(
  join(dirname(dirname(process.execPath)), "LICENSE"),
  join(runtime, "bin/Node-LICENSE.txt"),
);
console.log(`Local search runtime prepared for ${process.platform}/${process.arch}.`);
