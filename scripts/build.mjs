import { join } from "node:path";
import { repositoryRoot, run } from "./command-runner.mjs";

const tsc = join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
run(process.execPath, [
  tsc,
  "-b",
  "packages/domain",
  "packages/schemas",
  "packages/api-contract",
  "packages/archive",
  "packages/read-model",
  "apps/cli",
  "apps/server",
]);
run(process.execPath, [tsc, "-p", "tsconfig.json", "--noEmit"]);
run("npm", ["run", "build", "-w", "@text-to-image/web"]);
