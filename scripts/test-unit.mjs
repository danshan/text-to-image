import { join } from "node:path";
import { repositoryRoot, run } from "./command-runner.mjs";

const vitest = join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
run(process.execPath, [vitest, "run", "--config", "vitest.config.ts"]);
run(process.execPath, [
  "--test",
  "tests/hooks/archive-guard.test.mjs",
  "tests/skill/generate-and-archive.test.mjs",
]);
run("npm", ["test", "-w", "@text-to-image/web"]);
