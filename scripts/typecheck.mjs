import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const tscPath = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

const projects = [
  "packages/activesupport/tsconfig.json",
  "packages/arel/tsconfig.json",
  "packages/activemodel/tsconfig.json",
  "packages/activerecord/tsconfig.json",
  "packages/rack/tsconfig.json",
  "packages/actionpack/tsconfig.json",
  "packages/cli/tsconfig.json",
];

for (const project of projects) {
  const result = spawnSync(tscPath, ["-p", project, "--noEmit"], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
