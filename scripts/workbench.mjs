import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2] ?? "dev";
if (!["dev", "build"].includes(mode)) throw new Error("Use dev or build");
const args =
  mode === "dev"
    ? ["dev", "--config", "src-tauri/tauri.dev.conf.json"]
    : ["build", "--bundles", process.platform === "darwin" ? "app" : "all"];
const child = spawn(
  process.execPath,
  [join(root, "node_modules/@tauri-apps/cli/tauri.js"), ...args, ...process.argv.slice(3)],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: [dirname(process.execPath), join(homedir(), ".cargo/bin"), process.env.PATH ?? ""].join(
        delimiter,
      ),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
