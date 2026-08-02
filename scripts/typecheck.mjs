import { join } from "node:path";
import { repositoryRoot, run } from "./command-runner.mjs";

run(process.execPath, [
  join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
  "-p",
  "tsconfig.json",
  "--noEmit",
]);
run("npm", ["run", "typecheck", "-w", "@text-to-image/web"]);
