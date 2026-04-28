import { spawnSync } from "node:child_process";
import path from "node:path";

const tscPath = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

// `tsc --build` is project-references-aware (each tsconfig.json under
// `packages/*` uses `composite: true` with `references` to upstream
// packages). Per-project `tsc -p ... --noEmit` cannot resolve those
// references, so it fails on a fresh clone where `dist/` is empty —
// the very state every pre-commit hook starts in. `--build` populates
// dist/ on the first run (~60s cold) and is incremental thereafter
// (<1s warm via .tsbuildinfo), matching what CI's `pnpm build` does
// before its typecheck step.
const result = spawnSync(tscPath, ["--build"], { stdio: "inherit" });

if (result.error) {
  console.error("✗ Failed to start TypeScript compiler.");
  console.error(`  tsc: ${tscPath}`);
  console.error(`  cwd: ${process.cwd()}`);
  console.error(`  ${result.error.name}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
