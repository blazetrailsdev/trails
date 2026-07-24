import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Every package the query runners compile through. Both runners resolve
// @blazetrails/* via package "main" → packages/<pkg>/dist/index.js; tsx's
// loader doesn't help, because the fixtures are modules on disk that Node
// resolves through the normal package graph, not via the TS source.
const REQUIRED_PACKAGES = ["activesupport", "activemodel", "arel", "activerecord"];

/**
 * Exit with a readable hint when any package the runner needs is unbuilt.
 *
 * Callers must invoke this *before* importing @blazetrails/* — a static import
 * resolves at module load, which would replace this hint with a bare
 * module-not-found. Both runners therefore import those packages dynamically.
 */
export function assertPackagesBuilt(label: string): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const missing = REQUIRED_PACKAGES.filter(
    (pkg) => !existsSync(resolve(scriptDir, `../../../../packages/${pkg}/dist/index.js`)),
  ).map((pkg) => `@blazetrails/${pkg}`);

  if (missing.length > 0) {
    process.stderr.write(`${label}: missing dist/ for ${missing.join(", ")}\n`);
    process.stderr.write("Run: pnpm build\n");
    process.exit(1);
  }
}
