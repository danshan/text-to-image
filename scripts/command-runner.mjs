import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dirname, "..");

export function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
